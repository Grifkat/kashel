import React, { useMemo, useState } from 'react'
import { useУдаление } from '../components/Udalenie'
import { DateField } from '../components/DateField'
import { цвѣтъПодсвѣтки } from '../components/effects'
import { сЗначкомъ } from '../lib/catalog'
import { Money, useДеньги } from '../components/anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { Icon } from '../lib/icons'
import { money, months as monthsWord, pct, uid } from '../lib/format'
import { addMonths, diffMonths, humanDate, today } from '../lib/date'
import { accountBalance, balances } from '../engine/stats'
import { Avatar, ColorPicker, Confirm, Field, IconPicker, Modal, MoneyInput, Toggle, useToast } from '../components/ui'
import type { Goal } from '../lib/types'
import { СТАТЬЯ_ЦЕЛЕЙ, планъПополненія } from '../engine/goals'
import { т, тр } from '../i18n'

export default function Goals() {
  // Суммы на экране — с учётом «Скрывать баланс».
  const money = useДеньги()
  const app = useApp()
  const { data, upsertGoal, deleteGoal } = useStore()
  const { fc } = useAnalytics(data)
  const toast = useToast()
  const [edit, setEdit] = useState<Goal | null>(null)
  const удаление = useУдаление()
  const [пополнить, setПополнить] = useState<{ goal: Goal; suggested: number } | null>(null)

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
          <h1 className="view-title">{т('Цели')}</h1>
          <div className="view-sub">
            {тр('Свободно в месяц {0} · цели требуют {1}{2}', money(Math.max(0, free)), money(totalNeed), totalNeed > Math.max(0, free) && <span className="neg"> {тр(' · не хватает {0}', money(totalNeed - Math.max(0, free)))}</span>)}</div>
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
          <Icon name="plus" size={15} /> {т(' Новая цель')}</button>
      </div>

      {totalNeed > Math.max(0, free) && free > 0 && (
        <div className="advice-card warn" style={{ marginBottom: 16 }}>
          <div className="advice-title">{т('Все цели одновременно не тянутся')}</div>
          <div className="advice-body">
            {тр('Свободных денег {0} в месяц, а цели требуют {1}. Двигать всё понемногу — худший вариант: не закроется ни одна. Оставьте активной цель с ближайшим сроком, остальные поставьте на паузу и вернитесь к ним после.', money(free), money(totalNeed))}</div>
        </div>
      )}

      <div className="grid c2">
        {rows.map(({ g, saved, left, monthsLeft, need, atPace, share }) => {
          const late = need != null && need > Math.max(0, free)
          return (
            <div key={g.id} className="card fx-glare" style={цвѣтъПодсвѣтки(g.color)}>
              <div className="row">
                <Avatar icon={g.icon} color={g.color} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <span className="strong">{g.name}</span>
                    {g.done && <span className="badge good">{т('закрыта')}</span>}
                  </div>
                  <div className="faint small">
                    {g.targetDate ? т('до {0}', humanDate(g.targetDate, true)) : т('без срока')}
                    {g.accountId ? т(' · счёт {0}', data.accounts.find((a) => a.id === g.accountId)?.name ?? т('(счёт удалён)')) : ''}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setEdit(g)}>
                  <Icon name="edit" size={15} />
                </button>
              </div>

              <div className="row" style={{ margin: '14px 0 6px', alignItems: 'baseline' }}>
                <span className="num strong" style={{ fontSize: 21 }}><Money value={saved} /></span>
                <span className="faint">{тр('из {0}', money(g.targetAmount))}</span>
                <span className="spacer" />
                <span className="num faint">{Math.round(share * 100)}%</span>
              </div>
              <div className="bar-track" style={{ height: 8 }}>
                <div className="bar-fill" style={{ width: `${Math.min(100, share * 100)}%`, background: g.color }} />
              </div>

              <div className="row" style={{ marginTop: 12, gap: 18 }}>
                <div className="stat">
                  <span className="l">{т('Осталось собрать')}</span>
                  <span className="v" style={{ fontSize: 16 }}>{money(left)}</span>
                </div>
                {/* Срок прошёл, а цель не собрана — говорим прямо. */}
                {!g.done && left > 0 && monthsLeft != null && monthsLeft <= 0 && (
                  <div className="stat">
                    <span className="l">{т('Срок')}</span>
                    <span className="v neg" style={{ fontSize: 16 }}>{т('прошёл')}</span>
                    <span className="d faint">{т('поправьте дату или сумму')}</span>
                  </div>
                )}
                {need != null && (
                  <div className="stat">
                    <span className="l">{т('Нужно в месяц')}</span>
                    <span className={'v ' + (late ? 'neg' : 'pos')} style={{ fontSize: 16 }}>{money(need)}</span>
                    <span className="d faint">{тр('на {0}', monthsWord(monthsLeft!))}</span>
                  </div>
                )}
                {atPace != null && left > 0 && (
                  <div className="stat">
                    <span className="l">{т('При текущем темпе')}</span>
                    <span className="v" style={{ fontSize: 16 }}>{monthsWord(atPace)}</span>
                    <span className="d faint">{тр('закроется {0}', humanDate(addMonths(today(), atPace), true))}</span>
                  </div>
                )}
              </div>

              {late && (
                <div className="faint small" style={{ marginTop: 10, lineHeight: 1.5 }}>
                  {тр('Чтобы уложиться в срок, нужно {0} в месяц — это больше свободных {1}. Реалистичные варианты: сдвинуть срок на {2}, снизить цель до {3} или найти {4} в месяц в расходах.', money(need!), money(Math.max(0, free)), monthsWord(Math.max(1, (atPace ?? 0) - (monthsLeft ?? 0))), money(saved + Math.max(0, free) * (monthsLeft ?? 1)), money(need! - Math.max(0, free)))}</div>
              )}

              <div className="row" style={{ marginTop: 12, gap: 6 }}>
                {/* Кнопка есть у любой открытой цели, а не только у цели со
                    сроком: цель «без срока» тоже копится. */}
                {!g.done && left > 0 && (
                  <button className="btn sm" onClick={() => setПополнить({ goal: g, suggested: Math.min(need ?? left, left) })}>
                    <Icon name="plus" size={13} /> {need != null ? т('Пополнить на {0}', money(Math.min(need, left))) : т('Пополнить')}
                  </button>
                )}
                <button className="btn sm ghost" onClick={() => upsertGoal({ ...g, done: !g.done })}>
                  {g.done ? т('Вернуть в работу') : т('Отметить закрытой')}
                </button>
                <span className="spacer" />
                <button className="btn sm danger" onClick={() => удаление.цель(g.id)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {!rows.length && <div className="empty">{т('Целей пока нет. Первая разумная цель — подушка на 3–6 месяцев расходов.')}</div>}

      {edit && (
        <GoalModal
          value={edit}
          onClose={() => setEdit(null)}
          onSave={(g) => {
            if (!g.name.trim()) {
              toast(т('Введите название цели'))
              return
            }
            if (!(g.targetAmount > 0)) {
              toast(т('Укажите, сколько нужно собрать'))
              return
            }
            upsertGoal(g)
            setEdit(null)
          }}
        />
      )}
      {пополнить && (
        <ПополнениеЦели goal={пополнить.goal} suggested={пополнить.suggested} onClose={() => setПополнить(null)} />
      )}

    </div>
  )
}

/**
 * Окно «Пополнить цель».
 *
 * Прежде кнопка открывала форму перевода со счёта на счёт — и у цели без
 * счёта перевести было некуда: форма требовала второй счёт и не давала
 * сохранить. Пополнить цель было нельзя вовсе.
 */
function ПополнениеЦели({ goal, suggested, onClose }: { goal: Goal; suggested: number; onClose: () => void }) {
  const { data, upsertGoal, upsertCategory, addTransaction } = useStore()
  const toast = useToast()
  const привязана = !!goal.accountId
  const счётЦели = data.accounts.find((a) => a.id === goal.accountId)
  const источники = data.accounts.filter((a) => !a.archived && a.id !== goal.accountId)
  const [сумма, setСумма] = useState<number>(suggested)
  const [дата, setДата] = useState(today())
  const [списать, setСписать] = useState(привязана)
  const [счётъ, setСчётъ] = useState(источники.find((a) => !a.project)?.id ?? источники[0]?.id ?? '')

  const планъ = планъПополненія(goal, сумма, дата, списать ? { счётъ } : null, data.categories.some((c) => c.id === СТАТЬЯ_ЦЕЛЕЙ.id))
  const можно = !!(планъ.цель || планъ.операція)

  const сохранить = () => {
    if (!можно) return
    if (планъ.статья) upsertCategory(планъ.статья)
    if (планъ.цель) upsertGoal(планъ.цель)
    if (планъ.операція) addTransaction(планъ.операція)
    toast(т('Цель «{0}» пополнена на {1}', goal.name, money(сумма)))
    onClose()
  }

  return (
    <Modal
      title={т('Пополнить цель «{0}»', goal.name)}
      icon="target"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{т('Отмена')}</button>
          <button className="btn primary" disabled={!можно} onClick={сохранить}>{т('Пополнить')}</button>
        </>
      }
    >
      <div className="grid c2">
        <Field label={т('Сумма')}>
          <MoneyInput value={сумма || undefined} onChange={(v) => setСумма(v)} />
        </Field>
        <Field label={т('Дата')}>
          <DateField value={дата} onChange={setДата} />
        </Field>
      </div>

      {привязана ? (
        <>
          <div className="faint small" style={{ margin: '10px 0', lineHeight: 1.55 }}>
            {тр('Эта цель — счёт «{0}»: сколько на нём лежит, столько и накоплено. Поэтому деньги переводятся на него с другого счёта, иначе цифры цели и счёта разойдутся.', счётЦели?.name)}</div>
          <Field label={т('Откуда')}>
            <select value={счётъ} onChange={(e) => setСчётъ(e.target.value)} disabled={!источники.length}>
              {источники.map((a) => <option key={a.id} value={a.id}>{сЗначкомъ(a.icon, a.name)}</option>)}
            </select>
          </Field>
          {!источники.length && <div className="neg small">{т('Другого счёта нет — переводить неоткуда.')}</div>}
        </>
      ) : (
        <>
          <div style={{ margin: '12px 0 8px' }}>
            <Toggle checked={списать} onChange={setСписать} label={т('Вычесть эти деньги со счёта')} />
          </div>
          {списать && (
            <>
              <Field label={т('С какого счёта')}>
                <select value={счётъ} onChange={(e) => setСчётъ(e.target.value)} disabled={!источники.length}>
                  {источники.map((a) => <option key={a.id} value={a.id}>{сЗначкомъ(a.icon, a.name)}</option>)}
                </select>
              </Field>
              <div className="faint small" style={{ marginTop: 6, lineHeight: 1.55 }}>
                {тр('Со счёта спишется {0} расходом по статье «Цели» — в тратах месяца это будет видно.', money(сумма || 0))}</div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

function GoalModal({ value, onSave, onClose }: { value: Goal; onSave: (g: Goal) => void; onClose: () => void }) {
  const { data } = useStore()
  const [g, setG] = useState<Goal>(value)
  const [pick, setPick] = useState(false)
  const patch = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }))
  const monthsLeft = g.targetDate ? Math.max(1, diffMonths(today(), g.targetDate)) : null
  // У цели со счётом накоплено то, что лежит на счёте, — как на карточке.
  const счётЦели = data.accounts.find((a) => a.id === g.accountId)
  const накоплено = g.accountId ? (счётЦели ? accountBalance(счётЦели, data.transactions) : 0) : g.saved

  return (
    <>
      <Modal
        title={value.name ? т('Цель') : т('Новая цель')}
        icon="target"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>{т('Отмена')}</button>
            <button className="btn primary" onClick={() => onSave(g)}>{т('Сохранить')}</button>
          </>
        }
      >
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <button className="icon-trigger" onClick={() => setPick(true)} title={т('Выбрать иконку и цвет')}>
            <Avatar icon={g.icon} color={g.color} size="lg" style={{ width: 54, height: 54 }} />
          </button>
          <div style={{ flex: 1 }}>
            <Field label={т('Название')}>
              <input type="text" autoFocus value={g.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="grid c2">
          <Field label={т('Нужная сумма')}>
            <MoneyInput value={g.targetAmount || undefined} onChange={(v) => patch({ targetAmount: v })} />
          </Field>
          <Field label={т('Срок')}>
            <DateField allowEmpty value={g.targetDate ?? ''} onChange={(v) => patch({ targetDate: v || undefined })} />
          </Field>
        </div>

        <Field label={т('Счёт-копилка')} hint={т('Если выбран, накопленное считается по остатку счёта')}>
          <select value={g.accountId ?? ''} onChange={(e) => patch({ accountId: e.target.value || undefined })}>
            <option value="">{т('Без счёта — веду вручную')}</option>
            {data.accounts.filter((a) => !a.archived).map((a) => (
              <option key={a.id} value={a.id}>{сЗначкомъ(a.icon, a.name)}</option>
            ))}
          </select>
        </Field>

        {!g.accountId && (
          <Field label={т('Уже накоплено')}>
            <MoneyInput value={g.saved} onChange={(v) => patch({ saved: v })} />
          </Field>
        )}

        <Field label={т('Заметка')}>
          <input type="text" value={g.note ?? ''} onChange={(e) => patch({ note: e.target.value })} placeholder={т('Зачем эта цель')} />
        </Field>

        {monthsLeft && g.targetAmount > 0 && (
          <div className="advice-card info" style={{ padding: '10px 12px' }}>
            {тр('До срока {0}. Чтобы успеть, откладывать нужно{1}', monthsWord(monthsLeft), ' ')}<b>{money(Math.round(Math.max(0, g.targetAmount - накоплено) / monthsLeft))}</b> {т(' в месяц.')}</div>
        )}

        <div style={{ marginTop: 14 }}>
          <Toggle checked={!!g.done} onChange={(v) => patch({ done: v })} label={т('Цель закрыта')} />
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
