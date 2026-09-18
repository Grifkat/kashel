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
import { прогрессЗаработка, этоЗаработок } from '../engine/zarabotok'
import { KategoriyaVybor } from '../components/KategoriyaVybor'
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

  // Свободных денег требуют только цели «накопить»: заработок в них не откладывается.
  const totalNeed = rows.filter((r) => !r.g.done && !этоЗаработок(r.g)).reduce((s, r) => s + (r.need ?? 0), 0)

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
          if (этоЗаработок(g)) return <КарточкаЗаработка key={g.id} g={g} onEdit={() => setEdit(g)} />
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
              toast(этоЗаработок(g) ? т('Укажите, сколько нужно заработать') : т('Укажите, сколько нужно собрать'))
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
  const заработок = этоЗаработок(g)

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

        <div className="seg goal-kind" style={{ marginBottom: 14 }}>
          <button type="button" className={!заработок ? 'on' : ''} onClick={() => patch({ kind: undefined })}>{т('Накопить')}</button>
          <button
            type="button"
            className={заработок ? 'on' : ''}
            onClick={() => patch({ kind: 'earn', earn: g.earn ?? { mode: 'once', categoryIds: [], start: today() } })}
          >
            {т('Заработать')}</button>
        </div>

        {заработок && g.earn ? (
          <ПоляЗаработка g={g} patch={patch} />
        ) : (
        <>
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
        </>
        )}

        <Field label={т('Заметка')}>
          <input type="text" value={g.note ?? ''} onChange={(e) => patch({ note: e.target.value })} placeholder={т('Зачем эта цель')} />
        </Field>

        {!заработок && monthsLeft && g.targetAmount > 0 && (
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

// ------------------------------------------------------------------ заработок

/**
 * Поля цели «заработать»: сумма, разовая или ежемесячная, с какой даты и с
 * каких категорий дохода. Категорий может быть несколько; ни одной — все
 * доходы.
 */
function ПоляЗаработка({ g, patch }: { g: Goal; patch: (p: Partial<Goal>) => void }) {
  const { data } = useStore()
  const e = g.earn!
  const задать = (p: Partial<NonNullable<Goal['earn']>>) => patch({ earn: { ...e, ...p } })
  const доходные = data.categories.filter((c) => !c.archived && c.kind === 'income')
  const выбраны = e.categoryIds.map((id) => data.categories.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c)
  const п = прогрессЗаработка(g, data)
  return (
    <>
      <div className="seg goal-earn-mode" style={{ marginBottom: 12 }}>
        <button type="button" className={e.mode === 'once' ? 'on' : ''} onClick={() => задать({ mode: 'once' })}>{т('К сроку')}</button>
        <button type="button" className={e.mode === 'monthly' ? 'on' : ''} onClick={() => задать({ mode: 'monthly' })}>{т('Каждый месяц')}</button>
      </div>
      <div className="grid c2">
        <Field label={e.mode === 'monthly' ? т('Сколько зарабатывать в месяц') : т('Сколько заработать')}>
          <MoneyInput value={g.targetAmount || undefined} onChange={(v) => patch({ targetAmount: v })} />
        </Field>
        {e.mode === 'once' ? (
          <Field label={т('Срок')}>
            <DateField allowEmpty value={g.targetDate ?? ''} onChange={(v) => patch({ targetDate: v || undefined })} />
          </Field>
        ) : (
          <Field label={т('Считать с')}>
            <DateField value={e.start} onChange={(v) => v && задать({ start: v })} />
          </Field>
        )}
      </div>
      {e.mode === 'once' && (
        <Field label={т('Считать с')} hint={т('Доходы до этого дня в цель не идут')}>
          <DateField value={e.start} onChange={(v) => v && задать({ start: v })} />
        </Field>
      )}
      <Field label={т('С каких категорий заработок')} hint={т('Подкатегории выбранных считаются тоже. Ни одной не выбрано — все доходы.')}>
        <div className="row wrap goal-earn-cats" style={{ gap: 6, marginBottom: 6 }}>
          {выбраны.map((c) => (
            <span key={c.id} className="chip on" onClick={() => задать({ categoryIds: e.categoryIds.filter((x) => x !== c.id) })} title={т('Убрать')}>
              {сЗначкомъ(c.icon, c.name)} <Icon name="x" size={11} />
            </span>
          ))}
          {!выбраны.length && <span className="faint small">{т('Все доходы')}</span>}
        </div>
        <KategoriyaVybor
          value=""
          onChange={(id) => id && !e.categoryIds.includes(id) && задать({ categoryIds: [...e.categoryIds, id] })}
          cats={доходные.filter((c) => !e.categoryIds.includes(c.id))}
          pusto={т('Добавить категорию…')}
        />
      </Field>
      {g.targetAmount > 0 && (
        <div className="advice-card info" style={{ padding: '10px 12px' }}>
          {e.mode === 'monthly'
            ? тр('В среднем за месяц сейчас приходит {0} — {1}', money(п.темп), п.темп >= g.targetAmount ? т('цель по силам.') : т('до цели не хватает {0} в месяц.', money(g.targetAmount - п.темп)))
            : п.нужноВМесяц != null
              ? тр('Чтобы успеть, нужно зарабатывать {0} в месяц. Сейчас в среднем — {1}.', money(п.нужноВМесяц), money(п.темп))
              : тр('Уже заработано {0}. В среднем в месяц приходит {1}.', money(п.заработано), money(п.темп))}
        </div>
      )}
    </>
  )
}

/** Карточка цели «заработать». */
function КарточкаЗаработка({ g, onEdit }: { g: Goal; onEdit: () => void }) {
  const money = useДеньги()
  const app = useApp()
  const { data, upsertGoal } = useStore()
  const удаление = useУдаление()
  const п = прогрессЗаработка(g, data)
  const категории = (g.earn?.categoryIds ?? []).map((id) => data.categories.find((c) => c.id === id)?.name).filter(Boolean)
  const достигнута = п.осталось === 0
  return (
    <div className="card fx-glare goal-earn" style={цвѣтъПодсвѣтки(g.color)}>
      <div className="row">
        <Avatar icon={g.icon} color={g.color} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 7 }}>
            <span className="strong">{g.name}</span>
            <span className="badge">{п.ежемесячная ? т('заработать в месяц') : т('заработать')}</span>
            {g.done && <span className="badge good">{т('закрыта')}</span>}
          </div>
          <div className="faint small">
            {п.ежемесячная ? т('этот месяц') : g.targetDate ? т('до {0}', humanDate(g.targetDate, true)) : т('без срока')}
            {' · '}{категории.length ? т('с категорий: {0}', категории.join(', ')) : т('все доходы')}
          </div>
        </div>
        <button className="icon-btn" onClick={onEdit}>
          <Icon name="edit" size={15} />
        </button>
      </div>

      <div className="row" style={{ margin: '14px 0 6px', alignItems: 'baseline' }}>
        <span className="num strong" style={{ fontSize: 21 }}><Money value={п.заработано} /></span>
        <span className="faint">{тр('из {0}', money(g.targetAmount))}</span>
        <span className="spacer" />
        <span className="num faint">{Math.round(п.доля * 100)}%</span>
      </div>
      <div className="bar-track" style={{ height: 8 }}>
        <div className="bar-fill" style={{ width: `${Math.min(100, п.доля * 100)}%`, background: g.color }} />
      </div>

      <div className="row wrap" style={{ marginTop: 12, gap: 18 }}>
        <div className="stat">
          <span className="l">{достигнута ? т('Цель') : т('Осталось заработать')}</span>
          <span className={'v' + (достигнута ? ' pos' : '')} style={{ fontSize: 16 }}>{достигнута ? т('достигнута') : money(п.осталось)}</span>
        </div>
        {п.срокПрошёл && (
          <div className="stat">
            <span className="l">{т('Срок')}</span>
            <span className="v neg" style={{ fontSize: 16 }}>{т('прошёл')}</span>
            <span className="d faint">{т('поправьте дату или сумму')}</span>
          </div>
        )}
        {!достигнута && п.нужноВМесяц != null && (
          <div className="stat">
            <span className="l">{т('Нужно в месяц')}</span>
            <span className={'v ' + (п.успевает === false ? 'neg' : 'pos')} style={{ fontSize: 16 }}>{money(п.нужноВМесяц)}</span>
            <span className="d faint">{тр('на {0}', monthsWord(п.месяцевДоСрока!))}</span>
          </div>
        )}
        {!достигнута && п.нужноВДень != null && (
          <div className="stat">
            <span className="l">{т('Нужно в день')}</span>
            <span className="v" style={{ fontSize: 16 }}>{money(п.нужноВДень)}</span>
            <span className="d faint">{т('осталось дней: {0}', п.днейОсталось)}</span>
          </div>
        )}
        <div className="stat">
          <span className="l">{т('Ваш темп')}</span>
          <span className={'v' + (п.успевает === false ? ' neg' : п.успевает ? ' pos' : '')} style={{ fontSize: 16 }}>{money(п.темп)}</span>
          <span className="d faint">{т('в среднем за месяц')}</span>
        </div>
      </div>

      {п.успевает === false && !достигнута && (
        <div className="faint small" style={{ marginTop: 10, lineHeight: 1.5 }}>
          {п.ежемесячная
            ? т('Обычно в месяц приходит {0} — на {1} меньше цели.', money(п.темп), money(g.targetAmount - п.темп))
            : т('При нынешнем темпе к сроку наберётся около {0} из {1}.', money(п.заработано + п.темп * (п.месяцевДоСрока ?? 0)), money(g.targetAmount))}
        </div>
      )}

      <div className="row" style={{ marginTop: 12, gap: 6 }}>
        {!g.done && (
          <button
            className="btn sm"
            onClick={() => app.editTransaction({ kind: 'income', ...(g.earn?.categoryIds[0] ? { categoryId: g.earn.categoryIds[0] } : {}) })}
          >
            <Icon name="plus" size={13} /> {т(' Записать доход')}</button>
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
}
