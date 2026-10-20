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
import { прогрессЗаработка, этоЗаработок } from '../engine/zarabotok'
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { CatalogGlyph, Icon } from '../lib/icons'
import { listNotes, readNote } from '../state/vault'
import { extractLinks, extractTags } from '../lib/markdown'
import { addMonths, today } from '../lib/date'
import { money, moneyShort, plural } from '../lib/format'
import { accountBalance, categoryTotals } from '../engine/stats'
import { поГлавным, родитель } from '../engine/podkategorii'
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
  /** Цель «заработать»: сумма — заработанное, а не отложенное. */
  earn?: boolean
  /** У главной категории — сколько её подкатегорий на графе. */
  подкатегорий?: number
}
interface GLink {
  a: string
  b: string
  w: number
  amount?: number
  /** Связь главной категории с подкатегорией, а не движение денег. */
  семья?: boolean
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

/** Положение камеры на один кадр: синусы считаются раз на кадр, а не на каждый узел. */
interface Взгляд { cosY: number; sinY: number; cosP: number; sinP: number; cx: number; cy: number; плоско: boolean }

function взгляд(c: { yaw: number; pitch: number }, w: number, h: number, плоско: boolean): Взгляд {
  return {
    cosY: Math.cos(c.yaw), sinY: Math.sin(c.yaw), cosP: Math.cos(c.pitch), sinP: Math.sin(c.pitch),
    cx: (w || 800) / 2, cy: (h || 600) / 2, плоско,
  }
}

function проецировать(n: { x: number; y: number; z: number }, в: Взгляд, k: number, px: number, py: number): Проекция {
  const x1 = n.x * в.cosY - n.z * в.sinY
  const z1 = n.x * в.sinY + n.z * в.cosY
  const y2 = n.y * в.cosP - z1 * в.sinP
  const z2 = n.y * в.sinP + z1 * в.cosP
  const f = ГЛУБИНА / (ГЛУБИНА + Math.max(-ГЛУБИНА * 0.7, z2))
  // Туман: дальнее бледнее — главный признак глубины на плоском экране.
  const fog = в.плоско ? 1 : Math.max(0.28, Math.min(1, 0.35 + (f - 0.72) * 1.6))
  return { sx: в.cx + px + x1 * f * k, sy: в.cy + py + y2 * f * k, s: f * k, z: z2, fog }
}

/** Сдвиг на экране → сдвиг в мире (обратный поворот камеры). */
function вМир(dx: number, dy: number, в: Взгляд) {
  const y = dy * в.cosP
  const z1 = -dy * в.sinP
  return { x: dx * в.cosY + z1 * в.sinY, y, z: -dx * в.sinY + z1 * в.cosY }
}

/**
 * Шаг силовой раскладки: узлы отталкиваются, связи стягивают, всё тянется к
 * центру. a — «температура»: чем она ниже, тем меньше узлы двигаются.
 */
function раскладка(ns: GNode[], links: GLink[], byId: Map<string, GNode>, a: number, плоско: boolean) {
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

/*
 * Кадр пишет в DOM напрямую, мимо React. Атрибут, у которого значение не
 * сменилось, не трогается: неподвижные узлы и подписи браузеру не о чем
 * пересчитывать.
 */
const записано = new WeakMap<Element, Record<string, string>>()
function атр(el: Element | null | undefined, имя: string, значение: string) {
  if (!el) return
  let было = записано.get(el)
  if (!было) записано.set(el, (было = {}))
  if (было[имя] === значение) return
  было[имя] = значение
  el.setAttribute(имя, значение)
}
const д1 = (v: number) => String(Math.round(v * 10) / 10)
const д3 = (v: number) => String(Math.round(v * 1000) / 1000)

/** Расставить детей по порядку, переставляя только тех, кто стоит не на месте. */
function упорядочить(родитель: Element, дети: (Element | undefined)[]) {
  let курсор = родитель.firstElementChild
  for (const ребёнок of дети) {
    if (!ребёнок) continue
    if (ребёнок === курсор) {
      курсор = курсор.nextElementSibling
      continue
    }
    родитель.insertBefore(ребёнок, курсор)
  }
}

/** Подпись узла: длинное имя укорачивается, ширина подложки — по числу букв. */
function подписьУзла(n: GNode) {
  const текст = n.label.length > 24 ? n.label.slice(0, 23) + '…' : n.label
  return { текст, w: текст.length * 6.3 + 14 }
}

export default function GraphView() {
  const app = useApp()
  const { data } = useStore()
  const animLevel = useAnimLevel()
  /** Анимации выключены: раскладка досчитывается сразу, камера не плывёт. */
  const безДвижения = animLevel === 'off'
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
  /*
   * Элементы схемы. React создаёт их, только когда меняются данные, фильтры
   * или выделение; координаты, прозрачность и порядок по глубине кадр
   * выставляет сам — иначе React пересобирал бы весь рисунок 60 раз в секунду.
   */
  const слойУзлов = useRef<SVGGElement>(null)
  const элУзлов = useRef(new Map<string, SVGGElement>())
  const элСвязей = useRef<(SVGLineElement | null)[]>([])
  const элПодписей = useRef(new Map<string, SVGGElement>())

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
    // Главная категория несёт и свои операции, и операции подкатегорий —
    // как на «Сводке» и в «Бюджете»; подкатегория — только свои.
    const прямые = [...categoryTotals(scoped, 'expense'), ...categoryTotals(scoped, 'income')]
    const своих = new Map(прямые.map((t) => [t.categoryId, t]))
    const семейных = new Map(поГлавным(прямые, data.categories).map((t) => [t.categoryId, t]))
    const главная = new Map(data.categories.map((c) => [c.id, родитель(c, data.categories)]))
    const итог = (id: string) => (главная.get(id) ? своих : семейных).get(id)
    const maxTotal = Math.max(1, ...data.categories.map((c) => итог(c.id)?.amount ?? 0))
    const детей = new Map<string, number>()
    for (const c of data.categories) {
      const р = главная.get(c.id)
      if (р && !c.archived && !р.archived) детей.set(р.id, (детей.get(р.id) ?? 0) + 1)
    }

    for (const n of notes) push({ id: 'note:' + n.name, label: n.name, kind: 'note', r: 7 })
    for (const a of data.accounts.filter((x) => !x.archived)) {
      push({
        id: 'acc:' + a.id, label: a.name, kind: 'account', r: 15, ref: a.id, color: a.color, icon: a.icon,
        amount: accountBalance(a, data.transactions),
      })
    }
    for (const c of data.categories.filter((x) => !x.archived)) {
      const t = итог(c.id)
      const р = главная.get(c.id)
      const вид = c.kind === 'income' ? т('доход') : т('расход')
      push({
        id: 'cat:' + c.id, label: c.name, kind: 'category', ref: c.id, color: c.color, icon: c.icon,
        r: 7 + Math.sqrt((t?.amount ?? 0) / maxTotal) * 12,
        amount: t?.amount ?? 0, count: t?.count ?? 0,
        sub: р ? т('Подкатегория «{0}»', р.name) : детей.get(c.id) ? вид + ' · ' + т('подкатегорий: {0}', детей.get(c.id)) : вид,
        подкатегорий: детей.get(c.id),
      })
    }
    for (const g of data.goals) {
      const acc = g.accountId ? data.accounts.find((a) => a.id === g.accountId) : undefined
      push({
        id: 'goal:' + g.id, label: g.name, kind: 'goal', r: 12, ref: g.id, color: g.color, icon: g.icon,
        amount: этоЗаработок(g) ? прогрессЗаработка(g, data).заработано : acc ? accountBalance(acc, data.transactions) : g.saved,
        sub: этоЗаработок(g) ? т('заработать {0}', money(g.targetAmount)) : т('из {0}', money(g.targetAmount)),
        earn: этоЗаработок(g),
      })
    }

    const tags = new Set<string>()
    for (const t of data.transactions) for (const x of t.tags) tags.add(x)
    for (const n of notes) for (const x of extractTags(n.body)) tags.add(x)
    for (const t of tags) push({ id: 'tag:' + t, label: '#' + t, kind: 'tag', r: 6 })

    const link = (a: string, b: string, w = 1, amount?: number, семья?: boolean) => {
      if (seen.has(a) && seen.has(b) && a !== b) ls.push({ a, b, w, ...(amount ? { amount } : {}), ...(семья ? { семья } : {}) })
    }

    // главная категория → подкатегория: подкатегории держатся рядом с главной
    for (const c of data.categories) {
      const р = главная.get(c.id)
      if (р) link('cat:' + р.id, 'cat:' + c.id, 1.6, итог(c.id)?.amount, true)
    }

    // связи заметок
    for (const n of notes) {
      for (const l of extractLinks(n.body)) link('note:' + n.name, 'note:' + l, 1.4)
      const lower = n.body.toLowerCase()
      for (const c of data.categories) if (lower.includes(c.name.toLowerCase())) link('note:' + n.name, 'cat:' + c.id, 0.6)
      for (const g of data.goals) if (n.name === g.name || lower.includes(g.name.toLowerCase())) link('note:' + n.name, 'goal:' + g.id, 1)
      for (const t of extractTags(n.body)) link('note:' + n.name, 'tag:' + t, 0.7)
    }

    // связи денег: категория ↔ счёт, цель ↔ счёт. Разбитый чек связывает
    // счёт с каждой своей статьёй на её долю, а не целиком с первой.
    const доли = (t: (typeof scoped)[number]) =>
      t.splits?.length ? t.splits : t.categoryId ? [{ categoryId: t.categoryId, amount: t.amount }] : []
    const pairs = new Map<string, number>()
    for (const t of scoped) {
      for (const д of доли(t)) {
        const key = `cat:${д.categoryId}|acc:${t.accountId}`
        pairs.set(key, (pairs.get(key) ?? 0) + д.amount)
      }
    }
    const maxPair = Math.max(1, ...pairs.values())
    for (const [key, v] of pairs) {
      const [a, b] = key.split('|')
      link(a, b, 0.4 + (v / maxPair) * 2.4, v)
    }
    for (const g of data.goals) if (g.accountId) link('goal:' + g.id, 'acc:' + g.accountId, 2)
    // Цель «заработать» связана с категориями, с которых идёт заработок.
    for (const g of data.goals) for (const id of g.earn?.categoryIds ?? []) if (этоЗаработок(g)) link('goal:' + g.id, 'cat:' + id, 2)
    const tagPairs = new Set<string>()
    for (const t of scoped) for (const д of доли(t)) for (const x of t.tags) tagPairs.add(`tag:${x}|cat:${д.categoryId}`)
    for (const key of tagPairs) {
      const [a, b] = key.split('|')
      link(a, b, 0.5)
    }

    return { nodes: ns, links: ls, сколько }
    // режим читается только для начального z новых узлов
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, data, show, период])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  // -------------------------------------------------------- подсветка
  const фокус = hover ?? выбран
  /*
   * Ядро подсветки — сам узел, а у главной категории ещё и её подкатегории:
   * светятся их связи и всё, с чем они связаны. Подкатегория связана с
   * главной напрямую, поэтому главная светится и при наведении на неё.
   */
  const { ядро, соседи } = useMemo(() => {
    if (!фокус) return { ядро: null, соседи: null }
    const ядро = new Set<string>([фокус])
    for (const l of links) if (l.семья && l.a === фокус) ядро.add(l.b)
    const s = new Set<string>(ядро)
    for (const l of links) {
      if (ядро.has(l.a)) s.add(l.b)
      if (ядро.has(l.b)) s.add(l.a)
    }
    return { ядро, соседи: s }
  }, [фокус, links])

