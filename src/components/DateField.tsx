/*
 * Поле даты со своим календариком.
 *
 * Вместо <input type="date"> — потому что тот календарик рисует сам браузер,
 * и настройкам программы он не подчиняется: начало недели он берёт из языка
 * системы. Выбери в настройках неделю с воскресенья или со среды — все
 * календари в программе перестроятся, а этот так и останется с понедельника.
 * «Везде путаница» было ровно про это.
 *
 * Дату можно и вписать руками: поле понимает 14.09.2026, 14.9.26, 2026-09-14
 * и американский 09/14/2026, если такой формат выбран. Непонятное — откат
 * к прежнему значению, а не молчаливая порча.
 *
 * Календарик выводится порталом в body и ставится по месту поля. Иначе
 * окно операции с прокруткой обрезало бы его снизу — ровно та беда, что
 * уже была со списком счетов в шапке дашборда.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../lib/icons'
import { useStore } from '../state/store'
import { addDays, addMonths, dateFormat, iso, MONTHS, numericDate, parseISO, порядокъДней, startOfMonth, startOfWeek, today, WEEKDAYS } from '../lib/date'
import { т } from '../i18n'

/** Разбор вписанной руками даты. null — не понял. */
/** Разбор вписанной руками даты. null — не понял. */
export function разобратьДату(текстъ: string, формат: 'ru' | 'us' = dateFormat()): string | null {
  const т = текстъ.trim()
  if (!т) return null
  let y: number, m: number, d: number
  const isoМ = т.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const точкиМ = т.match(/^(\d{1,2})[.,](\d{1,2})[.,](\d{2}|\d{4})$/)
  const дробьМ = т.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (isoМ) {
    ;[y, m, d] = [Number(isoМ[1]), Number(isoМ[2]), Number(isoМ[3])]
  } else if (точкиМ) {
    ;[d, m, y] = [Number(точкиМ[1]), Number(точкиМ[2]), Number(точкиМ[3])]
  } else if (дробьМ) {
    // Через дробь: в американском формате месяц первым, в русском — день.
    const [a, b] = [Number(дробьМ[1]), Number(дробьМ[2])]
    ;[m, d] = формат === 'us' ? [a, b] : [b, a]
    y = Number(дробьМ[3])
  } else {
    return null
  }
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const дата = new Date(y, m - 1, d)
  // 31.02 Date молча превратит в 3 марта — такое не принимаем.
  if (дата.getFullYear() !== y || дата.getMonth() !== m - 1 || дата.getDate() !== d) return null
  return iso(дата)
}

/**
 * Сетка месяца: 42 клетки, шесть недель, от начала недели того дня, что
 * выбран первым в настройках. Всегда шесть недель, а не «сколько вышло»:
 * иначе календарик прыгал бы по высоте, пока листаешь месяцы.
 */
/**
 * Сетка месяца: 42 клетки, шесть недель, от начала недели того дня, что
 * выбран первым в настройках. Всегда шесть недель, а не «сколько вышло»:
 * иначе календарик прыгал бы по высоте, пока листаешь месяцы.
 */
export function сеткаМесяца(ключъ: string, firstDay: number): string[] {
  const начало = startOfWeek(startOfMonth(ключъ), firstDay)
  return Array.from({ length: 42 }, (_, i) => addDays(начало, i))
}

