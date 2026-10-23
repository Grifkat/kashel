/*
 * Какую цитату показать сегодня.
 *
 * Цитата дня одна на день и не меняется, сколько окно ни открывай: выбор
 * идёт от даты, а выбранная запоминается в настройках хранилища (см.
 * НастройкиЦитат.days в lib/types). Запомненная выигрывает у расчёта — иначе цитата
 * менялась бы посреди дня, стоило человеку записать трату.
 *
 * Самый первый день — всегда девиз Достоевского.
 *
 * Дальше выбор взвешенный: под положение человека (много долгов, нет
 * подушки, всё хорошо) и под выбранный стиль общения. Недавние цитаты
 * отодвигаются, чтобы не повторяться неделями.
 *
 * Ничего не знает о React и окне — проверяется в самопроверке.
 */
import type { VaultData } from '../lib/types'
import { addDays, today } from '../lib/date'
import { balances } from '../engine/stats'
import { личное } from '../engine/project'
import { ЦИТАТЫ, ДЕВИЗ, type Цитата, type Ситуация } from './baza'
import { АВТОРЫ, type Автор } from './avtory'

/** Положение человека по его деньгам. none — данных мало, подстраиваться не под что. */
export type Положение = 'debts' | 'thin' | 'good' | 'none'

/** Стиль общения из настроек. */
export type Тон = 'support' | 'neutral' | 'hard'

export interface Обстановка {
  положение: Положение
  /** За последний месяц гасил долги или откладывал — девиз выпадает чаще. */
  гаситИлиКопит: boolean
}

const ПО_ID = new Map(ЦИТАТЫ.map((ц) => [ц.id, ц]))
const АВТОР_ПО_ID = new Map(АВТОРЫ.map((а) => [а.id, а]))

export const цитатаПоId = (id: string | undefined): Цитата | undefined => (id ? ПО_ID.get(id) : undefined)
export const авторЦитаты = (ц: Цитата): Автор | undefined => АВТОР_ПО_ID.get(ц.автор)

/** Какие ситуации подходят под положение. */
const ПОД_ПОЛОЖЕНИЕ: Record<Положение, Ситуация[]> = {
  debts: ['support', 'honor'],
  thin: ['hard', 'work'],
  good: ['goal', 'wisdom'],
  none: [],
}

/** Множители стиля: «поддержка» мягче, «жёстко» — прямее. */
const ПОД_ТОН: Record<Тон, Partial<Record<Ситуация, number>>> = {
  support: { support: 2.2, hard: 0.4 },
  neutral: {},
  hard: { hard: 2.2, work: 1.5, support: 0.6 },
}

/** Сколько дней не повторять цитату, если есть из чего выбирать. */
const НЕ_ПОВТОРЯТЬ = 45
/** Девиз — тем, кто гасит долги или копит, — можно чаще. */
const НЕ_ПОВТОРЯТЬ_ДЕВИЗ = 14

/** Детерминированный хеш строки в [0, 1) — FNV-1a. */
function доля(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 0x100000000
}

/** Вес цитаты: чем больше, тем вероятнее выпадет. */
export function вес(ц: Цитата, обст: Обстановка, тон: Тон): number {
  let в = 1
  const нужные = ПОД_ПОЛОЖЕНИЕ[обст.положение]
  if (ц.ситуации.some((с) => нужные.includes(с))) в *= 4
  for (const с of ц.ситуации) в *= ПОД_ТОН[тон][с] ?? 1
  if (ц.id === ДЕВИЗ && обст.гаситИлиКопит) в *= 12
  return в
}

/**
 * Цитата на день. history — запомненные дни (день → id).
 * Вернёт id; запоминать его — дело вызывающего.
 */
export function выбратьНаДень(
  день: string,
  history: Record<string, string> | undefined,
  обст: Обстановка = { положение: 'none', гаситИлиКопит: false },
  тон: Тон = 'neutral',
): string {
  const было = history?.[день]
  if (было && ПО_ID.has(было)) return было
  const дни = Object.keys(history ?? {})
  if (!дни.length) return ДЕВИЗ

  // Недавние — по дням, а не по числу записей: человек мог не открывать
  // программу неделю, и тогда «недавнее» должно считаться от календаря.
  const с = addDays(день, -НЕ_ПОВТОРЯТЬ)
  const недавние = new Set(дни.filter((д) => д >= с && д < день).map((д) => history![д]))
  // Кто гасит долги или копит, тому девиз нужен чаще — он возвращается через две недели.
  if (обст.гаситИлиКопит) {
    const сДевиза = addDays(день, -НЕ_ПОВТОРЯТЬ_ДЕВИЗ)
    if (!дни.some((д) => д >= сДевиза && д < день && history![д] === ДЕВИЗ)) недавние.delete(ДЕВИЗ)
  }
  let пул = ЦИТАТЫ.filter((ц) => !недавние.has(ц.id))
  if (!пул.length) пул = ЦИТАТЫ

  return взвешенно(пул, (ц) => вес(ц, обст, тон), доля('day:' + день)).id
}

