import React, { useState } from 'react'
import { useStore } from '../state/store'
import { useToast } from './ui'
import { SchetVybor } from './SchetVybor'
import { DateField } from './DateField'
import { money } from '../lib/format'
import { today } from '../lib/date'
import { несверенныеДолги, сверитьДолг } from '../engine/pogashenie'
import type { Account } from '../lib/types'
import { т } from '../i18n'

/**
 * Сверка долгов прежних версий — один раз на долг.
 *
 * Раньше долг заводился в «Счетах» суммой, и с ваших счетов она не
 * списывалась. Гадать, так ли было на самом деле, программа не берётся:
 * спрашивает про каждый долг и делает ровно то, что ответили.
 */
export function SverkaDolgov() {
  const { data } = useStore()
  const список = несверенныеДолги(data)
  if (!список.length) return null
  return (
    <div className="advice-card warn sverka-dolgov" style={{ marginBottom: 16 }}>
      <div className="advice-title">{т('Проверьте старые долги')}</div>
      <div className="advice-body" style={{ marginBottom: 10 }}>
        {т('Эти долги заведены прежней версией: сумма вписана в сам долг, а остатки ваших счетов она не меняла. Ответьте для каждого, проходили ли эти деньги через ваш счёт.')}</div>
      {список.map((a) => (
        <Строка key={a.id} долг={a} />
      ))}
    </div>
  )
}

function Строка({ долг }: { долг: Account }) {
  const { data, setData, addTransaction } = useStore()
  const toast = useToast()
  const [счёт, setСчёт] = useState('')
  const [дата, setДата] = useState(today())
  const мне = долг.debt?.direction === 'owed_to_me'
  const сумма = Math.abs(долг.initialBalance)
  const свои = data.accounts.filter((a) => !a.archived && a.type !== 'credit' && a.type !== 'debt')
  const выбран = свои.find((a) => a.id === счёт)

  const готово = () => {
    const { accounts, операция } = сверитьДолг(data, долг.id, счёт || null, дата)
    setData((d) => ({ ...d, accounts: d.accounts.map((a) => accounts.find((x) => x.id === a.id) ?? a) }))
    if (операция) addTransaction(операция)
    toast(операция
      ? (мне ? т('Со счёта «{0}» списано {1}', выбран?.name ?? '', money(сумма)) : т('На счёт «{0}» зачислено {1}', выбран?.name ?? '', money(сумма)))
      : т('Долг «{0}» сверен, счета не менялись', долг.name))
  }

  return (
    <div className="sverka-dolg row wrap" style={{ gap: 10, padding: '8px 0', borderTop: '1px solid var(--border-soft)' }}>
      <div style={{ minWidth: 180, flex: 1 }}>
        <div className="strong">{долг.name}</div>
        <div className="faint small">
          {мне ? т('вам должны {0}', money(сумма)) : т('вы должны {0}', money(сумма))}</div>
      </div>
      <div style={{ flex: 2, minWidth: 240 }}>
        <div className="small" style={{ marginBottom: 4 }}>
          {мне ? т('Эти деньги ушли с вашего счёта?') : т('Эти деньги пришли на ваш счёт?')}</div>
        <SchetVybor value={счёт} onChange={setСчёт} accounts={свои} vse={т('Нет — счета не менять')} />
        {выбран && (
          <div className="faint small" style={{ marginTop: 4, lineHeight: 1.5 }}>
            {мне
              ? т('Остаток «{0}» уменьшится на {1}. Выбирайте, если в программе на нём сейчас на эту сумму больше, чем на самом деле.', выбран.name, money(сумма))
              : т('Остаток «{0}» увеличится на {1}. Выбирайте, если в программе на нём сейчас на эту сумму меньше, чем на самом деле.', выбран.name, money(сумма))}
          </div>
        )}
      </div>
      {выбран && (
        <div style={{ width: 150 }}>
          <div className="small" style={{ marginBottom: 4 }}>{т('Когда')}</div>
          <DateField value={дата} onChange={setДата} />
        </div>
      )}
      <button className="btn sm primary" onClick={готово}>{т('Готово')}</button>
    </div>
  )
}
