import type { Account, Category, Money, Transaction, VaultData } from '../lib/types'
import { сЗначкомъ } from '../lib/catalog'
import { addDays, addMonths, daysInMonth, diffDays, diffMonths, humanDate, monthKey, monthTitle, parseISO, today, вСтрочную } from '../lib/date'
import { money, moneyShort, months as monthsWord, pct, plural, times } from '../lib/format'
import { balances, categoryMonthly, categoryTotals, creditRemaining, isAsset, mean, median, stdev, trendSlope } from './stats'
import { historyKeys, occurrencesInMonth, type ForecastResult } from './forecast'
import { личное } from './project'
import { т } from '../i18n'

export type AdviceKind = 'cut' | 'income' | 'budget' | 'risk' | 'debt' | 'goal'
export type Severity = 'good' | 'info' | 'warn' | 'alert'

export interface AdviceAction {
  label: string
  type: 'scenario' | 'goto' | 'plan'
  payload: Record<string, unknown>
}

export interface Advice {
  id: string
  kind: AdviceKind
  severity: Severity
  title: string
  body: string
  evidence: string[]
  impactMonthly: Money
  effort: 'низкое' | 'среднее' | 'высокое'
  action?: AdviceAction
}

const KIND_TITLE: Record<AdviceKind, string> = {
  cut: т('Сократить траты'),
  income: т('Увеличить доход'),
  budget: т('Распределение бюджета'),
  risk: т('Подушка и риски'),
  debt: т('Долги и кредиты'),
  goal: т('Цели'),
}

export const adviceKindTitle = (k: AdviceKind) => KIND_TITLE[k]

interface Ctx {
  data: VaultData
  fc: ForecastResult
  keys: string[]
  catById: Map<string, Category>
  accById: Map<string, Account>
  assets: Money
  liquid: Money
  avgExpense: Money
  avgIncome: Money
  curKey: string
  monthProgress: number
}

export function buildAdvice(data: VaultData, fc: ForecastResult): Advice[] {
  // Советы даются человѣку о его собственных деньгах: проектные счета сюда не
  // входят, иначе программа советовала бы урезать расходы по чужой смѣтѣ.
  data = личное(data)
  const keys = historyKeys(data.transactions, 12)
  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const accById = new Map(data.accounts.map((a) => [a.id, a]))
  const bal = balances(data.accounts, data.transactions)
  const liquid = data.accounts
    .filter((a) => !a.archived && (a.type === 'cash' || a.type === 'card'))
    .reduce((s, a) => s + (bal.byAccount.get(a.id) || 0), 0)

  const now = today()
  const curKey = monthKey(now)
  const dim = daysInMonth(Number(curKey.slice(0, 4)), Number(curKey.slice(5, 7)) - 1)
  const ctx: Ctx = {
    data, fc, keys, catById, accById,
    assets: bal.assets, liquid,
    avgExpense: fc.avgExpense, avgIncome: fc.avgIncome,
    curKey,
    monthProgress: Math.max(0.1, parseISO(now).getDate() / dim),
  }

  const out: Advice[] = [
    ...ruleSubscriptions(ctx),
    ...ruleCategoryDrift(ctx),
    ...ruleSmallLeaks(ctx),
    ...ruleAnomalies(ctx),
    ...rulePlanOverrun(ctx),
    ...ruleMissingPlans(ctx),
    ...ruleSavingsRate(ctx),
    ...ruleEmergencyFund(ctx),
    ...ruleNegativeRisk(ctx),
    ...ruleBuckets(ctx),
    ...ruleIncomeConcentration(ctx),
    ...ruleIncomeVolatility(ctx),
    ...ruleIncomeTrend(ctx),
    ...ruleIdleCash(ctx),
    ...ruleDebts(ctx),
    ...ruleGoals(ctx),
    ...rulePaydayGap(ctx),
    ...ruleFixedShare(ctx),
    ...ruleUncategorized(ctx),
    ...ruleWeekendSpending(ctx),
    ...ruleSpendingStreak(ctx),
    ...ruleSeasonalPeak(ctx),
    ...ruleLastYearRepeat(ctx),
    ...rulePriceVsVolume(ctx),
    ...ruleNewcomerCategory(ctx),
    ...ruleFadedCategory(ctx),
    ...ruleFrequencyLeader(ctx),
    ...ruleDuplicates(ctx),
  ]

  const rank: Record<Severity, number> = { alert: 0, warn: 1, info: 2, good: 3 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.impactMonthly - a.impactMonthly)
}

// ---------------------------------------------------------------- правила

/**
 * Статья подписок — и русская, и та, что заведена в английском окне:
 * язык окна меняется, а названия статей в хранилище остаются какими были.
 */
const этоПодписки = (имя: string | undefined) => имя === 'Подписки' || имя === т('Подписки')

/** Регулярные списания: сколько съедают и что из этого забыто. */
function ruleSubscriptions(c: Ctx): Advice[] {
  const subs = c.data.recurring.filter(
    (r) => r.active && r.kind === 'expense' &&
      (r.tags.includes('подписка') || r.tags.includes('subscription') || этоПодписки(c.catById.get(r.categoryId || '')?.name)),
  )
  if (!subs.length) return []
  const monthly = subs.reduce((s, r) => s + r.amount * occurrencesInMonth(r, c.curKey), 0)
  if (monthly < 30000) return []

  // Подписка считается «забытой», если по ней нет ни одной операции с тегом
  // или комментарием за последние 3 месяца, кроме самого автосписания.
  const since = addMonths(today(), -3)
  const evidence = subs.map((r) => {
    const paid = c.data.transactions.filter((t) => t.recurringId === r.id && t.date >= since).length
    return т('{0} — {1}/мес{2}', r.title, money(r.amount), paid >= 3 ? '' : т(', списаний за 3 мес: ') + paid)
  })
  const suspicious = subs.filter((r) => diffMonths(r.startDate, today()) >= 6)
  const impact = Math.round(monthly * 0.4)

  return [{
    id: 'subs',
    kind: 'cut',
    severity: monthly > c.avgExpense * 0.04 ? 'warn' : 'info',
    title: т('Подписки съедают {0} в месяц', money(monthly)),
    body:
      т('За год это {0}. Подписок активно: {1}. ', money(monthly * 12), subs.length) +
      (suspicious.length
        ? т('Из них {0} тянутся дольше полугода — как правило, половину таких перестают использовать через 2–3 месяца после подключения. ', suspicious.length)
        : '') +
      т('Пройдитесь по списку и отключите то, чем не пользовались последний месяц. Оценка эффекта — отказ от 40% списка.'),
    evidence,
    impactMonthly: impact,
    effort: 'низкое',
    action: { label: т('Сценарий: минус половина подписок'), type: 'scenario', payload: { categoryName: т('Подписки'), factor: 0.5 } },
  }]
}

/** Категории, которые в этом месяце идут заметно выше собственной нормы. */
function ruleCategoryDrift(c: Ctx): Advice[] {
  const out: Advice[] = []
  const curTx = c.data.transactions.filter((t) => monthKey(t.date) === c.curKey)
  const totals = categoryTotals(curTx, 'expense')

  for (const t of totals.slice(0, 12)) {
    const cat = c.catById.get(t.categoryId)
    if (!cat) continue
    const hist = categoryMonthly(c.data.transactions, cat.id, c.keys, false, 'expense').filter((v) => v > 0)
    if (hist.length < 3) continue
    const norm = median(hist)
    if (!norm) continue
    const projected = Math.round(t.amount / c.monthProgress)
    const over = projected - norm
    if (over <= 0 || over / norm < 0.25 || over < 150000) continue

    out.push({
      id: 'drift_' + cat.id,
      kind: 'cut',
      severity: over / norm > 0.6 ? 'warn' : 'info',
      title: т('{0}: идёт на {1} выше обычного', сЗначкомъ(cat.icon, cat.name), pct((over / norm) * 100)),
      body:
        т('Потрачено {0} за {1}% месяца. ', money(t.amount), Math.round(c.monthProgress * 100)) +
        т('При таком темпе выйдет {0} против обычных {1} — ', money(projected), money(norm)) +
        т('это {0} сверху. Достаточно вернуться к своей же норме, отдельных усилий не требуется.', money(over)),
      evidence: [
        т('Медиана за {0} мес: {1}', c.keys.length, money(norm)),
        т('Операций в этом месяце: {0}', t.count),
        т('Максимум за историю: {0}', money(Math.max(...hist))),
      ],
      impactMonthly: over,
      effort: 'низкое',
      action: { label: т('Вернуть {0} к норме', cat.name), type: 'scenario', payload: { categoryId: cat.id, factor: norm / projected } },
    })
  }
  return out.slice(0, 3)
}