/** Ещё одна цитата для окна — тоже от даты и номера, чтобы не дёргать Math.random. */
export function ещёЦитата(день: string, номер: number, кромеId: string[]): Цитата {
  const пул = ЦИТАТЫ.filter((ц) => !кромеId.includes(ц.id))
  return взвешенно(пул.length ? пул : ЦИТАТЫ, () => 1, доля(`more:${день}:${номер}`))
}

function взвешенно(пул: Цитата[], весОт: (ц: Цитата) => number, r: number): Цитата {
  const веса = пул.map(весОт)
  const всего = веса.reduce((s, x) => s + x, 0)
  let порог = r * всего
  for (let i = 0; i < пул.length; i++) {
    порог -= веса[i]
    if (порог < 0) return пул[i]
  }
  return пул[пул.length - 1]
}

/**
 * Положение человека — из того, что Кошель уже знает: остатки, долги,
 * средний расход за три месяца. Проектные счета не в счёт, как и в советах.
 */
export function обстановка(data: VaultData, день: string = today()): Обстановка {
  const свои = личное(data)
  const bal = balances(свои.accounts, свои.transactions, день)
  const долг = Math.max(0, -bal.liabilities)
  const с = addDays(день, -90)
  let расход = 0
  let доход = 0
  for (const t of свои.transactions) {
    if (t.date < с || t.date > день) continue
    if (t.kind === 'expense') расход += t.amount
    else if (t.kind === 'income') доход += t.amount
  }
  const вМесяцРасход = расход / 3
  const вМесяцДоход = доход / 3

  const месяцНазад = addDays(день, -30)
  const копилки = new Set(свои.accounts.filter((a) => a.type === 'savings').map((a) => a.id))
  const долговые = new Set(свои.accounts.filter((a) => a.type === 'credit' || a.type === 'debt').map((a) => a.id))
  const гаситИлиКопит = свои.transactions.some((t) =>
    t.date >= месяцНазад && t.date <= день && (
      !!t.debtId ||
      (t.kind === 'transfer' && !!t.toAccountId && (копилки.has(t.toAccountId) || долговые.has(t.toAccountId))) ||
      (t.kind === 'income' && копилки.has(t.accountId))
    ),
  )

  let положение: Положение = 'none'
  if (!свои.transactions.length && !долг) положение = 'none'
  else if (долг > 0 && (долг >= bal.assets * 0.5 || (вМесяцДоход > 0 && долг >= вМесяцДоход * 3))) положение = 'debts'
  else if (вМесяцРасход > 0 && bal.assets < вМесяцРасход) положение = 'thin'
  else if (bal.net < 0) положение = 'thin'
  else if (вМесяцРасход > 0 || bal.assets > 0) положение = 'good'
  return { положение, гаситИлиКопит }
}

/**
 * Первая фраза — крупно, продолжение — курсивом, как в макете окна.
 * Короткая цитата идёт целиком. Иначе режем по концу первого предложения,
 * а если оно одно — по первому смысловому повороту («, а», «, но», « — »).
 */
export function разрезать(текст: string): { голова: string; хвост: string } {
  if (текст.length <= 64) return { голова: текст, хвост: '' }
  const конец = /[.!?](\s+)(?=\S)/.exec(текст)
  if (конец && конец.index >= 12) {
    return { голова: текст.slice(0, конец.index + 1), хвост: текст.slice(конец.index + 1 + конец[1].length) }
  }
  const поворот = /(,\s+(?:а|но|и|да|так|чтобы|потому)\s|\s—\s|:\s|;\s|,\s+(?:and|but|so|for)\s)/.exec(текст.slice(12))
  if (поворот) {
    const i = 12 + поворот.index
    const голова = текст.slice(0, i).replace(/[,:;\s—]+$/, '')
    const хвост = текст.slice(i).replace(/^[,:;\s—]+/, '')
    return { голова: голова + '.', хвост: '…' + хвост }
  }
  // Длинная фраза без поворота — по первой запятой, но не слишком рано.
  const запятая = текст.length > 80 ? текст.indexOf(', ', 25) : -1
  if (запятая > 0 && запятая < текст.length - 20) {
    return { голова: текст.slice(0, запятая) + '.', хвост: '…' + текст.slice(запятая + 2) }
  }
  return { голова: текст, хвост: '' }
}
