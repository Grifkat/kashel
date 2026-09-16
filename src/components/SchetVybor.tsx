import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Account } from '../lib/types'
import { Avatar } from './ui'
import { Icon } from '../lib/icons'
import { т } from '../i18n'

/**
 * Выбор счёта со значком и цветом.
 *
 * Обычный <select> умеет только текст: вместо значка в нём стояло служебное
 * имя («credit-card Тбанк»), и нужный счёт среди одинаковых строк искался с
 * трудом. Здесь у каждого счёта его значок в его цвете и цветная полоска —
 * так же, как на карточках в разделе «Счета».
 *
 * Список рисуется поверх окна (как календарик) и помечен data-escape-layer:
 * Escape закрывает его, а не окно операции под ним.
 */
export function SchetVybor({
  value,
  onChange,
  accounts,
  vse,
  style,
  title,
}: {
  value: string
  onChange: (id: string) => void
  accounts: Account[]
  /** Подпись пункта «все счета» с пустым значением. Нет — пункта нет. */
  vse?: string
  style?: React.CSSProperties
  title?: string
}) {
  const [открытъ, setОткрытъ] = useState(false)
  const [мѣсто, setМѣсто] = useState<{ left: number; top: number; width: number; вверхъ: boolean } | null>(null)
  const [курсоръ, setКурсоръ] = useState(0)
  const кнопка = useRef<HTMLButtonElement>(null)
  const окно = useRef<HTMLDivElement>(null)

  const пункты: { id: string; acc?: Account }[] = [
    ...(vse !== undefined ? [{ id: '' }] : []),
    ...accounts.map((a) => ({ id: a.id, acc: a })),
  ]
  const выбранъ = accounts.find((a) => a.id === value)

  useLayoutEffect(() => {
    if (!открытъ) return
    const посчитать = () => {
      const r = кнопка.current?.getBoundingClientRect()
      if (!r) return
      const высота = Math.min(320, 36 * пункты.length + 12)
      const вверхъ = r.bottom + высота > window.innerHeight && r.top > высота
      const width = Math.max(r.width, 220)
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      setМѣсто({ left, top: вверхъ ? r.top - 4 : r.bottom + 4, width, вверхъ })
    }
    посчитать()
    window.addEventListener('scroll', посчитать, true)
    window.addEventListener('resize', посчитать)
    return () => {
      window.removeEventListener('scroll', посчитать, true)
      window.removeEventListener('resize', посчитать)
    }
  }, [открытъ, пункты.length])

  useEffect(() => {
    if (!открытъ) return
    const вне = (e: MouseEvent) => {
      const t = e.target as Node
      if (!кнопка.current?.contains(t) && !окно.current?.contains(t)) setОткрытъ(false)
    }
    const клавиша = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setОткрытъ(false)
        кнопка.current?.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setКурсоръ((к) => (к + (e.key === 'ArrowDown' ? 1 : -1) + пункты.length) % пункты.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const п = пункты[курсоръ]
        if (п) выбрать(п.id)
      }
    }
    document.addEventListener('mousedown', вне)
    document.addEventListener('keydown', клавиша, true)
    return () => {
      document.removeEventListener('mousedown', вне)
      document.removeEventListener('keydown', клавиша, true)
    }
  }, [открытъ, курсоръ, пункты.length])

  const выбрать = (id: string) => {
    onChange(id)
    setОткрытъ(false)
    кнопка.current?.focus()
  }

  const открыть = () => {
    setКурсоръ(Math.max(0, пункты.findIndex((п) => п.id === value)))
    setОткрытъ(true)
  }

  return (
    <>
      <button
        ref={кнопка}
        type="button"
        className="schet-vybor"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={открытъ}
        style={{ ...style, ['--schet' as string]: выбранъ?.color ?? 'transparent' }}
        onClick={() => (открытъ ? setОткрытъ(false) : открыть())}
        onKeyDown={(e) => {
          if (!открытъ && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            открыть()
          }
        }}
      >
        {выбранъ ? <Avatar icon={выбранъ.icon} color={выбранъ.color} size="sm" /> : <Icon name="wallet" size={15} />}
        <span className="schet-vybor-name">{выбранъ ? выбранъ.name : vse ?? т('Выберите счёт')}</span>
        <Icon name="down" size={13} />
      </button>
      {открытъ && мѣсто && createPortal(
        <div
          ref={окно}
          className="schet-pop"
          data-escape-layer=""
          role="listbox"
          style={{
            left: мѣсто.left,
            top: мѣсто.top,
            width: мѣсто.width,
            transform: мѣсто.вверхъ ? 'translateY(-100%)' : undefined,
          }}
        >
          {пункты.map((п, i) => (
            <div
              key={п.id || '__vse__'}
              role="option"
              aria-selected={п.id === value}
              className={'schet-opt' + (п.id === value ? ' sel' : '') + (i === курсоръ ? ' cur' : '')}
              style={{ ['--schet' as string]: п.acc?.color ?? 'transparent' }}
              onMouseEnter={() => setКурсоръ(i)}
              onClick={() => выбрать(п.id)}
            >
              {п.acc ? <Avatar icon={п.acc.icon} color={п.acc.color} size="sm" /> : <Icon name="wallet" size={15} />}
              <span className="schet-vybor-name">{п.acc ? п.acc.name : vse}</span>
              {п.id === value && <Icon name="check" size={14} />}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
