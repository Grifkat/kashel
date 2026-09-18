/*
 * Граф связей: объёмная схема денег и заметок.
 *
 * Вид собран из двух образцов. От sigma.js — чистая схема: плоские цветные
 * узлы со значками, подписи на подложке и без наложений, панель поиска и
 * фильтров, карточка выбранного узла. От 3d-force-graph — объём: граф
 * раскладывается в пространстве, его можно вращать, дальние узлы мельче и
 * бледнее. Переключатель «Схема» сплющивает объём в плоскость — для тех, кому
 * удобнее читать граф как чертёж.
 *
 * Библиотек нет: раскладка — та же силовая модель, что и раньше, только в
 * трёх измерениях, а проекция — перспектива с поворотом камеры по двум осям.
 * Рисуется SVG: узлов здесь десятки, а не тысячи, и SVG даёт значки из
 * каталога как есть, выделение текста и проверку в jsdom.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { CatalogGlyph, Icon } from '../lib/icons'
import { listNotes, readNote } from '../state/vault'
import { extractLinks, extractTags } from '../lib/markdown'
import { addMonths, today } from '../lib/date'
import { money, moneyShort, plural } from '../lib/format'
import { accountBalance, categoryTotals } from '../engine/stats'
import { isCatalogIcon } from '../lib/catalog'
import { этоСвойЗначокъ, useСвойЗначокъ } from '../lib/svoiznachki'
import { iconInk, Toggle } from '../components/ui'
import { useSize } from '../components/charts'
import { useAnimLevel } from '../components/anim'
import { т, тр } from '../i18n'

type Kind = 'note' | 'category' | 'account' | 'goal' | 'tag'

interface GNode {
  id: string
  label: string
  kind: Kind
  color: string
  icon?: string
  r: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  ref?: string
  /** Держит ли узел мышь: такой узел силы не двигают. */
  fixed?: boolean
  /** Сумма за период (категории, счета) или накоплено (цели). */
  amount?: number
  count?: number
  sub?: string
}
interface GLink {
  a: string
  b: string
  w: number
  amount?: number
}

const KIND_COLOR: Record<Kind, string> = {
  note: '#8b95a5',
  category: '#e8833a',
  account: '#4cc46a',
  goal: '#8b5cf6',
  tag: '#4aa3e8',
}
const KIND_LABEL: Record<Kind, string> = {
  note: т('Заметки'),
  category: т('Категории'),
  account: т('Счета'),
  goal: т('Цели'),
  tag: т('Теги'),
}
const KIND_ONE: Record<Kind, string> = {
  note: т('Заметка'),
  category: т('Категория'),
  account: т('Счёт'),
  goal: т('Цель'),
  tag: т('Тег'),
}
const KIND_ICON: Record<Kind, string> = { note: 'note', category: 'donut', account: 'wallet', goal: 'target', tag: 'tag' }

const ПЕРИОДЫ: { k: number; t: string }[] = [
  { k: 3, t: т('3 мес') },
  { k: 6, t: т('Полгода') },
  { k: 12, t: т('Год') },
  { k: 0, t: т('Всё') },
]

/** Расстояние до камеры: чем меньше, тем сильнее перспектива. */
const ГЛУБИНА = 900
type Режим = '3d' | 'flat'

/*
 * Вид переживает переключение вкладок: уйти в заметку и вернуться — не повод
 * терять выбранный режим и поворот.
 */
const запомнено: { режим: Режим; вращать: boolean; период: number; yaw: number; pitch: number } = {
  режим: '3d', вращать: true, период: 6, yaw: 0.5, pitch: -0.35,
}

interface Проекция { sx: number; sy: number; s: number; z: number; fog: number }

