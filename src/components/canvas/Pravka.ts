import { useLayoutEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { СТРОЧНАЯ_РАЗМЕТКА } from '../../lib/markdown'
import { т } from '../../i18n'

/*
 * Правка текстовой карточки «как в Word»: пишут сразу в оформленном виде,
 * без решёток и звёздочек, а в файл доски уходит тот же markdown.
 *
 * Модель — сам DOM поля (contenteditable): браузер ведёт курсор, выделение и
 * отмену, а после каждого ввода поле переводится обратно в разметку. Чтобы
 * правка ничего не портила, разбор повторяет markdown.tsx строка в строку и
 * помнит исходные мелочи: какой маркер стоял у списка («-» или «*»), сколько
 * пустых строк было между абзацами, как был записан заголовок. Блоки, которые
 * правке не по силам (код, живой запрос, свойства в начале), стоят в поле
 * целиком и не правятся. Перевод туда и обратно обязан вернуть текст байт в
 * байт — иначе карточка открывается в поле с разметкой, как раньше.
 */

/** То, чем панель форматирования управляет полем правки — любым из двух. */
export interface ПравкаТекста {
  run(id: string): void
  /** Что уже стоит у курсора — кнопки панели подсвечиваются. */
  активные(): Set<string>
}

interface Мета {
  /** Пустые строки перед блоком — как были записаны (в них бывают пробелы). */
  отступ: string[]
  /** Каким блок был при разборе: префикс верен, только пока вид тот же. */
  вид: string
  префикс: string
}

/*
 * Мета в WeakMap, а не в data-атрибутах: Chromium, разрезая абзац по Enter,
 * копирует атрибуты в новый блок, и пустые строки задвоились бы. Атомы же
 * (ссылки, код) не режутся, и их исходник лежит в data-md — он переживает
 * и копирование в буфер.
 */
const мета = new WeakMap<Node, Мета>()
const хвосты = new WeakMap<Node, string[]>()

const БЛОЧНЫЕ = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'PRE'])
const блочный = (n: Node) => n.nodeType === 1 && БЛОЧНЫЕ.has(n.nodeName)

// ------------------------------------------------------------ разметка → поле

function строкаВУзлы(doc: Document, text: string, куда: Node) {
  const re = new RegExp(СТРОЧНАЯ_РАЗМЕТКА.source, 'g')
  let last = 0
  let m: RegExpExecArray | null
  const текст = (s: string) => s && куда.appendChild(doc.createTextNode(s))
  const обёртка = (tag: string, inner: string) => {
    const el = doc.createElement(tag)
    el.textContent = inner
    куда.appendChild(el)
  }
  while ((m = re.exec(text))) {
    текст(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('[[') || (t.startsWith('[') && !t.startsWith('[['))) {
      // Ссылка — неделимый кусок: подпись видна, а исходник цел.
      const a = doc.createElement('a')
      a.className = 'wikilink'
      a.contentEditable = 'false'
      a.dataset.md = t
      a.textContent = t.startsWith('[[')
        ? (t.slice(2, -2).split('|')[1] ?? t.slice(2, -2).split('|')[0]).trim()
        : t.match(/\[([^\]]+)\]/)![1]
      куда.appendChild(a)
    } else if (t.startsWith('<u>')) обёртка('u', t.slice(3, -4))
    else if (t.startsWith('==')) обёртка('mark', t.slice(2, -2))
    else if (t.startsWith('~~')) обёртка('s', t.slice(2, -2))
    else if (t.startsWith('**')) обёртка('strong', t.slice(2, -2))
    else if (t.startsWith('*')) обёртка('em', t.slice(1, -1))
    else if (t.startsWith('`')) обёртка('code', t.slice(1, -1))
    else {
      const lead = t.startsWith('#') ? '' : t[0]
      текст(lead)
      const span = doc.createElement('span')
      span.className = 'tagref'
      span.textContent = t.slice(lead.length)
      куда.appendChild(span)
    }
    last = m.index + t.length
  }
  текст(text.slice(last))
}