/** «Кофейный эффект»: много мелких операций, которые в сумме дают крупную статью. */
function ruleSmallLeaks(c: Ctx): Advice[] {
  const since = addMonths(today(), -3)
  const recent = c.data.transactions.filter((t) => t.kind === 'expense' && t.date >= since)
  const byCat = new Map<string, Money[]>()
  for (const t of recent) {
    const id = t.categoryId
    if (!id) continue
    const arr = byCat.get(id) || []
    arr.push(t.amount)
    byCat.set(id, arr)
  }
  const out: Advice[] = []
  for (const [id, amounts] of byCat) {
    const cat = c.catById.get(id)
    if (!cat || cat.bucket === 'needs') continue
    const perMonth = amounts.length / 3
    const avg = mean(amounts)
    if (perMonth < 6 || avg > 200000) continue
    const monthly = Math.round(amounts.reduce((s, v) => s + v, 0) / 3)
    if (monthly < 200000) continue

    out.push({
      id: 'leak_' + id,
      kind: 'cut',
      severity: 'info',
      title: т('{0}: {1} мелких покупок в месяц', сЗначкомъ(cat.icon, cat.name), Math.round(perMonth)),
      body:
        т('Средний чек {0}, в сумме {1} в месяц и {2} в год. ', money(Math.round(avg)), money(monthly), money(monthly * 12)) +
        т('По одной трате это незаметно — заметно становится в годовом масштабе. ') +
        т('Урезать вдвое обычно проще, чем отказаться совсем: оставьте {0} {1} в месяц.', Math.round(perMonth / 2), plural(Math.round(perMonth / 2), 'покупку', 'покупки', 'покупок')),
      evidence: [
        т('Операций за 3 месяца: {0}', amounts.length),
        т('Самая крупная: {0}', money(Math.max(...amounts))),
        т('Минус половина = {0} в месяц', money(Math.round(monthly / 2))),
      ],
      impactMonthly: Math.round(monthly / 2),
      effort: 'среднее',
      action: { label: т('Сценарий: минус 50%'), type: 'scenario', payload: { categoryId: id, factor: 0.5 } },
    })
  }
  return out.sort((a, b) => b.impactMonthly - a.impactMonthly).slice(0, 3)
}

/** Разовые выбросы: операция сильно больше типичной для своей категории. */
function ruleAnomalies(c: Ctx): Advice[] {
  const since = addMonths(today(), -2)
  const recent = c.data.transactions.filter((t) => t.kind === 'expense' && t.date >= since)
  const found: { t: Transaction; norm: Money }[] = []
  for (const t of recent) {
    if (!t.categoryId) continue
    const hist = c.data.transactions
      .filter((x) => x.kind === 'expense' && x.categoryId === t.categoryId && x.id !== t.id)
      .map((x) => x.amount)
    if (hist.length < 8) continue
    const norm = median(hist)
    if (norm && t.amount > norm * 4 && t.amount > 500000) found.push({ t, norm })
  }
  if (!found.length) return []
  found.sort((a, b) => b.t.amount - a.t.amount)
  const top = found.slice(0, 4)
  const sum = top.reduce((s, f) => s + f.t.amount, 0)

  return [{
    id: 'anomalies',
    kind: 'cut',
    severity: 'info',
    title: т('{0} {1} за 2 месяца', top.length, plural(top.length, 'нетипично крупная трата', 'нетипично крупные траты', 'нетипично крупных трат')),
    body:
      т('Суммарно {0}. Это не обязательно ошибка — но такие операции стоит один раз пересмотреть: ', money(sum)) +
      т('часть из них разовые и не должна попадать в расчёт «обычного месяца», а часть означает, что появилась новая регулярная статья.'),
    evidence: top.map(
      (f) =>
        т('{0}.{1} {2}: {3} при обычных {4}{5}', f.t.date.slice(8), f.t.date.slice(5, 7), c.catById.get(f.t.categoryId!)?.name, money(f.t.amount), money(f.norm), f.t.note ? ' — ' + f.t.note : ''),
    ),
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: т('Открыть операции'), type: 'goto', payload: { view: 'transactions' } },
  }]
}

/** Категории с заданным лимитом, который будет превышен. */
function rulePlanOverrun(c: Ctx): Advice[] {
  const curTx = c.data.transactions.filter((t) => monthKey(t.date) === c.curKey)
  const totals = new Map(categoryTotals(curTx, 'expense').map((t) => [t.categoryId, t.amount]))
  const bad: { cat: Category; spent: Money; projected: Money; plan: Money }[] = []
  for (const cat of c.data.categories) {
    if (cat.kind !== 'expense' || !cat.plan || cat.archived) continue
    const spent = totals.get(cat.id) || 0
    const projected = Math.round(spent / c.monthProgress)
    if (projected > cat.plan * 1.05) bad.push({ cat, spent, projected, plan: cat.plan })
  }
  if (!bad.length) return []
  bad.sort((a, b) => b.projected - b.plan - (a.projected - a.plan))
  const overSum = bad.reduce((s, b) => s + (b.projected - b.plan), 0)

  return [{
    id: 'plan_overrun',
    kind: 'budget',
    severity: overSum > c.avgExpense * 0.05 ? 'warn' : 'info',
    title: т('Лимиты будут превышены в {0} {1}', bad.length, plural(bad.length, 'категории', 'категориях', 'категориях')),
    body:
      т('Суммарный перерасход к концу месяца — {0}. ', money(overSum)) +
      т('Либо лимит нереалистичен и его надо поднять, либо темп трат надо снизить: ') +
      т('на оставшуюся часть месяца в этих категориях доступно {0}.', money(Math.max(0, bad.reduce((s, b) => s + Math.max(0, b.plan - b.spent), 0)))),
    evidence: bad
      .slice(0, 6)
      .map((b) => т('{0}: {1} из {2} → прогноз {3}', сЗначкомъ(b.cat.icon, b.cat.name), money(b.spent), money(b.plan), money(b.projected))),
    impactMonthly: overSum,
    effort: 'среднее',
    action: { label: т('Открыть бюджет'), type: 'goto', payload: { view: 'budget' } },
  }]
}

/** Крупные категории без лимита — бюджет неуправляем. */
function ruleMissingPlans(c: Ctx): Advice[] {
  const totals = categoryTotals(
    c.data.transactions.filter((t) => t.date >= addMonths(today(), -3)),
    'expense',
  )
  const missing = totals
    .map((t) => ({ t, cat: c.catById.get(t.categoryId) }))
    .filter((x) => x.cat && !x.cat.plan && !x.cat.archived && x.t.amount / 3 > 300000)
    .slice(0, 5)
  if (missing.length < 2) return []

  return [{
    id: 'missing_plans',
    kind: 'budget',
    severity: 'info',
    title: т('{0} крупных категорий живут без лимита', missing.length),
    body:
      т('Пока у категории нет плановой суммы, перерасход в ней невозможно заметить вовремя — он виден только постфактум. ') +
      т('Разумная отправная точка — медиана за последние месяцы, округлённая вверх. Кошель может проставить такие лимиты сам.'),
    evidence: missing.map((x) => {
      const hist = categoryMonthly(c.data.transactions, x.t.categoryId, c.keys).filter((v) => v > 0)
      return т('{0}: {1}/мес → предложить лимит {2}', сЗначкомъ(x.cat!.icon, x.cat!.name), money(Math.round(x.t.amount / 3)), money(Math.ceil(median(hist) / 50000) * 50000))
    }),
    impactMonthly: 0,
    effort: 'низкое',
    action: {
      label: т('Проставить лимиты по медиане'),
      type: 'plan',
      payload: { categoryIds: missing.map((x) => x.t.categoryId) },
    },
  }]
}

