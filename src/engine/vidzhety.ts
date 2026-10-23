/*
 * Свой виджет канваса: что считать, по каким операциям, за какой период и
 * по какой формуле.
 *
 * Здесь нет ни React, ни DOM — только счёт, чтобы его можно было проверить
 * самопроверкой и не пересчитывать на каждой перерисовке доски.
 *
 * Формула разбирается своим парсером: ни eval, ни Function. Формула приходит
 * из файла хранилища, а хранилище можно получить архивом от кого угодно, —
 * выполнять его как код нельзя. Парсер знает четыре действия, скобки,
 * проценты у чисел и имена показателей; всё остальное — понятная ошибка с
 * местом, где споткнулись.
 *
 * Деньги внутри формулы — в рублях, не в копейках: «остаток − 5000» значит
 * пять тысяч рублей, как и пишет человек. Результат помнит, деньги это или
 * просто число: «расход / доход» — уже не деньги, и «× 100» даёт проценты.
 */
import type { Account, Category, Money, Transaction, VaultData, СвойВиджет, ПоказательВиджета } from '../lib/types'
import { accountBalance, balances, isAsset } from './stats'
import { личное, проектная, проектныеИды, проектный } from './project'
import { родитель, семья } from './podkategorii'
import { прогрессЦели } from './zarabotok'
import { addDays, addMonths, diffDays, endOfMonth, monthRange, startOfMonth, startOfYear, today } from '../lib/date'
import { текущійЯзык, т } from '../i18n'

// ------------------------------------------------------------------ период

export interface Окно {
  from: string
  to: string
}

/** Окно виджета: период доски или свой. */
export function окноВиджета(w: Pick<СвойВиджет, 'period'>, доскаС: string, now: string = today()): Окно {
  switch (w.period) {
    case '1m': return { from: addMonths(now, -1), to: now }
    case '3m': return { from: addMonths(now, -3), to: now }
    case '12m': return { from: addMonths(now, -12), to: now }
    case 'month': return { from: startOfMonth(now), to: now }
    case 'year': return { from: startOfYear(now), to: now }
    case 'all': return { from: '0000-01-01', to: now }
    default: return { from: доскаС, to: now }
  }
}

// ------------------------------------------------------------ среда счёта

/** Операции и счета, которые видит виджет, с его фильтрами. */
interface Среда {
  data: VaultData
  /** Счета в охвате: личные, проектные или все. */
  счета: Account[]
  /** Операции в охвате, уже отобранные по счетам и тегам. */
  операции: Transaction[]
  /** Категории фильтра вместе с подкатегориями; null — все. */
  категории: Set<string> | null
  /** Выбранные в фильтре счета; null — все. */
  счетаФильтра: Set<string> | null
  /** Цепочка своих виджетов, которые сейчас считаются, — от петель. */
  стек: string[]
}

function среда(w: СвойВиджет, data: VaultData, стек: string[] = []): Среда {
  const ф = w.filter ?? {}
  let счета: Account[]
  let операции: Transaction[]
  if (ф.scope === 'all') {
    счета = data.accounts
    операции = data.transactions
  } else if (ф.scope === 'project') {
    const иды = проектныеИды(data)
    счета = data.accounts.filter(проектный)
    операции = data.transactions.filter((t) => проектная(t, иды))
  } else {
    const своё = личное(data)
    счета = своё.accounts
    операции = своё.transactions
  }
  const счетаФильтра = ф.accounts?.length ? new Set(ф.accounts) : null
  if (счетаФильтра) {
    счета = счета.filter((a) => счетаФильтра.has(a.id))
    операции = операции.filter((t) => счетаФильтра.has(t.accountId) || (!!t.toAccountId && счетаФильтра.has(t.toAccountId)))
  }
  if (ф.tags?.length) {
    const теги = new Set(ф.tags)
    операции = операции.filter((t) => t.tags.some((x) => теги.has(x)))
  }
  let категории: Set<string> | null = null
  if (ф.categories?.length) {
    категории = new Set()
    for (const id of ф.categories) for (const x of семья(id, data.categories)) категории.add(x)
  }
  return { data, счета, операции, категории, счетаФильтра, стек }
}

