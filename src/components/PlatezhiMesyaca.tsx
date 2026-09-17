import React, { useMemo, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useДеньги } from './anim'
import { Icon } from '../lib/icons'
import { diffDays, humanDate, monthKey, monthTitle, today, вСтрочную } from '../lib/date'
import { plural } from '../lib/format'
import { платежиМесяца, type ПлатёжМесяца } from '../engine/platezhi'
import { т, тр } from '../i18n'

const ВИДНО = 8

const ЗНАЧОК: Record<ПлатёжМесяца['вид'], string> = { credit: 'credit', recurring: 'repeat', task: 'check' }

/**
 * «Платежи этого месяца» на «Сводке»: кредиты по графику, регулярные
 * расходы и задачи с суммой — по датам, с отметкой, что уже оплачено.
 */
export function PlatezhiMesyaca({ style }: { style?: React.CSSProperties }) {
  const money = useДеньги()
  const app = useApp()
  const { data } = useStore()
  const сейчас = today()
  const п = useMemo(() => платежиМесяца(data, monthKey(сейчас), сейчас), [data, сейчас])
  const [всё, setВсё] = useState(false)

  if (!п.список.length) {
    return (
      <div className="card platezhi" style={style}>
        <div className="card-title"><Icon name="calendar" size={14} /> {т(' Платежи этого месяца')}</div>
        <div className="faint small">
          {т('Обязательных платежей в этом месяце нет. Они берутся из кредитов, «Регулярных» и задач с суммой «трата».')}</div>
      </div>
    )
  }

  const видимые = всё ? п.список : п.список.slice(0, ВИДНО)
  const доля = п.всего > 0 ? п.оплачено / п.всего : 0

  const оплатить = (x: ПлатёжМесяца) => {
    if (x.вид === 'credit') {
      const кредит = data.accounts.find((a) => a.id === x.ref)
      if (кредит) app.погасить({ вид: 'credit', кредит })
      return
    }
    if (x.вид === 'recurring') {
      const r = data.recurring.find((y) => y.id === x.ref)
      if (!r) return
      app.editTransaction({
        kind: 'expense',
        amount: x.сумма - x.внесено,
        accountId: r.accountId,
        categoryId: r.categoryId,
        recurringId: r.id,
        note: r.title,
        tags: r.tags,
        date: x.дата < сейчас ? сейчас : x.дата,
      })
      return
    }
    app.openTab('tasks')
  }

  const подпись = (x: ПлатёжМесяца) => {
    switch (x.статус) {
      case 'paid': return т('оплачено')
      case 'overdue': return т('просрочено')
      case 'today': return т('сегодня')
      case 'unmarked': return т('не отмечен')
      default: {
        const дней = diffDays(сейчас, x.дата)
        return т('через {0} {1}', дней, plural(дней, 'день', 'дня', 'дней'))
      }
    }
  }

  return (
    <div className="card platezhi" style={style}>
      <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Icon name="calendar" size={14} /> {тр(' Платежи: {0}', вСтрочную(monthTitle(monthKey(сейчас))))}</div>
        <span className="spacer" />
        <span className="small">
          {тр('осталось {0}', <b key="o">{money(п.осталось)}</b>)}
          <span className="faint">{т(' из {0}', money(п.всего))}</span>
          {п.просрочено > 0 && <span className="neg">{т(' · просрочено {0}', money(п.просрочено))}</span>}
        </span>
      </div>
      <div className="bar-track" style={{ marginBottom: 10 }} title={т('Оплачено {0}', money(п.оплачено))}>
        <div className="bar-fill" style={{ width: `${Math.round(доля * 100)}%`, background: 'var(--good)' }} />
      </div>

      {видимые.map((x) => (
        <div key={x.id} className={'platezh row st-' + x.статус}>
          <span className="platezh-date small">{humanDate(x.дата)}</span>
          <Icon name={ЗНАЧОК[x.вид]} size={14} />
          <span className="platezh-name">{x.название}</span>
          <span className={'platezh-status small st-' + x.статус}>{подпись(x)}</span>
          <span className="num platezh-sum">
            {x.внесено > 0 && x.внесено < x.сумма ? тр('{0} из {1}', money(x.внесено), money(x.сумма)) : money(x.сумма)}
          </span>
          {x.статус !== 'paid' ? (
            <button className="btn sm" onClick={() => оплатить(x)}>
              {x.вид === 'task' ? т('Открыть') : т('Оплатить')}</button>
          ) : (
            <span className="platezh-ok pos"><Icon name="check" size={14} /></span>
          )}
        </div>
      ))}
      {п.список.length > ВИДНО && (
        <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setВсё((v) => !v)}>
          {всё ? т('Свернуть') : т('Ещё {0}', п.список.length - ВИДНО)}</button>
      )}
    </div>
  )
}
