/*
 * Карточка, поставленная на связь, встаёт в её разрыв.
 *
 * Было A → B, карточку N положили поверх линии — стало A → N → B. Обе
 * половины наследуют вид исходной связи (цвет, стрелки, форму, оборот),
 * подпись остаётся у первой. Встраиваются только карточки без своих связей:
 * передвигая готовую схему, связи случайно не перевязываются.
 */
import type { CanvasDoc, CanvasEdge, CanvasNode, EdgeShape } from '../../lib/types'
import { anchor, bestSides, curveOf, elbowOf, inRect, lineOf, pointAt, type Curve } from './geometry'

/** Кривая связи с учётом формы: своей у связи или по умолчанию. */
export function криваяСвязи(doc: CanvasDoc, e: CanvasEdge, формаПоУмолчанию: EdgeShape = doc.edgeShape ?? 'elbow'): Curve | null {
  const a = doc.nodes.find((n) => n.id === e.fromNode)
  const b = doc.nodes.find((n) => n.id === e.toNode)
  if (!a || !b) return null
  const shape = e.shape ?? формаПоУмолчанию
  const p0 = anchor(a, e.fromSide)
  const p3 = anchor(b, e.toSide)
  return shape === 'line' ? lineOf(p0, p3) : shape === 'elbow' ? elbowOf(p0, e.fromSide, p3, e.toSide) : curveOf(p0, e.fromSide, p3, e.toSide)
}

const ТОЧЕК = 40

/** Связь, линия которой проходит под карточкой. Карточка со своими связями не встраивается. */
export function связьПодКарточкой(doc: CanvasDoc, nodeId: string, форма?: EdgeShape): string | null {
  const n = doc.nodes.find((x) => x.id === nodeId)
  if (!n) return null
  if (doc.edges.some((e) => e.fromNode === nodeId || e.toNode === nodeId)) return null
  for (const e of doc.edges) {
    const c = криваяСвязи(doc, e, форма)
    if (!c) continue
    // Концы связи сидят на краях своих карточек — их не считаем, только середину пути.
    for (let i = 2; i <= ТОЧЕК - 2; i++) {
      if (inRect(n, pointAt(c, i / ТОЧЕК))) return e.id
    }
  }
  return null
}

let счётчик = 0
const новыйId = () => `e${Date.now().toString(36)}${(счётчик++).toString(36)}`

/** Разрезать связь карточкой: A → N → B. */
export function встроитьВСвязь(doc: CanvasDoc, edgeId: string, nodeId: string, id: () => string = новыйId): CanvasDoc {
  const e = doc.edges.find((x) => x.id === edgeId)
  const n: CanvasNode | undefined = doc.nodes.find((x) => x.id === nodeId)
  if (!e || !n || e.fromNode === nodeId || e.toNode === nodeId) return doc
  const a = doc.nodes.find((x) => x.id === e.fromNode)
  const b = doc.nodes.find((x) => x.id === e.toNode)
  if (!a || !b) return doc
  const [, кN1] = bestSides(a, n)
  const [отN2] = bestSides(n, b)
  const { id: _id, label, ...вид } = e
  const первая: CanvasEdge = { ...вид, id: id(), toNode: n.id, toSide: кN1, ...(label ? { label } : {}) }
  const вторая: CanvasEdge = { ...вид, id: id(), fromNode: n.id, fromSide: отN2 }
  return {
    ...doc,
    edges: doc.edges.flatMap((x) => (x.id === edgeId ? [первая, вторая] : [x])),
  }
}
