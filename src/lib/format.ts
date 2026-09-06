import type { Money } from './types'

export const uid = (prefix = ''): string =>
  prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/** Рубли (число или строка «1 234,56») → копейки. */
export function toMinor(value: string | number): Money {
  if (typeof value === 'number') return Math.round(value * 100)
  const cleaned = value.replace(/\s| /g, '').replace(',', '.').replace(/[^\d.\-]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export const toMajor = (m: Money): number => m / 100

/** Разделитель разрядов — тот же неразрывный пробел, что ставит Intl для ru-RU. */
export const DIGIT_SEP = ' '

const groupInt = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, DIGIT_SEP)

/**
 * Расставляет разряды в числах внутри свободной строки быстрого ввода.
 *
 * Трогаем только самостоятельные числа. Всё, что приклеено к буквам, точкам,
 * дробям, двоеточиям или дефису с цифрой, остаётся как есть: иначе дата
 * 12.08.2026 превратилась бы в 12.08.2 026, а «3к» — в непонятно что.
 * Разделитель ставим неразрывным пробелом, и разбор строки его переживает:
 * регулярка суммы допускает пробелы внутри числа, а toMinor их вырезает.
 */
export function groupDigits(text: string): string {
  // Сначала убираем свои же разделители, иначе дописанная цифра сдвинула бы
  // всю сетку: «1 999» + «9» должно стать «19 999», а не «1 9999».
  const bare = text.split(DIGIT_SEP).join('')
  return bare.replace(
    /(?<![\d.,\/:])(?<!\d-)(?<!\p{L})(\d{4,})([.,]\d{1,2})?(?![\d.,\/:])(?!-\d)(?!\p{L})/gu,
    (_, int: string, frac = '') => groupInt(int) + frac,
  )
}


/**
 * То же самое для поля, где кроме числа ничего быть не может: остатка счёта,
 * лимита, суммы цели. Лишние символы отсекаются сразу, дробная часть — не
 * длиннее копеек, а незакрытая запятая («12,») остаётся, иначе её нельзя
 * было бы набрать.
 */
export function formatAmountInput(raw: string, allowNegative = false): string {
  const neg = allowNegative && /^\s*-/.test(raw)
  const cleaned = raw.replace(/[^\d.,]/g, '')
  const cut = cleaned.split(/[.,]/)
  const int = cut[0]
  const frac = cut.length > 1 ? ',' + cut.slice(1).join('').slice(0, 2) : ''
  if (!int && !frac) return neg ? '-' : ''
  return (neg ? '-' : '') + groupInt(int) + frac
}

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 12345678 → «123 457 ₽». Копейки показываем, только если они есть. */
export function money(m: Money, opts: { sign?: boolean; cents?: boolean; unit?: string } = {}): string {
  const unit = opts.unit ?? '₽'
  const abs = Math.abs(m)
  const cents = opts.cents ?? abs % 100 !== 0
  const body = cents ? nf2.format(abs / 100) : nf.format(Math.round(abs / 100))
  const sign = opts.sign ? (m > 0 ? '+' : m < 0 ? '−' : '') : m < 0 ? '−' : ''
  return `${sign}${body} ${unit}`.trim()
}

/** Компактно для осей графиков: 1 234 567 → «1,2 млн». */
export function moneyShort(m: Money): string {
  const v = Math.abs(m) / 100
  const sign = m < 0 ? '−' : ''
  if (v >= 1_000_000) return `${sign}${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace('.', ',')} млн`
  if (v >= 1_000) return `${sign}${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1).replace('.', ',')} тыс`
  return `${sign}${Math.round(v)}`
}

export const pct = (v: number, digits = 0): string =>
  `${v.toFixed(digits).replace('.', ',')}%`

/** Склонение: 1 день, 2 дня, 5 дней. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

export const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`
export const months = (n: number) => `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`
export const times = (n: number) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