/** Норма сбережений против цели из профиля. */
function ruleSavingsRate(c: Ctx): Advice[] {
  if (!c.avgIncome) return []
  const rate = c.fc.savingsRate
  const target = c.data.settings.profile.savingsRateTarget
  const gap = Math.round(((target - rate) / 100) * c.avgIncome)

  if (rate >= target) {
    return [{
      id: 'savings_ok',
      kind: 'budget',
      severity: 'good',
      title: т('Норма сбережений {0} — выше цели', pct(rate, 1)),
      body:
        т('Из {0} среднего дохода остаётся {1} в месяц. ', money(c.avgIncome), money(c.fc.avgNet)) +
        т('Цель профиля — {0}. Излишек имеет смысл не держать на текущем счёте, а распределять по целям: ', pct(target)) +
        т('иначе он растворяется в тратах в течение двух-трёх месяцев.'),
      evidence: [т('Средний доход: {0}', money(c.avgIncome)), т('Средний расход: {0}', money(c.avgExpense))],
      impactMonthly: 0,
      effort: 'низкое',
      action: { label: т('Открыть цели'), type: 'goto', payload: { view: 'goals' } },
    }]
  }

  return [{
    id: 'savings_rate',
    kind: 'budget',
    severity: rate < 0 ? 'alert' : rate < target / 2 ? 'warn' : 'info',
    title:
      rate < 0
        ? т('Расходы обгоняют доходы: норма сбережений {0}', pct(rate, 1))
        : т('Норма сбережений {0} против цели {1}', pct(rate, 1), pct(target)),
    body:
      т('Средний доход {0}, средний расход {1}, остаётся {2} в месяц. ', money(c.avgIncome), money(c.avgExpense), money(c.fc.avgNet)) +
      т('Чтобы выйти на цель, нужно найти {0} в месяц — это {1} текущих расходов. ', money(gap), pct((gap / c.avgExpense) * 100, 1)) +
      т('Проще всего взять их из необязательных категорий, а не резать всё подряд на равный процент.'),
    evidence: [
      т('Нужно в месяц: {0}', money(gap)),
      т('За год это {0}', money(gap * 12)),
      т('Расходы «хочу»: {0} в месяц', money(bucketSum(c, 'wants'))),
    ],
    impactMonthly: gap,
    effort: 'среднее',
    action: { label: т('Собрать сценарий экономии'), type: 'scenario', payload: { auto: 'save', target: gap } },
  }]
}

function bucketSum(c: Ctx, bucket: 'needs' | 'wants' | 'savings'): Money {
  const ids = new Set(c.data.categories.filter((x) => x.bucket === bucket).map((x) => x.id))
  const totals = categoryTotals(
    c.data.transactions.filter((t) => t.date >= addMonths(today(), -3)),
    'expense',
  )
  return Math.round(totals.filter((t) => ids.has(t.categoryId)).reduce((s, t) => s + t.amount, 0) / 3)
}

/** Подушка безопасности в месяцах расходов. */
function ruleEmergencyFund(c: Ctx): Advice[] {
  if (!c.avgExpense) return []
  const target = c.data.settings.profile.emergencyMonths
  const cover = c.assets / c.avgExpense
  const need = Math.max(0, Math.round(target * c.avgExpense - c.assets))
  const perMonth = c.fc.avgNet > 0 ? Math.ceil(need / Math.max(1, c.fc.avgNet)) : null

  if (cover >= target) {
    return [{
      id: 'fund_ok',
      kind: 'risk',
      severity: 'good',
      title: т('Подушка закрывает {0} {1} расходов', cover.toFixed(1).replace('.', ','), plural(Math.round(cover), 'месяц', 'месяца', 'месяцев')),
      body: т('Цель профиля — {0}. Запас есть; излишек сверх {1} логично переложить под процент, иначе инфляция {2} съедает его молча.', monthsWord(target), monthsWord(target + 1), pct(c.data.settings.profile.inflationPct)),
      evidence: [т('Активы: {0}', money(c.assets)), т('Средний расход: {0}', money(c.avgExpense))],
      impactMonthly: 0,
      effort: 'низкое',
    }]
  }

  return [{
    id: 'fund',
    kind: 'risk',
    severity: cover < 1 ? 'alert' : cover < target / 2 ? 'warn' : 'info',
    title: т('Подушки хватит на {0} {1}', cover.toFixed(1).replace('.', ','), plural(Math.round(cover) || 1, 'месяц', 'месяца', 'месяцев')),
    body:
      т('При среднем расходе {0} до цели в {1} не хватает {2}. ', money(c.avgExpense), monthsWord(target), money(need)) +
      (perMonth
        ? т('При нынешнем свободном остатке {0} в месяц цель закрывается за {1}. ', money(c.fc.avgNet), monthsWord(perMonth))
        : т('Свободных денег сейчас нет — сначала нужно вывести месяц в плюс. ')) +
      т('Держать подушку лучше отдельно от текущего счёта, иначе она тратится незаметно.'),
    evidence: [
      т('Активы: {0}', money(c.assets)),
      т('Цель: {0}', money(Math.round(target * c.avgExpense))),
      т('Не хватает: {0}', money(need)),
    ],
    impactMonthly: 0,
    effort: 'среднее',
    action: { label: т('Открыть цели'), type: 'goto', payload: { view: 'goals' } },
  }]
}

/** Вероятность ухода в минус по симуляциям. */
function ruleNegativeRisk(c: Ctx): Advice[] {
  const risk = c.fc.riskNegative
  if (risk < 0.05 && !c.fc.firstNegative) return []
  const when = c.fc.firstNegative ? monthTitle(c.fc.firstNegative) : null

  return [{
    id: 'neg_risk',
    kind: 'risk',
    severity: risk > 0.35 || when ? 'alert' : 'warn',
    title:
      when
        ? т('Прогноз уходит в минус: {0}', when)
        : т('Риск уйти в минус за год — {0}', pct(risk * 100)),
    body:
      т('Из {0} симуляций {1}% заканчиваются отрицательным остатком хотя бы в одном месяце. ', c.data.settings.monteCarloRuns, Math.round(risk * 100)) +
      (when
        ? т('Медианный сценарий пробивает ноль в {0}. ', вСтрочную(when))
        : т('Медианный сценарий держится в плюсе, но запас невелик. ')) +
      т('Это считается по вашей же истории: разброс берётся из фактических отклонений месяц к месяцу, а не из абстрактных процентов.'),
    evidence: [
      т('Остаток сейчас: {0}', money(c.fc.startBalance)),
      т('Средний результат месяца: {0}', money(c.fc.avgNet, { sign: true })),
      c.fc.months.length ? т('Через год (медиана): {0}', money(c.fc.months[c.fc.months.length - 1].p50)) : '',
    ].filter(Boolean),
    impactMonthly: 0,
    effort: 'высокое',
    action: { label: т('Открыть прогноз'), type: 'goto', payload: { view: 'forecast' } },
  }]
}

/** Правило 50/30/20 как ориентир, а не догма. */
function ruleBuckets(c: Ctx): Advice[] {
  const needs = bucketSum(c, 'needs')
  const wants = bucketSum(c, 'wants')
  const total = needs + wants
  if (!total || !c.avgIncome) return []
  const savings = Math.max(0, c.avgIncome - total)
  const base = c.avgIncome
  const shares = {
    needs: (needs / base) * 100,
    wants: (wants / base) * 100,
    savings: (savings / base) * 100,
  }
  const wantsOver = Math.round(((shares.wants - 30) / 100) * base)

  return [{
    id: 'buckets',
    kind: 'budget',
    severity: shares.wants > 40 || shares.savings < 10 ? 'warn' : 'info',
    title: т('Раскладка 50/30/20: сейчас {0}/{1}/{2}', Math.round(shares.needs), Math.round(shares.wants), Math.round(shares.savings)),
    body:
      т('«Надо» — {0}, «хочу» — {1}, остаётся {2}. ', money(needs), money(wants), money(savings)) +
      (wantsOver > 0
        ? т('Необязательные траты превышают ориентир на {0} в месяц. Перенос этой суммы в накопления даёт {1} за год. ', money(wantsOver), money(wantsOver * 12))
        : т('Необязательные траты в пределах ориентира. ')) +
      т('Пропорция условна: при доходе выше среднего доля «надо» естественно ниже, и это нормально.'),
    evidence: [
      т('Надо: {0} ({1})', money(needs), pct(shares.needs)),
      т('Хочу: {0} ({1})', money(wants), pct(shares.wants)),
      т('Остаётся: {0} ({1})', money(savings), pct(shares.savings)),
    ],
    impactMonthly: Math.max(0, wantsOver),
    effort: 'среднее',
    action: { label: т('Открыть бюджет'), type: 'goto', payload: { view: 'budget' } },
  }]
}

