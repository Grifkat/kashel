import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { Avatar, Field, Modal, MoneyInput, useToast } from './ui'
import { SchetVybor } from './SchetVybor'
import { Icon } from '../lib/icons'
import { humanDate, today } from '../lib/date'
import { money } from '../lib/format'
import { оповестить } from './Opoveshchenie'
import { счётПоУмолчанию } from '../engine/stats'
import { ждущія, новыеУведомления, отклонить, очиститьИсторію, подтвердитьПлатёж, уведомленія } from '../engine/uvedomleniya'
import type { Notice, VaultData } from '../lib/types'
import { т, тр } from '../i18n'

/*
 * Служба уведомлений.
 *
 * Раз в минуту смотрит, не пора ли завести уведомление о платеже, — окно
 * программы живёт сутками, и день платежа может наступить при открытом окне.
 * Новые уведомления сразу кладутся в хранилище: второй проверке их уже не
 * завести, а ответ переживёт перезапуск.
 */
const ПЕРИОД_МС = 60_000

/** Положить уведомления в хранилище: новые добавить, известные заменить. */
const сложить = (d: VaultData, список: Notice[]): VaultData => {
  const м = new Map(уведомленія(d).map((n) => [n.id, n]))
  for (const n of список) м.set(n.id, n)
  return { ...d, notifications: [...м.values()] }
}

export function UvedomleniyaHost() {
  const { data, ready, setData } = useStore()
  const toast = useToast()
  const данные = useRef(data)
  данные.current = data

  useEffect(() => {
    if (!ready) return
    const проверить = () => {
      const новые = новыеУведомления(данные.current, today())
      if (!новые.length) return
      setData((d) => сложить(d, новые), undefined, { безОтметки: true })
      for (const n of новые) {
        const acc = данные.current.accounts.find((a) => a.id === n.accountId)
        const текстъ = т('Сегодня платёж по кредиту «{0}» — {1}. Прошёл?', acc?.name ?? '', money(n.amount))
        оповестить({ title: т('Платёж по кредиту'), body: текстъ, icon: 'credit', tone: 'warn', звук: 'notice' })
      }
    }
    проверить()
    const t = setInterval(проверить, ПЕРИОД_МС)
    return () => clearInterval(t)
  }, [ready, setData, toast])

  return null
}

/** Кнопка с колокольчиком: число ждущих ответа — на ней. */
export function UvedomleniyaKnopka({ className }: { className: string }) {
  const { data } = useStore()
  const [открыто, setОткрыто] = useState(false)
  const сколько = ждущія(data).length
  return (
    <>
      <button
        className={className}
        title={сколько ? т('Уведомления: ждут ответа — {0}', сколько) : т('Уведомления')}
        onClick={() => setОткрыто(true)}
      >
        <Icon name="bell" size={17} />
        {сколько > 0 && <span className="nav-badge">{сколько}</span>}
      </button>
      {открыто && <UvedomleniyaOkno onClose={() => setОткрыто(false)} />}
    </>
  )
}

