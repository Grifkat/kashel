/*
 * Цель «заработать».
 *
 * Цель на накопление мерит, сколько отложено. Эта — сколько принесено
 * дохода: скажем, «заработать на играх 300 000 ₽ к декабрю» или
 * «зарабатывать 50 000 ₽ в месяц». Считается по записанным доходам — только
 * выбранных категорий (с их подкатегориями), если они выбраны, иначе все.
 * Переводы между своими счетами — не заработок и сюда не попадают.
 *
 * Разовая цель считает с дня начала до срока. Ежемесячная — заново в
 * каждом месяце, с первого числа (но не раньше дня начала).
 */
import type { Goal, Money, Transaction, VaultData } from '../lib/types'
import { addDays, addMonths, diffDays, diffMonths, endOfMonth, startOfMonth, today } from '../lib/date'
import { семья } from './podkategorii'

export const этоЗаработок = (g: Goal): boolean => g.kind === 'earn'

/** Категории, чей доход идёт в цель; null — все доходы. */
export function категорииЗаработка(g: Goal, data: VaultData): Set<string> | null {
  const выбраны = g.earn?.categoryIds ?? []
  if (!выбраны.length) return null
  const все = new Set<string>()
  for (const id of выбраны) for (const x of семья(id, data.categories)) все.add(x)
  return все
}

/** Сколько из операции — доход нужных категорий. Доли считаются по отдельности. */
function доходИз(t: Transaction, свои: Set<string> | null): Money {
  if (t.kind !== 'income') return 0
  if (!свои) return t.amount
  if (t.splits?.length) return t.splits.filter((s) => свои.has(s.categoryId)).reduce((a, s) => a + s.amount, 0)
  return t.categoryId && свои.has(t.categoryId) ? t.amount : 0
}

/** Доход нужных категорий за [от, до]. */
export function доходЗа(g: Goal, data: VaultData, от: string, до: string): Money {
  const свои = категорииЗаработка(g, data)
  let сумма = 0
  for (const t of data.transactions) if (t.date >= от && t.date <= до) сумма += доходИз(t, свои)
  return сумма
}

/** Промежуток, за который считается цель сейчас. */
export function периодЗаработка(g: Goal, now: string = today()): { от: string; до: string } {
  const start = g.earn?.start ?? now
  if (g.earn?.mode === 'monthly') {
    const от = startOfMonth(now) > start ? startOfMonth(now) : start
    return { от, до: now }
  }
  const до = g.targetDate && g.targetDate < now ? g.targetDate : now
  return { от: start, до }
}

export interface ПрогрессЗаработка {
  заработано: Money
  осталось: Money
  доля: number
  от: string
  до: string
  ежемесячная: boolean
  /** Средний доход нужных категорий в месяц за три полных прошлых месяца. */
  темп: Money
  /** Разовая со сроком: сколько нужно в месяц до срока. */
  нужноВМесяц: Money | null
  месяцевДоСрока: number | null
  /** Ежемесячная: сколько дней осталось в месяце и сколько нужно в день. */
  днейОсталось: number | null
  нужноВДень: Money | null
  /** Успевает ли нынешний темп. null — судить не по чему. */
  успевает: boolean | null
  срокПрошёл: boolean
}

export function прогрессЗаработка(g: Goal, data: VaultData, now: string = today()): ПрогрессЗаработка {
  const { от, до } = периодЗаработка(g, now)
  const заработано = доходЗа(g, data, от, до)
  const осталось = Math.max(0, g.targetAmount - заработано)
  const доля = g.targetAmount > 0 ? заработано / g.targetAmount : 0
  const ежемесячная = g.earn?.mode === 'monthly'

  // Темп — по трём полным месяцам до нынешнего: текущий ещё не кончился.
  const началоТемпа = startOfMonth(addMonths(now, -3))
  const конецТемпа = addDays(startOfMonth(now), -1)
  const темп = Math.round(доходЗа(g, data, началоТемпа, конецТемпа) / 3)

  let нужноВМесяц: Money | null = null
  let месяцевДоСрока: number | null = null
  let днейОсталось: number | null = null
  let нужноВДень: Money | null = null
  let успевает: boolean | null = null
  const срокПрошёл = !ежемесячная && !!g.targetDate && g.targetDate < now && осталось > 0

  if (ежемесячная) {
    днейОсталось = diffDays(now, endOfMonth(now)) + 1
    нужноВДень = осталось > 0 ? Math.round(осталось / днейОсталось) : 0
    успевает = осталось === 0 ? true : темп > 0 ? темп >= g.targetAmount : null
  } else if (g.targetDate && !срокПрошёл) {
    месяцевДоСрока = Math.max(1, diffMonths(now, g.targetDate) + (g.targetDate.slice(8) >= now.slice(8) ? 1 : 0))
    нужноВМесяц = Math.round(осталось / месяцевДоСрока)
    успевает = осталось === 0 ? true : темп > 0 ? темп >= нужноВМесяц : null
  } else if (осталось === 0) успевает = true

  return { заработано, осталось, доля, от, до, ежемесячная, темп, нужноВМесяц, месяцевДоСрока, днейОсталось, нужноВДень, успевает, срокПрошёл }
}

/**
 * Прогресс любой цели в одном виде — для правой панели, канваса и графа.
 * У накопления — отложенное, у заработка — заработанное за период цели.
 */
export function прогрессЦели(g: Goal, data: VaultData, остатки: Map<string, Money>, now: string = today()): { сумма: Money; доля: number } {
  if (этоЗаработок(g)) {
    const п = прогрессЗаработка(g, data, now)
    return { сумма: п.заработано, доля: Math.min(1, п.доля) }
  }
  const сумма = g.accountId ? остатки.get(g.accountId) ?? 0 : g.saved
  return { сумма, доля: g.targetAmount ? Math.min(1, сумма / g.targetAmount) : 0 }
}
