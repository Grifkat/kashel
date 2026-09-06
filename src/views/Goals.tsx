import React, { useMemo, useState } from 'react'
import { Money } from '../components/anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { Icon } from '../lib/icons'
import { money, months as monthsWord, pct, uid } from '../lib/format'
import { addMonths, diffMonths, humanDate, today } from '../lib/date'
import { balances } from '../engine/stats'
import { Avatar, ColorPicker, Confirm, Field, IconPicker, Modal, MoneyInput, Toggle, useToast } from '../components/ui'
import type { Goal } from '../lib/types'

export default function Goals() {
  const app = useApp()
  const { data, upsertGoal, deleteGoal } = useStore()
  const { fc } = useAnalytics(data)
  const toast = useToast()
  const [edit, setEdit] = useState<Goal | null>(null)
  const [del, setDel] = useState<Goal | null>(null)

  const bal = balances(data.accounts, data.transactions)
  const free = fc.avgNet

  const rows = useMemo(
    () =>
      data.goals
        .map((g) => {
          const saved = g.accountId ? bal.byAccount.get(g.accountId) ?? 0 : g.saved
          const left = Math.max(0, g.targetAmount - saved)
          const monthsLeft = g.targetDate ? diffMonths(today(), g.targetDate) : null
          const need = monthsLeft && monthsLeft > 0 ? Math.round(left / monthsLeft) : null
          const atPace = free > 0 ? Math.ceil(left / free) : null
          return { g, saved, left, monthsLeft, need, atPace, share: g.targetAmount ? saved / g.targetAmount : 0 }
        })
        .sort((a, b) => Number(a.g.done ?? false) - Number(b.g.done ?? false) || a.g.priority - b.g.priority),
    [data.goals, bal, free],
  )

  const totalNeed = rows.filter((r) => !r.g.done).reduce((s, r) => s + (r.need ?? 0), 0)

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Цели</h1>
          <div className="view-sub">
            Свободно в месяц {money(Math.max(0, free))} · цели требуют {money(totalNeed)}
            {totalNeed > Math.max(0, free) && <span className="neg"> · не хватает {money(totalNeed - Math.max(0, free))}</span>}
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            setEdit({
              id: uid('g'), name: '', icon: '🎯', color: '#4cc46a', targetAmount: 0,
              targetDate: addMonths(today(), 12), saved: 0, priority: data.goals.length + 1,
            })
          }
        >
          <Icon name="plus" size={15} /> Новая цель
        </button>
      </div>

      {totalNeed > Math.max(0, free) && free > 0 && (
        <div className="advice-card warn" style={{ marginBottom: 16 }}>
          <div className="advice-title">Все цели одновременно не тянутся</div>
          <div className="advice-body">
            Свободных денег {money(free)} в месяц, а цели требуют {money(totalNeed)}. Двигать всё
            понемногу — худший вариант: не закроется ни одна. Оставьте активной цель с ближайшим сроком,
            остальные поставьте на паузу и вернитесь к ним после.
          </div>
        </div>
      )}

      <div className="grid c2">
        {rows.map(({ g, saved, left, monthsLeft, need, atPace, share }) => {
          const late = need != null && need > Math.max(0, free)
          return (
            <div key={g.id} className="card fx-glare">
              <div className="row">
                <Avatar icon={g.icon} color={g.color} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <span className="strong">{g.name}</span>
                    {g.done && <span className="badge good">закрыта</span>}
                  </div>
                  <div className="faint small">
                    {g.targetDate ? `до ${humanDate(g.targetDate, true)}` : 'без срока'}
                    {g.accountId ? ` · счёт ${data.accounts.find((a) => a.id === g.accountId)?.name}` : ''}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setEdit(g)}>
                  <Icon name="edit" size={15} />
                </button>
              </div>

              <div className="row" style={{ margin: '14px 0 6px', alignItems: 'baseline' }}>
                <span className="num strong" style={{ fontSize: 21 }}><Money value={saved} /></span>
                <span className="faint">из {money(g.targetAmount)}</span>
                <span className="spacer" />
                <span className="num faint">{Math.round(share * 100)}%</span>
              </div>
              <div className="bar-track" style={{ height: 8 }}>
                <div className="bar-fill" style={{ width: `${Math.min(100, share * 100)}%`, background: g.color }} />
              </div>

              <div className="row" style={{ marginTop: 12, gap: 18 }}>
                <div className="stat">
                  <span className="l">Осталось собрать</span>
                  <span className="v" style={{ fontSize: 16 }}>{money(left)}</span>
                </div>
                {need != null && (
                  <div className="stat">
                    <span className="l">Нужно в месяц</span>
                    <span className={'v ' + (late ? 'neg' : 'pos')} style={{ fontSize: 16 }}>{money(need)}</span>
                    <span className="d faint">на {monthsWord(monthsLeft!)}</span>
                  </div>
                )}
                {atPace != null && left > 0 && (
                  <div className="stat">
                    <span className="l">При текущем темпе</span>
                    <span className="v" style={{ fontSize: 16 }}>{monthsWord(atPace)}</span>
                    <span className="d faint">закроется {humanDate(addMonths(today(), atPace), true)}</span>
                  </div>
                )}
              </div>

              {late && (
                <div className="faint small" style={{ marginTop: 10, lineHeight: 1.5 }}>
                  Чтобы уложиться в срок, нужно {money(need!)} в месяц — это больше свободных {money(Math.max(0, free))}.
                  Реалистичные варианты: сдвинуть срок на {monthsWord(Math.max(1, (atPace ?? 0) - (monthsLeft ?? 0)))},
                  снизить цель до {money(saved + Math.max(0, free) * (monthsLeft ?? 1))} или найти {money(need! - Math.max(0, free))} в месяц в расходах.
                </div>
              )}

              <div className="row" style={{ marginTop: 12, gap: 6 }}>
                {!g.done && need != null && (
                  <button
                    className="btn sm"
                    onClick={() =>
                      app.editTransaction({
                        kind: 'transfer',
                        amount: need,
                        toAccountId: g.accountId,
                        goalId: g.id,
                        note: 'В цель: ' + g.name,
                      })
                    }
                  >
                    <Icon name="plus" size={13} /> Пополнить на {money(need)}
                  </button>
                )}
                <button className="btn sm ghost" onClick={() => upsertGoal({ ...g, done: !g.done })}>
                  {g.done ? 'Вернуть в работу' : 'Отметить закрытой'}
                </button>
                <span className="spacer" />
                <button className="btn sm danger" onClick={() => setDel(g)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {!rows.length && <div className="empty">Целей пока нет. Первая разумная цель — подушка на 3–6 месяцев расходов.</div>}

      {edit && (
        <GoalModal
          value={edit}
          onClose={() => setEdit(null)}
          onSave={(g) => {
            if (!g.name.trim()) {
              toast('Введите название цели')
              return
            }
            upsertGoal(g)
            setEdit(null)
          }}
        />
      )}
      {del && (
        <Confirm
          title={`Удалить цель «${del.name}»?`}
          text="Накопленные деньги останутся на счёте, удалится только сама цель."
          onConfirm={() => deleteGoal(del.id)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  )
}

function GoalModal({ value, onSave, onClose }: { value: Goal; onSave: (g: Goal) => void; onClose: () => void }) {
  const { data } = useStore()
  const [g, setG] = useState<Goal>(value)
  const [pick, setPick] = useState(false)
  const patch = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }))
  const monthsLeft = g.targetDate ? Math.max(1, diffMonths(today(), g.targetDate)) : null

  return (
    <>
      <Modal
        title={value.name ? 'Цель' : 'Новая цель'}
        icon="target"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>Отмена</button>
            <button className="btn primary" onClick={() => onSave(g)}>Сохранить</button>
          </>
        }
      >
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <button className="icon-trigger" onClick={() => setPick(true)} title="Выбрать иконку и цвет">
            <Avatar icon={g.icon} color={g.color} size="lg" style={{ width: 54, height: 54 }} />
          </button>
          <div style={{ flex: 1 }}>
            <Field label="Название">
              <input type="text" autoFocus value={g.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="grid c2">
          <Field label="Нужная сумма">
            <MoneyInput value={g.targetAmount || undefined} onChange={(v) => patch({ targetAmount: v })} />
          </Field>
          <Field label="Срок">
            <input type="date" value={g.targetDate ?? ''} onChange={(e) => patch({ targetDate: e.target.value })} />
          </Field>
        </div>

        <Field label="Счёт-копилка" hint="Если выбран, накопленное считается по остатку счёта">
          <select value={g.accountId ?? ''} onChange={(e) => patch({ accountId: e.target.value || undefined })}>
            <option value="">Без счёта — веду вручную</option>
            {data.accounts.filter((a) => !a.archived).map((a) => (
              <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
            ))}
          </select>
        </Field>

        {!g.accountId && (
          <Field label="Уже накоплено">
            <MoneyInput value={g.saved} onChange={(v) => patch({ saved: v })} />
          </Field>
        )}

        <Field label="Заметка">
          <input type="text" value={g.note ?? ''} onChange={(e) => patch({ note: e.target.value })} placeholder="Зачем эта цель" />
        </Field>

        {monthsLeft && g.targetAmount > 0 && (
          <div className="advice-card info" style={{ padding: '10px 12px' }}>
            До срока {monthsWord(monthsLeft)}. Чтобы успеть, откладывать нужно{' '}
            <b>{money(Math.round(Math.max(0, g.targetAmount - g.saved) / monthsLeft))}</b> в месяц.
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <Toggle checked={!!g.done} onChange={(v) => patch({ done: v })} label="Цель закрыта" />
        </div>
      </Modal>
      {pick && (
        <IconPicker
          icon={g.icon}
          color={g.color}
          onChange={(icon, color) => patch({ icon, color })}
          onClose={() => setPick(false)}
        />
      )}
    </>
  )
}
