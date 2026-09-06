import type { Freq, Recurring, Transaction, TxKind, VaultData } from '../lib/types'
import { diffDays, parseISO } from '../lib/date'

/*
 * Поиск повторов среди обычных операций.
 *
 * Смысл простой: человек платит за подписку каждый месяц руками и не заводит
 * регулярное правило, потому что не вспоминает о такой возможности. Прогноз
 * из-за этого считает платёж «переменной частью категории» и размазывает его
 * по среднему вместо того, чтобы поставить точной суммой в нужный месяц.
 *
 * Главное требование к такому поиску — молчать, когда не уверен. Ложное
 * предложение хуже отсутствующего: человек один раз ткнёт «сделать правилом»,
 * получит мусор в прогнозе и больше сюда не посмотрит. Поэтому:
 *
 *  - сумма должна совпадать в точности. Подписки и аренда так и платятся,
 *    а «примерно похожие» продукты по 1 000 ₽ — это не повтор, это просто
 *    круглая сумма;
 *  - промежутки между разами должны складываться в узнаваемый период. Три
 *    платежа по 299 ₽ 20, 24 и 28 августа — это три разные подписки с
 *    одинаковой ценой, а не одна ежемесячная, и предлагать тут нечего;
 *  - операции, уже порождённые правилом, в поиск не берём: иначе программа
 *    предложила бы завести правило поверх правила.
 */

export interface RepeatHint {
  key: string
  kind: TxKind
  categoryId?: string
  accountId: string
  amount: number
  freq: Freq
  dayOfMonth: number
  /** Даты, на которых повтор замечен: их и показываем человеку. */
  dates: string[]
  note?: string
}

/** Периоды, которые программа умеет узнавать, и допуск по каждому. */
const PERIODS: { freq: Freq; days: number; tol: number }[] = [
  { freq: 'monthly', days: 30.4, tol: 5 },
  { freq: 'weekly', days: 7, tol: 2 },
  { freq: 'yearly', days: 365, tol: 20 },
]

/**
 * Самая длинная цепочка дат с ровным шагом.
 *
 * Считать средний промежуток по всем датам подряд нельзя, и это выяснилось на
 * живых данных. У человека была настоящая ежемесячная подписка за 299 ₽ и
 * рядом ещё три разовых платежа ровно по 299 ₽ в той же категории. Все шесть
 * дат попадали в одну кучу, промежутки выходили 30, 31, 15, 4, 4 — разнобой,
 * и программа молчала, хотя подписка была как на ладони.
 *
 * Поэтому ищем не «ровный ли ряд целиком», а самую длинную его часть с ровным
 * шагом. Соседи с той же ценой такую цепочку больше не заслоняют, а из чистого
 * шума цепочка не собирается: три платежа с промежутком в четыре дня не
 * подходят ни под неделю, ни под месяц.
 */
function chainOf(dates: string[], days: number, tol: number): string[] {
  let best: string[] = []
  for (let i = 0; i < dates.length; i++) {
    const chain = [dates[i]]
    let last = dates[i]
    for (let j = i + 1; j < dates.length; j++) {
      if (Math.abs(diffDays(last, dates[j]) - days) <= tol) {
        chain.push(dates[j])
        last = dates[j]
      }
    }
    if (chain.length > best.length) best = chain
  }
  return best
}

/** Уже есть правило про то же самое? Тогда предлагать нечего. */
function covered(rules: Recurring[], h: { kind: TxKind; categoryId?: string; amount: number }): boolean {
  return rules.some(
    (r) => r.active && r.kind === h.kind && r.categoryId === h.categoryId && r.amount === h.amount,
  )
}

/*
 * Трёх раз требуем не из осторожности ради осторожности. Два платежа с
 * промежутком в месяц — это ещё и «сходил к врачу в июне и в июле»: цепочка
 * из двух собирается почти на любых данных, и предложений было бы больше,
 * чем настоящих подписок.
 */
export function findRepeats(data: VaultData, minTimes = 3): RepeatHint[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of data.transactions) {
    if (t.recurringId) continue
    if (t.kind === 'transfer') continue
    if (t.splits?.length) continue
    const key = [t.kind, t.categoryId ?? '—', t.accountId, t.amount].join('|')
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }

  const out: RepeatHint[] = []
  for (const [key, list] of groups) {
    if (list.length < minTimes) continue
    const dates = [...new Set(list.map((t) => t.date))].sort()
    if (dates.length < minTimes) continue

    let freq: Freq | null = null
    let chain: string[] = []
    for (const p of PERIODS) {
      const c = chainOf(dates, p.days, p.tol)
      if (c.length >= minTimes && c.length > chain.length) {
        chain = c
        freq = p.freq
      }
    }
    if (!freq) continue

    const first = list[0]
    if (covered(data.recurring, { kind: first.kind, categoryId: first.categoryId, amount: first.amount })) continue
    out.push({
      key,
      kind: first.kind,
      categoryId: first.categoryId,
      accountId: first.accountId,
      amount: first.amount,
      freq,
      dayOfMonth: parseISO(chain[chain.length - 1]).getDate(),
      // Показываем только те даты, что вошли в цепочку: соседние платежи с той
      // же суммой к этому повтору отношения не имеют, и путать их незачем.
      dates: chain,
      note: list.find((t) => t.note)?.note,
    })
  }

  // Сначала то, что повторялось чаще и стоит дороже: там и польза больше.
  return out.sort((a, b) => b.dates.length - a.dates.length || b.amount - a.amount)
}