function атом(doc: Document, raw: string, вид: 'code' | 'query' | 'props'): HTMLElement {
  const el = doc.createElement('div')
  el.className = 'md-atom md-atom-' + вид
  el.contentEditable = 'false'
  el.dataset.md = raw
  const pre = doc.createElement('pre')
  pre.textContent = вид === 'code' ? raw.split('\n').slice(1, -1).join('\n') : raw
  if (вид === 'query') {
    const подпись = doc.createElement('div')
    подпись.className = 'md-atom-title'
    подпись.textContent = т('Живой запрос — правится в режиме разметки')
    el.appendChild(подпись)
    pre.textContent = raw.split('\n').slice(1, -1).join('\n')
  }
  el.appendChild(pre)
  return el
}

function галочка(doc: Document, on: boolean): HTMLElement {
  const span = doc.createElement('span')
  span.className = 'md-check'
  span.contentEditable = 'false'
  const box = doc.createElement('input')
  box.type = 'checkbox'
  box.checked = on
  if (on) box.setAttribute('checked', '')
  span.appendChild(box)
  return span
}

/**
 * Строит поле из разметки. false — текст правке не по силам (его не вернуть
 * байт в байт), такую карточку правят в поле с разметкой.
 */
export function построить(root: HTMLElement, text: string): boolean {
  const doc = root.ownerDocument
  root.textContent = ''
  if (text.includes('\r')) return false
  const lines = text.split('\n')
  let i = 0
  let отступ: string[] = []
  let список: HTMLElement | null = null
  const положить = (el: HTMLElement, вид: string, префикс = '', куда: Node = root) => {
    мета.set(el, { отступ, вид, префикс })
    отступ = []
    куда.appendChild(el)
    return el
  }

  // Свойства в начале заметки — markdown.tsx их не показывает; здесь они
  // видны бледным блоком, чтобы их случайно не стереть.
  const fm = text.match(/^---[\s\S]*?---\n?/)
  if (fm) {
    const raw = fm[0].endsWith('\n') ? fm[0].slice(0, -1) : fm[0]
    if (!fm[0].endsWith('\n') && fm[0] !== text) return false
    положить(атом(doc, raw, 'props'), 'atom')
    i = raw.split('\n').length
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim().startsWith('```')) {
      список = null
      const lang = line.trim().slice(3).trim()
      const start = i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) i++
      i++
      const raw = lines.slice(start, Math.min(i, lines.length)).join('\n')
      // Незакрытый блок markdown.tsx дочитывает до конца — так и здесь, но
      // вернуть его байт в байт уже нельзя.
      if (i > lines.length) return false
      положить(атом(doc, raw, lang === 'kashel' || lang === 'кошель' ? 'query' : 'code'), 'atom')
      continue
    }

    const head = line.match(/^(#{1,4})\s+(.*)$/)
    if (head) {
      список = null
      const h = doc.createElement('h' + Math.min(3, head[1].length))
      строкаВУзлы(doc, head[2], h)
      положить(h, h.nodeName, line.slice(0, line.length - head[2].length))
      i++
      continue
    }

    const task = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/)
    const bullet = !task && line.match(/^\s*[-*]\s+(.*)$/)
    const num = !task && !bullet && line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (task || bullet || num) {
      const нужен = num ? 'OL' : 'UL'
      if (!список || список.nodeName !== нужен) {
        список = doc.createElement(нужен)
        // Пустые строки перед списком — у его первого пункта.
        root.appendChild(список)
      }
      const li = doc.createElement('li')
      const content = (task || bullet || num) as RegExpMatchArray
      const тело = content[content.length - 1]
      if (task) {
        li.className = 'md-zadacha'
        li.appendChild(галочка(doc, task[1].toLowerCase() === 'x'))
      }
      строкаВУзлы(doc, тело, li)
      if (!li.lastChild || (task && li.childNodes.length === 1)) li.appendChild(doc.createElement('br'))
      положить(li, task ? 'task' : num ? 'num' : 'li', line.slice(0, line.length - тело.length), список)
      i++
      continue
    }

    список = null
    if (/^\s*>/.test(line)) {
      const тело = line.replace(/^\s*>\s?/, '')
      const q = doc.createElement('blockquote')
      строкаВУзлы(doc, тело, q)
      if (!q.lastChild) q.appendChild(doc.createElement('br'))
      положить(q, 'BLOCKQUOTE', line.slice(0, line.length - тело.length))
      i++
      continue
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      положить(doc.createElement('hr'), 'HR', line)
      i++
      continue
    }

    if (!line.trim()) {
      список = null
      отступ.push(line)
      i++
      continue
    }

    const p = doc.createElement('p')
    строкаВУзлы(doc, line, p)
    положить(p, 'P')
    i++
  }

  // Пустому полю нужен хоть один абзац, иначе некуда поставить курсор.
  // Последняя пустая строка становится им самим.
  if (!root.firstChild) {
    const last = отступ.pop() ?? ''
    const p = doc.createElement('p')
    if (last) p.appendChild(doc.createTextNode(last))
    p.appendChild(doc.createElement('br'))
    положить(p, 'P')
  }
  хвосты.set(root, отступ)
  return разметкаИз(root) === text
}

