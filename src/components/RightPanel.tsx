import React, { useMemo } from 'react'
import { сЗначкомъ } from '../lib/catalog'
import { Amount, Money } from './anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { StandingLine } from '../views/Profile'
import { Icon } from '../lib/icons'
import { money, pct, plural } from '../lib/format'
import { addDays, daysInMonth, humanDate, monthKey, parseISO, today } from '../lib/date'
import { balances, categoryTotals } from '../engine/stats'
import { occurrencesInMonth } from '../engine/forecast'
import { Spark } from './charts'
import { личное } from '../engine/project'
import { т, тр } from '../i18n'

/** Правая панель: то, что стоит держать перед глазами, не открывая раздел. */
export function RightPanel({ open }: { open: boolean }) {
  const app = useApp()
  const { data } = useStore()
  const { fc, advice } = useAnalytics(data)
  const cur = monthKey(today())

  const upcoming = useMemo(() => {
    const list: { title: string; date: string; amount: number; kind: string }[] = []
    for (const r of data.recurring) {
      if (!r.active) continue
      for (const off of [0, 1]) {
        const mk = off === 0 ? cur : monthKey(addDays(`${cur}-28`, 7))
        if (!occurrencesInMonth(r, mk)) continue
        const day = Math.min(r.dayOfMonth ?? 1, 28)
        const date = `${mk}-${String(day).padStart(2, '0')}`
        if (date < today()) continue
        list.push({ title: r.title, date, amount: r.amount, kind: r.kind })
      }
    }
    return list.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 5)
  }, [data.recurring, cur])

  // Выходим только после всех хуков: закрытая панель обязана вызвать их
  // столько же раз, сколько открытая, иначе React обнаружит, что хуков стало
  // меньше, и снимет всё дерево — окно осталось бы пустым.
  if (!open) return <div className="rightbar hidden" />

  // Сводка справа — о своих деньгах: проектные счета в неё не попадают.
  const личн = личное(data)
  const bal = balances(личн.accounts, личн.transactions)
  const curTx = личн.transactions.filter((t) => monthKey(t.date) === cur)
  const spent = curTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
  const earned = curTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const d = parseISO(today())
  const dim = daysInMonth(d.getFullYear(), d.getMonth())
  const progress = d.getDate() / dim
  const projected = Math.round(spent / Math.max(0.05, progress))

  const topAdvice = advice.filter((a) => a.severity === 'alert' || a.severity === 'warn').slice(0, 3)
  const goals = data.goals.filter((g) => !g.done).slice(0, 3)

  return (
    <div className="rightbar">
      {/* Кнопки «скрыть» здѣсь нет: правую панель прячет и возвращает одна
          кнопка ≡ в полосе вкладок. Две кнопки на одно действие только
          заставляли гадать, чем они отличаются. */}
      <div className="sidebar-head">
        <span>{т('Сводка')}</span>
      </div>
      <div className="sidebar-body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card tight">
          <div className="card-title" style={{ marginBottom: 6 }}>{т('Этот месяц')}</div>
          <div className="row">
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Потрачено')}</span>
              <span className="v amount out" style={{ fontSize: 17 }}>
                <span className="sign">−</span><Money value={spent} />
              </span>
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Получено')}</span>
              <span className="v amount in" style={{ fontSize: 17 }}>
                <span className="sign">+</span><Money value={earned} />
              </span>
            </div>
          </div>
          <div className="bar-track" style={{ marginTop: 10 }}>
            <div
              className="bar-fill"
              style={{
                width: `${Math.min(100, progress * 100)}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
          <div className="faint small" style={{ marginTop: 6 }}>
            {тр('Прошло {0}% месяца · по темпу выйдет {1}', Math.round(progress * 100), money(projected))}</div>
        </div>

        {topAdvice.length > 0 && (
          <div>
            <div className="card-title">{т('Требует внимания')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topAdvice.map((a) => (
                <div
                  key={a.id}
                  className={'advice-card ' + a.severity}
                  style={{ padding: '10px 12px', cursor: 'pointer' }}
                  onClick={() => app.openTab('advice')}
                >
                  <div style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-strong)' }}>{a.title}</div>
                  {a.impactMonthly > 0 && (
                    <div className="faint small" style={{ marginTop: 3 }}>
                      {тр('эффект ≈ {0}/мес', money(a.impactMonthly))}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="card tight">
            <div className="card-title" style={{ marginBottom: 6 }}>{т('Ближайшие списания')}</div>
            {upcoming.map((u, i) => (
              <div key={i} className="row" style={{ padding: '4px 0', fontSize: 12.5 }}>
                <span className="faint" style={{ width: 46 }}>{u.date.slice(8)}.{u.date.slice(5, 7)}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.title}</span>
                <Amount value={u.amount} kind={u.kind === 'income' ? 'income' : 'expense'} />
              </div>
            ))}
          </div>
        )}

        {goals.length > 0 && (
          <div className="card tight">
            <div className="card-title" style={{ marginBottom: 8 }}>{т('Цели')}</div>
            {goals.map((g) => {
              const saved = g.accountId ? bal.byAccount.get(g.accountId) || 0 : g.saved
              const share = g.targetAmount ? Math.min(1, saved / g.targetAmount) : 0
              return (
                <div key={g.id} style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => app.openTab('goals')}>
                  <div className="row small" style={{ marginBottom: 4 }}>
                    <span>{сЗначкомъ(g.icon, g.name)}</span>
                    <span className="spacer" />
                    <span className="faint num">{Math.round(share * 100)}%</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${share * 100}%`, background: g.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <StandingLine />

        <div className="card tight">
          <div className="card-title" style={{ marginBottom: 6 }}>{т('Прогноз на год')}</div>
          <div className="row">
            <div style={{ flex: 1 }}>
              <div className="faint small">{тр('Медиана через {0} мес.', data.settings.forecastHorizon)}</div>
              <div className="strong num" style={{ fontSize: 17 }}>
                {fc.months.length ? <Money value={fc.months[fc.months.length - 1].p50} /> : '—'}
              </div>
            </div>
            <Spark values={fc.months.map((m) => m.p50)} color="var(--accent)" />
          </div>
          {/* Карточка целиком про будущее — и норма здесь тоже прогнозная,
              иначе рядом стоят медиана вперёд и норма назад. */}
          <div className="faint small" style={{ marginTop: 6 }}>
            {тр('Норма сбережений {0} · риск минуса {1}', pct(fc.planSavingsRate, 1), pct(fc.riskNegative * 100))}</div>
          <button className="btn sm" style={{ marginTop: 10, width: '100%' }} onClick={() => app.openTab('forecast')}>
            {т('Открыть прогноз')}</button>
        </div>
      </div>
    </div>
  )
}