/** Насколько доход зависит от одного источника. */
function ruleIncomeConcentration(c: Ctx): Advice[] {
  const since = addMonths(today(), -6)
  const totals = categoryTotals(c.data.transactions.filter((t) => t.date >= since), 'income')
  if (totals.length === 0) return []
  const sum = totals.reduce((s, t) => s + t.amount, 0)
  if (!sum) return []
  const top = totals[0]
  const share = top.amount / sum
  const cat = c.catById.get(top.categoryId)
  if (share < 0.55 || !cat) return []

  const lostMonthly = Math.round(top.amount / 6)
  const coverMonths = c.avgExpense ? c.assets / c.avgExpense : 0

  return [{
    id: 'income_conc',
    kind: 'income',
    severity: share > 0.8 ? 'warn' : 'info',
    title: т('{0} дохода даёт один источник — {1}', pct(share * 100), cat.name),
    body:
      т('За полгода «{0}» принёс {1} из {2}. ', cat.name, money(top.amount), money(sum)) +
      т('Если этот канал остановится, доход упадёт на {0} в месяц, а запаса хватит на {1} {2}. ', money(lostMonthly), coverMonths.toFixed(1).replace('.', ','), plural(Math.round(coverMonths) || 1, 'месяц', 'месяца', 'месяцев')) +
      т('Второй источник не обязан быть большим: даже 20–25% дохода из другого канала снимают основную часть риска. ') +
      т('Практический ориентир — довести второй канал до {0} в месяц.', money(Math.round(sum / 6 * 0.25))),
    evidence: totals
      .slice(0, 4)
      .map((t) => т('{0}: {1}/мес ({2})', c.catById.get(t.categoryId)?.name ?? '—', money(Math.round(t.amount / 6)), pct((t.amount / sum) * 100))),
    impactMonthly: 0,
    effort: 'высокое',
    action: { label: т('Сценарий: рост дохода на 20%'), type: 'scenario', payload: { incomeFactor: 1.2 } },
  }]
}

/** Насколько доход рваный — от этого зависит нужный размер буфера. */
function ruleIncomeVolatility(c: Ctx): Advice[] {
  const series = c.fc.history.filter((h) => h.key < c.curKey).map((h) => h.income)
  if (series.length < 5) return []
  const m = mean(series)
  if (!m) return []
  const sd = stdev(series)
  const cv = sd / m
  if (cv < 0.25) return []

  const worst = Math.min(...series)
  const buffer = Math.round(Math.max(0, c.avgExpense - worst))

  return [{
    id: 'income_vol',
    kind: 'risk',
    severity: cv > 0.5 ? 'warn' : 'info',
    title: т('Доход скачет: разброс {0} от среднего', pct(cv * 100)),
    body:
      т('Средний месяц — {0}, худший за историю — {1}. ', money(Math.round(m)), money(worst)) +
      т('Для нестабильного дохода обычный совет «откладывать фиксированную сумму» работает плохо: ') +
      т('надёжнее откладывать процент от каждого поступления и держать отдельный буфер на слабый месяц. ') +
      (buffer > 0
        ? т('Буфер, закрывающий провал до среднего расхода, — {0}.', money(buffer))
        : т('Даже худший месяц покрывал расходы — буфер уже фактически есть.')),
    evidence: [
      т('Среднее: {0}', money(Math.round(m))),
      т('Стандартное отклонение: {0}', money(Math.round(sd))),
      т('Минимум: {0}, максимум: {1}', money(worst), money(Math.max(...series))),
    ],
    impactMonthly: 0,
    effort: 'среднее',
  }]
}

/** Растёт ли доход быстрее инфляции. */
function ruleIncomeTrend(c: Ctx): Advice[] {
  const series = c.fc.history.filter((h) => h.key < c.curKey).map((h) => h.income)
  if (series.length < 6) return []
  // Берём наклон из прогнозных оценок: он посчитан по ряду со снятой
  // сезонностью, иначе один сильный декабрь читается как годовой спад.
  const incomeBases = c.fc.bases.filter((b) => b.kind === 'income')
  const baseSum = incomeBases.reduce((s, b) => s + b.base + b.fixed, 0)
  const slope = incomeBases.reduce((s, b) => s + b.slopePerMonth, 0)
  const m = mean(series)
  if (!m || !baseSum) return []
  const yearlyPct = ((slope * 12) / baseSum) * 100
  const infl = c.data.settings.profile.inflationPct
  const real = yearlyPct - infl

  if (real >= 0) {
    return [{
      id: 'income_trend_ok',
      kind: 'income',
      severity: 'good',
      title: т('Доход растёт на {0} в год — быстрее инфляции', pct(yearlyPct, 1)),
      body:
        т('Тренд по последним {0} даёт +{1} к месячному доходу каждый месяц. ', monthsWord(series.length), money(Math.round(slope))) +
        т('С поправкой на инфляцию {0} реальный рост — {1}. Главное теперь, чтобы расходы не росли тем же темпом.', pct(infl), pct(real, 1)),
      evidence: [т('Первый месяц: {0}', money(series[0])), т('Последний: {0}', money(series[series.length - 1]))],
      impactMonthly: 0,
      effort: 'низкое',
    }]
  }

  const needed = Math.round((m * infl) / 100 / 12)
  return [{
    id: 'income_trend',
    kind: 'income',
    severity: yearlyPct < -5 ? 'warn' : 'info',
    title: т('Доход отстаёт от инфляции на {0} в год', pct(Math.abs(real), 1)),
    body:
      т('Тренд дохода — {0} в год при инфляции {1}. В реальных деньгах вы беднеете, даже если номинально всё стабильно. ', pct(yearlyPct, 1), pct(infl)) +
      т('Чтобы просто удержать уровень, доход должен прибавлять около {0} в месяц ежемесячно. ', money(needed)) +
      т('Самый дешёвый по усилиям шаг — индексация цен постоянным заказчикам: рост чека на {0} обычно не приводит к потере клиентов, а даёт {1} в месяц.', pct(infl), money(Math.round((m * infl) / 100))),
    evidence: [
      т('Средний доход: {0}', money(Math.round(m))),
      т('Изменение: {0} в месяц', money(Math.round(slope), { sign: true })),
      т('Эффект индексации на {0}: {1}/мес', pct(infl), money(Math.round((m * infl) / 100))),
    ],
    impactMonthly: Math.round((m * infl) / 100),
    effort: 'среднее',
    action: { label: т('Сценарий: +{0} к доходу', pct(infl)), type: 'scenario', payload: { incomeFactor: 1 + infl / 100 } },
  }]
}

/** Деньги, которые лежат мёртвым грузом на текущем счёте. */
function ruleIdleCash(c: Ctx): Advice[] {
  if (!c.avgExpense) return []
  const target = c.data.settings.profile.emergencyMonths
  const rate = c.data.settings.profile.depositRatePct
  const idle = c.liquid - Math.round(c.avgExpense * 1.5)
  if (idle < 5_000_00 || rate <= 0) return []

  const yearly = Math.round((idle * rate) / 100)
  return [{
    id: 'idle_cash',
    kind: 'income',
    severity: 'info',
    title: т('{0} лежит без дела на текущих счетах', money(idle)),
    body:
      т('Полтора месяца расходов держать под рукой разумно, остальное — нет. ') +
      т('Под {0} годовых эти деньги приносили бы {1} в год или {2} в месяц — ', pct(rate), money(yearly), money(Math.round(yearly / 12))) +
      т('без каких-либо усилий с вашей стороны. Инфляция {0} при этом обесценивает лежащий остаток на {1} в год.', pct(c.data.settings.profile.inflationPct), money(Math.round((idle * c.data.settings.profile.inflationPct) / 100))),
    evidence: [
      т('На текущих счетах: {0}', money(c.liquid)),
      т('Оперативный запас (1,5 расхода): {0}', money(Math.round(c.avgExpense * 1.5))),
      т('Свободно: {0}', money(idle)),
    ],
    impactMonthly: Math.round(yearly / 12),
    effort: 'низкое',
  }]
}

