import React, { useMemo, useState } from 'react'
import { useУдаление } from '../components/Udalenie'
import { KategoriyaVybor } from '../components/KategoriyaVybor'
import { счётПоУмолчанию } from '../engine/stats'
import { DateField } from '../components/DateField'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, plural, uid } from '../lib/format'
import { addMonths, daysInMonth, humanDate, monthKey, monthTitle, parseISO, today, WEEKDAYS, порядокъДней } from '../lib/date'
import { isCatalogIcon, сЗначкомъ } from '../lib/catalog'
import { Confirm, Field, Modal, MoneyInput, useToast } from '../components/ui'
import { clock, usePomodoro } from '../components/PomodoroHost'
import { playTone } from '../lib/sound'
import {
  daysWithTasks, isImportant, isOverdue, plannedTotals, PRIORITIES, priorityOf, QUADRANTS, quadrantOf,
  sortTasks, tasksOn, вЧетверть, переключитьВажность, времяВперёд, времяЗадачи, форматВремени, type Priority, type Quadrant,
} from '../engine/tasks'
import { useApp } from '../App'
import type { Task } from '../lib/types'
import { т, тр } from '../i18n'

type Tab = 'list' | 'calendar' | 'matrix' | 'timer'

const TABS: { k: Tab; t: string; icon: string }[] = [
  { k: 'list', t: т('Список'), icon: 'list' },
  { k: 'calendar', t: т('Календарь'), icon: 'calendar' },
  { k: 'matrix', t: т('Матрица'), icon: 'scale' },
  { k: 'timer', t: т('Таймер'), icon: 'clock' },
]

const ВХОДЯЩИЕ = '__inbox__'

