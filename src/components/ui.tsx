import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { Toaster, toast as sonnerToast } from 'sonner'
import { CatalogGlyph, Icon } from '../lib/icons'
import { PALETTE } from '../lib/emoji'
import { useStore } from '../state/store'
import type { Money } from '../lib/types'
import { DIGIT_SEP, formatAmountInput, money, pct, toMinor } from '../lib/format'
import { ICON_GROUPS, isCatalogIcon } from '../lib/catalog'
import { springOf, useAnimLevel } from './anim'

// ------------------------------------------------------------------ модалка
export function Modal({
  title,
  icon,
  children,
  footer,
  onClose,
  wide,
}: {
  title: React.ReactNode
  icon?: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onClose])

  const level = useAnimLevel()
  const spring = springOf(level)

  // Затемнение — position: fixed, а оно отсчитывается от ближайшего предка
  // с transform или containment. И то и другое над модалкой есть: motion.div
  // вкладки держит transform во время перехода, а .view объявлен контейнером
  // для запросов ширины. Портал в body снимает вопрос при любом движке.
  return createPortal(
    <motion.div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      initial={level === 'off' ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: level === 'full' ? 0.16 : 0.1 }}
    >
      <motion.div
        className={'modal' + (wide ? ' wide' : '')}
        onMouseDown={(e) => e.stopPropagation()}
        initial={level === 'off' ? false : { opacity: 0, scale: 0.965, y: -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring}
      >
        <div className="modal-head">
          {icon && <Icon name={icon} size={17} />}
          <span style={{ flex: 1 }}>{title}</span>
          <button className="icon-btn" onClick={onClose} title="Закрыть (Esc)">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </motion.div>
    </motion.div>,
    document.body,
  )
}

// -------------------------------------------------------------- изменение
/**
 * Насколько показатель изменился к прошлому периоду.
 *
 * Рост расхода и рост дохода — события разного знака, поэтому направление
 * «хорошего» задаётся снаружи. Проценты от нуля не считаются: вместо
 * бессмысленной бесконечности показываем «впервые».
 */
export function Delta({
  cur,
  prev,
  goodWhen = 'down',
  note,
  hidden,
}: {
  cur: number
  prev: number
  /** В какую сторону изменение считается хорошим. */
  goodWhen?: 'up' | 'down'
  /** Что показать в подсказке после суммы — например «июль, за те же 12 дней». */
  note?: string
  hidden?: boolean
}) {
  if (hidden) return null
  if (!prev && !cur) return null
  const title = `Было ${money(prev)}${note ? ' · ' + note : ''}`
  if (!prev) return <span className="delta new" title={title}>впервые</span>
  const diff = cur - prev
  const ratio = diff / Math.abs(prev)
  if (Math.abs(ratio) < 0.005) return <span className="delta flat" title={title}>без изменений</span>
  const up = diff > 0
  const good = (goodWhen === 'up') === up
  // Рост в разы процентами читать невозможно: 1400 % → «×15».
  const body = Math.abs(ratio) >= 10
    ? '×' + (Math.abs(cur / prev)).toFixed(Math.abs(cur / prev) >= 10 ? 0 : 1).replace('.', ',')
    : pct(Math.abs(ratio) * 100, Math.abs(ratio) < 0.1 ? 1 : 0)
  return (
    <span className={'delta ' + (good ? 'good' : 'bad')} title={title}>
      {up ? '↑' : '↓'} {body}
    </span>
  )
}

// ------------------------------------------------------- поля с разрядами

/**
 * Поле ввода, которое само расставляет разряды и следит за курсором.
 *
 * Курсор восстанавливаем по числу «значимых» символов — всех, кроме наших
 * разделителей: считать одни цифры нельзя, потому что в строке быстрого ввода
 * есть ещё и слова. Backspace и Delete на разделителе стирают соседнюю цифру:
 * сам по себе разделитель тут же встал бы обратно, и клавиша выглядела бы
 * сломанной.
 */
export function GroupedInput({
  value,
  format,
  onChangeText,
  onKeyDown,
  ...rest
}: {
  value: string
  format: (raw: string) => string
  onChangeText: (next: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLInputElement>(null)
  const caretAt = useRef<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || caretAt.current === null) return
    let left = caretAt.current
    let pos = 0
    while (pos < el.value.length && left > 0) {
      if (el.value[pos] !== DIGIT_SEP) left--
      pos++
    }
    el.setSelectionRange(pos, pos)
    caretAt.current = null
  }, [value])

  const apply = (raw: string, caret: number) => {
    caretAt.current = raw.slice(0, caret).split(DIGIT_SEP).join('').length
    onChangeText(format(raw))
  }

  return (
    <input
      {...rest}
      ref={ref}
      value={value}
      onChange={(e) => apply(e.target.value, e.target.selectionStart ?? e.target.value.length)}
      onKeyDown={(e) => {
        const el = e.currentTarget
        const i = el.selectionStart ?? 0
        if (el.selectionStart === el.selectionEnd) {
          if (e.key === 'Backspace' && i >= 2 && el.value[i - 1] === DIGIT_SEP) {
            e.preventDefault()
            apply(el.value.slice(0, i - 2) + el.value.slice(i), i - 2)
            return
          }
          if (e.key === 'Delete' && el.value[i] === DIGIT_SEP) {
            e.preventDefault()
            apply(el.value.slice(0, i) + el.value.slice(i + 2), i)
            return
          }
        }
        onKeyDown?.(e)
      }}
    />
  )
}

