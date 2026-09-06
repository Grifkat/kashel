import type { Account, Money, Transaction, VaultData } from '../lib/types'
import { accountBalance } from './stats'
import { addMonths, monthKey, today } from '../lib/date'

/*
 * Кредиты: карты и займы.
 *
 * Главное правило — долг живёт в остатке счёта, как у всего остального.
 * Трата с кредитного счёта его увеличивает, перевод на счёт гасит. Отсюда
 * кредит сам собой попадает в чистый капитал, прогноз и награды, и нигде не
 * расходится сам с собой.
 *
 * Прежде было иначе: долг хранился отдельным полем, платёж требовал пометки,
 * которую негде было поставить, а дашборд читал остаток счёта. Кредит на
 * полмиллиона весил там ноль рублей, а погашение не работало вовсе. Ровно это
 * и чинится: одна цифра вместо двух.
 */

export type CreditKind = 'card' | 'loan'

export interface Строка {
  month: number
  interest: Money
  principal: Money
  balance: Money
}

/**
 * График погашения аннуитетом.
 *
 * Пустой список означает, что платёж не покрывает даже проценты, — долг при
 * таком платеже не гасится никогда. Молчать об этом нельзя: человек считает,
 * что платит, а долг стоит на месте.
 */
export function schedule(debt: Money, ratePct: number, payment: Money): Строка[] {
  const rows: Строка[] = []
  const r = ratePct / 100 / 12
  let balance = debt
  if (payment <= 0 || balance <= 0) return rows
  for (let m = 1; m <= 600 && balance > 0; m++) {
    const interest = Math.round(balance * r)
    let principal = payment - interest
    if (principal <= 0) return []
    if (principal > balance) principal = balance
    balance -= principal
    rows.push({ month: m, interest, principal, balance })
  }
  return rows
}

export interface Трата {
  categoryId: string | null
  amount: Money
}

export interface Кредит {
  acc: Account
  kind: CreditKind
  /** Сколько должны сейчас. Всегда неотрицательное. */
  debt: Money
  /** Лимит карты. У займа — ноль. */
  limit: Money
  /** Сколько ещё можно взять по карте. */
  available: Money
  /** Доля израсходованного лимита, 0..1. У займа — доля непогашенного. */
  used: number
  ratePct: number
  payment: Money
  /** Сколько уже погашено переводами на счёт. */
  repaid: Money
  /** Сколько потрачено с этого счёта за всё время. */
  spentTotal: Money
  /** Куда ушли кредитные деньги — по статьям, крупные впереди. */
  spent: Трата[]
  /** Месяцев до нуля при нынешнем платеже. null — платёж не покрывает проценты. */
  monthsLeft: number | null
  /** Месяц выхода в ноль, ключом вида 2027-04. */
  freeMonth: string | null
  /** Переплата: сколько процентов отдадите сверх долга. */
  overpay: Money
}

/** Долг по счёту: остаток ниже нуля. Выше нуля — переплата, долга нет. */
export const долгПоСчёту = (acc: Account, txs: Transaction[]): Money =>
  Math.max(0, -accountBalance(acc, txs))

export function creditState(acc: Account, data: VaultData, now: string = today()): Кредит {
  const txs = data.transactions
  const c = acc.credit
  const kind: CreditKind = c?.kind ?? (c?.limit ? 'card' : 'loan')
  const debt = долгПоСчёту(acc, txs)
  const limit = c?.limit ?? 0
  const ratePct = c?.ratePct ?? 0
  const payment = c?.monthlyPayment ?? 0

  // Погашено — переводы, пришедшие на счёт. Потрачено — расходы с него.
  let repaid = 0
  let spentTotal = 0
  const поСтатьямъ = new Map<string | null, Money>()
  for (const t of txs) {
    if (t.kind === 'transfer' && t.toAccountId === acc.id) repaid += t.amount
    else if (t.kind === 'expense' && t.accountId === acc.id) {
      spentTotal += t.amount
      const k = t.categoryId ?? null
      поСтатьямъ.set(k, (поСтатьямъ.get(k) ?? 0) + t.amount)
    }
  }
  const spent = [...поСтатьямъ.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)

  const план = schedule(debt, ratePct, payment)
  const monthsLeft = debt <= 0 ? 0 : план.length ? план.length : null
  const freeMonth = monthsLeft && monthsLeft > 0 ? monthKey(addMonths(now, monthsLeft)) : null
  const overpay = план.reduce((s, r) => s + r.interest, 0)

  return {
    acc, kind, debt, limit,
    available: kind === 'card' ? Math.max(0, limit - debt) : 0,
    used: kind === 'card' ? (limit > 0 ? Math.min(1, debt / limit) : 0) : 0,
    ratePct, payment, repaid, spentTotal, spent,
    monthsLeft, freeMonth, overpay,
  }
}

/** Все кредитные счета, кроме убранных в архив. */
export const creditAccounts = (data: VaultData): Account[] =>
  data.accounts.filter((a) => !a.archived && a.type === 'credit')

/** Сводка по всем кредитам разом — для дашборда. */
export function creditsSummary(data: VaultData, now: string = today()) {
  const все = creditAccounts(data).map((a) => creditState(a, data, now))
  return {
    список: все,
    debt: все.reduce((s, k) => s + k.debt, 0),
    payment: все.reduce((s, k) => s + k.payment, 0),
    limit: все.reduce((s, k) => s + k.limit, 0),
    available: все.reduce((s, k) => s + k.available, 0),
    overpay: все.reduce((s, k) => s + k.overpay, 0),
  }
}

export interface Прикидка {
  /** Насколько раньше закроетесь, в месяцах. */
  faster: number
  /** Сколько процентов сбережёте. */
  saved: Money
  /** Месяцев до нуля с добавкой. */
  monthsLeft: number | null
}

/**
 * Что будет, если платить больше.
 *
 * Считается тем же графиком, что и обычный срок, — иначе прикидка разойдётся
 * с основной цифрой, и верить будет нечему.
 */
export function whatIf(k: Кредит, extra: Money): Прикидка {
  const план = schedule(k.debt, k.ratePct, k.payment + extra)
  if (!план.length) return { faster: 0, saved: 0, monthsLeft: null }
  const было = k.monthsLeft
  return {
    faster: было == null ? 0 : Math.max(0, было - план.length),
    saved: Math.max(0, k.overpay - план.reduce((s, r) => s + r.interest, 0)),
    monthsLeft: план.length,
  }
}
