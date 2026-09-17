import React, { useMemo, useState } from 'react'
import { useДеньги } from '../components/anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { Icon } from '../lib/icons'
import { money, months as monthsWord, pct, plural, toMinor } from '../lib/format'
import { addMonths, diffDays, humanDate, today } from '../lib/date'
import { creditRemaining, остатокДолга, счётПоУмолчанию } from '../engine/stats'
import { KreditDashbord } from '../components/KreditDashbord'
import { SverkaDolgov } from '../components/SverkaDolgov'
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
  // Суммы на экране — с учётом «Скрывать баланс».
  const money = useДеньги()
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
    debts.filter((a) => a.debt!.direction === 'i_owe').reduce((s, a) => s + остатокДолга(a, data.transactions), 0)

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Долги и кредиты')}</h1>
          <div className="view-sub">
            {тр('Всего обязательств {0} · свободно в месяц {1}', money(totalDebt), money(free))}</div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => app.погасить({ вид: 'new', направление: 'owed_to_me' })}>
            <Icon name="plus" size={15} /> {т(' Дать в долг')}</button>
          <button className="btn" onClick={() => app.погасить({ вид: 'new', направление: 'i_owe' })}>
            <Icon name="plus" size={15} /> {т(' Взять в долг')}</button>
          <button className="btn ghost" onClick={() => app.openTab('accounts')}>
            {т('Кредит — в разделе «Счета»')}</button>
        </div>
      </div>

      <SverkaDolgov />

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
            </div>

            {/* Сколько осталось, погашение полосой, следующий платёж и кнопка
                платежа — та же панель, что на главной при выборе кредита. */}
            <div style={{ marginTop: 14 }}>
              <KreditDashbord acc={a} compact />
            </div>

            <div className="grid c2" style={{ marginTop: 18 }}>
              <div>
                <div className="card-title">{т('Досрочный платёж')}</div>
                <div className="faint small dosrochno-hint" style={{ marginBottom: 8 }}>
                  {т('Это прикидка: ползунок показывает, как изменятся срок и переплата. Ничего не записывается, пока вы не нажмёте «Внести досрочно».')}</div>
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
                  <span className="spacer" />
                  <button
                    className="btn sm primary"
                    disabled={!(extra > 0) || left <= 0}
                    onClick={() => app.погасить({ вид: 'credit', кредит: a, сумма: Math.min(extra, left) })}
                  >
                    {т('Внести досрочно')}</button>
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
              const amount = остатокДолга(a, data.transactions)
              const мне = a.debt!.direction === 'owed_to_me'
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
                  <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
                    {amount > 0 && (
                      <button
                        className="btn sm"
                        onClick={() => app.погасить({ вид: 'debt', долг: a, действие: мне ? 'collect' : 'repay' })}
                      >
                        {мне ? т('Получить') : т('Отдать')}
                      </button>
                    )}
                    <button
                      className="btn sm ghost"
                      onClick={() => app.погасить({ вид: 'debt', долг: a, действие: мне ? 'lend' : 'borrow' })}
                    >
                      {мне ? т('Дать ещё') : т('Взять ещё')}
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
