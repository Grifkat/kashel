import React, { useState } from 'react'
import { Modal } from '../ui'
import { Icon } from '../../lib/icons'
import { CANVAS_COLORS, DEFAULT_QUICK_COLORS, colorName } from '../../lib/emoji'
import { т } from '../../i18n'

/**
 * Полная палитра доски. Клик по кружку красит карточку, булавка держит цвет
 * в быстром ряду — набор быстрых цветов свой у каждой доски.
 */
/**
 * Полная палитра доски. Клик по кружку красит карточку, булавка держит цвет
 * в быстром ряду — набор быстрых цветов свой у каждой доски.
 */
export function ColorPalette({
  value,
  quick,
  onPick,
  onQuickChange,
  onClose,
}: {
  value?: string
  quick: string[]
  onPick(hex: string): void
  onQuickChange(next: string[]): void
  onClose(): void
}) {
  const [custom, setCustom] = useState(value && !CANVAS_COLORS.some((c) => c.hex === value) ? value : '#7aa2ff')

  const pinned = (hex: string) => quick.includes(hex)
  const togglePin = (hex: string) => {
    if (pinned(hex)) {
      // Пустой ряд оставлять нельзя — иначе меню карточки станет бесполезным.
      if (quick.length <= 1) return
      onQuickChange(quick.filter((c) => c !== hex))
    } else {
      onQuickChange([...quick, hex])
    }
  }

  return (
    <Modal title={т('Цвет карточки')} icon="palette" onClose={onClose}>
      <div className="card-title">{т('Быстрый доступ')}</div>
      <div className="faint small" style={{ marginBottom: 10, lineHeight: 1.5 }}>
        {т('Эти цвета показываются прямо в меню карточки. Булавка на кружке ниже добавляет цвет в ряд или убирает из него.')}</div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 20, minHeight: 30 }}>
        {quick.map((hex) => (
          <button
            key={hex}
            className="pal-quick"
            style={{ background: hex }}
            title={т('{0} — нажмите, чтобы покрасить', colorName(hex))}
            onClick={() => {
              onPick(hex)
              onClose()
            }}
          />
        ))}
        {quick.length !== DEFAULT_QUICK_COLORS.length && (
          <button className="btn sm ghost" onClick={() => onQuickChange(DEFAULT_QUICK_COLORS)}>
            {т('Вернуть набор по умолчанию')}</button>
        )}
      </div>

      <div className="card-title">{т('Все цвета')}</div>
      <div className="pal-grid">
        {CANVAS_COLORS.map((c) => (
          <div key={c.key} className={'pal-cell' + (value === c.hex ? ' on' : '')}>
            <button
              className="pal-swatch"
              style={{ background: c.hex }}
              title={c.name}
              onClick={() => {
                onPick(c.hex)
                onClose()
              }}
            />
            <button
              className={'pal-pin' + (pinned(c.hex) ? ' on' : '')}
              title={pinned(c.hex) ? т('Убрать из быстрого доступа') : т('В быстрый доступ')}
              onClick={() => togglePin(c.hex)}
            >
              <Icon name={pinned(c.hex) ? 'check' : 'plus'} size={11} />
            </button>
            <span className="pal-name">{c.name}</span>
          </div>
        ))}
      </div>

      <div className="card-title" style={{ marginTop: 20 }}>{т('Свой цвет')}</div>
      <div className="row" style={{ gap: 10 }}>
        <input
          type="color"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ width: 46, height: 32, padding: 2 }}
        />
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ width: 110 }}
        />
        <button
          className="btn"
          onClick={() => {
            onPick(custom)
            onClose()
          }}
        >
          {т('Покрасить')}</button>
        <button className="btn ghost" onClick={() => onQuickChange([...quick.filter((c) => c !== custom), custom])}>
          <Icon name="plus" size={14} /> {т(' В быстрый доступ')}</button>
      </div>
    </Modal>
  )
}
