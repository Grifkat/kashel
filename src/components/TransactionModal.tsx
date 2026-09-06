import React, { useEffect, useMemo, useState } from 'react'
import type { Money, Split, Transaction, TxKind } from '../lib/types'
import { useStore } from '../state/store'
import { PALETTE } from '../lib/emoji'
import { Avatar, Modal, Field, GroupedInput, MoneyInput, TagInput, useToast, Confirm } from './ui'
import { Icon } from '../lib/icons'
import { addDays, humanDate, today } from '../lib/date'
import { formatAmountInput, groupDigits, money, toMinor, uid } from '../lib/format'
import { readAttachmentBase64, saveAttachment, bridge } from '../state/vault'

const KIND_LABEL: Record<TxKind, string> = {
  expense: 'Расход',
  income: 'Доход',
  transfer: 'Перевод',
}

export function TransactionModal({
  draft,
  onClose,
}: {
  draft: Transaction | Partial<Transaction>
  onClose: () => void
}) {
  const { data, addTransaction, updateTransaction, deleteTransaction, upsertCategory } = useStore()
  const toast = useToast()
  const isEdit = !!(draft as Transaction).id

  const [kind, setKind] = useState<TxKind>(draft.kind ?? 'expense')
  const [amountStr, setAmountStr] = useState(
    draft.amount ? formatAmountInput(String((draft.amount / 100).toFixed(2)).replace(/\.00$/, '').replace('.', ',')) : '',
  )
  const [accountId, setAccountId] = useState(draft.accountId ?? data.accounts.find((a) => a.type === 'card')?.id ?? data.accounts[0]?.id ?? '')
  const [toAccountId, setToAccountId] = useState(draft.toAccountId ?? data.accounts.find((a) => a.type === 'savings')?.id ?? '')
  const [categoryId, setCategoryId] = useState(draft.categoryId)
  const [date, setDate] = useState(draft.date ?? today())
  const [tags, setTags] = useState<string[]>(draft.tags ?? [])
  const [note, setNote] = useState(draft.note ?? '')
  const [splits, setSplits] = useState<Split[]>(draft.splits ?? [])
  const [attachments, setAttachments] = useState<string[]>(draft.attachments ?? [])
  const [showAll, setShowAll] = useState(false)
  /** Название новой статьи. null — окошко закрыто. */
  const [новая, setНовая] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  /** Какой чек сейчас смотрим. null — не смотрим. */
  const [shot, setShot] = useState<string | null>(null)

  /**
   * Заводит статью и сразу ставит её в эту запись.
   *
   * Цвет берётся из общей палитры по числу уже заведённых — так две подряд
   * созданные статьи не окажутся одного цвета, а разбираться с выбором в
   * момент ввода траты человеку незачем.
   */
  const создатьСтатью = () => {
    const имя = (новая ?? '').trim()
    if (!имя) { toast('Напишите название'); return }
    const вид = kind === 'income' ? 'income' : 'expense'
    const было = data.categories.find((c) => c.kind === вид && c.name.toLowerCase() === имя.toLowerCase())
    if (было) {
      setCategoryId(было.id)
      setНовая(null)
      toast(`Такая статья уже была — выбрал «${было.name}»`)
      return
    }
    const id = uid('cat')
    upsertCategory({
      id, name: имя, kind: вид, icon: '⭐',
      color: PALETTE[data.categories.length % PALETTE.length],
      ...(вид === 'expense' ? { bucket: 'wants' as const } : {}),
    })
    setCategoryId(id)
    setНовая(null)
    setShowAll(true)
  }

  const amount = toMinor(amountStr || '0')
  const cats = useMemo(
    () => data.categories.filter((c) => !c.archived && c.kind === (kind === 'income' ? 'income' : 'expense')),
    [data.categories, kind],
  )
  /*
   * Свёрнутый список — самые ходовые статьи, а не первые одиннадцать подряд.
   * Раньше при нажатии «Скрыть» пропадало ровно то, чем человек пользуется:
   * порядок в списке никак не связан с тем, что ему нужно каждый день.
   */
  const частота = useMemo(() => {
    const м = new Map<string, number>()
    for (const t of data.transactions) if (t.categoryId) м.set(t.categoryId, (м.get(t.categoryId) ?? 0) + 1)
    return м
  }, [data.transactions])
  const ходовые = useMemo(
    () => [...cats].sort((a, b) => (частота.get(b.id) ?? 0) - (частота.get(a.id) ?? 0)).slice(0, 11),
    [cats, частота],
  )
  const shown = showAll ? cats : ходовые
  const allTags = useMemo(
    () => [...new Set(data.transactions.flatMap((t) => t.tags))].sort(),
    [data.transactions],
  )
  const lastDate = useMemo(() => {
    const sorted = [...data.transactions].sort((a, b) => (a.date < b.date ? 1 : -1))
    return sorted.find((t) => t.date < today())?.date ?? addDays(today(), -2)
  }, [data.transactions])

  /**
   * Категория живёт в своём направлении: при переключении вида выбранная
   * расходная категория не должна остаться висеть на доходной операции —
   * иначе доход утекает в расходную статистику.
   */
  const switchKind = (next: TxKind) => {
    setKind(next)
    if (next === 'transfer') return
    const cat = data.categories.find((c) => c.id === categoryId)
    if (cat && cat.kind !== next) setCategoryId(undefined)
    if (splits.length) setSplits([])
  }

  const splitSum = splits.reduce((s, x) => s + x.amount, 0)
  const splitOk = !splits.length || splitSum === amount

  const save = () => {
    if (!accountId) {
      toast('Сначала создайте счёт — в разделе «Счета»')
      return
    }
    if (!amount) {
      toast('Укажите сумму')
      return
    }
    if (kind === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      toast('Выберите разные счёта для перевода')
      return
    }
    if (!splitOk) {
      toast(`Сумма долей ${money(splitSum)} не совпадает с ${money(amount)}`)
      return
    }
    // Последняя проверка перед записью: категория чужого направления не пройдёт.
    const cat = data.categories.find((c) => c.id === categoryId)
    const safeCategory = kind !== 'transfer' && cat && cat.kind === kind ? categoryId : undefined

    const payload = {
      kind,
      date,
      amount,
      accountId,
      toAccountId: kind === 'transfer' ? toAccountId : undefined,
      categoryId: safeCategory,
      splits: splits.length ? splits : undefined,
      tags,
      note: note.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
    }
    if (isEdit) {
      updateTransaction({ ...(draft as Transaction), ...payload })
      toast('Операция обновлена')
    } else {
      addTransaction({ ...payload } as Omit<Transaction, 'id' | 'createdAt'>)
      toast(`${KIND_LABEL[kind]} ${money(amount)} записан`)
    }
    onClose()
  }

  const attach = async () => {
    const img = await bridge.openImage()
    if (!img) return
    const rel = await saveAttachment(img.name, img.base64)
    setAttachments((a) => [...a, rel])
  }

  return (
    <>
      <Modal
        wide
        title={isEdit ? 'Операция' : 'Новая операция'}
        icon="plus"
        onClose={onClose}
        footer={
          <>
            {isEdit && (
              <button className="btn danger" onClick={() => setConfirmDel(true)} style={{ marginRight: 'auto' }}>
                <Icon name="trash" size={15} /> Удалить
              </button>
            )}
            <button className="btn" onClick={onClose}>Отмена</button>
            <button className="btn primary" onClick={save}>
              {isEdit ? 'Сохранить' : 'Добавить'}
            </button>
          </>
        }
      >
        {!data.accounts.length && (
          <div className="advice-card warn" style={{ marginBottom: 14, padding: '10px 12px' }}>
            Нет ни одного счёта. Создайте его в разделе «Счета» — без счёта операции
            некуда записывать.
          </div>
        )}
        <div className="seg" style={{ marginBottom: 16 }}>
          {(['expense', 'income', 'transfer'] as TxKind[]).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => switchKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 14, alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label className="field">
              <span>Сумма</span>
              {/* Поле умеет складывать, поэтому разряды расставляем как в
                  свободной строке: знаки арифметики должны уцелеть. */}
              <GroupedInput
                type="text"
                inputMode="decimal"
                value={amountStr}
                autoFocus
                placeholder="0"
                format={(raw) => groupDigits(raw.replace(/[^\d.,\s+\-*/]/g, ''))}
                onChangeText={setAmountStr}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save()
                  // Маленький калькулятор: «450+120» считается по Tab или =
                  if ((e.key === '=' || e.key === 'Tab') && /[+\-*/]/.test(amountStr)) {
                    try {
                      const v = Function(`"use strict";return (${amountStr.replace(/,/g, '.').replace(/\s/g, '')})`)()
                      if (Number.isFinite(v)) {
                        e.preventDefault()
                        setAmountStr(formatAmountInput(String(Math.round(v * 100) / 100).replace('.', ',')))
                      }
                    } catch { /* оставляем как есть */ }
                  }
                }}
                style={{ fontSize: 26, fontWeight: 600, padding: '8px 12px' }}
              />
            </label>
            {/[+\-*/]/.test(amountStr) && (
              <div className="faint small" style={{ marginTop: 4 }}>Нажмите = чтобы посчитать</div>
            )}
          </div>
          <div style={{ width: 190 }}>
            <Field label={kind === 'transfer' ? 'Со счёта' : 'Счёт'}>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {data.accounts.filter((a) => !a.archived).map((a) => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                ))}
              </select>
            </Field>
          </div>
          {kind === 'transfer' && (
            <div style={{ width: 190 }}>
              <Field label="На счёт">
                <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                  <option value="">—</option>
                  {data.accounts.filter((a) => !a.archived && a.id !== accountId).map((a) => (
                    <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        {kind !== 'transfer' && (
          <>
            <div className="card-title">Категория</div>
            <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
              {shown.map((c) => (
                <button
                  key={c.id}
                  className="btn"
                  onClick={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
                  style={{
                    flexDirection: 'column',
                    width: 84,
                    minHeight: 84,
                    height: 'auto',
                    gap: 6,
                    padding: '8px 4px',
                    borderColor: categoryId === c.id ? c.color : 'var(--border)',
                    background: categoryId === c.id ? `color-mix(in srgb, ${c.color} 16%, var(--panel))` : undefined,
                  }}
                >
                  <Avatar icon={c.icon} color={c.color} />
                  {/* Длинное название переносится по словам: «Благотворительность»
                      прежде обрезалась на полуслове. */}
                  <span style={{
                    fontSize: 11.5, textAlign: 'center', lineHeight: 1.15,
                    overflowWrap: 'anywhere', hyphens: 'auto',
                  }}>{c.name}</span>
                </button>
              ))}
              {cats.length > 11 && (
                <button className="btn" onClick={() => setShowAll((v) => !v)} style={{ flexDirection: 'column', width: 84, minHeight: 84, height: 'auto', gap: 6, padding: '8px 4px' }}>
                  <span className="avatar" style={{ background: 'var(--panel-2)' }}>
                    <Icon name={showAll ? 'up' : 'dots'} size={16} />
                  </span>
                  <span style={{ fontSize: 11.5 }}>{showAll ? 'Скрыть' : 'Ещё'}</span>
                </button>
              )}
              {/* Новая статья заводится прямо отсюда и сразу встаёт в запись:
                  уходить в другой раздел ради одного названия — терять мысль. */}
              <button
                className="btn"
                onClick={() => setНовая('')}
                style={{ flexDirection: 'column', width: 84, minHeight: 84, height: 'auto', gap: 6, padding: '8px 4px' }}
              >
                <span className="avatar" style={{ background: 'var(--panel-2)' }}>
                  <Icon name="plus" size={16} />
                </span>
                <span style={{ fontSize: 11.5 }}>Создать</span>
              </button>
            </div>
          </>
        )}

        <div className="card-title">Дата</div>
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          {[
            { d: today(), l: 'сегодня' },
            { d: addDays(today(), -1), l: 'вчера' },
            { d: lastDate, l: 'последняя' },
          ].map((x) => (
            <button key={x.l} className={'chip' + (date === x.d ? ' on' : '')} onClick={() => setDate(x.d)}>
              {humanDate(x.d, false)} · {x.l}
            </button>
          ))}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
        </div>

        <div className="grid c2">
          <div>
            <div className="card-title">Теги</div>
            <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
          </div>
          <div>
            <div className="card-title">Комментарий</div>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Где, за что, зачем" />
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn sm" onClick={attach}>
                <Icon name="upload" size={14} /> Фото чека
              </button>
              {/* Раньше на фишке было ровно одно действие — удалить, и оно же
                  срабатывало на любое нажатие. Посмотреть чек было нельзя
                  вообще: единственный способ его открыть — полезть в папку
                  хранилища. Теперь нажатие показывает, а крестик убирает. */}
              {attachments.map((a) => (
                <span key={a} className="chip on" style={{ gap: 6 }}>
                  <span style={{ cursor: 'zoom-in' }} onClick={() => setShot(a)} title="Посмотреть чек">
                    {a.split('_').pop()}
                  </span>
                  <span
                    style={{ cursor: 'pointer', opacity: 0.7 }}
                    title="Убрать из операции"
                    onClick={() => setAttachments((l) => l.filter((x) => x !== a))}
                  >
                    <Icon name="x" size={11} />
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {kind === 'expense' && (
          <div style={{ marginTop: 18 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="card-title" style={{ margin: 0 }}>Разбить чек по категориям</div>
              <span className="spacer" />
              <button
                className="btn sm"
                onClick={() =>
                  setSplits((s) => [...s, { categoryId: categoryId ?? cats[0]?.id ?? '', amount: Math.max(0, amount - splitSum) }])
                }
              >
                <Icon name="split" size={14} /> Добавить долю
              </button>
            </div>
            {splits.map((s, i) => (
              <div key={i} className="row" style={{ gap: 8, marginBottom: 7 }}>
                <select
                  value={s.categoryId}
                  onChange={(e) => setSplits((l) => l.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}
                  style={{ width: 200 }}
                >
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
                <MoneyInput
                  value={s.amount}
                  onChange={(v) => setSplits((l) => l.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
                  style={{ width: 120 }}
                />
                <input
                  type="text"
                  placeholder="комментарий"
                  value={s.note ?? ''}
                  onChange={(e) => setSplits((l) => l.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                />
                <button className="icon-btn" onClick={() => setSplits((l) => l.filter((_, j) => j !== i))}>
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
            {splits.length > 0 && (
              <div className={'small ' + (splitOk ? 'faint' : 'neg')}>
                Доли: {money(splitSum)} из {money(amount)}
                {!splitOk && ` — расхождение ${money(Math.abs(amount - splitSum))}`}
              </div>
            )}
          </div>
        )}
      </Modal>

      {новая !== null && (
        <Modal
          title="Новая статья"
          icon="tag"
          onClose={() => setНовая(null)}
          footer={
            <>
              <button className="btn" onClick={() => setНовая(null)}>Отмена</button>
              <button className="btn primary" onClick={() => создатьСтатью()}>Создать и выбрать</button>
            </>
          }
        >
          <Field label="Название" hint="Появится в списке и сразу встанет в эту запись">
            <input
              type="text"
              autoFocus
              value={новая}
              placeholder={kind === 'income' ? 'Например, Подработка' : 'Например, Аптека'}
              onChange={(e) => setНовая(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); создатьСтатью() } }}
            />
          </Field>
          <div className="faint small">
            Статья заводится {kind === 'income' ? 'доходной' : 'расходной'} — по виду этой записи.
            Значок и цвет можно поменять потом в разделе «Категории».
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm
          title="Удалить операцию?"
          text={`${KIND_LABEL[kind]} на ${money(amount)} от ${humanDate(date)} будет удалён без возможности отмены.`}
          onConfirm={() => {
            deleteTransaction((draft as Transaction).id)
            onClose()
          }}
          onClose={() => setConfirmDel(false)}
        />
      )}
      {shot && <ShotViewer rel={shot} onClose={() => setShot(null)} />}
    </>
  )
}

/**
 * Просмотр приложенного чека.
 *
 * Файл лежит в хранилище, а не в интернете, поэтому показать его можно
 * только прочитав в data-url. Тип угадываем по расширению: png и webp не
 * покажутся, если объявить их jpeg.
 */
function ShotViewer({ rel, onClose }: { rel: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let живо = true
    void readAttachmentBase64(rel)
      .then((b64) => {
        if (!живо) return
        if (!b64) { setErr('Файл не найден в хранилище — возможно, его удалили из папки.'); return }
        const ext = (rel.split('.').pop() || '').toLowerCase()
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
        setUrl('data:' + mime + ';base64,' + b64)
      })
      .catch((e) => живо && setErr(e instanceof Error ? e.message : String(e)))
    return () => { живо = false }
  }, [rel])

  return (
    <Modal
      wide
      title="Чек"
      icon="upload"
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Закрыть</button>}
    >
      <div className="faint small" style={{ marginBottom: 10, wordBreak: 'break-all' }}>{rel}</div>
      {err && <div className="advice-card warn" style={{ padding: '10px 12px' }}>{err}</div>}
      {!err && !url && <div className="faint">Открываю…</div>}
      {url && (
        <img
          src={url}
          alt="Чек"
          style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', borderRadius: 10 }}
        />
      )}
    </Modal>
  )
}
