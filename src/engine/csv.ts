import type { ImportRule, Money, Transaction } from '../lib/types'
import { iso, parseISO, today } from '../lib/date'
import { toMinor, uid } from '../lib/format'

export interface CsvTable {
  header: string[]
  rows: string[][]
  delimiter: string
}

/** Разбор CSV с кавычками и автоопределением разделителя. */
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const firstLine = clean.split('\n').find((l) => l.trim().length) || ''
  const counts: Record<string, number> = {
    ';': (firstLine.match(/;/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  }
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ';'

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)

  const header = (rows.shift() || []).map((h) => h.trim())
  return { header, rows, delimiter }
}

export interface ColumnMap {
  date: number
  amount: number
  amountIn?: number // отдельная колонка прихода, если суммы разнесены
  description: number
  category?: number
}

const DATE_HINTS = ['дата', 'date', 'operation', 'время']
const AMOUNT_HINTS = ['сумма', 'amount', 'оборот', 'value', 'приход', 'расход', 'списание']
const DESC_HINTS = ['описание', 'назначение', 'комментарий', 'description', 'категория', 'контрагент', 'место']

/** Догадка о раскладке колонок по заголовку — пользователь потом правит руками. */
export function guessColumns(header: string[]): ColumnMap {
  const find = (hints: string[], from = 0) =>
    header.findIndex((h, i) => i >= from && hints.some((x) => h.toLowerCase().includes(x)))
  const date = find(DATE_HINTS)
  const amount = find(AMOUNT_HINTS)
  const description = find(DESC_HINTS)
  return {
    date: date >= 0 ? date : 0,
    amount: amount >= 0 ? amount : 1,
    description: description >= 0 ? description : Math.min(2, header.length - 1),
  }
}

/** Даты в выписках приходят в трёх-четырёх форматах — принимаем все. */
export function parseDateCell(raw: string): string | null {
  const s = raw.trim().split(' ')[0]
  let m = s.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return s
  m = s.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{2})$/)
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : iso(d)
}

export function parseAmountCell(raw: string): Money {
  const s = raw.replace(/\s| |₽|руб\.?|RUB/gi, '').replace(',', '.')
  const neg = /^-/.test(s) || /\(.*\)/.test(raw)
  const n = Number.parseFloat(s.replace(/[^\d.\-]/g, ''))
  if (!Number.isFinite(n)) return 0
  return Math.round(Math.abs(n) * 100) * (neg ? -1 : 1)
}

export interface ImportPreviewRow {
  include: boolean
  date: string
  amount: Money // отрицательная — расход
  description: string
  categoryId?: string
  duplicate: boolean
}

export function buildPreview(
  table: CsvTable,
  map: ColumnMap,
  rules: ImportRule[],
  existing: Transaction[],
): ImportPreviewRow[] {
  const seen = new Set(existing.map((t) => `${t.date}|${t.amount}|${(t.note || '').toLowerCase().slice(0, 20)}`))
  const out: ImportPreviewRow[] = []

  for (const row of table.rows) {
    const date = parseDateCell(row[map.date] ?? '')
    if (!date) continue
    let amount = parseAmountCell(row[map.amount] ?? '')
    if (map.amountIn != null) {
      const income = parseAmountCell(row[map.amountIn] ?? '')
      if (income) amount = Math.abs(income)
      else amount = -Math.abs(amount)
    }
    if (!amount) continue
    const description = (row[map.description] ?? '').trim()
    const lower = description.toLowerCase()
    const rule = rules.find((r) => r.match && lower.includes(r.match.toLowerCase()))
    const key = `${date}|${Math.abs(amount)}|${lower.slice(0, 20)}`

    out.push({
      include: true,
      date,
      amount,
      description,
      categoryId: rule?.categoryId,
      duplicate: seen.has(key),
    })
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function rowsToTransactions(rows: ImportPreviewRow[], accountId: string): Transaction[] {
  return rows
    .filter((r) => r.include)
    .map((r) => ({
      id: uid('t'),
      kind: r.amount > 0 ? ('income' as const) : ('expense' as const),
      date: r.date,
      amount: Math.abs(r.amount),
      accountId,
      categoryId: r.categoryId,
      tags: ['импорт'],
      note: r.description || undefined,
      createdAt: new Date().toISOString(),
    }))
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? '')
          return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(';'),
    )
    .join('\n')
}