// ------------------------------------------------------------ поле → разметка

const ОБЁРТКИ: Record<string, [string, string]> = {
  B: ['**', '**'], STRONG: ['**', '**'],
  I: ['*', '*'], EM: ['*', '*'],
  U: ['<u>', '</u>'],
  S: ['~~', '~~'], STRIKE: ['~~', '~~'], DEL: ['~~', '~~'],
  MARK: ['==', '=='],
  CODE: ['`', '`'],
}

function строчное(n: Node): string {
  if (n.nodeType === 3) return (n as Text).data.replace(/ /g, ' ')
  if (n.nodeType !== 1) return ''
  const el = n as HTMLElement
  if (el.dataset?.md !== undefined) return el.dataset.md
  if (el.classList.contains('md-check') || el.nodeName === 'INPUT') return ''
  if (el.nodeName === 'BR') return '\n'
  const внутри = [...el.childNodes].map(строчное).join('')
  let края = ОБЁРТКИ[el.nodeName]
  // Chromium при слиянии абзацев оставляет оформление стилем, а не тегом.
  if (!края && el.nodeName === 'SPAN') {
    const st = el.style
    if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) края = ОБЁРТКИ.B
    else if (st.fontStyle === 'italic') края = ОБЁРТКИ.I
    else if (st.textDecorationLine?.includes('line-through') || st.textDecoration?.includes('line-through')) края = ОБЁРТКИ.S
    else if (st.textDecorationLine?.includes('underline') || st.textDecoration?.includes('underline')) края = ОБЁРТКИ.U
  }
  // Пробелы внутри не трогаем: разбор берёт «**слово **» как есть, и правка
  // обязана вернуть его тем же.
  if (!края || !внутри) return внутри
  return края[0] + внутри + края[1]
}

/** Текст блока строками; концевой <br> — заглушка Chromium, а не перенос. */
function текстБлока(el: Node, пропустить?: (n: Node) => boolean): string {
  let s = ''
  const kids = [...el.childNodes].filter((k) => !пропустить?.(k))
  kids.forEach((k, idx) => {
    if (блочный(k)) {
      if (s && !s.endsWith('\n')) s += '\n'
      s += текстБлока(k)
      if (idx < kids.length - 1) s += '\n'
    } else s += строчное(k)
  })
  if (kids.length && kids[kids.length - 1].nodeName === 'BR' && s.endsWith('\n')) s = s.slice(0, -1)
  return s
}

function строкиСписка(list: Element, отступ = ''): string[] {
  const out: string[] = []
  let n = 0
  for (const li of list.childNodes) {
    if (li.nodeName === 'UL' || li.nodeName === 'OL') {
      out.push(...строкиСписка(li as Element, отступ + '  '))
      continue
    }
    if (li.nodeName !== 'LI') {
      const t = текстБлока(li)
      if (t) out.push(...t.split('\n'))
      continue
    }
    n++
    const m = мета.get(li)
    if (m) out.push(...m.отступ)
    const check = (li as Element).querySelector(':scope > .md-check input') as HTMLInputElement | null
    const вид = check ? 'task' : list.nodeName === 'OL' ? 'num' : 'li'
    let префикс: string
    if (m && m.вид === вид && !отступ) {
      префикс = m.префикс
      if (check) {
        const было = префикс.match(/\[( |x|X)\]/)![1]
        префикс = префикс.replace(/\[( |x|X)\]/, `[${check.checked ? (было === ' ' ? 'x' : было) : ' '}]`)
      }
    } else {
      префикс = отступ + (вид === 'num' ? `${n}. ` : вид === 'task' ? `- [${check!.checked ? 'x' : ' '}] ` : '- ')
    }
    const вложенные = (k: Node) => k.nodeName === 'UL' || k.nodeName === 'OL'
    const [first, ...rest] = текстБлока(li, вложенные).split('\n')
    out.push(префикс + first, ...rest)
    for (const k of li.childNodes) if (вложенные(k)) out.push(...строкиСписка(k as Element, отступ + '  '))
  }
  return out
}

