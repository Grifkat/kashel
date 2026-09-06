import type { Account, Category, Money, Recurring, Scenario, Transaction, VaultData } from '../lib/types'
import { addMonths, daysInMonth, monthKey, monthRange, parseISO, startOfMonth, today } from '../lib/date'
import { balances, categoryMonthly, isAsset, median, mean, MonthPoint, monthlySeries, trendSlope } from './stats'
import { plannedByMonth } from './tasks'
import { личное } from './project'

export interface CategoryBase {
  categoryId: string
  kind: 'expense' | 'income'
  base: Money // ожидаемая сумма в месяц без учёта сценария
  history: Money[]
  median: Money
  slopePerMonth: number
  volatility: number // коэффициент вариации
  fixed: Money // часть, закрытая регулярными платежами
  deviations: number[] // относительные отклонения для бутстрапа
  seasonal: number[] // 12 коэффициентов по месяцам года, 1 = без сезонности
}

export interface ForecastMonth {
  key: string
  income: Money
  expense: Money
  net: Money
  fixedExpense: Money
  events: Money
  /** Обещанное задачами с суммой: приход плюсом, трата минусом. */
  planned: Money
  balance: Money // детерминированная линия
  p10: Money
  p50: Money
  p90: Money
  byCategory: Record<string, Money>
}

export interface ForecastResult {
  history: MonthPoint[]
  months: ForecastMonth[]
  startBalance: Money
  bases: CategoryBase[]
  /*
   * Два разных «средних месяца», и путать их нельзя.
   *
   * avg* — что было: среднее за наблюдаемое время. Оно не зависит ни от
   * сценария, ни от регулярных правил, потому что описывает прошлое. На нём
   * стоят советы и бюджет — им нужен факт, а не желаемое.
   *
   * plan* — что будет: средний месяц вперёд по той же линии, что нарисована
   * на графике. Сюда входят сценарий, регулярные платежи и разовые события.
   * Плитки на экране «Прогноз» показывают именно его: раньше там стояло avg*,
   * и получалось, что ползунок двигает линию, а плитка под ней не шевелится.
   */
  avgIncome: Money
  avgExpense: Money
  avgNet: Money
  savingsRate: number
  planIncome: Money
  planExpense: Money
  planEvents: Money
  planPlanned: Money
  planNet: Money
  planSavingsRate: number
  runwayMonths: number | null
  firstNegative: string | null
  riskNegative: number // доля симуляций, ушедших в минус
}

const HIST_WINDOW = 12
const ROBUST_WINDOW = 6

/**
 * Ключи завершённых месяцев истории (текущий, неполный, не берём).
 *
 * Сюда текущий месяц не входит намеренно: он не сравним с полными месяцами,
 * а по этому списку строятся тренд, сезонность и разброс — там сравнимость
 * обязательна. В оценку уровня он всё же попадает, но иначе: см. monthShare
 * и withCurrentMonth.
 */
export function historyKeys(txs: Transaction[], window = HIST_WINDOW): string[] {
  if (!txs.length) return []
  const cur = monthKey(today())
  const first = txs.reduce((min, t) => (t.date < min ? t.date : min), txs[0].date)
  const all = monthRange(first, today()).filter((k) => k < cur)
  return all.slice(-window)
}

/** Значение выбора «все счета вместе» — прогноз по всему хранилищу. */
export const ALL_ACCOUNTS = '__all__'

/** Служебные категории для переводов: живут только внутри проекции на счёт. */
export const TRANSFER_IN = '__transfer_in__'
export const TRANSFER_OUT = '__transfer_out__'

const transferCategories: Category[] = [
  { id: TRANSFER_IN, name: 'Пополнения со своих счетов', kind: 'income', icon: 'arrow-left-right', color: '#6aa9ff' },
  { id: TRANSFER_OUT, name: 'Переводы на свои счета', kind: 'expense', icon: 'arrow-left-right', color: '#6aa9ff' },
]

