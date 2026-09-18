/*
 * Регулярные задачи.
 *
 * Каждый повтор — отдельная задача: её отмечают, переносят и удаляют
 * отдельно, и пропущенное видно как просроченное. Но создавать все повторы
 * разом нельзя — «каждый день полгода» вывалило бы в список сто восемьдесят
 * задач. Поэтому повторы выращиваются наперёд на две недели (ежемесячные —
 * на пять недель, чтобы следующий был виден заранее) и доращиваются по мере
 * приближения — при каждом запуске и раз в час.
 *
 * grownTo — по какой день повторы уже выращены. Без этой отметки удалённый
 * руками повтор вырастал бы снова при следующем запуске.
 */
import type { Task, TaskRepeat, VaultData, ОбразецЗадачи, ЧастотаПовтора } from '../lib/types'
import { addDays, addMonths, daysInMonth, parseISO, today } from '../lib/date'

export const ВПЕРЁД_ДНЕЙ = 13
export const ВПЕРЁД_МЕСЯЧНЫЕ = 35
/** Если программу не открывали, пропущенные повторы догоняются не дальше недели. */
export const НАЗАД_ДНЕЙ = 7

const ПОЛЯ: (keyof ОбразецЗадачи)[] = [
  'title', 'important', 'priority', 'amount', 'moneyKind', 'minutes', 'categoryId', 'accountId', 'listId', 'note', 'tags',
]

/** Поля задачи, которые наследует каждый повтор. */
export function образецИз(t: Task): ОбразецЗадачи {
  const о: Record<string, unknown> = {}
  for (const к of ПОЛЯ) if (t[к] !== undefined) о[к] = к === 'tags' ? [...t.tags] : t[к]
  return о as unknown as ОбразецЗадачи
}

/** Подходит ли день под расписание (без учёта начала и конца). */
export function деньПодходит(п: Pick<TaskRepeat, 'freq' | 'days' | 'monthDay'>, день: string): boolean {
  const d = parseISO(день)
  if (п.freq === 'daily') return true
  if (п.freq === 'weekdays') return (п.days ?? []).includes(d.getDay())
  const нужно = Math.min(Math.max(1, п.monthDay ?? 1), daysInMonth(d.getFullYear(), d.getMonth()))
  return d.getDate() === нужно
}

/** Дни повтора в промежутке [от, до] с учётом его начала и конца. */
export function датыПовтора(п: TaskRepeat, от: string, до: string): string[] {
  const итог: string[] = []
  const с = от < п.start ? п.start : от
  const по = п.until && п.until < до ? п.until : до
  let д = с
  for (let i = 0; i < 800 && д <= по; i++, д = addDays(д, 1)) if (деньПодходит(п, д)) итог.push(д)
  return итог
}

/** Первый подходящий день не раньше данного; null — таких нет до конца повтора. */
export function первыйДень(п: TaskRepeat, от: string): string | null {
  return датыПовтора(п, от, addDays(от, 400))[0] ?? null
}

/** До какого дня держать повторы выращенными. */
export const горизонт = (freq: ЧастотаПовтора, now: string): string =>
  addDays(now, freq === 'monthly' ? ВПЕРЁД_МЕСЯЧНЫЕ : ВПЕРЁД_ДНЕЙ)

/** Последний день повтора по длительности: N недель или месяцев от начала. */
export function конецПовтора(start: string, сколько: number, единица: 'weeks' | 'months'): string {
  const n = Math.max(1, Math.round(сколько))
  return addDays(единица === 'weeks' ? addDays(start, n * 7) : addMonths(start, n), -1)
}

/** Задача-повтор на данный день. */
export function задачаПовтора(п: TaskRepeat, день: string, id: string, order: number, now: string): Task {
  return {
    ...п.образец,
    tags: [...(п.образец.tags ?? [])],
    id,
    done: false,
    important: п.образец.important ?? false,
    due: день,
    repeatId: п.id,
    order,
    createdAt: now,
  }
}

/**
 * Дорастить все повторы до горизонта. Возвращает те же данные, если расти
 * нечему, — чтобы не будить сохранение впустую.
 */
export function вырастить(data: VaultData, now: string = today(), newId: () => string): { data: VaultData; changed: boolean } {
  const повторы = data.taskRepeats ?? []
  if (!повторы.length) return { data, changed: false }
  const задачи = [...data.tasks]
  let changed = false
  const новыеПовторы = повторы.map((п) => {
    const до0 = горизонт(п.freq, now)
    const до = п.until && п.until < до0 ? п.until : до0
    const после = п.grownTo ? addDays(п.grownTo, 1) : п.start
    const от = [п.start, после, addDays(now, -НАЗАД_ДНЕЙ)].sort()[2]
    if (от > до) return п
    const есть = new Set(задачи.filter((t) => t.repeatId === п.id).map((t) => t.due))
    for (const день of датыПовтора(п, от, до)) {
      if (!есть.has(день)) задачи.push(задачаПовтора(п, день, newId(), задачи.length, now))
    }
    changed = true
    return { ...п, grownTo: до }
  })
  return changed ? { data: { ...data, tasks: задачи, taskRepeats: новыеПовторы }, changed } : { data, changed }
}

