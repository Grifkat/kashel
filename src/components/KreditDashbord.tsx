import React from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { humanDate, monthTitle, parseISO, вСтрочную } from '../lib/date'
import { money, pct, plural } from '../lib/format'
import { сводкаКредита } from '../engine/credit'
import type { Account } from '../lib/types'
import { т, тр } from '../i18n'

/**
 * Дашборд одного кредита — как карточка цели, только в обратную сторону:
 * полоса заполняется по мере погашения, а главная цифра — сколько осталось.
 *
 * Показывается на главной, когда в шапке выбран кредитный счёт, и в разделе
 * «Долги и кредиты». Цифры — из engine/credit, те же, что на карточке счёта.
 */
export function KreditDashbord({ acc, compact = false }: { acc: Account; compact?: boolean }) {
  const app = useApp()
  const { data } = useStore()
  const с = сводкаКредита(acc, data)
  const c = acc.credit
  const скрыто = data.settings.hideBalance
  const м = (v: number) => (скрыто ? '••••' : money(v))
  const закрытъ = с.debt <= 0

  return (
    <div className="card kredit-dash" style={{ borderLeft: `3px solid ${acc.color}` }}>
      <div className="row wrap" style={{ gap: 18, alignItems: 'flex-end' }}>
        <div className="stat">
          <span className="l">{закрытъ ? т('Кредит погашен') : т('Осталось погасить')}</span>
          <span className="v num" style={{ fontSize: compact ? 22 : 30, fontWeight: 700, color: 'var(--text-strong)' }}>
            {м(с.debt)}</span>
          {с.principal > 0 && (
            <span className="d faint">{тр('из {0} · погашено {1}', м(с.principal), м(с.выплачено))}</span>
          )}
        </div>
        <span className="spacer" />
        {!закрытъ && (
          <button className="btn primary" onClick={() => app.editTransaction({ debtId: acc.id, accountId: c?.payFrom })}>
            <Icon name="plus" size={15} /> {т(' Внести платёж')}</button>
        )}
      </div>

      {с.principal > 0 && (
        <>
          <div className="bar-track" style={{ height: 10, marginTop: 14 }}>
            <div className="bar-fill" style={{ width: `${Math.round(с.доля * 100)}%`, background: acc.color }} />
          </div>
          <div className="row small faint" style={{ marginTop: 5 }}>
            <span>{тр('погашено {0}', pct(с.доля * 100, 0))}</span>
            <span className="spacer" />
            {с.freeMonth && !закрытъ && <span>{тр('закроется в {0}', вСтрочную(monthTitle(с.freeMonth)))}</span>}
          </div>
        </>
      )}

      {!закрытъ && (
        <div className="grid c3" style={{ marginTop: 14, gap: 12 }}>
          <div className="stat">
            <span className="l">{т('Следующий платёж')}</span>
            <span className="v">{с.следующій ? humanDate(с.следующій, true) : '—'}</span>
            <span className="d faint">{м(Math.min(с.payment, с.debt))}</span>
          </div>
          <div className="stat">
            <span className="l">{т('Платежей осталось')}</span>
            <span className="v">{с.monthsLeft == null ? '∞' : с.monthsLeft}</span>
            <span className="d faint">
              {с.monthsLeft == null ? т('платёж не покрывает проценты') : т('{0} в месяц', м(с.payment))}</span>
          </div>
          <div className="stat">
            <span className="l">{т('Ставка')}</span>
            <span className="v">{pct(с.ratePct, 1)}</span>
            <span className="d faint">
              {с.overpay > 0 ? тр('переплата вперёд {0}', м(с.overpay)) : т('без переплаты')}</span>
          </div>
        </div>
      )}

      {!compact && (
        <>
          <div className="row small" style={{ marginTop: 14, gap: 6 }}>
            <Icon name="bell" size={13} />
            <span className="faint">
              {c?.remind
                ? т('Напоминание в день платежа включено')
                : т('Напоминание выключено — его можно включить в настройках счёта')}</span>
          </div>
          <div className="card-title" style={{ marginTop: 16 }}>{т('Платежи')}</div>
          {!с.платежи.length && <div className="faint small">{т('Платежей по этому кредиту ещё не было.')}</div>}
          {с.платежи.slice(0, 8).map((t) => {
            const съ = data.accounts.find((a) => a.id === t.accountId)
            const тѣло = t.kind === 'transfer' ? t.amount : t.debtPrincipal ?? t.amount
            return (
              <div key={t.id} className="row small" style={{ gap: 8, padding: '4px 0', cursor: 'pointer' }} onClick={() => app.editTransaction(t)}>
                <span style={{ width: 110 }}>{humanDate(t.date, parseISO(t.date).getFullYear() !== new Date().getFullYear())}</span>
                <span className="faint" style={{ flex: 1 }}>{съ ? тр('с «{0}»', съ.name) : ''}</span>
                <span className="num">{м(t.amount)}</span>
                <span className="faint num" style={{ width: 150, textAlign: 'right' }}>
                  {тр('в погашение {0}', м(тѣло))}</span>
              </div>
            )
          })}
          {с.платежи.length > 0 && (
            <div className="faint small" style={{ marginTop: 6 }}>
              {тр('Всего внесено {0} {1}', с.платежи.length, plural(с.платежи.length, 'платёж', 'платежа', 'платежей'))}</div>
          )}
        </>
      )}
    </div>
  )
}
