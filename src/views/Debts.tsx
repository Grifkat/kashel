import React, { useMemo, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { Icon } from '../lib/icons'
import { money, months as monthsWord, pct, plural, toMinor } from '../lib/format'
import { addMonths, diffDays, humanDate, today } from '../lib/date'
import { accountBalance, creditRemaining } from '../engine/stats'
import { LineChart } from '../components/charts'
import { Avatar } from '../components/ui'
import type { Account, Money } from '../lib/types'
import { т, тр } from '../i18n'

interface Row {
  month: number
  interest: Money
  principal: Money
  balance: Money
}

/** График аннуитетного погашения с возможным досрочным платежом. */
function schedule(principal: Money, ratePct: number, payment: Money, extra = 0): Row[] {
  const rows: Row[] = []
  const r = ratePct / 100 / 12
  let balance = principal
  const total = payment + extra
  if (total <= 0) return rows
  for (let m = 1; m <= 600 && balance > 0; m++) {
    const interest = Math.round(balance * r)
    let principalPart = total - interest
    if (principalPart <= 0) return rows // платёж не покрывает проценты — долг не гасится
    if (principalPart > balance) principalPart = balance
    balance -= principalPart
    rows.push({ month: m, interest, principal: principalPart, balance })
  }
  return rows
}

export default function Debts() {
  const app = useApp()
  const { data, upsertAccount } = useStore()
  const { fc } = useAnalytics(data)
  const [extraById, setExtra] = useState<Record<string, number>>({})

  const credits = data.accounts.filter((a) => !a.archived && a.type === 'credit' && a.credit)
  const debts = data.accounts.filter((a) => !a.archived && a.type === 'debt' && a.debt)
  const free = Math.max(0, fc.avgNet)
  const depositRate = data.settings.profile.depositRatePct

  const totalDebt =
    credits.reduce((s, a) => s + creditRemaining(a, data.transactions), 0) +
    debts.reduce((s, a) => s + Math.abs(Math.min(0, accountBalance(a, data.transactions))), 0)

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Долги и кредиты')}</h1>
          <div className="view-sub">
            {тр('Всего обязательств {0} · свободно в месяц {1}', money(totalDebt), money(free))}</div>
        </div>
        <button className="btn" onClick={() => app.openTab('accounts')}>
          <Icon name="plus" size={15} /> {т(' Добавить в разделе «Счета»')}</button>
      </div>

      {credits.length > 1 && (
        <div className="advice-card info" style={{ marginBottom: 16 }}>
          <div className="advice-title">{т('Порядок погашения')}</div>
          <div className="advice-body">
            {тр('При нескольких кредитах свободные деньги выгоднее направлять в тот, где выше ставка, — каждый рубль там «зарабатывает» больше. Порядок по ставке:{0}{1}.', ' ', [...credits]
              .sort((a, b) => (b.credit!.ratePct) - (a.credit!.ratePct))
              .map((a) => `${a.name} (${pct(a.credit!.ratePct, 1)})`)
              .join(' → '))}</div>
        </div>
      )}

      {credits.map((a) => {
        const cr = a.credit!
        const left = creditRemaining(a, data.transactions)
        const extra = extraById[a.id] ?? 0
        const basePlan = schedule(left, cr.ratePct, cr.monthlyPayment, 0)
        const fastPlan = schedule(left, cr.ratePct, cr.monthlyPayment, extra)
        const baseInterest = basePlan.reduce((s, r) => s + r.interest, 0)
        const fastInterest = fastPlan.reduce((s, r) => s + r.interest, 0)
        const paid = cr.principal - left
        const worthIt = cr.ratePct > depositRate

        return (
          <div key={a.id} className="card" style={{ marginBottom: 16 }}>
            <div className="row">
              <Avatar icon={a.icon} color={a.color} size="lg" />
              <div style={{ flex: 1 }}>
                <div className="strong">{a.name}</div>
                <div className="faint small">
                  {тр('{0} годовых · платёж {1} до {2} числа', pct(cr.ratePct, 1), money(cr.monthlyPayment), cr.paymentDay)}</div>
              </div>
              <div className="stat" style={{ alignItems: 'flex-end' }}>
                <span className="l">{т('Осталось')}</span>
                <span className="v neg">{money(left)}</span>
              </div>
            </div>

            <div className="bar-track" style={{ height: 8, marginTop: 14 }}>
              <div
                className="bar-fill"
                style={{ width: `${cr.principal ? (paid / cr.principal) * 100 : 0}%`, background: 'var(--good)' }}
              />
            </div>
            <div className="row small faint" style={{ marginTop: 5 }}>
              <span>{тр('выплачено {0}', money(paid))}</span>
              <span className="spacer" />
              <span>{тр('тело кредита {0}', money(cr.principal))}</span>
            </div>

            <div className="grid c2" style={{ marginTop: 18 }}>
              <div>
                <div className="card-title">{т('Досрочный платёж')}</div>
                <div className="row" style={{ gap: 12 }}>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1000000, free * 2)}
                    step={50000}
                    value={extra}
                    onChange={(e) => setExtra((s) => ({ ...s, [a.id]: Number(e.target.value) }))}
                  />
                  <span className="num strong nowrap" style={{ width: 110, textAlign: 'right' }}>{money(extra)}</span>
                </div>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  {[0, Math.round(free / 2), free, cr.monthlyPayment].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i).map((v) => (
                    <span key={v} className="chip" onClick={() => setExtra((s) => ({ ...s, [a.id]: v }))}>
                      +{money(v)}
                    </span>
                  ))}
                  <span className="chip" onClick={() => setExtra((s) => ({ ...s, [a.id]: 0 }))}>{т('сброс')}</span>
                </div>

                <div className="row" style={{ marginTop: 16, gap: 20 }}>
                  <div className="stat">
                    <span className="l">{т('Срок')}</span>
                    <span className="v" style={{ fontSize: 17 }}>{monthsWord(fastPlan.length)}</span>
                    {extra > 0 && <span className="d pos">−{monthsWord(basePlan.length - fastPlan.length)}</span>}
                  </div>
                  <div className="stat">
                    <span className="l">{т('Переплата')}</span>
                    <span className="v" style={{ fontSize: 17 }}>{money(fastInterest)}</span>
                    {extra > 0 && <span className="d pos">{тр('экономия {0}', money(baseInterest - fastInterest))}</span>}
                  </div>
                  <div className="stat">
                    <span className="l">{т('Закроется')}</span>
                    <span className="v" style={{ fontSize: 17 }}>
                      {fastPlan.length ? humanDate(addMonths(today(), fastPlan.length), true) : '—'}
                    </span>
                  </div>
                </div>

                <div className="faint small" style={{ marginTop: 12, lineHeight: 1.55 }}>
                  {worthIt ? (
                    <>
                      {тр('Ставка {0} выше доходности вклада {1} — досрочное погашение выгоднее, чем копить те же деньги под процент. Разница в вашу пользу примерно{2}{3} в месяц.', pct(cr.ratePct, 1), pct(depositRate), ' ', money(Math.round((left * (cr.ratePct - depositRate)) / 100 / 12)))}</>
                  ) : (
                    <>
                      {тр('Ставка {0} ниже доходности вклада {1} — гасить досрочно невыгодно. Те же деньги на вкладе принесут больше, чем сэкономят на процентах.', pct(cr.ratePct, 1), pct(depositRate))}</>
                  )}
                </div>
              </div>

              <div>
                <div className="card-title">{т('Как тает долг')}</div>
                <LineChart
                  height={200}
                  points={fastPlan
                    .filter((_, i) => i % Math.max(1, Math.floor(fastPlan.length / 24)) === 0)
                    .map((r) => ({ label: String(r.month), value: r.balance }))}
                  color="var(--alert)"
                />
                <div className="faint small">{т('месяцы от сегодняшнего дня')}</div>
              </div>
            </div>
          </div>
        )
      })}

      {debts.length > 0 && (
        <>
          <div className="card-title">{т('Долги людям')}</div>
          <div className="grid c2">
            {debts.map((a) => {
              const b = accountBalance(a, data.transactions)
              const amount = Math.abs(b)
              const due = a.debt?.dueDate
              const daysLeft = due ? -diffDays(due, today()) : null
              return (
                <div key={a.id} className="card tight">
                  <div className="row">
                    <Avatar icon={a.icon} color={a.color} size="lg" />
                    <div style={{ flex: 1 }}>
                      <div className="strong">{a.name}</div>
                      <div className="faint small">
                        {a.debt!.direction === 'i_owe' ? т('вы должны') : т('должны вам')} · {a.debt!.counterparty}
                      </div>
                    </div>
                    <div className={'num strong ' + (a.debt!.direction === 'i_owe' ? 'neg' : 'pos')} style={{ fontSize: 18 }}>
                      {money(amount)}
                    </div>
                  </div>
                  {due && (
                    <div className={'small ' + (daysLeft != null && daysLeft < 0 ? 'neg' : 'faint')} style={{ marginTop: 8 }}>
                      {daysLeft != null && daysLeft < 0
                        ? т('просрочено на {0} {1}', Math.abs(daysLeft), plural(Math.abs(daysLeft), 'день', 'дня', 'дней'))
                        : т('вернуть до {0} — осталось {1} {2}', humanDate(due, true), daysLeft, plural(daysLeft ?? 0, 'день', 'дня', 'дней'))}
                    </div>
                  )}
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="btn sm"
                      onClick={() =>
                        app.editTransaction({
                          kind: 'transfer',
                          amount,
                          toAccountId: a.id,
                          note: (a.debt!.direction === 'i_owe' ? т('Возврат долга: ') : т('Получен возврат: ')) + a.debt!.counterparty,
                        })
                      }
                    >
                      {a.debt!.direction === 'i_owe' ? т('Отдать') : т('Получить')}
                    </button>
                    <button className="btn sm ghost" onClick={() => app.openTab('accounts')}>{т('Изменить')}</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {!credits.length && !debts.length && (
        <div className="empty">{т('Кредитов и долгов нет — это лучшее состояние раздела.')}</div>
      )}
    </div>
  )
}
