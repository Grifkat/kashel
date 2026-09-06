export const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
export const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
export const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

/** YYYY-MM-DD в локальной зоне, без сюрпризов toISOString. */
export function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const parseISO = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export const today = (): string => iso(new Date())
export const monthKey = (s: string): string => s.slice(0, 7)
export const yearKey = (s: string): string => s.slice(0, 4)

export function addDays(s: string, n: number): string {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

export function addMonths(s: string, n: number): string {
  const d = parseISO(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())))
  return iso(d)
}

export const daysInMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate()

export function startOfWeek(s: string, firstDay: 0 | 1 = 1): string {
  const d = parseISO(s)
  const shift = (d.getDay() - firstDay + 7) % 7
  d.setDate(d.getDate() - shift)
  return iso(d)
}

export const startOfMonth = (s: string): string => s.slice(0, 7) + '-01'

export function endOfMonth(s: string): string {
  const d = parseISO(s)
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export const startOfYear = (s: string): string => s.slice(0, 4) + '-01-01'
export const endOfYear = (s: string): string => s.slice(0, 4) + '-12-31'

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000)
}

export function diffMonths(a: string, b: string): number {
  const x = parseISO(a)
  const y = parseISO(b)
  return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth())
}

/** «20 августа 2026» или «20 августа», если год текущий. */
export function humanDate(s: string, withYear?: boolean): string {
  const d = parseISO(s)
  const showYear = withYear ?? d.getFullYear() !== new Date().getFullYear()
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${showYear ? ' ' + d.getFullYear() : ''}`
}

export function shortDate(s: string): string {
  const d = parseISO(s)
  const дд = String(d.getDate()).padStart(2, '0')
  const мм = String(d.getMonth() + 1).padStart(2, '0')
  return формат === 'us' ? `${мм}/${дд}` : `${дд}.${мм}`
}

/*
 * Формат числовых дат.
 *
 * Хранится здесь модулем, а не тянется через все вызовы: дату печатают
 * десятки мест, и протаскивать настройку в каждое значило бы менять
 * полсотни строк ради одной запятой. Значение ставит App при загрузке
 * настроек — до первой отрисовки.
 */
let формат: 'ru' | 'us' = 'ru'

export const setDateFormat = (f: 'ru' | 'us') => { формат = f }
export const dateFormat = () => формат

/** Дата цифрами целиком: 03.09.2026 или 09/03/2026. */
export function numericDate(s: string): string {
  const d = parseISO(s)
  const дд = String(d.getDate()).padStart(2, '0')
  const мм = String(d.getMonth() + 1).padStart(2, '0')
  return формат === 'us' ? `${мм}/${дд}/${d.getFullYear()}` : `${дд}.${мм}.${d.getFullYear()}`
}

/** «сегодня» / «вчера» / «20 августа». */
export function relDate(s: string): string {
  const d = diffDays(s, today())
  if (d === 0) return 'сегодня'
  if (d === 1) return 'вчера'
  if (d === 2) return 'позавчера'
  if (d === -1) return 'завтра'
  return humanDate(s)
}

export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** Список ключей месяцев от a до b включительно. */
export function monthRange(a: string, b: string): string[] {
  const out: string[] = []
  let cur = startOfMonth(a)
  const end = startOfMonth(b)
  let guard = 0
  while (cur <= end && guard++ < 600) {
    out.push(cur.slice(0, 7))
    cur = addMonths(cur, 1)
  }
  return out
}