export default function Tasks() {
  const { data } = useStore()
  const [tab, setTab] = useState<Tab>('calendar')
  const [edit, setEdit] = useState<Task | null>(null)
  /*
   * Выбранный въ календарѣ день поднятъ сюда нарочно: кнопка «Задача» стоитъ
   * въ шапкѣ, а день выбирается внутри календаря. Новая задача должна брать
   * именно тотъ день, на который человѣкъ смотритъ.
   */
  const [день, setДень] = useState<string>(today())

  const открытые = (data.tasks ?? []).filter((t) => !t.done)
  const просрочено = открытые.filter((t) => isOverdue(t)).length
  const деньги = plannedTotals(data)
  const время = времяВперёд(data, today(), data.settings.firstDayOfWeek)

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Задачи')}</h1>
          <div className="view-sub">
            {открытые.length} {plural(открытые.length, 'дело', 'дела', 'дел')}
            {просрочено > 0 && <span className="neg"> {тр(' · {0} просрочено', просрочено)}</span>}
            {(время.неделя > 0 || время.месяц > 0) && (
              <span className="tasks-time">
                {т(' · ⏱ на неделю {0}, на месяц {1}', форматВремени(время.неделя), форматВремени(время.месяц))}</span>
            )}
            {(деньги.out > 0 || деньги.in > 0) && (
              <>
                {тр('{0}обещано потратить ', ' · ')}<b>{money(деньги.out)}</b>
                {деньги.in > 0 && <> {т(' и получить ')}<b className="pos">{money(деньги.in)}</b></>}
              </>
            )}
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() => setEdit(пустая(data.tasks?.length ?? 0, tab === 'calendar' ? день : undefined))}
        >
          <Icon name="plus" size={15} /> {т(' Задача')}</button>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        {TABS.map((x) => (
          <button key={x.k} className={tab === x.k ? 'on' : ''} onClick={() => setTab(x.k)}>
            {x.t}
          </button>
        ))}
      </div>

      {tab === 'list' && <Список onEdit={setEdit} />}
      {tab === 'calendar' && <Календарь onEdit={setEdit} sel={день} setSel={setДень} />}
      {tab === 'matrix' && <Матрица onEdit={setEdit} />}
      {tab === 'timer' && <Таймер />}

      {edit && <TaskModal value={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

export const пустая = (n: number, due?: string): Task => ({
  id: uid('task'), title: '', done: false, important: false, priority: 0, due,
  tags: [], order: n, createdAt: today(),
})

// ------------------------------------------------------------------ строка

function Строка({ t, onEdit }: { t: Task; onEdit: (t: Task) => void }) {
  const { data, upsertTask } = useStore()
  const cat = t.categoryId ? data.categories.find((c) => c.id === t.categoryId) : undefined
  const late = isOverdue(t)

  const важность = priorityOf(t)

  return (
    <div
      className={'cat-row task-row p' + важность + (t.done ? ' done' : '')}
      style={{ opacity: t.done ? 0.45 : 1 }}
    >
      {/* Галочка — единственное, что закрывает задачу. Нажатие на остальное
          открывает её: раньше в этой программе уже была фишка, у которой
          единственным действием было удаление, и это плохо кончилось. */}
      <button
        className="icon-btn"
        title={t.done ? т('Вернуть в работу') : т('Сделано')}
        onClick={() => {
          // Звонимъ только на закрытіи. Возвратъ въ работу — не событіе,
          // а исправленіе, и подтверждать его звономъ незачѣмъ.
          if (!t.done) playTone('bell')
          upsertTask({ ...t, done: !t.done, doneAt: t.done ? undefined : today() })
        }}
      >
        <Icon name={t.done ? 'check' : 'circle'} size={16} />
      </button>
      <span className="name" style={{ cursor: 'pointer' }} onClick={() => onEdit(t)}>
        <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title || т('Без названия')}</span>
        {(cat || t.note || t.pomodoros) && (
          <span className="d faint small">
            {cat ? ' ' + cat.name : ''}
            {t.note ? ' · ' + t.note.slice(0, 40) : ''}
            {t.pomodoros ? ` · ${t.pomodoros} ${plural(t.pomodoros, 'помидор', 'помидора', 'помидоров')}` : ''}
          </span>
        )}
      </span>
      {важность > 0 && (
        <span className="task-flag" title={т('Важность: {0}', PRIORITIES[важность].t.toLowerCase())}>
          <Icon name="sparkle" size={13} />
        </span>
      )}
      {!!t.amount && t.moneyKind !== 'time' && (
        <span className={'amt num ' + (t.moneyKind === 'income' ? 'pos' : '')}>
          {t.moneyKind === 'income' ? '+' : '−'}{money(t.amount)}
        </span>
      )}
      {времяЗадачи(t) > 0 && <span className="task-time small">⏱ {форматВремени(времяЗадачи(t))}</span>}
      {t.due && (
        <span className={'small ' + (late ? 'neg' : 'faint')} style={{ minWidth: 74, textAlign: 'right' }}>
          {humanDate(t.due)}
        </span>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ список

function Список({ onEdit }: { onEdit: (t: Task) => void }) {
  const { data, upsertTask } = useStore()
  const [listId, setListId] = useState<string>(ВХОДЯЩИЕ)
  const [быстро, setБыстро] = useState('')
  const [показать, setПоказать] = useState(false)

  const все = data.tasks ?? []
  const списки = (data.taskLists ?? []).filter((l) => !l.archived)
  const свои = все.filter((t) => (listId === ВХОДЯЩИЕ ? !t.listId : t.listId === listId))
  const видимые = sortTasks(показать ? свои : свои.filter((t) => !t.done))
  const закрытых = свои.filter((t) => t.done).length

  const добавить = () => {
    const title = быстро.trim()
    if (!title) return
    upsertTask({
      ...пустая(все.length),
      title,
      ...(listId === ВХОДЯЩИЕ ? {} : { listId }),
    })
    setБыстро('')
  }

  return (
    <>
      {списки.length > 0 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
          <span className={'chip' + (listId === ВХОДЯЩИЕ ? ' on' : '')} onClick={() => setListId(ВХОДЯЩИЕ)}>
            {т('Входящие')}</span>
          {списки.map((l) => (
            <span key={l.id} className={'chip' + (listId === l.id ? ' on' : '')} onClick={() => setListId(l.id)}>
              {l.name}
            </span>
          ))}
        </div>
      )}

      <div className="card">
        {/* Быстрый ввод строкой — как во «Входящих» у любого списка дел:
            записать мысль надо за одно движение, иначе её не записывают. */}
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={быстро}
            placeholder={т('Что нужно сделать')}
            onChange={(e) => setБыстро(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && добавить()}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={добавить} disabled={!быстро.trim()}>
            <Icon name="plus" size={14} /> {т(' Добавить')}</button>
        </div>

        {видимые.map((t) => <Строка key={t.id} t={t} onEdit={onEdit} />)}
        {!видимые.length && <div className="empty">{т('Здесь пусто')}</div>}

        {закрытых > 0 && (
          <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setПоказать((v) => !v)}>
            {тр('{0} закрытые ({1})', показать ? т('Скрыть') : т('Показать'), закрытых)}</button>
        )}
      </div>
    </>
  )
}

// --------------------------------------------------------------- календарь

function Календарь({ onEdit, sel, setSel }: {
  onEdit: (t: Task) => void
  sel: string
  setSel: (d: string) => void
}) {
  const { data } = useStore()
  const [anchor, setAnchor] = useState(today())
  const mk = monthKey(anchor)
  const отмечены = useMemo(() => daysWithTasks(data, mk), [data, mk])

  const первый = parseInt(mk.slice(5, 7), 10) - 1
  const год = parseInt(mk.slice(0, 4), 10)
  const дней = daysInMonth(год, первый)
  const firstDay = data.settings.firstDayOfWeek
  const сдвиг = (new Date(год, первый, 1).getDay() - firstDay + 7) % 7
  const шапка = порядокъДней(firstDay).map((i) => WEEKDAYS[i])

  const наДень = sel ? sortTasks(tasksOn(data, sel)) : []

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="icon-btn" onClick={() => setAnchor((a) => addMonths(a, -1))}>
            <Icon name="left" size={15} />
          </button>
          <span className="strong" style={{ minWidth: 150, textAlign: 'center' }}>{monthTitle(mk)}</span>
          <button className="icon-btn" onClick={() => setAnchor((a) => addMonths(a, 1))}>
            <Icon name="right" size={15} />
          </button>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={() => { setAnchor(today()); setSel(today()) }}>{т('Сегодня')}</button>
        </div>

        <div className="task-cal">
          {шапка.map((d) => <div key={d} className="task-cal-head">{d}</div>)}
          {Array.from({ length: сдвиг }, (_, i) => <div key={'x' + i} />)}
          {Array.from({ length: дней }, (_, i) => {
            const день = `${mk}-${String(i + 1).padStart(2, '0')}`
            return (
              <button
                key={день}
                className={'task-cal-day' + (день === sel ? ' on' : '') + (день === today() ? ' now' : '')
                  + (отмечены.has(день) ? ' has p' + отмечены.get(день) : '')}
                title={отмечены.has(день) ? т('Есть задачи · важность: {0}', PRIORITIES[отмечены.get(день)!].t.toLowerCase()) : undefined}
                onClick={() => setSel(день)}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">{sel ? humanDate(sel, true) : т('Выберите день')}</div>
        {наДень.map((t) => <Строка key={t.id} t={t} onEdit={onEdit} />)}
        {!наДень.length && <div className="empty">{т('На этот день ничего не назначено')}</div>}
      </div>
    </>
  )
}

// ----------------------------------------------------------------- матрица

/** Сколько задач видно в четверти, пока её не раскрыли. */
const ВИДНО_В_ЧЕТВЕРТИ = 5

function Матрица({ onEdit }: { onEdit: (t: Task) => void }) {
  const { data, upsertTask } = useStore()
  const открытые = (data.tasks ?? []).filter((t) => !t.done)
  // Перетаскивание: id запоминаем сами — dataTransfer есть не во всех средах.
  const [тащим, setТащим] = useState<string | null>(null)
  const [над, setНад] = useState<Quadrant | null>(null)
  const [раскрыты, setРаскрыты] = useState<Set<Quadrant>>(new Set())

  const бросить = (q: Quadrant) => {
    const t = открытые.find((x) => x.id === тащим)
    setТащим(null)
    setНад(null)
    if (t && quadrantOf(t) !== q) upsertTask(вЧетверть(t, q))
  }

  return (
    <>
      <div className="grid c2 matrix">
        {QUADRANTS.map((q) => {
          const свои = sortTasks(открытые.filter((t) => quadrantOf(t) === q.q))
          const раскрыта = раскрыты.has(q.q)
          const видимые = раскрыта ? свои : свои.slice(0, ВИДНО_В_ЧЕТВЕРТИ)
          return (
            <div
              key={q.q}
              className={'card quad ' + q.tone + (над === q.q ? ' drop' : '')}
              data-quad={q.q}
              onDragOver={(e) => {
                if (!тащим) return
                e.preventDefault()
                if (над !== q.q) setНад(q.q)
              }}
              onDragLeave={(e) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setНад(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                бросить(q.q)
              }}
            >
              <div className="card-title">
                <span className="quad-mark">{'I'.repeat(q.q <= 3 ? q.q : 0) || 'IV'}</span>
                {q.title}
                <span className="spacer" />
                <span className="faint small" style={{ textTransform: 'none', letterSpacing: 0 }}>{q.hint}</span>
              </div>
              {видимые.map((t) => {
                const важность = priorityOf(t)
                return (
                  <div
                    key={t.id}
                    className={'cat-row task-row matrix-task p' + важность + (тащим === t.id ? ' dragging' : '')}
                    draggable
                    title={т('Перетащите в другую четверть')}
                    onDragStart={(e) => {
                      setТащим(t.id)
                      try { e.dataTransfer?.setData('text/plain', t.id) } catch { /* среда без переноса */ }
                    }}
                    onDragEnd={() => { setТащим(null); setНад(null) }}
                  >
                    <button
                      className="icon-btn"
                      title={т('Сделано')}
                      onClick={() => {
                        playTone('bell')
                        upsertTask({ ...t, done: true, doneAt: today() })
                      }}
                    >
                      <Icon name="circle" size={15} />
                    </button>
                    <span className="name" style={{ cursor: 'pointer' }} onClick={() => onEdit(t)}>
                      {t.title || т('Без названия')}
                    </span>
                    <button
                      className="icon-btn task-flag"
                      title={isImportant(t) ? т('Снять важность') : т('Сделать важной')}
                      onClick={() => upsertTask(переключитьВажность(t))}
                    >
                      <Icon name={isImportant(t) ? 'sparkle' : 'circle'} size={13} />
                    </button>
                    {времяЗадачи(t) > 0 && <span className="task-time small">⏱ {форматВремени(времяЗадачи(t))}</span>}
                    {t.due && (
                      <span className={'small ' + (isOverdue(t) ? 'neg' : 'faint')}>{humanDate(t.due)}</span>
                    )}
                  </div>
                )
              })}
              {свои.length > ВИДНО_В_ЧЕТВЕРТИ && (
                <button
                  className="btn sm ghost matrix-more"
                  style={{ marginTop: 6 }}
                  onClick={() => setРаскрыты((s) => {
                    const n = new Set(s)
                    if (раскрыта) n.delete(q.q)
                    else n.add(q.q)
                    return n
                  })}
                >
                  {раскрыта ? т('Свернуть') : т('Ещё {0}', свои.length - ВИДНО_В_ЧЕТВЕРТИ)}</button>
              )}
              {!свои.length && <div className="empty">{тащим ? т('Отпустите здесь') : т('Пусто')}</div>}
            </div>
          )
        })}
      </div>
      <div className="advice-card info" style={{ marginTop: 16 }}>
        <div className="advice-title">{т('Как задача попадает в четверть')}</div>
        <div className="advice-body">
          {т('«Срочно» программа считает сама: срок сегодня, завтра или уже прошёл. «Важно» — важность задачи: средняя и выше. Высокая важность (красная) сразу ставит задачу в «Срочно и важно». Задачу можно перетащить мышкой в любую четверть — там она и останется, пока вы не поменяете ей срок или важность.')}</div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------- таймер

function Таймер() {
  const { data, patchSettings } = useStore()
  const p = usePomodoro()
  const задача = p.taskId ? data.tasks.find((t) => t.id === p.taskId) : undefined
  const открытые = sortTasks((data.tasks ?? []).filter((t) => !t.done)).slice(0, 12)
  const [pick, setPick] = useState<string>('')

  return (
    <div className="grid c2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="card-title"><Icon name="clock" size={14} /> {т(' Помидор')}</div>
        <div className="num" style={{ fontSize: 62, fontWeight: 700, textAlign: 'center', margin: '10px 0 4px' }}>
          {clock(p.phase === 'idle' ? data.settings.pomodoro.work * 60 : p.left)}
        </div>
        <div className="faint" style={{ textAlign: 'center', marginBottom: 16 }}>
          {p.phase === 'idle' ? т('готов к работе') : p.phase === 'work' ? т('работа') : т('перерыв')}
          {задача ? ` · ${задача.title}` : ''}
          {p.doneToday > 0 && т(' · закрыто отрезков: {0}', p.doneToday)}
        </div>

        <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
          {p.phase === 'idle' ? (
            <button className="btn primary" onClick={() => p.start(pick || null)}>{т('Начать')}</button>
          ) : (
            <>
              {p.paused
                ? <button className="btn primary" onClick={p.resume}>{т('Продолжить')}</button>
                : <button className="btn" onClick={p.pause}>{т('Пауза')}</button>}
              <button className="btn ghost" onClick={p.skip}>{т('Пропустить отрезок')}</button>
              <button className="btn ghost" onClick={p.stop}>{т('Сбросить')}</button>
            </>
          )}
        </div>

        <div className="grid c2" style={{ marginTop: 20 }}>
          <Field label={т('Работа, мин')}>
            <input
              type="number" min={1} max={120} value={data.settings.pomodoro.work}
              onChange={(e) => patchSettings({ pomodoro: { ...data.settings.pomodoro, work: Math.max(1, Number(e.target.value) || 25) } })}
            />
          </Field>
          <Field label={т('Перерыв, мин')}>
            <input
              type="number" min={1} max={60} value={data.settings.pomodoro.rest}
              onChange={(e) => patchSettings({ pomodoro: { ...data.settings.pomodoro, rest: Math.max(1, Number(e.target.value) || 5) } })}
            />
          </Field>
        </div>
        <div className="faint small" style={{ lineHeight: 1.6 }}>
          {т('Отсчёт идёт по часам, а не по тикам, поэтому не отстаёт, пока вы смотрите другие разделы. Таймер продолжает идти при переключении вкладок и останавливается только закрытием программы.')}</div>
      </div>

      <div className="card">
        <div className="card-title">{т('Над чем работаем')}</div>
        <div className="faint small" style={{ marginBottom: 10 }}>
          {т('Закрытые отрезки записываются выбранной задаче — потом видно, сколько на неё ушло.')}</div>
        <span className={'chip' + (pick === '' ? ' on' : '')} onClick={() => setPick('')}>{т('Без задачи')}</span>
        {открытые.map((t) => (
          <div key={t.id} className="cat-row" style={{ cursor: 'pointer' }} onClick={() => setPick(t.id)}>
            <Icon name={pick === t.id ? 'check' : 'circle'} size={15} />
            <span className="name">{t.title || т('Без названия')}</span>
            {!!t.pomodoros && <span className="faint small">{t.pomodoros}</span>}
          </div>
        ))}
        {!открытые.length && <div className="empty">{т('Нет открытых задач')}</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- карточка задачи

export function TaskModal({ value, onClose }: { value: Task; onClose: () => void }) {
  const { data, upsertTask, deleteTask, addTransaction } = useStore()
  const app = useApp()
  const toast = useToast()
  const [t, setT] = useState<Task>(value)
  const удаление = useУдаление()
  const patch = (p: Partial<Task>) => setT((x) => ({ ...x, ...p }))
  const есть = (data.tasks ?? []).some((x) => x.id === value.id)
  const cats = data.categories.filter((c) => !c.archived && c.kind === (t.moneyKind === 'income' ? 'income' : 'expense'))
  const времяНаЗадачу = t.moneyKind === 'time'
  const минутыИз = (ч: number, м: number): number | undefined => (ч * 60 + м > 0 ? ч * 60 + м : undefined)

  /** Закрыть задачу и сразу записать трату: ради этого сумма у задачи и нужна. */
  const записатьОперацию = () => {
    if (!t.amount) return
    const accountId = t.accountId || счётПоУмолчанию(data.accounts, data.transactions)
    if (!accountId) {
      toast(т('Сначала создайте счёт — в разделе «Счета»'))
      return
    }
    addTransaction({
      kind: t.moneyKind === 'income' ? 'income' : 'expense',
      date: today(),
      amount: t.amount,
      accountId,
      categoryId: t.categoryId,
      tags: t.tags,
      note: t.title,
    } as never)
    playTone('bell')
    upsertTask({ ...t, done: true, doneAt: today() })
    toast(т('Записано {0} и задача закрыта', money(t.amount)))
    onClose()
  }

  return (
    <>
      <Modal
        title={есть ? т('Задача') : т('Новая задача')}
        icon="list"
        onClose={onClose}
        footer={
          <>
            {есть && (
              <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => { удаление.задачу(t.id); onClose() }}>
                <Icon name="trash" size={15} /> {т(' Удалить')}</button>
            )}
            <button className="btn" onClick={onClose}>{т('Отмена')}</button>
            <button
              className="btn primary"
              onClick={() => {
                if (!t.title.trim()) {
                  toast(т('Напишите, что нужно сделать'))
                  return
                }
                upsertTask(t)
                onClose()
              }}
            >
              {т('Сохранить')}</button>
          </>
        }
      >
        <Field label={т('Что сделать')}>
          <input type="text" autoFocus value={t.title} onChange={(e) => patch({ title: e.target.value })} placeholder={т('Найти юриста')} />
        </Field>

        <div className="grid c2">
          <Field label={т('Срок')}>
            <DateField allowEmpty value={t.due ?? ''} onChange={(v) => patch({ due: v || undefined })} />
          </Field>
          <Field label={т('Список')}>
            <select value={t.listId ?? ''} onChange={(e) => patch({ listId: e.target.value || undefined })}>
              <option value="">{т('Входящие')}</option>
              {(data.taskLists ?? []).filter((l) => !l.archived).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="card-title">{т('Важность')}</div>
        <div className="row wrap" style={{ gap: 7, marginBottom: 6 }}>
          {PRIORITIES.map((p) => (
            <span
              key={p.p}
              className={'chip prio p' + p.p + (priorityOf(t) === p.p ? ' on' : '')}
              title={p.hint}
              /* Флажокъ «важно» держимъ въ согласіи со шкалой: его читаютъ
                 старыя хранилища и матрица, если шкалы у задачи ещё нѣтъ. */
              onClick={() => patch({ priority: p.p as Priority, important: p.p >= 2 })}
            >
              {p.t}
            </span>
          ))}
        </div>
        <div className="faint small" style={{ marginBottom: 14 }}>
          {тр('{0}. В матрицу идёт средняя и выше.', PRIORITIES.find((p) => p.p === priorityOf(t))?.hint)}</div>

        <div className="card-title">{времяНаЗадачу ? т('Время') : т('Деньги')}</div>
        <div className="faint small" style={{ marginBottom: 10, lineHeight: 1.6 }}>
          {времяНаЗадачу
            ? т('Задача не про деньги: на неё уходит только время. Сколько — по желанию; оно видно у задачи и в итоге недели и месяца, а в прогноз и платежи задача не идёт.')
            : тр('Сумма необязательна. Если её указать, задача попадёт в прогноз как разовая{0} в месяц своего срока, а закрыть её можно сразу с записью операции. Без срока сумма в прогноз не идёт — некуда её ставить.', t.moneyKind === 'income' ? т(' прибыль') : т(' трата'))}</div>
        <div className="grid c2">
          {времяНаЗадачу ? (
            <Field label={т('Сколько времени (по желанию)')}>
              <div className="row task-time-input" style={{ gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  className="task-hours"
                  value={t.minutes ? Math.floor(t.minutes / 60) || '' : ''}
                  placeholder="0"
                  onChange={(e) => patch({ minutes: минутыИз(Number(e.target.value) || 0, (t.minutes ?? 0) % 60) })}
                  style={{ width: 70 }}
                />
                <span className="faint">{т('ч')}</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  className="task-mins"
                  value={t.minutes ? t.minutes % 60 || '' : ''}
                  placeholder="0"
                  onChange={(e) => patch({ minutes: минутыИз(Math.floor((t.minutes ?? 0) / 60), Math.min(59, Number(e.target.value) || 0)) })}
                  style={{ width: 70 }}
                />
                <span className="faint">{т('мин')}</span>
              </div>
            </Field>
          ) : (
            <Field label={т('Сумма')}>
              <MoneyInput value={t.amount} onChange={(v) => patch({ amount: v || undefined })} />
            </Field>
          )}
          <Field label={т('Это')}>
            <select
              className="task-kind"
              value={t.moneyKind ?? 'expense'}
              onChange={(e) => {
                const вид = e.target.value as 'expense' | 'income' | 'time'
                patch(вид === 'time'
                  ? { moneyKind: 'time', amount: undefined, categoryId: undefined, accountId: undefined }
                  : { moneyKind: вид, minutes: undefined, categoryId: undefined })
              }}
            >
              <option value="expense">{т('Трата')}</option>
              <option value="income">{т('Приход')}</option>
              <option value="time">{т('Потраченное время')}</option>
            </select>
          </Field>
          {!!t.amount && !времяНаЗадачу && (
            <>
              <Field label={т('Категория')}>
                <KategoriyaVybor
                  value={t.categoryId ?? ''}
                  onChange={(id) => patch({ categoryId: id || undefined })}
                  cats={cats}
                  pusto="—"
                />
              </Field>
              <Field label={т('Счёт')}>
                <select value={t.accountId ?? ''} onChange={(e) => patch({ accountId: e.target.value || undefined })}>
                  <option value="">{т('По умолчанию')}</option>
                  {data.accounts.filter((a) => !a.archived).map((a) => (
                    <option key={a.id} value={a.id}>{сЗначкомъ(a.icon, a.name)}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>

        <Field label={т('Заметка')}>
          <input type="text" value={t.note ?? ''} onChange={(e) => patch({ note: e.target.value || undefined })} placeholder={т('Подробности')} />
        </Field>

        {есть && !!t.amount && !времяНаЗадачу && !t.done && (
          <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={записатьОперацию}>
              <Icon name="check" size={14} /> {тр(' Закрыть и записать {0}', money(t.amount))}</button>
            <button className="btn ghost" onClick={() => { onClose(); app.openTab('forecast') }}>
              {т('Посмотреть в прогнозе')}</button>
          </div>
        )}
      </Modal>

    </>
  )
}