/** Сколько из операции приходится на категории: фильтра и уточнения разом. */
function доля(t: Transaction, a: Set<string> | null, b: Set<string> | null): Money {
  if (!a && !b) return t.amount
  const годна = (id: string | undefined) => !!id && (!a || a.has(id)) && (!b || b.has(id))
  if (t.splits?.length) return t.splits.reduce((s, x) => s + (годна(x.categoryId) ? x.amount : 0), 0)
  return годна(t.categoryId) ? t.amount : 0
}

const вОкне = (t: Transaction, о: Окно) => t.date >= о.from && t.date <= о.to

function сумма(с: Среда, вид: 'income' | 'expense', о: Окно, кат: Set<string> | null = null, тег?: string): Money {
  let s = 0
  for (const t of с.операции) {
    if (t.kind !== вид || !вОкне(t, о)) continue
    if (тег && !t.tags.includes(тег)) continue
    s += доля(t, с.категории, кат)
  }
  return s
}

function сколько(с: Среда, о: Окно, кат: Set<string> | null = null, вид?: 'income' | 'expense'): number {
  let n = 0
  for (const t of с.операции) {
    if (t.kind === 'transfer' || (вид && t.kind !== вид) || !вОкне(t, о)) continue
    if (доля(t, с.категории, кат) > 0) n++
  }
  return n
}

/** Остаток на конец окна: свои деньги на счетах охвата (или на выбранных в фильтре). */
function остаток(с: Среда, о: Окно): Money {
  let s = 0
  for (const a of с.счета) {
    if (a.archived) continue
    if (!с.счетаФильтра && !isAsset(a)) continue
    s += accountBalance(a, с.data.transactions, о.to)
  }
  return s
}

function счёт(с: Среда, id: string, о: Окно): Money {
  const a = с.data.accounts.find((x) => x.id === id)
  return a ? accountBalance(a, с.data.transactions, о.to) : 0
}

function цель(с: Среда, id: string): Money {
  const g = с.data.goals.find((x) => x.id === id)
  if (!g) return 0
  return прогрессЦели(g, с.data, balances(с.data.accounts, с.data.transactions).byAccount).сумма
}

function категорияСумма(с: Среда, id: string, о: Окно): Money {
  const c = с.data.categories.find((x) => x.id === id)
  if (!c) return 0
  return сумма(с, c.kind === 'income' ? 'income' : 'expense', о, семья(id, с.data.categories))
}

/** Показатель без формулы. Деньги — в копейках. */
function показатель(с: Среда, metric: ПоказательВиджета, ref: string | undefined, о: Окно): Значение {
  switch (metric) {
    case 'income': return { v: сумма(с, 'income', о), d: 'm' }
    case 'expense': return { v: сумма(с, 'expense', о), d: 'm' }
    case 'net': return { v: сумма(с, 'income', о) - сумма(с, 'expense', о), d: 'm' }
    case 'balance': return { v: остаток(с, о), d: 'm' }
    case 'category': return { v: ref ? категорияСумма(с, ref, о) : 0, d: 'm' }
    case 'account': return { v: ref ? счёт(с, ref, о) : 0, d: 'm' }
    case 'goal': return { v: ref ? цель(с, ref) : 0, d: 'm' }
    case 'count': return { v: сколько(с, о), d: 'n' }
    case 'avg': {
      const n = сколько(с, о, null, 'expense')
      return { v: n ? Math.round(сумма(с, 'expense', о) / n) : 0, d: 'm' }
    }
  }
}

// ----------------------------------------------------------------- формула

/** Значение в формуле: деньги ('m') или просто число ('n'). */
interface Значение {
  v: number
  d: 'm' | 'n'
}

type Узел =
  | { k: 'num'; v: number; проц: boolean; где: number }
  | { k: 'name'; слово: string; уточнение?: string; где: number; текст: string }
  | { k: 'neg'; a: Узел; где: number }
  | { k: 'op'; оп: '+' | '-' | '*' | '/'; a: Узел; b: Узел; где: number }

export class ОшибкаФормулы extends Error {
  constructor(сообщение: string, public где: number) {
    super(сообщение)
  }
}

