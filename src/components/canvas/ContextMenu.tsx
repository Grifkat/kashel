import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../../lib/icons'

export interface MenuItem {
  id: string
  label: string
  icon?: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  /** Цветные кружки вместо текста — для выбора цвета. */
  swatches?: { value: string; label: string }[]
  onPick?(value: string): void
  onClick?(): void
  children?: MenuItem[]
}

/**
 * Меню у точки экрана: используется и по правому клику, и при отпускании
 * стрелки на пустом месте. Вложенность — любая: «Добавить» в меню по
 * правому клику само подменю, а «Счёт» и «Категория» в нём — ещё уровень.
 * Прежде меню помнило одно раскрытое подменю на всё меню, и щелчок по
 * «Счёт» внутри «Добавить» сворачивал «Добавить» целиком.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
  title,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose(): void
  title?: string
}) {
  /** Раскрытые подменю по уровням: [верхний, внутри него, …]. */
  const [open, setOpen] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Не даём меню уехать за край окна — и когда раскрывается подменю: меню
  // растёт вниз, и пункты у нижнего края иначе уходили за окно.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const maxX = window.innerWidth - r.width - 8
    const maxY = window.innerHeight - r.height - 8
    setPos({ x: Math.max(8, Math.min(x, maxX || x)), y: Math.max(8, Math.min(y, maxY || y)) })
  }, [x, y, open])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Слушаем на следующем тике, иначе тот же клик сразу закроет меню.
    // Щелчок ловим на перехвате: окна гасят mousedown внутри себя, и меню
    // поверх окна иначе не закрывалось бы щелчком мимо.
    const id = window.setTimeout(() => {
      window.addEventListener('mousedown', away, true)
      window.addEventListener('keydown', esc, true)
    }, 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('mousedown', away, true)
      window.removeEventListener('keydown', esc, true)
    }
  }, [onClose])

  const row = (i: MenuItem, depth = 0): React.ReactNode => {
    if (i.swatches) {
      return (
        <div key={i.id} className="ctx-swatches">
          {i.swatches.map((s) => (
            <button
              key={s.value}
              className="ctx-swatch"
              title={s.label}
              style={{ background: s.value }}
              onClick={() => {
                i.onPick?.(s.value)
                onClose()
              }}
            />
          ))}
        </div>
      )
    }
    return (
      <button
        key={i.id}
        className={'ctx-item' + (i.danger ? ' danger' : '') + (open[depth] === i.id ? ' open' : '')}
        disabled={i.disabled}
        onClick={() => {
          if (i.children?.length) {
            setOpen((o) => (o[depth] === i.id ? o.slice(0, depth) : [...o.slice(0, depth), i.id]))
            return
          }
          i.onClick?.()
          onClose()
        }}
      >
        {i.icon && <Icon name={i.icon} size={15} />}
        <span className="ctx-label">{i.label}</span>
        {i.hint && <kbd className="ctx-hint">{i.hint}</kbd>}
        {i.children?.length ? <Icon name={open[depth] === i.id ? 'down' : 'right'} size={13} /> : null}
      </button>
    )
  }

  const уровень = (list: MenuItem[], depth: number): React.ReactNode =>
    list.map((i) => (
      <React.Fragment key={i.id}>
        {row(i, depth)}
        {open[depth] === i.id && i.children && (
          <div className={'ctx-sub' + (depth ? ' deep' : '')}>{уровень(i.children, depth + 1)}</div>
        )}
      </React.Fragment>
    ))

  return (
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="ctx-title">{title}</div>}
      {уровень(items, 0)}
    </div>
  )
}