/**
 * Взгляд на хранилище со стороны одного счёта.
 *
 * Прогноз построен на категориях и на общем остатке — про счета он не знал
 * ничего. Вместо того чтобы протаскивать счёт через весь движок, мы готовим
 * ему проекцию данных: остаётся один счёт, а операции пересказаны с его точки
 * зрения. Дальше движок работает как обычно, ничего не подозревая.
 *
 * Главное здесь — переводы. Для всего хранилища перевод не событие: деньги
 * переложили из кармана в карман, итог не изменился, поэтому прогноз их и не
 * рассматривает. Для отдельного счёта это, наоборот, часто основное движение:
 * счёт, живущий на пополнениях, без них показывал бы вечное падение. Поэтому
 * перевод пересказывается как обычный расход для того, откуда ушло, и как
 * приход для того, куда пришло, — и получает служебную категорию, чтобы
 * попасть в разбор и в ползунки наравне с остальными.
 *
 * Проекция одноразовая и наружу не сохраняется: настоящее хранилище её не
 * видит, служебные категории в него не попадают.
 */
export function scopeToAccount(data: VaultData, accountId: string): VaultData {
  if (accountId === ALL_ACCOUNTS) return data
  const acc = data.accounts.find((a) => a.id === accountId)
  if (!acc) return data

  const transactions: Transaction[] = []
  for (const t of data.transactions) {
    const outgoing = t.accountId === accountId
    const incoming = t.toAccountId === accountId
    if (!outgoing && !incoming) continue
    if (t.kind !== 'transfer') {
      if (outgoing) transactions.push(t)
      continue
    }
    transactions.push({
      ...t,
      kind: incoming ? 'income' : 'expense',
      categoryId: incoming ? TRANSFER_IN : TRANSFER_OUT,
      accountId,
      toAccountId: undefined,
      splits: undefined,
    })
  }

  const recurring: Recurring[] = data.recurring
    .filter((r) => r.accountId === accountId || r.toAccountId === accountId)
    .map((r) => {
      if (r.kind !== 'transfer') return r
      const incoming = r.toAccountId === accountId
      return {
        ...r,
        kind: incoming ? ('income' as const) : ('expense' as const),
        categoryId: incoming ? TRANSFER_IN : TRANSFER_OUT,
        accountId,
        toAccountId: undefined,
      }
    })

  return {
    ...data,
    // Тип подменяем на «наличные» намеренно: движок берёт стартовым остатком
    // сумму активов, а для взгляда на один счёт нужен остаток именно этого
    // счёта — с каким угодно знаком, будь это карта или кредитка.
    accounts: [{ ...acc, type: 'cash' }],
    categories: [...data.categories, ...transferCategories],
    transactions,
    recurring,
  }
}

/** Какая доля текущего месяца уже прожита: 2 сентября из 30 дней — 0,067. */
export function monthShare(day: string = today()): number {
  const d = parseISO(day)
  return d.getDate() / daysInMonth(d.getFullYear(), d.getMonth())
}

/**
 * Уровень за всё наблюдаемое время: завершённые месяцы плюс прожитая часть
 * текущего.
 *
 * Раньше незаконченный месяц просто выбрасывался, и это доводило занижение до
 * предела: человек, заработавший первого числа 200 000 ₽, видел прогноз, в
 * котором этих денег не существует, — при том что в остаток на счетах они уже
 * вошли. Отсюда и «денег много, а линия только вниз».
 *
 * Считаем честно: сколько всего денег прошло, делённое на то, сколько месяцев
 * мы за ними наблюдали. Неполный месяц НЕ растягивается до полного — 200 000 ₽,
 * полученные второго числа, не превращаются в три миллиона в месяц. Они просто
 * добавляются к сумме, а к знаменателю добавляется 0,067 месяца. Поэтому же
 * незаконченный месяц не занижает расход: два прожитых дня добавляют к
 * знаменателю ровно два дня, а не целый месяц.
 *
 * Знаменатель не опускается ниже единицы: в первые дни жизни хранилища
 * завершённых месяцев ещё нет, и деление на 0,03 превратило бы одну покупку
 * в катастрофу, а один перевод — в чудо.
 */
export function withCurrentMonth(
  doneLevel: number,
  doneMonths: number,
  current: Money,
  share: number,
): number {
  if (share <= 0) return doneLevel
  return (doneLevel * doneMonths + current) / Math.max(doneMonths + share, 1)
}

function bootstrapDeviations(values: Money[], base: Money): number[] {
  if (!base) return [0]
  const devs = values.map((v) => v / base - 1)
  return devs.length >= 3 ? devs : [-0.15, 0, 0.15]
}

