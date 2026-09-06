import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { moneyShort, uid } from '../lib/format'
import { addMonths, today } from '../lib/date'
import { CANVAS_COLORS, DEFAULT_QUICK_COLORS, colorName } from '../lib/emoji'
import { deleteCanvas, listCanvases, listNotes, readCanvas, readNote, writeCanvas } from '../state/vault'
import { Confirm, useToast } from '../components/ui'
import { ContextMenu, type MenuItem } from '../components/canvas/ContextMenu'
import { buildCardContext, CARD_STYLES, DEFAULT_FONT_SIZE, NodeBody, nodeData } from '../components/canvas/nodes'
import { ColorPalette } from '../components/canvas/ColorPalette'
import { FIT_MODES, TextToolbar, wrapSelection } from '../components/canvas/TextToolbar'
import {
  anchor, bestSides, boundsOf, curveOf, inRect, midpoint, pathOf, rectFrom, rectsOverlap,
  sideTowards, snapToNeighbours, SIDES, type Guide, type Point, type Rect,
} from '../components/canvas/geometry'
import type {
  CanvasDoc, CanvasEdge, CanvasNode, CanvasNodeKind, CardStyle, EdgeArrow, Side, TextFit,
} from '../lib/types'

/** Углы для изменения размера: буквы сторон света, как в графических редакторах. */
type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']
const MIN_W = 150
const MIN_H = 80

const GRID = 10
const HISTORY_LIMIT = 60

/**
 * Масштаб меняется только по этим ступеням. Плавный зум выглядит приятнее в
 * момент прокрутки, но текст в карточках при произвольном коэффициенте
 * растягивается из готового растра и мылится. На фиксированном наборе
 * значений браузер перерисовывает текст заново для каждой ступени, а 100 %
 * и 200 % вдобавок попадают в пиксели ровно.
 */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5]
const ZOOM_DEFAULT = 1

/** Ближайшая ступень к произвольному масштабу (нужно после «вписать всё»). */
const nearestStep = (k: number): number =>
  ZOOM_STEPS.reduce((best, s) => (Math.abs(s - k) < Math.abs(best - k) ? s : best), ZOOM_STEPS[0])

/** Ступень на `dir` шагов в сторону от текущей. */
const stepZoom = (k: number, dir: 1 | -1): number => {
  const i = ZOOM_STEPS.indexOf(nearestStep(k))
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))]
}

/** Наибольшая ступень, при которой содержимое ещё влезает целиком. */
const stepBelow = (k: number): number => {
  const fit = [...ZOOM_STEPS].reverse().find((s) => s <= k)
  return fit ?? ZOOM_STEPS[0]
}

const opposite = (s: Side): Side =>
  s === 'left' ? 'right' : s === 'right' ? 'left' : s === 'top' ? 'bottom' : 'top'

/**
 * Клик считается «по пустому месту», если он не попал ни в карточку, ни в
 * панель, ни в саму связь. Сравнивать target с currentTarget нельзя: сверху
 * лежат прозрачные слои, и событие приходит на них, а не на полотно.
 */
const INTERACTIVE = '.cnode, .canvas-tools, .canvas-hud, .edge-bar, .ctx-menu, .cv-hit, .cv-end'
const isBackground = (target: EventTarget | null): boolean => {
  const el = target as Element | null
  if (!el || typeof el.closest !== 'function') return true
  return !el.closest(INTERACTIVE)
}

const DEFAULT_SIZE: Record<CanvasNodeKind, { w: number; h: number }> = {
  text: { w: 280, h: 140 },
  note: { w: 250, h: 110 },
  account: { w: 250, h: 140 },
  category: { w: 250, h: 140 },
  goal: { w: 250, h: 150 },
  flow: { w: 220, h: 100 },
  query: { w: 340, h: 280 },
  scenario: { w: 260, h: 130 },
  group: { w: 420, h: 300 },
}

/** Буфер обмена живёт в модуле: между досками копировать тоже нужно. */
let clipboard: { nodes: CanvasNode[]; edges: CanvasEdge[] } | null = null

type DragMode = 'pan' | 'marquee' | 'node' | 'resize' | 'edge' | 'edge-end'

interface DragState {
  mode: DragMode
  id?: string
  side?: Side
  corner?: Corner
  rect0?: Rect
  end?: 'from' | 'to'
  sx: number
  sy: number
  ox: number
  oy: number
  /** Исходные позиции всех перемещаемых узлов. */
  start?: Map<string, Point>
  before?: CanvasDoc
  moved?: boolean
}

