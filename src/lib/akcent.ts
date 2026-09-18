/*
 * Акцентный цвет и быстрый выбор цветов.
 *
 * Акцент бывает двух родов: «как в оформлении» — тогда он меняется вместе с
 * темой, — и свой, выбранный человеком. Свой переживает смену оформления и
 * действует и на свои темы из конструктора: раньше смена темы молча
 * затирала выбранный цвет, а у своих тем выбор в палитре не действовал вовсе.
 *
 * Хранилища, заведённые до этого разделения, режима не знают. Для них свой
 * акцент — тот, что расходится с родным цветом встроенной темы: значит,
 * человек его выбирал. У своей темы акцент настроек прежде не действовал,
 * поэтому там — «как в оформлении»: вид не должен измениться от обновления.
 */
import type { Settings } from './types'
import { themeById } from './themes'
import { PALETTE } from './emoji'
import { контрастъ, разобратьHex, применитьТокены } from './svoitemy'

export type РежимАкцента = 'theme' | 'own'

const своя = (s: Settings) => (s.customTheme ? s.customThemes?.find((тм) => тм.id === s.customTheme) : undefined)

/** Цвет, с которым задумано включённое оформление. */
export function акцентОформления(s: Settings): string {
  return своя(s)?.accent ?? themeById(s.theme).accent
}

export function режимАкцента(s: Settings): РежимАкцента {
  if (s.accentMode) return s.accentMode
  if (своя(s)) return 'theme'
  return s.accent.toLowerCase() === themeById(s.theme).accent.toLowerCase() ? 'theme' : 'own'
}

/** Какой акцент сейчас на экране. */
export function действующийАкцент(s: Settings): string {
  return режимАкцента(s) === 'own' ? s.accent : акцентОформления(s)
}

/** Цвета быстрого выбора: свой набор или исходная палитра. */
export function быстрыеЦвета(s: Settings): string[] {
  return s.palette ?? PALETTE
}

/** Цвет к виду #rrggbb, или null, если это не цвет. */
export function чистыйЦвет(v: string): string | null {
  let t = v.trim().toLowerCase()
  if (!t.startsWith('#')) t = '#' + t
  if (/^#[0-9a-f]{3}$/.test(t)) t = '#' + [...t.slice(1)].map((c) => c + c).join('')
  return /^#[0-9a-f]{6}$/.test(t) && разобратьHex(t) ? t : null
}

/** Добавить цвет в быстрый выбор — в конец, без повторов. */
export function сЦветом(набор: string[], цвет: string): string[] {
  const ц = чистыйЦвет(цвет)
  if (!ц || набор.some((x) => x.toLowerCase() === ц)) return набор
  return [...набор, ц]
}

/**
 * Поставить акцент на корень. Свой акцент подгоняет под себя буквы: акцентные
 * надписи на панели и буквы на акцентной заливке — как конструктор тем, по
 * контрасту. Иначе жёлтый акцент на светлой теме давал белые буквы по
 * жёлтому. Акцент оформления оставляет буквы теме — она их и задумала.
 */
export function применитьАкцент(root: HTMLElement, цвет: string, свой: boolean): void {
  root.style.setProperty('--accent', цвет)
  if (!свой) return
  const стиль = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(root) : null
  const панель = стиль?.getPropertyValue('--panel').trim() ?? ''
  const заголовки = стиль?.getPropertyValue('--text-strong').trim() ?? ''
  if (чистыйЦвет(панель) && чистыйЦвет(заголовки)) {
    root.style.setProperty('--accent-ink', контрастъ(цвет, панель) >= 3 ? цвет : заголовки)
  }
  root.style.setProperty('--accent-text', контрастъ('#111114', цвет) >= контрастъ('#ffffff', цвет) ? '#111114' : '#ffffff')
  root.dataset.accentText = ''
}

/**
 * Вернуть корню оформление из настроек: свои переменные темы и акцент. Нужно
 * после предпросмотра цвета — тот ставит переменные напрямую, мимо настроек.
 */
export function вернутьОформление(root: HTMLElement, s: Settings): void {
  const тм = своя(s)
  применитьТокены(root, тм ? тм.tokens : null)
  if (тм?.tokens['accent-text']) root.dataset.accentText = ''
  else delete root.dataset.accentText
  применитьАкцент(root, действующийАкцент(s), режимАкцента(s) === 'own')
}
