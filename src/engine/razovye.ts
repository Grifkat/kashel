/*
 * Разовые траты и прогноз по темпу.
 *
 * Прогноз «по темпу» делил траты на прошедшую долю месяца. На третий день
 * подписка за 30 000 ₽ превращалась в 300 000 ₽ к концу месяца: формула не
 * знала, что такой платёж бывает раз в месяц. Теперь траты делятся на две
 * части. Разовые входят в прогноз один раз, текущие растягиваются по темпу,
 * а регулярные платежи, которые ещё впереди, прибавляются отдельно.
 *
 * Разовая трата — одно из трёх:
 *  - статья с отметкой «Разовые траты» (у подкатегории без своей — как у главной);
 *  - платёж по регулярному правилу или по кредиту;
 *  - трата в редкой статье — где по истории бывает операция в месяц или
 *    реже (налоги, аренда, подписка): такие деньги уходят разом, сколько бы
 *    ни было;
 *  - операция не меньше десятой части обычного месяца трат — в новой статье
 *    или не частой. Продукты по 12 000 ₽ раз в неделю — это темп, а не
 *    разовая трата: частую статью ни размер, ни что-либо ещё не переводит
 *    в разовые (кроме отметки и правила).
 *
 * Обычный месяц — средние траты за три месяца перед текущим, считая только
 * месяцы, где траты были. Истории нет — порога по размеру нет.
 *
 * Карточка «Этот месяц», прогноз лимитов и совет «идёт выше обычного»
 * считают прогноз здесь, чтобы он нигде не расходился.
 */
import type { Category, Money, Recurring, Transaction } from '../lib/types'
import { addMonths, diffDays, endOfMonth, monthKey, startOfMonth, today } from '../lib/date'
import { датыПравила } from './avtospisaniya'
import { внесеноПоПравилу } from './platezhi'
import { родитель } from './podkategorii'

/** Доля обычного месяца, с которой одна операция считается разовой. */
export const ДОЛЯ_РАЗОВОЙ = 0.1
/** Сколько прошлых месяцев смотреть, чтобы понять «обычный месяц». */
export const МЕСЯЦЕВ_ИСТОРИИ = 3
/** С какого числа операций в месяц статья считается частой. */
export const ЧАСТАЯ_СТАТЬЯ = 3
/** До какого числа операций в месяц статья считается редкой. */
export const РЕДКАЯ_СТАТЬЯ = 1

interface История {
  /** Средние траты месяца; null — истории нет. */
  обычный: Money | null
  /** Статья → среднее число операций в месяц. */
  частота: Map<string, number>
}

const кэшИстории = new WeakMap<Transaction[], Map<string, История>>()

/** Обычный месяц и частота статей — по месяцам перед месяцем `now`. */
export function история(txs: Transaction[], now: string = today()): История {
  const мк = monthKey(now)
  let поМесяцам = кэшИстории.get(txs)
  const было = поМесяцам?.get(мк)
  if (было) return было
  const ключи = new Set<string>()
  for (let i = 1; i <= МЕСЯЦЕВ_ИСТОРИИ; i++) ключи.add(monthKey(addMonths(мк + '-01', -i)))
  const суммы = new Map<string, Money>()
  const штук = new Map<string, number>()
  for (const t of txs) {
    if (t.kind !== 'expense') continue
    const к = monthKey(t.date)
    if (!ключи.has(к)) continue
    суммы.set(к, (суммы.get(к) ?? 0) + t.amount)
    const статьи = t.splits?.length ? t.splits.map((s) => s.categoryId) : t.categoryId ? [t.categoryId] : []
    for (const id of new Set(статьи)) штук.set(id, (штук.get(id) ?? 0) + 1)
  }
  const месяцев = суммы.size
  const итог: История = {
    обычный: месяцев ? Math.round([...суммы.values()].reduce((a, b) => a + b, 0) / месяцев) : null,
    частота: new Map([...штук].map(([id, n]) => [id, n / Math.max(1, месяцев)])),
  }
  if (!поМесяцам) {
    поМесяцам = new Map()
    кэшИстории.set(txs, поМесяцам)
  }
  поМесяцам.set(мк, итог)
  return итог
}

/** Разовая ли статья: своя отметка, а без неё — как у главной. */
export function разоваяСтатья(c: Category, cats: Category[]): boolean {
  if (c.oneOff !== undefined) return c.oneOff
  return !!родитель(c, cats)?.oneOff
}

/** Всё, что нужно, чтобы отличить разовую трату от текущей. */
export interface Разовость {
  /** С какой суммы операция разовая по размеру; null — порога нет. */
  порог: Money | null
  частота: Map<string, number>
  /** Статьи с отметкой «Разовые траты» (свой или главной). */
  статьи: Set<string>
  /** Действующие регулярные правила расходов. */
  правила: Recurring[]
}

export function разовость(cats: Category[], txs: Transaction[], правила: Recurring[] = [], now: string = today()): Разовость {
  const и = история(txs, now)
  return {
    порог: и.обычный ? Math.round(и.обычный * ДОЛЯ_РАЗОВОЙ) : null,
    частота: и.частота,
    статьи: new Set(cats.filter((c) => c.kind === 'expense' && разоваяСтатья(c, cats)).map((c) => c.id)),
    правила: правила.filter((r) => r.active && r.kind === 'expense'),
  }
}