/** Кредиты и долги: что гасить первым и что даёт досрочный платёж. */
function ruleDebts(c: Ctx): Advice[] {
  const out: Advice[] = []
  const credits = c.data.accounts.filter((a) => !a.archived && a.type === 'credit' && a.credit)
  const debts = c.data.accounts.filter((a) => !a.archived && a.type === 'debt' && a.debt)

  for (const acc of credits) {
    const cr = acc.credit!
    const left = creditRemaining(acc, c.data.transactions)
    if (left <= 0) continue
    const monthsLeft = cr.monthlyPayment ? Math.ceil(left / cr.monthlyPayment) : cr.termMonths
    const interestLeft = Math.max(0, Math.round((left * cr.ratePct) / 100 / 12) * monthsLeft)
    const extra = Math.max(0, Math.min(c.fc.avgNet, Math.round(left * 0.1)))
    const savedMonths = extra > 0 ? Math.ceil(left / (cr.monthlyPayment + extra)) : monthsLeft
    const savedInterest = Math.max(0, interestLeft - Math.round((left * cr.ratePct) / 100 / 12) * savedMonths)
    const depositRate = c.data.settings.profile.depositRatePct

    out.push({
      id: 'credit_' + acc.id,
      kind: 'debt',
      severity: cr.ratePct > depositRate ? 'warn' : 'info',
      title: т('{0}: остаток {1} под {2}', acc.name, money(left), pct(cr.ratePct, 1)),
      body:
        т('Платёж {0} в месяц, осталось примерно {1}, переплата вперёд — около {2}. ', money(cr.monthlyPayment), monthsWord(monthsLeft), money(interestLeft)) +
        (cr.ratePct > depositRate
          ? т('Ставка выше доходности вклада ({0}), поэтому свободные деньги выгоднее направлять сюда, а не на накопления: каждый рубль здесь «зарабатывает» {1} гарантированно. ', pct(depositRate), pct(cr.ratePct, 1))
          : т('Ставка ниже доходности вклада ({0}) — досрочно гасить невыгодно, деньги лучше работают на накоплениях. ', pct(depositRate))) +
        (extra > 0
          ? т('Досрочный платёж {0} в месяц сокращает срок до {1} и экономит около {2}.', money(extra), monthsWord(savedMonths), money(savedInterest))
          : т('Свободных денег на досрочное погашение сейчас нет.')),
      evidence: [
        т('Тело кредита: {0}', money(cr.principal)),
        т('Выплачено: {0}', money(cr.principal - left)),
        т('Платёж: {0} до {1} числа', money(cr.monthlyPayment), cr.paymentDay),
      ],
      impactMonthly: cr.ratePct > depositRate ? Math.round((left * (cr.ratePct - depositRate)) / 100 / 12) : 0,
      effort: 'среднее',
      action: { label: т('Открыть долги'), type: 'goto', payload: { view: 'debts' } },
    })
  }

  for (const acc of debts) {
    const d = acc.debt!
    const bal = c.data.accounts.length ? 0 : 0
    const amount = Math.abs(acc.initialBalance + c.data.transactions.filter((t) => t.accountId === acc.id || t.toAccountId === acc.id).reduce((s, t) => s + (t.toAccountId === acc.id ? t.amount : -t.amount), 0))
    if (!amount) continue
    const overdue = d.dueDate ? diffDays(d.dueDate, today()) : -1

    out.push({
      id: 'debt_' + acc.id,
      kind: 'debt',
      severity: overdue > 0 ? 'alert' : overdue > -30 ? 'warn' : 'info',
      title:
        d.direction === 'i_owe'
          ? т('Долг {0}: {1}', d.counterparty, money(amount))
          : т('{0} должен вам {1}', d.counterparty, money(amount)),
      body:
        (d.dueDate
          ? overdue > 0
            ? т('Срок прошёл {0} {1} назад. ', Math.abs(overdue), plural(Math.abs(overdue), 'день', 'дня', 'дней'))
            : т('Срок — {0}, осталось {1} {2}. ', d.dueDate, Math.abs(overdue), plural(Math.abs(overdue), 'день', 'дня', 'дней'))
          : т('Срок не задан — такие долги обычно и повисают. ')) +
        (d.direction === 'i_owe'
          ? т('Беспроцентный долг человеку стоит гасить не первым по деньгам, но первым по срокам: репутационная цена просрочки выше процентной.')
          : т('Деньги, которые вам должны, не участвуют в обороте и не приносят процент. При ставке вклада {0} это {1} упущенной выгоды в месяц.', pct(c.data.settings.profile.depositRatePct), money(Math.round((amount * c.data.settings.profile.depositRatePct) / 100 / 12)))),
      evidence: [т('Сумма: {0}', money(amount)), d.dueDate ? т('Срок: {0}', d.dueDate) : т('Срок не задан')],
      impactMonthly: 0,
      effort: 'низкое',
      action: { label: т('Открыть долги'), type: 'goto', payload: { view: 'debts' } },
    })
  }

  return out
}

/** Достижимость целей при текущем свободном остатке. */
function ruleGoals(c: Ctx): Advice[] {
  const bal = balances(c.data.accounts, c.data.transactions)
  const active = c.data.goals.filter((g) => !g.done)
  if (!active.length) return []

  const free = c.fc.avgNet
  const rows = active.map((g) => {
    const saved = g.accountId ? bal.byAccount.get(g.accountId) || 0 : g.saved
    const left = Math.max(0, g.targetAmount - saved)
    const monthsLeft = g.targetDate ? Math.max(1, diffMonths(today(), g.targetDate)) : null
    const need = monthsLeft ? Math.round(left / monthsLeft) : null
    return { g, saved, left, monthsLeft, need }
  })
  const totalNeed = rows.reduce((s, r) => s + (r.need || 0), 0)
  if (!totalNeed) return []

  const feasible = free >= totalNeed
  return [{
    id: 'goals',
    kind: 'goal',
    severity: feasible ? 'good' : free <= 0 ? 'alert' : 'warn',
    title: feasible
      ? т('Цели укладываются в свободные деньги')
      : т('Цели требуют {0} в месяц, свободно {1}', money(totalNeed), money(Math.max(0, free))),
    body:
      (feasible
        ? т('Суммарно цели требуют {0} в месяц при свободных {1}. Запас — {2}. ', money(totalNeed), money(free), money(free - totalNeed))
        : т('Не хватает {0} в месяц. Одновременно двигать все цели не выйдет — придётся либо сдвинуть сроки, либо расставить приоритеты. ', money(totalNeed - Math.max(0, free)))) +
      т('Практика: цель с ближайшим сроком закрывается первой, остальные ставятся на паузу — так закрывается хотя бы одна, а не все понемногу.'),
    evidence: rows.map(
      (r) =>
        т('{0}: {1} из {2}', сЗначкомъ(r.g.icon, r.g.name), money(r.saved), money(r.g.targetAmount)) +
        (r.need ? т(' → {0}/мес на {1}', money(r.need), monthsWord(r.monthsLeft!)) : т(' (без срока)')),
    ),
    impactMonthly: 0,
    effort: 'среднее',
    action: { label: т('Открыть цели'), type: 'goto', payload: { view: 'goals' } },
  }]
}

/** Хватит ли остатка до зарплаты при текущем темпе. */
function rulePaydayGap(c: Ctx): Advice[] {
  const payday = c.data.settings.profile.payday
  const now = today()
  const d = parseISO(now)
  const dim = daysInMonth(d.getFullYear(), d.getMonth())
  const daysLeft = d.getDate() < payday ? payday - d.getDate() : dim - d.getDate() + payday
  if (daysLeft > 20) return []

  const dailyBurn = Math.round(c.avgExpense / 30.4)
  const need = dailyBurn * daysLeft
  if (c.liquid >= need * 1.5) return []

  return [{
    id: 'payday',
    kind: 'risk',
    severity: c.liquid < need ? 'alert' : 'warn',
    title:
      c.liquid < need
        ? т('До зарплаты {0} {1}, денег хватит на {2}', daysLeft, plural(daysLeft, 'день', 'дня', 'дней'), Math.floor(c.liquid / Math.max(1, dailyBurn)))
        : т('Запас до зарплаты в обрез'),
    body:
      т('На текущих счетах {0}, привычный темп трат — {1} в день. ', money(c.liquid), money(dailyBurn)) +
      т('До {0} числа нужно {1}. ', payday, money(need)) +
      (c.liquid < need
        ? т('Не хватает {0}: имеет смысл заранее решить, откуда они возьмутся, а не в последние два дня.', money(need - c.liquid))
        : т('Запас есть, но небольшой — крупные покупки лучше отложить на после зарплаты.')),
    evidence: [
      т('Остаток: {0}', money(c.liquid)),
      т('Темп трат: {0} в день', money(dailyBurn)),
      т('Дней до {0} числа: {1}', payday, daysLeft),
    ],
    impactMonthly: 0,
    effort: 'низкое',
  }]
}

