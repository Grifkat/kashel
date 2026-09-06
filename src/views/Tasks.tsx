import React, { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, plural, uid } from '../lib/format'
import { addMonths, daysInMonth, humanDate, monthKey, monthTitle, parseISO, today, WEEKDAYS } from '../lib/date'
import { isCatalogIcon } from '../lib/catalog'
import { Confirm, Field, Modal, MoneyInput, useToast } from '../components/ui'
import { clock, usePomodoro } from '../components/PomodoroHost'
import { playTone } from '../lib/sound'
import {
  daysWithTasks, isOverdue, plannedTotals, PRIORITIES, priorityOf, QUADRANTS, quadrantOf,
  sortTasks, tasksOn, type Priority,
} from '../engine/tasks'
import { useApp } from '../App'
import type { Task } from '../lib/types'

type Tab = 'list' | 'calendar' | 'matrix' | 'timer'

const TABS: { k: Tab; t: string; icon: string }[] = [
  { k: 'list', t: 'Список', icon: 'list' },
  { k: 'calendar', t: 'Календарь', icon: 'calendar' },
  { k: 'matrix', t: 'Матрица', icon: 'scale' },
  { k: 'timer', t: 'Таймер', icon: 'clock' },
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

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Задачи</h1>
          <div className="view-sub">
            {открытые.length} {plural(открытые.length, 'дело', 'дела', 'дел')}
            {просрочено > 0 && <span className="neg"> · {просрочено} просрочено</span>}
            {(деньги.out > 0 || деньги.in > 0) && (
              <>
                {' · '}обещано потратить <b>{money(деньги.out)}</b>
                {деньги.in > 0 && <> и получить <b className="pos">{money(деньги.in)}</b></>}
              </>
            )}
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() => setEdit(пустая(data.tasks?.length ?? 0, tab === 'calendar' ? день : undefined))}
        >
          <Icon name="plus" size={15} /> Задача
        </button>
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

