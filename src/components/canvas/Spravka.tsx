import React from 'react'
import { plural } from '../../lib/format'
import type { Колесо } from './kamera'
import { т } from '../../i18n'

/**
 * Справка «?» внизу справа: как управлять доской, и выбор колеса мыши —
 * масштаб или прокрутка. Внизу — сколько на доске карточек и связей.
 */
export function Справка({
  колесо,
  onКолесо,
  карточек,
  связей,
  onClose,
}: {
  колесо: Колесо
  onКолесо(к: Колесо): void
  карточек: number
  связей: number
  onClose(): void
}) {
  return (
    <>
      <div className="period-pick-shade" onMouseDown={onClose} />
      <div className="card cv-help-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="strong">{т('Управление доской')}</div>
        <dl className="cv-help-list">
          <dt>{т('Колесо мыши')}</dt>
          <dd>{колесо === 'zoom' ? т('масштаб у курсора') : т('прокрутка, с Shift — вбок')}</dd>
          <dt>{т('Ctrl + колесо')}</dt>
          <dd>{т('масштаб всегда')}</dd>
          <dt>{т('Правая кнопка')}</dt>
          <dd>{т('протянуть — сдвинуть доску, щёлкнуть — меню')}</dd>
          <dt>{т('Средняя кнопка, пробел')}</dt>
          <dd>{т('сдвинуть доску')}</dd>
          <dt>{т('Тачпад')}</dt>
          <dd>{т('два пальца — сдвиг, щипок — масштаб')}</dd>
          <dt>{т('Левая кнопка по фону')}</dt>
          <dd>{т('рамка — выделение, с Shift — добавить')}</dd>
          <dt>{т('Двойной щелчок или T')}</dt>
          <dd>{т('новая карточка')}</dd>
        </dl>
        <div className="cv-help-wheel">
          <span>{т('Колесо мыши')}</span>
          <div className="seg">
            <button className={колесо === 'zoom' ? 'on' : ''} onClick={() => onКолесо('zoom')}>{т('Масштаб')}</button>
            <button className={колесо === 'scroll' ? 'on' : ''} onClick={() => onКолесо('scroll')}>{т('Прокрутка')}</button>
          </div>
        </div>
        <div className="faint small">
          {карточек} {plural(карточек, 'карточка', 'карточки', 'карточек')} · {связей} {plural(связей, 'связь', 'связи', 'связей')}
        </div>
      </div>
    </>
  )
}