  /** Что кадр знает о последней отрисовке React: он живёт дольше неё. */
  const живое = useRef({ links, byId, режим, вращать, gw, gh, фокус, ядро, соседи })
  живое.current = { links, byId, режим, вращать, gw, gh, фокус, ядро, соседи }
  const взглядСейчас = () => взгляд(cam.current, живое.current.gw, живое.current.gh, живое.current.режим === 'flat')

  // -------------------------------------------------------- симуляция
  /** Один шаг: раскладка остывает, камера кружит. Возвращает, движется ли ещё что-нибудь. */
  const шаг = (dt: number): boolean => {
    const { links, byId, режим, вращать } = живое.current
    const a = alpha.current
    const c = cam.current
    let движется = false
    if (a > 0.015) {
      движется = true
      alpha.current = a * 0.985
      раскладка(nodesRef.current, links, byId, a, режим === 'flat')
    }
    // Камера: в схеме плавно встаёт анфас, в объёме — медленно кружит.
    if (режим === 'flat') {
      if (Math.abs(c.yaw) > 0.001 || Math.abs(c.pitch) > 0.001) {
        c.yaw *= 0.85
        c.pitch *= 0.85
        движется = true
      } else {
        c.yaw = 0
        c.pitch = 0
      }
    } else if (вращать && !занят.current) {
      c.yaw += 0.0022 * dt
      движется = true
    }
    if (a > 0.015 && alpha.current <= 0.015 && !touched.current) вписать()
    return движется
  }

