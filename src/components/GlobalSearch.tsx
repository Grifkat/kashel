import React, { useEffect, useMemo, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Avatar, Modal } from './ui'
import { Icon } from '../lib/icons'
import { listNotes, readNote } from '../state/vault'
import { humanDate } from '../lib/date'
import { money } from '../lib/format'
import type { Transaction } from '../lib/types'

interface NoteHit {
  title: string
  line: string
}

/** Ctrl+Shift+F — сквозной поиск по операциям, заметкам и справочникам. */
export function GlobalSearch({ initial, onClose }: { initial: string; onClose: () => void }) {
  const app = useApp()
  const { data } = useStore()
  const [q, setQ] = useState(initial)
  const [notes, setNotes] = useState<{ title: string; body: string }[]>([])

  useEffect(() => {
    void (async () => {
      const titles = await listNotes()
      const bodies = await Promise.all(titles.map(async (t) => ({ title: t, body: (await readNote(t)) || '' })))
      setNotes(bodies)
    })()
  }, [])

  const needle = q.trim().toLowerCase()

  const txHits = useMemo<Transaction[]>(() => {
    if (needle.length < 2) return []
    const catByName = new Map(data.categories.map((c) => [c.id, c.name.toLowerCase()]))
    return data.transactions
      .filter(
        (t) =>
          (t.note || '').toLowerCase().includes(needle) ||
          t.tags.some((x) => x.toLowerCase().includes(needle)) ||
          (t.categoryId && catByName.get(t.categoryId)?.includes(needle)),
      )
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 12)
  }, [needle, data])

  const noteHits = useMemo<NoteHit[]>(() => {
    if (needle.length < 2) return []
    const out: NoteHit[] = []
    for (const n of notes) {
      if (n.title.toLowerCase().includes(needle)) out.push({ title: n.title, line: 'совпадение в названии' })
      for (const line of n.body.split('\n')) {
        if (line.toLowerCase().includes(needle)) {
          out.push({ title: n.title, line: line.trim().slice(0, 120) })
          break
        }
      }
    }
    return out.slice(0, 10)
  }, [needle, notes])

  const catHits = useMemo(
    () => (needle.length < 2 ? [] : data.categories.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 8)),
    [needle, data.categories],
  )

  const catById = new Map(data.categories.map((c) => [c.id, c]))

  return (
    <Modal title="Поиск по всему" icon="search" onClose={onClose} wide>
      <input
        type="search"
        autoFocus
        value={q}
        placeholder="Слово в комментарии, тег, название категории или заметки"
        onChange={(e) => setQ(e.target.value)}
        style={{ fontSize: 16, padding: '9px 13px', marginBottom: 16 }}
      />

      {needle.length < 2 && <div className="empty">Введите хотя бы два символа</div>}

      {catHits.length > 0 && (
        <>
          <div className="card-title">Категории</div>
          <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
            {catHits.map((c) => (
              <span
                key={c.id}
                className="chip"
                onClick={() => {
                  onClose()
                  app.openTab('transactions', 'cat:' + c.id, { title: c.name })
                }}
              >
                {c.icon} {c.name}
              </span>
            ))}
          </div>
        </>
      )}

      {noteHits.length > 0 && (
        <>
          <div className="card-title">Заметки</div>
          <div style={{ marginBottom: 16 }}>
            {noteHits.map((n, i) => (
              <div
                key={i}
                className="tx-row"
                onClick={() => {
                  onClose()
                  app.openTab('notes', n.title)
                }}
              >
                <Icon name="note" size={16} />
                <div className="tx-main">
                  <div className="tx-title">{n.title}</div>
                  <div className="tx-sub">{n.line}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {txHits.length > 0 && (
        <>
          <div className="card-title">Операции</div>
          {txHits.map((t) => {
            const c = t.categoryId ? catById.get(t.categoryId) : undefined
            return (
              <div
                key={t.id}
                className="tx-row"
                onClick={() => {
                  onClose()
                  app.editTransaction(t)
                }}
              >
                <Avatar icon={c?.icon} color={c?.color} size="sm" />
                <div className="tx-main">
                  <div className="tx-title">{t.note || c?.name || 'Операция'}</div>
                  <div className="tx-sub">
                    {humanDate(t.date)} · {c?.name ?? 'без категории'} {t.tags.map((x) => '#' + x).join(' ')}
                  </div>
                </div>
                <div className={'num ' + (t.kind === 'income' ? 'pos' : '')}>
                  {t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : ''}
                  {money(t.amount)}
                </div>
              </div>
            )
          })}
        </>
      )}

      {needle.length >= 2 && !txHits.length && !noteHits.length && !catHits.length && (
        <div className="empty">Ничего не нашлось</div>
      )}
    </Modal>
  )
}
