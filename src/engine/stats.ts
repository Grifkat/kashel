import type { Account, Category, Money, Transaction, TxKind } from '../lib/types'
import { addDays, addMonths, diffDays, endOfMonth, endOfYear, iso, monthKey, monthRange, parseISO, startOfMonth, startOfWeek, startOfYear, today } from '../lib/date'

export interface Period {
  from: string
  to: string
  label: string
  kind: PeriodKind
  anchor: string
}

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'custom'

export function makePeriod(kind: PeriodKind, anchor: string, firstDay: 0 | 1 = 1, custom?: { from: string; to: string }): Period {
  switch (kind) {
    case 'day':
      return { kind, anchor, from: anchor, to: anchor, label: labelDay(anchor) }
    case 'week': {
      const from = startOfWeek(anchor, firstDay)
      const to = addDays(from, 6)
      return { kind, anchor, from, to, label: `${labelShort(from)} — ${labelShort(to)}` }
    }
    case 'year':
      return { kind, anchor, from: startOfYear(anchor), to: endOfYear(anchor), label: anchor.slice(0, 4) }
    case 'custom':
      return {
        kind, anchor,
        from: custom?.from || startOfMonth(anchor),
        to: custom?.to || endOfMonth(anchor),
        label: `${labelShort(custom?.from || anchor)} — ${labelShort(custom?.to || anchor)}`,
      }
    case 'month':
    default:
      return { kind: 'month', anchor, from: startOfMonth(anchor), to: endOfMonth(anchor), label: monthLabel(anchor) }
  }
}

export function shiftPeriod(p: Period, dir: -1 | 1, firstDay: 0 | 1 = 1): Period {
  switch (p.kind) {
    case 'day':
      return makePeriod('day', addDays(p.anchor, dir), firstDay)
    case 'week':
      return makePeriod('week', addDays(p.anchor, dir * 7), firstDay)
    case 'year':
      return makePeriod('year', `${Number(p.anchor.slice(0, 4)) + dir}-01-01`, firstDay)
    case 'custom': {
      const span = Math.max(1, Math.round((parseISO(p.to).getTime() - parseISO(p.from).getTime()) / 86400000) + 1)
      return makePeriod('custom', p.anchor, firstDay, { from: addDays(p.from, dir * span), to: addDays(p.to, dir * span) })
    }
    default:
      return makePeriod('month', addMonths(p.anchor, dir), firstDay)
  }
}

/**
 * Дата для новой записи, когда открыт этот период.
 *
 * Правило одно на все пять видов периода: сегодняшний день зажимается в
 * границы того, на что человек сейчас смотрит. В режиме «День» границы
 * сходятся в одну дату — берётся она. В диапазоне, куда сегодня попадает,
 * ничего не меняется. Пролистали в прошлое — берётся последний день
 * диапазона, в будущее — первый: всегда ближайшая к сегодня дата внутри
 * просматриваемого куска.
 *
 * Даты лежат как YYYY-MM-DD, поэтому сравнение строк здесь — это и есть
 * сравнение дат; границы периода уже сравниваются так же, см. inPeriod.
 */
export function entryDate(p: Period, now: string = today()): string {
  if (now < p.from) return p.from
  if (now > p.to) return p.to
  return now
}

import { MONTHS, MONTHS_GEN, MONTHS_SHORT } from '../lib/date'

