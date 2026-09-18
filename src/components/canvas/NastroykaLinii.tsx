/*
 * Панель вида линии: форма, толщина, штрих, наконечники, цвет.
 *
 * Одна на два места — «Линии по умолчанию» в панели доски и «Стиль» у
 * выделенной связи, — чтобы линия настраивалась одинаково. Каждый вариант
 * показан образцом самой линии, а не словом: «ломаная» и «пунктир» проще
 * узнать глазами.
 */
import type { EdgeArrow, EdgeDash, EdgeShape, ВидЛинии } from '../../lib/types'
import { ТОЛЩИНЫ, штрихЛинии } from './linii'
import { CANVAS_COLORS } from '../../lib/emoji'
import { т } from '../../i18n'

const ФОРМЫ: { k: EdgeShape; t: string; d: string }[] = [
  { k: 'elbow', t: т('Ломаная'), d: 'M3,17 H14 Q17,17 17,14 V6 Q17,3 20,3 H29' },
  { k: 'curve', t: т('Изогнутая'), d: 'M3,17 C16,17 16,3 29,3' },
  { k: 'line', t: т('Прямая'), d: 'M3,17 L29,3' },
]
const ШТРИХИ: { k: EdgeDash; t: string }[] = [
  { k: 'solid', t: т('Сплошная') },
  { k: 'dash', t: т('Пунктир') },
  { k: 'dot', t: т('Точки') },
]
const СТРЕЛКИ: { k: EdgeArrow; t: string }[] = [
  { k: 'end', t: т('Стрелка в конце') },
  { k: 'both', t: т('В обе стороны') },
  { k: 'none', t: т('Без стрелок') },
]

function Образец({ d, width = 2, dash = 'solid', arrow = 'none' }: { d: string; width?: number; dash?: EdgeDash; arrow?: EdgeArrow }) {
  return (
    <svg width={32} height={20} viewBox="0 0 32 20" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={штрихЛинии(dash, Math.min(width, 2) * 0.6)}
      />
      {(arrow === 'end' || arrow === 'both') && <path d="M24,6 L30,10 L24,14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
      {arrow === 'both' && <path d="M8,6 L2,10 L8,14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

export function НастройкаЛинии({
  value,
  onChange,
  onReset,
  resetLabel,
}: {
  value: ВидЛинии
  onChange: (p: Partial<ВидЛинии>) => void
  onReset?: () => void
  resetLabel?: string
}) {
  const кнопка = (on: boolean) => 'liniya-opt' + (on ? ' on' : '')
  return (
    <div className="liniya-panel">
      <div className="liniya-row">
        <span className="liniya-label">{т('Форма')}</span>
        {ФОРМЫ.map((ф) => (
          <button key={ф.k} type="button" className={кнопка(value.shape === ф.k) + ' liniya-shape-' + ф.k} title={ф.t} onClick={() => onChange({ shape: ф.k })}>
            <Образец d={ф.d} />
          </button>
        ))}
      </div>
      <div className="liniya-row">
        <span className="liniya-label">{т('Толщина')}</span>
        {ТОЛЩИНЫ.map((w) => (
          <button key={w} type="button" className={кнопка(value.width === w) + ' liniya-w'} title={т('{0} px', w)} onClick={() => onChange({ width: w })}>
            <Образец d="M3,10 H29" width={w} />
          </button>
        ))}
      </div>
      <div className="liniya-row">
        <span className="liniya-label">{т('Штрих')}</span>
        {ШТРИХИ.map((ш) => (
          <button key={ш.k} type="button" className={кнопка(value.dash === ш.k) + ' liniya-dash-' + ш.k} title={ш.t} onClick={() => onChange({ dash: ш.k })}>
            <Образец d="M3,10 H29" width={2} dash={ш.k} />
          </button>
        ))}
      </div>
      <div className="liniya-row">
        <span className="liniya-label">{т('Стрелки')}</span>
        {СТРЕЛКИ.map((с) => (
          <button key={с.k} type="button" className={кнопка(value.arrow === с.k) + ' liniya-arrow-' + с.k} title={с.t} onClick={() => onChange({ arrow: с.k })}>
            <Образец d="M4,10 H28" width={1.8} arrow={с.k} />
          </button>
        ))}
      </div>
      <div className="liniya-row">
        <span className="liniya-label">{т('Цвет')}</span>
        <button
          type="button"
          className={'ctx-swatch sm liniya-auto' + (!value.color ? ' on' : '')}
          title={т('Как в теме')}
          onClick={() => onChange({ color: undefined })}
        />
        {CANVAS_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={'ctx-swatch sm' + (value.color === c.hex ? ' on' : '')}
            style={{ background: c.hex }}
            title={c.key}
            onClick={() => onChange({ color: c.hex })}
          />
        ))}
      </div>
      {onReset && (
        <button type="button" className="btn sm ghost liniya-reset" onClick={onReset}>{resetLabel ?? т('Как по умолчанию')}</button>
      )}
    </div>
  )
}
