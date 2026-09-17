import type { Money, Task, VaultData } from '../lib/types'
import { addDays, addMonths, monthKey, today } from '../lib/date'
import { т } from '../i18n'

/*
 * Задачи: срочность, четверти матрицы и запланированные деньги.
 *
 * Срочность нигде не хранится — она считается от срока. Это и есть смысл
 * матрицы Эйзенхауэра: дело само переползает в «срочное» по мере приближения
 * срока, а не потому, что кто-то не забыл переставить флажок. Хранить флаг
 * «срочно» означало бы, что вчерашняя срочность останется срочностью и через
 * месяц, и матрица со временем превратится в один длинный первый квадрант.
 */

/** Сколько дней впереди считаются срочными. Сегодня, завтра и всё просроченное. */
export const URGENT_DAYS = 1

export type Quadrant = 1 | 2 | 3 | 4

export const QUADRANTS: { q: Quadrant; title: string; hint: string; tone: string }[] = [
  { q: 1, title: т('Срочно и важно'), hint: т('делать сейчас'), tone: 'q1' },
  { q: 2, title: т('Не срочно, но важно'), hint: т('запланировать'), tone: 'q2' },
  { q: 3, title: т('Срочно, но не важно'), hint: т('по возможности передать'), tone: 'q3' },
  { q: 4, title: т('Не срочно и не важно'), hint: т('может подождать'), tone: 'q4' },
]

export const isOverdue = (t: Task, now: string = today()): boolean => !!t.due && !t.done && t.due < now

export const isUrgent = (t: Task, now: string = today()): boolean =>
  !!t.due && t.due <= addDays(now, URGENT_DAYS)

/*
 * Важность.
 *
 * Шкала о четырёх ступенях, а у матрицы Эйзенхауэра ось только «да/нет».
 * Границу проводим по средней: низкая важность — это «не забыть», а не
 * «важно». Иначе во второй квадрант попадало бы всё подряд и матрица
 * перестала бы отделять существенное от прочего.
 */
export type Priority = 0 | 1 | 2 | 3

export const PRIORITIES: { p: Priority; t: string; hint: string }[] = [
  { p: 0, t: т('Нет'), hint: т('обычное дело') },
  { p: 1, t: т('Низкая'), hint: т('не забыть') },
  { p: 2, t: т('Средняя'), hint: т('важно — идёт в матрицу') },
  { p: 3, t: т('Высокая'), hint: т('горит') },
]

/** Важность задачи. У старых задач её нет, и «важно» там равно высокой. */
export const priorityOf = (t: Task): Priority => t.priority ?? (t.important ? 3 : 0)

/** Важное для матрицы — средняя ступень и выше. */
export const isImportant = (t: Task) => priorityOf(t) >= 2

/**
 * Четверть задачи.
 *
 * Руками перенесённая задача стоит, где поставили, пока у неё прежние срок
 * и важность. Высокая важность («горит») — сразу первая четверть, какой бы
 * ни была дата. Остальное — по сроку и важности, как у Эйзенхауэра.
 */
export function quadrantOf(t: Task, now: string = today()): Quadrant {
  const р = t.matrix
  if (р && р.due === (t.due ?? '') && р.p === priorityOf(t)) return р.q
  // Только явно выставленная высокая важность: у старых задач с одним флажком «важно»
  // срочность по-прежнему решает срок.
  if (t.priority === 3) return 1
  const urgent = isUrgent(t, now)
  if (isImportant(t)) return urgent ? 1 : 2
  return urgent ? 3 : 4
}

/** Задача, перенесённая в четверть руками. */
export const вЧетверть = (t: Task, q: Quadrant): Task => ({ ...t, matrix: { q, due: t.due ?? '', p: priorityOf(t) } })

/** Сделать важной или снять важность — из матрицы одним нажатием. */
export function переключитьВажность(t: Task): Task {
  const p: Priority = isImportant(t) ? 0 : 2
  return { ...t, priority: p, important: p >= 2 }
}

/**
 * Порядок списка: незакрытые вперёд, ближний срок выше, внутри одного дня —
 * важные впереди, бессрочные в конце и тоже по важности.
 *
 * Срок стоит выше важности намеренно. Срок — это факт, важность — мнение;
 * если пустить важность вперёд, задача на послезавтра с красной меткой
 * заслонит сегодняшнюю без метки, и список перестанет показывать, что горит.
 * Зато внутри одного дня и среди бессрочных важность решает всё — там как раз
 * и нужно, чтобы существенное было сверху.
 *
 * Бессрочные именно в конце, а не в начале: список без сроков — это склад
 * идей, и он не должен заслонять то, что горит.
 */
export function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (!!a.due !== !!b.due) return a.due ? -1 : 1
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
    const важность = priorityOf(b) - priorityOf(a)
    if (важность) return важность
    return a.order - b.order
  })
}

/** Сколько денег обещано задачами в каждом месяце. Знак: приход плюс, трата минус. */
export function plannedByMonth(data: VaultData, now: string = today()): Map<string, Money> {
  const out = new Map<string, Money>()
  // Прогноз начинается со следующего месяца, поэтому всё, что обещано на этот
  // месяц или просрочено, кладём в первый прогнозный. Деньги не исчезают и не
  // раздваиваются, а раньше показать их линии всё равно негде.
  const firstForecast = monthKey(addMonths(now, 1))
  for (const t of data.tasks ?? []) {
    if (t.done || !t.amount || !t.due) continue
    const mk = monthKey(t.due)
    const key = mk <= monthKey(now) ? firstForecast : mk
    const signed = t.moneyKind === 'income' ? t.amount : -t.amount
    out.set(key, (out.get(key) ?? 0) + signed)
  }
  return out
}

/** Итог по задачам-деньгам: сколько обещано потратить и получить впереди. */
export function plannedTotals(data: VaultData, now: string = today()): { out: Money; in: Money } {
  let outSum = 0
  let inSum = 0
  for (const t of data.tasks ?? []) {
    if (t.done || !t.amount || !t.due) continue
    if (t.moneyKind === 'income') inSum += t.amount
    else outSum += t.amount
  }
  void now
  return { out: outSum, in: inSum }
}

/** Задачи со сроком в этот день. Нужен и календарю, и напоминаниям. */
export const tasksOn = (data: VaultData, day: string): Task[] =>
  (data.tasks ?? []).filter((t) => t.due === day)

/**
 * Дни месяца, на которых что-то висит, и самая высокая важность в этот день:
 * календарь заливает день её цветом.
 */
export function daysWithTasks(data: VaultData, mk: string): Map<string, Priority> {
  const out = new Map<string, Priority>()
  for (const t of data.tasks ?? []) {
    if (!t.due || t.due.slice(0, 7) !== mk || t.done) continue
    const p = priorityOf(t)
    if (!out.has(t.due) || p > out.get(t.due)!) out.set(t.due, p)
  }
  return out
}
