import type { Category, Money, Transaction, VaultData } from '../lib/types'
import { addDays, addMonths, monthKey, monthRange, monthTitle, startOfMonth, today } from '../lib/date'
import { categoryTotals, monthlySeries, tagTotals } from './stats'

// Живой запрос — простой список «ключ: значение». Намеренно без выражений:
// блок должен читаться глазами в обычном markdown-файле.
//
//   type: chart          sum | table | chart | list
//   chart: donut         donut | line | bar
//   kind: expense        expense | income | transfer
//   period: 6m           6m | 30d | month | year | 2026-07 | 2026-01..2026-06
//   group: category      category | month | tag | account
//   category: Кафе, Дом
//   tag: работа
//   account: Основной
//   limit: 10

export interface QuerySpec {
  type: 'sum' | 'table' | 'chart' | 'list'
  chart: 'donut' | 'line' | 'bar'
  kind?: 'expense' | 'income' | 'transfer'
  from: string
  to: string
  periodLabel: string
  group: 'category' | 'month' | 'tag' | 'account'
  categories: string[]
  tags: string[]
  accounts: string[]
  limit: number
}

export type QueryResult =
  | { type: 'sum'; value: Money; count: number; spec: QuerySpec }
  | { type: 'table' | 'list'; rows: Transaction[]; spec: QuerySpec }
  | {
      type: 'chart'
      chart: 'donut' | 'line' | 'bar'
      slices: { label: string; value: Money; color: string; share: number }[]
      series: { key: string; label: string; income: Money; expense: Money }[]
      spec: QuerySpec
    }
  | { type: 'error'; message: string }

function parsePeriod(raw: string | undefined): { from: string; to: string; label: string } {
  const now = today()
  if (!raw) return { from: addMonths(now, -6), to: now, label: 'за 6 месяцев' }
  const v = raw.trim().toLowerCase()

  const rel = v.match(/^(\d+)\s*([mдdм])/)
  if (rel) {
    const n = Number(rel[1])
    const unit = rel[2]
    if (unit === 'd' || unit === 'д') return { from: addDays(now, -n), to: now, label: `за ${n} дн.` }
    return { from: addMonths(now, -n), to: now, label: `за ${n} мес.` }
  }
  if (v === 'month' || v === 'месяц') return { from: startOfMonth(now), to: now, label: monthTitle(monthKey(now)) }
  if (v === 'year' || v === 'год') return { from: now.slice(0, 4) + '-01-01', to: now, label: now.slice(0, 4) }
  if (v === 'all' || v === 'всё' || v === 'все') return { from: '1900-01-01', to: now, label: 'за всё время' }

  const range = v.match(/^(\d{4}-\d{2}(?:-\d{2})?)\s*\.\.\s*(\d{4}-\d{2}(?:-\d{2})?)$/)
  if (range) {
    const from = range[1].length === 7 ? range[1] + '-01' : range[1]
    const to = range[2].length === 7 ? lastDay(range[2]) : range[2]
    return { from, to, label: `${range[1]} — ${range[2]}` }
  }
  if (/^\d{4}-\d{2}$/.test(v)) return { from: v + '-01', to: lastDay(v), label: monthTitle(v) }
  if (/^\d{4}$/.test(v)) return { from: v + '-01-01', to: v + '-12-31', label: v }
  return { from: addMonths(now, -6), to: now, label: 'за 6 месяцев' }
}

