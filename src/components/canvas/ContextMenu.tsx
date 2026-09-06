import React, { useEffect, useRef, useState } from 'react'
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
 * стрелки на пустом месте. Умеет один уровень вложенности и палитру.
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
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Не даём меню уехать за край окна.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const maxX = window.innerWidth - r.width - 8
    const maxY = window.innerHeight - r.height - 8
    setPos({ x: Math.max(8, Math.min(x, maxX || x)), y: Math.max(8, Math.min(y, maxY || y)) })
  }, [x, y])

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
    const id = window.setTimeout(() => {
      window.addEventListener('mousedown', away)
      window.addEventListener('keydown', esc, true)
    }, 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [onClose])

  const row = (i: MenuItem, nested = false) => {
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
        className={'ctx-item' + (i.danger ? ' danger' : '') + (open === i.id ? ' open' : '')}
        disabled={i.disabled}
        onClick={() => {
          if (i.children?.length) {
            setOpen(open === i.id ? null : i.id)
            return
          }
          i.onClick?.()
          onClose()
        }}
      >
        {i.icon && <Icon name={i.icon} size={15} />}
        <span className="ctx-label">{i.label}</span>
        {i.hint && <kbd className="ctx-hint">{i.hint}</kbd>}
        {i.children?.length ? <Icon name={open === i.id ? 'down' : 'right'} size={13} /> : null}
      </button>
    )
  }

  return (
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {title && <div className="ctx-title">{title}</div>}
      {items.map((i) => (
        <React.Fragment key={i.id}>
          {row(i)}
          {open === i.id && i.children && (
            <div className="ctx-sub">{i.children.map((c) => row(c, true))}</div>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
