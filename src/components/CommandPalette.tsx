import React, { useEffect, useMemo, useRef, useState } from 'react'
import { сЗначкомъ } from '../lib/catalog'
import { useApp, VIEW_META, type ViewId } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { listCanvases, listNotes, writeCanvas, writeNote } from '../state/vault'
import { useToast } from './ui'
import { THEMES, counterpart } from '../lib/themes'
import { т } from '../i18n'

interface Cmd {
  id: string
  section: string
  title: string
  icon: string
  hint?: string
  run(): void
}

/** Ctrl+P — единая точка входа во всё, что умеет программа. */
/** Ctrl+P — единая точка входа во всё, что умеет программа. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const store = useStore()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [notes, setNotes] = useState<string[]>([])
  const [canvases, setCanvases] = useState<string[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void listNotes().then(setNotes)
    void listCanvases().then(setCanvases)
  }, [])

  const cmds = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = (Object.keys(VIEW_META) as ViewId[]).map((v) => ({
      id: 'nav:' + v,
      section: т('Разделы'),
      title: VIEW_META[v].title,
      icon: VIEW_META[v].icon,
      run: () => app.openTab(v),
    }))

    const actions: Cmd[] = [
      {
        id: 'act:new-tx', section: т('Действия'), title: т('Новая операция'), icon: 'plus', hint: 'Ctrl+N',
        run: () => app.openQuickAdd(),
      },
      {
        id: 'act:new-tx-full', section: т('Действия'), title: т('Новая операция — подробная форма'), icon: 'plus',
        run: () => app.editTransaction({}),
      },
      {
        id: 'act:search', section: т('Действия'), title: т('Поиск по всему'), icon: 'search', hint: 'Ctrl+Shift+F',
        run: () => app.openSearch(),
      },
      {
        id: 'act:new-note', section: т('Действия'), title: т('Новая заметка'), icon: 'note',
        run: async () => {
          const name = т('Заметка {0}', new Date().toLocaleDateString('ru-RU'))
          await writeNote(name, `# ${name}\n\n`)
          app.openTab('notes', name)
        },
      },
      {
        id: 'act:new-canvas', section: т('Действия'), title: т('Новый канвас'), icon: 'canvas',
        run: async () => {
          const name = т('Канвас {0}', new Date().toLocaleDateString('ru-RU'))
          await writeCanvas(name, { nodes: [], edges: [] })
          app.openTab('canvas', name)
        },
      },
      {
        id: 'act:split', section: т('Действия'), title: т('Разделить панель'), icon: 'panel', hint: 'Ctrl+\\',
        run: app.splitPane,
      },
      {
        id: 'act:theme', section: т('Действия'), title: т('Светлая или тёмная'), icon: 'sun',
        run: () => store.patchSettings({ theme: counterpart(store.data.settings.theme) }),
      },
      ...THEMES.map((t) => ({
        id: 'theme:' + t.id,
        section: т('Оформление'),
        title: t.name,
        icon: 'palette',
        hint: t.mode === 'dark' ? 'тёмная' : 'светлая',
        run: () => store.patchSettings({ theme: t.id, accent: t.accent }),
      })),
      {
        id: 'act:hide', section: т('Действия'), title: store.data.settings.hideBalance ? т('Показать баланс') : т('Скрыть баланс'),
        icon: store.data.settings.hideBalance ? 'eye' : 'eyeOff',
        run: () => store.patchSettings({ hideBalance: !store.data.settings.hideBalance }),
      },
      {
        id: 'act:save', section: т('Действия'), title: т('Сохранить сейчас'), icon: 'save', hint: 'Ctrl+S',
        run: async () => {
          await store.saveNow()
          toast(т('Хранилище сохранено'))
        },
      },
      {
        id: 'act:vault', section: т('Действия'), title: т('Открыть папку хранилища'), icon: 'folder',
        run: () => {
          void (window as any).kashel?.revealVault()
          toast(т('Открываю папку хранилища'))
        },
      },
    ]

    const files: Cmd[] = [
      ...notes.map((n) => ({
        id: 'note:' + n, section: т('Заметки'), title: n, icon: 'note',
        run: () => app.openTab('notes', n),
      })),
      ...canvases.map((n) => ({
        id: 'canvas:' + n, section: т('Канвасы'), title: n, icon: 'canvas',
        run: () => app.openTab('canvas', n),
      })),
    ]

    const entities: Cmd[] = [
      ...store.data.accounts.filter((a) => !a.archived).map((a) => ({
        id: 'acc:' + a.id, section: т('Счета'), title: сЗначкомъ(a.icon, a.name), icon: 'wallet',
        run: () => app.openTab('accounts'),
      })),
      ...store.data.categories.filter((c) => !c.archived).map((c) => ({
        id: 'cat:' + c.id, section: т('Категории'), title: сЗначкомъ(c.icon, c.name), icon: 'tag',
        run: () => app.openTab('transactions', 'cat:' + c.id, { title: c.name }),
      })),
    ]

    return [...actions, ...nav, ...files, ...entities]
  }, [app, store, notes, canvases, toast])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return cmds.slice(0, 40)
    const score = (c: Cmd) => {
      const t = c.title.toLowerCase()
      if (t.startsWith(needle)) return 0
      if (t.includes(needle)) return 1
      // Нечёткое: все буквы запроса по порядку.
      let i = 0
      for (const ch of t) if (ch === needle[i]) i++
      return i === needle.length ? 2 : 99
    }
    return cmds
      .map((c) => ({ c, s: score(c) }))
      .filter((x) => x.s < 99)
      .sort((a, b) => a.s - b.s)
      .slice(0, 40)
      .map((x) => x.c)
  }, [cmds, q])

  useEffect(() => setSel(0), [q])

  const grouped = useMemo(() => {
    const out: { section: string; items: Cmd[] }[] = []
    for (const c of filtered) {
      const last = out[out.length - 1]
      if (last && last.section === c.section) last.items.push(c)
      else out.push({ section: c.section, items: [c] })
    }
    return out
  }, [filtered])

  const flat = filtered

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ padding: 0 }}>
        <input
          className="palette-input"
          autoFocus
          placeholder={т('Команда, раздел, заметка, категория…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(flat.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const c = flat[sel]
              if (c) {
                onClose()
                void c.run()
              }
            } else if (e.key === 'Escape') onClose()
          }}
        />
        <div className="palette-list" ref={listRef}>
          {grouped.map((g) => (
            <div key={g.section}>
              <div className="palette-sec">{g.section}</div>
              {g.items.map((c) => {
                const idx = flat.indexOf(c)
                return (
                  <div
                    key={c.id}
                    className={'palette-item' + (idx === sel ? ' sel' : '')}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => {
                      onClose()
                      void c.run()
                    }}
                  >
                    <Icon name={c.icon} size={16} />
                    <span>{c.title}</span>
                    {c.hint && <kbd className="hint">{c.hint}</kbd>}
                  </div>
                )
              })}
            </div>
          ))}
          {!flat.length && <div className="empty">{т('Ничего не нашлось')}</div>}
        </div>
      </div>
    </div>
  )
}