const labelDay = (s: string) => {
  const d = parseISO(s)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`
}
const labelShort = (s: string) => {
  const d = parseISO(s)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}.`
}
const monthLabel = (s: string) => {
  const d = parseISO(s)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const inPeriod = (t: Transaction, p: Period) => t.date >= p.from && t.date <= p.to

/**
 * Прошлый такой же период — и та его часть, с которой честно сравнивать.
 *
 * Текущий месяц идёт неполным, поэтому сравнивать его целиком с прошлым
 * нельзя: пятого числа любой месяц «дешевле» предыдущего просто потому, что
 * ещё не прожит. Поэтому у прошлого периода берётся столько же дней с начала,
 * сколько прошло у нынешнего, и об этом честно сообщается флагом partial.
 */
export interface PrevPeriod {
  from: string
  to: string
  /** Подпись целого периода — «июль 2026», а не обрезанного куска. */
  label: string
  /** Сравниваем с куском прошлого периода, а не со всем целиком. */
  partial: boolean
  /** Сколько дней взято, когда partial. */
  days: number
}

export function comparablePrev(p: Period, firstDay: 0 | 1 = 1, now: string = today()): PrevPeriod {
  const prev = shiftPeriod(p, -1, firstDay)
  const whole = { from: prev.from, to: prev.to, label: prev.label, partial: false, days: diffDays(prev.from, prev.to) + 1 }
  // Период целиком в прошлом или ещё не начался — сравниваем как есть.
  if (now >= p.to || now < p.from) return whole
  const elapsed = diffDays(p.from, now) + 1
  const cut = addDays(prev.from, elapsed - 1)
  if (cut >= prev.to) return whole
  return { from: prev.from, to: cut, label: prev.label, partial: true, days: elapsed }
}

export const inRange = (t: Transaction, from: string, to: string) => t.date >= from && t.date <= to

// ------------------------------------------------------------- итоги года

export interface DayPoint {
  date: string
  expense: Money
  income: Money
  count: number
}

export interface YearSummary {
  year: string
  /** Последний день, по который есть смысл считать: у текущего года — сегодня. */
  through: string
  income: Money
  expense: Money
  net: Money
  /** Доля отложенного от дохода, в процентах. Без дохода — 0. */
  savingsRate: number
  count: number
  /** Средний расход в день по прожитым дням года. */
  perDay: Money
  /** Средний расход на одну расходную операцию. */
  perTx: Money
  daysLived: number
  daysWithoutSpending: number
  days: DayPoint[]
  months: MonthPoint[]
  topDay?: DayPoint
  topMonth?: MonthPoint
  leanMonth?: MonthPoint
  biggest?: Transaction
}

/**
 * Всё, что показывает экран «Итоги года», считается одним проходом:
 * год — это до нескольких тысяч операций, и гонять их семь раз незачем.
 */
export function yearSummary(txs: Transaction[], year: string, now: string = today()): YearSummary {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const through = now < to ? (now < from ? from : now) : to

  const days = new Map<string, DayPoint>()
  for (let d = from; d <= through; d = addDays(d, 1)) days.set(d, { date: d, expense: 0, income: 0, count: 0 })

  let income = 0
  let expense = 0
  let count = 0
  let expenseCount = 0
  let biggest: Transaction | undefined
  const inYear: Transaction[] = []

  for (const t of txs) {
    // Обрезаем по through, а не по концу года: сравнение с прошлым годом идёт
    // «по то же число», и суммы обязаны жить в тех же границах, что и дни.
    if (t.date < from || t.date > through) continue
    if (t.kind === 'transfer') continue
    inYear.push(t)
    count++
    const day = days.get(t.date)
    if (t.kind === 'income') {
      income += t.amount
      if (day) day.income += t.amount
    } else {
      expense += t.amount
      expenseCount++
      if (day) day.expense += t.amount
      if (!biggest || t.amount > biggest.amount) biggest = t
    }
    if (day) day.count++
  }

  const list = [...days.values()]
  const daysLived = list.length
  const spentDays = list.filter((d) => d.expense > 0)
  const topDay = spentDays.reduce<DayPoint | undefined>((best, d) => (!best || d.expense > best.expense ? d : best), undefined)

  const months = monthlySeries(inYear, from, to)
  const lived = months.filter((m) => m.key <= monthKey(through))
  const topMonth = lived.reduce<MonthPoint | undefined>((best, m) => (!best || m.expense > best.expense ? m : best), undefined)
  const leanMonth = lived
    .filter((m) => m.expense > 0)
    .reduce<MonthPoint | undefined>((best, m) => (!best || m.expense < best.expense ? m : best), undefined)

  return {
    year,
    through,
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
    count,
    perDay: daysLived > 0 ? Math.round(expense / daysLived) : 0,
    perTx: expenseCount > 0 ? Math.round(expense / expenseCount) : 0,
    daysLived,
    daysWithoutSpending: daysLived - spentDays.length,
    days: list,
    months,
    topDay,
    topMonth,
    leanMonth,
    biggest,
  }
}

/** Влияние операции на остаток конкретного счёта. */
export function accountDelta(t: Transaction, accountId: string): Money {
  if (t.kind === 'income') return t.accountId === accountId ? t.amount : 0
  if (t.kind === 'expense') return t.accountId === accountId ? -t.amount : 0
  if (t.accountId === accountId) return -t.amount
  if (t.toAccountId === accountId) return t.amount
  return 0
}

export function accountBalance(acc: Account, txs: Transaction[], upTo?: string): Money {
  let sum = acc.initialBalance
  for (const t of txs) {
    if (upTo && t.date > upTo) continue
    sum += accountDelta(t, acc.id)
  }
  return sum
}

export const isAsset = (a: Account) => a.type === 'cash' || a.type === 'card' || a.type === 'savings'
export const isLiability = (a: Account) => a.type === 'credit' || a.type === 'debt'

export interface Balances {
  byAccount: Map<string, Money>
  assets: Money
  liabilities: Money
  net: Money
}

/**
 * Итоги по счетам.
 *
 * Проектный счёт в суммы не входит: деньги на нём чужие, и чистый капитал,
 * куда они попали бы наравне с личными, врал бы ровно на их величину. Остаток
 * самого счёта при этом считается и кладётся в byAccount — карточка счёта и
 * сводка по проекту обязаны его показывать.
 */
export function balances(accounts: Account[], txs: Transaction[], upTo?: string): Balances {
  const byAccount = new Map<string, Money>()
  let assets = 0
  let liabilities = 0
  for (const a of accounts) {
    if (a.archived) continue
    const b = accountBalance(a, txs, upTo)
    byAccount.set(a.id, b)
    if (a.project) continue
    if (isAsset(a)) assets += b
    else liabilities += Math.min(0, b)
  }
  return { byAccount, assets, liabilities, net: assets + liabilities }
}

/** Остаток по кредиту: тело минус проведённые платежи (грубо, без амортизации). */
export function creditRemaining(acc: Account, txs: Transaction[]): Money {
  if (!acc.credit) return 0
  const paid = txs.filter((t) => t.debtId === acc.id).reduce((s, t) => s + t.amount, 0)
  return Math.max(0, acc.credit.principal - paid)
}

export interface CatTotal {
  categoryId: string
  amount: Money
  share: number
  count: number
}

/** Суммы по категориям с раскрытием разбитых чеков. */
export function categoryTotals(txs: Transaction[], kind: 'expense' | 'income'): CatTotal[] {
  const map = new Map<string, { amount: Money; count: number }>()
  const add = (id: string, amount: Money) => {
    const cur = map.get(id) || { amount: 0, count: 0 }
    cur.amount += amount
    cur.count += 1
    map.set(id, cur)
  }
  for (const t of txs) {
    if (t.kind !== kind) continue
    if (t.splits?.length) for (const s of t.splits) add(s.categoryId, s.amount)
    else if (t.categoryId) add(t.categoryId, t.amount)
    else add('__none__', t.amount)
  }
  const total = [...map.values()].reduce((s, v) => s + v.amount, 0) || 1
  return [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, amount: v.amount, count: v.count, share: v.amount / total }))
    .sort((a, b) => b.amount - a.amount)
}

