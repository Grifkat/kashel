import type { Account, Category, Money, TxKind } from '../lib/types'
import { addDays, iso, parseISO, relDate, today } from '../lib/date'
import { toMinor } from '../lib/format'

export interface QuickDraft {
  kind: TxKind
  amount: Money
  categoryId?: string
  accountId?: string
  toAccountId?: string
  date: string
  tags: string[]
  note: string
  matchedCategory?: string
  matchedAccount?: string
}

const INCOME_WORDS = ['доход', 'зарплата', 'аванс', 'получил', 'получила', 'приход', 'навар', 'премия', 'вернули', 'возврат']
const TRANSFER_WORDS = ['перевод', 'переведи', 'перевёл', 'перевел', 'снятие', 'снял', 'в копилку', 'на счёт']

/**
 * Разбор строки быстрого ввода: «кофе 250 кафе вчера #работа @наличные».
 * Числа, дата, теги и счёт вытаскиваются позиционно-независимо,
 * остаток текста идёт в комментарий.
 */
export function parseQuick(
  input: string,
  categories: Category[],
  accounts: Account[],
  defaults?: { accountId?: string; kind?: TxKind; date?: string },
): QuickDraft {
  let text = ' ' + input.trim() + ' '
  const tags: string[] = []
  // Точка отсчёта приходит снаружи: когда человек смотрит не на сегодняшний
  // день, запись должна лечь туда, куда он смотрит. Слово в строке («вчера»,
  // «12.08») всё равно главнее — оно перезапишет это значение ниже.
  let date = defaults?.date || today()
  // Явный вид — только когда он действительно указан: знаком, словом или
  // названием доходной категории. Иначе берём подсказку из контекста.
  let explicit: TxKind | null = null

  // Теги
  text = text.replace(/\s#([^\s#]+)/g, (_, tag) => {
    tags.push(tag)
    return ' '
  })

  // Счёт: @название
  let accountId = defaults?.accountId
  let matchedAccount: string | undefined
  text = text.replace(/\s@([^\s@]+)/g, (m, name: string) => {
    const acc = findByName(accounts, name)
    if (acc) {
      accountId = acc.id
      matchedAccount = acc.name
      return ' '
    }
    return m
  })

  // Явная дата: 12.08 / 12.08.2026 / 2026-08-12
  const dm = text.match(/\s(\d{1,2})[.\/](\d{1,2})(?:[.\/](\d{2,4}))?\s/)
  if (dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : parseISO(today()).getFullYear()
    const d = new Date(y, Number(dm[2]) - 1, Number(dm[1]))
    if (!Number.isNaN(d.getTime())) {
      date = iso(d)
      text = text.replace(dm[0], ' ')
    }
  } else {
    // \b в JS опирается на ASCII-\w, поэтому с кириллицей не работает —
    // границы слова задаём пробелами явно.
    const word = (w: string) => new RegExp(`(^|\\s)${w}(?=\\s|$)`, 'i')
    const keywords: [string, number][] = [
      ['позавчера', -2],
      ['вчера', -1],
      ['сегодня', 0],
      ['завтра', 1],
    ]
    for (const [w, shift] of keywords) {
      const re = word(w)
      if (re.test(text)) {
        date = addDays(today(), shift)
        text = text.replace(re, ' ')
        break
      }
    }
  }

  // Направление
  const lower = text.toLowerCase()
  if (/^\s*\+/.test(text) || INCOME_WORDS.some((w) => lower.includes(w))) explicit = 'income'
  if (/^\s*-/.test(text)) explicit = 'expense'
  if (TRANSFER_WORDS.some((w) => lower.includes(w))) explicit = 'transfer'
  text = text.replace(/^\s*[+-]/, ' ')

  // Сумма: 250, 1 250,50, 3к, 3.5к, 12тыс
  let amount: Money = 0
  const am = text.match(/\s(\d[\d\s ]*(?:[.,]\d{1,2})?)\s*(к|k|тыс|т)?\.?(?=\s)/i)
  if (am) {
    const mult = am[2] ? 1000 : 1
    amount = toMinor(am[1]) * mult
    text = text.replace(am[0], ' ')
  }

  // Категория: самое длинное совпадение по названию. Если вид явно не указан,
  // ищем среди всех категорий — доходная категория сама подскажет направление.
  const pool = categories.filter(
    (c) =>
      !c.archived &&
      (explicit === 'income'
        ? c.kind === 'income'
        : explicit === 'expense'
          ? c.kind === 'expense'
          : true),
  )
  let categoryId: string | undefined
  let matchedCategory: string | undefined
  const words = text.trim().split(/\s+/).filter(Boolean)
  let best: { cat: Category; len: number; idx: number } | null = null
  for (let i = 0; i < words.length; i++) {
    for (let len = Math.min(3, words.length - i); len >= 1; len--) {
      const phrase = words.slice(i, i + len).join(' ').toLowerCase().replace(/[.,!?]/g, '')
      // Многословное совпадение принимаем только точное, иначе фраза
      // «кафе вчера» жадно проглотит соседнее слово.
      const cat =
        pool.find((c) => c.name.toLowerCase() === phrase) ||
        (len === 1 ? pool.find((c) => matchesLoose(c.name, phrase)) : undefined)
      if (cat && (!best || len > best.len)) best = { cat, len, idx: i }
    }
  }
  if (best) {
    categoryId = best.cat.id
    matchedCategory = best.cat.name
    words.splice(best.idx, best.len)
  }

  // Порядок важен: явное указание > подсказанная категория > контекст экрана.
  const kind: TxKind =
    explicit ??
    (best?.cat.kind === 'income' ? 'income' : undefined) ??
    defaults?.kind ??
    'expense'

  return {
    kind,
    amount,
    categoryId,
    accountId,
    date,
    tags,
    note: words.join(' ').replace(/\s+/g, ' ').trim(),
    matchedCategory,
    matchedAccount,
  }
}

function matchesLoose(name: string, phrase: string): boolean {
  const a = name.toLowerCase()
  if (phrase.length < 3 || phrase.includes(' ')) return false
  // Совпадение по корню: «продукт» → «Продукты», «кафешка» → «Кафе»,
  // но «кофе» не должно превращаться в «Кафе».
  const stem = a.slice(0, Math.max(4, a.length - 2))
  return a.startsWith(phrase) || (phrase.length >= stem.length && phrase.startsWith(stem))
}

function findByName<T extends { name: string }>(list: T[], name: string): T | undefined {
  const n = name.toLowerCase()
  return list.find((x) => x.name.toLowerCase() === n) || list.find((x) => x.name.toLowerCase().startsWith(n))
}

/** Человекочитаемое описание разбора — показывается под полем ввода. */
export function describeDraft(d: QuickDraft, categories: Category[], accounts: Account[]): string {
  const parts: string[] = []
  parts.push(d.kind === 'income' ? 'Доход' : d.kind === 'transfer' ? 'Перевод' : 'Расход')
  if (d.amount) parts.push((d.amount / 100).toLocaleString('ru-RU') + ' ₽')
  else parts.push('сумма не найдена')
  if (d.matchedCategory) parts.push('→ ' + d.matchedCategory)
  if (d.matchedAccount) parts.push('со счёта ' + d.matchedAccount)
  if (d.date !== today()) parts.push(relDate(d.date))
  if (d.tags.length) parts.push(d.tags.map((t) => '#' + t).join(' '))
  if (d.note) parts.push('«' + d.note + '»')
  return parts.join(' · ')
}
