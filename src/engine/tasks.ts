import type { Money, Task, VaultData } from '../lib/types'
import { addDays, addMonths, monthKey, today } from '../lib/date'

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
  { q: 1, title: 'Срочно и важно', hint: 'делать сейчас', tone: 'q1' },
  { q: 2, title: 'Не срочно, но важно', hint: 'запланировать', tone: 'q2' },
  { q: 3, title: 'Срочно, но не важно', hint: 'по возможности передать', tone: 'q3' },
  { q: 4, title: 'Не срочно и не важно', hint: 'может подождать', tone: 'q4' },
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
  { p: 0, t: 'Нет', hint: 'обычное дело' },
  { p: 1, t: 'Низкая', hint: 'не забыть' },
  { p: 2, t: 'Средняя', hint: 'важно — идёт в матрицу' },
  { p: 3, t: 'Высокая', hint: 'горит' },
]

/** Важность задачи. У старых задач её нет, и «важно» там равно высокой. */
export const priorityOf = (t: Task): Priority => t.priority ?? (t.important ? 3 : 0)

/** Важное для матрицы — средняя ступень и выше. */
export const isImportant = (t: Task) => priorityOf(t) >= 2

export function quadrantOf(t: Task, now: string = today()): Quadrant {
  const urgent = isUrgent(t, now)
  if (isImportant(t)) return urgent ? 1 : 2
  return urgent ? 3 : 4
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

/** Дни месяца, на которых что-то висит: календарь ставит на них точку. */
export function daysWithTasks(data: VaultData, mk: string): Set<string> {
  const out = new Set<string>()
  for (const t of data.tasks ?? []) if (t.due && t.due.slice(0, 7) === mk && !t.done) out.add(t.due)
  return out
}
