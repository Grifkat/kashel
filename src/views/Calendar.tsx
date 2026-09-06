import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { Amount } from '../components/anim'
import { Avatar } from '../components/ui'
import { money, plural } from '../lib/format'
import { addDays, humanDate, MONTHS_SHORT, startOfWeek, today, WEEKDAYS } from '../lib/date'
import { yearSummary, type DayPoint } from '../engine/stats'

/**
 * Год днями. Смысл экрана — увидеть ритм трат: выходные, дни зарплаты,
 * недели, когда деньги утекали каждый день. Средние по месяцам этого не
 * показывают, а календарь показывает без единой цифры.
 */
export default function CalendarView() {
  const app = useApp()
  const { data } = useStore()
  const [side, setSide] = useState<'expense' | 'income'>('expense')
  const [year, setYear] = useState(() => today().slice(0, 4))
  const [sel, setSel] = useState<string | null>(null)

  const firstDay = data.settings.firstDayOfWeek
  const hidden = data.settings.hideBalance
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])

  const sum = useMemo(() => yearSummary(data.transactions, year), [data.transactions, year])
  const byDate = useMemo(() => new Map(sum.days.map((d) => [d.date, d])), [sum])
  const valueOf = (d?: DayPoint) => (!d ? 0 : side === 'expense' ? d.expense : d.income)

  // Уровни заливки берём от квантилей, а не от максимума: одна крупная покупка
  // иначе делает весь остальной год одинаково бледным.
  const steps = useMemo(() => {
    const vals = sum.days.map((d) => valueOf(d)).filter((v) => v > 0).sort((a, b) => a - b)
    if (!vals.length) return [] as number[]
    const at = (q: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * q))]
    return [at(0.25), at(0.5), at(0.75), at(0.92)]
  }, [sum, side])

  const level = (v: number) => {
    if (v <= 0) return 0
    let l = 1
    for (const s of steps) if (v > s) l++
    return Math.min(5, l)
  }

  const tone = side === 'expense' ? 'var(--money-out)' : 'var(--money-in)'
  const fill = (l: number) =>
    l === 0 ? 'var(--panel-2)' : `color-mix(in srgb, ${tone} ${l * 20}%, var(--panel-2))`

  // Сетка: колонка — неделя, строка — день недели. Дни до 1 января и после
  // 31 декабря остаются пустыми клетками, чтобы недели не разъезжались.
  const weeks = useMemo(() => {
    const out: string[][] = []
    const start = startOfWeek(`${year}-01-01`, firstDay)
    const end = addDays(startOfWeek(`${year}-12-31`, firstDay), 6)
    for (let d = start; d <= end; d = addDays(d, 7)) {
      const week: string[] = []
      for (let i = 0; i < 7; i++) week.push(addDays(d, i))
      out.push(week)
    }
    return out
  }, [year, firstDay])

  const monthLabels = useMemo(() => {
    let shown = -1
    return weeks.map((w) => {
      const inYear = w.filter((d) => d.slice(0, 4) === year)
      if (!inYear.length) return ''
      const m = Number(inYear[0].slice(5, 7)) - 1
      // Подпись ставим на первой неделе месяца и только один раз.
      if (m !== shown && inYear.some((d) => Number(d.slice(8)) <= 7)) {
        shown = m
        return MONTHS_SHORT[m]
      }
      return ''
    })
  }, [weeks, year])

  const scroller = useRef<HTMLDivElement>(null)
  /*
   * Год влезает без прокрутки почти везде, но не везде: на минимальном окне
   * с двумя открытыми панелями содержимому остаётся около 470px против нужных
   * 486px. Открывать карточку на январе в такой раскладке бессмысленно —
   * человек пришёл смотреть текущий месяц.
   */
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    const now = today()
    if (year !== now.slice(0, 4)) return
    const col = weeks.findIndex((w) => w.includes(now))
    if (col < 0) return
    el.scrollLeft = Math.max(0, ((col + 0.5) / weeks.length) * el.scrollWidth - el.clientWidth / 2)
  }, [year, weeks])

  const weekdayNames = useMemo(
    () => Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + firstDay) % 7]),
    [firstDay],
  )

  const years = useMemo(() => {
    const set = new Set(data.transactions.map((t) => t.date.slice(0, 4)))
    set.add(today().slice(0, 4))
    return [...set].sort()
  }, [data.transactions])

  const total = side === 'expense' ? sum.expense : sum.income
  const active = sum.days.filter((d) => valueOf(d) > 0)
  const top = active.reduce<DayPoint | undefined>((best, d) => (!best || valueOf(d) > valueOf(best) ? d : best), undefined)

  const selList = useMemo(
    () => (sel ? data.transactions.filter((t) => t.date === sel && t.kind !== 'transfer') : []),
    [sel, data.transactions],
  )

  return (
    <div className="view wide">
      <div className="view-head">
        <div>
          <h1 className="view-title">Календарь</h1>
          <div className="view-sub">
            Каждая клетка — день года, насыщенность — сколько в этот день {side === 'expense' ? 'потрачено' : 'получено'}
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 16, gap: 12 }}>
        <div className="seg">
          <button className={side === 'expense' ? 'on' : ''} onClick={() => setSide('expense')}>Расходы</button>
          <button className={side === 'income' ? 'on' : ''} onClick={() => setSide('income')}>Доходы</button>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button
            className="icon-btn"
            disabled={years[0] >= year}
            onClick={() => setYear((y) => String(Number(y) - 1))}
          >
            <Icon name="left" size={15} />
          </button>
          <span className="strong" style={{ minWidth: 54, textAlign: 'center' }}>{year}</span>
          <button
            className="icon-btn"
            disabled={year >= today().slice(0, 4)}
            onClick={() => setYear((y) => String(Number(y) + 1))}
          >
            <Icon name="right" size={15} />
          </button>
        </div>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={() => app.openTab('year')}>
          Итоги года <Icon name="right" size={13} />
        </button>
      </div>

      <div className="card cal-card" style={{ '--cal-weeks': weeks.length } as React.CSSProperties}>
        <div className="cal-body" ref={scroller}>
          <div className="cal-week-labels" style={{ marginTop: 20 }}>
            {weekdayNames.map((w, i) => (
              <span key={i}>{i % 2 === 0 ? w : ''}</span>
            ))}
          </div>
          <div>
            <div className="cal-months">
              {monthLabels.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
            </div>
            <div className="cal-grid">
              {weeks.flat().map((d) => {
                const own = d.slice(0, 4) === year
                const point = byDate.get(d)
                const v = valueOf(point)
                if (!own || d > sum.through) {
                  return <div key={d} className="cal-cell blank" title={own ? 'ещё не наступил' : ''} />
                }
                return (
                  <button
                    key={d}
                    className={'cal-cell' + (sel === d ? ' sel' : '')}
                    style={{ background: fill(level(v)) }}
                    title={`${humanDate(d, true)} — ${v > 0 ? money(v) : 'ничего'}${point && point.count ? ` · ${point.count} ${plural(point.count, 'операция', 'операции', 'операций')}` : ''}`}
                    onClick={() => setSel(sel === d ? null : d)}
                  />
                )
              })}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <div className="cal-legend">
            меньше
            {[0, 1, 2, 3, 4, 5].map((l) => (
              <i key={l} style={{ background: fill(l) }} />
            ))}
            больше
          </div>
          <span className="spacer" />
          <span className="faint small">Клик по дню — операции этого дня</span>
        </div>
      </div>

      <div className="grid c4" style={{ marginTop: 16 }}>
        <div className="card tight">
          <div className="card-title">{side === 'expense' ? 'Потрачено за год' : 'Получено за год'}</div>
          <div className={'stat'}>
            <span className={'v amount ' + (side === 'expense' ? 'out' : 'in')}>
              {hidden ? '••••' : money(total)}
            </span>
          </div>
        </div>
        <div className="card tight">
          <div className="card-title">В среднем в день</div>
          <div className="stat">
            <span className="v">{hidden ? '••••' : money(Math.round(total / Math.max(1, sum.daysLived)))}</span>
            <span className="d faint">по {sum.daysLived} {plural(sum.daysLived, 'дню', 'дням', 'дням')}</span>
          </div>
        </div>
        <div className="card tight">
          <div className="card-title">Самый {side === 'expense' ? 'дорогой' : 'щедрый'} день</div>
          <div className="stat">
            <span className="v">{top ? (hidden ? '••••' : money(valueOf(top))) : '—'}</span>
            {top && (
              <button className="d btn sm ghost" style={{ padding: 0 }} onClick={() => setSel(top.date)}>
                {humanDate(top.date, true)}
              </button>
            )}
          </div>
        </div>
        <div className="card tight">
          <div className="card-title">{side === 'expense' ? 'Дней без трат' : 'Дней без дохода'}</div>
          <div className="stat">
            <span className="v">{sum.daysLived - active.length}</span>
            <span className="d faint">из {sum.daysLived}</span>
          </div>
        </div>
      </div>

      {sel && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <div className="card-title" style={{ margin: 0 }}>
              <Icon name="calendar" size={13} /> {humanDate(sel, true)}
            </div>
            <span className="spacer" />
            <button
              className="btn sm ghost"
              onClick={() => app.openTab('transactions', 'day:' + sel, { title: humanDate(sel) })}
            >
              Открыть в операциях <Icon name="right" size={13} />
            </button>
            <button className="icon-btn" title="Закрыть" onClick={() => setSel(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
          {selList.length === 0 && <div className="empty">В этот день операций не было</div>}
          {selList.map((t) => {
            const c = t.categoryId ? catById.get(t.categoryId) : undefined
            return (
              <div
                key={t.id}
                className={'tx-row ' + (t.kind === 'income' ? 'in' : 'out')}
                onClick={() => app.editTransaction(t)}
              >
                <Avatar icon={c?.icon} color={c?.color} />
                <div className="tx-main">
                  <div className="tx-title">{t.note || c?.name || 'Операция'}</div>
                  <div className="tx-sub">{c?.name ?? 'без категории'}</div>
                </div>
                <Amount value={t.amount} kind={t.kind} hidden={hidden} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