/** Какая доля расходов зафиксирована — это про гибкость, а не про сумму. */
function ruleFixedShare(c: Ctx): Advice[] {
  const fixed = c.data.recurring
    .filter((r) => r.active && r.kind === 'expense')
    .reduce((s, r) => s + r.amount * occurrencesInMonth(r, c.curKey), 0)
  if (!c.avgExpense || !fixed) return []
  const share = (fixed / c.avgExpense) * 100
  if (share < 45) return []

  return [{
    id: 'fixed_share',
    kind: 'budget',
    severity: share > 65 ? 'warn' : 'info',
    title: т('{0} расходов зафиксировано обязательствами', pct(share)),
    body:
      т('{0} из {1} уходит по регулярным платежам. ', money(fixed), money(c.avgExpense)) +
      т('Чем выше эта доля, тем меньше можно ужаться в плохой месяц: сокращать придётся не «лишнее», а обязательное, что почти всегда означает штрафы и просрочки. ') +
      т('Здоровый ориентир — не больше половины расходов.'),
    evidence: c.data.recurring
      .filter((r) => r.active && r.kind === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((r) => т('{0}: {1}/мес', r.title, money(r.amount))),
    impactMonthly: 0,
    effort: 'высокое',
    action: { label: т('Открыть регулярные'), type: 'goto', payload: { view: 'recurring' } },
  }]
}

/** Операции без категории портят всю аналитику. */
function ruleUncategorized(c: Ctx): Advice[] {
  const since = addMonths(today(), -3)
  const recent = c.data.transactions.filter((t) => t.kind === 'expense' && t.date >= since)
  const bad = recent.filter((t) => !t.categoryId && !t.splits?.length)
  if (!recent.length || bad.length / recent.length < 0.05) return []
  const sum = bad.reduce((s, t) => s + t.amount, 0)

  return [{
    id: 'uncat',
    kind: 'budget',
    severity: 'info',
    title: т('{0} {1} без категории на {2}', bad.length, plural(bad.length, 'операция', 'операции', 'операций'), money(sum)),
    body:
      т('Это {0} операций за три месяца. Пока они не разобраны, ', pct((bad.length / recent.length) * 100)) +
      т('и прогноз, и советы считают по неполной картине — любые выводы про «где течёт» будут смещены.'),
    evidence: [т('Сумма без категории: {0}', money(sum)), т('В среднем: {0}/мес', money(Math.round(sum / 3)))],
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: т('Показать их'), type: 'goto', payload: { view: 'transactions', filter: 'uncategorized' } },
  }]
}

/** Выходные против будней — типичная точка утечки. */
function ruleWeekendSpending(c: Ctx): Advice[] {
  const since = addMonths(today(), -3)
  const recent = c.data.transactions.filter(
    (t) => t.kind === 'expense' && t.date >= since && c.catById.get(t.categoryId || '')?.bucket === 'wants',
  )
  if (recent.length < 20) return []
  let weekend = 0
  let weekday = 0
  let wendDays = 0
  let wdayDays = 0
  const seen = new Set<string>()
  for (const t of recent) {
    const dow = parseISO(t.date).getDay()
    if (dow === 0 || dow === 6) weekend += t.amount
    else weekday += t.amount
    if (!seen.has(t.date)) {
      seen.add(t.date)
      if (dow === 0 || dow === 6) wendDays++
      else wdayDays++
    }
  }
  if (!wendDays || !wdayDays) return []
  const perWend = weekend / wendDays
  const perWday = weekday / wdayDays
  if (perWend < perWday * 1.4) return []

  const monthlyDiff = Math.round(((perWend - perWday) * 8.7) / 1)
  return [{
    id: 'weekend',
    kind: 'cut',
    severity: 'info',
    title: т('В выходные вы тратите в {0} раза больше', (perWend / perWday).toFixed(1).replace('.', ',')),
    body:
      т('В будний день на необязательные категории уходит {0}, в выходной — {1}. ', money(Math.round(perWday)), money(Math.round(perWend))) +
      т('Разница за месяц — примерно {0}. Это не повод сидеть дома: обычно достаточно заранее решить сумму на выходные, ', money(monthlyDiff)) +
      т('потому что перерасход здесь берётся из «раз уж вышли», а не из конкретной крупной траты.'),
    evidence: [
      т('Выходные: {0} за 3 месяца', money(weekend)),
      т('Будни: {0} за 3 месяца', money(weekday)),
      т('Половина разницы = {0}/мес', money(Math.round(monthlyDiff / 2))),
    ],
    impactMonthly: Math.round(monthlyDiff / 2),
    effort: 'среднее',
  }]
}


/**
 * Дни подряд с тратами. Сумма за месяц может быть в норме, а привычка
 * тратить каждый день — уже сложившейся: именно она мешает случайной
 * экономии, потому что кошелёк не закрывается ни на день.
 */
function ruleSpendingStreak(c: Ctx): Advice[] {
  const from = addMonths(today(), -3)
  const to = today()
  const span = diffDays(from, to) + 1
  if (span < 60) return []

  const wants = new Map<string, Money[]>()
  const days = new Set<string>()
  for (const t of c.data.transactions) {
    if (t.kind !== 'expense' || t.date < from || t.date > to) continue
    days.add(t.date)
    if (c.catById.get(t.categoryId || '')?.bucket !== 'needs') {
      const arr = wants.get(t.date) || []
      arr.push(t.amount)
      wants.set(t.date, arr)
    }
  }
  if (days.size < 15) return []

  let best = 0
  let bestEnd = ''
  let run = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!days.has(d)) {
      run = 0
      continue
    }
    run++
    if (run > best) {
      best = run
      bestEnd = d
    }
  }

  const free = span - days.size
  const freePerMonth = (free / span) * 30
  if (best < 10 && freePerMonth >= 5) return []

  // Оценка эффекта: четыре «пустых» дня в месяц по медиане необязательных
  // трат такого дня. Считаем по медиане, а не по среднему: один поход
  // за холодильником иначе делает выгоду фантастической.
  const perDay = median([...wants.values()].map((arr) => arr.reduce((x, v) => x + v, 0)))
  const impact = freePerMonth < 8 ? Math.round(perDay * 4) : 0

  return [{
    id: 'streak',
    kind: 'cut',
    severity: best >= 21 || freePerMonth < 3 ? 'warn' : 'info',
    title: т('Самая длинная серия — {0} {1} подряд с тратами', best, plural(best, 'день', 'дня', 'дней')),
    body:
      т('За три месяца набралось {0} {1} без единой траты — это ', free, plural(free, 'день', 'дня', 'дней')) +
      т('{0} в месяц. ', freePerMonth.toFixed(1).replace('.', ',')) +
      т('Ежедневные покупки почти всегда мелкие и почти никогда не запоминаются, поэтому в отчёте их не видно, ') +
      т('а в сумме они и есть разница между «нормальным» и «дорогим» месяцем. ') +
      т('Приём простой: назначить два дня в неделю, когда деньги не тратятся вообще — не ограничивая суммы в остальные.'),
    evidence: [
      т('Серия закончилась {0}', bestEnd ? humanDate(bestEnd, true) : '—'),
      т('Дней с тратами: {0} из {1}', days.size, span),
      т('Медиана необязательных трат в такой день: {0}', money(Math.round(perDay))),
    ],
    impactMonthly: impact,
    effort: 'среднее',
  }]
}

/**
 * Сезонный пик впереди. Сезонность уже посчитана движком прогноза по году
 * истории — здесь она превращается в предупреждение заранее, а не в объяснение
 * задним числом.
 */
