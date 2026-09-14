import React, { useMemo, useState } from 'react'
import { DateField } from '../components/DateField'
import { сЗначкомъ } from '../lib/catalog'
import { Amount, useAnimatedList } from '../components/anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, plural, toMinor } from '../lib/format'
import { addMonths, humanDate, relDate, today } from '../lib/date'
import { bridge } from '../state/vault'
import { toCsv } from '../engine/csv'
import { Avatar, Confirm, useToast } from '../components/ui'
import type { Transaction } from '../lib/types'
import { т, тр } from '../i18n'

export default function Transactions({ filter }: { filter?: string }) {
  const app = useApp()
  const { data, deleteTransactions, restoreTransactions } = useStore()
  const toast = useToast()

  const initialCat = filter?.startsWith('cat:') ? filter.slice(4) : ''
  // Календарь открывает конкретный день — период сразу сжимается до него.
  const initialDay = filter?.startsWith('day:') ? filter.slice(4) : ''
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'expense' | 'income' | 'transfer'>('all')
  const [catId, setCatId] = useState(initialCat)
  const [accId, setAccId] = useState('')
  const [tag, setTag] = useState('')
  const [from, setFrom] = useState(initialDay || addMonths(today(), -3))
  const [to, setTo] = useState(initialDay || today())
  const [onlyUncat, setOnlyUncat] = useState(filter === 'uncategorized')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  // Последний удалённый пакет держим в памяти сеанса — чтобы промах не стоил истории.
  const [undoBuffer, setUndoBuffer] = useState<Transaction[]>([])
  const dayRefs = useAnimatedList<HTMLDivElement>()

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const accById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])
  const allTags = useMemo(() => [...new Set(data.transactions.flatMap((t) => t.tags))].sort(), [data.transactions])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return data.transactions
      .filter((t) => {
        if (t.date < from || t.date > to) return false
        if (kind !== 'all' && t.kind !== kind) return false
        if (catId && t.categoryId !== catId && !t.splits?.some((s) => s.categoryId === catId)) return false
        if (accId && t.accountId !== accId && t.toAccountId !== accId) return false
        if (tag && !t.tags.includes(tag)) return false
        if (onlyUncat && (t.categoryId || t.splits?.length || t.kind === 'transfer')) return false
        if (needle) {
          const hay = `${t.note || ''} ${t.tags.join(' ')} ${catById.get(t.categoryId || '')?.name || ''}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1))
  }, [data.transactions, q, kind, catId, accId, tag, from, to, onlyUncat, catById])

  const sum = rows.reduce((s, t) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0)
  const totalExpense = rows.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
  const totalIncome = rows.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)

  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of rows) {
      const arr = map.get(t.date) || []
      arr.push(t)
      map.set(t.date, arr)
    }
    return [...map.entries()]
  }, [rows])

  const exportCsv = async () => {
    const out = toCsv([
      [т('Дата'), т('Тип'), т('Сумма'), т('Категория'), т('Счёт'), т('Теги'), т('Комментарий')],
      ...rows.map((t) => [
        t.date,
        t.kind === 'income' ? т('доход') : t.kind === 'expense' ? т('расход') : т('перевод'),
        (t.amount / 100).toFixed(2).replace('.', ','),
        catById.get(t.categoryId || '')?.name ?? '',
        accById.get(t.accountId)?.name ?? '',
        t.tags.join(' '),
        t.note ?? '',
      ]),
    ])
    const p = await bridge.saveText(т('операции.csv'), out)
    if (p) toast(т('Выгружено: ') + p)
  }

  // Выделение работает по текущему фильтру: «выделить все» — это все строки,
  // которые сейчас видны, а не вся история целиком.
  const allSelected = rows.length > 0 && rows.every((t) => sel.has(t.id))
  const toggleAll = () =>
    setSel(allSelected ? new Set() : new Set(rows.map((t) => t.id)))

  const toggleDay = (list: Transaction[]) => {
    const on = list.every((t) => sel.has(t.id))
    const next = new Set(sel)
    for (const t of list) (on ? next.delete(t.id) : next.add(t.id))
    setSel(next)
  }

  const selected = useMemo(() => rows.filter((t) => sel.has(t.id)), [rows, sel])
  const selExpense = selected.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
  const selIncome = selected.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)

  const bulkDelete = () => {
    const doomed = [...selected]
    deleteTransactions(doomed.map((t) => t.id))
    setUndoBuffer(doomed)
    setSel(new Set())
    toast(т('Удалено операций: {0}', doomed.length), {
      label: т('Вернуть'),
      onClick: () => {
        restoreTransactions(doomed)
        setUndoBuffer([])
      },
    })
  }

  const undo = () => {
    restoreTransactions(undoBuffer)
    toast(т('Возвращено операций: {0}', undoBuffer.length))
    setUndoBuffer([])
  }

  return (
    <div className="view wide">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Операции')}</h1>
          <div className="view-sub">
            {тр('{0} {1} · доход ', rows.length, plural(rows.length, 'запись', 'записи', 'записей'))}<b className="amount in">{money(totalIncome)}</b> {т(' · расход ')}<b className="amount out">{money(totalExpense)}</b> {т(' · итог ')}<span className={sum >= 0 ? 'pos' : 'neg'}>{money(sum, { sign: true })}</span>
          </div>
        </div>
        <div className="row">
          {undoBuffer.length > 0 && (
            <button className="btn" onClick={undo} title={т('Вернуть последний удалённый пакет')}>
              <Icon name="repeat" size={15} /> {тр(' Вернуть {0}', undoBuffer.length)}</button>
          )}
          {sel.size > 0 && (
            <button className="btn danger" onClick={() => setConfirmBulk(true)}>
              <Icon name="trash" size={15} /> {тр(' Удалить {0}', sel.size)}</button>
          )}
          <button className="btn" onClick={exportCsv}>
            <Icon name="upload" size={15} /> {т(' Экспорт CSV')}</button>
          <button className="btn primary" onClick={() => app.editTransaction({})}>
            <Icon name="plus" size={15} /> {т(' Добавить')}</button>
        </div>
      </div>

      <div className="card tight" style={{ marginBottom: 14 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <input
            type="search"
            placeholder={т('Поиск по комментарию, тегу, категории')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
          />
          <div className="seg">
            {([
              ['all', т('Все')],
              ['expense', т('Расходы')],
              ['income', т('Доходы')],
              ['transfer', т('Переводы')],
            ] as const).map(([k, t]) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{t}</button>
            ))}
          </div>
          <select value={catId} onChange={(e) => setCatId(e.target.value)} style={{ width: 170 }}>
            <option value="">{т('Все категории')}</option>
            {data.categories.filter((c) => !c.archived).map((c) => (
              <option key={c.id} value={c.id}>{сЗначкомъ(c.icon, c.name)}</option>
            ))}
          </select>
          <select value={accId} onChange={(e) => setAccId(e.target.value)} style={{ width: 150 }}>
            <option value="">{т('Все счета')}</option>
            {data.accounts.filter((a) => !a.archived).map((a) => (
              <option key={a.id} value={a.id}>{сЗначкомъ(a.icon, a.name)}</option>
            ))}
          </select>
          <DateField allowEmpty value={from} onChange={setFrom} style={{ width: 145 }} placeholder={т('с какого')} />
          <DateField allowEmpty value={to} onChange={setTo} style={{ width: 145 }} placeholder={т('по какое')} />
          <button className={'chip' + (onlyUncat ? ' on' : '')} onClick={() => setOnlyUncat((v) => !v)}>
            {т('без категории')}</button>
          {(catId || accId || tag || q || onlyUncat) && (
            <button
              className="btn sm ghost"
              onClick={() => {
                setCatId('')
                setAccId('')
                setTag('')
                setQ('')
                setOnlyUncat(false)
              }}
            >
              {т('Сбросить')}</button>
          )}
        </div>
        {allTags.length > 0 && (
          <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
            {allTags.slice(0, 18).map((t) => (
              <span key={t} className={'chip' + (tag === t ? ' on' : '')} onClick={() => setTag(tag === t ? '' : t)}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="row wrap" style={{ gap: 10, padding: '0 4px 10px' }}>
          <label className="row" style={{ gap: 7, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = sel.size > 0 && !allSelected
              }}
              onChange={toggleAll}
              style={{ width: 15, height: 15 }}
            />
            <span>{allSelected ? т('Снять выделение') : т('Выделить все ({0})', rows.length)}</span>
          </label>
          {sel.size > 0 && (
            <>
              <span className="faint">·</span>
              <span className="small">
                {тр('выбрано {0}{1}{2}', sel.size, selExpense > 0 && <> {т(' · расходы ')}<b className="amount out">{money(selExpense)}</b></>, selIncome > 0 && <> {т(' · доходы ')}<b className="amount in">{money(selIncome)}</b></>)}</span>
              <button className="btn sm danger" onClick={() => setConfirmBulk(true)}>
                <Icon name="trash" size={13} /> {т(' Удалить выбранные')}</button>
            </>
          )}
          <span className="spacer" />
          <span className="faint small">
            {т('выделение действует на текущий фильтр — сузьте его, чтобы удалить только часть')}</span>
        </div>
      )}

      {grouped.length === 0 && <div className="empty">{т('Ничего не найдено — попробуйте расширить период')}</div>}

      {grouped.map(([date, list]) => {
        const dayExpense = list.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
        const dayIncome = list.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
        return (
          <div key={date} style={{ marginBottom: 10 }}>
            <div className="row" style={{ padding: '6px 10px' }}>
              <input
                type="checkbox"
                title={т('Выделить весь день')}
                checked={list.every((t) => sel.has(t.id))}
                onChange={() => toggleDay(list)}
                style={{ width: 15, height: 15, flex: 'none' }}
              />
              <span className="strong">{relDate(date)}</span>
              <span className="faint small">{humanDate(date, true)}</span>
              <span className="spacer" />
              {dayIncome > 0 && <Amount value={dayIncome} kind="income" className="small" />}
              {dayExpense > 0 && <Amount value={dayExpense} kind="expense" className="small" />}
            </div>
            <div className="card" style={{ padding: 'calc(6px * var(--dens))' }} ref={dayRefs}>
              {list.map((t) => {
                const c = t.categoryId ? catById.get(t.categoryId) : undefined
                const acc = accById.get(t.accountId)
                const to2 = t.toAccountId ? accById.get(t.toAccountId) : undefined
                return (
                  <div key={t.id} className={'tx-row ' + (t.kind === 'income' ? 'in' : t.kind === 'transfer' ? 'move' : 'out')}>
                    <input
                      type="checkbox"
                      checked={sel.has(t.id)}
                      onChange={(e) => {
                        const next = new Set(sel)
                        e.target.checked ? next.add(t.id) : next.delete(t.id)
                        setSel(next)
                      }}
                      style={{ width: 15, height: 15, flex: 'none' }}
                    />
                    <span onClick={() => app.editTransaction(t)}>
                      <Avatar icon={t.kind === 'transfer' ? 'arrow-left-right' : c?.icon} color={c?.color} />
                    </span>
                    <div className="tx-main" onClick={() => app.editTransaction(t)}>
                      <div className="tx-title">
                        {t.note || c?.name || (t.kind === 'transfer' ? т('Перевод') : т('Операция'))}
                        {t.splits?.length ? <span className="badge" style={{ marginLeft: 7 }}>{тр('разбит на {0}', t.splits.length)}</span> : null}
                        {t.recurringId ? <span className="badge" style={{ marginLeft: 7 }}>{т('регулярный')}</span> : null}
                      </div>
                      <div className="tx-sub">
                        {t.kind === 'transfer' ? `${acc?.name} → ${to2?.name}` : `${c?.name ?? т('без категории')} · ${acc?.name}`}
                        {t.tags.length ? ' · ' + t.tags.map((x) => '#' + x).join(' ') : ''}
                      </div>
                    </div>
                    <Amount value={t.amount} kind={t.kind} onClick={() => app.editTransaction(t)} />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {confirmBulk && (
        <Confirm
          title={т('Удалить {0} {1}?', sel.size, plural(sel.size, 'операцию', 'операции', 'операций'))}
          confirmLabel={т('Удалить {0}', sel.size)}
          text={
            т('Уйдут все выбранные записи') +
            (selected.length
              ? т(' за {0} — {1}', humanDate(selected[selected.length - 1].date, true), humanDate(selected[0].date, true))
              : '') +
            т(': расходы на {0}, доходы на {1}. ', money(selExpense), money(selIncome)) +
            т('Это изменит остатки по счетам, историю категорий и прогноз. ') +
            т('Сразу после удаления в шапке появится кнопка «Вернуть» — она действует до закрытия программы; ') +
            т('если данные важны, надёжнее сначала выгрузить их в CSV.')
          }
          onConfirm={bulkDelete}
          onClose={() => setConfirmBulk(false)}
        />
      )}
    </div>
  )
}