/**
 * Винзоризованное среднее: крайние значения не выбрасываем, а подтягиваем
 * к 10-му и 90-му процентилю. Медиана и усечённое среднее здесь не годятся —
 * доходы скошены вправо (редкие крупные заказы это норма, а не выброс),
 * и сумма таких оценок по категориям систематически ниже фактического месяца.
 */
function winsorizedMean(values: number[]): number {
  if (!values.length) return 0
  if (values.length < 5) return mean(values)
  const s = [...values].sort((a, b) => a - b)
  const lo = s[Math.floor((s.length - 1) * 0.1)]
  const hi = s[Math.ceil((s.length - 1) * 0.9)]
  return mean(values.map((v) => Math.min(hi, Math.max(lo, v))))
}

/**
 * Сезонные коэффициенты по месяцам года. При коротком ряде на каждый месяц
 * приходится одно-два наблюдения, поэтому эффект ужимаем вдвое и зажимаем
 * в разумные рамки — иначе один щедрый декабрь станет законом природы.
 */
function seasonality(keys: string[], history: Money[], base: number): number[] {
  const flat = Array(12).fill(1)
  if (keys.length < 12 || base <= 0) return flat
  const sums = Array(12).fill(0)
  const counts = Array(12).fill(0)
  keys.forEach((k, i) => {
    const m = Number(k.slice(5, 7)) - 1
    sums[m] += history[i]
    counts[m]++
  })
  return sums.map((sum, m) => {
    if (!counts[m]) return 1
    const raw = sum / counts[m] / base
    return Math.max(0.6, Math.min(1.8, 1 + (raw - 1) * 0.5))
  })
}

/**
 * Ожидание на конкретный будущий месяц: база, ограниченный дрейф тренда
 * и сезонная поправка. Тренд, посчитанный по году, нельзя линейно тянуть
 * весь горизонт — на длинном плече это превращает шум в катастрофу или в чудо.
 */
export function projectedBase(b: CategoryBase, monthIndex: number, monthOfYear?: number): number {
  const drifted = b.base + b.slopePerMonth * Math.min(monthIndex, 6)
  const bounded = Math.max(b.base * 0.6, Math.min(b.base * 1.6, Math.max(0, drifted)))
  return monthOfYear == null ? bounded : bounded * (b.seasonal[monthOfYear] ?? 1)
}

/** Сколько раз регулярное правило сработает в конкретном месяце. */
export function occurrencesInMonth(r: Recurring, mk: string): number {
  if (!r.active) return 0
  const first = `${mk}-01`
  const last = `${mk}-${String(daysInMonth(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)) - 1)).padStart(2, '0')}`
  if (r.endDate && r.endDate < first) return 0
  if (r.startDate > last) return 0
  switch (r.freq) {
    case 'daily':
      return Math.floor(daysInMonth(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)) - 1) / Math.max(1, r.interval))
    case 'weekly':
      return Math.round(4.345 / Math.max(1, r.interval))
    case 'yearly': {
      const startMonth = r.startDate.slice(5, 7)
      const yearsApart = Number(mk.slice(0, 4)) - Number(r.startDate.slice(0, 4))
      return startMonth === mk.slice(5, 7) && yearsApart % Math.max(1, r.interval) === 0 ? 1 : 0
    }
    case 'monthly':
    default: {
      const monthsApart =
        (Number(mk.slice(0, 4)) - Number(r.startDate.slice(0, 4))) * 12 +
        (Number(mk.slice(5, 7)) - Number(r.startDate.slice(5, 7)))
      return monthsApart >= 0 && monthsApart % Math.max(1, r.interval) === 0 ? 1 : 0
    }
  }
}

