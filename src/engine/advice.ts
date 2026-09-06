import type { Account, Category, Money, Transaction, VaultData } from '../lib/types'
import { addDays, addMonths, daysInMonth, diffDays, diffMonths, humanDate, monthKey, monthTitle, parseISO, today } from '../lib/date'
import { money, moneyShort, months as monthsWord, pct, plural, times } from '../lib/format'
import { balances, categoryMonthly, categoryTotals, creditRemaining, isAsset, mean, median, stdev, trendSlope } from './stats'
import { historyKeys, occurrencesInMonth, type ForecastResult } from './forecast'
import { личное } from './project'

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
  cut: 'Сократить траты',
  income: 'Увеличить доход',
  budget: 'Распределение бюджета',
  risk: 'Подушка и риски',
  debt: 'Долги и кредиты',
  goal: 'Цели',
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

/** Регулярные списания: сколько съедают и что из этого забыто. */
function ruleSubscriptions(c: Ctx): Advice[] {
  const subs = c.data.recurring.filter(
    (r) => r.active && r.kind === 'expense' &&
      (r.tags.includes('подписка') || c.catById.get(r.categoryId || '')?.name === 'Подписки'),
  )
  if (!subs.length) return []
  const monthly = subs.reduce((s, r) => s + r.amount * occurrencesInMonth(r, c.curKey), 0)
  if (monthly < 30000) return []

  // Подписка считается «забытой», если по ней нет ни одной операции с тегом
  // или комментарием за последние 3 месяца, кроме самого автосписания.
  const since = addMonths(today(), -3)
  const evidence = subs.map((r) => {
    const paid = c.data.transactions.filter((t) => t.recurringId === r.id && t.date >= since).length
    return `${r.title} — ${money(r.amount)}/мес${paid >= 3 ? '' : ', списаний за 3 мес: ' + paid}`
  })
  const suspicious = subs.filter((r) => diffMonths(r.startDate, today()) >= 6)
  const impact = Math.round(monthly * 0.4)

  return [{
    id: 'subs',
    kind: 'cut',
    severity: monthly > c.avgExpense * 0.04 ? 'warn' : 'info',
    title: `Подписки съедают ${money(monthly)} в месяц`,
    body:
      `За год это ${money(monthly * 12)}. Подписок активно: ${subs.length}. ` +
      (suspicious.length
        ? `Из них ${suspicious.length} тянутся дольше полугода — как правило, половину таких перестают использовать через 2–3 месяца после подключения. `
        : '') +
      `Пройдитесь по списку и отключите то, чем не пользовались последний месяц. Оценка эффекта — отказ от 40% списка.`,
    evidence,
    impactMonthly: impact,
    effort: 'низкое',
    action: { label: 'Сценарий: минус половина подписок', type: 'scenario', payload: { categoryName: 'Подписки', factor: 0.5 } },
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
      title: `${cat.icon} ${cat.name}: идёт на ${pct((over / norm) * 100)} выше обычного`,
      body:
        `Потрачено ${money(t.amount)} за ${Math.round(c.monthProgress * 100)}% месяца. ` +
        `При таком темпе выйдет ${money(projected)} против обычных ${money(norm)} — ` +
        `это ${money(over)} сверху. Достаточно вернуться к своей же норме, отдельных усилий не требуется.`,
      evidence: [
        `Медиана за ${c.keys.length} мес: ${money(norm)}`,
        `Операций в этом месяце: ${t.count}`,
        `Максимум за историю: ${money(Math.max(...hist))}`,
      ],
      impactMonthly: over,
      effort: 'низкое',
      action: { label: `Вернуть ${cat.name} к норме`, type: 'scenario', payload: { categoryId: cat.id, factor: norm / projected } },
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
      title: `${cat.icon} ${cat.name}: ${Math.round(perMonth)} мелких покупок в месяц`,
      body:
        `Средний чек ${money(Math.round(avg))}, в сумме ${money(monthly)} в месяц и ${money(monthly * 12)} в год. ` +
        `По одной трате это незаметно — заметно становится в годовом масштабе. ` +
        `Урезать вдвое обычно проще, чем отказаться совсем: оставьте ${Math.round(perMonth / 2)} ${plural(Math.round(perMonth / 2), 'покупку', 'покупки', 'покупок')} в месяц.`,
      evidence: [
        `Операций за 3 месяца: ${amounts.length}`,
        `Самая крупная: ${money(Math.max(...amounts))}`,
        `Минус половина = ${money(Math.round(monthly / 2))} в месяц`,
      ],
      impactMonthly: Math.round(monthly / 2),
      effort: 'среднее',
      action: { label: 'Сценарий: минус 50%', type: 'scenario', payload: { categoryId: id, factor: 0.5 } },
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
    title: `${top.length} ${plural(top.length, 'нетипично крупная трата', 'нетипично крупные траты', 'нетипично крупных трат')} за 2 месяца`,
    body:
      `Суммарно ${money(sum)}. Это не обязательно ошибка — но такие операции стоит один раз пересмотреть: ` +
      `часть из них разовые и не должна попадать в расчёт «обычного месяца», а часть означает, что появилась новая регулярная статья.`,
    evidence: top.map(
      (f) =>
        `${f.t.date.slice(8)}.${f.t.date.slice(5, 7)} ${c.catById.get(f.t.categoryId!)?.name}: ${money(f.t.amount)} при обычных ${money(f.norm)}${f.t.note ? ' — ' + f.t.note : ''}`,
    ),
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: 'Открыть операции', type: 'goto', payload: { view: 'transactions' } },
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
    title: `Лимиты будут превышены в ${bad.length} ${plural(bad.length, 'категории', 'категориях', 'категориях')}`,
    body:
      `Суммарный перерасход к концу месяца — ${money(overSum)}. ` +
      `Либо лимит нереалистичен и его надо поднять, либо темп трат надо снизить: ` +
      `на оставшуюся часть месяца в этих категориях доступно ${money(Math.max(0, bad.reduce((s, b) => s + Math.max(0, b.plan - b.spent), 0)))}.`,
    evidence: bad
      .slice(0, 6)
      .map((b) => `${b.cat.icon} ${b.cat.name}: ${money(b.spent)} из ${money(b.plan)} → прогноз ${money(b.projected)}`),
    impactMonthly: overSum,
    effort: 'среднее',
    action: { label: 'Открыть бюджет', type: 'goto', payload: { view: 'budget' } },
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
    title: `${missing.length} крупных категорий живут без лимита`,
    body:
      `Пока у категории нет плановой суммы, перерасход в ней невозможно заметить вовремя — он виден только постфактум. ` +
      `Разумная отправная точка — медиана за последние месяцы, округлённая вверх. Кошель может проставить такие лимиты сам.`,
    evidence: missing.map((x) => {
      const hist = categoryMonthly(c.data.transactions, x.t.categoryId, c.keys).filter((v) => v > 0)
      return `${x.cat!.icon} ${x.cat!.name}: ${money(Math.round(x.t.amount / 3))}/мес → предложить лимит ${money(Math.ceil(median(hist) / 50000) * 50000)}`
    }),
    impactMonthly: 0,
    effort: 'низкое',
    action: {
      label: 'Проставить лимиты по медиане',
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
      title: `Норма сбережений ${pct(rate, 1)} — выше цели`,
      body:
        `Из ${money(c.avgIncome)} среднего дохода остаётся ${money(c.fc.avgNet)} в месяц. ` +
        `Цель профиля — ${pct(target)}. Излишек имеет смысл не держать на текущем счёте, а распределять по целям: ` +
        `иначе он растворяется в тратах в течение двух-трёх месяцев.`,
      evidence: [`Средний доход: ${money(c.avgIncome)}`, `Средний расход: ${money(c.avgExpense)}`],
      impactMonthly: 0,
      effort: 'низкое',
      action: { label: 'Открыть цели', type: 'goto', payload: { view: 'goals' } },
    }]
  }

  return [{
    id: 'savings_rate',
    kind: 'budget',
    severity: rate < 0 ? 'alert' : rate < target / 2 ? 'warn' : 'info',
    title:
      rate < 0
        ? `Расходы обгоняют доходы: норма сбережений ${pct(rate, 1)}`
        : `Норма сбережений ${pct(rate, 1)} против цели ${pct(target)}`,
    body:
      `Средний доход ${money(c.avgIncome)}, средний расход ${money(c.avgExpense)}, остаётся ${money(c.fc.avgNet)} в месяц. ` +
      `Чтобы выйти на цель, нужно найти ${money(gap)} в месяц — это ${pct((gap / c.avgExpense) * 100, 1)} текущих расходов. ` +
      `Проще всего взять их из необязательных категорий, а не резать всё подряд на равный процент.`,
    evidence: [
      `Нужно в месяц: ${money(gap)}`,
      `За год это ${money(gap * 12)}`,
      `Расходы «хочу»: ${money(bucketSum(c, 'wants'))} в месяц`,
    ],
    impactMonthly: gap,
    effort: 'среднее',
    action: { label: 'Собрать сценарий экономии', type: 'scenario', payload: { auto: 'save', target: gap } },
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
      title: `Подушка закрывает ${cover.toFixed(1).replace('.', ',')} ${plural(Math.round(cover), 'месяц', 'месяца', 'месяцев')} расходов`,
      body: `Цель профиля — ${monthsWord(target)}. Запас есть; излишек сверх ${monthsWord(target + 1)} логично переложить под процент, иначе инфляция ${pct(c.data.settings.profile.inflationPct)} съедает его молча.`,
      evidence: [`Активы: ${money(c.assets)}`, `Средний расход: ${money(c.avgExpense)}`],
      impactMonthly: 0,
      effort: 'низкое',
    }]
  }

  return [{
    id: 'fund',
    kind: 'risk',
    severity: cover < 1 ? 'alert' : cover < target / 2 ? 'warn' : 'info',
    title: `Подушки хватит на ${cover.toFixed(1).replace('.', ',')} ${plural(Math.round(cover) || 1, 'месяц', 'месяца', 'месяцев')}`,
    body:
      `При среднем расходе ${money(c.avgExpense)} до цели в ${monthsWord(target)} не хватает ${money(need)}. ` +
      (perMonth
        ? `При нынешнем свободном остатке ${money(c.fc.avgNet)} в месяц цель закрывается за ${monthsWord(perMonth)}. `
        : `Свободных денег сейчас нет — сначала нужно вывести месяц в плюс. `) +
      `Держать подушку лучше отдельно от текущего счёта, иначе она тратится незаметно.`,
    evidence: [
      `Активы: ${money(c.assets)}`,
      `Цель: ${money(Math.round(target * c.avgExpense))}`,
      `Не хватает: ${money(need)}`,
    ],
    impactMonthly: 0,
    effort: 'среднее',
    action: { label: 'Открыть цели', type: 'goto', payload: { view: 'goals' } },
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
        ? `Прогноз уходит в минус: ${when}`
        : `Риск уйти в минус за год — ${pct(risk * 100)}`,
    body:
      `Из ${c.data.settings.monteCarloRuns} симуляций ${Math.round(risk * 100)}% заканчиваются отрицательным остатком хотя бы в одном месяце. ` +
      (when
        ? `Медианный сценарий пробивает ноль в ${when.toLowerCase()}. `
        : `Медианный сценарий держится в плюсе, но запас невелик. `) +
      `Это считается по вашей же истории: разброс берётся из фактических отклонений месяц к месяцу, а не из абстрактных процентов.`,
    evidence: [
      `Остаток сейчас: ${money(c.fc.startBalance)}`,
      `Средний результат месяца: ${money(c.fc.avgNet, { sign: true })}`,
      c.fc.months.length ? `Через год (медиана): ${money(c.fc.months[c.fc.months.length - 1].p50)}` : '',
    ].filter(Boolean),
    impactMonthly: 0,
    effort: 'высокое',
    action: { label: 'Открыть прогноз', type: 'goto', payload: { view: 'forecast' } },
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
    title: `Раскладка 50/30/20: сейчас ${Math.round(shares.needs)}/${Math.round(shares.wants)}/${Math.round(shares.savings)}`,
    body:
      `«Надо» — ${money(needs)}, «хочу» — ${money(wants)}, остаётся ${money(savings)}. ` +
      (wantsOver > 0
        ? `Необязательные траты превышают ориентир на ${money(wantsOver)} в месяц. Перенос этой суммы в накопления даёт ${money(wantsOver * 12)} за год. `
        : `Необязательные траты в пределах ориентира. `) +
      `Пропорция условна: при доходе выше среднего доля «надо» естественно ниже, и это нормально.`,
    evidence: [
      `Надо: ${money(needs)} (${pct(shares.needs)})`,
      `Хочу: ${money(wants)} (${pct(shares.wants)})`,
      `Остаётся: ${money(savings)} (${pct(shares.savings)})`,
    ],
    impactMonthly: Math.max(0, wantsOver),
    effort: 'среднее',
    action: { label: 'Открыть бюджет', type: 'goto', payload: { view: 'budget' } },
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
    title: `${pct(share * 100)} дохода даёт один источник — ${cat.name}`,
    body:
      `За полгода «${cat.name}» принёс ${money(top.amount)} из ${money(sum)}. ` +
      `Если этот канал остановится, доход упадёт на ${money(lostMonthly)} в месяц, а запаса хватит на ${coverMonths.toFixed(1).replace('.', ',')} ${plural(Math.round(coverMonths) || 1, 'месяц', 'месяца', 'месяцев')}. ` +
      `Второй источник не обязан быть большим: даже 20–25% дохода из другого канала снимают основную часть риска. ` +
      `Практический ориентир — довести второй канал до ${money(Math.round(sum / 6 * 0.25))} в месяц.`,
    evidence: totals
      .slice(0, 4)
      .map((t) => `${c.catById.get(t.categoryId)?.name ?? '—'}: ${money(Math.round(t.amount / 6))}/мес (${pct((t.amount / sum) * 100)})`),
    impactMonthly: 0,
    effort: 'высокое',
    action: { label: 'Сценарий: рост дохода на 20%', type: 'scenario', payload: { incomeFactor: 1.2 } },
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
    title: `Доход скачет: разброс ${pct(cv * 100)} от среднего`,
    body:
      `Средний месяц — ${money(Math.round(m))}, худший за историю — ${money(worst)}. ` +
      `Для нестабильного дохода обычный совет «откладывать фиксированную сумму» работает плохо: ` +
      `надёжнее откладывать процент от каждого поступления и держать отдельный буфер на слабый месяц. ` +
      (buffer > 0
        ? `Буфер, закрывающий провал до среднего расхода, — ${money(buffer)}.`
        : `Даже худший месяц покрывал расходы — буфер уже фактически есть.`),
    evidence: [
      `Среднее: ${money(Math.round(m))}`,
      `Стандартное отклонение: ${money(Math.round(sd))}`,
      `Минимум: ${money(worst)}, максимум: ${money(Math.max(...series))}`,
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
      title: `Доход растёт на ${pct(yearlyPct, 1)} в год — быстрее инфляции`,
      body:
        `Тренд по последним ${monthsWord(series.length)} даёт +${money(Math.round(slope))} к месячному доходу каждый месяц. ` +
        `С поправкой на инфляцию ${pct(infl)} реальный рост — ${pct(real, 1)}. Главное теперь, чтобы расходы не росли тем же темпом.`,
      evidence: [`Первый месяц: ${money(series[0])}`, `Последний: ${money(series[series.length - 1])}`],
      impactMonthly: 0,
      effort: 'низкое',
    }]
  }

  const needed = Math.round((m * infl) / 100 / 12)
  return [{
    id: 'income_trend',
    kind: 'income',
    severity: yearlyPct < -5 ? 'warn' : 'info',
    title: `Доход отстаёт от инфляции на ${pct(Math.abs(real), 1)} в год`,
    body:
      `Тренд дохода — ${pct(yearlyPct, 1)} в год при инфляции ${pct(infl)}. В реальных деньгах вы беднеете, даже если номинально всё стабильно. ` +
      `Чтобы просто удержать уровень, доход должен прибавлять около ${money(needed)} в месяц ежемесячно. ` +
      `Самый дешёвый по усилиям шаг — индексация цен постоянным заказчикам: рост чека на ${pct(infl)} обычно не приводит к потере клиентов, а даёт ${money(Math.round((m * infl) / 100))} в месяц.`,
    evidence: [
      `Средний доход: ${money(Math.round(m))}`,
      `Изменение: ${money(Math.round(slope), { sign: true })} в месяц`,
      `Эффект индексации на ${pct(infl)}: ${money(Math.round((m * infl) / 100))}/мес`,
    ],
    impactMonthly: Math.round((m * infl) / 100),
    effort: 'среднее',
    action: { label: `Сценарий: +${pct(infl)} к доходу`, type: 'scenario', payload: { incomeFactor: 1 + infl / 100 } },
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
    title: `${money(idle)} лежит без дела на текущих счетах`,
    body:
      `Полтора месяца расходов держать под рукой разумно, остальное — нет. ` +
      `Под ${pct(rate)} годовых эти деньги приносили бы ${money(yearly)} в год или ${money(Math.round(yearly / 12))} в месяц — ` +
      `без каких-либо усилий с вашей стороны. Инфляция ${pct(c.data.settings.profile.inflationPct)} при этом обесценивает лежащий остаток на ${money(Math.round((idle * c.data.settings.profile.inflationPct) / 100))} в год.`,
    evidence: [
      `На текущих счетах: ${money(c.liquid)}`,
      `Оперативный запас (1,5 расхода): ${money(Math.round(c.avgExpense * 1.5))}`,
      `Свободно: ${money(idle)}`,
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
      title: `${acc.name}: остаток ${money(left)} под ${pct(cr.ratePct, 1)}`,
      body:
        `Платёж ${money(cr.monthlyPayment)} в месяц, осталось примерно ${monthsWord(monthsLeft)}, переплата вперёд — около ${money(interestLeft)}. ` +
        (cr.ratePct > depositRate
          ? `Ставка выше доходности вклада (${pct(depositRate)}), поэтому свободные деньги выгоднее направлять сюда, а не на накопления: каждый рубль здесь «зарабатывает» ${pct(cr.ratePct, 1)} гарантированно. `
          : `Ставка ниже доходности вклада (${pct(depositRate)}) — досрочно гасить невыгодно, деньги лучше работают на накоплениях. `) +
        (extra > 0
          ? `Досрочный платёж ${money(extra)} в месяц сокращает срок до ${monthsWord(savedMonths)} и экономит около ${money(savedInterest)}.`
          : `Свободных денег на досрочное погашение сейчас нет.`),
      evidence: [
        `Тело кредита: ${money(cr.principal)}`,
        `Выплачено: ${money(cr.principal - left)}`,
        `Платёж: ${money(cr.monthlyPayment)} до ${cr.paymentDay} числа`,
      ],
      impactMonthly: cr.ratePct > depositRate ? Math.round((left * (cr.ratePct - depositRate)) / 100 / 12) : 0,
      effort: 'среднее',
      action: { label: 'Открыть долги', type: 'goto', payload: { view: 'debts' } },
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
          ? `Долг ${d.counterparty}: ${money(amount)}`
          : `${d.counterparty} должен вам ${money(amount)}`,
      body:
        (d.dueDate
          ? overdue > 0
            ? `Срок прошёл ${Math.abs(overdue)} ${plural(Math.abs(overdue), 'день', 'дня', 'дней')} назад. `
            : `Срок — ${d.dueDate}, осталось ${Math.abs(overdue)} ${plural(Math.abs(overdue), 'день', 'дня', 'дней')}. `
          : 'Срок не задан — такие долги обычно и повисают. ') +
        (d.direction === 'i_owe'
          ? `Беспроцентный долг человеку стоит гасить не первым по деньгам, но первым по срокам: репутационная цена просрочки выше процентной.`
          : `Деньги, которые вам должны, не участвуют в обороте и не приносят процент. При ставке вклада ${pct(c.data.settings.profile.depositRatePct)} это ${money(Math.round((amount * c.data.settings.profile.depositRatePct) / 100 / 12))} упущенной выгоды в месяц.`),
      evidence: [`Сумма: ${money(amount)}`, d.dueDate ? `Срок: ${d.dueDate}` : 'Срок не задан'],
      impactMonthly: 0,
      effort: 'низкое',
      action: { label: 'Открыть долги', type: 'goto', payload: { view: 'debts' } },
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
      ? `Цели укладываются в свободные деньги`
      : `Цели требуют ${money(totalNeed)} в месяц, свободно ${money(Math.max(0, free))}`,
    body:
      (feasible
        ? `Суммарно цели требуют ${money(totalNeed)} в месяц при свободных ${money(free)}. Запас — ${money(free - totalNeed)}. `
        : `Не хватает ${money(totalNeed - Math.max(0, free))} в месяц. Одновременно двигать все цели не выйдет — придётся либо сдвинуть сроки, либо расставить приоритеты. `) +
      `Практика: цель с ближайшим сроком закрывается первой, остальные ставятся на паузу — так закрывается хотя бы одна, а не все понемногу.`,
    evidence: rows.map(
      (r) =>
        `${r.g.icon} ${r.g.name}: ${money(r.saved)} из ${money(r.g.targetAmount)}` +
        (r.need ? ` → ${money(r.need)}/мес на ${monthsWord(r.monthsLeft!)}` : ' (без срока)'),
    ),
    impactMonthly: 0,
    effort: 'среднее',
    action: { label: 'Открыть цели', type: 'goto', payload: { view: 'goals' } },
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
        ? `До зарплаты ${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}, денег хватит на ${Math.floor(c.liquid / Math.max(1, dailyBurn))}`
        : `Запас до зарплаты в обрез`,
    body:
      `На текущих счетах ${money(c.liquid)}, привычный темп трат — ${money(dailyBurn)} в день. ` +
      `До ${payday} числа нужно ${money(need)}. ` +
      (c.liquid < need
        ? `Не хватает ${money(need - c.liquid)}: имеет смысл заранее решить, откуда они возьмутся, а не в последние два дня.`
        : `Запас есть, но небольшой — крупные покупки лучше отложить на после зарплаты.`),
    evidence: [
      `Остаток: ${money(c.liquid)}`,
      `Темп трат: ${money(dailyBurn)} в день`,
      `Дней до ${payday} числа: ${daysLeft}`,
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
    title: `${pct(share)} расходов зафиксировано обязательствами`,
    body:
      `${money(fixed)} из ${money(c.avgExpense)} уходит по регулярным платежам. ` +
      `Чем выше эта доля, тем меньше можно ужаться в плохой месяц: сокращать придётся не «лишнее», а обязательное, что почти всегда означает штрафы и просрочки. ` +
      `Здоровый ориентир — не больше половины расходов.`,
    evidence: c.data.recurring
      .filter((r) => r.active && r.kind === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((r) => `${r.title}: ${money(r.amount)}/мес`),
    impactMonthly: 0,
    effort: 'высокое',
    action: { label: 'Открыть регулярные', type: 'goto', payload: { view: 'recurring' } },
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
    title: `${bad.length} ${plural(bad.length, 'операция', 'операции', 'операций')} без категории на ${money(sum)}`,
    body:
      `Это ${pct((bad.length / recent.length) * 100)} операций за три месяца. Пока они не разобраны, ` +
      `и прогноз, и советы считают по неполной картине — любые выводы про «где течёт» будут смещены.`,
    evidence: [`Сумма без категории: ${money(sum)}`, `В среднем: ${money(Math.round(sum / 3))}/мес`],
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: 'Показать их', type: 'goto', payload: { view: 'transactions', filter: 'uncategorized' } },
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
    title: `В выходные вы тратите в ${(perWend / perWday).toFixed(1).replace('.', ',')} раза больше`,
    body:
      `В будний день на необязательные категории уходит ${money(Math.round(perWday))}, в выходной — ${money(Math.round(perWend))}. ` +
      `Разница за месяц — примерно ${money(monthlyDiff)}. Это не повод сидеть дома: обычно достаточно заранее решить сумму на выходные, ` +
      `потому что перерасход здесь берётся из «раз уж вышли», а не из конкретной крупной траты.`,
    evidence: [
      `Выходные: ${money(weekend)} за 3 месяца`,
      `Будни: ${money(weekday)} за 3 месяца`,
      `Половина разницы = ${money(Math.round(monthlyDiff / 2))}/мес`,
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
    title: `Самая длинная серия — ${best} ${plural(best, 'день', 'дня', 'дней')} подряд с тратами`,
    body:
      `За три месяца набралось ${free} ${plural(free, 'день', 'дня', 'дней')} без единой траты — это ` +
      `${freePerMonth.toFixed(1).replace('.', ',')} в месяц. ` +
      `Ежедневные покупки почти всегда мелкие и почти никогда не запоминаются, поэтому в отчёте их не видно, ` +
      `а в сумме они и есть разница между «нормальным» и «дорогим» месяцем. ` +
      `Приём простой: назначить два дня в неделю, когда деньги не тратятся вообще — не ограничивая суммы в остальные.`,
    evidence: [
      `Серия закончилась ${bestEnd ? humanDate(bestEnd, true) : '—'}`,
      `Дней с тратами: ${days.size} из ${span}`,
      `Медиана необязательных трат в такой день: ${money(Math.round(perDay))}`,
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
    peaks.push({ name: cat?.name ?? 'Без категории', icon: cat?.icon ?? '❓', extra: add, k })
  }
  if (extra < 300000 || !peaks.length) return []
  peaks.sort((a, b) => b.extra - a.extra)

  const share = c.avgExpense > 0 ? (extra / c.avgExpense) * 100 : 0
  return [{
    id: 'season',
    kind: 'budget',
    severity: share > 15 ? 'warn' : 'info',
    title: `${monthTitle(nextKey)} у вас обычно дороже на ${money(extra)}`,
    body:
      `По истории за ${c.keys.length} ${plural(c.keys.length, 'месяц', 'месяца', 'месяцев')} этот месяц выходит примерно ` +
      `на ${pct(share)} тяжелее обычного. Это не повод сокращать траты — это повод отложить ${money(extra)} заранее, ` +
      `пока месяц не начался: сезонные пики опасны не размером, а тем, что приходят в тот момент, когда деньги уже распределены.`,
    evidence: peaks.slice(0, 4).map(
      (x) => `${x.icon} ${x.name}: +${money(x.extra)} (×${x.k.toFixed(2).replace('.', ',')})`,
    ),
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: 'Посмотреть прогноз', type: 'goto', payload: { view: 'forecast' } },
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
      ? `Год назад в это время было ${top.length} ${plural(top.length, 'крупная трата', 'крупные траты', 'крупных трат')} на ${money(sum)}`
      : `Год назад в это время была крупная трата на ${money(sum)}`,
    body:
      `Такие расходы приходят раз в год и потому не попадают ни в регулярные платежи, ни в привычную норму месяца. ` +
      `Если они повторятся, лучше знать об этом заранее: ${money(sum)} — это ${pct(c.avgExpense > 0 ? (sum / c.avgExpense) * 100 : 0)} обычного месяца. ` +
      `Что не повторится — просто пропустите.`,
    evidence: top.map((f) => {
      const cat = c.catById.get(f.t.categoryId || '')
      return `${cat?.icon ?? '❓'} ${f.t.note || cat?.name || 'без категории'} — ${money(f.t.amount)}, ${humanDate(f.t.date, true)}`
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
        ? `${cat.icon} ${cat.name} подорожала: чек вырос на ${pct(((avgNew - avgOld) / avgOld) * 100)}`
        : `${cat.icon} ${cat.name}: покупок стало больше на ${pct(((v.newN - v.oldN) / v.oldN) * 100)}`,
      body:
        `За последние три месяца ушло ${money(v.newSum)} против ${money(v.oldSum)} тремя месяцами раньше — ` +
        `рост ${money(growth)}. Из него ${money(Math.abs(priceEffect))} дала цена и ${money(Math.abs(volumeEffect))} — количество покупок. ` +
        (priceLed
          ? `Дорожает сама покупка, а не аппетит: урезать здесь нечего, но можно менять места и формат — цена в этой категории у вас растёт быстрее, чем вы этого хотите.`
          : `Цена почти не изменилась, изменилась частота: вернуть прежний ритм покупок — самый прямой способ вернуть и сумму.`),
      evidence: [
        `Средний чек: ${money(Math.round(avgOld))} → ${money(Math.round(avgNew))}`,
        `Покупок за 3 месяца: ${v.oldN} → ${v.newN}`,
        `Вклад цены ${money(priceEffect)}, вклад количества ${money(volumeEffect)}`,
      ],
      // Управляемая часть — только объём, и то не целиком.
      impactMonthly: volumeEffect > 0 ? Math.round(volumeEffect / 3) : 0,
      effort: priceLed ? 'высокое' : 'среднее',
      action: volumeEffect > 0
        ? { label: `Вернуть прежний ритм ${cat.name}`, type: 'scenario', payload: { categoryId: id, factor: v.oldSum / v.newSum } }
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
      title: `${cat.icon} ${cat.name} появилась ${monthsWord(age)} назад и уже в топ-5 расходов`,
      body:
        `С ${humanDate(first, true)} по этой категории прошло ${t.count} ${plural(t.count, 'операция', 'операции', 'операций')} на ${money(t.amount)}, ` +
        `в среднем ${money(monthly)} в месяц — это ${pct(t.share * 100)} всех расходов за три месяца. ` +
        `Новая статья ещё не стала привычкой, и сейчас самый дешёвый момент решить, нужна ли она в таком объёме. ` +
        `Заодно стоит поставить ей лимит: старые категории у вас нормируются историей, а у этой истории пока нет.`,
      evidence: [
        `Первая операция: ${humanDate(first, true)}`,
        `Средний чек: ${money(Math.round(t.amount / Math.max(1, t.count)))}`,
        `В год такими темпами: ${money(monthly * 12)}`,
      ],
      impactMonthly: 0,
      effort: 'низкое',
      action: { label: 'Поставить лимит', type: 'plan', payload: { categoryIds: [cat.id] } },
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
      title: `${cat.icon} ${cat.name}: ${monthsWord(gap)} без единой траты`,
      body:
        `Раньше сюда уходило около ${money(norm)} в месяц, последняя операция — ${humanDate(last, true)}. ` +
        (cat.plan
          ? `При этом лимит ${money(cat.plan)} всё ещё занимает место в бюджете и портит раскладку: бюджет считает эти деньги занятыми. `
          : `Освободившиеся ${money(norm)} в месяц никуда не делись — если они не переехали в другую категорию, значит просто растворились в общих тратах. `) +
        `Либо категорию пора архивировать, либо траты по ней перестали попадать в учёт.`,
      evidence: [
        `Последняя операция: ${humanDate(last, true)}`,
        `Обычно было: ${money(norm)}/мес`,
        cat.plan ? `Лимит: ${money(cat.plan)}` : `Операций за всю историю: ${own.length}`,
      ],
      impactMonthly: 0,
      effort: 'низкое',
      action: { label: 'Открыть категории', type: 'goto', payload: { view: 'categories' } },
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
    title: `${cat.icon} ${cat.name}: ${top.n} ${plural(top.n, 'покупка', 'покупки', 'покупок')} за три месяца, а денег — ${pct(moneyShare * 100)}`,
    body:
      `Это ${pct(countShare * 100)} всех ваших расходных операций и примерно ${perWeek.toFixed(1).replace('.', ',')} ${plural(Math.round(perWeek), 'покупка', 'покупки', 'покупок')} в неделю ` +
      `по ${money(Math.round(top.sum / top.n))}. Деньги здесь небольшие, а вот решений — больше, чем в любой другой категории: ` +
      `каждая такая покупка это ещё один повод достать карту. Обычно достаточно собрать их в один заход раз в неделю — ` +
      `сумма меняется мало, а число мелких решений падает в разы.`,
    evidence: [
      `Операций: ${top.n} из ${recent.length}`,
      `Денег: ${money(top.sum)} из ${money(total)}`,
      `Средний чек: ${money(Math.round(top.sum / top.n))}`,
    ],
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: 'Показать операции', type: 'goto', payload: { view: 'transactions', filter: 'cat:' + id } },
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
    title: `${dupes.length} ${plural(dupes.length, 'пара', 'пары', 'пар')} одинаковых трат на ${money(extra)}`,
    body:
      `Совпали день, сумма, категория и комментарий. Так выглядит двойное списание банка, повторный импорт выписки ` +
      `или дважды занесённая вручную операция. Иногда это правда — два одинаковых кофе бывают, — но проверить стоит: ` +
      `лишние записи завышают и норму месяца, и прогноз, а банковский дубль ещё и возвращают по заявлению.`,
    evidence: dupes.slice(0, 4).map((g) => {
      const cat = c.catById.get(g[0].categoryId || '')
      return `${humanDate(g[0].date, true)} · ${cat?.name ?? 'без категории'} · ${money(g[0].amount)} × ${g.length}`
    }),
    impactMonthly: 0,
    effort: 'низкое',
    action: { label: 'Открыть этот день', type: 'goto', payload: { view: 'transactions', filter: 'day:' + worst.date } },
  }]
}
