/*
 * Вид линий канваса.
 *
 * Два слоя: настройки по умолчанию — одни на все доски, — и свои у каждой
 * связи. Связь, которую не правили, целиком следует умолчанию: поменяли
 * умолчание — поменялись все такие линии. Правка отдельной связи
 * записывает в неё только тронутое поле, остальное продолжает следовать
 * умолчанию; «Как по умолчанию» стирает свои поля.
 *
 * Форма по умолчанию — ломаная, как соединитель в Miro. Доски из прежних
 * версий, где форму выбирали у доски, держат её, пока в настройках форму не
 * выбрали явно.
 */
import type { CanvasDoc, CanvasEdge, EdgeDash, Settings, ВидЛинии } from '../../lib/types'

export const ЛИНИЯ_ИСХОДНАЯ: ВидЛинии = { shape: 'elbow', width: 2, dash: 'solid', arrow: 'end' }

export const ТОЛЩИНЫ = [1, 2, 3, 5]

/** Линии по умолчанию для доски. */
export function линииПоУмолчанию(s: Settings, doc?: CanvasDoc): ВидЛинии {
  const свои = s.canvasLines ?? {}
  return {
    ...ЛИНИЯ_ИСХОДНАЯ,
    ...(doc?.edgeShape ? { shape: doc.edgeShape } : {}),
    ...свои,
  }
}

/** Вид конкретной связи: свои поля поверх умолчания. */
export function видСвязи(e: CanvasEdge, умолч: ВидЛинии): ВидЛинии {
  return {
    shape: e.shape ?? умолч.shape,
    width: e.width ?? умолч.width,
    dash: e.dash ?? умолч.dash,
    arrow: e.arrow ?? умолч.arrow,
    ...(e.color ?? умолч.color ? { color: e.color ?? умолч.color } : {}),
  }
}

/** Есть ли у связи свои настройки вида. */
export const свойВид = (e: CanvasEdge): boolean =>
  e.shape !== undefined || e.width !== undefined || e.dash !== undefined || e.arrow !== undefined || e.color !== undefined

/** Сбросить свой вид связи — она снова следует умолчанию. */
export function безСвоегоВида(e: CanvasEdge): CanvasEdge {
  const { shape: _s, width: _w, dash: _d, arrow: _a, color: _c, ...остальное } = e
  return остальное
}

/** Штрих SVG. Точки — нулевые штрихи со скруглёнными концами. */
export function штрихЛинии(dash: EdgeDash, width: number): string | undefined {
  if (dash === 'dash') return `${width * 4 + 4} ${width * 2.5 + 4}`
  if (dash === 'dot') return `0 ${width * 2 + 4}`
  return undefined
}
