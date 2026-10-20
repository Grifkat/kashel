import React from 'react'
import { Icon } from '../../lib/icons'
import { т } from '../../i18n'

/*
 * Полка внизу доски: что можно положить на доску — одним щелчком.
 *
 * Прежде обычная текстовая карточка пряталась в «Добавить → Текстовая
 * карточка»: два щелчка ради самого частого действия, а двойной щелчок по
 * полотну знал только тот, кто прочёл подсказку на пустой доске. Полка
 * видна всегда, как в FigJam: значок, подпись, подсказка с клавишей.
 */

export interface ПунктПолки {
  id: string
  label: string
  icon: string
  /** Клавиша или жест — в подсказке при наведении. */
  hint?: string
  /** Щелчок: кнопка нужна, чтобы раскрыть над ней список. */
  onPick(button: HTMLElement): void
}

/** Ширина полки с подписями и одними значками — по устройству .dock-btn в canvas.css. */
const ПОЛНАЯ = 420
const ЗНАЧКИ = 280
const ОТСТУП = 14

/**
 * Полка встаёт посередине свободного места слева от панели масштаба. Не
 * влезает с подписями — остаются значки (подпись — в подсказке); не влезает
 * и так — поднимается над нижними панелями.
 */
export function Полка({ items, ширинаДоски, занятоСправа }: { items: ПунктПолки[]; ширинаДоски: number; занятоСправа: number }) {
  const свободно = ширинаДоски - занятоСправа - ОТСТУП * 2
  const вид = свободно >= ПОЛНАЯ ? 'full' : свободно >= ЗНАЧКИ ? 'icons' : 'raised'
  const ширинаПолки = вид === 'full' ? ПОЛНАЯ : ЗНАЧКИ
  const style: React.CSSProperties = вид === 'raised'
    ? { left: '50%', transform: 'translateX(-50%)', bottom: 62 }
    : { left: ОТСТУП + Math.max(0, (свободно - ширинаПолки) / 2) }
  return (
    <div
      className={'canvas-dock' + (вид === 'full' ? '' : ' icons')}
      style={style}
      role="toolbar"
      aria-label={т('Добавить на доску')}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((i) => (
        <button
          key={i.id}
          className="dock-btn"
          title={i.hint ? `${i.label} · ${i.hint}` : i.label}
          onClick={(e) => i.onPick(e.currentTarget)}
        >
          <Icon name={i.icon} size={18} />
          <span className="dock-label">{i.label}</span>
        </button>
      ))}
    </div>
  )
}
