import React, { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { Field, Modal, MoneyInput, Toggle, useToast } from './ui'
import { DateField } from './DateField'
import { SchetVybor } from './SchetVybor'
import { useУдаление } from './Udalenie'
import { humanDate, today } from '../lib/date'
import { money, plural, uid } from '../lib/format'
import { звукЗаписи } from '../lib/sound'
import { счётПоУмолчанию, остатокДолга } from '../engine/stats'
import { назначеніе, планъПлатежа } from '../engine/credit'
import {
  СТАТЬЯ_ШТРАФОВ, деньгиУходят, новыйДолг, планДолга, просрочкаКредита, type ДействиеДолга,
} from '../engine/pogashenie'
import type { Account, Transaction } from '../lib/types'
import { т } from '../i18n'

/** Что гасим или берём — от этого зависят поля окна. */
export type ЦельПогашения =
  | { вид: 'credit'; кредит: Account; /** Сумма сразу — досрочный платёж. */ сумма?: number }
  | { вид: 'debt'; долг: Account; действие: ДействиеДолга }
  | { вид: 'new'; направление: 'i_owe' | 'owed_to_me' }
  | { вид: 'edit'; операция: Transaction }

/** Действие по долгу, которым записана операция «без счёта». */
function действиеЗаписи(t: Transaction, долг: Account): ДействиеДолга {
  const мне = долг.debt?.direction === 'owed_to_me'
  const плюс = t.offBook ? t.offBook === 'in' : t.toAccountId === долг.id
  return мне ? (плюс ? 'lend' : 'collect') : плюс ? 'repay' : 'borrow'
}

/**
 * Окно «Погасить» — как «Пополнить цель»: сумма, дата и галочка «со счёта».
 *
 * Одно на кредиты и долги людям: погасить кредит, отдать или получить долг,
 * дать или взять (ещё) в долг. Без галочки деньги проходят мимо ваших
 * счетов — меняется только долг (engine/pogashenie).
 */
export function PogashenieOkno({ цель, onClose }: { цель: ЦельПогашения; onClose: () => void }) {
  const { data, addTransaction, updateTransaction, upsertAccount, upsertCategory, setData } = useStore()
  const toast = useToast()
  const удаление = useУдаление()

  // Правка «без счёта» — к чему она относится.
  const правка = цель.вид === 'edit' ? цель.операция : null
  const предмет: Account | undefined = useMemo(() => {
    if (цель.вид === 'credit') return цель.кредит
    if (цель.вид === 'debt') return цель.долг
    if (правка) return data.accounts.find((a) => a.id === (правка.debtId ?? правка.toAccountId ?? правка.accountId))
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const кредит = предмет?.type === 'credit' ? предмет : undefined
  const долг = предмет?.type === 'debt' ? предмет : undefined
  const действие: ДействиеДолга | null =
    цель.вид === 'debt' ? цель.действие
      : цель.вид === 'new' ? (цель.направление === 'owed_to_me' ? 'lend' : 'borrow')
        : правка && долг ? действиеЗаписи(правка, долг)
          : null
  const уходят = кредит ? true : действие ? деньгиУходят(действие) : true

  const просрочка = кредит && !правка ? просрочкаКредита(кредит, data) : null
  const начальнаяСумма = (): number => {
    if (правка) return правка.amount
    if (цель.вид === 'credit' && цель.сумма) return цель.сумма
    if (кредит) return просрочка?.предложить || кредит.credit?.monthlyPayment || 0
    if (долг && (действие === 'repay' || действие === 'collect')) return остатокДолга(долг, data.transactions)
    return 0
  }

  const свои = data.accounts.filter((a) => !a.archived && a.type !== 'credit' && a.type !== 'debt')
  const счётПоУмолч = (): string => {
    if (правка && !правка.offBook) {
      const с = [правка.accountId, правка.toAccountId].find((id) => свои.some((a) => a.id === id))
      if (с) return с
    }
    const платитьС = кредит?.credit?.payFrom
    if (платитьС && свои.some((a) => a.id === платитьС)) return платитьС
    return счётПоУмолчанию(свои, data.transactions)
  }

  const [сумма, setСумма] = useState<number>(начальнаяСумма)
  const [дата, setДата] = useState(правка?.date ?? today())
  const [соСчёта, setСоСчёта] = useState(правка ? !правка.offBook : true)
  const [счёт, setСчёт] = useState(счётПоУмолч)
  const [штраф, setШтраф] = useState(0)
  const [кто, setКто] = useState('')
  const [срок, setСрок] = useState('')

  const заголовок = (() => {
    if (правка) return т('Изменить запись')
    if (цель.вид === 'new') return цель.направление === 'owed_to_me' ? т('Дать в долг') : т('Взять в долг')
    if (кредит) return т('Погасить кредит «{0}»', кредит.name)
    const имя = долг?.debt?.counterparty || долг?.name || ''
    return {
      repay: т('Отдать долг: {0}', имя),
      collect: т('Получить долг: {0}', имя),
      lend: т('Дать ещё в долг: {0}', имя),
      borrow: т('Взять ещё в долг: {0}', имя),
    }[действие ?? 'repay']
  })()

  const подписьГалочки = уходят ? т('Списать со счёта') : т('Зачислить на счёт')
  const безСчётаТекст = кредит
    ? т('Долг уменьшится, остатки ваших счетов не изменятся.')
    : {
        repay: т('Долг уменьшится, остатки ваших счетов не изменятся.'),
        collect: т('Долг уменьшится, на счета ничего не поступит.'),
        lend: т('Долг появится, со счетов ничего не спишется.'),
        borrow: т('Долг появится, на счета ничего не поступит.'),
      }[действие ?? 'repay']

  const выбранныйСчёт = соСчёта ? счёт || null : null
  const можно = сумма > 0 && (!соСчёта || !!счёт) && (цель.вид !== 'new' || !!кто.trim())

  /** Закрыть ждущее уведомление по кредиту — платёж уже внесён. */
  const закрытьУведомление = (txIds: string[]) => {
    if (!кредит) return
    const ждёт = (data.notifications ?? [])
      .filter((n) => n.accountId === кредит.id && n.status === 'pending')
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0]
    if (!ждёт) return
    setData((d) => ({
      ...d,
      notifications: (d.notifications ?? []).map((n) =>
        n.id === ждёт.id ? { ...n, status: 'paid' as const, resolvedAt: new Date().toISOString(), txIds, amount: сумма } : n,
      ),
    }))
  }

  const сохранить = () => {
    if (!можно) return
    // --- правка записи «без счёта» или со счёта
    if (правка) {
      let замена: Omit<Transaction, 'id' | 'createdAt'> | null = null
      if (долг && действие) {
        замена = планДолга({ долг, действие, сумма, дата, счёт: выбранныйСчёт, note: правка.note })
      } else if (кредит && правка.kind === 'expense' && правка.debtPrincipal !== 0) {
        const п = планъПлатежа({ кредитъ: кредит, счётъ: выбранныйСчёт, сумма, дата, data, безъ: правка.id, tags: правка.tags, note: правка.note })
        замена = п?.операціи[0] ?? null
        for (const с of п?.статьи ?? []) upsertCategory(с)
      } else if (кредит && правка.kind === 'transfer') {
        замена = выбранныйСчёт
          ? { ...правка, amount: сумма, date: дата, accountId: выбранныйСчёт, toAccountId: кредит.id, offBook: undefined }
          : { ...правка, amount: сумма, date: дата, accountId: кредит.id, toAccountId: кредит.id, offBook: 'in' }
      } else if (кредит) {
        // Проценты и штрафы: расход, долг не гасят.
        замена = { ...правка, amount: сумма, date: дата, accountId: выбранныйСчёт ?? кредит.id, offBook: выбранныйСчёт ? undefined : 'out' }
      }
      if (!замена) {
        toast(т('Эту запись здесь не поменять'))
        return
      }
      updateTransaction({
        ...правка,
        ...замена,
        id: правка.id,
        createdAt: правка.createdAt,
        tags: правка.tags,
        offBook: замена.offBook,
        toAccountId: замена.toAccountId,
        categoryId: замена.categoryId,
        splits: замена.splits,
        debtId: замена.debtId,
        debtPrincipal: замена.debtPrincipal,
      })
      toast(т('Операция обновлена'))
      onClose()
      return
    }

    // --- платёж по кредиту
    if (кредит) {
      const п = планъПлатежа({
        кредитъ: кредит, счётъ: выбранныйСчёт, сумма, дата, data,
        штраф, статьяШтрафа: СТАТЬЯ_ШТРАФОВ,
      })
      if (!п) {
        toast(т('Платёж не сложился — проверьте сумму и счёт'))
        return
      }
      for (const с of п.статьи) upsertCategory(с)
      const ids = п.операціи.map((о) => addTransaction(о).id)
      закрытьУведомление(ids)
      звукЗаписи('expense', data.settings.saveSound)
      toast(т('Платёж {0} по кредиту «{1}» записан', money(сумма), кредит.name))
      onClose()
      return
    }

    // --- долг: новый или уже заведённый
    let цельДолга = долг
    if (цель.вид === 'new') {
      цельДолга = новыйДолг({ id: uid('a'), кто, направление: цель.направление, срок: срок || undefined })
      upsertAccount(цельДолга)
    }
    if (!цельДолга || !действие) return
    const операция = планДолга({ долг: цельДолга, действие, сумма, дата, счёт: выбранныйСчёт })
    if (!операция) {
      toast(т('Запись не сложилась — проверьте сумму и счёт'))
      return
    }
    addTransaction(операция)
    звукЗаписи(уходят ? 'expense' : 'income', data.settings.saveSound)
    toast(`${операция.note} — ${money(сумма)}`)
    onClose()
  }

  const долгСейчас = долг ? остатокДолга(долг, data.transactions) : 0
  // Как платёж разложится: сколько гасит долг, сколько уходит на проценты.
  const предпросмотр = кредит && сумма > 0
    ? планъПлатежа({ кредитъ: кредит, счётъ: null, сумма, дата, data, безъ: правка?.id })
    : null

  return (
    <Modal
      title={заголовок}
      icon={кредит ? 'credit' : 'handshake'}
      onClose={onClose}
      footer={
        <>
          {правка && (
            <button
              className="btn danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                удаление.операцию(правка)
                onClose()
              }}
            >
              {т('Удалить')}</button>
          )}
          <button className="btn" onClick={onClose}>{т('Отмена')}</button>
          <button className="btn primary" disabled={!можно} onClick={сохранить}>
            {правка ? т('Сохранить') : кредит ? т('Погасить') : т('Записать')}</button>
        </>
      }
    >
      <div className="pogashenie">
        {цель.вид === 'new' && (
          <div className="grid c2">
            <Field label={цель.направление === 'owed_to_me' ? т('Кому') : т('У кого')}>
              <input
                type="text"
                value={кто}
                autoFocus
                placeholder={т('Имя')}
                onChange={(e) => setКто(e.target.value)}
              />
            </Field>
            <Field label={т('Вернуть до')}>
              <DateField value={срок} onChange={setСрок} allowEmpty placeholder={т('не обязательно')} />
            </Field>
          </div>
        )}

        {долг && !правка && (
          <div className="faint small" style={{ marginBottom: 10 }}>
            {долг.debt?.direction === 'owed_to_me'
              ? т('Сейчас вам должны {0}', money(долгСейчас))
              : т('Сейчас вы должны {0}', money(долгСейчас))}</div>
        )}

        {просрочка && просрочка.сумма > 0 && (
          <div className="advice-card alert pogashenie-prosrochka" style={{ padding: '8px 12px', marginBottom: 12 }}>
            <div className="advice-body">
              {т('Просрочено {0} {1} с {2}: {3}. Эта сумма уже в поле «Сумма» вместе с ближайшим платежом.',
                просрочка.платежей, plural(просрочка.платежей, 'платёж', 'платежа', 'платежей'),
                humanDate(просрочка.с!, true), money(просрочка.сумма))}</div>
          </div>
        )}

        <div className="grid c2">
          <Field label={т('Сумма')}>
            <MoneyInput value={сумма || undefined} onChange={(v) => setСумма(v)} className="pogashenie-summa" />
          </Field>
          <Field label={т('Дата')}>
            <DateField value={дата} onChange={setДата} />
          </Field>
        </div>

        {кредит && !правка && (
          <Field label={т('Штраф / пени')} hint={т('Сверх платежа: пойдёт в расходы, долг не уменьшит.')}>
            <MoneyInput value={штраф || undefined} placeholder="0" onChange={(v, empty) => setШтраф(empty ? 0 : v)} />
          </Field>
        )}

        <div style={{ margin: '4px 0 8px' }}>
          <Toggle checked={соСчёта} onChange={setСоСчёта} label={подписьГалочки} />
        </div>
        {соСчёта ? (
          <Field label={уходят ? т('С какого счёта') : т('На какой счёт')}>
            <SchetVybor value={счёт} onChange={setСчёт} accounts={свои} />
          </Field>
        ) : (
          <div className="faint small" style={{ marginBottom: 10 }}>{безСчётаТекст}</div>
        )}

        {кредит && предпросмотр && (
          <div className="small pogashenie-razbor" style={{ marginBottom: 6 }}>
            {предпросмотр.тѣло > 0
              ? т('Из {0}: в погашение долга {1}, на проценты {2}.', money(сумма), money(предпросмотр.тѣло), money(предпросмотр.проценты))
              : т('Этой суммы хватает только на проценты ({0}) — долг не уменьшится.', money(предпросмотр.проценты))}
          </div>
        )}
        {кредит && (
          <div className="faint small" style={{ lineHeight: 1.55 }}>
            {назначеніе(кредит) === 'purchase'
              ? т('Кредит на покупку: платёж целиком — расход.')
              : т('Кредит деньгами: в расход идут только проценты, остальное — перевод на кредит.')}</div>
        )}
        {долг || цель.вид === 'new' ? (
          <div className="faint small" style={{ lineHeight: 1.55 }}>
            {т('Долг — не трата и не доход: в расходы и доходы месяца он не попадает.')}</div>
        ) : null}
      </div>
    </Modal>
  )
}
