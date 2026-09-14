/*
 * Свои оформления — конструктор тем.
 *
 * Своя тема — это «основа + свои значения». Основа — любая встроенная тема:
 * от неё берутся всё, что человек не трогал, и характер разметки (градиент
 * шапки, особые правила кнопок). Свои значения — CSS-переменные, которые
 * кладутся поверх на корень документа.
 *
 * Два режима. Простой: фон, панель, текст, акцент и скругление, а
 * промежуточные цвета — границы, наведение, приглушённый текст — выводятся
 * из них. Полный: каждая переменная отдельно.
 *
 * Здесь только логика, без окна: её проверяет самопроверка.
 */
import type { ThemeId } from './types'
import { т } from '../i18n'

export interface СвояТема {
  id: string
  name: string
  base: ThemeId
  accent: string
  /** Каким режимом собрана — чтобы открыть конструктор там же. */
  режимъ: 'простой' | 'полный'
  /** Только заданные переменные, без «--»: { bg: '#141416', radius: '12px' }. */
  tokens: Record<string, string>
}

export type ВидъТокена = 'color' | 'px' | 'weight' | 'em' | 'text'

export interface ТокенъТемы {
  id: string
  name: string
  group: string
  вид: ВидъТокена
}

/** Всё, что можно менять в полном режиме, — по группам, как в окне. */
export const ТОКЕНЫ: ТокенъТемы[] = [
  { id: 'bg', name: т('Фон окна'), group: т('Поверхности'), вид: 'color' },
  { id: 'bg-alt', name: т('Боковые панели'), group: т('Поверхности'), вид: 'color' },
  { id: 'panel', name: т('Карточки'), group: т('Поверхности'), вид: 'color' },
  { id: 'panel-2', name: т('Вторые панели'), group: т('Поверхности'), вид: 'color' },
  { id: 'hover', name: т('Наведение'), group: т('Поверхности'), вид: 'color' },
  { id: 'border', name: т('Рамки'), group: т('Поверхности'), вид: 'color' },
  { id: 'border-soft', name: т('Тонкие рамки'), group: т('Поверхности'), вид: 'color' },

  { id: 'text', name: т('Текст'), group: т('Текст'), вид: 'color' },
  { id: 'text-strong', name: т('Заголовки и суммы'), group: т('Текст'), вид: 'color' },
  { id: 'muted', name: т('Приглушённый'), group: т('Текст'), вид: 'color' },
  { id: 'faint', name: т('Еле видный'), group: т('Текст'), вид: 'color' },
  { id: 'accent-ink', name: т('Акцентные буквы'), group: т('Текст'), вид: 'color' },
  { id: 'accent-text', name: т('Буквы на акценте'), group: т('Текст'), вид: 'color' },

  { id: 'good', name: т('Хорошо / приход'), group: т('Сигналы'), вид: 'color' },
  { id: 'warn', name: т('Внимание'), group: т('Сигналы'), вид: 'color' },
  { id: 'alert', name: т('Беда / расход'), group: т('Сигналы'), вид: 'color' },
  { id: 'info', name: т('Сведения'), group: т('Сигналы'), вид: 'color' },

  { id: 'radius', name: т('Скругление'), group: т('Форма'), вид: 'px' },
  { id: 'radius-lg', name: т('Скругление карточек'), group: т('Форма'), вид: 'px' },
  { id: 'card-pad-y', name: т('Поля карточки сверху'), group: т('Форма'), вид: 'px' },
  { id: 'card-pad-x', name: т('Поля карточки сбоку'), group: т('Форма'), вид: 'px' },
  { id: 'btn-weight', name: т('Жирность кнопок'), group: т('Форма'), вид: 'weight' },
  { id: 'title-spacing', name: т('Разрядка заголовков'), group: т('Форма'), вид: 'em' },

  { id: 'shadow', name: т('Тень'), group: т('Эффекты'), вид: 'text' },
  { id: 'bg-image', name: т('Подсветка фона'), group: т('Эффекты'), вид: 'text' },
  { id: 'panel-blur', name: т('Размытие панелей'), group: т('Эффекты'), вид: 'text' },
]

export const ИДЫ_ТОКЕНОВЪ = ТОКЕНЫ.map((тм) => тм.id)

// --------------------------------------------------------------- цвета

/** #rgb / #rrggbb → [r, g, b]; всё прочее — null. */
export function разобратьHex(ц: string): [number, number, number] | null {
  const м = ц.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!м) return null
  const h = м[1].length === 3 ? м[1].split('').map((x) => x + x).join('') : м[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export const вHex = ([r, g, b]: number[]): string =>
  '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')

