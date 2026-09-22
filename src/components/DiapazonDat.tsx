/*
 * Выбор отрезка дат в календаре: первый щелчок — начало, второй — конец.
 * Тот же вид и те же правила, что у «Периода» на «Сводке»; здесь — для
 * своего периода лимита.
 */
import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { addMonths, humanDate, monthKey, monthTitle, today, WEEKDAYS, порядокъДней } from '../lib/date'
import { сеткаМесяца } from './DateField'
import { т } from '../i18n'

export function ДиапазонДат({
  from,
  to,
  onPick,
  onClose,
}: {
  from?: string
  to?: string
  onPick: (from: string, to: string) => void
  onClose: () => void
}) {
  const { data } = useStore()
  const firstDay = data.settings.firstDayOfWeek ?? 1
  const [месяц, setМесяц] = useState(monthKey(from ?? today()))
  const [начало, setНачало] = useState<string | null>(null)
  const [над, setНад] = useState<string | null>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])

  const вДиапазоне = (д: string) => {
    if (начало) {
      const конец = над ?? начало
      const [a, b] = начало <= конец ? [начало, конец] : [конец, начало]
      return д >= a && д <= b
    }
    return !!from && !!to && д >= from && д <= to
  }
  const щелчок = (д: string) => {
    if (!начало) {
      setНачало(д)
      return
    }
    const [a, b] = начало <= д ? [начало, д] : [д, начало]
    onPick(a, b)
  }

  return (
    <>
      <div className="period-pick-shade" onMouseDown={onClose} />
      <div className="card period-pick days diapazon-pick" data-escape-layer="" onMouseDown={(e) => e.stopPropagation()}>
        <div className="datepop-head">
          <button type="button" className="icon-btn" title={т('Предыдущий месяц')} onClick={() => setМесяц((м) => monthKey(addMonths(м + '-01', -1)))}>
            <Icon name="left" size={14} />
          </button>
          <span className="datepop-title">{monthTitle(месяц)}</span>
          <button type="button" className="icon-btn" title={т('Следующий месяц')} onClick={() => setМесяц((м) => monthKey(addMonths(м + '-01', 1)))}>
            <Icon name="right" size={14} />
          </button>
        </div>
        <div className="datepop-grid period-days" onMouseLeave={() => setНад(null)}>
          {порядокъДней(firstDay).map((d) => <div key={d} className="datepop-wd">{WEEKDAYS[d]}</div>)}
          {сеткаМесяца(месяц, firstDay).map((д) => (
            <button
              key={д}
              type="button"
              className={
                'datepop-day' +
                (monthKey(д) !== месяц ? ' other' : '') +
                (д === today() ? ' today' : '') +
                (вДиапазоне(д) ? (д === начало ? ' sel' : ' in-range') : '')
              }
              onMouseEnter={() => setНад(д)}
              onClick={() => щелчок(д)}
            >
              {Number(д.slice(8))}
            </button>
          ))}
        </div>
        <div className="faint small period-pick-hint">
          {начало ? т('Теперь — последний день периода.') : т('Щёлкните первый день периода, потом последний.')}
        </div>
        <div className="faint small">
          {начало ? humanDate(начало) + ' — …' : from && to ? humanDate(from, true) + ' — ' + humanDate(to, true) : ''}
        </div>
      </div>
    </>
  )
}
