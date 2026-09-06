/**
 * Палитры программы: цвета категорий, счетов и целей, а также набор канваса.
 *
 * Иконки живут отдельно, в catalog.ts: контурный набор вместо эмодзи, чтобы
 * они рисовались линией интерфейса и красились под тему.
 */

export const PALETTE = [
  '#e05252', '#e8833a', '#e8b93a', '#8fce4a', '#3ec98a',
  '#3ec9c0', '#4aa3e8', '#5566e8', '#8b5cf6', '#c95cc9',
  '#e05a91', '#7c8794',
]

/**
 * Палитра канваса. Первые семь по умолчанию попадают в быстрый доступ,
 * остальные доступны из полной палитры — набор настраивается для каждой доски.
 */
export const CANVAS_COLORS = [
  { key: 'gray', hex: '#8b95a5', name: 'Серый' },
  { key: 'red', hex: '#e05252', name: 'Красный' },
  { key: 'orange', hex: '#e8833a', name: 'Оранжевый' },
  { key: 'amber', hex: '#d9a441', name: 'Янтарный' },
  { key: 'yellow', hex: '#e8c53a', name: 'Жёлтый' },
  { key: 'lime', hex: '#a3cc46', name: 'Лаймовый' },
  { key: 'green', hex: '#4cc46a', name: 'Зелёный' },
  { key: 'emerald', hex: '#2eb88a', name: 'Изумрудный' },
  { key: 'cyan', hex: '#3ec9c0', name: 'Бирюзовый' },
  { key: 'sky', hex: '#4aa3e8', name: 'Голубой' },
  { key: 'blue', hex: '#5566e8', name: 'Синий' },
  { key: 'violet', hex: '#8b5cf6', name: 'Фиолетовый' },
  { key: 'magenta', hex: '#c95cc9', name: 'Пурпурный' },
  { key: 'pink', hex: '#e05a91', name: 'Розовый' },
  { key: 'brown', hex: '#a3785c', name: 'Коричневый' },
  { key: 'slate', hex: '#64748b', name: 'Графитовый' },
]

export const DEFAULT_QUICK_COLORS = CANVAS_COLORS.slice(0, 7).map((c) => c.hex)

export const colorName = (hex: string): string =>
  CANVAS_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex

export function hashColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
