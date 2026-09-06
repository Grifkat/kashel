import React from 'react'

// Небольшой markdown ровно под то, что нужно заметкам: заголовки, списки,
// задачи, цитаты, код и блоки живых запросов. Без внешних зависимостей.

export interface MdHandlers {
  onLink(name: string): void
  onTag(tag: string): void
  renderQuery(source: string, key: string): React.ReactNode
  linkExists?(name: string): boolean
}

export function extractLinks(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1].trim())
}

export function extractTags(body: string): string[] {
  const noCode = body.replace(/```[\s\S]*?```/g, '')
  return [...new Set([...noCode.matchAll(/(?:^|\s)#([\wа-яёА-ЯЁ-]{2,})/g)].map((m) => m[1]))]
}

export function noteTitle(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : fallback
}

/** Первые значимые строки — для превью в списке и в графе. */
export function noteExcerpt(body: string, len = 120): string {
  const text = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#.*$/gm, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/[*_`>]/g, '')
    .trim()
  return text.slice(0, len).replace(/\s+/g, ' ')
}

function inline(text: string, h: MdHandlers, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(\[\[[^\]]+\]\])|(<u>[\s\S]*?<\/u>)|(==[^=]+==)|(~~[^~]+~~)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|((?:^|\s)#[\wа-яёА-ЯЁ-]{2,})/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const token = m[0]
    const key = `${keyBase}-${i++}`
    if (token.startsWith('[[')) {
      const inner = token.slice(2, -2)
      const [target, label] = inner.split('|')
      const missing = h.linkExists && !h.linkExists(target.trim())
      out.push(
        <a key={key} className={'wikilink' + (missing ? ' missing' : '')} onClick={() => h.onLink(target.trim())}>
          {(label || target).trim()}
        </a>,
      )
    } else if (token.startsWith('<u>')) {
      // Подчёркивания в markdown нет — как и Obsidian, принимаем HTML-тег.
      out.push(<u key={key}>{token.slice(3, -4)}</u>)
    } else if (token.startsWith('==')) {
      out.push(<mark key={key}>{token.slice(2, -2)}</mark>)
    } else if (token.startsWith('~~')) {
      out.push(<s key={key}>{token.slice(2, -2)}</s>)
    } else if (token.startsWith('**')) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('`')) {
      out.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('[')) {
      const mm = token.match(/\[([^\]]+)\]\(([^)]+)\)/)!
      out.push(
        <a key={key} href={mm[2]} target="_blank" rel="noreferrer" className="wikilink">
          {mm[1]}
        </a>,
      )
    } else {
      const lead = token.startsWith(' ') ? ' ' : ''
      const tag = token.trim().slice(1)
      out.push(
        <React.Fragment key={key}>
          {lead}
          <span className="tagref" onClick={() => h.onTag(tag)}>#{tag}</span>
        </React.Fragment>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function renderMarkdown(body: string, h: MdHandlers): React.ReactNode {
  const src = body.replace(/^---[\s\S]*?---\n?/, '')
  const lines = src.split('\n')
  const out: React.ReactNode[] = []
  let list: React.ReactNode[] = []
  let listOrdered = false
  let i = 0

  const flushList = () => {
    if (!list.length) return
    out.push(
      listOrdered ? <ol key={'l' + out.length}>{list}</ol> : <ul key={'l' + out.length}>{list}</ul>,
    )
    list = []
  }

  while (i < lines.length) {
    const line = lines[i]

    // блок кода / живой запрос
    if (line.trim().startsWith('```')) {
      flushList()
      const lang = line.trim().slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++])
      i++
      const source = buf.join('\n')
      if (lang === 'kashel' || lang === 'кошель') {
        out.push(<React.Fragment key={'q' + out.length}>{h.renderQuery(source, 'q' + out.length)}</React.Fragment>)
      } else {
        out.push(
          <pre key={'c' + out.length} style={{ background: 'var(--panel-2)', padding: 12, borderRadius: 8, overflow: 'auto' }}>
            <code>{source}</code>
          </pre>,
        )
      }
      continue
    }

    const head = line.match(/^(#{1,4})\s+(.*)$/)
    if (head) {
      flushList()
      const level = head[1].length
      const content = inline(head[2], h, 'h' + i)
      out.push(
        level === 1 ? <h1 key={i}>{content}</h1>
        : level === 2 ? <h2 key={i}>{content}</h2>
        : <h3 key={i}>{content}</h3>,
      )
      i++
      continue
    }

    const task = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/)
    if (task) {
      listOrdered = false
      list.push(
        <li key={i} className="md-task">
          <input type="checkbox" readOnly checked={task[1].toLowerCase() === 'x'} style={{ width: 14, height: 14 }} />
          <span style={{ opacity: task[1].toLowerCase() === 'x' ? 0.55 : 1 }}>{inline(task[2], h, 't' + i)}</span>
        </li>,
      )
      i++
      continue
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      listOrdered = false
      list.push(<li key={i}>{inline(bullet[1], h, 'b' + i)}</li>)
      i++
      continue
    }

    const num = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (num) {
      listOrdered = true
      list.push(<li key={i}>{inline(num[1], h, 'n' + i)}</li>)
      i++
      continue
    }

    if (/^\s*>/.test(line)) {
      flushList()
      out.push(<blockquote key={i}>{inline(line.replace(/^\s*>\s?/, ''), h, 'q' + i)}</blockquote>)
      i++
      continue
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushList()
      out.push(<hr key={i} />)
      i++
      continue
    }

    if (!line.trim()) {
      flushList()
      i++
      continue
    }

    flushList()
    out.push(<p key={i}>{inline(line, h, 'p' + i)}</p>)
    i++
  }
  flushList()
  return <div className="md">{out}</div>
}