export function разметкаИз(root: HTMLElement): string {
  const lines: string[] = []
  вСтроки(root, lines)
  lines.push(...(хвосты.get(root) ?? []))
  return lines.join('\n')
}

/**
 * Блоки контейнера — строками. Chromium порой кладёт список внутрь абзаца
 * («- » в начале строки → <p><ul>…</ul></p>); такой абзац разбираем как
 * обычный уровень поля, иначе маркеры списка пропали бы из разметки.
 */
function вСтроки(root: Node, lines: string[]) {
  let кусок: Node[] = []
  const сбросить = () => {
    if (!кусок.length) return
    const div = root.ownerDocument!.createElement('div')
    for (const k of кусок) div.appendChild(k.cloneNode(true))
    const t = текстБлока(div)
    if (t || кусок.some((k) => k.nodeName !== 'BR')) lines.push(...t.split('\n'))
    кусок = []
  }
  for (const k of root.childNodes) {
    if (!блочный(k)) {
      кусок.push(k)
      continue
    }
    сбросить()
    const el = k as HTMLElement
    const m = мета.get(el)
    if (m) lines.push(...m.отступ)
    if (el.dataset.md !== undefined) {
      lines.push(...el.dataset.md.split('\n'))
      continue
    }
    const tag = el.nodeName
    if ((tag === 'P' || tag === 'DIV') && [...el.childNodes].some(блочный)) {
      вСтроки(el, lines)
      continue
    }
    if (tag === 'UL' || tag === 'OL') {
      lines.push(...строкиСписка(el))
      continue
    }
    if (tag === 'HR') {
      lines.push(m?.вид === 'HR' ? m.префикс : '---')
      continue
    }
    const [first, ...rest] = текстБлока(el).split('\n')
    if (/^H[1-6]$/.test(tag)) {
      const префикс = m?.вид === tag ? m.префикс : '#'.repeat(Math.min(3, Number(tag[1]))) + ' '
      lines.push(префикс + first, ...rest)
    } else if (tag === 'BLOCKQUOTE') {
      lines.push((m?.вид === tag ? m.префикс : '> ') + first, ...rest.map((r) => '> ' + r))
    } else {
      lines.push(first, ...rest)
    }
  }
  сбросить()
}

/** Получится ли править этот текст «как в Word» без потерь. */
export function можноЖиво(text: string): boolean {
  if (typeof document === 'undefined') return false
  return построить(document.createElement('div'), text)
}

// ------------------------------------------------------------ команды

function exec(cmd: string, value?: string): boolean {
  try {
    return typeof document.execCommand === 'function' && document.execCommand(cmd, false, value)
  } catch {
    return false
  }
}

