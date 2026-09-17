import React, { useEffect, useMemo, useState } from 'react'
import { useУдаление } from './Udalenie'
import { DateField } from './DateField'
import type { Money, Split, Transaction, TxKind } from '../lib/types'
import { useStore } from '../state/store'
import { PALETTE } from '../lib/emoji'
import { Avatar, Modal, Field, GroupedInput, MoneyInput, TagInput, useToast, Confirm } from './ui'
import { Icon } from '../lib/icons'
import { addDays, humanDate, today } from '../lib/date'
import { formatAmountInput, groupDigits, money, uid, суммаИзВыражения } from '../lib/format'
import { readAttachmentBase64, saveAttachment, bridge } from '../state/vault'
import { т, тр } from '../i18n'
import { назначеніе, планъПлатежа } from '../engine/credit'
import { счётПоУмолчанию } from '../engine/stats'
import { всеТеги } from '../engine/tegi'
import { SchetVybor } from './SchetVybor'
import { KategoriyaVybor } from './KategoriyaVybor'
import { useKategoriyaMenyu } from './KategoriyaMenyu'
import { деревоКатегорий, родитель } from '../engine/podkategorii'
import { useApp } from '../App'
import { звукЗаписи } from '../lib/sound'

const KIND_LABEL: Record<TxKind, string> = {
  expense: т('Расход'),
  income: т('Доход'),
  transfer: т('Перевод'),
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
  /*
   * Платёж по кредиту — отдельный вид в окне, хотя записывается расходом или
   * переводом: что из платежа расход, решает engine/credit по условиям
   * кредита, а человеку достаточно сказать, с какой карты и по какому кредиту.
   */
  // Кредит правимого платежа — в списке, даже если он уже в архиве.
  const кредиты = data.accounts.filter((a) => a.type === 'credit' && a.credit && (!a.archived || a.id === draft.debtId))
  const платёжПоКредиту = (() => {
    if (!draft.debtId || draft.accountId === draft.debtId) return false
    const к = data.accounts.find((a) => a.id === draft.debtId)
    if (!к || к.type !== 'credit') return false
    // Новая запись с пометкой кредита — это кнопка «Внести платёж».
    if (!isEdit) return true
    return draft.kind === 'expense' && назначеніе(к) === 'purchase'
  })()
  const [платёж, setПлатёж] = useState(платёжПоКредиту)
  // Кнопка «Внести платёж» открывает окно с картой, а не с самим кредитом.
  useEffect(() => {
    if (!платёжПоКредиту || isEdit) return
    const свой = data.accounts.find((a) => a.id === accountId)
    if (свой && свой.type !== 'credit') return
    const платитьСъ = data.accounts.find((a) => a.id === draft.accountId && a.type !== 'credit')
      ?? data.accounts.find((a) => a.id === счётПоУмолчанию(data.accounts.filter((x) => x.type !== 'credit'), data.transactions))
    if (платитьСъ) setAccountId(платитьСъ.id)
    const к = data.accounts.find((a) => a.id === draft.debtId)
    if (к?.credit?.monthlyPayment && !amountStr) {
      setAmountStr(formatAmountInput(String(к.credit.monthlyPayment / 100).replace('.', ',')))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [кредитId, setКредитId] = useState(draft.debtId ?? кредиты[0]?.id ?? '')
  const кредитъ = кредиты.find((a) => a.id === кредитId)
  const [amountStr, setAmountStr] = useState(
    draft.amount ? formatAmountInput(String((draft.amount / 100).toFixed(2)).replace(/\.00$/, '').replace('.', ',')) : '',
  )
  const app = useApp()
  const [accountId, setAccountId] = useState(draft.accountId ?? счётПоУмолчанию(data.accounts, data.transactions, app.entryAccount))
  const [toAccountId, setToAccountId] = useState(draft.toAccountId ?? data.accounts.find((a) => a.type === 'savings')?.id ?? '')
  const [categoryId, setCategoryId] = useState(draft.categoryId)
  const [date, setDate] = useState(draft.date ?? today())
  const [tags, setTags] = useState<string[]>(draft.tags ?? [])
  const [note, setNote] = useState(draft.note ?? '')
  const [splits, setSplits] = useState<Split[]>(draft.splits ?? [])
  const [attachments, setAttachments] = useState<string[]>(draft.attachments ?? [])
  const [showAll, setShowAll] = useState(false)
  const [поиск, setПоиск] = useState('')
  const меню = useKategoriyaMenyu()
  /** Название новой статьи. null — окошко закрыто. */
  const [новая, setНовая] = useState<string | null>(null)
  const удаление = useУдаление()
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
    if (!имя) { toast(т('Напишите название')); return }
    const вид = kind === 'income' ? 'income' : 'expense'
    const было = data.categories.find((c) => c.kind === вид && c.name.toLowerCase() === имя.toLowerCase())
    if (было) {
      setCategoryId(было.id)
      setНовая(null)
      toast(т('Такая статья уже была — выбрал «{0}»', было.name))
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

  const amount = суммаИзВыражения(amountStr || '0')
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
  // Поиск и «Ещё» показывают категории по порядку: главная, под ней её подкатегории.
  const shown = поиск.trim() ? деревоКатегорий(cats, поиск).map((x) => x.cat) : showAll ? деревоКатегорий(cats).map((x) => x.cat) : ходовые
  // Частые теги первыми: подсказка показывает то, чем пользуются.
  const allTags = useMemo(() => всеТеги(data).map((x) => x.тег), [data])
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
    setПлатёж(false)
    // Доли бывают только у расхода: скрытые доли у перевода не давали его
    // записать и уезжали в хранилище.
    if (next !== 'expense' && splits.length) setSplits([])
    if (next === 'transfer') return
    const cat = data.categories.find((c) => c.id === categoryId)
    if (cat && cat.kind !== next) setCategoryId(undefined)
    if (splits.length) setSplits([])
  }

  /** Перейти к платежу: карта — не кредит, сумма — платёж по графику. */
  const toPayment = () => {
    setKind('expense')
    setПлатёж(true)
    setSplits([])
    const свой = data.accounts.find((a) => a.id === accountId)
    if (!свой || свой.type === 'credit') {
      const карта = data.accounts.find((a) => !a.archived && a.type !== 'credit' && a.type !== 'debt')
      if (карта) setAccountId(карта.id)
    }
    const к = кредиты.find((a) => a.id === кредитId) ?? кредиты[0]
    if (к && !amountStr && к.credit?.monthlyPayment) {
      setAmountStr(formatAmountInput(String(к.credit.monthlyPayment / 100).replace('.', ',')))
    }
  }

  const splitSum = splits.reduce((s, x) => s + x.amount, 0)
  const splitOk = !splits.length || splitSum === amount

  const планъ = платёж && кредитъ
    ? планъПлатежа({ кредитъ, счётъ: accountId, сумма: amount, дата: date, data, безъ: isEdit ? (draft as Transaction).id : undefined, tags, note: note.trim() || undefined })
    : null

  /** Записать план платежа: статьи, затем операции; при правке первая операция заменяет исходную. */
  const записатьПлатёжъ = (п: NonNullable<typeof планъ>) => {
    for (const с of п.статьи) upsertCategory(с)
    const [первая, ...прочія] = п.операціи
    if (isEdit && первая && первая.kind === 'expense') {
      const было = draft as Transaction
      updateTransaction({
        ...было, ...первая,
        splits: первая.splits, categoryId: первая.categoryId, toAccountId: undefined,
        attachments: attachments.length ? attachments : undefined,
      })
    } else {
      if (isEdit) deleteTransaction((draft as Transaction).id)
      if (первая) addTransaction({ ...первая, attachments: attachments.length ? attachments : undefined })
    }
    for (const о of прочія) addTransaction(о)
  }

  const save = () => {
    if (!accountId) {
      toast(т('Сначала создайте счёт — в разделе «Счета»'))
      return
    }
    if (!(amount > 0)) {
      toast(amount < 0 ? т('Сумма не может быть меньше нуля — вид операции задаёт знак сам') : т('Укажите сумму'))
      return
    }
    if (kind === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      toast(т('Выберите разные счёта для перевода'))
      return
    }
    if (платёж) {
      if (!кредитъ) { toast(т('Выберите кредит')); return }
      if (!планъ) { toast(т('Выберите карту, с которой платите, — не сам кредит')); return }
      записатьПлатёжъ(планъ)
      if (!isEdit) звукЗаписи('expense', data.settings.saveSound)
      toast(isEdit ? т('Операция обновлена') : т('Платёж {0} по кредиту «{1}» записан', money(amount), кредитъ.name))
      onClose()
      return
    }
    // Новый перевод на кредит — тоже платёж: расход считается по тем же правилам.
    const наКредитъ = data.accounts.find((a) => a.id === toAccountId && a.type === 'credit' && a.credit)
    if (kind === 'transfer' && наКредитъ && !isEdit) {
      const п = планъПлатежа({ кредитъ: наКредитъ, счётъ: accountId, сумма: amount, дата: date, data, tags, note: note.trim() || undefined })
      if (п) {
        записатьПлатёжъ(п)
        toast(т('Платёж {0} по кредиту «{1}» записан', money(amount), наКредитъ.name))
        onClose()
        return
      }
    }
    if (!splitOk) {
      toast(т('Сумма долей {0} не совпадает с {1}', money(splitSum), money(amount)))
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
      // Проценты по кредиту деньгами правятся как обычный расход и остаются при кредите;
      // всё прочее, переделанное из платежа, от кредита отвязывается.
      debtId: kind === 'expense' && draft.debtPrincipal === 0 ? draft.debtId : undefined,
      debtPrincipal: kind === 'expense' && draft.debtPrincipal === 0 ? 0 : undefined,
      tags,
      note: note.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
    }
    if (isEdit) {
      updateTransaction({ ...(draft as Transaction), ...payload })
      toast(т('Операция обновлена'))
    } else {
      addTransaction({ ...payload } as Omit<Transaction, 'id' | 'createdAt'>)
      звукЗаписи(kind, data.settings.saveSound)
      toast(т('{0} {1} записан на «{2}»', KIND_LABEL[kind], money(amount), data.accounts.find((a) => a.id === accountId)?.name ?? ''))
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
        title={isEdit ? т('Операция') : т('Новая операция')}
        icon="plus"
        onClose={onClose}
        footer={
          <>
            {isEdit && (
              <button
                className="btn danger"
                style={{ marginRight: 'auto' }}
                onClick={() => {
                  // Удаляется записанное, а не черновик с несохранёнными правками — его и вернёт «Отменить».
                  const было = data.transactions.find((x) => x.id === (draft as Transaction).id)
                  if (было) удаление.операцию(было)
                  onClose()
                }}
              >
                <Icon name="trash" size={15} /> {т(' Удалить')}</button>
            )}
            <button className="btn" onClick={onClose}>{т('Отмена')}</button>
            <button className="btn primary" onClick={save}>
              {isEdit ? т('Сохранить') : т('Добавить')}
            </button>
          </>
        }
      >
        {!data.accounts.length && (
          <div className="advice-card warn" style={{ marginBottom: 14, padding: '10px 12px' }}>
            {т('Нет ни одного счёта. Создайте его в разделе «Счета» — без счёта операции некуда записывать.')}</div>
        )}
        <div className="seg" style={{ marginBottom: 16 }}>
          {(['expense', 'income', 'transfer'] as TxKind[]).map((k) => (
            <button key={k} className={kind === k && !платёж ? 'on' : ''} onClick={() => switchKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
          {кредиты.length > 0 && (
            <button className={платёж ? 'on' : ''} onClick={toPayment}>{т('Платёж по кредиту')}</button>
          )}
        </div>

        <div className="row" style={{ gap: 14, alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label className="field">
              <span>{т('Сумма')}</span>
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
              <div className="faint small" style={{ marginTop: 4 }}>{т('Нажмите = чтобы посчитать')}</div>
            )}
          </div>
          <div style={{ width: 190 }}>
            <Field label={kind === 'transfer' || платёж ? т('Со счёта') : т('Счёт')}>
              <SchetVybor
                value={accountId}
                onChange={setAccountId}
                accounts={data.accounts.filter((a) => !a.archived && !(платёж && a.type === 'credit'))}
              />
            </Field>
          </div>
          {платёж && (
            <div style={{ width: 190 }}>
              <Field label={т('Кредит')}>
                <SchetVybor value={кредитId} onChange={setКредитId} accounts={кредиты} />
              </Field>
            </div>
          )}
          {kind === 'transfer' && (
            <div style={{ width: 190 }}>
              <Field label={т('На счёт')}>
                <SchetVybor
                  value={toAccountId}
                  onChange={setToAccountId}
                  vse="—"
                  accounts={data.accounts.filter((a) => !a.archived && a.id !== accountId)}
                />
              </Field>
            </div>
          )}
        </div>

        {kind === 'expense' && !платёж && (() => {
          const съКредита = data.accounts.find((a) => a.id === accountId && a.type === 'credit' && a.credit)
          if (!съКредита || назначеніе(съКредита) !== 'purchase') return null
          // Кредит «на покупку» считает расходом свои платежи. Трата с него
          // посчиталась бы второй раз — об этом надо сказать до записи.
          return (
            <div className="advice-card warn" style={{ marginBottom: 14, padding: '10px 12px', lineHeight: 1.5 }}>
              {т('У этого кредита платежи уже идут в расходы («На что взят: покупка»). Трата с него посчитается второй раз. Если это кредитная карта, выберите в настройках кредита «Деньги или кредитная карта».')}</div>
          )
        })()}

        {платёж && кредитъ && (
          <div className="advice-card info" style={{ marginBottom: 16, padding: '10px 12px', lineHeight: 1.55 }}>
            {планъ
              ? тр('Долг до платежа {0}. Проценты {1}, в погашение долга {2}. В расходы попадёт {3}.', money(планъ.долгъДо), money(планъ.проценты), money(планъ.тѣло), money(планъ.расходъ))
              : т('Укажите сумму и карту, с которой платите.')}
            <div className="faint small" style={{ marginTop: 4 }}>
              {назначеніе(кредитъ) === 'purchase'
                ? т('Кредит на покупку: платёж целиком — расход.')
                : т('Кредит деньгами: в расход идут только проценты, остальное — перевод на кредит.')}</div>
          </div>
        )}

        {kind !== 'transfer' && !платёж && (
          <>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <div className="card-title" style={{ margin: 0 }}>{т('Категория')}</div>
              <input
                type="search"
                placeholder={т('Найти категорию')}
                value={поиск}
                onChange={(e) => setПоиск(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (shown[0]) setCategoryId(shown[0].id)
                  }
                }}
                style={{ maxWidth: 240 }}
              />
              <span className="faint small">{т('правый щелчок — изменить')}</span>
            </div>
            {поиск.trim() && !shown.length && (
              <div className="faint small" style={{ marginBottom: 8 }}>{т('Ничего не нашлось — можно создать категорию.')}</div>
            )}
            <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
              {shown.map((c) => (
                <button
                  key={c.id}
                  className="btn"
                  onClick={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
                  onContextMenu={меню.открыть(c)}
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
                  {/* Перенос здѣсь уже был прописан, но не работал: плитка — это
                      .btn, у кнопок white-space: nowrap, и он наследовался
                      подписью. «Татьяна. Режиссура и страницы» уезжала на
                      соседнюю плитку. Полное имя — во всплывающей подсказке. */}
                  <span className="tile-name" title={c.name}>{c.name}</span>
                  {родитель(c, data.categories) && <span className="tile-parent">{родитель(c, data.categories)!.name}</span>}
                </button>
              ))}
              {cats.length > 11 && !поиск.trim() && (
                <button className="btn" onClick={() => setShowAll((v) => !v)} style={{ flexDirection: 'column', width: 84, minHeight: 84, height: 'auto', gap: 6, padding: '8px 4px' }}>
                  <span className="avatar" style={{ background: 'var(--panel-2)' }}>
                    <Icon name={showAll ? 'up' : 'dots'} size={16} />
                  </span>
                  <span style={{ fontSize: 11.5 }}>{showAll ? т('Скрыть') : т('Ещё')}</span>
                </button>
              )}
              {/* Новая статья заводится прямо отсюда и сразу встаёт в запись:
                  уходить в другой раздел ради одного названия — терять мысль. */}
              <button
                className="btn"
                onClick={() => setНовая(поиск.trim())}
                style={{ flexDirection: 'column', width: 84, minHeight: 84, height: 'auto', gap: 6, padding: '8px 4px' }}
              >
                <span className="avatar" style={{ background: 'var(--panel-2)' }}>
                  <Icon name="plus" size={16} />
                </span>
                <span style={{ fontSize: 11.5 }}>{т('Создать')}</span>
              </button>
            </div>
          </>
        )}

        <div className="card-title">{т('Дата')}</div>
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          {[
            { d: today(), l: т('сегодня') },
            { d: addDays(today(), -1), l: т('вчера') },
            { d: lastDate, l: т('последняя') },
          ].map((x) => (
            <button key={x.l} className={'chip' + (date === x.d ? ' on' : '')} onClick={() => setDate(x.d)}>
              {humanDate(x.d, false)} · {x.l}
            </button>
          ))}
          <DateField value={date} onChange={setDate} style={{ width: 160 }} />
        </div>

        <div className="grid c2">
          <div>
            <div className="card-title">{т('Теги')}</div>
            <TagInput tags={tags} onChange={setTags} suggestions={allTags} />
          </div>
          <div>
            <div className="card-title">{т('Комментарий')}</div>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={т('Где, за что, зачем')} />
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn sm" onClick={attach}>
                <Icon name="upload" size={14} /> {т(' Фото чека')}</button>
              {/* Раньше на фишке было ровно одно действие — удалить, и оно же
                  срабатывало на любое нажатие. Посмотреть чек было нельзя
                  вообще: единственный способ его открыть — полезть в папку
                  хранилища. Теперь нажатие показывает, а крестик убирает. */}
              {attachments.map((a) => (
                <span key={a} className="chip on" style={{ gap: 6 }}>
                  <span style={{ cursor: 'zoom-in' }} onClick={() => setShot(a)} title={т('Посмотреть чек')}>
                    {a.split('_').pop()}
                  </span>
                  <span
                    style={{ cursor: 'pointer', opacity: 0.7 }}
                    title={т('Убрать из операции')}
                    onClick={() => setAttachments((l) => l.filter((x) => x !== a))}
                  >
                    <Icon name="x" size={11} />
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {kind === 'expense' && !платёж && (
          <div style={{ marginTop: 18 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="card-title" style={{ margin: 0 }}>{т('Разбить чек по категориям')}</div>
              <span className="spacer" />
              <button
                className="btn sm"
                onClick={() =>
                  setSplits((s) => [...s, { categoryId: categoryId ?? cats[0]?.id ?? '', amount: Math.max(0, amount - splitSum) }])
                }
              >
                <Icon name="split" size={14} /> {т(' Добавить долю')}</button>
            </div>
            {splits.map((s, i) => (
              <div key={i} className="row" style={{ gap: 8, marginBottom: 7 }}>
                <KategoriyaVybor
                  value={s.categoryId}
                  onChange={(id) => setSplits((l) => l.map((x, j) => (j === i ? { ...x, categoryId: id } : x)))}
                  cats={cats}
                  style={{ width: 220 }}
                />
                <MoneyInput
                  value={s.amount}
                  onChange={(v) => setSplits((l) => l.map((x, j) => (j === i ? { ...x, amount: v } : x)))}
                  style={{ width: 120 }}
                />
                <input
                  type="text"
                  placeholder={т('комментарий')}
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
                {тр('Доли: {0} из {1}{2}', money(splitSum), money(amount), !splitOk && т(' — расхождение {0}', money(Math.abs(amount - splitSum))))}</div>
            )}
          </div>
        )}
      </Modal>

      {меню.узелъ}
      {новая !== null && (
        <Modal
          title={т('Новая статья')}
          icon="tag"
          onClose={() => setНовая(null)}
          footer={
            <>
              <button className="btn" onClick={() => setНовая(null)}>{т('Отмена')}</button>
              <button className="btn primary" onClick={() => создатьСтатью()}>{т('Создать и выбрать')}</button>
            </>
          }
        >
          <Field label={т('Название')} hint={т('Появится в списке и сразу встанет в эту запись')}>
            <input
              type="text"
              autoFocus
              value={новая}
              placeholder={kind === 'income' ? т('Например, Подработка') : т('Например, Аптека')}
              onChange={(e) => setНовая(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); создатьСтатью() } }}
            />
          </Field>
          <div className="faint small">
            {тр('Статья заводится {0} — по виду этой записи. Значок и цвет можно поменять потом в разделе «Категории».', kind === 'income' ? т('доходной') : т('расходной'))}</div>
        </Modal>
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
        if (!b64) { setErr(т('Файл не найден в хранилище — возможно, его удалили из папки.')); return }
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
      title={т('Чек')}
      icon="upload"
      onClose={onClose}
      footer={<button className="btn" onClick={onClose}>{т('Закрыть')}</button>}
    >
      <div className="faint small" style={{ marginBottom: 10, wordBreak: 'break-all' }}>{rel}</div>
      {err && <div className="advice-card warn" style={{ padding: '10px 12px' }}>{err}</div>}
      {!err && !url && <div className="faint">{т('Открываю…')}</div>}
      {url && (
        <img
          src={url}
          alt={т('Чек')}
          style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', borderRadius: 10 }}
        />
      )}
    </Modal>
  )
}
