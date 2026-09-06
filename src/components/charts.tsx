import React, { useLayoutEffect, useRef, useState } from 'react'
import { money, moneyShort, pct } from '../lib/format'
import type { Money } from '../lib/types'

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      // Тот же размер — та же ссылка: иначе каждое срабатывание наблюдателя
      // перерисовывает график зря.
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * Коробка графика. Пол по ширине нужен — ниже него подписи нечитаемы, — но
 * жить он обязан внутри собственной прокрутки графика, а не выталкивать
 * наружу весь экран. На узком поля осей съедают треть картинки, поэтому там
 * подписи убираются: форма линии важнее точных делений.
 */
function useChartBox(min: number) {
  const [ref, { w }] = useSize<HTMLDivElement>()
  const width = Math.max(min, w || min)
  const tiny = width < 300
  return { ref, width, tiny }
}

// ------------------------------------------------------------------ донат
export interface Slice {
  id?: string
  label: string
  value: Money
  color: string
}

export function Donut({
  slices,
  size = 240,
  thickness = 30,
  center,
  onSelect,
  activeId,
}: {
  slices: Slice[]
  size?: number
  thickness?: number
  center?: React.ReactNode
  onSelect?: (id: string | undefined) => void
  activeId?: string
}) {
  const [ref, box] = useSize<HTMLDivElement>()
  // size — это «не больше», а не «ровно столько»: в узкой колонке бублик
  // ужимается, но не мельче 120px, иначе дырка с суммой схлопывается.
  const s0 = box.w ? Math.max(120, Math.min(size, box.w)) : size
  const th = Math.max(12, thickness * (s0 / size))
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = (s0 - th) / 2
  const c = s0 / 2
  let offset = 0

  return (
    <div ref={ref} style={{ width: '100%', maxWidth: size, minWidth: 0, flex: '0 1 auto' }}>
    <div style={{ position: 'relative', width: s0, height: s0, margin: '0 auto' }}>
      <svg width={s0} height={s0} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        {total === 0 && (
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={th} opacity={0.5} />
        )}
        {slices.map((s, i) => {
          const share = total ? (s.value / total) * 100 : 0
          const dash = Math.max(0, share - 0.6)
          const el = (
            <circle
              key={s.id ?? i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={activeId && activeId === s.id ? th + 6 : th}
              pathLength={100}
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={-offset}
              style={{
                cursor: onSelect ? 'pointer' : 'default',
                opacity: activeId && activeId !== s.id ? 0.35 : 1,
                transition: 'opacity 120ms ease, stroke-width 120ms ease',
              }}
              onClick={() => onSelect?.(activeId === s.id ? undefined : s.id)}
            />
          )
          offset += share
          return el
        })}
        <circle cx={c} cy={c} r={r - th / 2 - 4} fill="none" stroke="var(--border-soft)" strokeWidth={1} strokeDasharray="3 4" />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          pointerEvents: 'none',
          padding: th + 8,
        }}
      >
        {center}
      </div>
    </div>
    </div>
  )
}

// ------------------------------------------------------------------ линия
export interface LinePoint {
  label: string
  value: number
  lo?: number
  hi?: number
  forecast?: boolean
}