export default function GraphView() {
  const app = useApp()
  const { data } = useStore()
  const animLevel = useAnimLevel()
  const [notes, setNotes] = useState<{ name: string; body: string }[]>([])
  const [show, setShow] = useState<Record<Kind, boolean>>({ note: true, category: true, account: true, goal: true, tag: false })
  const [режим, setРежим] = useState<Режим>(запомнено.режим)
  const [вращать, setВращать] = useState(запомнено.вращать && animLevel !== 'off')
  const [период, setПериод] = useState(запомнено.период)
  const [hover, setHover] = useState<string | null>(null)
  const [выбран, setВыбран] = useState<string | null>(null)
  const [поиск, setПоиск] = useState('')
  const [wrapRef, { w: gw, h: gh }] = useSize<HTMLDivElement>()
  const cam = useRef({ yaw: запомнено.yaw, pitch: запомнено.pitch, k: 1, px: 0, py: 0 })
  const nodesRef = useRef<GNode[]>([])
  const alpha = useRef(1)
  /** Взводится, как только человек сам подвинул, повернул или приблизил граф. */
  const touched = useRef(false)
  /** Мышь сейчас что-то тащит — автоповорот ждёт. */
  const занят = useRef(false)
  /** Последний жест был перетаскиванием, а не щелчком: щелчок после него не считается. */
  const тащили = useRef(false)
  const [, force] = useState(0)

  useEffect(() => {
    запомнено.режим = режим
    запомнено.вращать = вращать
    запомнено.период = период
  }, [режим, вращать, период])

  useEffect(() => {
    void (async () => {
      const names = await listNotes()
      setNotes(await Promise.all(names.map(async (n) => ({ name: n, body: (await readNote(n)) || '' }))))
    })()
  }, [])

  // -------------------------------------------------------- построение графа
  const { nodes, links, сколько } = useMemo(() => {
    const ns: GNode[] = []
    const ls: GLink[] = []
    const seen = new Set<string>()
    const сколько: Record<Kind, number> = { note: 0, category: 0, account: 0, goal: 0, tag: 0 }
    const прежние = new Map(nodesRef.current.map((n) => [n.id, n]))
    const push = (n: Omit<GNode, 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'color'> & { color?: string }) => {
      if (seen.has(n.id)) return
      сколько[n.kind]++
      if (!show[n.kind]) return
      seen.add(n.id)
      // Узел, что уже стоял, остаётся на месте: переключение фильтра не
      // должно разбрасывать весь граф заново.
      const был = прежние.get(n.id)
      const угол = Math.random() * Math.PI * 2
      const наклон = Math.acos(Math.random() * 2 - 1)
      const радиус = 120 + Math.random() * 180
      ns.push({
        ...n,
        color: n.color || KIND_COLOR[n.kind],
        x: был?.x ?? радиус * Math.sin(наклон) * Math.cos(угол),
        y: был?.y ?? радиус * Math.sin(наклон) * Math.sin(угол),
        z: был?.z ?? (режим === 'flat' ? 0 : радиус * Math.cos(наклон)),
        vx: 0, vy: 0, vz: 0,
      })
    }

    const since = период ? addMonths(today(), -период) : ''
    const scoped = since ? data.transactions.filter((t) => t.date >= since) : data.transactions
    const totals = new Map(
      [...categoryTotals(scoped, 'expense'), ...categoryTotals(scoped, 'income')].map((t) => [t.categoryId, t]),
    )
    const maxTotal = Math.max(1, ...[...totals.values()].map((t) => t.amount))

    for (const n of notes) push({ id: 'note:' + n.name, label: n.name, kind: 'note', r: 7 })
    for (const a of data.accounts.filter((x) => !x.archived)) {
      push({
        id: 'acc:' + a.id, label: a.name, kind: 'account', r: 15, ref: a.id, color: a.color, icon: a.icon,
        amount: accountBalance(a, data.transactions),
      })
    }
    for (const c of data.categories.filter((x) => !x.archived)) {
      const t = totals.get(c.id)
      push({
        id: 'cat:' + c.id, label: c.name, kind: 'category', ref: c.id, color: c.color, icon: c.icon,
        r: 7 + Math.sqrt((t?.amount ?? 0) / maxTotal) * 12,
        amount: t?.amount ?? 0, count: t?.count ?? 0,
        sub: c.kind === 'income' ? т('доход') : т('расход'),
      })
    }
    for (const g of data.goals) {
      const acc = g.accountId ? data.accounts.find((a) => a.id === g.accountId) : undefined
      push({
        id: 'goal:' + g.id, label: g.name, kind: 'goal', r: 12, ref: g.id, color: g.color, icon: g.icon,
        amount: acc ? accountBalance(acc, data.transactions) : g.saved,
        sub: т('из {0}', money(g.targetAmount)),
      })
    }

    const tags = new Set<string>()
    for (const t of data.transactions) for (const x of t.tags) tags.add(x)
    for (const n of notes) for (const x of extractTags(n.body)) tags.add(x)
    for (const t of tags) push({ id: 'tag:' + t, label: '#' + t, kind: 'tag', r: 6 })

    const link = (a: string, b: string, w = 1, amount?: number) => {
      if (seen.has(a) && seen.has(b) && a !== b) ls.push({ a, b, w, ...(amount ? { amount } : {}) })
    }

    // связи заметок
    for (const n of notes) {
      for (const l of extractLinks(n.body)) link('note:' + n.name, 'note:' + l, 1.4)
      const lower = n.body.toLowerCase()
      for (const c of data.categories) if (lower.includes(c.name.toLowerCase())) link('note:' + n.name, 'cat:' + c.id, 0.6)
      for (const g of data.goals) if (n.name === g.name || lower.includes(g.name.toLowerCase())) link('note:' + n.name, 'goal:' + g.id, 1)
      for (const t of extractTags(n.body)) link('note:' + n.name, 'tag:' + t, 0.7)
    }

    // связи денег: категория ↔ счёт, цель ↔ счёт
    const pairs = new Map<string, number>()
    for (const t of scoped) {
      if (!t.categoryId) continue
      const key = `cat:${t.categoryId}|acc:${t.accountId}`
      pairs.set(key, (pairs.get(key) ?? 0) + t.amount)
    }
    const maxPair = Math.max(1, ...pairs.values())
    for (const [key, v] of pairs) {
      const [a, b] = key.split('|')
      link(a, b, 0.4 + (v / maxPair) * 2.4, v)
    }
    for (const g of data.goals) if (g.accountId) link('goal:' + g.id, 'acc:' + g.accountId, 2)
    const tagPairs = new Set<string>()
    for (const t of scoped) {
      if (!t.categoryId) continue
      for (const x of t.tags) tagPairs.add(`tag:${x}|cat:${t.categoryId}`)
    }
    for (const key of tagPairs) {
      const [a, b] = key.split('|')
      link(a, b, 0.5)
    }

    return { nodes: ns, links: ls, сколько }
    // режим читается только для начального z новых узлов
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, data, show, период])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  // -------------------------------------------------------- симуляция и кадр
  useEffect(() => {
    nodesRef.current = nodes
    alpha.current = Math.max(alpha.current, 0.8)
  }, [nodes])

  useEffect(() => {
    // Смена режима — повод раскладке снова ожить: в плоскость узлы сходятся,
    // из плоскости — расходятся в объём.
    alpha.current = Math.max(alpha.current, 0.6)
    if (режим === '3d') for (const n of nodesRef.current) if (Math.abs(n.z) < 1) n.z = (Math.random() - 0.5) * 160
  }, [режим])

  const fitRef = useRef<() => void>(() => {})

  useEffect(() => {
    let frame = 0
    let последний = performance.now()
    const tick = (сейчас: number) => {
      const dt = Math.min(3, (сейчас - последний) / 16.7)
      последний = сейчас
      const ns = nodesRef.current
      const a = alpha.current
      const c = cam.current
      let двигались = false

      if (a > 0.015) {
        двигались = true
        alpha.current = a * 0.985
        const плоско = режим === 'flat'
        // отталкивание
        for (let i = 0; i < ns.length; i++) {
          for (let j = i + 1; j < ns.length; j++) {
            const p = ns[i]
            const q = ns[j]
            let dx = q.x - p.x
            let dy = q.y - p.y
            let dz = плоско ? 0 : q.z - p.z
            let d2 = dx * dx + dy * dy + dz * dz
            if (d2 < 1) {
              dx = Math.random() - 0.5
              dy = Math.random() - 0.5
              dz = плоско ? 0 : Math.random() - 0.5
              d2 = 1
            }
            const мин = (p.r + q.r) * 2.2
            const f = ((9000 * a) / d2) * (d2 < мин * мин ? 3 : 1)
            const d = Math.sqrt(d2)
            p.vx -= (dx / d) * f; p.vy -= (dy / d) * f; p.vz -= (dz / d) * f
            q.vx += (dx / d) * f; q.vy += (dy / d) * f; q.vz += (dz / d) * f
          }
        }
        // притяжение по связям
        for (const l of links) {
          const p = byId.get(l.a)
          const q = byId.get(l.b)
          if (!p || !q) continue
          const dx = q.x - p.x
          const dy = q.y - p.y
          const dz = q.z - p.z
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
          const target = 110 + (p.r + q.r) * 1.5
          const f = ((d - target) / d) * 0.0085 * Math.min(2.2, l.w) * a * 60 * 0.01
          p.vx += dx * f; p.vy += dy * f; p.vz += dz * f
          q.vx -= dx * f; q.vy -= dy * f; q.vz -= dz * f
        }
        // к центру + затухание
        for (const n of ns) {
          if (n.fixed) {
            n.vx = n.vy = n.vz = 0
            continue
          }
          n.vx -= n.x * 0.05 * a
          n.vy -= n.y * 0.05 * a
          n.vz -= n.z * 0.05 * a
          n.vx *= 0.8; n.vy *= 0.8; n.vz *= 0.8
          n.x += Math.max(-30, Math.min(30, n.vx))
          n.y += Math.max(-30, Math.min(30, n.vy))
          n.z = плоско ? n.z * 0.82 : n.z + Math.max(-30, Math.min(30, n.vz))
        }
      }

      // Камера: в схеме плавно встаёт анфас, в объёме — медленно кружит.
      if (режим === 'flat') {
        if (Math.abs(c.yaw) > 0.001 || Math.abs(c.pitch) > 0.001) {
          c.yaw *= 0.85
          c.pitch *= 0.85
          двигались = true
        } else {
          c.yaw = 0
          c.pitch = 0
        }
      } else if (вращать && !занят.current) {
        c.yaw += 0.0022 * dt
        двигались = true
      }
      if (двигались) force((v) => v + 1)
      if (a > 0.015 && alpha.current <= 0.015 && !touched.current) fitRef.current()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [links, byId, режим, вращать])

  // -------------------------------------------------------- проекция
  const cx = (gw || 800) / 2
  const cy = (gh || 600) / 2
  const c = cam.current
  const cosY = Math.cos(c.yaw), sinY = Math.sin(c.yaw), cosP = Math.cos(c.pitch), sinP = Math.sin(c.pitch)

  const проекция = (n: { x: number; y: number; z: number }, k = c.k, px = c.px, py = c.py): Проекция => {
    const x1 = n.x * cosY - n.z * sinY
    const z1 = n.x * sinY + n.z * cosY
    const y2 = n.y * cosP - z1 * sinP
    const z2 = n.y * sinP + z1 * cosP
    const f = ГЛУБИНА / (ГЛУБИНА + Math.max(-ГЛУБИНА * 0.7, z2))
    // Туман: дальнее бледнее — главный признак глубины на плоском экране.
    const fog = режим === 'flat' ? 1 : Math.max(0.28, Math.min(1, 0.35 + (f - 0.72) * 1.6))
    return { sx: cx + px + x1 * f * k, sy: cy + py + y2 * f * k, s: f * k, z: z2, fog }
  }

  /** Сдвиг на экране → сдвиг в мире (обратный поворот камеры). */
  const вМир = (dx: number, dy: number) => {
    const y = dy * cosP
    const z1 = -dy * sinP
    return { x: dx * cosY + z1 * sinY, y, z: -dx * sinY + z1 * cosY }
  }

  /** Вписать граф в холст. */
  const fit = useCallback(() => {
    const ns = nodesRef.current
    if (!ns.length || !gw || !gh) {
      Object.assign(cam.current, { k: 1, px: 0, py: 0 })
      force((v) => v + 1)
      return
    }
    const ps = ns.map((n) => ({ n, p: проекция(n, 1, 0, 0) }))
    const pad = 50
    // Слева лежит панель управления — граф вписывается в то, что справа от неё.
    const слева = gw > 760 ? 270 : 0
    const minX = Math.min(...ps.map(({ n, p }) => p.sx - n.r * p.s)) - cx
    const maxX = Math.max(...ps.map(({ n, p }) => p.sx + n.r * p.s)) - cx
    const minY = Math.min(...ps.map(({ n, p }) => p.sy - n.r * p.s)) - cy
    const maxY = Math.max(...ps.map(({ n, p }) => p.sy + n.r * p.s)) - cy
    // Подписи не масштабируются вместе с графом — на них справа оставляем
    // постоянный запас, а не долю.
    const подпись = 120
    const k = Math.min(2, Math.max(0.25, Math.min((gw - слева - pad * 2 - подпись) / Math.max(1, maxX - minX), (gh - pad * 2) / Math.max(1, maxY - minY))))
    Object.assign(cam.current, { k, px: (слева - подпись) / 2 - ((minX + maxX) / 2) * k, py: -((minY + maxY) / 2) * k })
    force((v) => v + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gw, gh, режим])
  fitRef.current = fit

  /** Навести камеру на узел. */
  const навести = (id: string) => {
    const n = nodesRef.current.find((x) => x.id === id)
    if (!n) return
    const p = проекция(n)
    cam.current.px += cx - p.sx
    cam.current.py += cy - p.sy
    touched.current = true
    force((v) => v + 1)
  }

  // -------------------------------------------------------- мышь
  const жест = useRef<
    | { вид: 'rotate' | 'pan'; sx: number; sy: number; yaw: number; pitch: number; px: number; py: number; ушёл: boolean }
    | { вид: 'node'; id: string; sx: number; sy: number; ушёл: boolean }
    | null
  >(null)

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const g = жест.current
      if (!g) return
      const dx = e.clientX - g.sx
      const dy = e.clientY - g.sy
      if (Math.abs(dx) + Math.abs(dy) > 3) g.ушёл = true
      if (g.вид === 'node') {
        const n = nodesRef.current.find((x) => x.id === g.id)
        if (!n) return
        const p = проекцияRef.current(n)
        const d = вМирRef.current((e.clientX - g.sx) / p.s, (e.clientY - g.sy) / p.s)
        n.x += d.x
        n.y += d.y
        n.z += режимRef.current === 'flat' ? 0 : d.z
        g.sx = e.clientX
        g.sy = e.clientY
        alpha.current = Math.max(alpha.current, 0.25)
        force((v) => v + 1)
        return
      }
      if (g.вид === 'rotate') {
        cam.current.yaw = g.yaw + dx * 0.006
        cam.current.pitch = Math.max(-1.35, Math.min(1.35, g.pitch + dy * 0.006))
        запомнено.yaw = cam.current.yaw
        запомнено.pitch = cam.current.pitch
      } else {
        cam.current.px = g.px + dx
        cam.current.py = g.py + dy
      }
      force((v) => v + 1)
    }
    const up = () => {
      const g = жест.current
      тащили.current = !!g?.ушёл
      if (g?.вид === 'node') {
        const n = nodesRef.current.find((x) => x.id === g.id)
        if (n) n.fixed = false
      }
      жест.current = null
      занят.current = false
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])
  // Обработчики окна вешаются один раз, а проекция меняется с каждым кадром.
  const проекцияRef = useRef(проекция)
  проекцияRef.current = проекция
  const вМирRef = useRef(вМир)
  вМирRef.current = вМир
  const режимRef = useRef(режим)
  режимRef.current = режим

  const openNode = (n: GNode) => {
    if (n.kind === 'note') app.openTab('notes', n.label)
    else if (n.kind === 'category') app.openTab('transactions', 'cat:' + n.ref, { title: n.label })
    else if (n.kind === 'account') app.openTab('accounts')
    else if (n.kind === 'goal') app.openTab('goals')
  }

  // -------------------------------------------------------- подсветка
  const фокус = hover ?? выбран
  const соседи = useMemo(() => {
    if (!фокус) return null
    const s = new Set<string>([фокус])
    for (const l of links) {
      if (l.a === фокус) s.add(l.b)
      if (l.b === фокус) s.add(l.a)
    }
    return s
  }, [фокус, links])

  // -------------------------------------------------------- отрисовка
  const ps = new Map<string, Проекция>()
  for (const n of nodesRef.current) ps.set(n.id, проекция(n))
  // Дальние — первыми: ближние узлы перекрывают их, как в жизни.
  const поГлубине = [...nodesRef.current].sort((a, b) => (ps.get(b.id)!.z - ps.get(a.id)!.z))

  /*
   * Подписи — как в sigma.js: отдельным слоем поверх узлов и без наложений.
   * Сначала выделенный и соседи, дальше крупные и ближние; подпись, что
   * налезла бы на уже поставленную, не ставится.
   */
  const подписи: { n: GNode; x: number; y: number; w: number; сильная: boolean }[] = []
  {
    const занято: { x: number; y: number; w: number; h: number }[] = []
    const важность = (n: GNode) => {
      const p = ps.get(n.id)!
      if (n.id === фокус) return 1e9
      if (соседи?.has(n.id)) return 1e8 + n.r * p.s
      return n.r * p.s * p.fog
    }
    const порядок = [...nodesRef.current].sort((a, b) => важность(b) - важность(a))
    for (const n of порядок) {
      const p = ps.get(n.id)!
      const сильная = n.id === фокус || !!соседи?.has(n.id)
      if (!сильная && (соседи || p.s * n.r < 7.5 || p.fog < 0.45)) continue
      const текст = n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label
      const w = текст.length * 6.3 + 14
      const h = 20
      const x = p.sx + n.r * p.s + 5
      const y = p.sy - h / 2
      if (!сильная && занято.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y)) continue
      занято.push({ x, y, w, h })
      подписи.push({ n, x, y, w, сильная })
    }
  }

  const выбранный = выбран ? byId.get(выбран) : undefined
  const найдено = поиск.trim()
    ? nodes.filter((n) => n.label.toLowerCase().includes(поиск.trim().toLowerCase())).slice(0, 8)
    : []

  return (
    <div
      className={'graph-wrap graph-' + режим}
      ref={wrapRef}
      onMouseDown={(e) => {
        touched.current = true
        занят.current = true
        const pan = режим === 'flat' || e.shiftKey || e.button === 1 || e.button === 2
        жест.current = {
          вид: pan ? 'pan' : 'rotate', sx: e.clientX, sy: e.clientY,
          yaw: c.yaw, pitch: c.pitch, px: c.px, py: c.py, ушёл: false,
        }
      }}
      onClick={() => {
        if (!тащили.current) setВыбран(null)
      }}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) => {
        touched.current = true
        const rect = e.currentTarget.getBoundingClientRect()
        const mx = e.clientX - rect.left - cx
        const my = e.clientY - rect.top - cy
        const k = Math.min(4, Math.max(0.2, c.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        // Масштаб к курсору: точка под мышью остаётся на месте.
        c.px = mx - (mx - c.px) * (k / c.k)
        c.py = my - (my - c.py) * (k / c.k)
        c.k = k
        force((v) => v + 1)
      }}
    >
      <svg width="100%" height="100%" className="graph-svg">
        <g className="graph-links">
          {links.map((l, i) => {
            const a = byId.get(l.a)
            const b = byId.get(l.b)
            const pa = a && ps.get(a.id)
            const pb = b && ps.get(b.id)
            if (!a || !b || !pa || !pb) return null
            const свет = соседи ? соседи.has(a.id) && соседи.has(b.id) && (a.id === фокус || b.id === фокус) : false
            const тускло = соседи && !свет
            const s = (pa.s + pb.s) / 2
            return (
              <line
                key={i}
                x1={pa.sx} y1={pa.sy} x2={pb.sx} y2={pb.sy}
                stroke={свет ? 'var(--accent)' : a.kind === 'account' ? b.color : a.color}
                strokeWidth={Math.max(0.6, Math.min(4, l.w) * s * (свет ? 1.3 : 1))}
                strokeLinecap="round"
                opacity={тускло ? 0.06 : свет ? 0.9 : 0.28 * Math.min(pa.fog, pb.fog)}
              />
            )
          })}
        </g>
        <g className="graph-nodes">
          {поГлубине.map((n) => {
            const p = ps.get(n.id)!
            const тускло = соседи && !соседи.has(n.id)
            return (
              <g
                key={n.id}
                className={'graph-node k-' + n.kind + (n.id === выбран ? ' sel' : '')}
                data-id={n.id}
                transform={`translate(${p.sx},${p.sy}) scale(${p.s})`}
                opacity={тускло ? 0.14 : p.fog}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  touched.current = true
                  занят.current = true
                  n.fixed = true
                  жест.current = { вид: 'node', id: n.id, sx: e.clientX, sy: e.clientY, ушёл: false }
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (тащили.current) return
                  setВыбран(n.id === выбран ? null : n.id)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  openNode(n)
                }}
              >
                <Узел n={n} выделен={n.id === фокус} />
              </g>
            )
          })}
        </g>
        <g className="graph-labels" pointerEvents="none">
          {подписи.map(({ n, x, y, w, сильная }) => (
            <g key={n.id} transform={`translate(${x},${y})`} opacity={сильная ? 1 : Math.max(0.55, ps.get(n.id)!.fog)}>
              <rect width={w} height={20} rx={10} className={'graph-label-bg' + (сильная ? ' strong' : '')} />
              <text x={7} y={14} className={'graph-label' + (сильная ? ' strong' : '')}>
                {n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* ---------------------------------------------- панель управления */}
      <div className="graph-panel" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <div className="graph-panel-head">
          <Icon name="graph" size={15} />
          <span className="strong">{т('Граф связей')}</span>
        </div>
        <div className="graph-search">
          <Icon name="search" size={13} />
          <input
            type="text"
            className="graph-search-input"
            placeholder={т('Найти узел')}
            value={поиск}
            onChange={(e) => setПоиск(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && найдено[0]) {
                setВыбран(найдено[0].id)
                навести(найдено[0].id)
                setПоиск('')
              }
              if (e.key === 'Escape') setПоиск('')
            }}
          />
        </div>
        {найдено.length > 0 && (
          <div className="graph-found">
            {найдено.map((n) => (
              <button
                key={n.id}
                type="button"
                className="graph-found-item"
                onClick={() => {
                  setВыбран(n.id)
                  навести(n.id)
                  setПоиск('')
                }}
              >
                <span className="graph-dot" style={{ background: n.color }} />
                <span className="graph-found-name">{n.label}</span>
                <span className="faint small">{KIND_ONE[n.kind]}</span>
              </button>
            ))}
          </div>
        )}

        <div className="seg graph-mode">
          <button type="button" className={режим === '3d' ? 'on' : ''} onClick={() => setРежим('3d')}>{т('3D')}</button>
          <button type="button" className={режим === 'flat' ? 'on' : ''} onClick={() => setРежим('flat')}>{т('Схема')}</button>
        </div>
        <div className="seg graph-period">
          {ПЕРИОДЫ.map((x) => (
            <button key={x.k} type="button" className={период === x.k ? 'on' : ''} onClick={() => setПериод(x.k)}>{x.t}</button>
          ))}
        </div>

        <div className="graph-kinds">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <div key={k} className="graph-kind">
              <span className="graph-kind-icon" style={{ background: KIND_COLOR[k] }}>
                <Icon name={KIND_ICON[k]} size={11} />
              </span>
              <span style={{ flex: 1 }}>{KIND_LABEL[k]}</span>
              <span className="faint small num">{сколько[k]}</span>
              <Toggle checked={show[k]} onChange={(v) => setShow((s) => ({ ...s, [k]: v }))} />
            </div>
          ))}
        </div>

        <div className="row graph-actions" style={{ gap: 6 }}>
          <button
            type="button"
            className="btn sm"
            style={{ flex: 1 }}
            onClick={() => {
              touched.current = false
              fit()
            }}
          >
            <Icon name="fit" size={13} /> {т(' Вписать')}</button>
          {режим === '3d' && (
            <button
              type="button"
              className={'btn sm' + (вращать ? ' on' : '')}
              title={т('Медленно вращать граф, пока его не трогают')}
              onClick={() => setВращать((v) => !v)}
            >
              <Icon name="repeat" size={13} /> {вращать ? т(' Вращается') : т(' Вращать')}</button>
          )}
        </div>
        <div className="faint small graph-hint">
          {режим === '3d'
            ? т('Тяните фон — повернуть, с Shift или правой кнопкой — сдвинуть. Колесо — масштаб. Щелчок по узлу — подробности, двойной — открыть раздел.')
            : т('Тяните фон — сдвинуть. Колесо — масштаб. Щелчок по узлу — подробности, двойной — открыть раздел.')}
        </div>
      </div>

      {/* ---------------------------------------------- выбранный узел */}
      {выбранный && (
        <КарточкаУзла
          n={выбранный}
          links={links}
          byId={byId}
          период={период}
          onPick={(id) => {
            setВыбран(id)
            навести(id)
          }}
          onOpen={() => openNode(выбранный)}
          onClose={() => setВыбран(null)}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ узел

/**
 * Узел: форма говорит, что это. Счёт — скруглённый квадрат, цель — ромб,
 * категория — круг, заметка — круг поменьше, тег — пилюля. Внутри — значок
 * самой записи на её цвете, вокруг — ободок цвета фона, чтобы узел
 * отделялся от линий под ним.
 */
const Узел = memo(function Узел({ n, выделен }: { n: GNode; выделен: boolean }) {
  const r = n.r
  const ink = iconInk(n.color)
  const ободок = { stroke: 'var(--bg)', strokeWidth: 2.5 }
  let форма: React.ReactNode
  if (n.kind === 'account') {
    форма = <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.38} fill={n.color} {...ободок} />
  } else if (n.kind === 'goal') {
    форма = <rect x={-r * 0.86} y={-r * 0.86} width={r * 1.72} height={r * 1.72} rx={r * 0.3} fill={n.color} transform="rotate(45)" {...ободок} />
  } else if (n.kind === 'tag') {
    форма = <rect x={-r * 1.4} y={-r} width={r * 2.8} height={r * 2} rx={r} fill={n.color} {...ободок} />
  } else {
    форма = <circle r={r} fill={n.color} {...ободок} />
  }
  return (
    <>
      {выделен && <circle r={r * 1.55} className="graph-halo" />}
      {форма}
      <ЗначокУзла n={n} size={r * 1.05} ink={ink} />
    </>
  )
})

function ЗначокУзла({ n, size, ink }: { n: GNode; size: number; ink: string }) {
  const картинка = useСвойЗначокъ(n.icon)
  if (size < 7) return null
  const s = size
  if (n.icon && этоСвойЗначокъ(n.icon)) {
    return картинка ? (
      <image href={картинка} x={-s / 2} y={-s / 2} width={s} height={s} preserveAspectRatio="xMidYMid meet" />
    ) : null
  }
  if (n.icon && isCatalogIcon(n.icon)) {
    return (
      <g transform={`translate(${-s / 2},${-s / 2})`} style={{ color: ink }}>
        <CatalogGlyph id={n.icon} size={s} />
      </g>
    )
  }
  if (n.icon && n.kind !== 'note' && n.kind !== 'tag') {
    return (
      <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: s * 0.95 }}>
        {n.icon}
      </text>
    )
  }
  return (
    <g transform={`translate(${-s / 2},${-s / 2})`} style={{ color: ink }}>
      <Icon name={KIND_ICON[n.kind]} size={s} />
    </g>
  )
}

