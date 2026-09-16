import React, { useEffect, useMemo, useState } from 'react'
import { DateField } from '../components/DateField'
import { цвѣтъПодсвѣтки } from '../components/effects'
import { Money, useДеньги } from '../components/anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, uid } from '../lib/format'
import { addMonths, humanDate, today } from '../lib/date'
import { accountBalance, balanceTimeline, balances, creditRemaining, isAsset } from '../engine/stats'
import { Avatar, Confirm, ColorPicker, Field, IconPicker, Modal, MoneyInput, Toggle, useToast } from '../components/ui'
import { Spark } from '../components/charts'
import { проектный } from '../engine/project'
import type { Account, AccountType, VaultData } from '../lib/types'
import { подсказкаОстатка } from '../engine/credit'
import { SchetVybor } from '../components/SchetVybor'
import { т, тр } from '../i18n'

const TYPES: { k: AccountType; t: string; hint: string }[] = [
  { k: 'card', t: т('Карта'), hint: т('Безналичный счёт для повседневных трат') },
  { k: 'cash', t: т('Наличные'), hint: т('Кошелёк, конверт, наличка в столе') },
  { k: 'savings', t: т('Накопительный'), hint: т('Копилка под цель, вклад') },
  { k: 'credit', t: т('Кредит или рассрочка'), hint: т('Обязательство с графиком платежей') },
  { k: 'debt', t: т('Долг'), hint: т('Кто-то должен вам или вы должны') },
]

