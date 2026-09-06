import type { ThemeId } from './types'

export interface ThemeInfo {
  id: ThemeId
  name: string
  mode: 'dark' | 'light'
  /** Короткое описание характера — показывается в галерее настроек. */
  about: string
  /** Акцент, с которым тема задумана; ставится при переключении. */
  accent: string
  /** Три цвета для превью: фон, панель, акцент. */
  swatch: [string, string, string]
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'imperial',
    name: 'Имперская',
    mode: 'dark',
    about: 'Чёрное съ золотомъ и шрифтъ съ засѣчками — въ духѣ казённой бумаги. Чины, ордена и грамота смотрятся въ ней такъ, какъ задумано.',
    accent: '#c9a227',
    swatch: ['#12100c', '#1c1913', '#c9a227'],
  },
  {
    id: 'obsidian',
    name: 'Обсидиан',
    mode: 'dark',
    about: 'Спокойная тёмная в духе Obsidian: мягкие серые, умеренные скругления, ничего лишнего.',
    accent: '#4cc46a',
    swatch: ['#1a1b1e', '#26272b', '#4cc46a'],
  },
  {
    id: 'graphite',
    name: 'Графит',
    mode: 'dark',
    about: 'Строгая и плотная: почти чёрный фон, тонкие границы, минимум теней и скруглений.',
    accent: '#e5e5e5',
    swatch: ['#0a0a0a', '#141414', '#e5e5e5'],
  },
  {
    id: 'glass',
    name: 'Стекло',
    mode: 'dark',
    about: 'Полупрозрачные панели с размытием поверх глубокого градиента. Красиво, но чуть тяжелее для видеокарты.',
    accent: '#7aa2ff',
    swatch: ['#101323', '#1b2038', '#7aa2ff'],
  },
  {
    id: 'neon',
    name: 'Неон',
    mode: 'dark',
    about: 'Максимальный контраст и свечение акцента. Острые углы, чёткие границы, цифры видно издалека.',
    accent: '#00e5a0',
    swatch: ['#07080c', '#0e1016', '#00e5a0'],
  },
  {
    id: 'mint',
    name: 'Мята',
    mode: 'light',
    about: 'Светлая зелёная — как в мобильных трекерах расходов, с которых списан дашборд.',
    accent: '#3d9e5a',
    swatch: ['#eef1ec', '#ffffff', '#3d9e5a'],
  },
  {
    id: 'warm',
    name: 'Тёплая бумага',
    mode: 'light',
    about: 'Кремовый фон, тёплые серые, крупные скругления и воздух. Мягче для глаз при долгой работе.',
    accent: '#c2703f',
    swatch: ['#f6f1e8', '#fffdf9', '#c2703f'],
  },
]

export const themeById = (id: ThemeId): ThemeInfo => THEMES.find((t) => t.id === id) ?? THEMES[0]

/** Ближайшая тема противоположной светлоты — для быстрого переключателя в ленте. */
export function counterpart(id: ThemeId): ThemeId {
  const cur = themeById(id)
  const pairs: Record<ThemeId, ThemeId> = {
    obsidian: 'mint',
    mint: 'obsidian',
    graphite: 'warm',
    warm: 'graphite',
    // У имперской свѣтлой пары нѣтъ: тёплая — ближайшая по духу бумага.
    imperial: 'warm',
    glass: 'mint',
    neon: 'warm',
  }
  return pairs[cur.id]
}
