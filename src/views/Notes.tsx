import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, moneyShort } from '../lib/format'
import { deleteNote, listNotes, readNote, renameNote, writeNote } from '../state/vault'
import { extractLinks, extractTags, noteExcerpt, renderMarkdown } from '../lib/markdown'
import { QueryBlock } from '../components/QueryBlock'
import { Confirm, InlineEdit, useToast } from '../components/ui'

type Mode = 'read' | 'edit' | 'split'

export default function Notes({ note }: { note?: string }) {
  const app = useApp()
  const { data } = useStore()
  const toast = useToast()

  const [all, setAll] = useState<{ name: string; body: string }[]>([])
  const [current, setCurrent] = useState<string>(note ?? '')
  const [body, setBody] = useState('')
  const [mode, setMode] = useState<Mode>('read')
  const [q, setQ] = useState('')
  const [del, setDel] = useState(false)
  const saveTimer = useRef<number | null>(null)

  const reload = useCallback(async () => {
    const names = await listNotes()
    const items = await Promise.all(names.map(async (n) => ({ name: n, body: (await readNote(n)) || '' })))
    setAll(items)
    return items
  }, [])

  useEffect(() => {
    void (async () => {
      const items = await reload()
      const pick = note || items[0]?.name || ''
      setCurrent(pick)
      setBody(items.find((x) => x.name === pick)?.body ?? '')
    })()
  }, [note, reload])

  const open = async (name: string) => {
    setCurrent(name)
    setBody((await readNote(name)) || '')
    setMode('read')
  }

  const change = (text: string) => {
    setBody(text)
    setAll((l) => l.map((x) => (x.name === current ? { ...x, body: text } : x)))
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    // Отложенная запись теперь умеет отказывать вслух: без перехвата отказ
    // стал бы необработанным промисом, а человек думал бы, что заметка цела.
    saveTimer.current = window.setTimeout(
      () => void writeNote(current, text).catch((e) =>
        toast('Заметка не сохранена: ' + (e instanceof Error ? e.message : String(e))),
      ),
      400,
    )
  }

  const create = async () => {
    let name = 'Новая заметка'
    let i = 2
    while (all.some((x) => x.name === name)) name = `Новая заметка ${i++}`
    await writeNote(name, `# ${name}\n\n`)
    await reload()
    void open(name)
  }

  const rename = async (next: string) => {
    if (!next || next === current || all.some((x) => x.name === next)) return
    await renameNote(current, next)
    await reload()
    setCurrent(next)
    toast('Переименовано')
  }

  const followLink = async (name: string) => {
    const exists = all.some((x) => x.name === name)
    if (!exists) {
      await writeNote(name, `# ${name}\n\n`)
      await reload()
      toast(`Создана заметка «${name}»`)
    }
    void open(name)
  }

  const backlinks = useMemo(
    () => all.filter((n) => n.name !== current && extractLinks(n.body).includes(current)),
    [all, current],
  )
  const outgoing = useMemo(() => [...new Set(extractLinks(body))], [body])
  const tags = useMemo(() => extractTags(body), [body])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((n) => !needle || n.name.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle))
  }, [all, q])

  const handlers = {
    onLink: (n: string) => void followLink(n),
    onTag: (t: string) => app.openTab('transactions'),
    linkExists: (n: string) => all.some((x) => x.name === n),
    renderQuery: (source: string, key: string) => <QueryBlock key={key} source={source} />,
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* ------------------------------------------------ список заметок */}
      <div style={{ flex: '0 1 230px', minWidth: 150, borderRight: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column' }}>
        <div className="row" style={{ padding: '8px 10px', gap: 6 }}>
          <input type="search" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="icon-btn" title="Новая заметка" onClick={create}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 10px' }}>
          {filtered.map((n) => (
            <div
              key={n.name}
              className={'nav-item' + (n.name === current ? ' active' : '')}
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '7px 9px' }}
              onClick={() => void open(n.name)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{n.name}</span>
              <span className="faint" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                {noteExcerpt(n.body, 60) || 'пусто'}
              </span>
            </div>
          ))}
          {!filtered.length && <div className="empty" style={{ padding: 20 }}>Ничего не найдено</div>}
        </div>
      </div>

      {/* ------------------------------------------------ содержимое */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!current ? (
          <div className="empty" style={{ marginTop: 60 }}>
            Заметок пока нет.{' '}
            <button className="btn sm" onClick={create}>Создать первую</button>
          </div>
        ) : (
          <>
            <div className="row" style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-soft)', gap: 10 }}>
              <InlineEdit value={current} onChange={(v) => void rename(v)} className="strong" />
              <span className="spacer" />
              <div className="seg">
                {(['read', 'split', 'edit'] as Mode[]).map((m) => (
                  <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                    {m === 'read' ? 'Чтение' : m === 'split' ? 'Пополам' : 'Правка'}
                  </button>
                ))}
              </div>
              <button className="icon-btn" title="Удалить заметку" onClick={() => setDel(true)}>
                <Icon name="trash" size={16} />
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              {mode !== 'read' && (
                <div style={{ flex: 1, overflow: 'auto', padding: 'calc(18px * var(--dens)) calc(22px * var(--dens))', borderRight: mode === 'split' ? '1px solid var(--border-soft)' : undefined }}>
                  <textarea
                    className="note-editor"
                    value={body}
                    onChange={(e) => change(e.target.value)}
                    spellCheck={false}
                    placeholder={'# Заголовок\n\nТекст, [[ссылка на заметку]], #тег\n\n```kashel\ntype: sum\nkind: expense\nperiod: 1m\n```'}
                  />
                </div>
              )}
              {mode !== 'edit' && (
                <div style={{ flex: 1, overflow: 'auto', padding: 'calc(18px * var(--dens)) calc(26px * var(--dens)) calc(60px * var(--dens))' }}>
                  {renderMarkdown(body, handlers)}

                  {(backlinks.length > 0 || outgoing.length > 0 || tags.length > 0) && (
                    <div className="card" style={{ marginTop: 32 }}>
                      {outgoing.length > 0 && (
                        <>
                          <div className="card-title"><Icon name="link" size={13} /> Ссылки отсюда</div>
                          <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
                            {outgoing.map((l) => (
                              <span key={l} className="chip" onClick={() => void followLink(l)}>{l}</span>
                            ))}
                          </div>
                        </>
                      )}
                      {backlinks.length > 0 && (
                        <>
                          <div className="card-title"><Icon name="arrowRight" size={13} /> Ссылаются сюда</div>
                          {backlinks.map((b) => (
                            <div key={b.name} className="tx-row" onClick={() => void open(b.name)}>
                              <Icon name="note" size={15} />
                              <div className="tx-main">
                                <div className="tx-title">{b.name}</div>
                                <div className="tx-sub">{noteExcerpt(b.body, 90)}</div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {tags.length > 0 && (
                        <>
                          <div className="card-title" style={{ marginTop: 12 }}><Icon name="tag" size={13} /> Теги</div>
                          <div className="row wrap" style={{ gap: 6 }}>
                            {tags.map((t) => (
                              <span key={t} className="chip">#{t}</span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {del && (
        <Confirm
          title={`Удалить «${current}»?`}
          text="Файл заметки будет удалён из хранилища. Отменить это можно только через корзину или систему контроля версий."
          onConfirm={async () => {
            await deleteNote(current)
            const items = await reload()
            const next = items[0]?.name ?? ''
            setCurrent(next)
            setBody(items.find((x) => x.name === next)?.body ?? '')
          }}
          onClose={() => setDel(false)}
        />
      )}
    </div>
  )
}