type Лексема =
  | { k: 'num'; v: number; проц: boolean; где: number; текст: string }
  | { k: 'name'; текст: string; где: number }
  | { k: 'str'; текст: string; где: number }
  | { k: 'sign'; текст: '+' | '-' | '*' | '/' | '(' | ')' | ':'; где: number }

const ЗНАКИ: Record<string, '+' | '-' | '*' | '/' | '(' | ')' | ':'> = {
  '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '(': '(', ')': ')', ':': ':',
}
const КАВЫЧКИ: Record<string, string> = { '"': '"', "'": "'", '«': '»', '“': '”' }
const буква = (ch: string) => /[\p{L}_]/u.test(ch)
const вИмени = (ch: string) => /[\p{L}\p{N}_ .&]/u.test(ch)

function лексемы(src: string): Лексема[] {
  const out: Лексема[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/\d/.test(ch)) {
      const m = /^\d+(?:[.,]\d+)?/.exec(src.slice(i))!
      let j = i + m[0].length
      // Пробелы внутри числа — разряды: «10 000».
      let текст = m[0]
      for (;;) {
        const r = /^ (\d{3})(?![\d])/.exec(src.slice(j))
        if (!r || текст.includes(',') || текст.includes('.')) break
        текст += r[1]
        j += r[0].length
      }
      const проц = src[j] === '%'
      if (проц) j++
      out.push({ k: 'num', v: Number(текст.replace(',', '.')), проц, где: i, текст: src.slice(i, j) })
      i = j
      continue
    }
    if (ЗНАКИ[ch]) {
      out.push({ k: 'sign', текст: ЗНАКИ[ch], где: i })
      i++
      continue
    }
    if (КАВЫЧКИ[ch]) {
      const конец = src.indexOf(КАВЫЧКИ[ch], i + 1)
      if (конец < 0) throw new ОшибкаФормулы(т('Не закрыта кавычка'), i)
      out.push({ k: 'str', текст: src.slice(i + 1, конец), где: i })
      i = конец + 1
      continue
    }
    if (буква(ch)) {
      let j = i
      while (j < src.length && вИмени(src[j])) j++
      out.push({ k: 'name', текст: src.slice(i, j).trim(), где: i })
      i = j
      continue
    }
    throw new ОшибкаФормулы(т('Непонятный знак «{0}»', ch), i)
  }
  return out
}