// ------------------------------------------------------------------ карточка

function КарточкаУзла({
  n, links, byId, период, onPick, onOpen, onClose,
}: {
  n: GNode
  links: GLink[]
  byId: Map<string, GNode>
  период: number
  onPick: (id: string) => void
  onOpen: () => void
  onClose: () => void
}) {
  const связи = links
    .filter((l) => l.a === n.id || l.b === n.id)
    .map((l) => ({ l, other: byId.get(l.a === n.id ? l.b : l.a)! }))
    .filter((x) => x.other)
    .sort((a, b) => (b.l.amount ?? b.l.w) - (a.l.amount ?? a.l.w))
  const заПериод = период ? тр('за {0} мес.', период) : т('за всё время')
  return (
    <div className="graph-card" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <span className="graph-card-icon" style={{ background: n.color, color: iconInk(n.color) }}>
          <svg width={28} height={28} viewBox="-14 -14 28 28"><ЗначокУзла n={n} size={18} ink={iconInk(n.color)} /></svg>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="strong graph-card-name">{n.label}</div>
          <div className="faint small">{KIND_ONE[n.kind]}{n.sub ? ' · ' + n.sub : ''}</div>
        </div>
        <button type="button" className="icon-btn" title={т('Закрыть')} onClick={onClose}><Icon name="x" size={14} /></button>
      </div>

      {n.kind === 'category' && (
        <div className="graph-card-stat">
          <span className="num strong">{money(n.amount ?? 0)}</span>
          <span className="faint small">
            {заПериод}{n.count ? ' · ' + n.count + ' ' + plural(n.count, 'операция', 'операции', 'операций') : ''}</span>
        </div>
      )}
      {n.kind === 'account' && (
        <div className="graph-card-stat">
          <span className="num strong">{money(n.amount ?? 0)}</span>
          <span className="faint small">{т('на счёте сейчас')}</span>
        </div>
      )}
      {n.kind === 'goal' && (
        <div className="graph-card-stat">
          <span className="num strong">{money(n.amount ?? 0)}</span>
          <span className="faint small">{т('накоплено')}</span>
        </div>
      )}

      {связи.length > 0 && (
        <>
          <div className="faint small graph-card-sub">{тр('Связи · {0}', связи.length)}</div>
          <div className="graph-card-links">
            {связи.slice(0, 10).map(({ l, other }) => (
              <button key={other.id} type="button" className="graph-card-link" onClick={() => onPick(other.id)}>
                <span className="graph-dot" style={{ background: other.color }} />
                <span className="graph-found-name">{other.label}</span>
                {l.amount ? <span className="num small faint">{moneyShort(l.amount)}</span> : null}
              </button>
            ))}
            {связи.length > 10 && <div className="faint small">{тр('и ещё {0}', связи.length - 10)}</div>}
          </div>
        </>
      )}
      {n.kind !== 'tag' && (
        <button type="button" className="btn sm primary" style={{ width: '100%', marginTop: 10 }} onClick={onOpen}>
          {т('Открыть')}</button>
      )}
    </div>
  )
}
