import React, { useMemo, useState } from 'react'
import { сЗначкомъ } from '../lib/catalog'
import { Amount, Money } from './anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { StandingLine } from '../views/Profile'
import { Icon } from '../lib/icons'
import { money, pct } from '../lib/format'
import { addDays, daysInMonth, monthKey, parseISO, today } from '../lib/date'
import { balances, creditRemaining } from '../engine/stats'
import { occurrencesInMonth } from '../engine/forecast'
import { Spark } from './charts'
import { Avatar } from './ui'
import { личное } from '../engine/project'
import { ВИДЖЕТЫ_ПО_УМОЛЧАНИЮ, type ВиджетId } from '../lib/types'
import { т, тр } from '../i18n'

/*
 * Правая панель: виджеты, которые человек выбирает сам.
 *
 * Список включённых и их порядок лежат в настройках (rightWidgets). Кнопка
 * «Настроить» в шапке включает правку: у каждого виджета появляются стрелки
 * и крестик, а внизу — виджеты, которые можно добавить. Пустой виджет в
 * обычном виде не рисуется, а в правке показан заглушкой — иначе его нельзя
 * было бы убрать, пока у него нет данных.
 */

/** Названия виджетов — и в правке, и в списке «Добавить». */
export const НАЗВАНИЯ_ВИДЖЕТОВ: Record<ВиджетId, string> = {
  month: т('Этот месяц'),
  attention: т('Требует внимания'),
  upcoming: т('Ближайшие списания'),
  goals: т('Цели'),
  rank: т('Чинъ'),
  forecast: т('Прогноз на год'),
  accounts: т('Счета'),
  credits: т('Кредиты'),
}
const ВСЕ_ВИДЖЕТЫ = Object.keys(НАЗВАНИЯ_ВИДЖЕТОВ) as ВиджетId[]

/** Включённые виджеты: неизвестные и повторы отбрасываются. */
export function включённыеВиджеты(список: string[] | undefined): ВиджетId[] {
  const итогъ: ВиджетId[] = []
  for (const w of список ?? ВИДЖЕТЫ_ПО_УМОЛЧАНИЮ) {
    if ((ВСЕ_ВИДЖЕТЫ as string[]).includes(w) && !итогъ.includes(w as ВиджетId)) итогъ.push(w as ВиджетId)
  }
  return итогъ
}