function ruleSeasonalPeak(c: Ctx): Advice[] {
  if (c.keys.length < 12) return []
  const nextKey = addMonths(c.curKey + '-01', 1).slice(0, 7)
  const m = Number(nextKey.slice(5, 7)) - 1

  const peaks: { name: string; icon: string; extra: Money; k: number }[] = []
  let extra = 0
  for (const b of c.fc.bases) {
    if (b.kind !== 'expense' || b.base <= 0) continue
    // На году истории каждый месяц представлен одним наблюдением, поэтому
    // слабый коэффициент неотличим от случайности: берём только явные пики
    // и только у категорий, которые вообще живут больше полугода.
    if (b.history.filter((v) => v > 0).length < 6) continue
    const k = b.seasonal[m] ?? 1
    if (k < 1.25) continue
    const add = Math.round(b.base * (k - 1))
    if (add < 30000) continue
    extra += add
    const cat = c.catById.get(b.categoryId)
    peaks.push({ name: cat?.name ?? т('Без категории'), icon: cat?.icon ?? '❓', extra: add, k })
  }
  if (extra < 300000 || !peaks.length) return []
  peaks.sort((a, b) => b.extra - a.extra)

  const share = c.avgExpense > 0 ? (extra / c.avgExpense) * 100 : 0
  return [{
    id: 'season',
    kind: 'budget',
    severity: share > 15 ? 'warn' : 'info',
    title: т('{0} у вас обычно дороже на {1}', monthTitle(nextKey), money(extra)),
    body:
      т('По истории за {0} {1} этот месяц выходит примерно ', c.keys.length, plural(c.keys.length, 'месяц', 'месяца', 'месяцев')) +
      т('на {0} тяжелее обычного. Это не повод сокращать траты — это повод отложить {1} заранее, ', pct(share), money(extra)) +
      т('пока месяц не начался: сезонные пики опасны не размером, а тем, что приходят в тот момент, когда деньги уже распределены.'),
    evidence: peaks.slice(0, 4).map(
      (x) => `${сЗначкомъ(x.icon, x.name)}: +${money(x.extra)} (×${x.k.toFixed(2).replace('.', ',')})`,
    ),
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: т('Посмотреть прогноз'), type: 'goto', payload: { view: 'forecast' } },
  }]
}

/**
 * Крупная разовая трата, которая была в этом же месяце год назад. Страховка,
 * шины, продление домена: такие вещи не попадают в регулярные платежи, потому
 * что случаются раз в год, — и каждый раз оказываются неожиданностью.
 */
function ruleLastYearRepeat(c: Ctx): Advice[] {
  const nextKey = addMonths(c.curKey + '-01', 1).slice(0, 7)
  const found: { t: Transaction; targetKey: string }[] = []

  for (const targetKey of [c.curKey, nextKey]) {
    const backKey = addMonths(targetKey + '-01', -12).slice(0, 7)
    for (const t of c.data.transactions) {
      if (t.kind !== 'expense' || t.recurringId) continue
      if (monthKey(t.date) !== backKey) continue
      if (t.amount < 500000) continue

      const hist = c.data.transactions
        .filter((x) => x.kind === 'expense' && x.categoryId === t.categoryId && x.id !== t.id)
        .map((x) => x.amount)
      const norm = hist.length >= 6 ? median(hist) : 0
      // Крупная — это либо кратно больше обычной траты в своей категории,
      // либо просто заметная сумма там, где истории ещё нет.
      if (norm && t.amount < norm * 3) continue
      if (!norm && t.amount < 1500000) continue

      // Если в этом году такое уже прошло — предупреждать не о чем.
      const repeated = c.data.transactions.some(
        (x) =>
          x.kind === 'expense' &&
          x.id !== t.id &&
          monthKey(x.date) === targetKey &&
          x.categoryId === t.categoryId &&
          x.amount >= t.amount * 0.5,
      )
      if (repeated) continue
      found.push({ t, targetKey })
    }
  }
  if (!found.length) return []
  found.sort((a, b) => b.t.amount - a.t.amount)
  const top = found.slice(0, 4)
  const sum = top.reduce((s, f) => s + f.t.amount, 0)

  return [{
    id: 'repeat',
    kind: 'budget',
    severity: sum > c.avgExpense * 0.25 ? 'warn' : 'info',
    title: top.length > 1
      ? т('Год назад в это время было {0} {1} на {2}', top.length, plural(top.length, 'крупная трата', 'крупные траты', 'крупных трат'), money(sum))
      : т('Год назад в это время была крупная трата на {0}', money(sum)),
    body:
      т('Такие расходы приходят раз в год и потому не попадают ни в регулярные платежи, ни в привычную норму месяца. ') +
      т('Если они повторятся, лучше знать об этом заранее: {0} — это {1} обычного месяца. ', money(sum), pct(c.avgExpense > 0 ? (sum / c.avgExpense) * 100 : 0)) +
      т('Что не повторится — просто пропустите.'),
    evidence: top.map((f) => {
      const cat = c.catById.get(f.t.categoryId || '')
      return `${сЗначкомъ(cat?.icon ?? '❓', f.t.note || cat?.name || т('без категории'))} — ${money(f.t.amount)}, ${humanDate(f.t.date, true)}`
    }),
    impactMonthly: 0,
    effort: 'низкое',
  }]
}

/**
 * Почему категория подорожала: цена или объём.
 *
 * Рост суммы раскладывается точно: count₂·avg₂ − count₁·avg₁ =
 * (avg₂ − avg₁)·count₂ + (count₂ − count₁)·avg₁. Первое слагаемое — цена,
 * второе — количество покупок. Управляемо, как правило, только второе.
 */
function rulePriceVsVolume(c: Ctx): Advice[] {
  const midFrom = addMonths(today(), -3)
  const oldFrom = addMonths(today(), -6)
  const stat = new Map<string, { newSum: Money; newN: number; oldSum: Money; oldN: number }>()

  for (const t of c.data.transactions) {
    if (t.kind !== 'expense' || !t.categoryId || t.date < oldFrom || t.date > today()) continue
    const cur = stat.get(t.categoryId) || { newSum: 0, newN: 0, oldSum: 0, oldN: 0 }
    if (t.date >= midFrom) {
      cur.newSum += t.amount
      cur.newN++
    } else {
      cur.oldSum += t.amount
      cur.oldN++
    }
    stat.set(t.categoryId, cur)
  }

  const out: Advice[] = []
  for (const [id, v] of stat) {
    const cat = c.catById.get(id)
    if (!cat || v.oldN < 4 || v.newN < 4) continue
    const growth = v.newSum - v.oldSum
    if (growth <= 0 || v.oldSum <= 0) continue
    if (growth / v.oldSum < 0.2 || growth < 450000) continue

    const avgOld = v.oldSum / v.oldN
    const avgNew = v.newSum / v.newN
    const priceEffect = Math.round((avgNew - avgOld) * v.newN)
    const volumeEffect = Math.round((v.newN - v.oldN) * avgOld)
    const priceLed = Math.abs(priceEffect) >= Math.abs(volumeEffect)

    out.push({
      id: 'unit_' + id,
      kind: 'cut',
      severity: growth / v.oldSum > 0.5 ? 'warn' : 'info',
      title: priceLed
        ? т('{0} подорожала: чек вырос на {1}', сЗначкомъ(cat.icon, cat.name), pct(((avgNew - avgOld) / avgOld) * 100))
        : т('{0}: покупок стало больше на {1}', сЗначкомъ(cat.icon, cat.name), pct(((v.newN - v.oldN) / v.oldN) * 100)),
      body:
        т('За последние три месяца ушло {0} против {1} тремя месяцами раньше — ', money(v.newSum), money(v.oldSum)) +
        т('рост {0}. Из него {1} дала цена и {2} — количество покупок. ', money(growth), money(Math.abs(priceEffect)), money(Math.abs(volumeEffect))) +
        (priceLed
          ? т('Дорожает сама покупка, а не аппетит: урезать здесь нечего, но можно менять места и формат — цена в этой категории у вас растёт быстрее, чем вы этого хотите.')
          : т('Цена почти не изменилась, изменилась частота: вернуть прежний ритм покупок — самый прямой способ вернуть и сумму.')),
      evidence: [
        т('Средний чек: {0} → {1}', money(Math.round(avgOld)), money(Math.round(avgNew))),
        т('Покупок за 3 месяца: {0} → {1}', v.oldN, v.newN),
        т('Вклад цены {0}, вклад количества {1}', money(priceEffect), money(volumeEffect)),
      ],
      // Управляемая часть — только объём, и то не целиком.
      impactMonthly: volumeEffect > 0 ? Math.round(volumeEffect / 3) : 0,
      effort: priceLed ? 'высокое' : 'среднее',
      action: volumeEffect > 0
        ? { label: т('Вернуть прежний ритм {0}', cat.name), type: 'scenario', payload: { categoryId: id, factor: v.oldSum / v.newSum } }
        : undefined,
    })
  }
  return out.sort((a, b) => b.impactMonthly - a.impactMonthly).slice(0, 3)
}