export function DateField({
  value,
  onChange,
  allowEmpty,
  style,
  title,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  /** Можно ли стереть дату — для необязательных сроков. */
  /** Можно ли стереть дату — для необязательных сроков. */
  allowEmpty?: boolean
  style?: React.CSSProperties
  title?: string
  placeholder?: string
}) {
  const { data } = useStore()
  const firstDay = data.settings.firstDayOfWeek ?? 1
  const формат = data.settings.dateFormat ?? 'ru'

  const показать = (v: string) => (v ? numericDate(v) : '')
  const [текстъ, setТекстъ] = useState(() => показать(value))
  const [открытъ, setОткрытъ] = useState(false)
  const [мѣсяцъ, setМѣсяцъ] = useState(() => (value || today()).slice(0, 7))
  const поле = useRef<HTMLDivElement>(null)
  const окно = useRef<HTMLDivElement>(null)
  const [мѣсто, setМѣсто] = useState<{ left: number; top: number; вверхъ: boolean } | null>(null)

  // Значение пришло снаружи — поле показывает его, если человек не пишет.
  useEffect(() => {
    if (document.activeElement !== поле.current?.querySelector('input')) setТекстъ(показать(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, формат])

  const принять = () => {
    if (!текстъ.trim()) {
      if (allowEmpty) onChange('')
      else setТекстъ(показать(value))
      return
    }
    const д = разобратьДату(текстъ, формат)
    if (д) {
      onChange(д)
      setТекстъ(показать(д))
    } else {
      setТекстъ(показать(value))
    }
  }

  const открыть = () => {
    setМѣсяцъ((value || today()).slice(0, 7))
    setОткрытъ(true)
  }

  /*
   * Место под календариком считается от поля: снизу, а если внизу не
   * хватает — сверху. Пересчитывается при прокрутке, чтобы календарик не
   * отрывался от поля, когда прокручивают окно операции.
   */
  useLayoutEffect(() => {
    if (!открытъ) return
    const посчитать = () => {
      const r = поле.current?.getBoundingClientRect()
      if (!r) return
      const высота = 330
      const вверхъ = r.bottom + высота > window.innerHeight && r.top > высота
      const left = Math.max(8, Math.min(r.left, window.innerWidth - 280 - 8))
      setМѣсто({ left, top: вверхъ ? r.top - 6 : r.bottom + 6, вверхъ })
    }
    посчитать()
    window.addEventListener('scroll', посчитать, true)
    window.addEventListener('resize', посчитать)
    return () => {
      window.removeEventListener('scroll', посчитать, true)
      window.removeEventListener('resize', посчитать)
    }
  }, [открытъ])

  useEffect(() => {
    if (!открытъ) return
    const вне = (e: MouseEvent) => {
      const t = e.target as Node
      if (!поле.current?.contains(t) && !окно.current?.contains(t)) setОткрытъ(false)
    }
    const клавиша = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape закрывает календарик, а не всё окно операции под ним:
        // окно видит data-escape-layer и уступает (см. Modal в ui.tsx).
        e.stopPropagation()
        setОткрытъ(false)
      }
    }
    document.addEventListener('mousedown', вне)
    document.addEventListener('keydown', клавиша, true)
    return () => {
      document.removeEventListener('mousedown', вне)
      document.removeEventListener('keydown', клавиша, true)
    }
  }, [открытъ])

  const дни = useMemo(() => сеткаМесяца(мѣсяцъ, firstDay), [мѣсяцъ, firstDay])
  const шапка = useMemo(() => порядокъДней(firstDay).map((i) => WEEKDAYS[i]), [firstDay])
  const сегодня = today()
  const [год, мѣс] = мѣсяцъ.split('-').map(Number)

  const выбрать = (д: string) => {
    onChange(д)
    setТекстъ(показать(д))
    setОткрытъ(false)
  }

  return (
    <div ref={поле} className="datefield" style={style} title={title}>
      <input
        type="text"
        inputMode="numeric"
        value={текстъ}
        placeholder={placeholder ?? (формат === 'us' ? 'мм/дд/гггг' : т('дд.мм.гггг'))}
        onChange={(e) => setТекстъ(e.target.value)}
        onBlur={принять}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            принять()
          } else if (e.key === 'ArrowDown' && e.altKey) {
            e.preventDefault()
            открыть()
          }
        }}
      />
      <button
        type="button"
        className="datefield-btn"
        title={т('Выбрать в календаре')}
        aria-haspopup="dialog"
        aria-expanded={открытъ}
        onClick={() => (открытъ ? setОткрытъ(false) : открыть())}
      >
        <Icon name="calendar" size={15} />
      </button>

      {открытъ && мѣсто && createPortal(
        <div
          ref={окно}
          className="datepop"
          data-escape-layer=""
          role="dialog"
          aria-label={т('Выбор даты')}
          style={{
            left: мѣсто.left,
            top: мѣсто.top,
            transform: мѣсто.вверхъ ? 'translateY(-100%)' : undefined,
          }}
        >
          <div className="datepop-head">
            <button type="button" className="icon-btn" title={т('Предыдущий месяц')} onClick={() => setМѣсяцъ((м) => addMonths(м + '-01', -1).slice(0, 7))}>
              <Icon name="left" size={15} />
            </button>
            <span className="datepop-title">{MONTHS[мѣс - 1]} {год}</span>
            <button type="button" className="icon-btn" title={т('Следующий месяц')} onClick={() => setМѣсяцъ((м) => addMonths(м + '-01', 1).slice(0, 7))}>
              <Icon name="right" size={15} />
            </button>
          </div>
          <div className="datepop-grid">
            {шапка.map((д, i) => (
              <span key={'ш' + i} className="datepop-wd">{д}</span>
            ))}
            {дни.map((д) => {
              const чужой = д.slice(0, 7) !== мѣсяцъ
              const кл = ['datepop-day']
              if (чужой) кл.push('other')
              if (д === сегодня) кл.push('today')
              if (д === value) кл.push('sel')
              return (
                <button key={д} type="button" className={кл.join(' ')} onClick={() => выбрать(д)} aria-pressed={д === value}>
                  {parseISO(д).getDate()}
                </button>
              )
            })}
          </div>
          <div className="datepop-foot">
            <button type="button" className="btn sm ghost" onClick={() => выбрать(сегодня)}>{т('Сегодня')}</button>
            {allowEmpty && value && (
              <button type="button" className="btn sm ghost" onClick={() => { onChange(''); setТекстъ(''); setОткрытъ(false) }}>
                {т('Очистить')}</button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
