import React, { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { Avatar, GroupedInput, Modal, useToast } from './ui'
import { describeDraft, parseQuick } from '../engine/parse'
import { addMonths, relDate, today } from '../lib/date'
import { groupDigits, money } from '../lib/format'
import { Icon } from '../lib/icons'
import type { Transaction, TxKind } from '../lib/types'

/** Однострочный ввод: «кофе 250 кафе вчера #работа @наличные». */
export function QuickAdd({
  initial,
  kind: initialKind,
  date,
  onClose,
}: {
  initial: string
  kind?: TxKind
  /** Дата открытого периода. Пусто — значит сегодня. */
  date?: string
  onClose: () => void
}) {
  const { data, addTransaction, patchSettings } = useStore()
  const app = useApp()
  const toast = useToast()
  const [text, setText] = useState(() => groupDigits(initial))
  // Вид можно указать словом или знаком, но полагаться на угадывание нельзя:
  // если явно нажали кнопку, её выбор главнее любого разбора строки.
  const [picked, setPicked] = useState<TxKind | null>(initialKind ?? null)
  // Категория, выбранная плиткой. Как и вид операции, она главнее разбора
  // строки: нажали руками — значит, это и есть ответ.
  const [pickedCat, setPickedCat] = useState<string | undefined>()
  const [allCats, setAllCats] = useState(false)

  const defaultAccount = data.accounts.find((a) => a.type === 'card') ?? data.accounts[0]
  const draft = useMemo(
    () =>
      parseQuick(text, data.categories, data.accounts, {
        accountId: defaultAccount?.id,
        kind: picked ?? initialKind,
        date,
      }),
    [text, data.categories, data.accounts, defaultAccount?.id, picked, initialKind, date],
  )
  const kind = picked ?? draft.kind
  const categoryId = pickedCat ?? draft.categoryId
  const ok = draft.amount > 0 && !!draft.accountId

  const catName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? ''
  const pinned = data.settings.pinnedCategories
  const isPinned = (id: string) => pinned.includes(id)
  const togglePin = (id: string) =>
    patchSettings({ pinnedCategories: isPinned(id) ? pinned.filter((x) => x !== id) : [...pinned, id] })

  /**
   * Что показывать плитками: сначала закреплённые, потом просто частые за
   * последние три месяца. Частота считается по операциям, а не по алфавиту —
   * иначе список не экономит ни одного нажатия.
   */
  const tiles = useMemo(() => {
    if (kind === 'transfer') return []
    const wanted = kind === 'income' ? 'income' : 'expense'
    const pool = data.categories.filter((c) => !c.archived && c.kind === wanted)
    if (allCats) return pool

    const since = addMonths(today(), -3)
    const uses = new Map<string, number>()
    for (const t of data.transactions) {
      if (t.date < since || t.kind !== wanted || !t.categoryId) continue
      uses.set(t.categoryId, (uses.get(t.categoryId) || 0) + 1)
    }
    const byId = new Map(pool.map((c) => [c.id, c]))
    const head = pinned.map((id) => byId.get(id)).filter(Boolean) as typeof pool
    // При равной частоте держим порядок списка категорий: у нового хранилища
    // истории ещё нет, и алфавит задвинул бы «Продукты» за «Другое».
    const order = new Map(pool.map((c, i) => [c.id, i]))
    const rest = pool
      .filter((c) => !isPinned(c.id))
      .sort((a, b) => (uses.get(b.id) || 0) - (uses.get(a.id) || 0) || order.get(a.id)! - order.get(b.id)!)
    return [...head, ...rest].slice(0, 7)
  }, [data.categories, data.transactions, kind, allCats, pinned])

  const submit = () => {
    if (!defaultAccount) {
      toast('Сначала создайте счёт — в разделе «Счета»')
      return
    }
    if (!ok) {
      toast('Не хватает суммы — напишите число в строке')
      return
    }
    addTransaction({
      kind,
      date: draft.date,
      amount: draft.amount,
      accountId: draft.accountId!,
      categoryId,
      tags: draft.tags,
      note: draft.note || undefined,
    } as Omit<Transaction, 'id' | 'createdAt'>)
    toast(`${kind === 'income' ? 'Доход' : kind === 'transfer' ? 'Перевод' : 'Расход'} ${money(draft.amount)} записан`)
    onClose()
  }

  const examples = [
    'кофе 250 кафе',
    'продукты 2340 вчера',
    '+45000 навар проект #работа',
    'такси 480 @наличные 12.08',
  ]

  return (
    <Modal
      title="Быстрый ввод"
      icon="plus"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              onClose()
              app.editTransaction({
                kind,
                amount: draft.amount,
                date: draft.date,
                accountId: draft.accountId,
                categoryId,
                tags: draft.tags,
                note: draft.note,
              })
            }}
          >
            Подробно…
          </button>
          <button className="btn primary" onClick={submit} disabled={!ok}>
            Записать <kbd style={{ marginLeft: 4 }}>Enter</kbd>
          </button>
        </>
      }
    >
      {!defaultAccount && (
        <div className="advice-card warn" style={{ marginBottom: 12, padding: '10px 12px' }}>
          Пока нет ни одного счёта, записывать операции некуда.{' '}
          <button
            className="btn sm"
            style={{ marginLeft: 6 }}
            onClick={() => {
              onClose()
              app.openTab('accounts')
            }}
          >
            Создать счёт
          </button>
        </div>
      )}
      <div className="seg" style={{ marginBottom: 12 }}>
        {(['expense', 'income', 'transfer'] as TxKind[]).map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setPicked(k)}>
            {k === 'expense' ? 'Расход' : k === 'income' ? 'Доход' : 'Перевод'}
          </button>
        ))}
      </div>
      <GroupedInput
        type="text"
        autoFocus
        value={text}
        placeholder="кофе 250 кафе вчера #работа"
        format={groupDigits}
        onChangeText={setText}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{ fontSize: 18, padding: '10px 14px' }}
      />
      {tiles.length > 0 && (
        <div className="qa-tiles">
          {tiles.map((c) => (
            <div key={c.id} className={'qa-tile' + (categoryId === c.id ? ' on' : '')}>
              <button
                className="qa-tile-btn"
                title={c.name}
                onClick={() => setPickedCat(categoryId === c.id ? undefined : c.id)}
              >
                <Avatar icon={c.icon} color={c.color} />
                <span className="qa-tile-name">{c.name}</span>
              </button>
              {allCats && (
                <button
                  className={'qa-pin' + (isPinned(c.id) ? ' on' : '')}
                  title={isPinned(c.id) ? 'Убрать из частых' : 'Закрепить в частых'}
                  onClick={() => togglePin(c.id)}
                >
                  <Icon name={isPinned(c.id) ? 'check' : 'plus'} size={11} />
                </button>
              )}
            </div>
          ))}
          {kind !== 'transfer' && (
            <div className="qa-tile">
              <button className="qa-tile-btn" onClick={() => setAllCats((v) => !v)} title={allCats ? 'Свернуть' : 'Показать все и закрепить нужные'}>
                <span className="avatar" style={{ background: 'var(--panel-2)', color: 'var(--muted)' }}>
                  <Icon name={allCats ? 'up' : 'dots'} size={15} />
                </span>
                <span className="qa-tile-name">{allCats ? 'Свернуть' : 'Ещё'}</span>
              </button>
            </div>
          )}
        </div>
      )}
      {allCats && (
        <div className="faint small" style={{ marginTop: -4, marginBottom: 10 }}>
          Кружок с плюсом закрепляет категорию в частых, с галочкой — убирает.
        </div>
      )}
      <div className="row" style={{ marginTop: 10, gap: 8, minHeight: 22 }}>
        <Icon name={ok ? 'check' : 'warn'} size={15} style={{ color: ok ? 'var(--good)' : 'var(--faint)' }} />
        <span className={ok ? '' : 'faint'}>
          {text.trim()
            ? describeDraft(
                // Выбранную плитку показываем в подсказке так же, как угаданную
                // из текста: иначе непонятно, куда уйдёт операция.
                { ...draft, kind, categoryId, matchedCategory: pickedCat ? catName(pickedCat) : draft.matchedCategory },
                data.categories,
                data.accounts,
              )
            : date
              ? 'Запись уйдёт на ' + relDate(date) + ' — пишите как удобно'
              : 'Пишите как удобно — сумма, категория, дата и теги разберутся сами'}
        </span>
      </div>
      <div className="card-title" style={{ marginTop: 20 }}>Примеры</div>
      <div className="row wrap" style={{ gap: 6 }}>
        {examples.map((e) => (
          <span key={e} className="chip" onClick={() => setText(groupDigits(e))}>{e}</span>
        ))}
      </div>
      <div className="faint small" style={{ marginTop: 14, lineHeight: 1.6 }}>
        <b>#тег</b> — метка · <b>@счёт</b> — откуда деньги · <b>вчера / 12.08</b> — дата ·
        <b> + в начале</b> или слова «зарплата», «навар» — доход
      </div>
    </Modal>
  )
}