/** Разбор формулы в дерево. Бросает ОшибкаФормулы. */
export function разобрать(src: string): Узел {
  const л = лексемы(src)
  if (!л.length) throw new ОшибкаФормулы(т('Формула пустая'), 0)
  let i = 0
  const тут = () => л[i]
  const где = () => (л[i] ? л[i].где : src.length)
  const показ = (x: Лексема) => (x.k === 'num' ? x.текст : x.k === 'str' ? `«${x.текст}»` : x.текст)

  const выражение = (): Узел => {
    let a = слагаемое()
    while (тут()?.k === 'sign' && (тут().текст === '+' || тут().текст === '-')) {
      const з = тут() as Extract<Лексема, { k: 'sign' }>
      i++
      a = { k: 'op', оп: з.текст as '+' | '-', a, b: слагаемое(), где: з.где }
    }
    return a
  }
  const слагаемое = (): Узел => {
    let a = множитель()
    while (тут()?.k === 'sign' && (тут().текст === '*' || тут().текст === '/')) {
      const з = тут() as Extract<Лексема, { k: 'sign' }>
      i++
      a = { k: 'op', оп: з.текст as '*' | '/', a, b: множитель(), где: з.где }
    }
    return a
  }
  const множитель = (): Узел => {
    const x = тут()
    if (x?.k === 'sign' && (x.текст === '-' || x.текст === '+')) {
      i++
      const a = множитель()
      return x.текст === '-' ? { k: 'neg', a, где: x.где } : a
    }
    return первичное()
  }
  const первичное = (): Узел => {
    const x = тут()
    const пред = л[i - 1]
    if (!x) {
      throw new ОшибкаФормулы(пред ? т('После «{0}» нужно число или имя', показ(пред)) : т('Формула пустая'), src.length)
    }
    if (x.k === 'num') {
      i++
      return { k: 'num', v: x.v, проц: x.проц, где: x.где }
    }
    if (x.k === 'name' || x.k === 'str') {
      i++
      let уточнение: string | undefined
      let конец = x.где + x.текст.length + (x.k === 'str' ? 2 : 0)
      if (тут()?.k === 'sign' && тут().текст === ':') {
        i++
        const у = тут()
        if (!у || (у.k !== 'name' && у.k !== 'str' && у.k !== 'num')) {
          throw new ОшибкаФормулы(т('После «{0}:» нужно имя', x.текст), где())
        }
        уточнение = у.k === 'num' ? у.текст : у.текст
        конец = у.где + (у.k === 'str' ? у.текст.length + 2 : у.текст.length)
        i++
      }
      return { k: 'name', слово: x.текст, уточнение, где: x.где, текст: src.slice(x.где, конец).trim() }
    }
    if (x.текст === '(') {
      i++
      if (тут()?.k === 'sign' && тут().текст === ')') throw new ОшибкаФормулы(т('Пустые скобки'), где())
      const a = выражение()
      if (!(тут()?.k === 'sign' && тут().текст === ')')) throw new ОшибкаФормулы(т('Не хватает закрывающей скобки'), где())
      i++
      return a
    }
    if (x.текст === ')') throw new ОшибкаФормулы(т('Лишняя закрывающая скобка'), x.где)
    throw new ОшибкаФормулы(
      пред ? т('После «{0}» нужно число или имя', показ(пред)) : т('Формула не может начинаться с «{0}»', x.текст),
      x.где,
    )
  }

  const дерево = выражение()
  const x = тут()
  if (x) {
    if (x.k === 'sign' && x.текст === ')') throw new ОшибкаФормулы(т('Лишняя закрывающая скобка'), x.где)
    throw new ОшибкаФормулы(т('Между «{0}» и «{1}» нужен знак: + − × /', показ(л[i - 1]), показ(x)), x.где)
  }
  return дерево
}

// ---------------------------------------------------------------- имена

type Слово = 'income' | 'expense' | 'balance' | 'net' | 'count' | 'avg' | 'category' | 'account' | 'goal' | 'tag' | 'widget'

/**
 * Имена показателей. Формула понимает оба языка сразу: доска с формулой,
 * написанной по-русски, не ломается у того, кто переключил окно на
 * английский, и наоборот. Первое имя в списке — то, что показывает подсказка.
 */
const СЛОВА: { id: Слово; ru: string[]; en: string[] }[] = [
  { id: 'income', ru: ['доход', 'доходы'], en: ['income'] },
  { id: 'expense', ru: ['расход', 'расходы', 'траты'], en: ['expense', 'expenses', 'spent'] },
  { id: 'balance', ru: ['остаток', 'баланс'], en: ['balance'] },
  { id: 'net', ru: ['поток', 'чистый поток'], en: ['net', 'net flow'] },
  { id: 'count', ru: ['операций', 'операции'], en: ['count', 'operations'] },
  { id: 'avg', ru: ['чек', 'средний чек'], en: ['avg', 'average'] },
  { id: 'category', ru: ['категория'], en: ['category'] },
  { id: 'account', ru: ['счёт', 'счет'], en: ['account'] },
  { id: 'goal', ru: ['цель'], en: ['goal'] },
  { id: 'tag', ru: ['тег'], en: ['tag'] },
  { id: 'widget', ru: ['виджет'], en: ['widget'] },
]

const норм = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ')

const словоПо = new Map<string, Слово>()
for (const с of СЛОВА) for (const имя of [...с.ru, ...с.en]) словоПо.set(норм(имя), с.id)

/** Имя показателя на языке окна — для подсказок. */
export const имяСлова = (id: Слово): string => {
  const с = СЛОВА.find((x) => x.id === id)!
  return текущійЯзык() === 'en' ? с.en[0] : с.ru[0]
}

/** Что именно считает имя из формулы. */
type Терм =
  | { к: 'metric'; metric: ПоказательВиджета; ref?: string }
  | { к: 'income' | 'expense' | 'count'; кат?: Set<string>; тег?: string }
  | { к: 'widget'; w: СвойВиджет }