const пустая = (n: number, due?: string): Task => ({
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
        title={t.done ? 'Вернуть в работу' : 'Сделано'}
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
        <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.title || 'Без названия'}</span>
        {(cat || t.note || t.pomodoros) && (
          <span className="d faint small">
            {cat ? ' ' + cat.name : ''}
            {t.note ? ' · ' + t.note.slice(0, 40) : ''}
            {t.pomodoros ? ` · ${t.pomodoros} ${plural(t.pomodoros, 'помидор', 'помидора', 'помидоров')}` : ''}
          </span>
        )}
      </span>
      {важность > 0 && (
        <span className="task-flag" title={`Важность: ${PRIORITIES[важность].t.toLowerCase()}`}>
          <Icon name="sparkle" size={13} />
        </span>
      )}
      {!!t.amount && (
        <span className={'amt num ' + (t.moneyKind === 'income' ? 'pos' : '')}>
          {t.moneyKind === 'income' ? '+' : '−'}{money(t.amount)}
        </span>
      )}
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
            Входящие
          </span>
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
            placeholder="Что нужно сделать"
            onChange={(e) => setБыстро(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && добавить()}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={добавить} disabled={!быстро.trim()}>
            <Icon name="plus" size={14} /> Добавить
          </button>
        </div>

        {видимые.map((t) => <Строка key={t.id} t={t} onEdit={onEdit} />)}
        {!видимые.length && <div className="empty">Здесь пусто</div>}

        {закрытых > 0 && (
          <button className="btn sm ghost" style={{ marginTop: 10 }} onClick={() => setПоказать((v) => !v)}>
            {показать ? 'Скрыть' : 'Показать'} закрытые ({закрытых})
          </button>
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
  const шапка = firstDay === 1 ? [...WEEKDAYS.slice(1), WEEKDAYS[0]] : WEEKDAYS

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
          <button className="btn sm ghost" onClick={() => { setAnchor(today()); setSel(today()) }}>Сегодня</button>
        </div>

        <div className="task-cal">
          {шапка.map((d) => <div key={d} className="task-cal-head">{d}</div>)}
          {Array.from({ length: сдвиг }, (_, i) => <div key={'x' + i} />)}
          {Array.from({ length: дней }, (_, i) => {
            const день = `${mk}-${String(i + 1).padStart(2, '0')}`
            return (
              <button
                key={день}
                className={'task-cal-day' + (день === sel ? ' on' : '') + (день === today() ? ' now' : '')}
                onClick={() => setSel(день)}
              >
                {i + 1}
                {отмечены.has(день) && <span className="task-cal-dot" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-title">{sel ? humanDate(sel, true) : 'Выберите день'}</div>
        {наДень.map((t) => <Строка key={t.id} t={t} onEdit={onEdit} />)}
        {!наДень.length && <div className="empty">На этот день ничего не назначено</div>}
      </div>
    </>
  )
}

// ----------------------------------------------------------------- матрица

function Матрица({ onEdit }: { onEdit: (t: Task) => void }) {
  const { data, upsertTask } = useStore()
  const открытые = (data.tasks ?? []).filter((t) => !t.done)

  return (
    <>
      <div className="grid c2 matrix">
        {QUADRANTS.map((q) => {
          const свои = sortTasks(открытые.filter((t) => quadrantOf(t) === q.q))
          return (
            <div key={q.q} className={'card quad ' + q.tone}>
              <div className="card-title">
                <span className="quad-mark">{'I'.repeat(q.q <= 3 ? q.q : 0) || 'IV'}</span>
                {q.title}
                <span className="spacer" />
                <span className="faint small" style={{ textTransform: 'none', letterSpacing: 0 }}>{q.hint}</span>
              </div>
              {свои.map((t) => (
                <div key={t.id} className="cat-row">
                  <button
                    className="icon-btn"
                    title={t.important ? 'Снять «важно»' : 'Отметить важным'}
                    onClick={() => upsertTask({ ...t, important: !t.important })}
                  >
                    <Icon name={t.important ? 'sparkle' : 'circle'} size={14} />
                  </button>
                  <span className="name" style={{ cursor: 'pointer' }} onClick={() => onEdit(t)}>
                    {t.title || 'Без названия'}
                  </span>
                  {t.due && (
                    <span className={'small ' + (isOverdue(t) ? 'neg' : 'faint')}>{humanDate(t.due)}</span>
                  )}
                </div>
              ))}
              {!свои.length && <div className="empty">Пусто</div>}
            </div>
          )
        })}
      </div>
      <div className="advice-card info" style={{ marginTop: 16 }}>
        <div className="advice-title">Как задача попадает в четверть</div>
        <div className="advice-body">
          «Срочно» программа считает сама: срок сегодня, завтра или уже прошёл. «Важно» ставите вы —
          звёздочкой у задачи. Поэтому дело само переезжает выше по мере приближения срока, и матрица
          не превращается со временем в один длинный первый квадрант, как это бывает, когда срочность
          проставляют руками и забывают снимать.
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ таймер

function Таймер() {
  const { data, patchSettings } = useStore()
  const p = usePomodoro()
  const задача = p.taskId ? data.tasks.find((t) => t.id === p.taskId) : undefined
  const открытые = sortTasks((data.tasks ?? []).filter((t) => !t.done)).slice(0, 12)
  const [pick, setPick] = useState<string>('')

  return (
    <div className="grid c2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="card-title"><Icon name="clock" size={14} /> Помидор</div>
        <div className="num" style={{ fontSize: 62, fontWeight: 700, textAlign: 'center', margin: '10px 0 4px' }}>
          {clock(p.phase === 'idle' ? data.settings.pomodoro.work * 60 : p.left)}
        </div>
        <div className="faint" style={{ textAlign: 'center', marginBottom: 16 }}>
          {p.phase === 'idle' ? 'готов к работе' : p.phase === 'work' ? 'работа' : 'перерыв'}
          {задача ? ` · ${задача.title}` : ''}
          {p.doneToday > 0 && ` · закрыто отрезков: ${p.doneToday}`}
        </div>

        <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
          {p.phase === 'idle' ? (
            <button className="btn primary" onClick={() => p.start(pick || null)}>Начать</button>
          ) : (
            <>
              {p.paused
                ? <button className="btn primary" onClick={p.resume}>Продолжить</button>
                : <button className="btn" onClick={p.pause}>Пауза</button>}
              <button className="btn ghost" onClick={p.skip}>Пропустить отрезок</button>
              <button className="btn ghost" onClick={p.stop}>Сбросить</button>
            </>
          )}
        </div>

        <div className="grid c2" style={{ marginTop: 20 }}>
          <Field label="Работа, мин">
            <input
              type="number" min={1} max={120} value={data.settings.pomodoro.work}
              onChange={(e) => patchSettings({ pomodoro: { ...data.settings.pomodoro, work: Math.max(1, Number(e.target.value) || 25) } })}
            />
          </Field>
          <Field label="Перерыв, мин">
            <input
              type="number" min={1} max={60} value={data.settings.pomodoro.rest}
              onChange={(e) => patchSettings({ pomodoro: { ...data.settings.pomodoro, rest: Math.max(1, Number(e.target.value) || 5) } })}
            />
          </Field>
        </div>
        <div className="faint small" style={{ lineHeight: 1.6 }}>
          Отсчёт идёт по часам, а не по тикам, поэтому не отстаёт, пока вы смотрите другие разделы.
          Таймер продолжает идти при переключении вкладок и останавливается только закрытием программы.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Над чем работаем</div>
        <div className="faint small" style={{ marginBottom: 10 }}>
          Закрытые отрезки записываются выбранной задаче — потом видно, сколько на неё ушло.
        </div>
        <span className={'chip' + (pick === '' ? ' on' : '')} onClick={() => setPick('')}>Без задачи</span>
        {открытые.map((t) => (
          <div key={t.id} className="cat-row" style={{ cursor: 'pointer' }} onClick={() => setPick(t.id)}>
            <Icon name={pick === t.id ? 'check' : 'circle'} size={15} />
            <span className="name">{t.title || 'Без названия'}</span>
            {!!t.pomodoros && <span className="faint small">{t.pomodoros}</span>}
          </div>
        ))}
        {!открытые.length && <div className="empty">Нет открытых задач</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- карточка задачи

function TaskModal({ value, onClose }: { value: Task; onClose: () => void }) {
  const { data, upsertTask, deleteTask, addTransaction } = useStore()
  const app = useApp()
  const toast = useToast()
  const [t, setT] = useState<Task>(value)
  const [del, setDel] = useState(false)
  const patch = (p: Partial<Task>) => setT((x) => ({ ...x, ...p }))
  const есть = (data.tasks ?? []).some((x) => x.id === value.id)
  const cats = data.categories.filter((c) => !c.archived && c.kind === (t.moneyKind === 'income' ? 'income' : 'expense'))

  /** Закрыть задачу и сразу записать трату: ради этого сумма у задачи и нужна. */
  const записатьОперацию = () => {
    if (!t.amount) return
    const accountId = t.accountId || data.accounts.find((a) => a.type === 'card')?.id || data.accounts[0]?.id
    if (!accountId) {
      toast('Сначала создайте счёт — в разделе «Счета»')
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
    toast(`Записано ${money(t.amount)} и задача закрыта`)
    onClose()
  }

  return (
    <>
      <Modal
        title={есть ? 'Задача' : 'Новая задача'}
        icon="list"
        onClose={onClose}
        footer={
          <>
            {есть && (
              <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => setDel(true)}>
                <Icon name="trash" size={15} /> Удалить
              </button>
            )}
            <button className="btn" onClick={onClose}>Отмена</button>
            <button
              className="btn primary"
              onClick={() => {
                if (!t.title.trim()) {
                  toast('Напишите, что нужно сделать')
                  return
                }
                upsertTask(t)
                onClose()
              }}
            >
              Сохранить
            </button>
          </>
        }
      >
        <Field label="Что сделать">
          <input type="text" autoFocus value={t.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Найти юриста" />
        </Field>

        <div className="grid c2">
          <Field label="Срок">
            <input type="date" value={t.due ?? ''} onChange={(e) => patch({ due: e.target.value || undefined })} />
          </Field>
          <Field label="Список">
            <select value={t.listId ?? ''} onChange={(e) => patch({ listId: e.target.value || undefined })}>
              <option value="">Входящие</option>
              {(data.taskLists ?? []).filter((l) => !l.archived).map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="card-title">Важность</div>
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
          {PRIORITIES.find((p) => p.p === priorityOf(t))?.hint}. Въ матрицу идёт средняя и выше.
        </div>

        <div className="card-title">Деньги</div>
        <div className="faint small" style={{ marginBottom: 10, lineHeight: 1.6 }}>
          Сумма необязательна. Если её указать, задача попадёт в прогноз как разовая
          {t.moneyKind === 'income' ? ' прибыль' : ' трата'} в месяц своего срока, а закрыть её можно
          сразу с записью операции. Без срока сумма в прогноз не идёт — некуда её ставить.
        </div>
        <div className="grid c2">
          <Field label="Сумма">
            <MoneyInput value={t.amount} onChange={(v) => patch({ amount: v || undefined })} />
          </Field>
          <Field label="Это">
            <select
              value={t.moneyKind ?? 'expense'}
              onChange={(e) => patch({ moneyKind: e.target.value as 'expense' | 'income', categoryId: undefined })}
            >
              <option value="expense">Трата</option>
              <option value="income">Приход</option>
            </select>
          </Field>
          {!!t.amount && (
            <>
              <Field label="Категория">
                <select value={t.categoryId ?? ''} onChange={(e) => patch({ categoryId: e.target.value || undefined })}>
                  <option value="">—</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{isCatalogIcon(c.icon) ? '' : c.icon + ' '}{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Счёт">
                <select value={t.accountId ?? ''} onChange={(e) => patch({ accountId: e.target.value || undefined })}>
                  <option value="">По умолчанию</option>
                  {data.accounts.filter((a) => !a.archived).map((a) => (
                    <option key={a.id} value={a.id}>{isCatalogIcon(a.icon) ? '' : a.icon + ' '}{a.name}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>

        <Field label="Заметка">
          <input type="text" value={t.note ?? ''} onChange={(e) => patch({ note: e.target.value || undefined })} placeholder="Подробности" />
        </Field>

        {есть && !!t.amount && !t.done && (
          <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={записатьОперацию}>
              <Icon name="check" size={14} /> Закрыть и записать {money(t.amount)}
            </button>
            <button className="btn ghost" onClick={() => { onClose(); app.openTab('forecast') }}>
              Посмотреть в прогнозе
            </button>
          </div>
        )}
      </Modal>

      {del && (
        <Confirm
          title={`Удалить «${t.title || 'без названия'}»?`}
          text="Задача исчезнет насовсем. Записанные по ней операции останутся."
          onConfirm={() => { deleteTask(t.id); onClose() }}
          onClose={() => setDel(false)}
        />
      )}
    </>
  )
}