export function UvedomleniyaOkno({ onClose }: { onClose: () => void }) {
  const { data, setData } = useStore()
  const ждут = ждущія(data)
  const история = useMemo(
    () => уведомленія(data)
      .filter((n) => n.status !== 'pending')
      .sort((a, b) => ((a.resolvedAt ?? '') < (b.resolvedAt ?? '') ? 1 : -1))
      .slice(0, 100),
    [data],
  )

  return (
    <Modal
      title={т('Уведомления')}
      icon="bell"
      onClose={onClose}
      footer={
        <>
          {история.length > 0 && (
            <button
              className="btn ghost"
              style={{ marginRight: 'auto' }}
              onClick={() => setData(очиститьИсторію)}
            >
              {т('Очистить историю')}</button>
          )}
          <button className="btn" onClick={onClose}>{т('Закрыть')}</button>
        </>
      }
    >
      <div className="card-title">{т('Ждут ответа')}</div>
      {!ждут.length && (
        <div className="faint small" style={{ marginBottom: 14 }}>
          {т('Новых нет. Уведомления о платежах приходят по кредитам с галочкой «Напоминать в день платежа».')}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {ждут.map((n) => <ЖдущееУведомленіе key={n.id} n={n} />)}
      </div>

      {история.length > 0 && (
        <>
          <div className="card-title">{т('История')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {история.map((n) => {
              const acc = data.accounts.find((a) => a.id === n.accountId)
              return (
                <div key={n.id} className="row small" style={{ gap: 8 }}>
                  <Icon name={n.status === 'paid' ? 'check' : 'x'} size={14} />
                  <span style={{ flex: 1 }}>
                    {тр('{0} — платёж {1} за {2}', acc?.name ?? т('кредит удалён'), money(n.amount), humanDate(n.dueDate, true))}</span>
                  <span className={n.status === 'paid' ? 'pos' : 'faint'}>
                    {n.status === 'paid' ? т('прошёл') : т('не прошёл')}</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}

function ЖдущееУведомленіе({ n }: { n: Notice }) {
  const { data, setData, addTransaction, upsertCategory } = useStore()
  const toast = useToast()
  const кредитъ = data.accounts.find((a) => a.id === n.accountId)
  const свои = data.accounts.filter((a) => !a.archived && a.type !== 'credit' && a.type !== 'debt')
  const [счётъ, setСчётъ] = useState(() => {
    const любимый = кредитъ?.credit?.payFrom
    return любимый && свои.some((a) => a.id === любимый) ? любимый : счётПоУмолчанию(свои, data.transactions)
  })
  const [сумма, setСумма] = useState(n.amount)
  const ответъ = подтвердитьПлатёж(data, n, { счётъ, сумма })

  const прошёл = () => {
    if (!ответъ) {
      toast(т('Укажите сумму и карту, с которой платите.'))
      return
    }
    for (const с of ответъ.планъ.статьи) upsertCategory(с)
    const ids = ответъ.планъ.операціи.map((о) => addTransaction(о).id)
    setData((d) => сложить(d, [ответъ.уведомленіе(ids)]))
    toast(т('Платёж {0} по кредиту «{1}» записан', money(сумма), кредитъ?.name ?? ''))
  }
  const неПрошёл = () => setData((d) => сложить(d, [отклонить(n)]))

  return (
    <div className="card tight" style={{ borderLeft: `3px solid ${кредитъ?.color ?? 'var(--accent)'}` }}>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        {кредитъ && <Avatar icon={кредитъ.icon} color={кредитъ.color} />}
        <div style={{ flex: 1 }}>
          <div className="strong">
            {тр('Платёж по кредиту «{0}»', кредитъ?.name ?? т('кредит удалён'))}</div>
          <div className="faint small">
            {тр('по графику {0} · {1}', humanDate(n.dueDate, true), money(n.amount))}</div>
        </div>
      </div>
      {кредитъ ? (
        <>
          <div className="grid c2">
            <Field label={т('С какого счёта')}>
              <SchetVybor value={счётъ} onChange={setСчётъ} accounts={свои} />
            </Field>
            <Field label={т('Сумма')}>
              <MoneyInput value={сумма} onChange={(v) => setСумма(v)} />
            </Field>
          </div>
          {ответъ && (
            <div className="faint small" style={{ margin: '4px 0 8px' }}>
              {тр('Проценты {0}, в погашение долга {1}. В расходы попадёт {2}.', money(ответъ.планъ.проценты), money(ответъ.планъ.тѣло), money(ответъ.планъ.расходъ))}</div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" onClick={прошёл} disabled={!ответъ}>
              <Icon name="check" size={14} /> {т(' Платёж прошёл')}</button>
            <button className="btn" onClick={неПрошёл}>{т('Не прошёл')}</button>
          </div>
        </>
      ) : (
        <button className="btn" onClick={неПрошёл}>{т('Убрать')}</button>
      )}
    </div>
  )
}