export function LineChart({
  points,
  height = 220,
  color = 'var(--accent)',
  bandColor,
  zeroLine = true,
  format = moneyShort,
  onHover,
}: {
  points: LinePoint[]
  height?: number
  color?: string
  bandColor?: string
  zeroLine?: boolean
  format?: (v: number) => string
  onHover?: (i: number | null) => void
}) {
  const { ref, width, tiny } = useChartBox(160)
  const [hover, setHover] = useState<number | null>(null)
  const padL = tiny ? 10 : 52
  const padR = tiny ? 10 : 12
  const padT = 12
  const padB = 26
  const iw = width - padL - padR
  const ih = height - padT - padB

  const vals = points.flatMap((p) => [p.value, p.lo ?? p.value, p.hi ?? p.value])
  let min = Math.min(0, ...vals)
  let max = Math.max(...vals, 1)
  const span = max - min || 1
  min -= span * 0.06
  max += span * 0.06

  const x = (i: number) => padL + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw)
  const y = (v: number) => padT + ih - ((v - min) / (max - min)) * ih

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const hasBand = points.some((p) => p.lo != null && p.hi != null)
  const band = hasBand
    ? points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.hi ?? p.value).toFixed(1)}`).join(' ') +
      ' ' +
      points
        .slice()
        .reverse()
        .map((p, i) => `L${x(points.length - 1 - i).toFixed(1)},${y(p.lo ?? p.value).toFixed(1)}`)
        .join(' ') +
      ' Z'
    : ''

  const firstForecast = points.findIndex((p) => p.forecast)
  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) / ticks) * i)

  return (
    // Прокрутка надета только на обёртку вокруг svg: всплывающая подсказка
    // ниже — сосед этой обёртки, иначе она обрезалась бы по её краю.
    <div ref={ref} style={{ width: '100%', minWidth: 0, position: 'relative' }}>
      <div style={{ overflowX: 'auto' }}>
      <svg
        width={width}
        height={height}
        style={{ display: 'block' }}
        onMouseLeave={() => {
          setHover(null)
          onHover?.(null)
        }}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const rel = e.clientX - rect.left - padL
          const i = Math.round((rel / iw) * (points.length - 1))
          const clamped = Math.max(0, Math.min(points.length - 1, i))
          setHover(clamped)
          onHover?.(clamped)
        }}
      >
        <g className="chart-grid">
          {tickVals.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} />
              {!tiny && (
                <text className="axis-text" x={padL - 8} y={y(v) + 3.5} textAnchor="end">
                  {format(v)}
                </text>
              )}
            </g>
          ))}
        </g>
        {zeroLine && min < 0 && (
          <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} stroke="var(--alert)" strokeDasharray="4 4" opacity={0.6} />
        )}
        {firstForecast > 0 && (
          <line
            x1={x(firstForecast)}
            x2={x(firstForecast)}
            y1={padT}
            y2={padT + ih}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
        )}
        {hasBand && <path d={band} fill={bandColor ?? color} opacity={0.14} />}
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) =>
          points.length <= 26 || i === hover ? (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={i === hover ? 4.5 : 2.6} fill={color} />
          ) : null,
        )}
        {points.map((p, i) => {
          const step = Math.ceil(points.length / Math.max(2, Math.floor(iw / 62)))
          return i % step === 0 || i === points.length - 1 ? (
            <text key={'l' + i} className="axis-text" x={x(i)} y={height - 8} textAnchor="middle">
              {p.label}
            </text>
          ) : null
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--faint)" opacity={0.4} />}
      </svg>
      </div>
      {hover != null && points[hover] && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(width - 170, Math.max(0, x(hover) - 80)),
            top: 4,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            boxShadow: 'var(--shadow)',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="faint" style={{ fontSize: 12 }}>{points[hover].label}</div>
          <div className="strong num">{money(points[hover].value)}</div>
          {points[hover].lo != null && (
            <div className="faint num" style={{ fontSize: 12 }}>
              {money(points[hover].lo!)} … {money(points[hover].hi!)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ бары
export interface BarGroup {
  label: string
  values: { value: number; color: string; name: string }[]
}

export function BarChart({
  groups,
  height = 200,
  format = moneyShort,
  onClick,
}: {
  groups: BarGroup[]
  height?: number
  format?: (v: number) => string
  onClick?: (i: number) => void
}) {
  const { ref, width, tiny } = useChartBox(160)
  const [hover, setHover] = useState<number | null>(null)
  const padL = tiny ? 10 : 52
  const padR = tiny ? 10 : 10
  const padT = 10
  const padB = 24
  const iw = width - padL - padR
  const ih = height - padT - padB
  const max = Math.max(1, ...groups.flatMap((g) => g.values.map((v) => v.value)))
  const gw = groups.length ? iw / groups.length : iw
  const barW = Math.max(3, Math.min(20, (gw - 8) / Math.max(1, groups[0]?.values.length || 1)))

  return (
    <div ref={ref} style={{ width: '100%', minWidth: 0, position: 'relative' }}>
      <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <g className="chart-grid">
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={padT + ih - f * ih} y2={padT + ih - f * ih} />
              {!tiny && (
                <text className="axis-text" x={padL - 8} y={padT + ih - f * ih + 3.5} textAnchor="end">
                  {format(max * f)}
                </text>
              )}
            </g>
          ))}
        </g>
        {groups.map((g, gi) => {
          const cx = padL + gi * gw + gw / 2
          const n = g.values.length
          return (
            <g
              key={gi}
              onMouseEnter={() => setHover(gi)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onClick?.(gi)}
              style={{ cursor: onClick ? 'pointer' : 'default' }}
            >
              <rect x={padL + gi * gw} y={padT} width={gw} height={ih} fill={hover === gi ? 'var(--hover)' : 'transparent'} />
              {g.values.map((v, vi) => {
                const h = (v.value / max) * ih
                return (
                  <rect
                    key={vi}
                    x={cx - (n * barW) / 2 + vi * barW + 1}
                    y={padT + ih - h}
                    width={barW - 2}
                    height={Math.max(0, h)}
                    rx={2.5}
                    fill={v.color}
                  />
                )
              })}
              {/* Одна подпись месяца занимает около 34px; при 12 группах старое
                  условие всегда было истинным и рисовало все подписи даже в 144px. */}
              {gi % Math.max(1, Math.ceil(groups.length / Math.max(2, Math.floor(iw / 34)))) === 0 && (
                <text className="axis-text" x={cx} y={height - 7} textAnchor="middle">
                  {g.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      </div>
      {hover != null && groups[hover] && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(width - 160, Math.max(0, padL + hover * gw - 60)),
            top: 2,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            boxShadow: 'var(--shadow)',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="faint" style={{ fontSize: 12 }}>{groups[hover].label}</div>
          {groups[hover].values.map((v, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color }} />
              <span className="faint">{v.name}</span>
              <span className="num strong" style={{ marginLeft: 'auto' }}>{money(v.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------- полоса-стек
export function StackBar({ slices, height = 12 }: { slices: Slice[]; height?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div style={{ display: 'flex', height, borderRadius: height / 2, overflow: 'hidden', gap: 1.5 }}>
      {slices.map((s, i) => (
        <div
          key={i}
          title={`${s.label}: ${money(s.value)}`}
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
        />
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ спарк
export function Spark({ values, color = 'var(--accent)', width = 90, height = 26 }: { values: number[]; color?: string; width?: number; height?: number }) {
  // minWidth обязателен явно: авто-минимум замещённого элемента равен его
  // собственной ширине и сжаться не даёт.
  const box: React.CSSProperties = { maxWidth: '100%', minWidth: 24, flex: '0 1 auto' }
  if (values.length < 2) return <svg width={width} height={height} style={box} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * width},${height - ((v - min) / span) * (height - 4) - 2}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none" style={box}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ------------------------------------------------------------------ санкей
export interface SankeyNode {
  id: string
  label: string
  value: Money
  color: string
  column: number
}
export interface SankeyLink {
  from: string
  to: string
  value: Money
}

export function Sankey({
  nodes,
  links,
  height = 420,
}: {
  nodes: SankeyNode[]
  links: SankeyLink[]
  height?: number
}) {
  const [ref, { w }] = useSize<HTMLDivElement>()
  const width = Math.max(360, w)
  const cols = Math.max(...nodes.map((n) => n.column)) + 1
  const nodeW = 14
  const gapY = 8
  const padX = 8
  const colX = (c: number) => padX + (c / Math.max(1, cols - 1)) * (width - nodeW - padX * 2 - 150) + (c === cols - 1 ? 0 : 0)

  const byCol = new Map<number, SankeyNode[]>()
  for (const n of nodes) {
    const arr = byCol.get(n.column) || []
    arr.push(n)
    byCol.set(n.column, arr)
  }

  const layout = new Map<string, { x: number; y: number; h: number }>()
  for (const [c, list] of byCol) {
    const total = list.reduce((s, n) => s + n.value, 0) || 1
    const avail = height - gapY * (list.length - 1) - 12
    let y = 6
    for (const n of list) {
      const h = Math.max(4, (n.value / total) * avail)
      layout.set(n.id, { x: colX(c), y, h })
      y += h + gapY
    }
  }

  // Смещения внутри узла, чтобы ленты не наезжали друг на друга.
  const outOff = new Map<string, number>()
  const inOff = new Map<string, number>()

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={width} height={height}>
        {links.map((l, i) => {
          const a = layout.get(l.from)
          const b = layout.get(l.to)
          const na = nodes.find((n) => n.id === l.from)
          if (!a || !b || !na) return null
          const totalOut = links.filter((x) => x.from === l.from).reduce((s, x) => s + x.value, 0) || 1
          const totalIn = links.filter((x) => x.to === l.to).reduce((s, x) => s + x.value, 0) || 1
          const ha = (l.value / totalOut) * a.h
          const hb = (l.value / totalIn) * b.h
          const oa = outOff.get(l.from) || 0
          const ob = inOff.get(l.to) || 0
          outOff.set(l.from, oa + ha)
          inOff.set(l.to, ob + hb)
          const x1 = a.x + nodeW
          const x2 = b.x
          const y1 = a.y + oa
          const y2 = b.y + ob
          const mx = (x1 + x2) / 2
          const d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} L${x2},${y2 + hb} C${mx},${y2 + hb} ${mx},${y1 + ha} ${x1},${y1 + ha} Z`
          return <path key={i} d={d} fill={na.color} opacity={0.28} />
        })}
        {nodes.map((n) => {
          const p = layout.get(n.id)!
          const isLast = n.column === cols - 1
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={nodeW} height={p.h} rx={3} fill={n.color} />
              <text
                className="sankey-label"
                x={isLast ? p.x + nodeW + 7 : p.x + nodeW + 7}
                y={p.y + p.h / 2 + 4}
                textAnchor="start"
              >
                {n.label} · {moneyShort(n.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