export function sumOf(txs: Transaction[], kind: TxKind): Money {
  let s = 0
  for (const t of txs) if (t.kind === kind) s += t.amount
  return s
}

export function tagTotals(txs: Transaction[], kind: 'expense' | 'income'): { tag: string; amount: Money; count: number }[] {
  const map = new Map<string, { amount: Money; count: number }>()
  for (const t of txs) {
    if (t.kind !== kind) continue
    for (const tag of t.tags) {
      const cur = map.get(tag) || { amount: 0, count: 0 }
      cur.amount += t.amount
      cur.count++
      map.set(tag, cur)
    }
  }
  return [...map.entries()].map(([tag, v]) => ({ tag, ...v })).sort((a, b) => b.amount - a.amount)
}

export interface MonthPoint {
  key: string
  income: Money
  expense: Money
  net: Money
}

export function monthlySeries(txs: Transaction[], from: string, to: string): MonthPoint[] {
  const keys = monthRange(from, to)
  const map = new Map<string, MonthPoint>(keys.map((k) => [k, { key: k, income: 0, expense: 0, net: 0 }]))
  for (const t of txs) {
    const p = map.get(monthKey(t.date))
    if (!p) continue
    if (t.kind === 'income') p.income += t.amount
    else if (t.kind === 'expense') p.expense += t.amount
  }
  for (const p of map.values()) p.net = p.income - p.expense
  return keys.map((k) => map.get(k)!)
}

