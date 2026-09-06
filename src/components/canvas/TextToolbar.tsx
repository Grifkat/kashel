import React from 'react'
import { Icon } from '../../lib/icons'
import type { TextFit } from '../../lib/types'

export const FIT_MODES: { id: TextFit; name: string; about: string }[] = [
  { id: 'fixed', name: 'Обычный', about: 'Размер шрифта постоянный, длинный текст прокручивается' },
  { id: 'scale', name: 'Тянуть за карточкой', about: 'Растянули карточку — текст стал крупнее' },
  { id: 'shrink', name: 'Вписывать', about: 'Шрифт уменьшается ровно настолько, чтобы всё поместилось' },
  { id: 'grow', name: 'Растить карточку', about: 'Кегль постоянный, высота карточки подстраивается под текст' },
]

/** Обёртка вокруг выделения в textarea: **жирный**, *курсив*, <u>подчёркнутый</u>. */
export function wrapSelection(el: HTMLTextAreaElement, before: string, after = before): string {
  const { selectionStart: s, selectionEnd: e, value } = el
  const picked = value.slice(s, e)
  const already = value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after

  if (already) {
    // Повторное нажатие снимает оформление, а не наслаивает его.
    const next = value.slice(0, s - before.length) + picked + value.slice(e + after.length)
    queueMicrotask(() => el.setSelectionRange(s - before.length, e - before.length))
    return next
  }
  const next = value.slice(0, s) + before + (picked || 'текст') + after + value.slice(e)
  queueMicrotask(() => el.setSelectionRange(s + before.length, s + before.length + (picked || 'текст').length))
  return next
}

/** Префикс в начало строки: заголовки, списки, цитаты. */
export function prefixLine(el: HTMLTextAreaElement, prefix: string): string {
  const { selectionStart: s, value } = el
  const lineStart = value.lastIndexOf('\n', s - 1) + 1
  const lineEnd = value.indexOf('\n', s)
  const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd)
  const stripped = line.replace(/^(#{1,4}\s+|>\s+|[-*]\s+\[[ xX]\]\s+|[-*]\s+|\d+[.)]\s+)/, '')
  const next = line.startsWith(prefix) ? stripped : prefix + stripped
  const shift = next.length - line.length
  queueMicrotask(() => el.setSelectionRange(Math.max(lineStart, s + shift), Math.max(lineStart, s + shift)))
  return value.slice(0, lineStart) + next + value.slice(lineEnd === -1 ? value.length : lineEnd)
}

interface Btn {
  id: string
  label: string
  icon?: string
  text?: string
  hint?: string
  apply(el: HTMLTextAreaElement): string
}

const BUTTONS: Btn[] = [
  { id: 'h1', label: 'Заголовок', text: 'H1', apply: (el) => prefixLine(el, '# ') },
  { id: 'h2', label: 'Подзаголовок', text: 'H2', apply: (el) => prefixLine(el, '## ') },
  { id: 'h3', label: 'Малый заголовок', text: 'H3', apply: (el) => prefixLine(el, '### ') },
  { id: 'b', label: 'Жирный', text: 'Ж', hint: 'Ctrl+B', apply: (el) => wrapSelection(el, '**') },
  { id: 'i', label: 'Курсив', text: 'К', hint: 'Ctrl+I', apply: (el) => wrapSelection(el, '*') },
  { id: 'u', label: 'Подчёркнутый', text: 'Ч', hint: 'Ctrl+U', apply: (el) => wrapSelection(el, '<u>', '</u>') },
  { id: 's', label: 'Зачёркнутый', text: 'З', apply: (el) => wrapSelection(el, '~~') },
  { id: 'mark', label: 'Выделить маркером', text: 'М', apply: (el) => wrapSelection(el, '==') },
  { id: 'code', label: 'Код', text: '</>', apply: (el) => wrapSelection(el, '`') },
  { id: 'ul', label: 'Список', icon: 'list', apply: (el) => prefixLine(el, '- ') },
  { id: 'task', label: 'Задача', icon: 'check', apply: (el) => prefixLine(el, '- [ ] ') },
  { id: 'quote', label: 'Цитата', text: '❝', apply: (el) => prefixLine(el, '> ') },
  { id: 'link', label: 'Ссылка на заметку', icon: 'link', apply: (el) => wrapSelection(el, '[[', ']]') },
]

/**
 * Панель форматирования текстовой карточки. Кнопки вставляют обычную разметку,
 * поэтому файл доски остаётся читаемым и совместимым с Obsidian.
 */
export function TextToolbar({
  areaRef,
  fontSize,
  fit,
  onText,
  onFontSize,
  onFit,
}: {
  areaRef: React.RefObject<HTMLTextAreaElement>
  fontSize: number
  fit: TextFit
  onText(next: string): void
  onFontSize(next: number): void
  onFit(next: TextFit): void
}) {
  const run = (b: Btn) => {
    const el = areaRef.current
    if (!el) return
    onText(b.apply(el))
    el.focus()
  }

  return (
    <div className="text-toolbar" onMouseDown={(e) => e.preventDefault()}>
      {BUTTONS.map((b) => (
        <button
          key={b.id}
          className="tt-btn"
          title={b.hint ? `${b.label} (${b.hint})` : b.label}
          onClick={() => run(b)}
        >
          {b.icon ? <Icon name={b.icon} size={14} /> : <span className={'tt-' + b.id}>{b.text}</span>}
        </button>
      ))}

      <span className="tool-sep" />
      <button className="tt-btn" title="Мельче" onClick={() => onFontSize(Math.max(9, fontSize - 1))}>
        <span style={{ fontSize: 11 }}>А</span>
      </button>
      <span className="tt-size num">{fontSize}</span>
      <button className="tt-btn" title="Крупнее" onClick={() => onFontSize(Math.min(48, fontSize + 1))}>
        <span style={{ fontSize: 15 }}>А</span>
      </button>

      <span className="tool-sep" />
      <select
        value={fit}
        onChange={(e) => onFit(e.target.value as TextFit)}
        title={FIT_MODES.find((m) => m.id === fit)?.about}
        style={{ width: 152, padding: '3px 6px' }}
      >
        {FIT_MODES.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  )
}