/** Смесь двух цветов: t = 0 — первый, 1 — второй. */
export function смѣсь(a: string, b: string, t: number): string {
  const x = разобратьHex(a)
  const y = разобратьHex(b)
  if (!x || !y) return a
  return вHex(x.map((v, i) => v + (y[i] - v) * t))
}

/** Относительная яркость по WCAG. */
export function яркость(ц: string): number {
  const rgb = разобратьHex(ц)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Контраст двух цветов по WCAG: 1 — одинаковые, 21 — чёрное на белом. */
export function контрастъ(a: string, b: string): number {
  const x = яркость(a)
  const y = яркость(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export const тёмная = (фонъ: string): boolean => яркость(фонъ) < 0.4

// -------------------------------------------------------- простой режим

export interface ПростыяНастройки {
  bg: string
  panel: string
  text: string
  accent: string
  radius: number
}

/**
 * Простой режим → переменные темы.
 *
 * Промежуточные цвета — это смеси трёх заданных: рамка на 14% ближе к тексту,
 * чем панель, приглушённый текст — на 42% ближе к фону и так далее. Доли
 * подобраны по встроенным темам, чтобы своя тема не выглядела самодельной.
 *
 * Акцентные буквы выбираются по контрасту: если акцент на панели читается
 * хуже 3:1 (жёлтый по белому — 1.4), буквами идёт текст заголовков, а акцент
 * остаётся заливкой. Так программа сама не даст собрать тему, где активный
 * пункт меню не прочесть.
 */
export function вывестиТокены(п: ПростыяНастройки): Record<string, string> {
  const тьма = тёмная(п.bg)
  const крайній = тьма ? '#ffffff' : '#000000'
  const textStrong = смѣсь(п.text, крайній, тьма ? 0.6 : 0.5)
  return {
    bg: п.bg,
    'bg-alt': смѣсь(п.bg, п.panel, тьма ? 0.35 : 0.5),
    panel: п.panel,
    'panel-2': смѣсь(п.panel, п.text, тьма ? 0.05 : 0.04),
    hover: смѣсь(п.panel, п.text, тьма ? 0.09 : 0.07),
    border: смѣсь(п.panel, п.text, 0.14),
    'border-soft': смѣсь(п.panel, п.text, 0.08),
    text: п.text,
    'text-strong': textStrong,
    // Доли с запасом: сначала стояли 0.42 и 0.4, и приглушённый текст выходил
    // ровно на пороге — 4.44 на тёмном, 4.40 на белом. Запас нужен потому,
    // что свои цвета бывают любыми, а порог 4.5 — это нижний край, не цель.
    muted: смѣсь(п.text, п.bg, тьма ? 0.35 : 0.33),
    faint: смѣсь(п.text, п.bg, тьма ? 0.62 : 0.55),
    'accent-ink': контрастъ(п.accent, п.panel) >= 3 ? п.accent : textStrong,
    /*
     * Буквы на акцентной заливке — главная кнопка, выбранный день. У
     * встроенных тем их задаёт правило основы, а не переменная: у «Пикми»
     * они белые, и своя тема с жёлтым акцентом на её основе давала белое
     * по жёлтому (контраст 1.4). Панель читаемости это и показала. Здесь
     * выбирается то из чёрного и белого, что читается лучше.
     */
    'accent-text': контрастъ('#111114', п.accent) >= контрастъ('#ffffff', п.accent) ? '#111114' : '#ffffff',
    radius: `${Math.round(п.radius)}px`,
    'radius-lg': `${Math.round(п.radius * 1.6)}px`,
  }
}

/** Обратно: из полного набора — пять полей простого режима. */
export function простыяИзъТокеновъ(tokens: Record<string, string>, accent: string): ПростыяНастройки {
  return {
    bg: разобратьHex(tokens.bg ?? '') ? tokens.bg : '#1a1b1e',
    panel: разобратьHex(tokens.panel ?? '') ? tokens.panel : '#26272b',
    text: разобратьHex(tokens.text ?? '') ? tokens.text : '#dcdde1',
    accent: разобратьHex(accent) ? accent : '#4cc46a',
    radius: parseFloat(tokens.radius ?? '') || 8,
  }
}

// ------------------------------------------------------------ проверка

/*
 * Что пропускать в значении переменной.
 *
 * Значения ставятся через style.setProperty, поэтому выйти за пределы
 * одного свойства нельзя. Но тема приходит и из файла от другого человека,
 * и одна вещь в ней опасна: url(). Картинка по ссылке — это запрос в сеть, а
 * программа обещает не ходить в сеть никогда. Поэтому url() пропускается
 * только для встроенных data:image — они никуда не ходят.
 */
export function значеніеДопустимо(вид: ВидъТокена, v: string): boolean {
  const з = v.trim()
  if (!з || з.length > 600) return false
  const ссылки = з.match(/url\(([^)]*)\)/gi) ?? []
  if (ссылки.some((u) => !/^url\(\s*["']?data:image\//i.test(u))) return false
  // Точка с запятой законна только внутри встроенной картинки
  // («data:image/png;base64,…») — поэтому проверяем уже без них.
  // Сначала запрещал её везде, и самопроверка это поймала.
  const безъКартинокъ = з.replace(/url\(\s*["']?data:image\/[^)]*\)/gi, '')
  if (/[;{}<>\\]/.test(безъКартинокъ)) return false
  // Сеть зовут не только через url(): image-set("https://…") в фоне тоже
  // скачивает картинку. Любой адрес вне встроенной картинки — отказ.
  if (/https?:|\/\/|image-set|@import/i.test(безъКартинокъ)) return false
  switch (вид) {
    case 'color':
      return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|transparent)$/i.test(з)
    case 'px':
      return /^\d{1,3}(\.\d+)?px$/.test(з)
    case 'weight':
      return /^[1-9]00$|^[1-9]\d0$/.test(з)
    case 'em':
      return /^-?(\d+(\.\d+)?|\.\d+)em$/.test(з)
    case 'text':
      return true
  }
}

/** Только допустимые и известные переменные — остальное молча отбрасывается. */
export function очиститьТокены(tokens: Record<string, unknown>): Record<string, string> {
  const итогъ: Record<string, string> = {}
  for (const тм of ТОКЕНЫ) {
    const v = tokens[тм.id]
    if (typeof v === 'string' && значеніеДопустимо(тм.вид, v)) итогъ[тм.id] = v.trim()
  }
  return итогъ
}

// ---------------------------------------------------------- применение

/**
 * Кладёт переменные своей темы на элемент. Сначала снимает все прежние —
 * иначе при переключении с одной своей темы на другую на экране остались
 * бы переменные первой, которых во второй нет.
 */
export function применитьТокены(el: HTMLElement, tokens: Record<string, string> | null) {
  for (const id of ИДЫ_ТОКЕНОВЪ) el.style.removeProperty('--' + id)
  if (!tokens) return
  for (const [k, v] of Object.entries(tokens)) {
    if (ИДЫ_ТОКЕНОВЪ.includes(k)) el.style.setProperty('--' + k, v)
  }
}

// ------------------------------------------------------------ файл темы

export const РАСШИРЕНІЕ_ТЕМЫ = 'kashel-tema.json'

export function файлТемы(тм: СвояТема): string {
  return JSON.stringify(
    { kashel: 'tema', version: 1, name: тм.name, base: тм.base, accent: тм.accent, режимъ: тм.режимъ, tokens: тм.tokens },
    null,
    2,
  )
}

/**
 * Разбор файла темы, пришедшего снаружи.
 * Всё непонятное отбрасывается, а не падает: одна кривая строка не должна
 * мешать взять остальную тему.
 */
export function разобратьФайлТемы(
  текстъ: string,
  known: (id: string) => boolean,
  новыйId: () => string,
): { ok: true; тема: СвояТема } | { ok: false; error: string } {
  let r: Record<string, unknown>
  try {
    r = JSON.parse(текстъ.replace(/^﻿/, ''))
  } catch {
    return { ok: false, error: т('Файл не читается как тема — это не JSON.') }
  }
  if (!r || r.kashel !== 'tema') return { ok: false, error: т('Это не файл темы Кошеля.') }
  const base = typeof r.base === 'string' && known(r.base) ? (r.base as ThemeId) : 'obsidian'
  const accent = typeof r.accent === 'string' && значеніеДопустимо('color', r.accent) ? r.accent : '#4cc46a'
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : т('Своя тема')
  const tokens = очиститьТокены((r.tokens as Record<string, unknown>) ?? {})
  return {
    ok: true,
    тема: { id: новыйId(), name, base, accent, режимъ: r.режимъ === 'простой' ? 'простой' : 'полный', tokens },
  }
}