export interface Расписание {
  freq: ЧастотаПовтора
  days?: number[]
  monthDay?: number
  until?: string
}

/** Расписание повтора — для окна задачи. */
export const расписаниеПовтора = (п: TaskRepeat): Расписание => ({
  freq: п.freq,
  ...(п.days ? { days: п.days } : {}),
  ...(п.monthDay ? { monthDay: п.monthDay } : {}),
  ...(п.until ? { until: п.until } : {}),
})

/**
 * Завести повтор из задачи или переписать его «с этой и дальше».
 *
 * Задача сама становится первым повтором: её срок сдвигается на первый
 * подходящий день, если сам он под расписание не подходит. Открытые повторы
 * после неё удаляются и вырастают заново — уже с новыми полями и днями.
 * Выполненные и прошлые не трогаются: это история.
 */
export function задатьПовтор(
  data: VaultData,
  задача: Task,
  расп: Расписание,
  repeatId: string,
  newId: () => string,
  now: string = today(),
): VaultData {
  const start = задача.due ?? now
  const старый = (data.taskRepeats ?? []).find((п) => п.id === repeatId)
  const повтор: TaskRepeat = {
    id: repeatId,
    образец: образецИз(задача),
    freq: расп.freq,
    ...(расп.freq === 'weekdays' ? { days: [...new Set(расп.days ?? [])].sort() } : {}),
    ...(расп.freq === 'monthly' ? { monthDay: расп.monthDay ?? parseISO(start).getDate() } : {}),
    start: старый && старый.start < start ? старый.start : start,
    ...(расп.until ? { until: расп.until } : {}),
  }
  const первый = первыйДень({ ...повтор, start }, start) ?? start
  const сама: Task = { ...задача, due: первый, repeatId }
  const лишняя = (t: Task) => t.id !== задача.id && t.repeatId === repeatId && !t.done && (t.due ?? '') >= start
  const остались = data.tasks.filter((t) => !лишняя(t))
  const tasks = остались.some((t) => t.id === задача.id)
    ? остались.map((t) => (t.id === задача.id ? сама : t))
    : [...остались, сама]
  const taskRepeats = [...(data.taskRepeats ?? []).filter((п) => п.id !== repeatId), { ...повтор, grownTo: первый }]
  return вырастить({ ...data, tasks, taskRepeats }, now, newId).data
}

/** Снять повтор «с этой и дальше»: открытые повторы с этого дня уходят, новых не будет. */
export function оборватьПовтор(data: VaultData, задача: Task): VaultData {
  const п = (data.taskRepeats ?? []).find((x) => x.id === задача.repeatId)
  if (!п) return data
  const с = задача.due ?? today()
  const tasks = data.tasks.filter((t) => !(t.repeatId === п.id && !t.done && (t.due ?? '') >= с))
  const до = addDays(с, -1)
  const остались = tasks.some((t) => t.repeatId === п.id)
  const taskRepeats = (data.taskRepeats ?? [])
    .map((x) => (x.id === п.id ? { ...x, until: x.until && x.until < до ? x.until : до } : x))
    .filter((x) => x.id !== п.id || остались)
  return { ...data, tasks, taskRepeats }
}

/**
 * Для списка и матрицы: у каждого повтора — только ближайший открытый, иначе
 * «каждый день» займёт две недели строк. Календарь показывает все.
 */
export function ближайшиеПовторы(tasks: Task[]): { видимые: Task[]; скрыто: Map<string, number> } {
  const первый = new Map<string, Task>()
  const скрыто = new Map<string, number>()
  for (const t of tasks) {
    if (!t.repeatId || t.done) continue
    const был = первый.get(t.repeatId)
    if (!был || (t.due ?? '') < (был.due ?? '')) первый.set(t.repeatId, t)
  }
  const видимые = tasks.filter((t) => {
    if (!t.repeatId || t.done || первый.get(t.repeatId) === t) return true
    скрыто.set(t.repeatId, (скрыто.get(t.repeatId) ?? 0) + 1)
    return false
  })
  return { видимые, скрыто }
}

/** Задача по умолчанию из настроек — см. «Настройки» → «Новая задача». */
export function поУмолчанию(data: VaultData, now: string = today()): Partial<Task> {
  const у = data.settings.taskDefaults
  if (!у) return {}
  const p = у.priority ?? 0
  const списокЕсть = !!у.listId && (data.taskLists ?? []).some((l) => l.id === у.listId && !l.archived)
  return {
    ...(у.kind === 'time' ? { moneyKind: 'time' as const } : у.kind === 'income' ? { moneyKind: 'income' as const } : {}),
    priority: p,
    important: p >= 2,
    ...(списокЕсть ? { listId: у.listId } : {}),
    ...(у.due === 'today' ? { due: now } : у.due === 'tomorrow' ? { due: addDays(now, 1) } : {}),
  }
}