/** Базовые ожидания по категории: устойчивый уровень, сезонность, тренд и фиксированная часть. */
export function computeBases(data: VaultData, keys: string[]): CategoryBase[] {
  const out: CategoryBase[] = []
  const nextKey = monthKey(addMonths(today(), 1))
  // Текущий месяц в keys не приходит (см. historyKeys), но если вызывающий
  // передал его сам — второй раз считать его нельзя.
  const curKey = monthKey(today())
  const share = keys.includes(curKey) ? 0 : monthShare()
  for (const c of data.categories) {
    if (c.archived) continue
    const history = categoryMonthly(data.transactions, c.id, keys, true, c.kind)
    // Прожитая часть текущего месяца: в history не входит — он не сравним
    // с полными месяцами, — но в уровень попадает, с весом по этой доле.
    const current = share ? categoryMonthly(data.transactions, c.id, [curKey], true, c.kind)[0] : 0
    // Вид правила обязателен к проверке: доходное правило, которому по ошибке
    // досталась расходная категория, иначе прибавлялось бы к её фиксированной
    // части — и категория выглядела бы дороже, чем есть.
    const fixed = data.recurring
      .filter((r) => r.active && r.kind === c.kind && r.categoryId === c.id)
      .reduce((s, r) => s + r.amount * occurrencesInMonth(r, nextKey), 0)

    // База — годовой уровень: за свежесть отвечает тренд, за внутригодовые
    // колебания — сезонность. Если брать базу по последним месяцам, низкий
    // сезон занижает её, а сезонный коэффициент занижает ещё раз.
    // Нули оставляем: для нерегулярных категорий «месяц без трат» — часть нормы.
    const window = history.length >= 10 ? history : history.slice(-ROBUST_WINDOW)
    const rough = winsorizedMean(window)
    const seasonal = seasonality(keys, history, rough)

    // Тренд считаем по ряду со снятой сезонностью: на одном годовом цикле
    // регрессия иначе принимает декабрьский пик за устойчивый рост, а спад
    // после него — за падение дохода.
    const deseason = history.map((v, i) => v / (seasonal[Number(keys[i].slice(5, 7)) - 1] || 1))
    const dwin = history.length >= 10 ? deseason : deseason.slice(-ROBUST_WINDOW)
    // Уровень по завершённым месяцам — и он же, дотянутый прожитой частью
    // текущего. Тренд, сезонность и разброс считаются по завершённым: им
    // нужны сравнимые месяцы. Уровню сравнимость не нужна — ему нужна правда
    // про то, сколько денег прошло за наблюдаемое время.
    const level = winsorizedMean(dwin)
    const base = withCurrentMonth(level, dwin.length, current, share)
    const slope = trendSlope(deseason)
    // Не больше 3% базы в месяц: остальное почти наверняка шум.
    const capped = Math.max(-base * 0.03, Math.min(base * 0.03, slope))
    const avg = mean(history)
    const volatility = avg ? Math.sqrt(mean(history.map((v) => (v - avg) ** 2))) / avg : 0

    out.push({
      categoryId: c.id,
      kind: c.kind,
      base: Math.max(0, Math.round(base)),
      history,
      median: Math.round(median(history.filter((v) => v > 0))),
      slopePerMonth: capped,
      volatility,
      fixed,
      deviations: bootstrapDeviations(window, base),
      seasonal,
    })
  }
  return out
}

function applyScenario(b: CategoryBase, sc: Scenario | null): number {
  if (!sc) return 1
  if (b.kind === 'income') return sc.incomeFactor || 1
  const adj = sc.adjusts.find((a) => a.categoryId === b.categoryId)
  return adj ? adj.factor : 1
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo))
}

