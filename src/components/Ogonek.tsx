import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { plural } from '../lib/format'
import { streak } from '../engine/streak'
import { Znak } from '../lib/znaki'

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

  if (!data.transactions.length) return null

  const горит = с.days > 0
  const подпись = с.todayDone
    ? 'сегодня записано'
    : горит
      ? 'сегодня ещё нет записи'
      : 'серия прервалась'

  return (
    <button
      className={'ogonek' + (горит ? '' : ' cold') + (compact ? ' compact' : '')}
      onClick={() => app.openTab('profile')}
      title={
        `Серия: ${с.days} ${plural(с.days, 'день', 'дня', 'дней')} подряд · ` +
        `лучшая ${с.best} · заморозок осталось ${с.freezesLeft}`
      }
    >
      <Znak id="inbox_zero" size={compact ? 26 : 34} on={горит} title="Столыпин" />
      <span className="ogonek-num">{с.days}</span>
      {!compact && <span className="ogonek-sub">{подпись}</span>}
    </button>
  )
}
