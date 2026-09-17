/*
 * Платежи этого месяца — обязательное, что уже прошло или ещё предстоит.
 *
 * Три источника: кредиты по графику, регулярные расходы и задачи с суммой
 * «трата» и сроком в этом месяце. Для каждого — дата, сумма и оплачено ли.
 * Ничего своего о платежах программа не хранит: «оплачено» выводится из
 * записанных операций (или закрытой задачи), как и везде.
 */
import type { Account, Money, Recurring, Task, Transaction, VaultData } from '../lib/types'
import { endOfMonth, monthKey, startOfMonth, today } from '../lib/date'
import { creditRemaining } from './stats'
import { СТАТЬЯ_ПЛАТЕЖЕЙ, СТАТЬЯ_ПРОЦЕНТОВ, датыПлатежей, этоПлатёжПо } from './credit'
import { датыПравила } from './avtospisaniya'
import { т } from '../i18n'

export type ВидПлатежа = 'credit' | 'recurring' | 'task'
/** paid — внесено; overdue — срок прошёл; today — сегодня; soon — в ближайшие 3 дня; later — позже; unmarked — было до учёта в программе. */
export type СтатусПлатежа = 'paid' | 'overdue' | 'today' | 'soon' | 'later' | 'unmarked'

export interface ПлатёжМесяца {
  id: string
  вид: ВидПлатежа
  название: string
  дата: string
  сумма: Money
  /** Сколько уже внесено в счёт этого платежа. */
  внесено: Money
  статус: СтатусПлатежа
  /** Кредит, правило или задача. */
  ref: string
}

export interface ПлатежиМесяца {
  список: ПлатёжМесяца[]
  всего: Money
  оплачено: Money
  осталось: Money
  просрочено: Money
}

const ДНЕЙ_СКОРО = 3

function статус(дата: string, внесено: Money, сумма: Money, now: string): СтатусПлатежа {
  if (внесено >= сумма) return 'paid'
  if (дата < now) return 'overdue'
  if (дата === now) return 'today'
  const скоро = new Date(now + 'T00:00:00')
  скоро.setDate(скоро.getDate() + ДНЕЙ_СКОРО)
  const гр = `${скоро.getFullYear()}-${String(скоро.getMonth() + 1).padStart(2, '0')}-${String(скоро.getDate()).padStart(2, '0')}`
  return дата <= гр ? 'soon' : 'later'
}

/** Сколько внесено по кредиту в месяце: платежи и проценты к ним (без штрафов). */
function внесеноПоКредиту(acc: Account, txs: Transaction[], mk: string): Money {
  let сумма = 0
  for (const t of txs) {
    if (monthKey(t.date) !== mk) continue
    if (этоПлатёжПо(acc, t)) сумма += t.amount
    else if (t.kind === 'expense' && t.debtId === acc.id && t.debtPrincipal === 0 && t.categoryId === СТАТЬЯ_ПРОЦЕНТОВ.id) сумма += t.amount
  }
  return сумма
}

function кредиты(data: VaultData, mk: string, now: string): ПлатёжМесяца[] {
  const out: ПлатёжМесяца[] = []
  for (const acc of data.accounts) {
    const c = acc.credit
    if (acc.archived || acc.type !== 'credit' || !c || !(c.monthlyPayment > 0) || !c.startDate) continue
    const дни = датыПлатежей(c, endOfMonth(mk + '-01')).filter((д) => monthKey(д) === mk)
    if (!дни.length) continue
    const долг = creditRemaining(acc, data.transactions)
    let внесено = внесеноПоКредиту(acc, data.transactions, mk)
    // Долг уже закрыт и в этом месяце не платили — платежа нет.
    if (долг <= 0 && внесено <= 0) continue
    for (const д of дни) {
      const сумма = долг > 0 ? Math.min(c.monthlyPayment, долг + внесено) : c.monthlyPayment
      const своё = Math.min(сумма, внесено)
      внесено -= своё
      let ст = статус(д, своё, сумма, now)
      // До дня, с которого программа следит за кредитом, неоплаченное — «не отмечено», а не просрочка.
      if (ст === 'overdue' && c.trackFrom && д < c.trackFrom) ст = 'unmarked'
      out.push({
        id: `credit:${acc.id}:${д}`, вид: 'credit', название: acc.name, дата: д,
        сумма, внесено: своё, статус: ст, ref: acc.id,
      })
    }
  }
  return out
}

