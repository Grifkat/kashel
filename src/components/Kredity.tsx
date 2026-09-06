import React, { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { useAnalytics } from '../state/analytics'
import { Icon } from '../lib/icons'
import { money, moneyShort, pct, plural } from '../lib/format'
import { monthTitle } from '../lib/date'
import { creditsSummary, whatIf, type Кредит } from '../engine/credit'

/*
 * Кредиты на дашбордѣ.
 *
 * Раньше кредита тутъ не было вовсе: чистый капиталъ считался по остатку
 * счёта, а долгъ лежалъ отдѣльнымъ полемъ и въ остатокъ не попадалъ. Кредитъ
 * на полмиллиона вѣсилъ ноль рублей.
 *
 * Здѣсь показано ровно то, что человѣку нужно рѣшать: сколько долженъ,
 * сколько ещё можно взять, куда ушли эти деньги, во что они обойдутся и что
 * будетъ, если платить больше. И двѣ кнопки — взять и погасить.
 *
 * Ничего своего не считается: всё беретъ движокъ кредита, тотъ же, что и
 * разделъ «Долги и кредиты».
 */

const ДОПЛАТЫ = [1_000_00, 5_000_00, 10_000_00]

export function Kredity({ style }: { style?: React.CSSProperties }) {
  const { data } = useStore()
  const app = useApp()
  const { fc } = useAnalytics(data)
  const сводка = useMemo(() => creditsSummary(data), [data])
  const [доплата, setДоплата] = useState<Record<string, number>>({})

  if (!сводка.список.length) return null

  const доход = Math.max(0, fc.avgIncome)
  const доляДохода = доход > 0 ? (сводка.payment / доход) * 100 : 0

  return (
    <div className="card kredity" style={style}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Icon name="credit" size={14} /> Кредиты
        </div>
        <span className="spacer" />
        <span className="faint small">
          должны <b className="neg">{money(сводка.debt)}</b>
          {сводка.limit > 0 && <> · свободно {money(сводка.available)}</>}
        </span>
        <button className="btn sm ghost" style={{ marginLeft: 10 }} onClick={() => app.openTab('debts')}>
          Подробно <Icon name="right" size={13} />
        </button>
      </div>

      {доход > 0 && сводка.payment > 0 && (
        <div className="faint small" style={{ marginBottom: 12 }}>
          На платежи уходит <b>{money(сводка.payment)}</b> в месяц — это{' '}
          <b className={доляДохода > 30 ? 'neg' : ''}>{pct(доляДохода, 0)}</b> дохода.
          Остаётся {money(Math.max(0, доход - сводка.payment))}.
        </div>
      )}

      {сводка.список.map((k) => (
        <Одинъ key={k.acc.id} k={k} доплата={доплата[k.acc.id] ?? 0} setДоплата={setДоплата} />
      ))}
    </div>
  )
}

function Одинъ({ k, доплата, setДоплата }: {
  k: Кредит
  доплата: number
  setДоплата: React.Dispatch<React.SetStateAction<Record<string, number>>>
}) {
  const { data } = useStore()
  const app = useApp()
  const карта = k.kind === 'card'
  const прикидка = доплата > 0 ? whatIf(k, доплата) : null
  const статья = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? 'без статьи'

  return (
    <div className="kredit-row">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <span className="strong">{k.acc.name}</span>
        <span className="faint small">{карта ? 'карта' : 'заём'} · {pct(k.ratePct, 0)} годовых</span>
        <span className="spacer" />
        <span className="num strong neg" style={{ fontSize: 17 }}>{money(k.debt)}</span>
      </div>

      {/* Лимит карты: видно, сколько уже съедено и сколько ещё можно взять. */}
      {карта && k.limit > 0 && (
        <>
          <div className="kredit-bar" title={`Использовано ${pct(k.used * 100, 0)} лимита`}>
            <span style={{ width: `${Math.round(k.used * 100)}%` }} />
          </div>
          <div className="faint small">
            взято {money(k.debt)} из {money(k.limit)} · свободно <b>{money(k.available)}</b>
          </div>
        </>
      )}

      {/* Последствия: во что обойдётся и когда кончится. */}
      <div className="faint small" style={{ marginTop: 6, lineHeight: 1.6 }}>
        {k.debt <= 0 ? (
          'Долга нет.'
        ) : k.monthsLeft == null ? (
          <span className="neg">
            Платёж {money(k.payment)} не покрывает проценты — при нём долг не гасится никогда.
            Чтобы он убывал, платить нужно больше {money(Math.ceil((k.debt * k.ratePct) / 100 / 12))} в месяц.
          </span>
        ) : (
          <>
            При платеже {money(k.payment)} закроетесь через <b>{k.monthsLeft}</b>{' '}
            {plural(k.monthsLeft, 'месяц', 'месяца', 'месяцев')}
            {k.freeMonth && <> — в {monthTitle(k.freeMonth).toLowerCase()}</>}. Переплата составит{' '}
            <b>{money(k.overpay)}</b>.
          </>
        )}
      </div>

      {/* Прикидка «а если платить больше» — тем же графиком, что и срок выше. */}
      {k.monthsLeft != null && k.debt > 0 && (
        <div className="row wrap" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
          <span className="faint small">Платить больше на</span>
          {ДОПЛАТЫ.map((v) => (
            <span
              key={v}
              className={'chip' + (доплата === v ? ' on' : '')}
              onClick={() => setДоплата((s) => ({ ...s, [k.acc.id]: доплата === v ? 0 : v }))}
            >
              {moneyShort(v)}
            </span>
          ))}
          {прикидка && (
            прикидка.faster > 0
              ? <span className="small pos">
                  раньше на {прикидка.faster} {plural(прикидка.faster, 'месяц', 'месяца', 'месяцев')},
                  сбережёте {money(прикидка.saved)}
                </span>
              : <span className="small faint">срок почти не изменится</span>
          )}
        </div>
      )}

      {/* Куда ушли кредитные деньги. Без этого долг — просто число. */}
      {k.spent.length > 0 && (
        <div className="faint small" style={{ marginTop: 8 }}>
          Потрачено с этого счёта {money(k.spentTotal)}:{' '}
          {k.spent.slice(0, 4).map((t, i) => (
            <span key={t.categoryId ?? 'нет'}>
              {i > 0 && ', '}{статья(t.categoryId)} {money(t.amount)}
            </span>
          ))}
          {k.spent.length > 4 && ` и ещё ${k.spent.length - 4}`}
        </div>
      )}

      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
        <button
          className="btn sm"
          onClick={() => app.editTransaction({ kind: 'transfer', toAccountId: k.acc.id, amount: k.payment || undefined })}
        >
          Погасить
        </button>
        <button
          className="btn sm ghost"
          onClick={() => app.editTransaction({ kind: 'expense', accountId: k.acc.id })}
        >
          Потратить с кредита
        </button>
      </div>
    </div>
  )
}
