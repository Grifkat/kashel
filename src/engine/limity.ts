/*
 * Период лимита категории.
 *
 * Лимит был только месячным. Теперь у него есть период: месяц, квартал,
 * год, всё время или свой отрезок дат. Сумма лимита — на весь период:
 * «30 000 ₽ в квартал», «100 000 ₽ за всё время ремонта».
 *
 * Старые хранилища периода не знают — у них месяц, и ничего не меняется.
 * У подкатегории без своего периода — период её главной: лимит
 * подкатегории живёт внутри общего и мерится тем же отрезком.
 *
 * Все места, что читают лимит (бюджет, советы, уведомления о превышении,
 * награды, отчёт для собеседника, канвас), берут отрезок и траты отсюда,
 * чтобы нигде не сравнивались траты месяца с годовым лимитом.
 */
import type { Category, Money, ПериодЛимита, Recurring, Transaction } from '../lib/types'
import { diffDays, endOfMonth, endOfYear, startOfMonth, startOfYear, today } from '../lib/date'
import { родитель, семья } from './podkategorii'
import { поТемпу, прогнозТрат, разовость } from './razovye'
import { т } from '../i18n'

export type ВидПериода = ПериодЛимита['kind']

export const ПЕРИОДЫ_ЛИМИТА: { k: ВидПериода; t: string; кратко: string }[] = [
  { k: 'month', t: т('Месяц'), кратко: т('в мес.') },
  { k: 'quarter', t: т('Квартал'), кратко: т('в кв.') },
  { k: 'year', t: т('Год'), кратко: т('в год') },
  { k: 'all', t: т('Всё время'), кратко: т('всего') },
  { k: 'custom', t: т('Свой период'), кратко: т('свой') },
]

/** Период лимита категории; у подкатегории без своего — как у главной. */
export function периодЛимита(c: Category, cats: Category[]): ПериодЛимита {
  if (c.planPeriod) return c.planPeriod
  const р = родитель(c, cats)
  return р?.planPeriod ?? { kind: 'month' }
}

const началоКвартала = (d: string): string => {
  const м = Math.floor((Number(d.slice(5, 7)) - 1) / 3) * 3 + 1
  return `${d.slice(0, 4)}-${String(м).padStart(2, '0')}-01`
}

/**
 * Отрезок лимита, в который попадает день `на`. «Всё время» — с первой
 * записи и до конца месяца дня `на`; свой период — ровно свои даты.
 */
export function отрезокЛимита(п: ПериодЛимита, на: string, первая?: string): { от: string; до: string } {
  switch (п.kind) {
    case 'quarter': {
      const от = началоКвартала(на)
      return { от, до: endOfMonth(`${от.slice(0, 4)}-${String(Number(от.slice(5, 7)) + 2).padStart(2, '0')}-01`) }
    }
    case 'year':
      return { от: startOfYear(на), до: endOfYear(на) }
    case 'all':
      return { от: первая ?? '0000-01-01', до: endOfMonth(на) }
    case 'custom':
      return { от: п.from ?? startOfMonth(на), до: п.to ?? endOfMonth(на) }
    case 'month':
    default:
      return { от: startOfMonth(на), до: endOfMonth(на) }
  }
}

/** Траты категории за отрезок: у главной — со всеми подкатегориями и долями. */
export function потраченоЗа(c: Category, cats: Category[], txs: Transaction[], от: string, до: string): { сумма: Money; операций: number } {
  const свои = семья(c.id, cats)
  let сумма = 0
  let операций = 0
  for (const t of txs) {
    if (t.kind !== 'expense' || t.date < от || t.date > до) continue
    if (t.splits?.length) {
      const доля = t.splits.filter((s) => свои.has(s.categoryId)).reduce((a, s) => a + s.amount, 0)
      if (доля) {
        сумма += доля
        операций++
      }
    } else if (t.categoryId && свои.has(t.categoryId)) {
      сумма += t.amount
      операций++
    }
  }
  return { сумма, операций }
}

/** Разовых операций — одна-две: темпом они не тратятся, прогноз не раздувается. */
export const РАЗОВЫХ = 2

/**
 * Прогноз трат к концу отрезка по темпу — без деления на разовые и текущие.
 * Отрезок уже кончился или ещё не начался — прогноз равен потраченному.
 * У «всего времени» конца нет.
 */
export function прогнозЗа(потрачено: Money, операций: number, от: string, до: string, п: ПериодЛимита, now: string = today()): Money {
  if (п.kind === 'all' || операций <= РАЗОВЫХ) return потрачено
  return поТемпу(потрачено, от, до, now)
}

export interface ИсполнениеЛимита {
  п: ПериодЛимита
  от: string
  до: string
  потрачено: Money
  операций: number
  /** Из потраченного — разовые траты: в прогноз идут один раз. */
  разовые: Money
  /** Регулярные платежи статьи, которые ещё впереди в этом отрезке. */
  впереди: Money
  прогноз: Money
  лимит: Money
}

/**
 * Всё о лимите категории на день `на`: отрезок, траты, прогноз. Прогноз —
 * как в engine/razovye: разовые один раз, текущие по темпу, плюс ещё не
 * внесённые платежи по `правилам` (без них — только записанное).
 */
export function исполнениеЛимита(c: Category, cats: Category[], txs: Transaction[], на: string = today(), now: string = today(), правила: Recurring[] = []): ИсполнениеЛимита {
  const п = периодЛимита(c, cats)
  const первая = п.kind === 'all' ? txs.reduce<string | undefined>((м, t) => (!м || t.date < м ? t.date : м), undefined) : undefined
  const { от, до } = отрезокЛимита(п, на, первая)
  const { сумма, операций } = потраченоЗа(c, cats, txs, от, до)
  const свои = семья(c.id, cats)
  const пт = прогнозТрат(txs, от, до, разовость(cats, txs, правила, now), now, (id) => свои.has(id), РАЗОВЫХ)
  return {
    п, от, до, потрачено: сумма, операций,
    разовые: пт.разовые,
    впереди: п.kind === 'all' ? 0 : пт.впереди,
    // У «всего времени» конца нет — тянуть темпом некуда.
    прогноз: п.kind === 'all' ? сумма : пт.прогноз,
    лимит: c.plan ?? 0,
  }
}

/** Короткая подпись периода: «за квартал», «на год», «с 01.09 по 30.11». */
export function заПериод(п: ПериодЛимита): string {
  switch (п.kind) {
    case 'quarter': return т('за квартал')
    case 'year': return т('за год')
    case 'all': return т('за всё время')
    case 'custom': return т('с {0} по {1}', кратко(п.from), кратко(п.to))
    default: return т('за месяц')
  }
}
const кратко = (d?: string) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}` : '…')

/**
 * Лимит в пересчёте на месяц — там, где лимиты складываются с месячным
 * доходом («Сумма лимитов», «Свободно от лимитов»). «Всё время» на месяц не
 * делится — такой лимит в месячную сумму не идёт (null).
 */
export function лимитВМесяц(c: Category, cats: Category[]): Money | null {
  if (!c.plan) return 0
  const п = периодЛимита(c, cats)
  if (п.kind === 'month') return c.plan
  if (п.kind === 'quarter') return Math.round(c.plan / 3)
  if (п.kind === 'year') return Math.round(c.plan / 12)
  if (п.kind === 'custom' && п.from && п.to) return Math.round(c.plan / Math.max(1, (diffDays(п.from, п.to) + 1) / 30.44))
  return null
}

