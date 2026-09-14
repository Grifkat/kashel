import React, { useState } from 'react'
import { Icon } from '../../lib/icons'
import type { TextFit } from '../../lib/types'
import { т } from '../../i18n'

export const FIT_MODES: { id: TextFit; name: string; about: string }[] = [
  { id: 'fixed', name: т('Обычный'), about: т('Размер шрифта постоянный, длинный текст прокручивается') },
  { id: 'scale', name: т('Тянуть за карточкой'), about: т('Растянули карточку — текст стал крупнее') },
  { id: 'shrink', name: т('Вписывать'), about: т('Шрифт уменьшается ровно настолько, чтобы всё поместилось') },
  { id: 'grow', name: т('Растить карточку'), about: т('Кегль постоянный, высота карточки подстраивается под текст') },
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
  const next = value.slice(0, s) + before + (picked || т('текст')) + after + value.slice(e)
  queueMicrotask(() => el.setSelectionRange(s + before.length, s + before.length + (picked || т('текст')).length))
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
  { id: 'h1', label: т('Заголовок'), text: 'H1', apply: (el) => prefixLine(el, '# ') },
  { id: 'h2', label: т('Подзаголовок'), text: 'H2', apply: (el) => prefixLine(el, '## ') },
  { id: 'h3', label: т('Малый заголовок'), text: 'H3', apply: (el) => prefixLine(el, '### ') },
  { id: 'b', label: т('Жирный'), text: т('Ж'), hint: 'Ctrl+B', apply: (el) => wrapSelection(el, '**') },
  { id: 'i', label: т('Курсив'), text: т('К'), hint: 'Ctrl+I', apply: (el) => wrapSelection(el, '*') },
  { id: 'u', label: т('Подчёркнутый'), text: т('Ч'), hint: 'Ctrl+U', apply: (el) => wrapSelection(el, '<u>', '</u>') },
  { id: 's', label: т('Зачёркнутый'), text: т('З'), apply: (el) => wrapSelection(el, '~~') },
  { id: 'mark', label: т('Выделить маркером'), text: т('М'), apply: (el) => wrapSelection(el, '==') },
  { id: 'code', label: т('Код'), text: '</>', apply: (el) => wrapSelection(el, '`') },
  { id: 'ul', label: т('Список'), icon: 'list', apply: (el) => prefixLine(el, '- ') },
  { id: 'task', label: т('Задача'), icon: 'check', apply: (el) => prefixLine(el, '- [ ] ') },
  { id: 'quote', label: т('Цитата'), text: '❝', apply: (el) => prefixLine(el, '> ') },
  { id: 'link', label: т('Ссылка на заметку'), icon: 'link', apply: (el) => wrapSelection(el, '[[', ']]') },
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
  const [режимы, setРежимы] = useState(false)
  const текущій = FIT_MODES.find((m) => m.id === fit) ?? FIT_MODES[0]

  /*
   * mousedown гасится на всей панели: иначе нажатие на кнопку уводит фокус
   * из поля, и оно теряет выделение, к которому применяется «жирный».
   *
   * Из-за этого же здѣсь нельзя обычный <select>: в Chromium погашенный
   * mousedown не даёт списку раскрыться — выбор режима «Обычный /
   * Вписывать / Растить» просто не открывался, и текст никогда не
   * подстраивался под карточку. Поэтому режимы — своё меню из кнопок.
   */
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
      <button className="tt-btn" title={т('Мельче')} onClick={() => onFontSize(Math.max(9, fontSize - 1))}>
        <span style={{ fontSize: 11 }}>{т('А')}</span>
      </button>
      <span className="tt-size num">{fontSize}</span>
      <button className="tt-btn" title={т('Крупнее')} onClick={() => onFontSize(Math.min(48, fontSize + 1))}>
        <span style={{ fontSize: 15 }}>{т('А')}</span>
      </button>

      <span className="tool-sep" />
      <div className="tt-fit">
        <button
          className="tt-btn tt-fit-btn"
          title={текущій.about}
          aria-haspopup="menu"
          aria-expanded={режимы}
          onClick={() => setРежимы((v) => !v)}
        >
          <span>{текущій.name}</span>
          <Icon name={режимы ? 'up' : 'down'} size={12} />
        </button>
        {режимы && (
          <div className="tt-fit-menu" role="menu">
            {FIT_MODES.map((m) => (
              <button
                key={m.id}
                role="menuitemradio"
                aria-checked={m.id === fit}
                className={'tt-fit-item' + (m.id === fit ? ' on' : '')}
                onClick={() => {
                  onFit(m.id)
                  setРежимы(false)
                  areaRef.current?.focus()
                }}
              >
                <span className="tt-fit-name">{m.name}</span>
                <span className="tt-fit-about">{m.about}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
