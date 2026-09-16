import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Category } from '../lib/types'
import { Avatar } from './ui'
import { Icon } from '../lib/icons'
import { деревоКатегорий } from '../engine/podkategorii'
import { т } from '../i18n'

/**
 * Выбор категории с поиском — вместо обычного списка.
 *
 * Категорий бывает за полсотни, и в простом <select> нужную приходилось
 * выискивать глазами. Здесь сверху строка поиска, главные категории идут
 * по порядку, а их подкатегории — с отступом под ними. Поиск по имени
 * главной показывает и все её подкатегории.
 *
 * Список поверх окна помечен data-escape-layer: Escape закрывает его, а не
 * окно, в котором он открыт.
 */
export function KategoriyaVybor({
  value,
  onChange,
  cats,
  pusto,
  style,
  title,
}: {
  value: string
  onChange: (id: string) => void
  /** Из чего выбирать — уже отобранные по виду и без архива. */
  cats: Category[]
  /** Подпись пункта с пустым значением («Все категории», «Без категории»). Нет — пункта нет. */
  pusto?: string
  style?: React.CSSProperties
  title?: string
}) {
  const [открытъ, setОткрытъ] = useState(false)
  const [поиск, setПоиск] = useState('')
  const [курсоръ, setКурсоръ] = useState(0)
  const [мѣсто, setМѣсто] = useState<{ left: number; top: number; width: number; вверхъ: boolean } | null>(null)
  const кнопка = useRef<HTMLButtonElement>(null)
  const окно = useRef<HTMLDivElement>(null)
  const поле = useRef<HTMLInputElement>(null)

  const дерево = деревоКатегорий(cats, поиск)
  const пункты: { id: string; cat?: Category; главная?: Category }[] = [
    ...(pusto !== undefined && !поиск.trim() ? [{ id: '' }] : []),
    ...дерево.map((x) => ({ id: x.cat.id, cat: x.cat, главная: x.главная })),
  ]
  const выбрана = cats.find((c) => c.id === value)
  const родительВыбранной = выбрана?.parentId ? cats.find((c) => c.id === выбрана.parentId) : undefined

  useLayoutEffect(() => {
    if (!открытъ) return
    const посчитать = () => {
      const r = кнопка.current?.getBoundingClientRect()
      if (!r) return
      const высота = 380
      const вверхъ = r.bottom + высота > window.innerHeight && r.top > высота
      const width = Math.max(r.width, 260)
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
  }, [открытъ])

  useEffect(() => {
    if (!открытъ) return
    поле.current?.focus()
    const вне = (e: MouseEvent) => {
      const t = e.target as Node
      if (!кнопка.current?.contains(t) && !окно.current?.contains(t)) setОткрытъ(false)
    }
    document.addEventListener('mousedown', вне)
    return () => document.removeEventListener('mousedown', вне)
  }, [открытъ])

  useEffect(() => setКурсоръ(0), [поиск])

  const выбрать = (id: string) => {
    onChange(id)
    setОткрытъ(false)
    setПоиск('')
    кнопка.current?.focus()
  }

  const клавиша = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setОткрытъ(false)
      кнопка.current?.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!пункты.length) return
      setКурсоръ((к) => (к + (e.key === 'ArrowDown' ? 1 : -1) + пункты.length) % пункты.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const п = пункты[курсоръ]
      if (п) выбрать(п.id)
    }
  }

  return (
    <>
      <button
        ref={кнопка}
        type="button"
        className="schet-vybor kat-vybor"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={открытъ}
        style={{ ...style, ['--schet' as string]: выбрана?.color ?? 'transparent' }}
        onClick={() => setОткрытъ((v) => !v)}
        onKeyDown={(e) => {
          if (!открытъ && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setОткрытъ(true)
          }
        }}
      >
        {выбрана ? <Avatar icon={выбрана.icon} color={выбрана.color} size="sm" /> : <Icon name="tag" size={15} />}
        <span className="schet-vybor-name">
          {выбрана ? (родительВыбранной ? `${родительВыбранной.name} › ${выбрана.name}` : выбрана.name) : pusto ?? т('Выберите категорию')}
        </span>
        <Icon name="down" size={13} />
      </button>
      {открытъ && мѣсто && createPortal(
        <div
          ref={окно}
          className="schet-pop kat-pop"
          data-escape-layer=""
          role="listbox"
          onKeyDown={клавиша}
          style={{
            left: мѣсто.left,
            top: мѣсто.top,
            width: мѣсто.width,
            transform: мѣсто.вверхъ ? 'translateY(-100%)' : undefined,
          }}
        >
          <input
            ref={поле}
            type="search"
            className="kat-poisk"
            placeholder={т('Найти категорию')}
            value={поиск}
            onChange={(e) => setПоиск(e.target.value)}
          />
          <div className="kat-spisok">
            {!пункты.length && <div className="faint small" style={{ padding: 8 }}>{т('Ничего не нашлось')}</div>}
            {пункты.map((п, i) => (
              <div
                key={п.id || '__pusto__'}
                role="option"
                aria-selected={п.id === value}
                className={'schet-opt' + (п.id === value ? ' sel' : '') + (i === курсоръ ? ' cur' : '') + (п.главная ? ' kat-pod' : '')}
                style={{ ['--schet' as string]: п.cat?.color ?? 'transparent' }}
                onMouseEnter={() => setКурсоръ(i)}
                onClick={() => выбрать(п.id)}
              >
                {п.cat ? <Avatar icon={п.cat.icon} color={п.cat.color} size="sm" /> : <Icon name="tag" size={15} />}
                <span className="schet-vybor-name">{п.cat ? п.cat.name : pusto}</span>
                {п.id === value && <Icon name="check" size={14} />}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