function lastDay(mk: string): string {
  const [y, m] = mk.split('-').map(Number)
  return `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)

export function parseQuery(text: string): QuerySpec {
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([\wа-яё]+)\s*:\s*(.+?)\s*$/i)
    if (m) map.set(m[1].toLowerCase(), m[2])
  }
  const period = parsePeriod(map.get('period') || map.get('период'))
  const typeRaw = (map.get('type') || map.get('тип') || 'table').toLowerCase()
  const kindRaw = (map.get('kind') || map.get('вид') || '').toLowerCase()

  return {
    type: (['sum', 'table', 'chart', 'list'].includes(typeRaw) ? typeRaw : 'table') as QuerySpec['type'],
    chart: ((map.get('chart') || 'donut').toLowerCase() as QuerySpec['chart']) || 'donut',
    kind:
      kindRaw === 'expense' || kindRaw === 'расход' ? 'expense'
      : kindRaw === 'income' || kindRaw === 'доход' ? 'income'
      : kindRaw === 'transfer' || kindRaw === 'перевод' ? 'transfer'
      : undefined,
    from: period.from,
    to: period.to,
    periodLabel: period.label,
    group: ((map.get('group') || map.get('группа') || 'category').toLowerCase() as QuerySpec['group']),
    categories: splitList(map.get('category') || map.get('категория') || ''),
    tags: splitList(map.get('tag') || map.get('тег') || '').map((t) => t.replace(/^#/, '')),
    accounts: splitList(map.get('account') || map.get('счет') || map.get('счёт') || ''),
    limit: Number(map.get('limit') || map.get('лимит') || 20) || 20,
  }
}

export function runQuery(text: string, data: VaultData): QueryResult {
  let spec: QuerySpec
  try {
    spec = parseQuery(text)
  } catch (e) {
    return { type: 'error', message: 'Не удалось разобрать запрос' }
  }

  const catByName = new Map(data.categories.map((c) => [c.name.toLowerCase(), c]))
  const accByName = new Map(data.accounts.map((a) => [a.name.toLowerCase(), a]))
  const wantCats = new Set(spec.categories.map((n) => catByName.get(n.toLowerCase())?.id).filter(Boolean) as string[])
  const wantAccs = new Set(spec.accounts.map((n) => accByName.get(n.toLowerCase())?.id).filter(Boolean) as string[])

  const rows = data.transactions.filter((t) => {
    if (t.date < spec.from || t.date > spec.to) return false
    if (spec.kind && t.kind !== spec.kind) return false
    if (wantCats.size) {
      const hit = (t.categoryId && wantCats.has(t.categoryId)) || t.splits?.some((s) => wantCats.has(s.categoryId))
      if (!hit) return false
    }
    if (wantAccs.size && !wantAccs.has(t.accountId) && !(t.toAccountId && wantAccs.has(t.toAccountId))) return false
    if (spec.tags.length && !spec.tags.some((tag) => t.tags.includes(tag))) return false
    return true
  })

  if (spec.type === 'sum') {
    return { type: 'sum', value: rows.reduce((s, t) => s + t.amount, 0), count: rows.length, spec }
  }

  if (spec.type === 'table' || spec.type === 'list') {
    const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, spec.limit)
    return { type: spec.type, rows: sorted, spec }
  }

  // chart
  const catById = new Map(data.categories.map((c) => [c.id, c]))
  let slices: { label: string; value: Money; color: string; share: number }[] = []
  let series: { key: string; label: string; income: Money; expense: Money }[] = []

  if (spec.group === 'month' || spec.chart === 'line' || spec.chart === 'bar') {
    series = monthlySeries(rows, spec.from, spec.to).map((p) => ({
      key: p.key,
      label: monthTitle(p.key),
      income: p.income,
      expense: p.expense,
    }))
  }
  if (spec.group === 'category' || spec.chart === 'donut') {
    const kind = spec.kind === 'income' ? 'income' : 'expense'
    slices = categoryTotals(rows, kind)
      .slice(0, spec.limit)
      .map((t) => {
        const c = catById.get(t.categoryId)
        return { label: c?.name ?? 'Без категории', value: t.amount, color: c?.color ?? '#7c8794', share: t.share }
      })
  }
  if (spec.group === 'tag') {
    const kind = spec.kind === 'income' ? 'income' : 'expense'
    const totals = tagTotals(rows, kind)
    const sum = totals.reduce((s, t) => s + t.amount, 0) || 1
    slices = totals.slice(0, spec.limit).map((t, i) => ({
      label: '#' + t.tag,
      value: t.amount,
      color: ['#4cc46a', '#4aa3e8', '#e8833a', '#8b5cf6', '#e05a91', '#3ec9c0'][i % 6],
      share: t.amount / sum,
    }))
  }
  if (spec.group === 'account') {
    const map = new Map<string, Money>()
    for (const t of rows) map.set(t.accountId, (map.get(t.accountId) || 0) + t.amount)
    const sum = [...map.values()].reduce((s, v) => s + v, 0) || 1
    slices = [...map.entries()].map(([id, v]) => {
      const a = data.accounts.find((x) => x.id === id)
      return { label: a?.name ?? '—', value: v, color: a?.color ?? '#7c8794', share: v / sum }
    })
  }

  return { type: 'chart', chart: spec.chart, slices, series, spec }
}
