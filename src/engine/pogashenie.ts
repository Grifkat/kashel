/*
 * Погашение кредитов и долгов — окно «Погасить», как «Пополнить цель».
 *
 * Сумма, дата и галочка «со счёта». С галочкой деньги двигаются между вашим
 * счётом и долгом, как и прежде. Без неё они проходят мимо ваших счетов
 * (offBook): долг меняется, остатки — нет. Что в платеже по кредиту расход,
 * решает engine/credit, и галочка на это не влияет.
 *
 * Здесь же — просрочка по кредиту и сверка долгов, заведённых прежними
 * версиями без списания со счёта.
 */
import type { Account, Category, Money, Transaction, VaultData } from '../lib/types'
import { addDays, today } from '../lib/date'
import { creditRemaining, остатокДолга } from './stats'
import { СТАТЬЯ_ПРОЦЕНТОВ, датыПлатежей, этоПлатёжПо, следующийПлатёж } from './credit'
import { т } from '../i18n'

type НоваяОперация = Omit<Transaction, 'id' | 'createdAt'>

/** Статья для штрафов и пени — сверх платежа, долг не гасят. */
export const СТАТЬЯ_ШТРАФОВ: Category = {
  id: 'cat_credit_penalty',
  name: т('Штрафы и пени'),
  kind: 'expense',
  icon: 'gavel',
  color: '#c0392b',
  bucket: 'needs',
}

/* ------------------------------------------------------------ просрочка */

export interface Просрочка {
  /** Сколько не внесено по прошедшим датам. */
  сумма: Money
  /** Сколько платежей это составляет (неполный — тоже платёж). */
  платежей: number
  /** Первая неоплаченная дата. */
  с: string | null
  /** Что предложить в окне: просроченное и ближайший платёж. */
  предложить: Money
}

/** Сумма, внесённая в счёт графика: платежи и проценты к ним (без штрафов). */
function внесеноС(acc: Account, txs: Transaction[], съ: string): Money {
  let сумма = 0
  for (const t of txs) {
    if (t.date < съ) continue
    if (этоПлатёжПо(acc, t)) сумма += t.amount
    else if (t.kind === 'expense' && t.debtId === acc.id && t.debtPrincipal === 0 && t.categoryId === СТАТЬЯ_ПРОЦЕНТОВ.id) сумма += t.amount
  }
  return сумма
}

/**
 * Просрочка по кредиту с графиком. Считается от дня, когда кредит завели в
 * программе (credit.trackFrom): что было раньше, учтено в остатке. Платёж
 * сегодняшнего дня ещё не просрочен. Недоплата тоже просрочка.
 */
export function просрочкаКредита(acc: Account, data: VaultData, now: string = today()): Просрочка | null {
  const c = acc.credit
  if (acc.type !== 'credit' || !c || !(c.monthlyPayment > 0) || !c.startDate) return null
  if ((c.kind ?? (c.limit ? 'card' : 'loan')) === 'card') return null
  const долг = creditRemaining(acc, data.transactions)
  if (долг <= 0) return { сумма: 0, платежей: 0, с: null, предложить: 0 }
  const мп = c.monthlyPayment
  // Без отметки — кредит прежних версий до перевода: просрочки не выдумываем.
  const съ = c.trackFrom ?? now
  const внесено = внесеноС(acc, data.transactions, съ)
  const прошли = датыПлатежей(c, addDays(now, -1)).filter((д) => д >= съ)
  let с: string | null = null
  прошли.forEach((д, i) => {
    if (!с && внесено < мп * (i + 1)) с = д
  })
  const сумма = Math.min(долг, Math.max(0, мп * прошли.length - внесено))
  const следующий = следующийПлатёж(c, now)
  const нужноКСледующему = мп * (прошли.length + (следующий && следующий >= съ ? 1 : 0)) - внесено
  const предложить = Math.min(долг, нужноКСледующему > 0 ? нужноКСледующему : мп)
  return { сумма, платежей: Math.ceil(сумма / мп), с: сумма > 0 ? с : null, предложить }
}

/** Отметить, с какого дня следить за платежами, — кредитам без отметки. */
export function отметитьУчётКредитов(accounts: Account[], now: string = today()): { accounts: Account[]; changed: number } {
  let changed = 0
  const итог = accounts.map((a) => {
    if (a.type !== 'credit' || !a.credit || a.credit.trackFrom) return a
    changed++
    return { ...a, credit: { ...a.credit, trackFrom: now } }
  })
  return { accounts: итог, changed }
}

/* ------------------------------------------------------------ долги людям */

