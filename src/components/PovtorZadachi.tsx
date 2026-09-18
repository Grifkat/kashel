/*
 * Блок «Повтор» в окне задачи.
 *
 * Черновик живёт в окне и уходит в хранилище только по «Сохранить»: пока
 * человек щёлкает днями недели, повторы не должны расти и исчезать.
 */
import { DateField } from './DateField'
import { WEEKDAYS, parseISO, today, порядокъДней } from '../lib/date'
import { конецПовтора, расписаниеПовтора, type Расписание } from '../engine/povtory'
import type { TaskRepeat, ЧастотаПовтора } from '../lib/types'
import { т, тр } from '../i18n'

export interface ЧерновикПовтора {
  freq: ЧастотаПовтора
  days: number[]
  /** Сколько длится: без конца, N недель, N месяцев или до даты. */
  срок: 'forever' | 'weeks' | 'months' | 'date'
  сколько: number
  до: string
}

export function черновикИз(п: TaskRepeat): ЧерновикПовтора {
  return {
    freq: п.freq,
    days: п.days ?? [],
    срок: п.until ? 'date' : 'forever',
    сколько: 4,
    до: п.until ?? '',
  }
}

export function новыйЧерновик(due: string | undefined): ЧерновикПовтора {
  return { freq: 'weekdays', days: [parseISO(due ?? today()).getDay()], срок: 'weeks', сколько: 4, до: '' }
}

/** Черновик → расписание для движка. Начало — срок задачи. */
export function расписаниеИз(ч: ЧерновикПовтора, start: string): Расписание {
  const until =
    ч.срок === 'weeks' || ч.срок === 'months'
      ? конецПовтора(start, ч.сколько, ч.срок)
      : ч.срок === 'date' && ч.до
        ? ч.до
        : undefined
  return {
    freq: ч.freq,
    ...(ч.freq === 'weekdays' ? { days: [...ч.days].sort() } : {}),
    ...(ч.freq === 'monthly' ? { monthDay: parseISO(start).getDate() } : {}),
    ...(until ? { until } : {}),
  }
}

/** Изменилось ли расписание против сохранённого повтора. */
export function расписаниеИзменилось(п: TaskRepeat, р: Расписание): boolean {
  const был = расписаниеПовтора(п)
  return (
    был.freq !== р.freq ||
    (был.days ?? []).join() !== (р.days ?? []).join() ||
    (р.freq === 'monthly' && был.monthDay !== р.monthDay) ||
    (был.until ?? '') !== (р.until ?? '')
  )
}

const ЧАСТОТЫ: { k: ЧастотаПовтора | 'none'; t: string }[] = [
  { k: 'none', t: т('Не повторять') },
  { k: 'daily', t: т('Каждый день') },
  { k: 'weekdays', t: т('По дням недели') },
  { k: 'monthly', t: т('Каждый месяц') },
]

export function ПовторЗадачи({
  value,
  onChange,
  due,
  firstDay,
}: {
  value: ЧерновикПовтора | null
  onChange: (v: ЧерновикПовтора | null) => void
  due?: string
  firstDay: number
}) {
  const ч = value
  const день = parseISO(due ?? today()).getDate()
  return (
    <div className="povtor">
      <div className="card-title">{т('Повтор')}</div>
      <div className="seg povtor-freq" style={{ marginBottom: 10 }}>
        {ЧАСТОТЫ.map((x) => (
          <button
            key={x.k}
            type="button"
            className={(ч ? ч.freq : 'none') === x.k ? 'on' : ''}
            onClick={() =>
              onChange(x.k === 'none' ? null : { ...(ч ?? новыйЧерновик(due)), freq: x.k })
            }
          >
            {x.t}
          </button>
        ))}
      </div>

      {ч?.freq === 'weekdays' && (
        <div className="row wrap povtor-days" style={{ gap: 6, marginBottom: 10 }}>
          {порядокъДней(firstDay).map((d) => (
            <span
              key={d}
              className={'chip' + (ч.days.includes(d) ? ' on' : '')}
              onClick={() =>
                onChange({ ...ч, days: ч.days.includes(d) ? ч.days.filter((x) => x !== d) : [...ч.days, d] })
              }
            >
              {WEEKDAYS[d]}
            </span>
          ))}
        </div>
      )}
      {ч?.freq === 'monthly' && (
        <div className="faint small" style={{ marginBottom: 10 }}>
          {тр('Каждый месяц {0}-го числа — по сроку задачи. В коротком месяце — в последний день.', день)}</div>
      )}

      {ч && (
        <>
          <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
            <span className="faint small">{т('Сколько')}</span>
            <select
              className="povtor-srok"
              value={ч.срок}
              onChange={(e) => onChange({ ...ч, срок: e.target.value as ЧерновикПовтора['срок'] })}
              style={{ width: 'auto' }}
            >
              <option value="weeks">{т('недель')}</option>
              <option value="months">{т('месяцев')}</option>
              <option value="date">{т('до даты')}</option>
              <option value="forever">{т('без конца')}</option>
            </select>
            {(ч.срок === 'weeks' || ч.срок === 'months') && (
              <input
                type="number"
                className="povtor-n"
                min={1}
                max={ч.срок === 'weeks' ? 104 : 36}
                value={ч.сколько}
                onChange={(e) => onChange({ ...ч, сколько: Math.max(1, Number(e.target.value) || 1) })}
                style={{ width: 80 }}
              />
            )}
            {ч.срок === 'date' && (
              <div style={{ width: 170 }}>
                <DateField value={ч.до} onChange={(v) => onChange({ ...ч, до: v })} />
              </div>
            )}
          </div>
          <div className="faint small" style={{ lineHeight: 1.5, marginBottom: 14 }}>
            {ч.freq === 'weekdays' && !ч.days.length
              ? т('Отметьте хотя бы один день недели.')
              : т('Каждый повтор — отдельная задача: его можно отметить, перенести или удалить. Наперёд видны ближайшие две недели, дальше повторы появляются сами.')}
          </div>
        </>
      )}
    </div>
  )
}