/** Платёж по правилу или кредиту: помечен им или той же статьи на ту же сумму. */
function поПравилу(t: Transaction, р: Разовость): boolean {
  if (t.recurringId || t.debtId) return true
  return р.правила.some((r) => !!r.categoryId && r.categoryId === t.categoryId && r.amount === t.amount)
}

/**
 * Разовая по истории статьи: частая — никогда; редкая (была в истории, но
 * не чаще раза в месяц) — при любой сумме; новая или средняя — по размеру.
 */
function поИстории(t: Transaction, р: Разовость): boolean {
  const статьи = t.splits?.length ? t.splits.map((s) => s.categoryId) : t.categoryId ? [t.categoryId] : []
  const частоты = статьи.map((id) => р.частота.get(id) ?? 0)
  if (частоты.some((ч) => ч >= ЧАСТАЯ_СТАТЬЯ)) return false
  if (частоты.length && частоты.every((ч) => ч > 0 && ч <= РЕДКАЯ_СТАТЬЯ)) return true
  return р.порог != null && t.amount >= р.порог
}

/**
 * Сколько от операции входит в выборку статей (`своя`) и сколько из этого
 * разовое. Без выборки — вся операция.
 */
export function разоваяЧасть(t: Transaction, р: Разовость, своя?: (id: string) => boolean): { всего: Money; разовая: Money } {
  const целиком = поПравилу(t, р) || поИстории(t, р)
  if (t.splits?.length) {
    let всего = 0
    let разовая = 0
    for (const s of t.splits) {
      if (своя && !своя(s.categoryId)) continue
      всего += s.amount
      if (целиком || р.статьи.has(s.categoryId)) разовая += s.amount
    }
    return { всего, разовая }
  }
  if (своя && !(t.categoryId && своя(t.categoryId))) return { всего: 0, разовая: 0 }
  return { всего: t.amount, разовая: целиком || (!!t.categoryId && р.статьи.has(t.categoryId)) ? t.amount : 0 }
}

/** Сумма, растянутая на весь отрезок по прошедшей доле. Отрезок кончился или не начался — как есть. */
export function поТемпу(сумма: Money, от: string, до: string, now: string = today(), минДоля = 0.05): Money {
  if (now < от || now > до) return сумма
  const всего = diffDays(от, до) + 1
  const прошло = diffDays(от, now) + 1
  return Math.round(сумма / Math.max(минДоля, прошло / всего))
}

/**
 * Сколько ещё уйдёт по регулярным правилам с этого месяца до конца отрезка.
 * В этом месяце — неоплаченное (и просроченное: его всё равно ждут), дальше —
 * каждая дата правила. Оплаченное уже сидит в тратах и второй раз не идёт.
 */
export function ещёПоПравилам(правила: Recurring[], txs: Transaction[], от: string, до: string, now: string = today(), своя?: (id: string) => boolean): Money {
  const начало = от > startOfMonth(now) ? от : startOfMonth(now)
  if (начало > до) return 0
  const этот = monthKey(now)
  let итог = 0
  for (let мк = monthKey(начало); мк <= monthKey(до); мк = monthKey(addMonths(мк + '-01', 1))) {
    const с = мк + '-01'
    const по = endOfMonth(с)
    for (const r of правила) {
      if (!r.active || r.kind !== 'expense' || (своя && !(r.categoryId && своя(r.categoryId)))) continue
      const дни = датыПравила(r, с, по)
      let внесено = мк === этот ? внесеноПоПравилу(r, txs, мк) : 0
      for (const д of дни) {
        const своё = Math.min(r.amount, внесено)
        внесено -= своё
        if (д >= начало && д <= до) итог += r.amount - своё
      }
    }
  }
  return итог
}

export interface ПрогнозТрат {
  потрачено: Money
  /** Входят в прогноз один раз. */
  разовые: Money
  /** Растягиваются по темпу. */
  текущие: Money
  /** Операций с текущей частью. */
  операцийТекущих: number
  /** Регулярные платежи, которые ещё впереди. */
  впереди: Money
  прогноз: Money
}

/**
 * Прогноз трат к концу отрезка: разовые — как есть, текущие — по темпу,
 * плюс ещё не внесённые регулярные платежи. `малоОпераций` — порог из
 * лимитов: одну-две текущие операции темпом не растягивать.
 */
export function прогнозТрат(
  txs: Transaction[],
  от: string,
  до: string,
  р: Разовость,
  now: string = today(),
  своя?: (id: string) => boolean,
  малоОпераций = 0,
): ПрогнозТрат {
  let потрачено = 0
  let разовые = 0
  let операцийТекущих = 0
  for (const t of txs) {
    if (t.kind !== 'expense' || t.date < от || t.date > до) continue
    const ч = разоваяЧасть(t, р, своя)
    if (!ч.всего) continue
    потрачено += ч.всего
    разовые += ч.разовая
    if (ч.всего > ч.разовая) операцийТекущих++
  }
  const текущие = потрачено - разовые
  const растянуто = операцийТекущих <= малоОпераций ? текущие : поТемпу(текущие, от, до, now)
  const впереди = ещёПоПравилам(р.правила, txs, от, до, now, своя)
  return { потрачено, разовые, текущие, операцийТекущих, впереди, прогноз: разовые + растянуто + впереди }
}