export function RightPanel({ open }: { open: boolean }) {
  const app = useApp()
  const { data, patchSettings } = useStore()
  const { fc, advice } = useAnalytics(data)
  const [правка, setПравка] = useState(false)
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

  const включены = включённыеВиджеты(data.settings.rightWidgets)
  const можноДобавить = ВСЕ_ВИДЖЕТЫ.filter((w) => !включены.includes(w))
  const сохранить = (список: ВиджетId[]) => patchSettings({ rightWidgets: список })
  const убрать = (w: ВиджетId) => сохранить(включены.filter((x) => x !== w))
  const сдвинуть = (w: ВиджетId, на: -1 | 1) => {
    const i = включены.indexOf(w)
    const j = i + на
    if (j < 0 || j >= включены.length) return
    const список = [...включены]
    ;[список[i], список[j]] = [список[j], список[i]]
    сохранить(список)
  }

  // Сводка справа — о своих деньгах: проектные счета в неё не попадают.
  const личн = личное(data)
  const bal = balances(личн.accounts, личн.transactions)
  const скрыто = data.settings.hideBalance

  const виджетъ = (w: ВиджетId): React.ReactNode => {
    switch (w) {
      case 'month': {
        const curTx = личн.transactions.filter((t) => monthKey(t.date) === cur)
        const spent = curTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
        const earned = curTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
        const d = parseISO(today())
        const progress = d.getDate() / daysInMonth(d.getFullYear(), d.getMonth())
        const projected = Math.round(spent / Math.max(0.05, progress))
        return (
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
              <div className="bar-fill" style={{ width: `${Math.min(100, progress * 100)}%`, background: 'var(--accent)' }} />
            </div>
            <div className="faint small" style={{ marginTop: 6 }}>
              {тр('Прошло {0}% месяца · по темпу выйдет {1}', Math.round(progress * 100), money(projected))}</div>
          </div>
        )
      }
      case 'attention': {
        const topAdvice = advice.filter((a) => a.severity === 'alert' || a.severity === 'warn').slice(0, 3)
        if (!topAdvice.length) return null
        return (
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
        )
      }
      case 'upcoming':
        if (!upcoming.length) return null
        return (
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
        )
      case 'goals': {
        const goals = data.goals.filter((g) => !g.done).slice(0, 3)
        if (!goals.length) return null
        return (
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
        )
      }
      case 'rank':
        return <StandingLine />
      case 'forecast':
        return (
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
        )
      case 'accounts': {
        const счета = data.accounts.filter((a) => !a.archived && a.type !== 'credit' && a.type !== 'debt')
        if (!счета.length) return null
        return (
          <div className="card tight">
            <div className="card-title" style={{ marginBottom: 6 }}>{т('Счета')}</div>
            {счета.map((a) => (
              <div key={a.id} className="row small" style={{ padding: '3px 0', gap: 8, cursor: 'pointer' }}
                onClick={() => app.openTab('transactions', 'acc:' + a.id, { title: a.name })}>
                <Avatar icon={a.icon} color={a.color} size="sm" />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span className="num">{скрыто ? '••••' : money(bal.byAccount.get(a.id) ?? 0)}</span>
              </div>
            ))}
          </div>
        )
      }
      case 'credits': {
        const кредиты = data.accounts.filter((a) => !a.archived && a.type === 'credit' && a.credit)
        if (!кредиты.length) return null
        return (
          <div className="card tight">
            <div className="card-title" style={{ marginBottom: 8 }}>{т('Кредиты')}</div>
            {кредиты.map((a) => {
              const осталось = creditRemaining(a, data.transactions)
              const взято = a.credit!.principal
              const доля = взято > 0 ? Math.min(1, Math.max(0, (взято - осталось) / взято)) : 0
              return (
                <div key={a.id} style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => app.openTab('debts')}>
                  <div className="row small" style={{ marginBottom: 4 }}>
                    <span>{a.name}</span>
                    <span className="spacer" />
                    <span className="faint num">{скрыто ? '••••' : тр('осталось {0}', money(осталось))}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${доля * 100}%`, background: a.color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    }
  }

  return (
    <div className="rightbar">
      {/* Кнопки «скрыть» здѣсь нет: правую панель прячет и возвращает одна
          кнопка ≡ в полосе вкладок. Две кнопки на одно действие только
          заставляли гадать, чем они отличаются. */}
      <div className="sidebar-head">
        <span>{т('Сводка')}</span>
        <span className="spacer" />
        <button
          className={'icon-btn' + (правка ? ' active' : '')}
          title={правка ? т('Готово') : т('Настроить виджеты')}
          aria-pressed={правка}
          onClick={() => setПравка((v) => !v)}
        >
          <Icon name={правка ? 'check' : 'edit'} size={14} />
        </button>
      </div>
      <div className="sidebar-body" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {включены.map((w, i) => {
          const тѣло = виджетъ(w)
          if (!правка) return тѣло ? <React.Fragment key={w}>{тѣло}</React.Fragment> : null
          return (
            <div key={w} className="widget-edit" data-widget={w}>
              <div className="widget-edit-bar">
                <span className="strong small" style={{ flex: 1 }}>{НАЗВАНИЯ_ВИДЖЕТОВ[w]}</span>
                <button className="icon-btn" title={т('Выше')} disabled={i === 0} onClick={() => сдвинуть(w, -1)}>
                  <Icon name="up" size={13} />
                </button>
                <button className="icon-btn" title={т('Ниже')} disabled={i === включены.length - 1} onClick={() => сдвинуть(w, 1)}>
                  <Icon name="down" size={13} />
                </button>
                <button className="icon-btn" title={т('Убрать виджет')} onClick={() => убрать(w)}>
                  <Icon name="x" size={13} />
                </button>
              </div>
              {тѣло ?? <div className="faint small" style={{ padding: '6px 2px' }}>{т('Пока пусто — появится, когда будут данные.')}</div>}
            </div>
          )
        })}

        {правка && (
          <div className="card tight">
            <div className="card-title" style={{ marginBottom: 8 }}>{т('Добавить виджет')}</div>
            {!можноДобавить.length && <div className="faint small">{т('Все виджеты уже на панели.')}</div>}
            <div className="row wrap" style={{ gap: 6 }}>
              {можноДобавить.map((w) => (
                <button key={w} className="chip" onClick={() => сохранить([...включены, w])}>
                  <Icon name="plus" size={11} /> {НАЗВАНИЯ_ВИДЖЕТОВ[w]}
                </button>
              ))}
            </div>
            <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => patchSettings({ rightWidgets: undefined })}>
              {т('Вернуть как было')}</button>
          </div>
        )}

        {!правка && !включены.length && (
          <div className="faint small" style={{ textAlign: 'center', padding: 12 }}>
            {т('Виджетов нет. Нажмите карандаш вверху, чтобы добавить.')}</div>
        )}
      </div>
    </div>
  )
}
