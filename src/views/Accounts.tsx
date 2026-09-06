import React, { useMemo, useState } from 'react'
import { Money } from '../components/anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, uid } from '../lib/format'
import { addMonths, today } from '../lib/date'
import { accountBalance, balanceTimeline, balances, creditRemaining, isAsset } from '../engine/stats'
import { Avatar, Confirm, ColorPicker, Field, IconPicker, Modal, MoneyInput, Toggle, useToast } from '../components/ui'
import { Spark } from '../components/charts'
import { проектный } from '../engine/project'
import type { Account, AccountType } from '../lib/types'

const TYPES: { k: AccountType; t: string; hint: string }[] = [
  { k: 'card', t: 'Карта', hint: 'Безналичный счёт для повседневных трат' },
  { k: 'cash', t: 'Наличные', hint: 'Кошелёк, конверт, наличка в столе' },
  { k: 'savings', t: 'Накопительный', hint: 'Копилка под цель, вклад' },
  { k: 'credit', t: 'Кредит или рассрочка', hint: 'Обязательство с графиком платежей' },
  { k: 'debt', t: 'Долг', hint: 'Кто-то должен вам или вы должны' },
]

export default function Accounts() {
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
      <div key={a.id} className="card tight fx-glare">
        <div className="row">
          <Avatar icon={a.icon} color={a.color} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="strong">{a.name}</div>
            <div className="faint small">
              {TYPES.find((t) => t.k === a.type)?.t}
              {проектный(a) && <> · <b>проект</b></>}
            </div>
          </div>
          <button className="icon-btn" onClick={() => setEdit(a)}>
            <Icon name="edit" size={15} />
          </button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <div className="num" style={{ fontSize: 22, fontWeight: 650, color: b < 0 ? 'var(--alert)' : 'var(--text-strong)' }}>
              {data.settings.hideBalance ? '••••' : <Money value={a.type === 'credit' ? -left : b} />}
            </div>
            {a.type === 'credit' && a.credit && (
              <div className="faint small">
                платёж {money(a.credit.monthlyPayment)} · {a.credit.ratePct}% годовых
              </div>
            )}
            {a.type === 'debt' && a.debt && (
              <div className="faint small">
                {a.debt.direction === 'i_owe' ? 'вы должны' : 'должны вам'} · {a.debt.counterparty}
              </div>
            )}
          </div>
          <span className="spacer" />
          <Spark values={spark.get(a.id) ?? []} color={a.color} width={100} height={32} />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sm ghost" onClick={() => app.openTab('transactions')}>Операции</button>
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
          <h1 className="view-title">Счета</h1>
          <div className="view-sub">
            Активы {money(bal.assets)} · обязательства {money(bal.liabilities)} · чистый капитал{' '}
            <span className={bal.net >= 0 ? 'pos' : 'neg'}>{money(bal.net)}</span>
            {projects.length > 0 && (
              <> · под проектами {money(проектныеДеньги)} <span className="faint">(не ваши)</span></>
            )}
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            setEdit({ id: uid('a'), name: '', type: 'card', icon: 'credit-card', color: '#4cc46a', initialBalance: 0 })
          }
        >
          <Icon name="plus" size={15} /> Создать счёт
        </button>
      </div>

      <div className="card-title">Активы</div>
      <div className="grid c3" style={{ marginBottom: 22 }}>{assets.map(card)}</div>

      {liabilities.length > 0 && (
        <>
          <div className="card-title">Обязательства</div>
          <div className="grid c3" style={{ marginBottom: 22 }}>{liabilities.map(card)}</div>
        </>
      )}

      {projects.length > 0 && (
        <>
          <div className="card-title">Проекты</div>
          <div className="faint small" style={{ marginBottom: 10 }}>
            Деньги лежат у вас, но не ваши: в доход, чистый капитал, прогноз и награды не входят.
          </div>
          <div className="grid c3">{projects.map(card)}</div>
        </>
      )}

      {edit && <AccountModal value={edit} onClose={() => setEdit(null)} onSave={(a) => { upsertAccount(a); setEdit(null) }} />}
      {del && (
        <Confirm
          title={`Удалить счёт «${del.name}»?`}
          text="Операции по этому счёту останутся в истории, но повиснут без привязки. Обычно правильнее оставить счёт и просто перестать им пользоваться."
          onConfirm={() => deleteAccount(del.id)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  )
}

function AccountModal({ value, onSave, onClose }: { value: Account; onSave: (a: Account) => void; onClose: () => void }) {
  const [a, setA] = useState<Account>(value)
  const [pick, setPick] = useState(false)
  const toast = useToast()
  const patch = (p: Partial<Account>) => setA((x) => ({ ...x, ...p }))

  const setType = (type: AccountType) => {
    patch({
      type,
      credit:
        type === 'credit'
          ? a.credit ?? { principal: 0, ratePct: 0, termMonths: 12, startDate: today(), paymentDay: 10, monthlyPayment: 0 }
          : undefined,
      debt: type === 'debt' ? a.debt ?? { counterparty: '', direction: 'i_owe' } : undefined,
    })
  }

  return (
    <>
      <Modal
        title={value.name ? 'Счёт' : 'Новый счёт'}
        icon="wallet"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>Отмена</button>
            <button
              className="btn primary"
              onClick={() => {
                if (!a.name.trim()) {
                  toast('Введите название счёта')
                  return
                }
                onSave(a)
              }}
            >
              Сохранить
            </button>
          </>
        }
      >
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <button className="icon-trigger" onClick={() => setPick(true)} title="Выбрать иконку и цвет">
            <Avatar icon={a.icon} color={a.color} size="lg" style={{ width: 54, height: 54 }} />
          </button>
          <div style={{ flex: 1 }}>
            <Field label="Название">
              <input type="text" autoFocus value={a.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="card-title">Тип счёта</div>
        <div className="row wrap" style={{ gap: 7, marginBottom: 6 }}>
          {TYPES.map((t) => (
            <span key={t.k} className={'chip' + (a.type === t.k ? ' on' : '')} onClick={() => setType(t.k)}>{t.t}</span>
          ))}
        </div>
        <div className="faint small" style={{ marginBottom: 14 }}>{TYPES.find((t) => t.k === a.type)?.hint}</div>

        <Field label="Начальный остаток" hint="Сколько было на счёте до начала учёта">
          <MoneyInput value={a.initialBalance} onChange={(v) => patch({ initialBalance: v })} />
        </Field>

        {a.type === 'credit' && a.credit && (
          <div className="grid c2">
            <Field label="Сумма кредита">
              <MoneyInput value={a.credit.principal} onChange={(v) => patch({ credit: { ...a.credit!, principal: v } })} />
            </Field>
            <Field label="Ставка, % годовых">
              <input type="number" value={a.credit.ratePct} onChange={(e) => patch({ credit: { ...a.credit!, ratePct: Number(e.target.value) } })} />
            </Field>
            <Field label="Ежемесячный платёж">
              <MoneyInput value={a.credit.monthlyPayment} onChange={(v) => patch({ credit: { ...a.credit!, monthlyPayment: v } })} />
            </Field>
            <Field label="Срок, месяцев">
              <input type="number" value={a.credit.termMonths} onChange={(e) => patch({ credit: { ...a.credit!, termMonths: Number(e.target.value) } })} />
            </Field>
            <Field label="Дата начала">
              <input type="date" value={a.credit.startDate} onChange={(e) => patch({ credit: { ...a.credit!, startDate: e.target.value } })} />
            </Field>
            <Field label="День платежа">
              <input type="number" min={1} max={31} value={a.credit.paymentDay} onChange={(e) => patch({ credit: { ...a.credit!, paymentDay: Number(e.target.value) } })} />
            </Field>
          </div>
        )}

        {a.type === 'debt' && a.debt && (
          <div className="grid c2">
            <Field label="Кто">
              <input type="text" value={a.debt.counterparty} placeholder="Имя" onChange={(e) => patch({ debt: { ...a.debt!, counterparty: e.target.value } })} />
            </Field>
            <Field label="Направление">
              <select value={a.debt.direction} onChange={(e) => patch({ debt: { ...a.debt!, direction: e.target.value as 'i_owe' | 'owed_to_me' } })}>
                <option value="i_owe">Я должен</option>
                <option value="owed_to_me">Мне должны</option>
              </select>
            </Field>
            <Field label="Вернуть до">
              <input type="date" value={a.debt.dueDate ?? ''} onChange={(e) => patch({ debt: { ...a.debt!, dueDate: e.target.value } })} />
            </Field>
          </div>
        )}

        <div className="card-title">Цвет</div>
        <ColorPicker value={a.color} onChange={(color) => patch({ color })} />

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Toggle
            checked={!!a.project}
            onChange={(v) => patch({ project: v || undefined })}
            label="Счёт под проект — деньги не мои"
          />
          <div className="faint small" style={{ marginTop: -4 }}>
            Аванс за работу, сбор на издание, бюджет кампании. Приходы и траты по такому счёту
            не считаются вашим доходом и расходом, остаток не входит в чистый капитал, прогноз и
            награды. Счёт остаётся видимым, и по нему считается своя сводка на главной. Перевод
            между проектным и личным счётом сохраняется — но доходом он не становится: свой
            гонорар заведите отдельным приходом.
          </div>
          <Toggle checked={!!a.archived} onChange={(v) => patch({ archived: v })} label="В архиве (скрыт из списков)" />
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
