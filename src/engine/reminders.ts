import type { Reminder, ReminderEvent, VaultData } from '../lib/types'
import { addDays, addMonths, diffDays, humanDate, monthKey, parseISO, today } from '../lib/date'
import { money } from '../lib/format'
import { balances, categoryMonthly } from './stats'
import { occurrencesInMonth } from './forecast'

/*
 * Когда напоминание должно сработать.
 *
 * Правило одно на оба вида: напоминание срабатывает не чаще раза в день.
 * Отметка lastFired нужна не для красоты — без неё «давно не вносили траты»
 * звонило бы при каждом открытии окна, и человек выключил бы напоминания
 * в первый же день.
 */

export interface DueReminder {
  reminder: Reminder
  /** Что показать: заголовок человека плюс поясняющая строка от программы. */
  detail: string
}

export const EVENT_NAMES: Record<ReminderEvent, string> = {
  'recurring-due': 'Скоро регулярный платёж',
  'no-entries': 'Давно не вносили операции',
  'limit-exceeded': 'Категория вышла за лимит',
  'big-expense': 'Необычно крупная трата',
  'low-balance': 'Остаток счёта ниже порога',
  'task-due': 'Скоро срок задачи',
}

/** Что значит threshold у каждого события — подпись к полю в форме. */
export const EVENT_THRESHOLD: Record<ReminderEvent, { label: string; unit: 'days' | 'money' | 'times'; def: number }> = {
  'recurring-due': { label: 'За сколько дней предупредить', unit: 'days', def: 1 },
  'no-entries': { label: 'Сколько дней молчания терпеть', unit: 'days', def: 5 },
  'limit-exceeded': { label: 'С какого процента лимита предупреждать', unit: 'times', def: 100 },
  'big-expense': { label: 'Во сколько раз больше обычного', unit: 'times', def: 3 },
  'low-balance': { label: 'Ниже какой суммы предупреждать', unit: 'money', def: 1_000_000 },
  'task-due': { label: 'За сколько дней предупредить', unit: 'days', def: 1 },
}

/**
 * Следующий день, когда напоминание по дате должно прозвучать.
 *
 * Разовое просто ждёт своей даты. Повторяющееся отматывается вперёд от
 * заданной: если человек завёл «5 числа каждый месяц» полгода назад, звонить
 * надо пятого числа этого месяца, а не шесть раз подряд за прошлое.
 */
export function nextDate(r: Reminder, now: string = today()): string | null {
  if (!r.date) return null
  if (!r.repeat || r.repeat === 'once') return r.date
  let d = r.date
  let guard = 0
  while (d < now && guard++ < 400) {
    d = r.repeat === 'weekly' ? addDays(d, 7) : r.repeat === 'yearly' ? addMonths(d, 12) : addMonths(d, 1)
  }
  return d
}

/** Ближайшее срабатывание регулярного платежа, если оно вообще есть впереди. */
function nearestRecurring(data: VaultData, within: number, now: string): { title: string; date: string; amount: number } | null {
  let best: { title: string; date: string; amount: number } | null = null
  for (const r of data.recurring) {
    if (!r.active) continue
    // День месяца знаем только у месячных правил; у остальных берём начало
    // ближайшего месяца, в котором правило вообще срабатывает.
    for (let i = 0; i <= 1; i++) {
      const mk = monthKey(addMonths(now, i))
      if (!occurrencesInMonth(r, mk)) continue
      const day = String(Math.min(28, r.dayOfMonth ?? (Number(r.startDate.slice(8, 10)) || 1))).padStart(2, '0')
      const when = `${mk}-${day}`
      if (when < now) continue
      const away = diffDays(now, when)
      if (away > within) continue
      if (!best || when < best.date) best = { title: r.title, date: when, amount: r.amount }
      break
    }
  }
  return best
}

/** Насколько крупной была последняя трата по сравнению с обычной в своей категории. */
function biggestOutlier(data: VaultData, times: number, now: string): string | null {
  const recent = data.transactions.filter((t) => t.kind === 'expense' && t.date === now)
  if (!recent.length) return null
  const keys = [monthKey(addMonths(now, -3)), monthKey(addMonths(now, -2)), monthKey(addMonths(now, -1))]
  for (const t of recent.sort((a, b) => b.amount - a.amount)) {
    if (!t.categoryId) continue
    const hist = categoryMonthly(data.transactions, t.categoryId, keys, false, 'expense')
    const past = data.transactions.filter(
      (x) => x.kind === 'expense' && x.categoryId === t.categoryId && x.date < now,
    )
    if (past.length < 3 || !hist.some((v) => v > 0)) continue
    const avg = past.reduce((s, x) => s + x.amount, 0) / past.length
    if (avg > 0 && t.amount >= avg * times) {
      const name = data.categories.find((c) => c.id === t.categoryId)?.name ?? 'без категории'
      return `${name}: ${money(t.amount)} при обычных ${money(Math.round(avg))}`
    }
  }
  return null
}

