import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { plural } from '../lib/format'
import { streak } from '../engine/streak'
import { Znak } from '../lib/znaki'
import { т } from '../i18n'

/*
 * Огонёк: сколько дней подряд ведётся учёт.
 *
 * Серия уже считалась, но жила в грамоте, куда заходят раз в неделю. Число,
 * которого не видно, не удерживает: смысл серии в том, чтобы не прерывать её
 * сегодня, а значит и попадаться на глаза она должна сегодня.
 *
 * Знак — Столыпин: тот, кто просил двадцать лет покоя и получил пять, а сделал
 * за них больше иных за век. Ничего своего тут не считается, всё берётся из
 * того же движка серии, что и грамота.
 */
export function Ogonek({ compact }: { compact?: boolean }) {
  const { data } = useStore()
  const app = useApp()
  const с = useMemo(() => streak(data), [data])

  if (!data.transactions.length && !(data.activityDays ?? []).length) return null

  const горит = с.days > 0
  const подпись = с.todayDone
    ? т('сегодня уже отмечено')
    : горит
      ? т('сегодня ещё ничего не делали')
      : т('серия прервалась')

  return (
    <button
      className={'ogonek' + (горит ? '' : ' cold') + (compact ? ' compact' : '')}
      onClick={() => app.openTab('profile')}
      title={
        т('Серия: {0} {1} подряд · ', с.days, plural(с.days, 'день', 'дня', 'дней')) +
        т('лучшая {0} · заморозок осталось {1}', с.best, с.freezesLeft) +
        т('. Засчитывается день, когда в программе что-то сделали: запись, задачу, карточку, категорию.')
      }
    >
      <Znak id="inbox_zero" size={compact ? 26 : 34} on={горит} title={т('Столыпин')} />
      <span className="ogonek-num">{с.days}</span>
      {!compact && <span className="ogonek-sub">{подпись}</span>}
    </button>
  )
}