  /** Без анимаций раскладка досчитывается сразу — узлы не летят по экрану, а встают на место. */
  const досчитать = () => {
    const { links, byId, режим } = живое.current
    for (let i = 0; alpha.current > 0.015 && i < 400; i++) {
      раскладка(nodesRef.current, links, byId, alpha.current, режим === 'flat')
      alpha.current *= 0.985
    }
    if (режим === 'flat') Object.assign(cam.current, { yaw: 0, pitch: 0 })
    if (!touched.current) вписать()
  }

  // -------------------------------------------------------- кадр
  const рисовать = () => {
    const { links, byId, фокус, ядро, соседи } = живое.current
    const ns = nodesRef.current
    const в = взглядСейчас()
    const { k, px, py } = cam.current
    const ps = new Map<string, Проекция>()
    for (const n of ns) ps.set(n.id, проецировать(n, в, k, px, py))

    for (const n of ns) {
      const p = ps.get(n.id)!
      const el = элУзлов.current.get(n.id)
      атр(el, 'transform', `translate(${д1(p.sx)},${д1(p.sy)}) scale(${д3(p.s)})`)
      атр(el, 'opacity', соседи && !соседи.has(n.id) ? '0.14' : д3(p.fog))
    }
    // Дальние — первыми: ближние узлы перекрывают их, как в жизни.
    if (слойУзлов.current) {
      const поГлубине = [...ns].sort((a, b) => ps.get(b.id)!.z - ps.get(a.id)!.z)
      упорядочить(слойУзлов.current, поГлубине.map((n) => элУзлов.current.get(n.id)))
    }

    links.forEach((l, i) => {
      const el = элСвязей.current[i]
      if (!el) return
      const a = byId.get(l.a)
      const b = byId.get(l.b)
      const pa = a && ps.get(a.id)
      const pb = b && ps.get(b.id)
      if (!a || !b || !pa || !pb) {
        атр(el, 'display', 'none')
        return
      }
      const свет = соседи && ядро ? соседи.has(a.id) && соседи.has(b.id) && (ядро.has(a.id) || ядро.has(b.id)) : false
      const тускло = соседи && !свет
      const s = (pa.s + pb.s) / 2
      атр(el, 'display', 'inline')
      атр(el, 'x1', д1(pa.sx))
      атр(el, 'y1', д1(pa.sy))
      атр(el, 'x2', д1(pb.sx))
      атр(el, 'y2', д1(pb.sy))
      атр(el, 'stroke', свет ? 'var(--accent)' : a.kind === 'account' ? b.color : a.color)
      атр(el, 'stroke-width', д3(Math.max(0.6, Math.min(4, l.w) * s * (свет ? 1.3 : 1))))
      атр(el, 'opacity', д3(тускло ? 0.06 : свет ? 0.9 : 0.28 * Math.min(pa.fog, pb.fog)))
    })

    /*
     * Подписи — как в sigma.js: отдельным слоем поверх узлов и без наложений.
     * Сначала выделенный и соседи, дальше крупные и ближние; подпись, что
     * налезла бы на уже поставленную, не ставится.
     */
    const занято: { x: number; y: number; w: number; h: number }[] = []
    const поставлены = new Map<string, { x: number; y: number; сильная: boolean }>()
    const важность = (n: GNode) => {
      const p = ps.get(n.id)!
      if (n.id === фокус) return 1e9
      if (ядро?.has(n.id)) return 5e8 + n.r * p.s
      if (соседи?.has(n.id)) return 1e8 + n.r * p.s
      return n.r * p.s * p.fog
    }
    const порядок = [...ns].sort((a, b) => важность(b) - важность(a))
    for (const n of порядок) {
      const p = ps.get(n.id)!
      const сильная = n.id === фокус || !!соседи?.has(n.id)
      if (!сильная && (соседи || p.s * n.r < 7.5 || p.fog < 0.45)) continue
      const { w } = подписьУзла(n)
      const h = 20
      const x = p.sx + n.r * p.s + 5
      const y = p.sy - h / 2
      if (!сильная && занято.some((b) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y)) continue
      занято.push({ x, y, w, h })
      поставлены.set(n.id, { x, y, сильная })
    }
    for (const n of ns) {
      const el = элПодписей.current.get(n.id)
      if (!el) continue
      const м = поставлены.get(n.id)
      if (!м) {
        атр(el, 'display', 'none')
        continue
      }
      атр(el, 'display', 'inline')
      атр(el, 'transform', `translate(${д1(м.x)},${д1(м.y)})`)
      атр(el, 'opacity', м.сильная ? '1' : д3(Math.max(0.55, ps.get(n.id)!.fog)))
      атр(el.firstElementChild, 'class', 'graph-label-bg' + (м.сильная ? ' strong' : ''))
      атр(el.lastElementChild, 'class', 'graph-label' + (м.сильная ? ' strong' : ''))
    }
  }

