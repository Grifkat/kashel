import type { CanvasNode, Side } from '../../lib/types'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

export function anchor(n: Rect, side: Side): Point {
  switch (side) {
    case 'top': return { x: n.x + n.width / 2, y: n.y }
    case 'bottom': return { x: n.x + n.width / 2, y: n.y + n.height }
    case 'left': return { x: n.x, y: n.y + n.height / 2 }
    default: return { x: n.x + n.width, y: n.y + n.height / 2 }
  }
}

export const center = (n: Rect): Point => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })

/** Сторона узла, ближайшая к точке — чтобы связь цеплялась «лицом» к цели. */
export function sideTowards(n: Rect, p: Point): Side {
  const c = center(n)
  const dx = p.x - c.x
  const dy = p.y - c.y
  // Сравниваем по нормированному расстоянию, иначе широкие карточки
  // всегда цепляются сверху и снизу.
  return Math.abs(dx) / Math.max(1, n.width) > Math.abs(dy) / Math.max(1, n.height)
    ? dx > 0 ? 'right' : 'left'
    : dy > 0 ? 'bottom' : 'top'
}

/** Пара сторон для новой связи: обе смотрят друг на друга. */
export function bestSides(a: Rect, b: Rect): [Side, Side] {
  const from = sideTowards(a, center(b))
  const to = sideTowards(b, center(a))
  return [from, to]
}

const OUT = 46
const offsetOf = (s: Side, d: number): Point =>
  s === 'left' ? { x: -d, y: 0 } : s === 'right' ? { x: d, y: 0 } : s === 'top' ? { x: 0, y: -d } : { x: 0, y: d }

export interface Curve {
  p0: Point
  p1: Point
  p2: Point
  p3: Point
}

export function curveOf(p0: Point, s0: Side, p3: Point, s3: Side): Curve {
  const d = Math.max(OUT, Math.abs(p3.x - p0.x) / 2, Math.abs(p3.y - p0.y) / 2)
  const o0 = offsetOf(s0, d)
  const o3 = offsetOf(s3, d)
  return {
    p0,
    p1: { x: p0.x + o0.x, y: p0.y + o0.y },
    p2: { x: p3.x + o3.x, y: p3.y + o3.y },
    p3,
  }
}

export const pathOf = (c: Curve): string =>
  `M${c.p0.x},${c.p0.y} C${c.p1.x},${c.p1.y} ${c.p2.x},${c.p2.y} ${c.p3.x},${c.p3.y}`

/** Точка на кубической кривой — нужна для подписи и для попадания мышью. */
export function pointAt(c: Curve, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * u * c.p0.x + 3 * u * u * t * c.p1.x + 3 * u * t * t * c.p2.x + t * t * t * c.p3.x,
    y: u * u * u * c.p0.y + 3 * u * u * t * c.p1.y + 3 * u * t * t * c.p2.y + t * t * t * c.p3.y,
  }
}

export const midpoint = (c: Curve): Point => pointAt(c, 0.5)

export const inRect = (r: Rect, p: Point): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Прямоугольник по двум углам — рамка выделения строится перетаскиванием. */
export function rectFrom(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

export function boundsOf(nodes: CanvasNode[]): Rect | null {
  if (!nodes.length) return null
  const minX = Math.min(...nodes.map((n) => n.x))
  const minY = Math.min(...nodes.map((n) => n.y))
  const maxX = Math.max(...nodes.map((n) => n.x + n.width))
  const maxY = Math.max(...nodes.map((n) => n.y + n.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// ------------------------------------------------------------ направляющие
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

const SNAP = 6

/**
 * Притягивает перетаскиваемый прямоугольник к краям и центрам соседей.
 * Возвращает поправку и линии, которые надо показать.
 */
export function snapToNeighbours(moving: Rect, others: Rect[]): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = []
  let dx = 0
  let dy = 0
  let bestX = SNAP + 1
  let bestY = SNAP + 1

  const movingX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
  const movingY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]

  for (const o of others) {
    const targetX = [o.x, o.x + o.width / 2, o.x + o.width]
    const targetY = [o.y, o.y + o.height / 2, o.y + o.height]

    for (const mx of movingX) {
      for (const tx of targetX) {
        const d = Math.abs(mx - tx)
        if (d < SNAP && d < bestX) {
          bestX = d
          dx = tx - mx
          guides.push({
            axis: 'x',
            at: tx,
            from: Math.min(moving.y, o.y) - 20,
            to: Math.max(moving.y + moving.height, o.y + o.height) + 20,
          })
        }
      }
    }
    for (const my of movingY) {
      for (const ty of targetY) {
        const d = Math.abs(my - ty)
        if (d < SNAP && d < bestY) {
          bestY = d
          dy = ty - my
          guides.push({
            axis: 'y',
            at: ty,
            from: Math.min(moving.x, o.x) - 20,
            to: Math.max(moving.x + moving.width, o.x + o.width) + 20,
          })
        }
      }
    }
  }

  // Оставляем только линии по выбранной поправке, иначе экран рябит.
  const kept = guides.filter(
    (g) => (g.axis === 'x' && bestX <= SNAP && Math.abs(g.at - (moving.x + dx)) < moving.width + 1) ||
      (g.axis === 'y' && bestY <= SNAP && Math.abs(g.at - (moving.y + dy)) < moving.height + 1),
  )
  return { dx: bestX <= SNAP ? dx : 0, dy: bestY <= SNAP ? dy : 0, guides: kept.slice(0, 4) }
}