/** Категория появилась недавно — и уже в верхней части расходов. */
function ruleNewcomerCategory(c: Ctx): Advice[] {
  const since = addMonths(today(), -3)
  const recent = c.data.transactions.filter((t) => t.kind === 'expense' && t.date >= since)
  if (recent.length < 20) return []
  const totals = categoryTotals(recent, 'expense')
  const out: Advice[] = []

  for (const t of totals.slice(0, 5)) {
    const cat = c.catById.get(t.categoryId)
    if (!cat) continue
    const first = c.data.transactions
      .filter((x) => x.kind === 'expense' && x.categoryId === cat.id)
      .reduce<string>((min, x) => (!min || x.date < min ? x.date : min), '')
    if (!first) continue
    const age = diffMonths(first, today())
    if (age > 4 || age < 1) continue

    const monthly = Math.round(t.amount / 3)
    if (monthly < 200000) continue

    out.push({
      id: 'newcomer_' + cat.id,
      kind: 'budget',
      severity: 'info',
      title: т('{0} появилась {1} назад и уже в топ-5 расходов', сЗначкомъ(cat.icon, cat.name), monthsWord(age)),
      body:
        т('С {0} по этой категории прошло {1} {2} на {3}, ', humanDate(first, true), t.count, plural(t.count, 'операция', 'операции', 'операций'), money(t.amount)) +
        т('в среднем {0} в месяц — это {1} всех расходов за три месяца. ', money(monthly), pct(t.share * 100)) +
        т('Новая статья ещё не стала привычкой, и сейчас самый дешёвый момент решить, нужна ли она в таком объёме. ') +
        т('Заодно стоит поставить ей лимит: старые категории у вас нормируются историей, а у этой истории пока нет.'),
      evidence: [
        т('Первая операция: {0}', humanDate(first, true)),
        т('Средний чек: {0}', money(Math.round(t.amount / Math.max(1, t.count)))),
        т('В год такими темпами: {0}', money(monthly * 12)),
      ],
      impactMonthly: 0,
      effort: 'низкое',
      action: { label: т('Поставить лимит'), type: 'plan', payload: { categoryIds: [cat.id] } },
    })
  }
  return out.slice(0, 2)
}

/** Категория замолчала: раньше тратили, три месяца — ничего. */
function ruleFadedCategory(c: Ctx): Advice[] {
  const since = addMonths(today(), -3)
  const out: Advice[] = []

  for (const cat of c.data.categories) {
    if (cat.archived || cat.kind !== 'expense') continue
    const own = c.data.transactions.filter((t) => t.kind === 'expense' && t.categoryId === cat.id)
    if (own.length < 6) continue
    const last = own.reduce<string>((max, t) => (t.date > max ? t.date : max), '')
    if (last >= since) continue
    const gap = diffMonths(last, today())
    if (gap < 3 || gap > 12) continue

    const hist = categoryMonthly(c.data.transactions, cat.id, c.keys, false, 'expense').filter((v) => v > 0)
    const norm = median(hist)
    if (norm < 100000) continue

    out.push({
      id: 'faded_' + cat.id,
      kind: 'budget',
      severity: 'info',
      title: т('{0}: {1} без единой траты', сЗначкомъ(cat.icon, cat.name), monthsWord(gap)),
      body:
        т('Раньше сюда уходило около {0} в месяц, последняя операция — {1}. ', money(norm), humanDate(last, true)) +
        (cat.plan
          ? т('При этом лимит {0} всё ещё занимает место в бюджете и портит раскладку: бюджет считает эти деньги занятыми. ', money(cat.plan))
          : т('Освободившиеся {0} в месяц никуда не делись — если они не переехали в другую категорию, значит просто растворились в общих тратах. ', money(norm))) +
        т('Либо категорию пора архивировать, либо траты по ней перестали попадать в учёт.'),
      evidence: [
        т('Последняя операция: {0}', humanDate(last, true)),
        т('Обычно было: {0}/мес', money(norm)),
        cat.plan ? т('Лимит: {0}', money(cat.plan)) : т('Операций за всю историю: {0}', own.length),
      ],
      impactMonthly: 0,
      effort: 'низкое',
      action: { label: т('Открыть категории'), type: 'goto', payload: { view: 'categories' } },
    })
  }
  return out.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 2)
}

/** Лидер по числу операций, а не по деньгам: куда уходит внимание. */
function ruleFrequencyLeader(c: Ctx): Advice[] {
  const since = addMonths(today(), -3)
  const recent = c.data.transactions.filter((t) => t.kind === 'expense' && t.date >= since && t.categoryId)
  if (recent.length < 40) return []

  const byCat = new Map<string, { n: number; sum: Money }>()
  let total = 0
  for (const t of recent) {
    const cur = byCat.get(t.categoryId!) || { n: 0, sum: 0 }
    cur.n++
    cur.sum += t.amount
    byCat.set(t.categoryId!, cur)
    total += t.amount
  }
  const ranked = [...byCat.entries()].sort((a, b) => b[1].n - a[1].n)
  const [id, top] = ranked[0]
  const cat = c.catById.get(id)
  if (!cat) return []

  const countShare = top.n / recent.length
  const moneyShare = total > 0 ? top.sum / total : 0
  // Интересен именно перекос: операций много, а денег мало.
  if (countShare < 0.2 || moneyShare > countShare * 0.6) return []

  const perWeek = top.n / 13
  return [{
    id: 'freq',
    kind: 'cut',
    severity: 'info',
    title: т('{0}: {1} {2} за три месяца, а денег — {3}', сЗначкомъ(cat.icon, cat.name), top.n, plural(top.n, 'покупка', 'покупки', 'покупок'), pct(moneyShare * 100)),
    body:
      т('Это {0} всех ваших расходных операций и примерно {1} {2} в неделю ', pct(countShare * 100), perWeek.toFixed(1).replace('.', ','), plural(Math.round(perWeek), 'покупка', 'покупки', 'покупок')) +
      т('по {0}. Деньги здесь небольшие, а вот решений — больше, чем в любой другой категории: ', money(Math.round(top.sum / top.n))) +
      т('каждая такая покупка это ещё один повод достать карту. Обычно достаточно собрать их в один заход раз в неделю — ') +
      т('сумма меняется мало, а число мелких решений падает в разы.'),
    evidence: [
      т('Операций: {0} из {1}', top.n, recent.length),
      т('Денег: {0} из {1}', money(top.sum), money(total)),
      т('Средний чек: {0}', money(Math.round(top.sum / top.n))),
    ],
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: т('Показать операции'), type: 'goto', payload: { view: 'transactions', filter: 'cat:' + id } },
  }]
}

/** Подозрение на двойное списание: одинаковая сумма, категория и день. */
function ruleDuplicates(c: Ctx): Advice[] {
  const since = addMonths(today(), -3)
  const groups = new Map<string, Transaction[]>()
  for (const t of c.data.transactions) {
    if (t.kind !== 'expense' || t.date < since) continue
    if (t.amount < 50000) continue
    const key = `${t.date}|${t.categoryId ?? ''}|${t.amount}|${(t.note ?? '').trim().toLowerCase()}`
    const arr = groups.get(key) || []
    arr.push(t)
    groups.set(key, arr)
  }

  const dupes = [...groups.values()].filter((g) => g.length >= 2)
  if (!dupes.length) return []
  // Лишними считаем все копии, кроме одной в каждой группе.
  const extra = dupes.reduce((s, g) => s + g[0].amount * (g.length - 1), 0)
  if (extra < 100000) return []
  dupes.sort((a, b) => b[0].amount * (b.length - 1) - a[0].amount * (a.length - 1))
  const worst = dupes[0][0]

  return [{
    id: 'dupes',
    kind: 'budget',
    severity: extra > c.avgExpense * 0.03 ? 'warn' : 'info',
    title: т('{0} {1} одинаковых трат на {2}', dupes.length, plural(dupes.length, 'пара', 'пары', 'пар'), money(extra)),
    body:
      т('Совпали день, сумма, категория и комментарий. Так выглядит двойное списание банка, повторный импорт выписки ') +
      т('или дважды занесённая вручную операция. Иногда это правда — два одинаковых кофе бывают, — но проверить стоит: ') +
      т('лишние записи завышают и норму месяца, и прогноз, а банковский дубль ещё и возвращают по заявлению.'),
    evidence: dupes.slice(0, 4).map((g) => {
      const cat = c.catById.get(g[0].categoryId || '')
      return `${humanDate(g[0].date, true)} · ${cat?.name ?? т('без категории')} · ${money(g[0].amount)} × ${g.length}`
    }),
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: т('Открыть этот день'), type: 'goto', payload: { view: 'transactions', filter: 'day:' + worst.date } },
  }]
}