  /*
   * Цикл кадров крутится, только пока что-то движется: раскладка не остыла,
   * граф вращается или его тянут. Застыл — цикл засыпает, а любое действие
   * будит его снова.
   */
  const кадр = useRef(0)
  const дела = useRef({ шаг, рисовать })
  дела.current = { шаг, рисовать }
  const разбудить = useCallback(() => {
    if (кадр.current) return
    let последний = performance.now()
    const тик = (сейчас: number) => {
      const dt = Math.min(3, Math.max(0, (сейчас - последний) / 16.7))
      последний = сейчас
      const ещё = дела.current.шаг(dt)
      дела.current.рисовать()
      кадр.current = ещё ? requestAnimationFrame(тик) : 0
    }
    кадр.current = requestAnimationFrame(тик)
  }, [])
  useEffect(() => () => {
    cancelAnimationFrame(кадр.current)
    кадр.current = 0
  }, [])

  useLayoutEffect(() => {
    nodesRef.current = nodes
    alpha.current = Math.max(alpha.current, 0.8)
    if (безДвижения) досчитать()
    разбудить()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes])

  useLayoutEffect(() => {
    // Смена режима — повод раскладке снова ожить: в плоскость узлы сходятся,
    // из плоскости — расходятся в объём.
    alpha.current = Math.max(alpha.current, 0.6)
    if (режим === '3d') for (const n of nodesRef.current) if (Math.abs(n.z) < 1) n.z = (Math.random() - 0.5) * 160
    if (безДвижения) досчитать()
    разбудить()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [режим])

  useEffect(() => {
    if (безДвижения) досчитать()
    разбудить()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [вращать, безДвижения])

  // Новые элементы получают координаты до того, как браузер их покажет.
  useLayoutEffect(() => {
    рисовать()
  })

  /** Вписать граф в холст. */
  const вписать = () => {
    const ns = nodesRef.current
    const { gw, gh } = живое.current
    if (!ns.length || !gw || !gh) {
      Object.assign(cam.current, { k: 1, px: 0, py: 0 })
      разбудить()
      return
    }
    const в = взглядСейчас()
    const ps = ns.map((n) => ({ n, p: проецировать(n, в, 1, 0, 0) }))
    const pad = 50
    // Слева лежит панель управления — граф вписывается в то, что справа от неё.
    const слева = gw > 760 ? 270 : 0
    const minX = Math.min(...ps.map(({ n, p }) => p.sx - n.r * p.s)) - в.cx
    const maxX = Math.max(...ps.map(({ n, p }) => p.sx + n.r * p.s)) - в.cx
    const minY = Math.min(...ps.map(({ n, p }) => p.sy - n.r * p.s)) - в.cy
    const maxY = Math.max(...ps.map(({ n, p }) => p.sy + n.r * p.s)) - в.cy
    // Подписи не масштабируются вместе с графом — на них справа оставляем
    // постоянный запас, а не долю.
    const подпись = 120
    const k = Math.min(2, Math.max(0.25, Math.min((gw - слева - pad * 2 - подпись) / Math.max(1, maxX - minX), (gh - pad * 2) / Math.max(1, maxY - minY))))
    Object.assign(cam.current, { k, px: (слева - подпись) / 2 - ((minX + maxX) / 2) * k, py: -((minY + maxY) / 2) * k })
    разбудить()
  }

  /** Навести камеру на узел. */
  const навести = (id: string) => {
    const n = nodesRef.current.find((x) => x.id === id)
    if (!n) return
    const в = взглядСейчас()
    const p = проецировать(n, в, cam.current.k, cam.current.px, cam.current.py)
    cam.current.px += в.cx - p.sx
    cam.current.py += в.cy - p.sy
    touched.current = true
    разбудить()
  }

  // -------------------------------------------------------- мышь
  const жест = useRef<
    | { вид: 'rotate' | 'pan'; sx: number; sy: number; yaw: number; pitch: number; px: number; py: number; ушёл: boolean }
    | { вид: 'node'; id: string; sx: number; sy: number; ушёл: boolean }
    | null
  >(null)

  // Обработчики окна вешаются один раз и читают камеру и режим из живых ссылок.
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
        const в = взглядСейчас()
        const p = проецировать(n, в, cam.current.k, cam.current.px, cam.current.py)
        const d = вМир((e.clientX - g.sx) / p.s, (e.clientY - g.sy) / p.s, в)
        n.x += d.x
        n.y += d.y
        n.z += в.плоско ? 0 : d.z
        g.sx = e.clientX
        g.sy = e.clientY
        alpha.current = Math.max(alpha.current, 0.25)
        разбудить()
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
      разбудить()
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
      // Отпустили — автоповорот продолжается.
      разбудить()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openNode = (n: GNode) => {
    if (n.kind === 'note') app.openTab('notes', n.label)
    else if (n.kind === 'category') app.openTab('transactions', 'cat:' + n.ref, { title: n.label })
    else if (n.kind === 'account') app.openTab('accounts')
    else if (n.kind === 'goal') app.openTab('goals')
  }

  // -------------------------------------------------------- отрисовка
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
        const c = cam.current
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
        const c = cam.current
        const rect = e.currentTarget.getBoundingClientRect()
        const в = взглядСейчас()
        const mx = e.clientX - rect.left - в.cx
        const my = e.clientY - rect.top - в.cy
        const k = Math.min(4, Math.max(0.2, c.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        // Масштаб к курсору: точка под мышью остаётся на месте.
        c.px = mx - (mx - c.px) * (k / c.k)
        c.py = my - (my - c.py) * (k / c.k)
        c.k = k
        разбудить()
      }}
    >
      <svg width="100%" height="100%" className="graph-svg">
        <g className="graph-links">
          {links.map((l, i) => (
            <line
              key={i}
              ref={(el) => { элСвязей.current[i] = el }}
              data-a={l.a}
              data-b={l.b}
              className={l.семья ? 'graph-link-family' : undefined}
              strokeLinecap="round"
            />
          ))}
        </g>
        <g className="graph-nodes" ref={слойУзлов}>
          {nodes.map((n) => (
            <g
              key={n.id}
              ref={(el) => {
                if (el) элУзлов.current.set(n.id, el)
                else элУзлов.current.delete(n.id)
              }}
              className={'graph-node k-' + n.kind + (n.id === выбран ? ' sel' : '')}
              data-id={n.id}
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
          ))}
        </g>
        <g className="graph-labels" pointerEvents="none">
          {nodes.map((n) => {
            const { текст, w } = подписьУзла(n)
            return (
              <g
                key={n.id}
                ref={(el) => {
                  if (el) элПодписей.current.set(n.id, el)
                  else элПодписей.current.delete(n.id)
                }}
              >
                <rect width={w} height={20} rx={10} />
                <text x={7} y={14}>{текст}</text>
              </g>
            )
          })}
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
              вписать()
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
      {/* У главной категории — орбита: вокруг неё держатся подкатегории. */}
      {n.подкатегорий ? <circle r={r + 4.5} className="graph-orbit" style={{ stroke: n.color }} /> : null}
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
          {n.подкатегорий ? <span className="faint small">{т('вместе с подкатегориями')}</span> : null}
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
          <span className="faint small">{n.earn ? т('заработано') : т('накоплено')}</span>
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
