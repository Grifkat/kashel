import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { listNotes, readNote } from '../state/vault'
import { extractLinks, extractTags } from '../lib/markdown'
import { addMonths, today } from '../lib/date'
import { moneyShort } from '../lib/format'
import { categoryTotals } from '../engine/stats'
import { Toggle } from '../components/ui'
import { useSize } from '../components/charts'

type Kind = 'note' | 'category' | 'account' | 'goal' | 'tag'

interface GNode {
  id: string
  label: string
  kind: Kind
  color: string
  r: number
  x: number
  y: number
  vx: number
  vy: number
  ref?: string
}
interface GLink {
  a: string
  b: string
  w: number
}

const KIND_COLOR: Record<Kind, string> = {
  note: '#8b95a5',
  category: '#e8833a',
  account: '#4cc46a',
  goal: '#8b5cf6',
  tag: '#4aa3e8',
}
const KIND_LABEL: Record<Kind, string> = {
  note: 'Заметки',
  category: 'Категории',
  account: 'Счета',
  goal: 'Цели',
  tag: 'Теги',
}

export default function GraphView() {
  const app = useApp()
  const { data } = useStore()
  const [notes, setNotes] = useState<{ name: string; body: string }[]>([])
  const [show, setShow] = useState<Record<Kind, boolean>>({ note: true, category: true, account: true, goal: true, tag: false })
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<string | null>(null)
  // Размер холста меряем наблюдателем, а не через getBoundingClientRect в
  // рендере: после затухания симуляции рендеров больше нет, и при скрытии
  // боковых панелей центр графа остался бы прежним.
  const [wrapRef, { w: gw, h: gh }] = useSize<HTMLDivElement>()
  const nodesRef = useRef<GNode[]>([])
  /** Взводится, как только человек сам подвинул или приблизил граф. */
  const touched = useRef(false)
  const [, force] = useState(0)

  useEffect(() => {
    void (async () => {
      const names = await listNotes()
      setNotes(await Promise.all(names.map(async (n) => ({ name: n, body: (await readNote(n)) || '' }))))
    })()
  }, [])

  // -------------------------------------------------------- построение графа
  const { nodes, links } = useMemo(() => {
    const ns: GNode[] = []
    const ls: GLink[] = []
    const seen = new Set<string>()
    const push = (id: string, label: string, kind: Kind, r: number, ref?: string) => {
      if (seen.has(id) || !show[kind]) return
      seen.add(id)
      ns.push({
        id, label, kind, ref, r,
        color: KIND_COLOR[kind],
        x: (Math.random() - 0.5) * 600,
        y: (Math.random() - 0.5) * 400,
        vx: 0, vy: 0,
      })
    }

    const since = addMonths(today(), -6)
    const scoped = data.transactions.filter((t) => t.date >= since)
    const totals = new Map(
      [...categoryTotals(scoped, 'expense'), ...categoryTotals(scoped, 'income')].map((t) => [t.categoryId, t.amount]),
    )
    const maxTotal = Math.max(1, ...totals.values())

    for (const n of notes) push('note:' + n.name, n.name, 'note', 7)
    for (const a of data.accounts.filter((x) => !x.archived)) push('acc:' + a.id, a.name, 'account', 13, a.id)
    for (const c of data.categories.filter((x) => !x.archived)) {
      const t = totals.get(c.id) ?? 0
      push('cat:' + c.id, c.name, 'category', 6 + (t / maxTotal) * 14, c.id)
    }
    for (const g of data.goals) push('goal:' + g.id, g.name, 'goal', 12, g.id)

    if (show.tag) {
      const tags = new Set<string>()
      for (const t of data.transactions) for (const x of t.tags) tags.add(x)
      for (const n of notes) for (const x of extractTags(n.body)) tags.add(x)
      for (const t of tags) push('tag:' + t, '#' + t, 'tag', 6)
    }

    const link = (a: string, b: string, w = 1) => {
      if (seen.has(a) && seen.has(b)) ls.push({ a, b, w })
    }

    // связи заметок
    for (const n of notes) {
      for (const l of extractLinks(n.body)) link('note:' + n.name, 'note:' + l, 1.4)
      const lower = n.body.toLowerCase()
      for (const c of data.categories) if (lower.includes(c.name.toLowerCase())) link('note:' + n.name, 'cat:' + c.id, 0.6)
      for (const g of data.goals) if (n.name === g.name || lower.includes(g.name.toLowerCase())) link('note:' + n.name, 'goal:' + g.id, 1)
      if (show.tag) for (const t of extractTags(n.body)) link('note:' + n.name, 'tag:' + t, 0.7)
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
      link(a, b, 0.4 + (v / maxPair) * 2.4)
    }
    for (const g of data.goals) if (g.accountId) link('goal:' + g.id, 'acc:' + g.accountId, 2)
    if (show.tag) {
      const tagPairs = new Set<string>()
      for (const t of data.transactions) {
        if (!t.categoryId) continue
        for (const x of t.tags) tagPairs.add(`tag:${x}|cat:${t.categoryId}`)
      }
      for (const key of tagPairs) {
        const [a, b] = key.split('|')
        link(a, b, 0.5)
      }
    }

    return { nodes: ns, links: ls }
  }, [notes, data, show])

  // -------------------------------------------------------- симуляция
  useEffect(() => {
    nodesRef.current = nodes
    const byId = new Map(nodes.map((n) => [n.id, n]))
    let frame = 0
    let alpha = 1

    const tick = () => {
      alpha *= 0.985
      const ns = nodesRef.current
      // отталкивание
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i]
          const b = ns[j]
          let dx = b.x - a.x
          let dy = b.y - a.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) {
            dx = Math.random() - 0.5
            dy = Math.random() - 0.5
            d2 = 1
          }
          const f = (2600 * alpha) / d2
          const d = Math.sqrt(d2)
          a.vx -= (dx / d) * f
          a.vy -= (dy / d) * f
          b.vx += (dx / d) * f
          b.vy += (dy / d) * f
        }
      }
      // притяжение по связям
      for (const l of links) {
        const a = byId.get(l.a)
        const b = byId.get(l.b)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const target = 110
        const f = ((d - target) / d) * 0.014 * l.w * alpha * 60
        a.vx += dx * f * 0.01
        a.vy += dy * f * 0.01
        b.vx -= dx * f * 0.01
        b.vy -= dy * f * 0.01
      }
      // к центру + затухание
      for (const n of ns) {
        n.vx -= n.x * 0.0016 * alpha * 60
        n.vy -= n.y * 0.0016 * alpha * 60
        n.vx *= 0.82
        n.vy *= 0.82
        n.x += Math.max(-30, Math.min(30, n.vx))
        n.y += Math.max(-30, Math.min(30, n.vy))
      }
      force((v) => v + 1)
      if (alpha > 0.02) frame = requestAnimationFrame(tick)
      else if (!touched.current) fit()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [nodes, links])

  // -------------------------------------------------------- взаимодействие
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return
      setView((v) => ({ ...v, x: drag.current!.ox + (e.clientX - drag.current!.sx), y: drag.current!.oy + (e.clientY - drag.current!.sy) }))
    }
    const up = () => (drag.current = null)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [])

  const openNode = (n: GNode) => {
    if (n.kind === 'note') app.openTab('notes', n.label)
    else if (n.kind === 'category') app.openTab('transactions', 'cat:' + n.ref, { title: n.label })
    else if (n.kind === 'account') app.openTab('accounts')
    else if (n.kind === 'goal') app.openTab('goals')
  }

  /**
   * Вписать граф в холст. Прежняя кнопка возвращала масштаб 1, а при разбросе
   * узлов в шестьсот пикселей это не влезает даже в широкую панель.
   */
  const fit = useCallback(() => {
    const ns = nodesRef.current
    if (!ns.length || !gw || !gh) {
      setView({ x: 0, y: 0, k: 1 })
      return
    }
    const pad = 48
    const minX = Math.min(...ns.map((n) => n.x - n.r))
    const maxX = Math.max(...ns.map((n) => n.x + n.r))
    const minY = Math.min(...ns.map((n) => n.y - n.r))
    const maxY = Math.max(...ns.map((n) => n.y + n.r))
    // Масштаб по более тесной стороне: в узкой панели граф сжимается, а не
    // обрезается.
    const k = Math.min(
      3,
      Math.max(
        0.2,
        Math.min((gw - pad * 2) / Math.max(1, maxX - minX), (gh - pad * 2) / Math.max(1, maxY - minY)),
      ),
    )
    setView({ k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k })
  }, [gw, gh])

  const connected = useMemo(() => {
    if (!hover) return null
    const s = new Set<string>([hover])
    for (const l of links) {
      if (l.a === hover) s.add(l.b)
      if (l.b === hover) s.add(l.a)
    }
    return s
  }, [hover, links])

  const cx = (gw || 800) / 2
  const cy = (gh || 600) / 2

  return (
    <div
      className="graph-wrap"
      ref={wrapRef}
      onMouseDown={(e) => {
        touched.current = true
        drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
      }}
      onWheel={(e) => {
        touched.current = true
        const k = Math.min(3, Math.max(0.2, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
        setView((v) => ({ ...v, k }))
      }}
    >
      <svg width="100%" height="100%">
        <g transform={`translate(${cx + view.x},${cy + view.y}) scale(${view.k})`}>
          {links.map((l, i) => {
            const a = nodesRef.current.find((n) => n.id === l.a)
            const b = nodesRef.current.find((n) => n.id === l.b)
            if (!a || !b) return null
            const dim = connected && !(connected.has(a.id) && connected.has(b.id))
            return (
              <line
                key={i}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--border)"
                strokeWidth={Math.min(3, l.w)}
                opacity={dim ? 0.12 : 0.5}
              />
            )
          })}
          {nodesRef.current.map((n) => {
            const dim = connected && !connected.has(n.id)
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                opacity={dim ? 0.2 : 1}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  openNode(n)
                }}
              >
                <circle r={n.r} fill={n.color} opacity={hover === n.id ? 1 : 0.85} />
                {(view.k > 0.55 || hover === n.id) && (
                  <text
                    y={n.r + 12}
                    textAnchor="middle"
                    className="axis-text"
                    style={{ fontSize: 11, fill: hover === n.id ? 'var(--text-strong)' : 'var(--muted)' }}
                  >
                    {n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="graph-legend" onMouseDown={(e) => e.stopPropagation()}>
        <div className="card-title" style={{ marginBottom: 8 }}>Граф связей</div>
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <div key={k} className="row" style={{ gap: 8, marginBottom: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: KIND_COLOR[k] }} />
            <span style={{ flex: 1 }}>{KIND_LABEL[k]}</span>
            <Toggle checked={show[k]} onChange={(v) => setShow((s) => ({ ...s, [k]: v }))} />
          </div>
        ))}
        <div className="faint small" style={{ marginTop: 10, width: '100%', lineHeight: 1.5 }}>
          Размер кружка категории — сумма за полгода, толщина связи — оборот между категорией и счётом.
          Клик открывает раздел.
        </div>
        <button
          className="btn sm"
          style={{ marginTop: 10, width: '100%' }}
          onClick={() => {
            touched.current = false
            fit()
          }}
        >
          <Icon name="fit" size={13} /> Сбросить вид
        </button>
      </div>
    </div>
  )
}