export function forecast(
  data: VaultData,
  scenario: Scenario | null,
  horizon = 12,
  runs = 800,
): ForecastResult {
  // Прогноз — про ваши деньги. Проектные счета из него выпадают целиком,
  // иначе чужой аванс задирал бы и стартовый остаток, и средний доход.
  data = личное(data)
  const keys = historyKeys(data.transactions, HIST_WINDOW)
  const bases = computeBases(data, keys)
  const bal = balances(data.accounts, data.transactions)
  const startBalance = bal.assets

  const histFrom = keys[0] ? keys[0] + '-01' : startOfMonth(today())
  const history = monthlySeries(data.transactions, histFrom, today())

  const futureKeys: string[] = []
  for (let i = 1; i <= horizon; i++) futureKeys.push(monthKey(addMonths(today(), i)))

  const expenseBases = bases.filter((b) => b.kind === 'expense')
  const incomeBases = bases.filter((b) => b.kind === 'income')

  /*
   * Регулярные правила подбираются циклами по категориям — значит правило,
   * которому не досталось живой категории своего вида, не подбирал никто.
   * Такое правило выпадало из прогноза целиком и молча: и из линии, и из
   * коридора. Человек заводил зарплату, а прогноз не менялся ни на копейку.
   *
   * Остаться без категории можно тремя способами: не выбрать её вовсе (в
   * списке есть пункт «—»), переключить вид платежа и оставить категорию от
   * прежнего вида, или отправить категорию в архив уже после того, как
   * правило создано. Первые два теперь не даёт сделать форма, но правила,
   * заведённые раньше, уже лежат в хранилище — и обязаны считаться.
   */
  const incomeCats = new Set(incomeBases.map((b) => b.categoryId))
  const expenseCats = new Set(expenseBases.map((b) => b.categoryId))
  const homeless = (r: Recurring): boolean =>
    !r.categoryId || !(r.kind === 'income' ? incomeCats : expenseCats).has(r.categoryId)
  const strayIncome = data.recurring.filter((r) => r.active && r.kind === 'income' && homeless(r))
  const strayExpense = data.recurring.filter((r) => r.active && r.kind === 'expense' && homeless(r))
  const strayIn = (mk: string) => strayIncome.reduce((s, r) => s + r.amount * occurrencesInMonth(r, mk), 0)
  // Задачи с суммой — обещанные деньги. В линию они входят как разовые,
  // потому что разовые они и есть: продлить хостинг в августе не значит
  // продлевать его каждый месяц. В коридор Монте-Карло не входят: разброса
  // у обещанной суммы нет, человек назвал её сам.
  const planned = plannedByMonth(data)
  const strayOut = (mk: string) => strayExpense.reduce((s, r) => s + r.amount * occurrencesInMonth(r, mk), 0)

  // ---- детерминированная линия
  const months: ForecastMonth[] = []
  let running = startBalance
  futureKeys.forEach((mk, idx) => {
    const byCategory: Record<string, Money> = {}
    let expense = 0
    let fixedExpense = 0
    let income = 0

    const moy = Number(mk.slice(5, 7)) - 1
    for (const b of expenseBases) {
      const variable = projectedBase(b, idx + 1, moy)
      const scaled = Math.round(variable * applyScenario(b, scenario))
      const fixed = data.recurring
        .filter((r) => r.active && r.categoryId === b.categoryId && r.kind === 'expense')
        .reduce((s, r) => s + r.amount * occurrencesInMonth(r, mk), 0)
      const total = scaled + Math.round(fixed * applyScenario(b, scenario))
      byCategory[b.categoryId] = total
      expense += total
      fixedExpense += fixed
    }
    for (const b of incomeBases) {
      const variable = projectedBase(b, idx + 1, moy)
      const fixed = data.recurring
        .filter((r) => r.active && r.categoryId === b.categoryId && r.kind === 'income')
        .reduce((s, r) => s + r.amount * occurrencesInMonth(r, mk), 0)
      const total = Math.round((variable + fixed) * applyScenario(b, scenario))
      byCategory[b.categoryId] = total
      income += total
    }

    // Бездомные правила — отдельным слагаемым: разложить их по категориям
    // некуда, но потерять их нельзя.
    const extraIn = Math.round(strayIn(mk) * (scenario?.incomeFactor || 1))
    const extraOut = strayOut(mk)
    income += extraIn
    expense += extraOut
    fixedExpense += extraOut

    const events = (scenario?.events || [])
      .filter((e) => monthKey(e.date) === mk)
      .reduce((s, e) => s + e.amount, 0)
    const promised = planned.get(mk) ?? 0

    const net = income - expense + events + promised
    running += net
    months.push({
      key: mk, income, expense, net, fixedExpense, events, planned: promised,
      balance: running, p10: running, p50: running, p90: running, byCategory,
    })
  })

  // ---- Монте-Карло
  const paths: number[][] = Array.from({ length: horizon }, () => [])
  let negativeRuns = 0
  const rand = mulberry(9_1_2026)

  for (let r = 0; r < runs; r++) {
    let balance = startBalance
    let wentNegative = false
    for (let m = 0; m < horizon; m++) {
      let net = 0
      const moy = Number(futureKeys[m].slice(5, 7)) - 1
      for (const b of incomeBases) {
        const base = projectedBase(b, m + 1, moy)
        const dev = b.deviations[Math.floor(rand() * b.deviations.length)]
        const fixed = data.recurring
          .filter((x) => x.active && x.categoryId === b.categoryId && x.kind === 'income')
          .reduce((s, x) => s + x.amount * occurrencesInMonth(x, futureKeys[m]), 0)
        net += Math.max(0, base * (1 + dev)) * applyScenario(b, scenario) + fixed
      }
      for (const b of expenseBases) {
        const base = projectedBase(b, m + 1, moy)
        const dev = b.deviations[Math.floor(rand() * b.deviations.length)]
        const fixed = data.recurring
          .filter((x) => x.active && x.categoryId === b.categoryId && x.kind === 'expense')
          .reduce((s, x) => s + x.amount * occurrencesInMonth(x, futureKeys[m]), 0)
        net -= Math.max(0, base * (1 + dev)) * applyScenario(b, scenario) + fixed
      }
      // Те же бездомные правила: в коридоре они обязаны быть, иначе линия и
      // коридор разойдутся между собой.
      net += strayIn(futureKeys[m]) * (scenario?.incomeFactor || 1)
      net -= strayOut(futureKeys[m])
      net += (scenario?.events || [])
        .filter((e) => monthKey(e.date) === futureKeys[m])
        .reduce((s, e) => s + e.amount, 0)
      net += planned.get(futureKeys[m]) ?? 0
      balance += net
      if (balance < 0) wentNegative = true
      paths[m].push(balance)
    }
    if (wentNegative) negativeRuns++
  }

  months.forEach((m, i) => {
    const sorted = paths[i].sort((a, b) => a - b)
    m.p10 = percentile(sorted, 0.1)
    m.p50 = percentile(sorted, 0.5)
    m.p90 = percentile(sorted, 0.9)
  })

  // Второе место, где текущий месяц выпадал. Плитки «Средний месяц» и «Норма
  // сбережений» считались только по завершённым месяцам и потому расходились
  // с линией: линия начиналась от остатка, куда деньги этого месяца уже вошли,
  // а средние вели себя так, будто их не было. Считаем по тому же правилу,
  // что и уровень категорий: вся сумма делится на всё наблюдаемое время.
  const curKey = monthKey(today())
  const doneHistory = history.filter((h) => h.key < curKey)
  const cur = history.find((h) => h.key === curKey)
  const span = Math.max(doneHistory.length + monthShare(), 1)
  const avgIncome = Math.round((doneHistory.reduce((s, h) => s + h.income, 0) + (cur?.income ?? 0)) / span)
  const avgExpense = Math.round((doneHistory.reduce((s, h) => s + h.expense, 0) + (cur?.expense ?? 0)) / span)
  const avgNet = avgIncome - avgExpense
  const savingsRate = avgIncome ? (avgNet / avgIncome) * 100 : 0

  // Средний месяц вперёд — по той же линии, что нарисована на графике.
  // Разовые события держим отдельным слагаемым: событие — не доход, и в
  // норму сбережений ему попадать нечего, а на остаток оно влияет.
  const perMonth = (pick: (m: ForecastMonth) => Money) =>
    months.length ? Math.round(months.reduce((s, m) => s + pick(m), 0) / months.length) : 0
  const planIncome = perMonth((m) => m.income)
  const planExpense = perMonth((m) => m.expense)
  const planEvents = perMonth((m) => m.events)
  const planPlanned = perMonth((m) => m.planned)
  const planNet = planIncome - planExpense + planEvents + planPlanned
  const planSavingsRate = planIncome ? ((planIncome - planExpense) / planIncome) * 100 : 0

  const firstNegative = months.find((m) => m.p50 < 0)?.key ?? null
  const runwayMonths = avgNet >= 0 ? null : Math.max(0, startBalance / Math.abs(avgNet))

  return {
    history, months, startBalance, bases,
    avgIncome, avgExpense, avgNet, savingsRate,
    planIncome, planExpense, planEvents, planPlanned, planNet, planSavingsRate,
    runwayMonths, firstNegative,
    riskNegative: runs ? negativeRuns / runs : 0,
  }
}

function mulberry(seed: number) {
  let s = seed >>> 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Сколько дней протянет текущий остаток при нынешнем темпе трат. */
export function daysOfRunway(startBalance: Money, avgMonthlyNet: Money): number | null {
  if (avgMonthlyNet >= 0) return null
  const perDay = Math.abs(avgMonthlyNet) / 30.4
  return perDay > 0 ? Math.floor(startBalance / perDay) : null
}