export default function Accounts() {
  // Суммы на экране — с учётом «Скрывать баланс».
  const money = useДеньги()
  const app = useApp()
  const { data, upsertAccount, deleteAccount } = useStore()
  const [edit, setEdit] = useState<Account | null>(null)
  const [del, setDel] = useState<Account | null>(null)

  const bal = balances(data.accounts, data.transactions)
  // Проектные счета вынесены в свой список: в итоги они не входят, и стоять
  // среди активов им нельзя — иначе колонка не сходилась бы с суммой.
  const assets = data.accounts.filter((a) => !a.archived && isAsset(a) && !проектный(a))
  const liabilities = data.accounts.filter((a) => !a.archived && !isAsset(a) && !проектный(a))
  const projects = data.accounts.filter((a) => !a.archived && проектный(a))
  // Убранные в архив не пропадают совсем: иначе их нельзя было бы вернуть.
  const вАрхиве = data.accounts.filter((a) => a.archived)
  const [архивОткрыт, setАрхивОткрыт] = useState(false)
  const проектныеДеньги = projects.reduce((s, a) => s + (bal.byAccount.get(a.id) ?? 0), 0)

  const spark = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const a of data.accounts) {
      const tl = balanceTimeline([a], data.transactions, addMonths(today(), -6), today())
      map.set(a.id, tl.filter((_, i) => i % 6 === 0).map((p) => p.value))
    }
    return map
  }, [data.accounts, data.transactions])

  const card = (a: Account) => {
    const b = bal.byAccount.get(a.id) ?? 0
    const left = a.type === 'credit' ? creditRemaining(a, data.transactions) : 0
    return (
      <div key={a.id} className="card tight fx-glare" style={цвѣтъПодсвѣтки(a.color)}>
        <div className="row">
          <Avatar icon={a.icon} color={a.color} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="strong">{a.name}</div>
            <div className="faint small">
              {TYPES.find((t) => t.k === a.type)?.t}
              {проектный(a) && <> · <b>{т('проект')}</b></>}
            </div>
          </div>
          <button className="icon-btn" onClick={() => setEdit(a)}>
            <Icon name="edit" size={15} />
          </button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div>
            {/* Долг по кредиту показывается как долг, а не как беда: прежде цвет
                брался из другого числа, чем сама цифра, и «Диван» краснел,
                пока на нём висел расход, хотя долг на карточке не менялся. */}
            <div className="num" style={{ fontSize: 22, fontWeight: 650, color: b < 0 && a.type !== 'credit' ? 'var(--alert)' : 'var(--text-strong)' }}>
              {data.settings.hideBalance ? '••••' : <Money value={a.type === 'credit' ? -left : b} />}
            </div>
            {a.type === 'credit' && a.credit && (
              <div className="faint small">
                {тр('платёж {0} · {1}% годовых', money(a.credit.monthlyPayment), a.credit.ratePct)}</div>
            )}
            {a.type === 'debt' && a.debt && (
              <div className="faint small">
                {a.debt.direction === 'i_owe' ? т('вы должны') : т('должны вам')} · {a.debt.counterparty}
              </div>
            )}
          </div>
          <span className="spacer" />
          <Spark values={spark.get(a.id) ?? []} color={a.color} width={100} height={32} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm ghost" onClick={() => app.openTab('transactions', 'acc:' + a.id, { title: a.name })}>{т('Операции')}</button>
          {a.type === 'credit' && a.credit && (
            <button className="btn sm" onClick={() => app.editTransaction({ debtId: a.id })}>{т('Внести платёж')}</button>
          )}
          <span className="spacer" />
          <button className="btn sm danger" onClick={() => setDel(a)}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Счета')}</h1>
          <div className="view-sub">
            {тр('Активы {0} · обязательства {1} · чистый капитал{2}', money(bal.assets), money(bal.liabilities), ' ')}<span className={bal.net >= 0 ? 'pos' : 'neg'}>{money(bal.net)}</span>
            {projects.length > 0 && (
              <> {тр(' · под проектами {0} ', money(проектныеДеньги))}<span className="faint">{т('(не ваши)')}</span></>
            )}
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            setEdit({ id: uid('a'), name: '', type: 'card', icon: 'credit-card', color: '#4cc46a', initialBalance: 0 })
          }
        >
          <Icon name="plus" size={15} /> {т(' Создать счёт')}</button>
      </div>

      <div className="card-title">{т('Активы')}</div>
      <div className="grid c3" style={{ marginBottom: 22 }}>{assets.map(card)}</div>

      {liabilities.length > 0 && (
        <>
          <div className="card-title">{т('Обязательства')}</div>
          <div className="grid c3" style={{ marginBottom: 22 }}>{liabilities.map(card)}</div>
        </>
      )}

      {projects.length > 0 && (
        <>
          <div className="card-title">{т('Проекты')}</div>
          <div className="faint small" style={{ marginBottom: 10 }}>
            {т('Деньги лежат у вас, но не ваши: в доход, чистый капитал, прогноз и награды не входят.')}</div>
          <div className="grid c3">{projects.map(card)}</div>
        </>
      )}

      {вАрхиве.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <button className="btn sm ghost" onClick={() => setАрхивОткрыт((v) => !v)}>
            <Icon name={архивОткрыт ? 'up' : 'down'} size={13} /> {т(' В архиве: {0}', вАрхиве.length)}</button>
          {архивОткрыт && (
            <div className="grid c3" style={{ marginTop: 10, opacity: 0.75 }}>
              {вАрхиве.map((a) => (
                <div key={a.id} className="card tight row" style={{ gap: 10 }}>
                  <Avatar icon={a.icon} color={a.color} />
                  <span style={{ flex: 1 }}>{a.name}</span>
                  <button className="btn sm" onClick={() => upsertAccount({ ...a, archived: undefined })}>{т('Вернуть')}</button>
                  <button className="icon-btn" onClick={() => setEdit(a)} title={т('Изменить')}>
                    <Icon name="edit" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {edit && <AccountModal value={edit} onClose={() => setEdit(null)} onSave={(a) => { upsertAccount(a); setEdit(null) }} />}
      {del && (
        <Confirm
          title={т('Удалить счёт «{0}»?', del.name)}
          text={т('Операции по этому счёту останутся в истории, но повиснут без привязки. Обычно правильнее оставить счёт и просто перестать им пользоваться.')}
          onConfirm={() => deleteAccount(del.id)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  )
}

function AccountModal({ value, onSave, onClose }: { value: Account; onSave: (a: Account) => void; onClose: () => void }) {
  const { data } = useStore()
  const [a, setA] = useState<Account>(value)
  const [pick, setPick] = useState(false)
  const toast = useToast()
  const patch = (p: Partial<Account>) => setA((x) => ({ ...x, ...p }))

  const setType = (type: AccountType) => {
    patch({
      type,
      credit:
        type === 'credit'
          ? a.credit ?? { principal: 0, ratePct: 0, termMonths: 12, startDate: today(), paymentDay: 10, monthlyPayment: 0, purpose: 'purchase', v: 2 }
          : undefined,
      debt: type === 'debt' ? a.debt ?? { counterparty: '', direction: 'i_owe', v: 2 } : undefined,
    })
  }

  return (
    <>
      <Modal
        title={value.name ? т('Счёт') : т('Новый счёт')}
        icon="wallet"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>{т('Отмена')}</button>
            <button
              className="btn primary"
              onClick={() => {
                if (!a.name.trim()) {
                  toast(т('Введите название счёта'))
                  return
                }
                onSave(a)
              }}
            >
              {т('Сохранить')}</button>
          </>
        }
      >
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <button className="icon-trigger" onClick={() => setPick(true)} title={т('Выбрать иконку и цвет')}>
            <Avatar icon={a.icon} color={a.color} size="lg" style={{ width: 54, height: 54 }} />
          </button>
          <div style={{ flex: 1 }}>
            <Field label={т('Название')}>
              <input type="text" autoFocus value={a.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="card-title">{т('Тип счёта')}</div>
        <div className="row wrap" style={{ gap: 7, marginBottom: 6 }}>
          {TYPES.map((t) => (
            <span key={t.k} className={'chip' + (a.type === t.k ? ' on' : '')} onClick={() => setType(t.k)}>{t.t}</span>
          ))}
        </div>
        <div className="faint small" style={{ marginBottom: 14 }}>{TYPES.find((t) => t.k === a.type)?.hint}</div>

        {a.type === 'credit' && a.credit ? (
          <КредитъОстатокъ a={a} data={data} patch={patch} новый={!data.accounts.some((x) => x.id === value.id)} />
        ) : a.type === 'debt' && a.debt ? (
          // Сумма пишется без знака, знак ставит направление: «я должен» —
          // минус, «мне должны» — плюс. Минус руками в поле не вписать.
          <Field label={т('Сумма долга')} hint={т('На начало учёта. Возвраты, внесённые в программу, вычтутся сами.')}>
            <MoneyInput
              value={Math.abs(a.initialBalance)}
              onChange={(v) => patch({ initialBalance: a.debt!.direction === 'owed_to_me' ? v : -v })}
            />
          </Field>
        ) : (
          <Field label={т('Начальный остаток')} hint={т('Сколько было на счёте до начала учёта')}>
            <MoneyInput value={a.initialBalance} onChange={(v) => patch({ initialBalance: v })} />
          </Field>
        )}

        {a.type === 'credit' && a.credit && (
          <>
          <div className="card-title">{т('На что взят')}</div>
          <div className="row wrap" style={{ gap: 7, marginBottom: 6 }}>
            {([['purchase', т('Покупка или рассрочка')], ['cash', т('Деньги или кредитная карта')]] as const).map(([k, t]) => (
              <span key={k} className={'chip' + ((a.credit!.purpose ?? 'purchase') === k ? ' on' : '')} onClick={() => patch({ credit: { ...a.credit!, purpose: k } })}>{t}</span>
            ))}
          </div>
          <div className="faint small" style={{ marginBottom: 14, lineHeight: 1.5 }}>
            {(a.credit.purpose ?? 'purchase') === 'purchase'
              ? т('Платёж целиком идёт в расходы: саму покупку нигде больше не записывали.')
              : т('Деньги пришли на счёт или траты идут с самой кредитной карты — они уже расходы, поэтому из платежа в расходы идут только проценты.')}</div>
          <div className="grid c2">
            <Field label={т('Сумма кредита')}>
              <MoneyInput value={a.credit.principal} onChange={(v) => patch({ credit: { ...a.credit!, principal: v } })} />
            </Field>
            <Field label={т('Ставка, % годовых')}>
              <input type="number" value={a.credit.ratePct} onChange={(e) => patch({ credit: { ...a.credit!, ratePct: Number(e.target.value) } })} />
            </Field>
            <Field label={т('Ежемесячный платёж')}>
              <MoneyInput value={a.credit.monthlyPayment} onChange={(v) => patch({ credit: { ...a.credit!, monthlyPayment: v } })} />
            </Field>
            <Field label={т('Срок, месяцев')}>
              <input type="number" value={a.credit.termMonths} onChange={(e) => patch({ credit: { ...a.credit!, termMonths: Number(e.target.value) } })} />
            </Field>
            <Field label={т('Дата начала')} hint={т('Когда взят кредит')}>
              <DateField value={a.credit.startDate} onChange={(v) => patch({ credit: { ...a.credit!, startDate: v } })} />
            </Field>
            <Field label={т('День платежа')} hint={т('Число месяца, когда списывается платёж')}>
              <input type="number" min={1} max={31} value={a.credit.paymentDay} onChange={(e) => patch({ credit: { ...a.credit!, paymentDay: Number(e.target.value) } })} />
            </Field>
          </div>
          <div style={{ margin: '4px 0 6px' }}>
            <Toggle
              checked={!!a.credit.remind}
              onChange={(v) => patch({
                credit: { ...a.credit!, remind: v || undefined, remindFrom: v ? a.credit!.remindFrom ?? today() : undefined },
              })}
              label={т('Напоминать в день платежа')}
            />
          </div>
          <div className="faint small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
            {т('В день платежа придёт уведомление (колокольчик слева): ответьте, прошёл ли платёж, — и он запишется сам.')}</div>
          {a.credit.remind && (
            <Field label={т('Платить с')}>
              <SchetVybor
                value={a.credit.payFrom ?? ''}
                onChange={(id) => patch({ credit: { ...a.credit!, payFrom: id || undefined } })}
                vse={т('Спросить в уведомлении')}
                accounts={data.accounts.filter((x) => !x.archived && x.type !== 'credit' && x.type !== 'debt')}
              />
            </Field>
          )}
          </>
        )}

        {a.type === 'debt' && a.debt && (
          <div className="grid c2">
            <Field label={т('Кто')}>
              <input type="text" value={a.debt.counterparty} placeholder={т('Имя')} onChange={(e) => patch({ debt: { ...a.debt!, counterparty: e.target.value } })} />
            </Field>
            <Field label={т('Направление')}>
              <select
                value={a.debt.direction}
                onChange={(e) => {
                  const direction = e.target.value as 'i_owe' | 'owed_to_me'
                  const сумма = Math.abs(a.initialBalance)
                  patch({ debt: { ...a.debt!, direction, v: 2 }, initialBalance: direction === 'owed_to_me' ? сумма : -сумма })
                }}
              >
                <option value="i_owe">{т('Я должен')}</option>
                <option value="owed_to_me">{т('Мне должны')}</option>
              </select>
            </Field>
            <Field label={т('Вернуть до')}>
              <DateField allowEmpty value={a.debt.dueDate ?? ''} onChange={(v) => patch({ debt: { ...a.debt!, dueDate: v } })} />
            </Field>
          </div>
        )}

        <div className="card-title">{т('Цвет')}</div>
        <ColorPicker value={a.color} onChange={(color) => patch({ color })} />

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Toggle
            checked={!!a.project}
            onChange={(v) => patch({ project: v || undefined })}
            label={т('Счёт под проект — деньги не мои')}
          />
          <div className="faint small" style={{ marginTop: -4 }}>
            {т('Аванс за работу, сбор на издание, бюджет кампании. Приходы и траты по такому счёту не считаются вашим доходом и расходом, остаток не входит в чистый капитал, прогноз и награды. Счёт остаётся видимым, и по нему считается своя сводка на главной. Перевод между проектным и личным счётом сохраняется — но доходом он не становится: свой гонорар заведите отдельным приходом.')}</div>
          <Toggle checked={!!a.archived} onChange={(v) => patch({ archived: v })} label={т('В архиве (скрыт из списков)')} />
        </div>
      </Modal>
      {pick && (
        <IconPicker
          icon={a.icon}
          color={a.color}
          onChange={(icon, color) => patch({ icon, color })}
          onClose={() => setPick(false)}
        />
      )}
    </>
  )
}

/**
 * Поле «Осталось выплатить» у кредита.
 *
 * Долг кредита — это остаток счёта со знаком минус, поэтому поле пишет в
 * initialBalance отрицательное число. Рядом — подсказка по графику: сколько
 * платежей прошло с даты начала и сколько после них осталось. Программа
 * считает это сама, человеку остаётся согласиться или поправить.
 */
function КредитъОстатокъ({ a, data, patch, новый }: { a: Account; data: VaultData; patch: (p: Partial<Account>) => void; новый: boolean }) {
  const подсказка = подсказкаОстатка(a, data)
  const сейчасъ = Math.max(0, -a.initialBalance)
  /*
   * У нового кредита поле пустое, и без подсказки он заводился бы без долга.
   * Пока человек сам поле не трогал, оно идёт следом за графиком.
   */
  // У заведённого кредита поле не трогаем вовсе: ноль там мог быть поставлен
  // нарочно, и открыть форму ради переименования не должно добавлять долг.
  const [самъ, setСамъ] = useState(!новый || сейчасъ !== 0)
  const поГрафику = подсказка?.остатокъ
  useEffect(() => {
    if (!самъ && поГрафику != null && поГрафику !== сейчасъ) patch({ initialBalance: -поГрафику })
  }, [самъ, поГрафику])
  return (
    <>
      <Field
        label={т('Осталось выплатить')}
        hint={т('Долг на начало учёта. Платежи, внесённые в программу, вычтутся сами.')}
      >
        <MoneyInput value={сейчасъ} onChange={(v) => { setСамъ(true); patch({ initialBalance: -v }) }} />
      </Field>
      {подсказка && подсказка.остатокъ !== сейчасъ && (
        <div className="row small" style={{ gap: 8, marginTop: -6, marginBottom: 12, flexWrap: 'wrap' }}>
          <span className="faint">
            {тр('По графику на {0}: {1} — прошло платежей: {2}', humanDate(подсказка.наДату, true), money(подсказка.остатокъ), подсказка.платежей)}</span>
          <button className="btn sm" onClick={() => patch({ initialBalance: -подсказка.остатокъ })}>{т('Подставить')}</button>
        </div>
      )}
    </>
  )
}