/**
 * Суммы по одной категории по месяцам — база для прогноза.
 *
 * Вид операции обязателен к проверке: иначе доход, которому по ошибке досталась
 * расходная категория, попадал бы в расходную статистику, прогноз и советы.
 */
export function categoryMonthly(
  txs: Transaction[],
  categoryId: string,
  keys: string[],
  excludeRecurring = false,
  kind?: 'expense' | 'income',
): Money[] {
  const map = new Map<string, Money>(keys.map((k) => [k, 0]))
  for (const t of txs) {
    if (excludeRecurring && t.recurringId) continue
    if (kind ? t.kind !== kind : t.kind === 'transfer') continue
    const mk = monthKey(t.date)
    if (!map.has(mk)) continue
    if (t.splits?.length) {
      for (const s of t.splits) if (s.categoryId === categoryId) map.set(mk, map.get(mk)! + s.amount)
    } else if (t.categoryId === categoryId) {
      map.set(mk, map.get(mk)! + t.amount)
    }
  }
  return keys.map((k) => map.get(k)!)
}

export function dailySeries(txs: Transaction[], from: string, to: string, kind: 'expense' | 'income'): { date: string; amount: Money }[] {
  const out: { date: string; amount: Money }[] = []
  const map = new Map<string, Money>()
  for (const t of txs) if (t.kind === kind) map.set(t.date, (map.get(t.date) || 0) + t.amount)
  let cur = from
  let guard = 0
  while (cur <= to && guard++ < 1200) {
    out.push({ date: cur, amount: map.get(cur) || 0 })
    cur = addDays(cur, 1)
  }
  return out
}

/** Кривая остатка активов по дням — для графика «куда идёт баланс». */
export function balanceTimeline(accounts: Account[], txs: Transaction[], from: string, to: string): { date: string; value: Money }[] {
  const assetIds = new Set(accounts.filter((a) => isAsset(a) && !a.archived).map((a) => a.id))
  let start = accounts.filter((a) => assetIds.has(a.id)).reduce((s, a) => s + a.initialBalance, 0)
  const deltas = new Map<string, Money>()
  for (const t of txs) {
    let d = 0
    for (const id of assetIds) d += accountDelta(t, id)
    if (!d) continue
    if (t.date < from) start += d
    else deltas.set(t.date, (deltas.get(t.date) || 0) + d)
  }
  const out: { date: string; value: Money }[] = []
  let cur = from
  let value = start
  let guard = 0
  while (cur <= to && guard++ < 1200) {
    value += deltas.get(cur) || 0
    out.push({ date: cur, value })
    cur = addDays(cur, 1)
  }
  return out
}

export const median = (arr: number[]): number => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

export const mean = (arr: number[]): number =>
  arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0

export const stdev = (arr: number[]): number => {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1))
}

/** Наклон линейной регрессии: сколько прибавляется за один шаг. */
export function trendSlope(arr: number[]): number {
  const n = arr.length
  if (n < 3) return 0
  const mx = (n - 1) / 2
  const my = mean(arr)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (arr[i] - my)
    den += (i - mx) ** 2
  }
  return den ? num / den : 0
}

export function buildCategoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]))
}

export const UNCATEGORIZED: Category = {
  id: '__none__', name: 'Без категории', kind: 'expense', icon: '❓', color: '#7c8794',
}