export default function CanvasView({ name }: { name?: string }) {
  const app = useApp()
  const { data } = useStore()
  const toast = useToast()

  const [files, setFiles] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [doc, setDoc] = useState<CanvasDoc>({ nodes: [], edges: [] })
  const [notes, setNotes] = useState<string[]>([])
  const [noteBodies, setNoteBodies] = useState<Map<string, string>>(new Map())
  const [view, setView] = useState({ x: 420, y: 260, k: ZOOM_DEFAULT })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [selEdge, setSelEdge] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [period, setPeriod] = useState<'1m' | '3m' | '12m'>('3m')
  const [menu, setMenu] = useState<{ x: number; y: number; title?: string; items: MenuItem[] } | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [ghost, setGhost] = useState<{ from: Point; side: Side; to: Point } | null>(null)
  const [past, setPast] = useState<CanvasDoc[]>([])
  const [future, setFuture] = useState<CanvasDoc[]>([])
  const [askDelete, setAskDelete] = useState(false)
  const [palette, setPalette] = useState<Set<string> | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<number | null>(null)
  const drag = useRef<DragState | null>(null)
  const space = useRef(false)
  /** Копим прокрутку: у мыши одна «щёлка» ≈ 100, у тачпада приходят крошки. */
  const wheelAcc = useRef(0)
  const docRef = useRef(doc)
  docRef.current = doc
  const viewRef = useRef(view)
  viewRef.current = view

  const cardStyle: CardStyle = doc.cardStyle ?? 'rich'
  const quickColors = doc.quickColors?.length ? doc.quickColors : DEFAULT_QUICK_COLORS

  // ------------------------------------------------------------- хранилище
  const persist = useCallback((next: CanvasDoc, file: string) => {
    if (!file) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(
      () => void writeCanvas(file, next).catch((e) =>
        toast('Доска не сохранена: ' + (e instanceof Error ? e.message : String(e))),
      ),
      300,
    )
  }, [toast])

  /** Изменение с записью в историю — всё, что можно отменить. */
  const commit = useCallback(
    (next: CanvasDoc, before?: CanvasDoc) => {
      setPast((p) => [...p, before ?? docRef.current].slice(-HISTORY_LIMIT))
      setFuture([])
      setDoc(next)
      persist(next, current)
    },
    [current, persist],
  )

  /** Изменение без истории — для промежуточных состояний перетаскивания. */
  const touch = useCallback((next: CanvasDoc) => setDoc(next), [])

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      const prev = p[p.length - 1]
      setFuture((f) => [docRef.current, ...f].slice(0, HISTORY_LIMIT))
      setDoc(prev)
      persist(prev, current)
      return p.slice(0, -1)
    })
  }, [current, persist])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      const next = f[0]
      setPast((p) => [...p, docRef.current].slice(-HISTORY_LIMIT))
      setDoc(next)
      persist(next, current)
      return f.slice(1)
    })
  }, [current, persist])

  useEffect(() => {
    void (async () => {
      const list = await listCanvases()
      setFiles(list)
      const names = await listNotes()
      setNotes(names)
      // Карточки-заметки показывают содержимое, поэтому тексты нужны сразу.
      const bodies = await Promise.all(names.map(async (n) => [n, (await readNote(n)) || ''] as const))
      setNoteBodies(new Map(bodies))
      const pick = name || list[0] || ''
      if (pick) void openCanvas(pick)
      else setCurrent('')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  const openCanvas = async (n: string) => {
    setCurrent(n)
    const d = await readCanvas(n)
    setDoc(d ?? { nodes: [], edges: [] })
    setPast([])
    setFuture([])
    setSel(new Set())
    setSelEdge(null)
  }

  const createCanvas = async () => {
    let n = 'Новая доска'
    let i = 2
    while (files.includes(n)) n = `Новая доска ${i++}`
    await writeCanvas(n, { nodes: [], edges: [], cardStyle: 'rich' })
    setFiles((f) => [...f, n])
    void openCanvas(n)
    toast(`Создана доска «${n}»`)
  }

  const dropCanvas = async () => {
    await deleteCanvas(current)
    const list = await listCanvases()
    setFiles(list)
    toast(`Доска «${current}» удалена`)
    if (list.length) void openCanvas(list[0])
    else {
      setCurrent('')
      setDoc({ nodes: [], edges: [] })
    }
  }

  // -------------------------------------------------------- данные карточек
  const from = period === '1m' ? addMonths(today(), -1) : period === '3m' ? addMonths(today(), -3) : addMonths(today(), -12)
  const periodLabel = period === '1m' ? 'месяц' : period === '3m' ? '3 месяца' : 'год'
  const nodeById = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes])
  // Считаем один раз на доску: иначе каждая карточка перебирает всю историю,
  // причём на каждом кадре перетаскивания.
  const cardCtx = useMemo(
    () => buildCardContext(data, from, periodLabel, noteBodies),
    [data, from, periodLabel, noteBodies],
  )
  const scoped = useMemo(() => data.transactions.filter((t) => t.date >= from), [data.transactions, from])

  const flowAmount = useCallback(
    (e: CanvasEdge): number => {
      const a = nodeById.get(e.fromNode)
      const b = nodeById.get(e.toNode)
      if (!a || !b) return 0
      if (a.type === 'category' && b.type === 'account') {
        return scoped
          .filter((t) => t.kind === 'income' && t.categoryId === a.ref && t.accountId === b.ref)
          .reduce((s, t) => s + t.amount, 0)
      }
      if (a.type === 'account' && b.type === 'category') {
        return scoped
          .filter(
            (t) => t.kind === 'expense' && t.accountId === a.ref &&
              (t.categoryId === b.ref || t.splits?.some((x) => x.categoryId === b.ref)),
          )
          .reduce(
            (s, t) =>
              s + (t.splits?.length
                ? t.splits.filter((x) => x.categoryId === b.ref).reduce((z, x) => z + x.amount, 0)
                : t.amount),
            0,
          )
      }
      if (a.type === 'account' && b.type === 'account') {
        return scoped
          .filter((t) => t.kind === 'transfer' && t.accountId === a.ref && t.toAccountId === b.ref)
          .reduce((s, t) => s + t.amount, 0)
      }
      return 0
    },
    [nodeById, scoped],
  )

  const maxFlow = useMemo(
    () => Math.max(1, ...doc.edges.filter((e) => e.flow).map(flowAmount)),
    [doc.edges, flowAmount],
  )

  // --------------------------------------------------------- координаты
  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const r = wrapRef.current?.getBoundingClientRect()
    const v = viewRef.current
    return { x: ((clientX - (r?.left ?? 0)) - v.x) / v.k, y: ((clientY - (r?.top ?? 0)) - v.y) / v.k }
  }, [])

  const toScreen = useCallback((p: Point): Point => {
    const v = viewRef.current
    return { x: p.x * v.k + v.x, y: p.y * v.k + v.y }
  }, [])

  // ------------------------------------------------------------- операции
  const addNode = useCallback(
    (type: CanvasNodeKind, at: Point, extra?: Partial<CanvasNode>): CanvasNode => {
      const size = DEFAULT_SIZE[type]
      return {
        id: uid('n'),
        type,
        x: Math.round((at.x - size.w / 2) / GRID) * GRID,
        y: Math.round((at.y - size.h / 2) / GRID) * GRID,
        width: size.w,
        height: size.h,
        color: CANVAS_COLORS[0].hex,
        ...extra,
      }
    },
    [],
  )

  const insertNode = useCallback(
    (type: CanvasNodeKind, at: Point, extra?: Partial<CanvasNode>, connectFrom?: { id: string; side: Side }) => {
      const node = addNode(type, at, extra)
      const edges = [...docRef.current.edges]
      if (connectFrom) {
        const src = nodeById.get(connectFrom.id)
        if (src) {
          const [fs, ts] = bestSides(src, node)
          edges.push({
            id: uid('e'),
            fromNode: src.id,
            fromSide: fs,
            toNode: node.id,
            toSide: ts,
            arrow: 'end',
            flow: src.type === 'account' || node.type === 'account',
          })
        }
      }
      commit({ ...docRef.current, nodes: [...docRef.current.nodes, node], edges })
      setSel(new Set([node.id]))
      setSelEdge(null)
      if (type === 'text' || type === 'query') setEditing(node.id)
      return node
    },
    [addNode, commit, nodeById],
  )

  const patchNode = useCallback(
    (id: string, patch: Partial<CanvasNode>, withHistory = true) => {
      const next = {
        ...docRef.current,
        nodes: docRef.current.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      }
      withHistory ? commit(next) : touch(next)
      if (!withHistory) persist(next, current)
    },
    [commit, touch, persist, current],
  )

  const patchEdge = useCallback(
    (id: string, patch: Partial<CanvasEdge>) => {
      commit({
        ...docRef.current,
        edges: docRef.current.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      })
    },
    [commit],
  )

  const removeNodes = useCallback(
    (ids: Set<string>) => {
      if (!ids.size) return
      commit({
        ...docRef.current,
        nodes: docRef.current.nodes.filter((n) => !ids.has(n.id)),
        edges: docRef.current.edges.filter((e) => !ids.has(e.fromNode) && !ids.has(e.toNode)),
      })
      setSel(new Set())
    },
    [commit],
  )

  const removeEdge = useCallback(
    (id: string) => {
      commit({ ...docRef.current, edges: docRef.current.edges.filter((e) => e.id !== id) })
      setSelEdge(null)
    },
    [commit],
  )

  const copySelection = useCallback(() => {
    const ids = sel
    if (!ids.size) return
    const nodes = docRef.current.nodes.filter((n) => ids.has(n.id))
    const edges = docRef.current.edges.filter((e) => ids.has(e.fromNode) && ids.has(e.toNode))
    clipboard = { nodes, edges }
    toast(`Скопировано узлов: ${nodes.length}`)
  }, [sel, toast])

  const paste = useCallback(() => {
    if (!clipboard?.nodes.length) return
    const map = new Map<string, string>()
    const nodes = clipboard.nodes.map((n) => {
      const id = uid('n')
      map.set(n.id, id)
      return { ...n, id, x: n.x + 24, y: n.y + 24 }
    })
    const edges = clipboard.edges.map((e) => ({
      ...e,
      id: uid('e'),
      fromNode: map.get(e.fromNode)!,
      toNode: map.get(e.toNode)!,
    }))
    commit({
      ...docRef.current,
      nodes: [...docRef.current.nodes, ...nodes],
      edges: [...docRef.current.edges, ...edges],
    })
    setSel(new Set(nodes.map((n) => n.id)))
    toast(`Вставлено узлов: ${nodes.length}`)
  }, [commit, toast])

  const duplicate = useCallback(
    (id: string) => {
      const n = nodeById.get(id)
      if (!n) return
      const copy = { ...n, id: uid('n'), x: n.x + 24, y: n.y + 24 }
      commit({ ...docRef.current, nodes: [...docRef.current.nodes, copy] })
      setSel(new Set([copy.id]))
    },
    [commit, nodeById],
  )

  /**
   * Меняет масштаб, оставляя точку (px, py) экрана над той же точкой доски.
   * Без центра берём середину полотна — так работают кнопки и клавиши.
   * Новое значение считается внутри setView: два события колеса могут прийти
   * в одном такте, и снаружи масштаб к этому моменту ещё старый.
   */
  const zoomWith = useCallback(
    (next: (k: number) => number, px?: number, py?: number) => {
      const r = wrapRef.current?.getBoundingClientRect()
      const mx = px ?? (r ? r.width / 2 : 0)
      const my = py ?? (r ? r.height / 2 : 0)
      setView((v) => {
        const k = next(v.k)
        if (k === v.k) return v
        return { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }
      })
    },
    [],
  )
  /** На `dir` ступеней от текущей. */
  const zoomBy = useCallback(
    (dir: 1 | -1, px?: number, py?: number) => zoomWith((k) => stepZoom(k, dir), px, py),
    [zoomWith],
  )

  const zoomToFit = useCallback(
    (only?: Set<string>) => {
      const list = only?.size ? doc.nodes.filter((n) => only.has(n.id)) : doc.nodes
      const b = boundsOf(list)
      const r = wrapRef.current?.getBoundingClientRect()
      if (!b || !r) {
        setView({ x: 420, y: 260, k: ZOOM_DEFAULT })
        return
      }
      // Округляем вниз: на ступень выше содержимое уже не влезет.
      const k = stepBelow(Math.min((r.width - 120) / (b.width || 1), (r.height - 120) / (b.height || 1)))
      setView({ k, x: r.width / 2 - (b.x + b.width / 2) * k, y: r.height / 2 - (b.y + b.height / 2) * k })
    },
    [doc.nodes],
  )

  // ------------------------------------------------------------- меню
  const nodeMenuItems = useCallback(
    (at: Point, connectFrom?: { id: string; side: Side }): MenuItem[] => [
      {
        id: 'text',
        label: 'Текстовая карточка',
        icon: 'edit',
        onClick: () => insertNode('text', at, { text: '' }, connectFrom),
      },
      {
        id: 'note',
        label: 'Заметка из хранилища',
        icon: 'note',
        disabled: !notes.length,
        children: notes.map((n) => ({
          id: 'note:' + n,
          label: n,
          icon: 'note',
          onClick: () => insertNode('note', at, { file: n }, connectFrom),
        })),
      },
      {
        id: 'account',
        label: 'Счёт',
        icon: 'wallet',
        disabled: !data.accounts.length,
        children: data.accounts.filter((a) => !a.archived).map((a) => ({
          id: 'acc:' + a.id,
          label: `${a.icon} ${a.name}`,
          onClick: () => insertNode('account', at, { ref: a.id, color: a.color }, connectFrom),
        })),
      },
      {
        id: 'category',
        label: 'Категория',
        icon: 'tag',
        disabled: !data.categories.length,
        children: data.categories.filter((c) => !c.archived).map((c) => ({
          id: 'cat:' + c.id,
          label: `${c.icon} ${c.name}`,
          onClick: () => insertNode('category', at, { ref: c.id, color: c.color }, connectFrom),
        })),
      },
      {
        id: 'goal',
        label: 'Цель',
        icon: 'target',
        disabled: !data.goals.length,
        children: data.goals.map((g) => ({
          id: 'goal:' + g.id,
          label: `${g.icon} ${g.name}`,
          onClick: () => insertNode('goal', at, { ref: g.id, color: g.color }, connectFrom),
        })),
      },
      {
        id: 'scenario',
        label: 'Сценарий',
        icon: 'chart',
        disabled: !data.scenarios.length,
        children: data.scenarios.map((s) => ({
          id: 'sc:' + s.id,
          label: s.name,
          onClick: () => insertNode('scenario', at, { ref: s.id }, connectFrom),
        })),
      },
      {
        id: 'query',
        label: 'Блок-запрос',
        icon: 'donut',
        onClick: () =>
          insertNode(
            'query',
            at,
            { text: 'type: chart\nchart: donut\nkind: expense\nperiod: 3m\ngroup: category\nlimit: 6' },
            connectFrom,
          ),
      },
    ],
    [insertNode, notes, data],
  )

  const openCanvasMenu = (clientX: number, clientY: number) => {
    const at = toWorld(clientX, clientY)
    setMenu({
      x: clientX,
      y: clientY,
      items: [
        { id: 'add', label: 'Добавить', icon: 'plus', children: nodeMenuItems(at) },
        { id: 'paste', label: 'Вставить', icon: 'copy', hint: 'Ctrl+V', disabled: !clipboard?.nodes.length, onClick: paste },
        { id: 'all', label: 'Выделить всё', icon: 'check', hint: 'Ctrl+A', onClick: () => setSel(new Set(doc.nodes.map((n) => n.id))) },
        { id: 'fit', label: 'Вписать всё', icon: 'fit', onClick: () => zoomToFit() },
      ],
    })
  }

  const openNodeMenu = (clientX: number, clientY: number, node: CanvasNode) => {
    const many = sel.size > 1 && sel.has(node.id)
    setMenu({
      x: clientX,
      y: clientY,
      title: many ? `Выделено узлов: ${sel.size}` : undefined,
      items: [
        ...(node.type === 'text' || node.type === 'query'
          ? [{ id: 'edit', label: 'Редактировать', icon: 'edit', onClick: () => setEditing(node.id) }]
          : []),
        {
          id: 'color',
          label: 'Цвет',
          icon: 'palette',
          children: [
            {
              id: 'sw',
              label: '',
              swatches: quickColors.map((hex) => ({ value: hex, label: colorName(hex) })),
              onPick: (hex: string) => paintNodes(many ? sel : new Set([node.id]), hex),
            },
            {
              id: 'more',
              label: 'Все цвета и настройка ряда…',
              icon: 'palette',
              onClick: () => setPalette(many ? new Set(sel) : new Set([node.id])),
            },
          ],
        },
        ...(node.type === 'text'
          ? [{
              id: 'fit',
              label: 'Поведение текста',
              icon: 'scale',
              children: FIT_MODES.map((m) => ({
                id: 'fit:' + m.id,
                label: (node.fit ?? 'fixed') === m.id ? '● ' + m.name : m.name,
                hint: undefined,
                onClick: () => patchNode(node.id, { fit: m.id as TextFit }),
              })),
            }]
          : []),
        { id: 'dup', label: 'Дублировать', icon: 'copy', onClick: () => duplicate(node.id) },
        { id: 'copy', label: 'Копировать', icon: 'copy', hint: 'Ctrl+C', onClick: copySelection },
        ...(node.ref || node.file
          ? [{ id: 'open', label: 'Открыть раздел', icon: 'arrowRight', onClick: () => openNodeTarget(node) }]
          : []),
        {
          id: 'del',
          label: many ? `Удалить ${sel.size} узла` : 'Удалить',
          icon: 'trash',
          hint: 'Del',
          danger: true,
          onClick: () => removeNodes(many ? sel : new Set([node.id])),
        },
      ],
    })
  }

  const paintNodes = useCallback(
    (ids: Set<string>, hex: string) => {
      commit({
        ...docRef.current,
        nodes: docRef.current.nodes.map((n) => (ids.has(n.id) ? { ...n, color: hex } : n)),
      })
    },
    [commit],
  )

  const openNodeTarget = (n: CanvasNode) => {
    if (n.type === 'note' && n.file) app.openTab('notes', n.file)
    else if (n.type === 'category' && n.ref) app.openTab('transactions', 'cat:' + n.ref, { title: 'Категория' })
    else if (n.type === 'account') app.openTab('accounts')
    else if (n.type === 'goal') app.openTab('goals')
    else if (n.type === 'scenario') app.openTab('forecast')
  }

  // ------------------------------------------------------------- мышь
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const r = wrapRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      wheelAcc.current += e.deltaY
      if (Math.abs(wheelAcc.current) < 60) return
      const dir: 1 | -1 = wheelAcc.current < 0 ? 1 : -1
      wheelAcc.current = 0
      zoomBy(dir, mx, my)
    } else {
      setView((v) => ({ ...v, x: v.x - e.deltaY }))
    }
  }

  const onBackgroundDown = (e: React.MouseEvent) => {
    if (!isBackground(e.target)) return
    setMenu(null)
    if (e.button === 2) return
    if (e.button === 1 || space.current || e.altKey) {
      drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
      return
    }
    if (!e.shiftKey) {
      setSel(new Set())
      setSelEdge(null)
    }
    const w = toWorld(e.clientX, e.clientY)
    drag.current = { mode: 'marquee', sx: e.clientX, sy: e.clientY, ox: w.x, oy: w.y }
    setMarquee({ x: w.x, y: w.y, width: 0, height: 0 })
  }

  /**
   * Итог перетаскивания считается из координат события, а не из состояния React.
   * Иначе последнее движение мыши, не успевшее отрисоваться до отпускания,
   * пропадало — узел приземлялся на кадр раньше, а рамка выделяла не всё.
   */
  const dragResult = useCallback(
    (d: DragState, clientX: number, clientY: number, withGuides = false): CanvasDoc | null => {
      const k = viewRef.current.k
      const dx = (clientX - d.sx) / k
      const dy = (clientY - d.sy) / k
      const cur = docRef.current

      if (d.mode === 'node' && d.start) {
        const movingIds = new Set(d.start.keys())
        const lead = cur.nodes.find((n) => n.id === d.id)
        let adjX = 0
        let adjY = 0
        if (lead) {
          const origin = d.start.get(lead.id)!
          const probe: Rect = { x: origin.x + dx, y: origin.y + dy, width: lead.width, height: lead.height }
          const snap = snapToNeighbours(probe, cur.nodes.filter((n) => !movingIds.has(n.id)))
          adjX = snap.dx
          adjY = snap.dy
          if (withGuides) setGuides(snap.guides)
        }
        return {
          ...cur,
          nodes: cur.nodes.map((n) => {
            const origin = d.start!.get(n.id)
            if (!origin) return n
            return {
              ...n,
              x: Math.round((origin.x + dx + adjX) / GRID) * GRID,
              y: Math.round((origin.y + dy + adjY) / GRID) * GRID,
            }
          }),
        }
      }

      if (d.mode === 'resize' && d.id && d.rect0 && d.corner) {
        const r = d.rect0
        const c = d.corner
        let x = r.x
        let y = r.y
        let width = r.width
        let height = r.height

        if (c.includes('e')) width = r.width + dx
        if (c.includes('w')) {
          width = r.width - dx
          x = r.x + dx
        }
        if (c.includes('s')) height = r.height + dy
        if (c.includes('n')) {
          height = r.height - dy
          y = r.y + dy
        }
        // Дотянув угол за противоположный край, карточку не выворачиваем:
        // упираемся в минимум, а неподвижная сторона остаётся на месте.
        if (width < MIN_W) {
          if (c.includes('w')) x = r.x + r.width - MIN_W
          width = MIN_W
        }
        if (height < MIN_H) {
          if (c.includes('n')) y = r.y + r.height - MIN_H
          height = MIN_H
        }

        const snap = (v: number) => Math.round(v / GRID) * GRID
        return {
          ...cur,
          nodes: cur.nodes.map((n) =>
            n.id === d.id ? { ...n, x: snap(x), y: snap(y), width: snap(width), height: snap(height) } : n,
          ),
        }
      }
      return null
    },
    [],
  )

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current
      if (!d) return
      d.moved = true

      if (d.mode === 'pan') {
        setView((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
        return
      }
      if (d.mode === 'marquee') {
        setMarquee(rectFrom({ x: d.ox, y: d.oy }, toWorld(e.clientX, e.clientY)))
        return
      }
      if (d.mode === 'node' || d.mode === 'resize') {
        const next = dragResult(d, e.clientX, e.clientY, true)
        if (next) touch(next)
        return
      }
      if (d.mode === 'edge' && d.id) {
        const src = docRef.current.nodes.find((n) => n.id === d.id)
        if (src) setGhost({ from: anchor(src, d.side!), side: d.side!, to: toWorld(e.clientX, e.clientY) })
        return
      }
      if (d.mode === 'edge-end' && d.id) {
        const edge = docRef.current.edges.find((x) => x.id === d.id)
        if (!edge) return
        const anchorNode = docRef.current.nodes.find((n) => n.id === (d.end === 'from' ? edge.toNode : edge.fromNode))
        if (anchorNode) {
          const side = d.end === 'from' ? edge.toSide : edge.fromSide
          setGhost({ from: anchor(anchorNode, side), side, to: toWorld(e.clientX, e.clientY) })
        }
      }
    }

    const up = (e: MouseEvent) => {
      const d = drag.current
      drag.current = null
      setGuides([])
      if (!d) return

      if (d.mode === 'marquee') {
        setMarquee(null)
        const box = rectFrom({ x: d.ox, y: d.oy }, toWorld(e.clientX, e.clientY))
        if (box.width > 4 || box.height > 4) {
          const hit = docRef.current.nodes.filter((n) => rectsOverlap(box, n)).map((n) => n.id)
          setSel((prev) => (e.shiftKey ? new Set([...prev, ...hit]) : new Set(hit)))
        }
        return
      }

      if ((d.mode === 'node' || d.mode === 'resize') && d.moved && d.before) {
        const final = dragResult(d, e.clientX, e.clientY) ?? docRef.current
        setDoc(final)
        setPast((p) => [...p, d.before!].slice(-HISTORY_LIMIT))
        setFuture([])
        persist(final, current)
        return
      }

      if (d.mode === 'edge' && d.id) {
        setGhost(null)
        const w = toWorld(e.clientX, e.clientY)
        const target = docRef.current.nodes.find((n) => n.id !== d.id && inRect(n, w))
        if (target) {
          const src = docRef.current.nodes.find((n) => n.id === d.id)!
          commit({
            ...docRef.current,
            edges: [
              ...docRef.current.edges,
              {
                id: uid('e'),
                fromNode: d.id,
                fromSide: d.side!,
                toNode: target.id,
                toSide: sideTowards(target, w),
                arrow: 'end',
                flow: src.type === 'account' || target.type === 'account',
              },
            ],
          })
        } else {
          // Пустое место — предлагаем, что здесь создать, и сразу соединяем.
          setMenu({
            x: e.clientX,
            y: e.clientY,
            title: 'Что здесь создать?',
            items: nodeMenuItems(w, { id: d.id, side: d.side! }),
          })
        }
        return
      }

      if (d.mode === 'edge-end' && d.id) {
        setGhost(null)
        const w = toWorld(e.clientX, e.clientY)
        const target = docRef.current.nodes.find((n) => inRect(n, w))
        if (target) {
          const patch: Partial<CanvasEdge> =
            d.end === 'from'
              ? { fromNode: target.id, fromSide: sideTowards(target, w) }
              : { toNode: target.id, toSide: sideTowards(target, w) }
          patchEdge(d.id, patch)
        }
      }
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [toWorld, commit, patchEdge, persist, current, nodeMenuItems, touch, dragResult])

  // ------------------------------------------------------------ клавиши
  useEffect(() => {
    const inField = (t: EventTarget | null) =>
      ['INPUT', 'TEXTAREA', 'SELECT'].includes((t as HTMLElement)?.tagName)

    const down = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = true
      if (inField(e.target)) {
        // Внутри текстовой карточки Ctrl+B/I/U оформляют выделение.
        const el = areaRef.current
        const mod2 = e.ctrlKey || e.metaKey
        if (!el || e.target !== el || !mod2 || !editing) return
        const wrap = { b: ['**', '**'], i: ['*', '*'], u: ['<u>', '</u>'] }[e.key.toLowerCase()]
        if (!wrap) return
        e.preventDefault()
        patchNode(editing, { text: wrapSelection(el, wrap[0], wrap[1]) }, false)
        return
      }
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copySelection()
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        paste()
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (sel.size === 1) duplicate([...sel][0])
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSel(new Set(docRef.current.nodes.map((n) => n.id)))
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomBy(1)
      } else if (mod && e.key === '-') {
        e.preventDefault()
        zoomBy(-1)
      } else if (mod && e.key === '0') {
        e.preventDefault()
        zoomWith(() => ZOOM_DEFAULT)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selEdge) {
          e.preventDefault()
          removeEdge(selEdge)
        } else if (sel.size) {
          e.preventDefault()
          removeNodes(sel)
        }
      } else if (e.key === 'Escape') {
        setSel(new Set())
        setSelEdge(null)
        setEditing(null)
        setMenu(null)
      } else if (e.key === 'Enter' && sel.size === 1) {
        const n = nodeById.get([...sel][0])
        if (n && (n.type === 'text' || n.type === 'query')) {
          e.preventDefault()
          setEditing(n.id)
        }
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [undo, redo, copySelection, paste, duplicate, sel, selEdge, removeEdge, removeNodes, nodeById, editing, patchNode, zoomBy, zoomWith])

  // ------------------------------------------------------------- рендер
  const selectedEdge = selEdge ? doc.edges.find((e) => e.id === selEdge) : null
  const edgeCurve = (e: CanvasEdge) => {
    const a = nodeById.get(e.fromNode)
    const b = nodeById.get(e.toNode)
    if (!a || !b) return null
    return curveOf(anchor(a, e.fromSide), e.fromSide, anchor(b, e.toSide), e.toSide)
  }

  if (!current) {
    return (
      <div className="view" style={{ maxWidth: 620, marginTop: 40 }}>
        <h1 className="view-title">Канвас</h1>
        <div className="view-sub" style={{ marginBottom: 18 }}>
          Доска, на которой рядом живут заметки, счета, категории и цели. Связи между ними —
          стрелки: если соединить счёт с категорией, толщина покажет оборот между ними.
        </div>
        <button className="btn primary" onClick={createCanvas}>
          <Icon name="plus" size={15} /> Создать первую доску
        </button>
      </div>
    )
  }

  // Сдвиг округляем до целого пикселя: дробное смещение размывает текст
  // даже при масштабе 100 %, потому что буквы перестают попадать в сетку.
  const vx = Math.round(view.x)
  const vy = Math.round(view.y)

  return (
    <div
      className="canvas-wrap"
      ref={wrapRef}
      onWheel={onWheel}
      onMouseDown={onBackgroundDown}
      onContextMenu={(e) => {
        e.preventDefault()
        if (isBackground(e.target)) openCanvasMenu(e.clientX, e.clientY)
      }}
      onDoubleClick={(e) => {
        if (isBackground(e.target)) insertNode('text', toWorld(e.clientX, e.clientY), { text: '' })
      }}
    >
      <div
        className="canvas-dots"
        style={{
          backgroundSize: `${20 * view.k}px ${20 * view.k}px`,
          backgroundPosition: `${vx}px ${vy}px`,
          opacity: view.k > 0.4 ? 1 : 0,
        }}
      />

      {/* ---------------------------------------------------- связи */}
      <svg className="canvas-edges">
        <defs>
          <marker id="cv-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0,1 L9,5 L0,9 z" fill="var(--faint)" />
          </marker>
          <marker id="cv-arrow-sel" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
            <path d="M0,1 L9,5 L0,9 z" fill="var(--accent)" />
          </marker>
          <marker id="cv-arrow-back" markerWidth="10" markerHeight="10" refX="2" refY="5" orient="auto">
            <path d="M9,1 L0,5 L9,9 z" fill="var(--faint)" />
          </marker>
        </defs>
        <g transform={`translate(${vx},${vy}) scale(${view.k})`}>
          {doc.edges.map((e) => {
            const c = edgeCurve(e)
            if (!c) return null
            const amount = e.flow ? flowAmount(e) : 0
            const w = e.flow ? 1.6 + (amount / maxFlow) * 9 : 2
            const mid = midpoint(c)
            const on = selEdge === e.id
            const arrow = e.arrow ?? 'end'
            const from = nodeById.get(e.fromNode)
            return (
              <g key={e.id} className={'cv-edge' + (on ? ' on' : '')}>
                {/* Широкая прозрачная дорожка — попасть мышью по кривой иначе тяжело. */}
                <path
                  d={pathOf(c)}
                  className="cv-hit"
                  onMouseDown={(ev) => {
                    ev.stopPropagation()
                    setSelEdge(e.id)
                    setSel(new Set())
                    setMenu(null)
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    setSelEdge(e.id)
                    setMenu({
                      x: ev.clientX,
                      y: ev.clientY,
                      title: 'Связь',
                      items: edgeMenuItems(e),
                    })
                  }}
                />
                <path
                  d={pathOf(c)}
                  fill="none"
                  stroke={on ? 'var(--accent)' : e.color ?? (e.flow ? from?.color ?? 'var(--faint)' : 'var(--faint)')}
                  strokeWidth={on ? w + 1 : w}
                  opacity={on ? 0.95 : e.flow ? 0.5 : 0.75}
                  markerEnd={arrow === 'none' ? undefined : on ? 'url(#cv-arrow-sel)' : 'url(#cv-arrow)'}
                  markerStart={arrow === 'both' ? 'url(#cv-arrow-back)' : undefined}
                  pointerEvents="none"
                />
                {(e.label || (e.flow && amount > 0)) && view.k > 0.45 && (
                  <text x={mid.x} y={mid.y - 7} textAnchor="middle" className="cv-edge-label" pointerEvents="none">
                    {e.label ? e.label + ' ' : ''}
                    {e.flow && amount > 0 ? moneyShort(amount) : ''}
                  </text>
                )}
                {on && (
                  <>
                    <circle className="cv-end" cx={c.p0.x} cy={c.p0.y} r={6 / view.k}
                      onMouseDown={(ev) => {
                        ev.stopPropagation()
                        drag.current = { mode: 'edge-end', id: e.id, end: 'from', sx: ev.clientX, sy: ev.clientY, ox: 0, oy: 0 }
                      }} />
                    <circle className="cv-end" cx={c.p3.x} cy={c.p3.y} r={6 / view.k}
                      onMouseDown={(ev) => {
                        ev.stopPropagation()
                        drag.current = { mode: 'edge-end', id: e.id, end: 'to', sx: ev.clientX, sy: ev.clientY, ox: 0, oy: 0 }
                      }} />
                  </>
                )}
              </g>
            )
          })}

          {ghost && (
            <path
              // Конец кривой заходит в курсор со стороны, противоположной началу,
              // иначе на коротком расстоянии связь закручивается петлёй.
              d={pathOf(curveOf(ghost.from, ghost.side, ghost.to, opposite(ghost.side)))}
              className="cv-ghost"
              markerEnd="url(#cv-arrow-sel)"
            />
          )}

          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <line key={i} className="cv-guide" x1={g.at} x2={g.at} y1={g.from} y2={g.to} />
            ) : (
              <line key={i} className="cv-guide" x1={g.from} x2={g.to} y1={g.at} y2={g.at} />
            ),
          )}

          {marquee && (
            <rect className="cv-marquee" x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} />
          )}
        </g>
      </svg>

      {/* ---------------------------------------------------- узлы */}
      <div className="canvas-layer" style={{ transform: `translate(${vx}px, ${vy}px) scale(${view.k})` }}>
        {doc.nodes.map((n) => {
          const info = nodeData(n, data, cardCtx)
          const selected = sel.has(n.id)
          return (
            <div
              key={n.id}
              className={`cnode cnode-${cardStyle} cnode-t-${n.type}${selected ? ' sel' : ''}`}
              style={{
                left: n.x,
                top: n.y,
                width: n.width,
                height: n.height,
                '--cnode-color': n.color || 'var(--accent)',
              } as React.CSSProperties}
              onMouseDown={(e) => {
                if (e.button === 2) return
                e.stopPropagation()
                setMenu(null)
                setSelEdge(null)
                const already = sel.has(n.id)
                const next = e.shiftKey
                  ? new Set(already ? [...sel].filter((x) => x !== n.id) : [...sel, n.id])
                  : already ? sel : new Set([n.id])
                setSel(next)
                if (editing === n.id) return
                const start = new Map<string, Point>()
                for (const id of next) {
                  const nd = nodeById.get(id)
                  if (nd) start.set(id, { x: nd.x, y: nd.y })
                }
                drag.current = {
                  mode: 'node', id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y,
                  start, before: docRef.current,
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!sel.has(n.id)) setSel(new Set([n.id]))
                openNodeMenu(e.clientX, e.clientY, n)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                if (n.type === 'text' || n.type === 'query') setEditing(n.id)
                else openNodeTarget(n)
              }}
            >
              <NodeBody
                node={n}
                info={info}
                style={cardStyle}
                editing={editing === n.id}
                areaRef={editing === n.id ? areaRef : undefined}
                onChange={(patch) => patchNode(n.id, patch, false)}
                onEndEdit={() => {
                  setEditing(null)
                  commit(docRef.current)
                }}
                onLink={(title) => app.openTab('notes', title)}
                onGrow={(height) => patchNode(n.id, { height }, false)}
              />

              {SIDES.map((s) => (
                <div
                  key={s}
                  className={`cnode-handle h-${s}`}
                  title="Потяните, чтобы связать"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    setMenu(null)
                    drag.current = { mode: 'edge', id: n.id, side: s, sx: e.clientX, sy: e.clientY, ox: 0, oy: 0 }
                  }}
                />
              ))}
              {CORNERS.map((c) => (
                <div
                  key={c}
                  className={`cnode-resize r-${c}`}
                  title="Потяните, чтобы изменить размер"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    drag.current = {
                      mode: 'resize', id: n.id, corner: c,
                      rect0: { x: n.x, y: n.y, width: n.width, height: n.height },
                      sx: e.clientX, sy: e.clientY, ox: n.width, oy: n.height,
                      before: docRef.current,
                    }
                  }}
                />
              ))}
            </div>
          )
        })}
      </div>

      {doc.nodes.length === 0 && (
        <div className="canvas-empty">
          <div className="strong" style={{ fontSize: 16, marginBottom: 6 }}>Доска пустая</div>
          <div className="faint small" style={{ lineHeight: 1.6, maxWidth: 380 }}>
            Двойной клик по полотну создаёт карточку. Кнопка «Добавить» сверху кладёт счёт,
            категорию, цель или заметку. Чтобы связать две карточки, потяните за кружок на краю —
            если отпустить на пустом месте, программа предложит, что там создать.
          </div>
        </div>
      )}

      {/* -------------------------------------------- панель у связи */}
      {selectedEdge && (() => {
        const c = edgeCurve(selectedEdge)
        if (!c) return null
        const p = toScreen(midpoint(c))
        return (
          <div className="edge-bar" style={{ left: p.x, top: p.y - 46 }} onMouseDown={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={selectedEdge.label ?? ''}
              placeholder="подпись"
              onChange={(e) => patchEdge(selectedEdge.id, { label: e.target.value || undefined })}
              style={{ width: 120, padding: '3px 8px' }}
            />
            <span className="edge-bar-sep" />
            {CANVAS_COLORS.map((c2) => (
              <button
                key={c2.key}
                className="ctx-swatch sm"
                style={{ background: c2.hex }}
                title={c2.key}
                onClick={() => patchEdge(selectedEdge.id, { color: c2.hex })}
              />
            ))}
            <span className="edge-bar-sep" />
            {(['end', 'both', 'none'] as EdgeArrow[]).map((a) => (
              <button
                key={a}
                className={'icon-btn' + ((selectedEdge.arrow ?? 'end') === a ? ' active' : '')}
                title={a === 'end' ? 'Стрелка в конце' : a === 'both' ? 'В обе стороны' : 'Без стрелки'}
                onClick={() => patchEdge(selectedEdge.id, { arrow: a })}
              >
                <Icon name={a === 'end' ? 'arrowRight' : a === 'both' ? 'repeat' : 'minus'} size={15} />
              </button>
            ))}
            <button className="icon-btn" title="Удалить связь (Del)" onClick={() => removeEdge(selectedEdge.id)}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        )
      })()}

      {/* -------------------------------------------- верхняя панель */}
      <div className="canvas-tools" onMouseDown={(e) => e.stopPropagation()}>
        <select value={current} onChange={(e) => void openCanvas(e.target.value)} style={{ width: 160 }}>
          {files.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <button className="icon-btn" title="Новая доска" onClick={createCanvas}>
          <Icon name="plus" size={16} />
        </button>
        <button className="icon-btn" title="Удалить доску" onClick={() => setAskDelete(true)}>
          <Icon name="trash" size={15} />
        </button>
        <span className="tool-sep" />
        <button
          className="btn sm"
          onClick={(e) => {
            const r = wrapRef.current!.getBoundingClientRect()
            setMenu({
              x: e.clientX,
              y: e.clientY,
              title: 'Добавить на доску',
              items: nodeMenuItems(toWorld(r.left + r.width / 2, r.top + r.height / 2)),
            })
          }}
        >
          <Icon name="plus" size={14} /> Добавить
        </button>
        <span className="tool-sep" />
        <button className="icon-btn" title="Отменить (Ctrl+Z)" disabled={!past.length} onClick={undo}>
          <Icon name="left" size={15} />
        </button>
        <button className="icon-btn" title="Повторить (Ctrl+Y)" disabled={!future.length} onClick={redo}>
          <Icon name="right" size={15} />
        </button>
        <span className="tool-sep" />
        <div className="seg">
          {CARD_STYLES.map((s) => (
            <button
              key={s.id}
              className={cardStyle === s.id ? 'on' : ''}
              title={s.about}
              onClick={() => commit({ ...doc, cardStyle: s.id })}
            >
              {s.name}
            </button>
          ))}
        </div>
        <span className="tool-sep" />
        <div className="seg">
          {(['1m', '3m', '12m'] as const).map((p) => (
            <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
              {p === '1m' ? 'месяц' : p === '3m' ? '3 мес' : 'год'}
            </button>
          ))}
        </div>
      </div>

      {/* -------------------------------------------- нижняя панель */}
      <div className="canvas-hud" onMouseDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="Мельче (Ctrl+−)" disabled={view.k <= ZOOM_STEPS[0]}
          onClick={() => zoomBy(-1)}>
          <Icon name="minus" size={15} />
        </button>
        <button className="hud-zoom num" title="Вернуть 100 % (Ctrl+0)" onClick={() => zoomWith(() => ZOOM_DEFAULT)}>
          {Math.round(view.k * 100)}%
        </button>
        <button className="icon-btn" title="Крупнее (Ctrl+=)" disabled={view.k >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          onClick={() => zoomBy(1)}>
          <Icon name="plus" size={15} />
        </button>
        <button className="icon-btn" title="Вписать всё" onClick={() => zoomToFit()}>
          <Icon name="fit" size={15} />
        </button>
        <span className="tool-sep" />
        <span className="faint small">
          {sel.size > 0 ? `выделено ${sel.size}` : `${doc.nodes.length} узлов · ${doc.edges.length} связей`}
        </span>
        <span className="faint small" style={{ marginLeft: 8, opacity: 0.7 }}>
          рамка — выделение · средняя кнопка или пробел — сдвиг · правый клик — меню
        </span>
      </div>

      {(() => {
        if (!editing) return null
        const n = nodeById.get(editing)
        if (!n || n.type !== 'text') return null
        const p = toScreen({ x: n.x, y: n.y })
        return (
          <div className="text-toolbar-holder" style={{ left: p.x, top: p.y - 44 }}>
            <TextToolbar
              areaRef={areaRef}
              fontSize={n.fontSize ?? DEFAULT_FONT_SIZE}
              fit={n.fit ?? 'fixed'}
              onText={(text) => patchNode(n.id, { text }, false)}
              onFontSize={(fontSize) => patchNode(n.id, { fontSize }, false)}
              onFit={(fit) => patchNode(n.id, { fit }, false)}
            />
          </div>
        )
      })()}

      {palette && (
        <ColorPalette
          value={nodeById.get([...palette][0])?.color}
          quick={quickColors}
          onPick={(hex) => paintNodes(palette, hex)}
          onQuickChange={(next) => commit({ ...docRef.current, quickColors: next })}
          onClose={() => setPalette(null)}
        />
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={() => setMenu(null)} />}

      {askDelete && (
        <Confirm
          title={`Удалить доску «${current}»?`}
          text={`Файл доски исчезнет из хранилища вместе с ${doc.nodes.length} узлами и ${doc.edges.length} связями. Заметки, счета и категории, на которые ссылались карточки, останутся нетронутыми — удаляется только сама схема.`}
          onConfirm={() => void dropCanvas()}
          onClose={() => setAskDelete(false)}
        />
      )}
    </div>
  )

  function edgeMenuItems(e: CanvasEdge): MenuItem[] {
    return [
      {
        id: 'color',
        label: 'Цвет',
        icon: 'palette',
        children: [
          {
            id: 'sw',
            label: '',
            swatches: CANVAS_COLORS.map((c) => ({ value: c.hex, label: c.key })),
            onPick: (hex: string) => patchEdge(e.id, { color: hex }),
          },
        ],
      },
      {
        id: 'arrow',
        label: 'Направление',
        icon: 'arrowRight',
        children: [
          { id: 'end', label: 'Стрелка в конце', onClick: () => patchEdge(e.id, { arrow: 'end' }) },
          { id: 'both', label: 'В обе стороны', onClick: () => patchEdge(e.id, { arrow: 'both' }) },
          { id: 'none', label: 'Без стрелки', onClick: () => patchEdge(e.id, { arrow: 'none' }) },
        ],
      },
      { id: 'flow', label: e.flow ? 'Не показывать оборот' : 'Показывать оборот', icon: 'flow', onClick: () => patchEdge(e.id, { flow: !e.flow }) },
      { id: 'del', label: 'Удалить связь', icon: 'trash', danger: true, hint: 'Del', onClick: () => removeEdge(e.id) },
    ]
  }
}