function выделение(root: HTMLElement): Range | null {
  const sel = root.ownerDocument.getSelection()
  if (!sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  return root.contains(r.commonAncestorContainer) ? r : null
}

function предок(n: Node | null, root: HTMLElement, test: (el: Element) => boolean): HTMLElement | null {
  for (let x: Node | null = n; x && x !== root; x = x.parentNode) {
    if (x.nodeType === 1 && test(x as Element)) return x as HTMLElement
  }
  return null
}

/** Ближайший блок у курсора; строчный узел прямо в поле — он сам. */
function блокКурсора(root: HTMLElement): HTMLElement | null {
  const r = выделение(root)
  if (!r) return null
  return (
    предок(r.startContainer, root, (el) => блочный(el) && el.nodeName !== 'UL' && el.nodeName !== 'OL') ??
    предок(r.startContainer, root, (el) => el.parentNode === root)
  )
}

function поставитьКурсор(n: Node, offset: number) {
  const sel = n.ownerDocument!.getSelection()
  if (!sel) return
  const r = n.ownerDocument!.createRange()
  r.setStart(n, offset)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

const экранировать = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Строчное оформление тегом: снимаем, если курсор уже в нём, иначе оборачиваем. */
function обернуть(root: HTMLElement, tag: string) {
  const r = выделение(root)
  if (!r) return
  const doc = root.ownerDocument
  const уже = предок(r.commonAncestorContainer, root, (el) => el.nodeName === tag)
  if (уже) {
    const sel = doc.getSelection()!
    const all = doc.createRange()
    all.selectNodeContents(уже)
    sel.removeAllRanges()
    sel.addRange(all)
    const текст = уже.textContent ?? ''
    if (!exec('insertText', текст)) уже.replaceWith(doc.createTextNode(текст))
    return
  }
  const текст = r.collapsed ? т('текст') : r.toString()
  if (exec('insertHTML', `<${tag.toLowerCase()}>${экранировать(текст)}</${tag.toLowerCase()}>`)) return
  const el = doc.createElement(tag)
  el.textContent = текст
  r.deleteContents()
  r.insertNode(el)
  поставитьКурсор(el, 1)
}

const ВНЕШНИЕ: Record<string, [string, string]> = {
  b: ['bold', 'STRONG'], i: ['italic', 'EM'], u: ['underline', 'U'], s: ['strikeThrough', 'S'],
}

function сменитьБлок(root: HTMLElement, tag: string) {
  const блок = блокКурсора(root)
  const нужен = блок?.nodeName === tag ? 'P' : tag
  if (exec('formatBlock', нужен.toLowerCase())) return
  // Запасной путь — там, где execCommand нет (тесты в jsdom).
  if (!блок) return
  const el = root.ownerDocument.createElement(нужен)
  // Строчный узел прямо в поле (курсор встал в самый конец) — оборачиваем
  // его целиком, а не превращаем жирный в заголовок.
  if (!блочный(блок)) блок.replaceWith(el), el.appendChild(блок)
  else {
    while (блок.firstChild) el.appendChild(блок.firstChild)
    блок.replaceWith(el)
  }
  поставитьКурсор(el, el.childNodes.length)
}

function вСписок(root: HTMLElement): HTMLElement | null {
  const r = выделение(root)
  const есть = r && предок(r.startContainer, root, (el) => el.nodeName === 'LI')
  if (есть) return есть
  if (!exec('insertUnorderedList')) {
    const блок = блокКурсора(root)
    if (!блок) return null
    const ul = root.ownerDocument.createElement('ul')
    const li = root.ownerDocument.createElement('li')
    while (блок.firstChild) li.appendChild(блок.firstChild)
    ul.appendChild(li)
    блок.replaceWith(ul)
    поставитьКурсор(li, li.childNodes.length)
    return li
  }
  const r2 = выделение(root)
  return r2 && предок(r2.startContainer, root, (el) => el.nodeName === 'LI')
}

/**
 * Галочка в начало пункта. Курсор, стоявший в самом начале, переносим за неё:
 * иначе набранный текст ложился бы перед галочкой.
 */
function поставитьГалочку(root: HTMLElement, li: HTMLElement) {
  const r = выделение(root)
  const вНачале = !!r && r.collapsed && r.startContainer === li && r.startOffset === 0
  li.insertBefore(галочка(root.ownerDocument, false), li.firstChild)
  if (вНачале || !r) поставитьКурсор(li, 1)
}

/**
 * Список прямо внутри абзаца (так его делает Chromium из «- ») вынимаем на
 * уровень поля: иначе двойной Enter не выводит из списка. Курсор сохраняем —
 * перенос узлов сбросил бы его.
 */
function распрямить(root: HTMLElement) {
  const списки = [...root.querySelectorAll(':scope > p > ul, :scope > p > ol, :scope > div > ul, :scope > div > ol')]
  if (!списки.length) return
  const doc = root.ownerDocument
  const r = выделение(root)
  const где = r && { a: r.startContainer, ao: r.startOffset, b: r.endContainer, bo: r.endOffset }
  for (const p of new Set(списки.map((с) => с.parentElement!))) {
    const m = мета.get(p)
    let абзац: HTMLElement | null = null
    let первый = true
    for (const k of [...p.childNodes]) {
      // Концевой <br> — заглушка, переносить его некуда.
      if (k.nodeName === 'BR' && !k.nextSibling && k.previousSibling) continue
      let куда: Node = k
      if (блочный(k)) {
        root.insertBefore(k, p)
        абзац = null
      } else {
        // Строчное до и после списка — в свой абзац, подряд идущее — в один.
        if (!абзац) {
          абзац = doc.createElement('p')
          root.insertBefore(абзац, p)
        }
        абзац.appendChild(k)
        куда = абзац
      }
      // Пустые строки перед абзацем остаются перед первым его куском.
      if (первый && m) мета.set(куда, m)
      первый = false
    }
    p.remove()
  }
  if (!где) return
  try {
    const nr = doc.createRange()
    nr.setStart(где.a, где.ao)
    nr.setEnd(где.b, где.bo)
    const sel = doc.getSelection()!
    sel.removeAllRanges()
    sel.addRange(nr)
  } catch {
    /* узел курсора ушёл — браузер поставит курсор сам */
  }
}

function задача(root: HTMLElement) {
  const li = вСписок(root)
  if (!li) return
  const есть = li.querySelector(':scope > .md-check')
  if (есть) {
    есть.remove()
    li.classList.remove('md-zadacha')
  } else {
    li.classList.add('md-zadacha')
    поставитьГалочку(root, li)
  }
}

function ссылка(root: HTMLElement) {
  const r = выделение(root)
  if (!r) return
  const имя = r.toString().trim()
  if (!имя) {
    // Пусто — ставим скобки и курсор между ними: дальше пишут имя заметки.
    if (exec('insertText', '[[]]')) {
      const sel = root.ownerDocument.getSelection()!
      const r2 = sel.getRangeAt(0)
      поставитьКурсор(r2.startContainer, r2.startOffset - 2)
    }
    return
  }
  const md = `[[${имя}]]`
  if (exec('insertHTML', `<a class="wikilink" contenteditable="false" data-md="${экранировать(md)}">${экранировать(имя)}</a>&nbsp;`)) return
  const a = root.ownerDocument.createElement('a')
  a.className = 'wikilink'
  a.contentEditable = 'false'
  a.dataset.md = md
  a.textContent = имя
  r.deleteContents()
  r.insertNode(a)
}

export function команда(root: HTMLElement, id: string) {
  root.focus()
  const внешнее = ВНЕШНИЕ[id]
  if (внешнее) {
    if (!exec(внешнее[0])) обернуть(root, внешнее[1])
    return
  }
  switch (id) {
    case 'mark': return обернуть(root, 'MARK')
    case 'code': return обернуть(root, 'CODE')
    case 'h1': case 'h2': case 'h3': return сменитьБлок(root, id.toUpperCase())
    case 'quote': return сменитьБлок(root, 'BLOCKQUOTE')
    case 'ul': {
      if (!exec('insertUnorderedList')) вСписок(root)
      return
    }
    case 'task': return задача(root)
    case 'link': return ссылка(root)
  }
}

export function активныеУ(root: HTMLElement): Set<string> {
  const out = new Set<string>()
  const r = выделение(root)
  if (!r) return out
  const у = (tags: string[]) => !!предок(r.startContainer, root, (el) => tags.includes(el.nodeName))
  const состояние = (cmd: string) => {
    try {
      return typeof document.queryCommandState === 'function' && document.queryCommandState(cmd)
    } catch {
      return false
    }
  }
  if (у(['B', 'STRONG']) || состояние('bold')) out.add('b')
  if (у(['I', 'EM']) || состояние('italic')) out.add('i')
  if (у(['U']) || состояние('underline')) out.add('u')
  if (у(['S', 'STRIKE', 'DEL']) || состояние('strikeThrough')) out.add('s')
  if (у(['MARK'])) out.add('mark')
  if (у(['CODE'])) out.add('code')
  const блок = блокКурсора(root)?.nodeName
  if (блок === 'H1' || блок === 'H2' || блок === 'H3') out.add(блок.toLowerCase())
  if (блок === 'BLOCKQUOTE') out.add('quote')
  const li = предок(r.startContainer, root, (el) => el.nodeName === 'LI')
  if (li?.querySelector(':scope > .md-check')) out.add('task')
  else if (li) out.add('ul')
  return out
}

/**
 * Разметка в начале строки превращается в оформление, как в Word и Notion:
 * «# » — заголовок, «- » — список, «> » — цитата, «[] » — задача.
 */
function автоформат(root: HTMLElement): boolean {
  const r = выделение(root)
  if (!r || !r.collapsed || r.startContainer.nodeType !== 3) return false
  const узел = r.startContainer as Text
  const до = узел.data.slice(0, r.startOffset).replace(/ /g, ' ')
  const блок = блокКурсора(root)
  if (!блок) return false
  // Только в самом начале блока: первый текст блока и есть этот узел.
  const первый = (() => {
    const w = root.ownerDocument.createTreeWalker(блок, 4)
    return w.nextNode()
  })()
  if (первый !== узел) return false
  const li = предок(узел, root, (el) => el.nodeName === 'LI')
  const срезать = (n: number) => {
    const sel = root.ownerDocument.getSelection()!
    const del = root.ownerDocument.createRange()
    del.setStart(узел, r.startOffset - n)
    del.setEnd(узел, r.startOffset)
    sel.removeAllRanges()
    sel.addRange(del)
    if (!exec('delete')) {
      del.deleteContents()
      поставитьКурсор(узел, r.startOffset - n)
    }
  }
  if (li) {
    if (/^\[ ?\] $/.test(до) && !li.querySelector(':scope > .md-check')) {
      срезать(до.length)
      задача(root)
      return true
    }
    return false
  }
  if (блок.nodeName !== 'P' && блок.nodeName !== 'DIV') return false
  const head = до.match(/^(#{1,3}) $/)
  if (head) {
    срезать(до.length)
    сменитьБлок(root, 'H' + head[1].length)
    return true
  }
  if (до === '> ') {
    срезать(2)
    сменитьБлок(root, 'BLOCKQUOTE')
    return true
  }
  if (/^\[ ?\] $/.test(до)) {
    срезать(до.length)
    задача(root)
    return true
  }
  if (до === '- ' || до === '* ') {
    срезать(2)
    if (!exec('insertUnorderedList')) вСписок(root)
    return true
  }
  if (/^1[.)] $/.test(до)) {
    срезать(до.length)
    exec('insertOrderedList')
    return true
  }
  return false
}

/** Новый пункт после задачи — тоже задача, как в Obsidian. */
function продолжитьЗадачи(root: HTMLElement) {
  const r = выделение(root)
  const li = r && предок(r.startContainer, root, (el) => el.nodeName === 'LI')
  if (!li) return
  const прежний = li.previousElementSibling
  if (прежний?.querySelector(':scope > .md-check') && !li.querySelector(':scope > .md-check')) {
    li.classList.add('md-zadacha')
    поставитьГалочку(root, li)
  }
  // Chromium копирует пункт вместе с отметкой — новый пункт не выполнен.
  const box = li.querySelector(':scope > .md-check input') as HTMLInputElement | null
  if (box && box.checked && !(li.textContent ?? '').trim()) {
    box.checked = false
    box.removeAttribute('checked')
  }
}

// ------------------------------------------------------------ хук

/**
 * Подключает поле: строит его из текста, после каждого ввода отдаёт разметку
 * наверх и отвечает панели форматирования через apiRef.
 */
export function useЖиваяПравка(
  поле: RefObject<HTMLDivElement>,
  text: string,
  onText: (text: string) => void,
  apiRef?: MutableRefObject<ПравкаТекста | null>,
) {
  const последний = useRef<string | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  // Текст сменился не отсюда (отмена на доске, другое окно) — строим заново.
  useLayoutEffect(() => {
    const root = поле.current
    if (!root || text === последний.current) return
    const первый = последний.current === null
    построить(root, text)
    последний.current = text
    if (первый) {
      root.focus()
      // Курсор — в конец текста, как в поле с разметкой прежде.
      const w = root.ownerDocument.createTreeWalker(root, 4)
      let last: Node | null = null
      for (let n = w.nextNode(); n; n = w.nextNode()) if (!(n.parentElement?.closest('[contenteditable="false"]'))) last = n
      if (last) поставитьКурсор(last, (last as Text).data.length)
      else {
        const p = root.querySelector('p, li, h1, h2, h3, blockquote')
        if (p) поставитьКурсор(p, 0)
      }
    }
  }, [text])

  useLayoutEffect(() => {
    const root = поле.current
    if (!root) return
    exec('defaultParagraphSeparator', 'p')
    const отдать = () => {
      const t = разметкаИз(root)
      последний.current = t
      onTextRef.current(t)
    }
    const onInput = (e: Event) => {
      const ie = e as InputEvent
      if (ie.inputType === 'insertText' && ie.data === ' ') автоформат(root)
      распрямить(root)
      if (ie.inputType === 'insertParagraph') продолжитьЗадачи(root)
      отдать()
    }
    const onChange = (e: Event) => {
      const box = e.target as HTMLInputElement
      if (box.type !== 'checkbox') return
      if (box.checked) box.setAttribute('checked', '')
      else box.removeAttribute('checked')
      отдать()
    }
    // Вставляем как разметку: «**жирный**» из буфера сразу становится жирным,
    // а чужое оформление из браузеров и Word не тащим.
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain')
      if (text == null) return
      e.preventDefault()
      const tmp = root.ownerDocument.createElement('div')
      if (!text.includes('\n') && !/^\s*(#{1,4}\s|[-*]\s|\d+[.)]\s|>)/.test(text)) {
        строкаВУзлы(root.ownerDocument, text, tmp)
      } else if (!построить(tmp, text.replace(/\r\n?/g, '\n'))) {
        tmp.textContent = text
      }
      if (!exec('insertHTML', tmp.innerHTML)) exec('insertText', text)
      отдать()
    }
    const вБуфер = (e: ClipboardEvent, вырезать: boolean) => {
      const r = выделение(root)
      if (!r || r.collapsed || !e.clipboardData) return
      const div = root.ownerDocument.createElement('div')
      div.appendChild(r.cloneContents())
      e.clipboardData.setData('text/plain', разметкаИз(div))
      e.preventDefault()
      if (вырезать) {
        if (!exec('delete')) r.deleteContents()
        отдать()
      }
    }
    const onCopy = (e: ClipboardEvent) => вБуфер(e, false)
    const onCut = (e: ClipboardEvent) => вБуфер(e, true)
    const onKey = (e: KeyboardEvent) => {
      // Tab в поле — не уход фокуса из карточки и не вложенный список.
      if (e.key === 'Tab') e.preventDefault()
      // Enter в пустой задаче — выход из списка, как в пустом пункте. Галочка
      // делает пункт для Chromium непустым, поэтому сначала снимаем её.
      if (e.key === 'Enter' && !e.shiftKey) {
        const r = выделение(root)
        const li = r && предок(r.startContainer, root, (el) => el.nodeName === 'LI')
        const галка = li?.querySelector(':scope > .md-check')
        if (li && галка && !(li.textContent ?? '').trim()) {
          галка.remove()
          li.classList.remove('md-zadacha')
          поставитьКурсор(li, 0)
        }
      }
    }
    root.addEventListener('input', onInput)
    root.addEventListener('change', onChange)
    root.addEventListener('paste', onPaste)
    root.addEventListener('copy', onCopy)
    root.addEventListener('cut', onCut)
    root.addEventListener('keydown', onKey)
    if (apiRef) {
      apiRef.current = {
        run: (id) => {
          команда(root, id)
          отдать()
        },
        активные: () => активныеУ(root),
      }
    }
    return () => {
      root.removeEventListener('input', onInput)
      root.removeEventListener('change', onChange)
      root.removeEventListener('paste', onPaste)
      root.removeEventListener('copy', onCopy)
      root.removeEventListener('cut', onCut)
      root.removeEventListener('keydown', onKey)
      if (apiRef) apiRef.current = null
    }
  }, [apiRef])
}