/** Категории, вышедшие за свой месячный лимит. */
function overLimit(data: VaultData, pct: number, now: string, only?: string): string | null {
  const mk = monthKey(now)
  const out: string[] = []
  for (const c of data.categories) {
    if (c.archived || !c.plan || (only && c.id !== only)) continue
    const spent = categoryMonthly(data.transactions, c.id, [mk], false, c.kind)[0]
    if (spent >= (c.plan * pct) / 100) out.push(`${c.name} ${money(spent)} из ${money(c.plan)}`)
  }
  return out.length ? out.join(' · ') : null
}

/** Условие события выполнено? Тогда вернуть поясняющую строку, иначе null. */
function eventFired(r: Reminder, data: VaultData, now: string): string | null {
  const th = r.threshold ?? (r.event ? EVENT_THRESHOLD[r.event].def : 0)
  switch (r.event) {
    case 'recurring-due': {
      const near = nearestRecurring(data, th, now)
      if (!near) return null
      const away = diffDays(now, near.date)
      return `${near.title} — ${money(near.amount)} ${away === 0 ? 'сегодня' : away === 1 ? 'завтра' : `через ${away} дн.`}`
    }
    case 'no-entries': {
      if (!data.transactions.length) return null
      const last = data.transactions.reduce((m, t) => (t.date > m ? t.date : m), data.transactions[0].date)
      const away = diffDays(last, now)
      return away >= th ? `Последняя запись — ${humanDate(last)}, это ${away} дн. назад` : null
    }
    case 'limit-exceeded':
      return overLimit(data, th, now, r.categoryId)
    case 'big-expense':
      return biggestOutlier(data, th, now)
    case 'task-due': {
      // Просроченное тоже считается: срок прошёл — значит уже горит.
      const край = addDays(now, th)
      const свои = (data.tasks ?? []).filter((t) => !t.done && t.due && t.due <= край)
      if (!свои.length) return null
      const ближние = свои.sort((a, b) => (a.due! < b.due! ? -1 : 1)).slice(0, 3)
      return ближние
        .map((t) => `${t.title} — ${t.due! < now ? 'просрочено' : t.due === now ? 'сегодня' : humanDate(t.due!)}`)
        .join(' · ') + (свои.length > 3 ? ` и ещё ${свои.length - 3}` : '')
    }
    case 'low-balance': {
      const bal = balances(data.accounts, data.transactions)
      const list = data.accounts
        .filter((a) => !a.archived && (!r.accountId || a.id === r.accountId))
        .map((a) => ({ a, v: bal.byAccount.get(a.id) ?? 0 }))
        .filter((x) => x.v < th)
      return list.length ? list.map((x) => `${x.a.name}: ${money(x.v)}`).join(' · ') : null
    }
    default:
      return null
  }
}

/**
 * Какие напоминания надо показать прямо сейчас.
 *
 * Чистая функция: ничего не показывает и ничего не сохраняет — только считает.
 * Отметку lastFired ставит тот, кто действительно показал.
 */
export function dueReminders(data: VaultData, now: string = today()): DueReminder[] {
  const out: DueReminder[] = []
  for (const r of data.reminders ?? []) {
    if (!r.active) continue
    if (r.lastFired === now) continue
    if (r.kind === 'date') {
      const when = nextDate(r, now)
      // Пропущенное разовое напоминание не выбрасываем: человек мог не
      // открывать программу неделю, и «заплатить за квартиру» всё ещё в силе.
      if (when && when <= now) out.push({ reminder: r, detail: when === now ? 'сегодня' : `было ${humanDate(when)}` })
      continue
    }
    const detail = eventFired(r, data, now)
    if (detail) out.push({ reminder: r, detail })
  }
  return out
}

/** Человеческое описание напоминания для списка. */
export function describeReminder(r: Reminder, data: VaultData): string {
  if (r.kind === 'date') {
    const when = nextDate(r) ?? r.date ?? ''
    const rep =
      r.repeat === 'monthly' ? ', каждый месяц'
        : r.repeat === 'weekly' ? ', каждую неделю'
          : r.repeat === 'yearly' ? ', каждый год' : ''
    return `${when ? humanDate(when, parseISO(when).getFullYear() !== new Date().getFullYear()) : 'без даты'}${rep}`
  }
  if (!r.event) return 'событие не выбрано'
  const th = r.threshold ?? EVENT_THRESHOLD[r.event].def
  const unit = EVENT_THRESHOLD[r.event].unit
  const val = unit === 'money' ? money(th) : unit === 'days' ? `${th} дн.` : `${th}${r.event === 'limit-exceeded' ? '%' : '×'}`
  const где =
    r.event === 'low-balance' && r.accountId
      ? ` · ${data.accounts.find((a) => a.id === r.accountId)?.name ?? '?'}`
      : r.event === 'limit-exceeded' && r.categoryId
        ? ` · ${data.categories.find((c) => c.id === r.categoryId)?.name ?? '?'}`
        : ''
  return `${EVENT_NAMES[r.event]} · ${val}${где}`
}