const найти = <T extends { name: string }>(список: T[], имя: string): T | undefined => {
  const н = норм(имя)
  return список.find((x) => норм(x.name) === н)
}

function категорияПо(data: VaultData, имя: string, вид?: 'income' | 'expense'): Category | undefined {
  const н = норм(имя)
  const подходит = data.categories.filter((c) => норм(c.name) === н && (!вид || c.kind === вид))
  // Одинаковые имена у главной и подкатегории — берём главную.
  return подходит.find((c) => !родитель(c, data.categories)) ?? подходит[0]
}

const естьТег = (data: VaultData, тег: string) => {
  const н = норм(тег.replace(/^#/, ''))
  for (const t of data.transactions) for (const x of t.tags) if (норм(x) === н) return x
  return undefined
}

const подсказкаИмён = () =>
  т('Можно: {0}, а ещё имя цели, счёта, категории или своего виджета',
    (['income', 'expense', 'balance', 'net', 'count', 'avg'] as Слово[]).map(имяСлова).join(', '))

function связать(у: Extract<Узел, { k: 'name' }>, data: VaultData, сам: string | undefined): Терм {
  const слово = словоПо.get(норм(у.слово))
  const библиотека = (data.widgets ?? []).filter((w) => w.id !== сам)
  const семьяКат = (c: Category) => семья(c.id, data.categories)

  if (у.уточнение !== undefined) {
    const что = у.уточнение
    if (!что.trim()) throw new ОшибкаФормулы(т('После «{0}:» нужно имя', у.слово), у.где)
    switch (слово) {
      case 'income':
      case 'expense':
      case 'count': {
        const вид = слово === 'income' ? 'income' : слово === 'expense' ? 'expense' : undefined
        const c = категорияПо(data, что, вид)
        const к = слово === 'income' ? 'income' : слово === 'expense' ? 'expense' : 'count'
        if (c) return { к, кат: семьяКат(c) }
        const тег = естьТег(data, что)
        if (тег) return { к, тег }
        throw new ОшибкаФормулы(т('Нет категории или тега «{0}»', что), у.где)
      }
      case 'category': {
        const c = категорияПо(data, что)
        if (!c) throw new ОшибкаФормулы(т('Нет категории «{0}»', что), у.где)
        return { к: 'metric', metric: 'category', ref: c.id }
      }
      case 'account': {
        const a = найти(data.accounts, что)
        if (!a) throw new ОшибкаФормулы(т('Нет счёта «{0}»', что), у.где)
        return { к: 'metric', metric: 'account', ref: a.id }
      }
      case 'goal': {
        const g = найти(data.goals, что)
        if (!g) throw new ОшибкаФормулы(т('Нет цели «{0}»', что), у.где)
        return { к: 'metric', metric: 'goal', ref: g.id }
      }
      case 'tag': {
        const тег = естьТег(data, что)
        if (!тег) throw new ОшибкаФормулы(т('Нет тега «{0}»', что), у.где)
        return { к: 'expense', тег }
      }
      case 'widget': {
        const w = найти(библиотека, что)
        if (!w) throw new ОшибкаФормулы(т('Нет своего виджета «{0}»', что), у.где)
        return { к: 'widget', w }
      }
      default:
        throw new ОшибкаФормулы(т('Не знаю «{0}:». Уточнять можно доход, расход, операций, счёт, цель, категорию, тег и виджет', у.слово), у.где)
    }
  }

  switch (слово) {
    case 'income': return { к: 'metric', metric: 'income' }
    case 'expense': return { к: 'metric', metric: 'expense' }
    case 'balance': return { к: 'metric', metric: 'balance' }
    case 'net': return { к: 'metric', metric: 'net' }
    case 'count': return { к: 'metric', metric: 'count' }
    case 'avg': return { к: 'metric', metric: 'avg' }
    case undefined: break
    default: throw new ОшибкаФормулы(т('После «{0}» нужно двоеточие и имя', у.слово), у.где)
  }
  // Голое имя: свой виджет, цель, счёт, категория, тег — в таком порядке.
  const w = найти(библиотека, у.слово)
  if (w) return { к: 'widget', w }
  const g = найти(data.goals, у.слово)
  if (g) return { к: 'metric', metric: 'goal', ref: g.id }
  const a = найти(data.accounts, у.слово)
  if (a) return { к: 'metric', metric: 'account', ref: a.id }
  const c = категорияПо(data, у.слово)
  if (c) return { к: 'metric', metric: 'category', ref: c.id }
  const тег = естьТег(data, у.слово)
  if (тег) return { к: 'expense', тег }
  throw new ОшибкаФормулы(т('Не знаю «{0}». {1}', у.текст, подсказкаИмён()), у.где)
}

// ---------------------------------------------------------------- счёт

class ДелениеНаНоль extends Error {}

function значениеТерма(т_: Терм, с: Среда, о: Окно): Значение {
  if (т_.к === 'metric') return показатель(с, т_.metric, т_.ref, о)
  if (т_.к === 'widget') {
    if (с.стек.includes(т_.w.id)) throw new ОшибкаФормулы(т('Виджет «{0}» ссылается сам на себя', т_.w.name), 0)
    const и = посчитатьВ(т_.w, с.data, о, [...с.стек, т_.w.id])
    if (и.ошибка) throw new ОшибкаФормулы(т('В виджете «{0}»: {1}', т_.w.name, и.ошибка), 0)
    return { v: и.значение ?? 0, d: и.размерность }
  }
  if (т_.к === 'count') return { v: сколько(с, о, т_.кат ?? null), d: 'n' }
  const вид = т_.к === 'income' ? 'income' : 'expense'
  return { v: сумма(с, вид, о, т_.кат ?? null, т_.тег), d: 'm' }
}

/** Деньги из копеек в рубли и обратно: в формуле человек пишет рубли. */
const вРубли = (з: Значение): Значение => (з.d === 'm' ? { v: з.v / 100, d: 'm' } : з)

function вычислить(у: Узел, связи: Map<Узел, Терм>, с: Среда, о: Окно): Значение {
  switch (у.k) {
    case 'num': return { v: у.проц ? у.v / 100 : у.v, d: 'n' }
    case 'name': return вРубли(значениеТерма(связи.get(у)!, с, о))
    case 'neg': {
      const a = вычислить(у.a, связи, с, о)
      return { v: -a.v, d: a.d }
    }
    case 'op': {
      const a = вычислить(у.a, связи, с, о)
      const b = вычислить(у.b, связи, с, о)
      if (у.оп === '+' || у.оп === '-') {
        return { v: у.оп === '+' ? a.v + b.v : a.v - b.v, d: a.d === 'm' || b.d === 'm' ? 'm' : 'n' }
      }
      if (у.оп === '*') return { v: a.v * b.v, d: (a.d === 'm') !== (b.d === 'm') ? 'm' : 'n' }
      if (b.v === 0) throw new ДелениеНаНоль()
      return { v: a.v / b.v, d: a.d === 'm' && b.d === 'n' ? 'm' : 'n' }
    }
  }
}

/** «… × 100» в самом конце — значит, человек считает проценты. */
const похожеНаПроценты = (у: Узел): boolean =>
  у.k === 'op' && у.оп === '*' && ((у.b.k === 'num' && у.b.v === 100 && !у.b.проц) || (у.a.k === 'num' && у.a.v === 100 && !у.a.проц))

function имена(у: Узел, out: Extract<Узел, { k: 'name' }>[] = []): Extract<Узел, { k: 'name' }>[] {
  if (у.k === 'name') out.push(у)
  else if (у.k === 'neg') имена(у.a, out)
  else if (у.k === 'op') {
    имена(у.a, out)
    имена(у.b, out)
  }
  return out
}

export interface ИтогВиджета {
  /** Деньги — в копейках; null — посчитать нельзя (ошибка или деление на ноль). */
  значение: number | null
  размерность: 'm' | 'n'
  формат: 'money' | 'percent' | 'number'
  /** Ошибка формулы — на языке окна, с местом. */
  ошибка?: string
  где?: number
  /** Формула верна, но числа нет — например, делить пришлось на ноль. */
  примечание?: string
}

interface Разбор {
  дерево: Узел
  связи: Map<Узел, Терм>
}

/** Разобрать и связать формулу с данными. Бросает ОшибкаФормулы. */
function подготовить(w: СвойВиджет, data: VaultData): Разбор {
  const дерево = разобрать(w.formula ?? '')
  const связи = new Map<Узел, Терм>()
  for (const у of имена(дерево)) связи.set(у, связать(у, data, w.id))
  return { дерево, связи }
}

const естьФормула = (w: СвойВиджет) => !!w.formula?.trim()

function посчитатьВ(w: СвойВиджет, data: VaultData, о: Окно, стек: string[] = [w.id]): ИтогВиджета {
  const с = среда(w, data, стек)
  if (!естьФормула(w)) {
    const з = показатель(с, w.metric, w.ref, о)
    return { значение: з.v, размерность: з.d, формат: w.format ?? (з.d === 'm' ? 'money' : 'number') }
  }
  let р: Разбор
  try {
    р = подготовить(w, data)
  } catch (e) {
    if (e instanceof ОшибкаФормулы) return { значение: null, размерность: 'n', формат: w.format ?? 'number', ошибка: e.message, где: e.где }
    throw e
  }
  try {
    const з = вычислить(р.дерево, р.связи, с, о)
    const формат = w.format ?? (з.d === 'm' ? 'money' : похожеНаПроценты(р.дерево) ? 'percent' : 'number')
    // Деньги — обратно в копейки, как во всей программе.
    const значение = з.d === 'm' ? Math.round(з.v * 100) : з.v
    return { значение: Number.isFinite(значение) ? значение : null, размерность: з.d, формат }
  } catch (e) {
    if (e instanceof ДелениеНаНоль) return { значение: null, размерность: 'n', формат: w.format ?? 'number', примечание: т('деление на ноль') }
    if (e instanceof ОшибкаФормулы) return { значение: null, размерность: 'n', формат: w.format ?? 'number', ошибка: e.message, где: e.где }
    throw e
  }
}

/** Главное число виджета за его окно. */
export function посчитать(w: СвойВиджет, data: VaultData, доскаС: string, now: string = today()): ИтогВиджета {
  return посчитатьВ(w, data, окноВиджета(w, доскаС, now))
}

/** Только проверка формулы — для окна конструктора. Пустая строка — всё верно. */
export function проверитьФормулу(w: СвойВиджет, data: VaultData): { ошибка: string; где: number } | null {
  if (!естьФормула(w)) return null
  try {
    подготовить(w, data)
    return null
  } catch (e) {
    if (e instanceof ОшибкаФормулы) return { ошибка: e.message, где: e.где }
    throw e
  }
}

// ---------------------------------------------------------------- ряд

export interface ТочкаРяда {
  from: string
  to: string
  значение: number | null
}

/**
 * Ряд по времени — для линии и столбцов. Окно до полутора месяцев режется
 * на недели, длиннее — на месяцы, не больше двух лет: дальше столбцы
 * становятся нитками.
 */
export function рядВиджета(w: СвойВиджет, data: VaultData, доскаС: string, now: string = today()): ТочкаРяда[] {
  const о = окноВиджета(w, доскаС, now)
  let from = о.from
  if (from < '1900-01-01') {
    const первая = data.transactions.reduce((m, t) => (t.date < m ? t.date : m), о.to)
    from = startOfMonth(первая)
  }
  const куски: Окно[] = []
  if (diffDays(from, о.to) <= 45) {
    for (let d = from; d <= о.to; d = addDays(d, 7)) {
      const конец = addDays(d, 6)
      куски.push({ from: d, to: конец < о.to ? конец : о.to })
    }
  } else {
    for (const к of monthRange(from, о.to).slice(-24)) {
      const начало = к + '-01'
      const конец = endOfMonth(начало)
      куски.push({ from: начало < from ? from : начало, to: конец < о.to ? конец : о.to })
    }
  }
  return куски.map((к) => ({ ...к, значение: посчитатьВ(w, data, к).значение }))
}

// ---------------------------------------------------------------- разбивка

export interface Доля {
  id: string
  имя: string
  значение: number
  цвет: string
  размерность: 'm' | 'n'
}

/**
 * Из чего сложилось число — для круговой и списка. У формулы — её слагаемые,
 * у суммы — категории, у остатка — счета. Пусто — раскладывать нечего.
 */
export function разбивкаВиджета(w: СвойВиджет, data: VaultData, доскаС: string, now: string = today()): Доля[] {
  const о = окноВиджета(w, доскаС, now)
  const с = среда(w, data, [w.id])
  const цвета = ['var(--accent)', 'var(--info)', 'var(--warn)', 'var(--money-in)', 'var(--alert)', 'var(--muted)']

  if (естьФормула(w)) {
    let р: Разбор
    try {
      р = подготовить(w, data)
    } catch {
      return []
    }
    const уже = new Set<string>()
    const out: Доля[] = []
    for (const у of имена(р.дерево)) {
      const ключ = норм(у.текст)
      if (уже.has(ключ)) continue
      уже.add(ключ)
      try {
        const з = значениеТерма(р.связи.get(у)!, с, о)
        out.push({ id: ключ, имя: у.текст, значение: з.v, цвет: цвета[out.length % цвета.length], размерность: з.d })
      } catch {
        /* слагаемое с ошибкой пропускаем: о ней скажет главное число */
      }
    }
    return out
  }

  if (w.metric === 'balance') {
    return с.счета
      .filter((a) => !a.archived && (с.счетаФильтра || isAsset(a)))
      .map((a) => ({ id: a.id, имя: a.name, значение: accountBalance(a, data.transactions, о.to), цвет: a.color, размерность: 'm' as const }))
      .filter((x) => x.значение !== 0)
      .sort((a, b) => b.значение - a.значение)
  }
  if (w.metric === 'account' || w.metric === 'goal') return []

  // Суммы — по категориям. У категории — по её подкатегориям, иначе — по главным.
  const кат = w.metric === 'category' && w.ref ? data.categories.find((c) => c.id === w.ref) : undefined
  const вид: 'income' | 'expense' = кат ? (кат.kind === 'income' ? 'income' : 'expense') : w.metric === 'income' ? 'income' : 'expense'
  const внутри = кат ? семья(кат.id, data.categories) : null
  const куда = (id: string): string => {
    if (кат) return id
    const c = data.categories.find((x) => x.id === id)
    return (c && родитель(c, data.categories)?.id) ?? id
  }
  const м = new Map<string, number>()
  const добавить = (id: string | undefined, v: number) => {
    if (!v) return
    const к = id ? куда(id) : '__none__'
    м.set(к, (м.get(к) ?? 0) + v)
  }
  for (const t of с.операции) {
    if (t.kind !== вид || !вОкне(t, о)) continue
    const годна = (id: string | undefined) => !!id && (!с.категории || с.категории.has(id)) && (!внутри || внутри.has(id))
    if (t.splits?.length) {
      for (const x of t.splits) if (годна(x.categoryId)) добавить(x.categoryId, w.metric === 'count' ? 1 : x.amount)
    } else if (годна(t.categoryId) || (!t.categoryId && !с.категории && !внутри)) {
      добавить(t.categoryId, w.metric === 'count' ? 1 : t.amount)
    }
  }
  return [...м.entries()]
    .map(([id, v]) => {
      const c = data.categories.find((x) => x.id === id)
      return { id, имя: c?.name ?? т('Без категории'), значение: v, цвет: c?.color ?? 'var(--faint)', размерность: (w.metric === 'count' ? 'n' : 'm') as 'm' | 'n' }
    })
    .sort((a, b) => b.значение - a.значение)
}

/** Сколько нужно для «прогресса»: цель у показателя-цели, иначе — вписанное, у процентов — 100. */
export function цельПрогресса(w: СвойВиджет, data: VaultData, итог: ИтогВиджета): number | null {
  if (w.metric === 'goal' && w.ref && !естьФормула(w)) {
    const g = data.goals.find((x) => x.id === w.ref)
    return g?.targetAmount || null
  }
  if (w.target) return итог.формат === 'money' ? w.target : w.target / 100
  return итог.формат === 'percent' ? 100 : null
}

/** Пустой виджет для конструктора. */
export function новыйВиджет(id: string, now: string = new Date().toISOString()): СвойВиджет {
  return { id, name: '', metric: 'expense', period: 'board', view: 'auto', updatedAt: now }
}