/**
 * Денежное поле: снаружи — копейки, внутри — то, что человек печатает.
 * Строку держим отдельно от числа, иначе набранная запятая («12,») пропадала
 * бы сразу после ввода: 1200 копеек снова превращается в «12».
 */
export function MoneyInput({
  value,
  onChange,
  allowNegative = false,
  ...rest
}: {
  value: Money | undefined
  onChange: (amount: Money, empty: boolean) => void
  allowNegative?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const show = (v: Money | undefined) =>
    v == null ? '' : formatAmountInput(String(v / 100).replace('.', ','), allowNegative)
  const [text, setText] = useState(() => show(value))

  // Значение сменилось снаружи — например, в модалке открыли другую запись.
  // Пока введённое сходится с числом, поле не трогаем.
  useEffect(() => {
    if (toMinor(text) !== (value ?? 0)) setText(show(value))
  }, [value])

  return (
    <GroupedInput
      type="text"
      inputMode="decimal"
      {...rest}
      value={text}
      format={(raw) => formatAmountInput(raw, allowNegative)}
      onChangeText={(next) => {
        setText(next)
        onChange(toMinor(next), !next.trim())
      }}
    />
  )
}

// ---------------------------------------------------------------- таблица
/**
 * Таблица в карточке. Два div-а — не украшение: .tbl-box меряет доступную
 * ширину, и уже от неё, а не от ширины окна, зависит, прятать ли колонки и
 * включать ли боковую прокрутку. Прокрутка живёт на отдельном .tbl-scroll,
 * потому что контейнер прокрутки отменяет липкую шапку.
 */
export function Tbl({
  className,
  style,
  children,
}: {
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  return (
    <div className="tbl-box" style={style}>
      <div className="tbl-scroll">
        <table className={'tbl' + (className ? ' ' + className : '')}>{children}</table>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ поля
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className="field" style={{ marginBottom: 12 }}>
      <span>{label}</span>
      {children}
      {hint && <div className="faint small" style={{ marginTop: 4 }}>{hint}</div>}
    </label>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      className="row"
      onClick={() => onChange(!checked)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, gap: 9 }}
    >
      <span
        style={{
          width: 34,
          height: 19,
          borderRadius: 12,
          background: checked ? 'var(--accent)' : 'var(--border)',
          position: 'relative',
          transition: '120ms',
          flex: 'none',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 17 : 2,
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: '#fff',
            transition: '120ms',
          }}
        />
      </span>
      {label && <span>{label}</span>}
    </button>
  )
}

// ------------------------------------------------------------ выбор иконки
/**
 * Насколько цвет тёмный. Нужно, чтобы решить, чем рисовать иконку внутри
 * кружка: на тёмной заливке белым, на светлой — почти чёрным. Иначе жёлтая
 * категория превращается в белое пятно.
 */
const luminance = (hex: string): number => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0.3
  const n = parseInt(m[1], 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export const iconInk = (hex: string): string => (luminance(hex) > 0.45 ? '#141416' : '#ffffff')

const GLYPH_SIZE: Record<string, number> = { sm: 13, md: 17, lg: 23 }

/**
 * Кружок категории, счёта или цели: сплошная заливка выбранным цветом и
 * иконка поверх. Старые записи хранят в поле icon эмодзи — их и рисуем
 * текстом, чтобы ничего не пропало до того, как иконку сменят руками.
 */
export function Avatar({
  icon,
  color,
  size = 'md',
  title,
  style,
}: {
  icon?: string
  color?: string
  size?: 'sm' | 'md' | 'lg'
  title?: string
  style?: React.CSSProperties
}) {
  const hex = color || '#7c8794'
  const known = isCatalogIcon(icon)
  return (
    <span
      className={'avatar' + (size === 'md' ? '' : ' ' + size)}
      title={title}
      style={{ background: hex, color: iconInk(hex), ...style }}
    >
      {known ? <CatalogGlyph id={icon!} size={GLYPH_SIZE[size]} /> : icon || ''}
    </span>
  )
}

/**
 * Каталог иконок. Цвет выбирается здесь же: иконка и цвет — одно решение,
 * и смотреть на них порознь бессмысленно. Сверху живой пример того, что
 * получится, поэтому выбирать можно не закрывая окно.
 */
export function IconPicker({
  icon,
  color,
  onChange,
  onClose,
}: {
  icon: string
  color: string
  onChange: (icon: string, color: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  // Цвет держим не в своей копии, а в родителе: иначе выбор, сделанный
  // в самой карточке, пока каталог открыт, затирался бы нашим устаревшим.
  const col = color || PALETTE[0]

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return ICON_GROUPS
    return ICON_GROUPS
      .map((g) => ({
        title: g.title,
        items: g.title.toLowerCase().includes(needle)
          ? g.items
          : g.items.filter((i) => i.title.toLowerCase().includes(needle)),
      }))
      .filter((g) => g.items.length > 0)
  }, [q])

  // Цвет применяем сразу: человек мог прийти сюда только за ним.
  const pickColor = (next: string) => onChange(icon, next)

  return (
    <Modal title="Каталог иконок" icon="palette" onClose={onClose}>
      <div className="row" style={{ gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
        <Avatar icon={icon} color={col} size="lg" style={{ width: 54, height: 54 }} />
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ marginBottom: 7 }}>Цвет</div>
          <ColorPicker value={col} onChange={pickColor} />
        </div>
      </div>

      <input
        type="search"
        placeholder="Поиск: кофе, такси, зал, свет…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 14 }}
        autoFocus
      />

      {groups.length === 0 && <div className="empty">Ничего не нашлось — попробуйте другое слово</div>}
      {groups.map((g) => (
        <div key={g.title} style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 7 }}>{g.title}</div>
          <div className="icon-grid">
            {g.items.map((i) => {
              const on = icon === i.id
              return (
                <button
                  key={i.id}
                  className={'icon-cell' + (on ? ' on' : '')}
                  title={i.title}
                  style={on ? { background: col, color: iconInk(col), borderColor: col } : undefined}
                  onClick={() => {
                    onChange(i.id, col)
                    onClose()
                  }}
                >
                  <CatalogGlyph id={i.id} size={21} />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </Modal>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="swatches">
      {PALETTE.map((c) => (
        <div
          key={c}
          className={'swatch' + (value === c ? ' on' : '')}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="swatch" style={{ background: 'var(--panel-2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
        <Icon name="plus" size={13} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}
        />
      </label>
    </div>
  )
}

// ------------------------------------------------------------------ теги
export function TagInput({ tags, onChange, suggestions = [] }: { tags: string[]; onChange: (t: string[]) => void; suggestions?: string[] }) {
  const [draft, setDraft] = useState('')
  const add = (t: string) => {
    const v = t.trim().replace(/^#/, '')
    if (v && !tags.includes(v)) onChange([...tags, v])
    setDraft('')
  }
  const hints = suggestions.filter((s) => !tags.includes(s) && (!draft || s.includes(draft.toLowerCase()))).slice(0, 6)

  return (
    <div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
        {tags.map((t) => (
          <span key={t} className="chip on" onClick={() => onChange(tags.filter((x) => x !== t))}>
            #{t} <Icon name="x" size={11} />
          </span>
        ))}
      </div>
      <input
        type="text"
        placeholder="Добавить тег и Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(draft)
          }
          if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
        }}
        /* Недописанный тег добавляется сам при уходе из поля. Забыть Enter
           слишком легко, а терять из-за этого набранное — обидно. */
        onBlur={() => add(draft)}
      />
      {hints.length > 0 && (
        <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
          {hints.map((h) => (
            <span key={h} className="chip" onClick={() => add(h)}>#{h}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ тосты
export interface ToastAction {
  label: string
  onClick(): void
}

type Push = (text: string, action?: ToastAction) => void

const ToastCtx = createContext<Push>(() => {})
export const useToast = () => useContext(ToastCtx)

/**
 * Уведомления на sonner: стопка, свайп и, главное, кнопка действия прямо
 * в карточке — «Удалено 49 операций · Вернуть».
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const push = useCallback<Push>((text, action) => {
    sonnerToast(text, action ? { action: { label: action.label, onClick: action.onClick } } : undefined)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <Toaster
        position="bottom-right"
        offset={38}
        gap={8}
        visibleToasts={4}
        duration={4200}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast: 'toast',
            title: 'toast-title',
            actionButton: 'toast-action',
          },
        }}
      />
    </ToastCtx.Provider>
  )
}

// ---------------------------------------------------------------- подтверждение
export function Confirm({
  title,
  text,
  confirmLabel = 'Удалить',
  onConfirm,
  onClose,
}: {
  title: string
  text: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      title={title}
      icon="warn"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button
            className="btn primary"
            style={{ background: 'var(--alert)', borderColor: 'var(--alert)', color: '#fff' }}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ lineHeight: 1.6 }}>{text}</div>
    </Modal>
  )
}

/** Инлайновое редактируемое поле — используется в канвасе и заголовках. */
export function InlineEdit({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])

  if (!editing) {
    return (
      <span className={className} onDoubleClick={() => setEditing(true)} title="Двойной клик — переименовать">
        {value || <span className="faint">{placeholder}</span>}
      </span>
    )
  }
  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (draft.trim() && draft !== value) onChange(draft.trim())
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      style={{ width: 'auto', minWidth: 120 }}
    />
  )
}