/** Операции правила в месяце: помеченные им или той же статьи на ту же сумму. */
function внесеноПоПравилу(r: Recurring, txs: Transaction[], mk: string): Money {
  let сумма = 0
  for (const t of txs) {
    if (monthKey(t.date) !== mk || t.kind !== 'expense') continue
    if (t.recurringId === r.id) сумма += t.amount
    else if (!t.recurringId && r.categoryId && t.categoryId === r.categoryId && t.amount === r.amount) сумма += t.amount
  }
  return сумма
}

/**
 * Регулярный расход, который на деле платит кредит: его операции помечены
 * кредитом, статья — «Платежи по кредитам» или сумма и число месяца те же,
 * что у кредита. Такой платёж уже стоит строкой кредита — второй раз не нужен.
 */
function платитКредит(r: Recurring, data: VaultData): boolean {
  if (r.categoryId === СТАТЬЯ_ПЛАТЕЖЕЙ.id) return true
  if (data.transactions.some((t) => t.recurringId === r.id && !!t.debtId)) return true
  return data.accounts.some((a) =>
    !a.archived && a.type === 'credit' && !!a.credit && a.credit.monthlyPayment === r.amount
    && (r.dayOfMonth == null || a.credit.paymentDay === r.dayOfMonth))
}

function регулярные(data: VaultData, mk: string, now: string): ПлатёжМесяца[] {
  const out: ПлатёжМесяца[] = []
  const от = startOfMonth(mk + '-01')
  const до = endOfMonth(mk + '-01')
  for (const r of data.recurring) {
    if (!r.active || r.kind !== 'expense' || платитКредит(r, data)) continue
    const дни = датыПравила(r, от, до)
    let внесено = внесеноПоПравилу(r, data.transactions, mk)
    for (const д of дни) {
      const своё = Math.min(r.amount, внесено)
      внесено -= своё
      out.push({
        id: `rec:${r.id}:${д}`, вид: 'recurring', название: r.title || т('Регулярный платёж'), дата: д,
        сумма: r.amount, внесено: своё, статус: статус(д, своё, r.amount, now), ref: r.id,
      })
    }
  }
  return out
}

function задачи(data: VaultData, mk: string, now: string): ПлатёжМесяца[] {
  return (data.tasks ?? [])
    .filter((t: Task) => !!t.amount && t.moneyKind !== 'income' && t.moneyKind !== 'time' && !!t.due && monthKey(t.due) === mk)
    .map((t) => ({
      id: `task:${t.id}`, вид: 'task' as const, название: t.title || т('Задача'), дата: t.due!,
      сумма: t.amount!, внесено: t.done ? t.amount! : 0,
      статус: t.done ? ('paid' as const) : статус(t.due!, 0, t.amount!, now), ref: t.id,
    }))
}

/** Все обязательные платежи месяца по дате. */
export function платежиМесяца(data: VaultData, mk: string = monthKey(today()), now: string = today()): ПлатежиМесяца {
  const список = [...кредиты(data, mk, now), ...регулярные(data, mk, now), ...задачи(data, mk, now)]
    .sort((a, b) => (a.дата < b.дата ? -1 : a.дата > b.дата ? 1 : a.название.localeCompare(b.название)))
  const всего = список.reduce((s, x) => s + x.сумма, 0)
  const оплачено = список.reduce((s, x) => s + Math.min(x.сумма, x.внесено), 0)
  const просрочено = список.filter((x) => x.статус === 'overdue').reduce((s, x) => s + x.сумма - x.внесено, 0)
  return { список, всего, оплачено, осталось: всего - оплачено, просрочено }
}