/**
 * repay — отдать свой долг, borrow — взять ещё; collect — получить долг
 * назад, lend — дать (ещё) в долг.
 */
export type ДействиеДолга = 'repay' | 'borrow' | 'collect' | 'lend'

/** Долг растёт или уменьшается от действия — и годится ли действие для этого долга. */
export function действиеПодходит(долг: Account, действие: ДействиеДолга): boolean {
  const мне = долг.debt?.direction === 'owed_to_me'
  return мне ? действие === 'collect' || действие === 'lend' : действие === 'repay' || действие === 'borrow'
}

/** Деньги с вашей стороны уходят (отдать, дать) или приходят (получить, взять). */
export const деньгиУходят = (действие: ДействиеДолга): boolean => действие === 'repay' || действие === 'lend'

export function планДолга(p: {
  долг: Account
  действие: ДействиеДолга
  сумма: Money
  дата: string
  /** Свой счёт; null — деньги мимо ваших счетов. */
  счёт: string | null
  note?: string
}): НоваяОперация | null {
  const { долг, действие, сумма, дата, счёт } = p
  if (долг.type !== 'debt' || !долг.debt || !(сумма > 0) || !действиеПодходит(долг, действие)) return null
  if (счёт === долг.id || счёт === '') return null
  const кто = долг.debt.counterparty || долг.name
  const note = p.note?.trim() || {
    repay: т('Возврат долга: {0}', кто),
    borrow: т('Взято в долг: {0}', кто),
    collect: т('Получен возврат: {0}', кто),
    lend: т('Дано в долг: {0}', кто),
  }[действие]
  // Остаток долга: отдать и дать — плюс, взять и получить — минус.
  const плюс = деньгиУходят(действие)
  const общее = { kind: 'transfer' as const, amount: сумма, date: дата, tags: [], note }
  if (!счёт) return { ...общее, accountId: долг.id, toAccountId: долг.id, offBook: плюс ? 'in' : 'out' }
  return плюс ? { ...общее, accountId: счёт, toAccountId: долг.id } : { ...общее, accountId: долг.id, toAccountId: счёт }
}

/** Новый долг человеку или человека вам. Сумма вносится отдельной операцией. */
export function новыйДолг(p: {
  id: string
  кто: string
  направление: 'i_owe' | 'owed_to_me'
  срок?: string
}): Account {
  const мне = p.направление === 'owed_to_me'
  return {
    id: p.id,
    name: p.кто.trim(),
    type: 'debt',
    icon: 'handshake',
    color: мне ? '#4cc46a' : '#e8833a',
    initialBalance: 0,
    debt: {
      counterparty: p.кто.trim(),
      direction: p.направление,
      ...(p.срок ? { dueDate: p.срок } : {}),
      v: 2,
      reviewed: true,
    },
  }
}

/* ------------------------------------------------------------ сверка */

/**
 * Долги прежних версий: сумма вписана в сам долг, а с ваших счетов не
 * списывалась. Их программа просит сверить один раз.
 */
export const несверенныеДолги = (data: VaultData): Account[] =>
  data.accounts.filter((a) => a.type === 'debt' && a.debt && !a.debt.reviewed && !a.archived && a.initialBalance !== 0)

/**
 * Ответ на сверку. Счёт — деньги по долгу прошли через него, но остаток
 * счёта этого не знает: дали в долг — списать, взяли — зачислить. null —
 * ничего не менять.
 */
export function сверитьДолг(
  data: VaultData,
  id: string,
  счёт: string | null,
  дата: string = today(),
): { accounts: Account[]; операция: НоваяОперация | null } {
  const долг = data.accounts.find((a) => a.id === id)
  if (!долг?.debt) return { accounts: data.accounts, операция: null }
  const accounts = data.accounts.map((a) => (a.id === id ? { ...a, debt: { ...a.debt!, reviewed: true } } : a))
  if (!счёт || счёт === id) return { accounts, операция: null }
  const мне = долг.debt.direction === 'owed_to_me'
  const кто = долг.debt.counterparty || долг.name
  return {
    accounts,
    операция: {
      kind: 'transfer',
      amount: Math.abs(долг.initialBalance),
      accountId: счёт,
      toAccountId: счёт,
      offBook: мне ? 'out' : 'in',
      date: дата,
      tags: [],
      note: мне ? т('Дано в долг: {0}', кто) : т('Взято в долг: {0}', кто),
    },
  }
}

/** Сколько по долгу сейчас — для подсказки суммы в окне. */
export const суммаДолга = (долг: Account, txs: Transaction[]): Money => остатокДолга(долг, txs)
