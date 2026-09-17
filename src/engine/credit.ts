import type { Account, Category, Money, Transaction, VaultData } from '../lib/types'
import { accountBalance } from './stats'
import { addDays, addMonths, daysInMonth, monthKey, parseISO, today } from '../lib/date'
import { т } from '../i18n'

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
    else if (t.kind === 'expense' && t.debtId === acc.id && (t.accountId !== acc.id || t.offBook)) repaid += t.debtPrincipal ?? t.amount
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

/* ------------------------------------------------------------------------
 * Платежи по кредиту.
 *
 * Правило, от чего зависит расход, одно и живёт здесь: окно операции и
 * перенос старых данных зовут одни и те же функции, чтобы платёж, внесённый
 * руками, и платёж, переведённый из старого перевода, не разошлись.
 *
 * - Проценты — всегда расход: это цена денег, их не вернуть.
 * - Тело у покупки или рассрочки — тоже расход: диван купили в долг, и
 *   покупку нигде больше не записали, так что траты видны по мере оплаты.
 *   При ставке 0% весь платёж — тело, то есть весь — расход.
 * - Тело у кредита деньгами — перевод: деньги пришли на счёт и уже ушли
 *   оттуда расходами, второй раз считать их нельзя.
 * ---------------------------------------------------------------------- */

/** Статья для тела платежей по покупкам в долг. */
export const СТАТЬЯ_ПЛАТЕЖЕЙ: Category = {
  id: 'cat_credit_pay',
  name: т('Платежи по кредитам'),
  kind: 'expense',
  icon: 'landmark',
  color: '#e05252',
  bucket: 'needs',
}

/** Статья для процентов — отдельно, чтобы переплату было видно в отчётах. */
export const СТАТЬЯ_ПРОЦЕНТОВ: Category = {
  id: 'cat_credit_interest',
  name: т('Проценты по кредитам'),
  kind: 'expense',
  icon: 'percent',
  color: '#e8833a',
  bucket: 'needs',
}

export type Назначеніе = 'purchase' | 'cash'
export const назначеніе = (acc: Account): Назначеніе => acc.credit?.purpose ?? 'purchase'

/**
 * Делит платёж на проценты за месяц и тело. Проценты берутся с долга на момент
 * платежа по месячной ставке и не могут быть больше самого платежа.
 */
export function разложитьПлатёжъ(долгъ: Money, ratePct: number, сумма: Money): { проценты: Money; тѣло: Money } {
  const r = Math.max(0, ratePct) / 100 / 12
  const проценты = Math.min(сумма, Math.max(0, Math.round(Math.max(0, долгъ) * r)))
  return { проценты, тѣло: сумма - проценты }
}

type НоваяОперація = Omit<Transaction, 'id' | 'createdAt'>

export interface ПланъПлатежа {
  /** Статьи, которых ещё нет в хранилище, — завести до записи операций. */
  статьи: Category[]
  операціи: НоваяОперація[]
  долгъДо: Money
  проценты: Money
  тѣло: Money
  /** Сколько из платежа попадёт в расходы (со штрафом). */
  расходъ: Money
}

/**
 * Что записать, когда платишь по кредиту.
 *
 * `безъ` — id правимой операции: её не учитываем в долге до платежа, иначе
 * при правке платёж посчитал бы проценты с уже уменьшенного долга.
 */
export function планъПлатежа(p: {
  кредитъ: Account
  /** Свой счёт; null — платёж не с ваших счетов (offBook). */
  счётъ: string | null
  сумма: Money
  дата: string
  data: VaultData
  безъ?: string
  tags?: string[]
  note?: string
  /** Штраф или пени сверх платежа: расход, долг не гасит. */
  штраф?: Money
  /** Статья штрафов — передаётся снаружи, чтобы не ссылаться друг на друга. */
  статьяШтрафа?: Category
}): ПланъПлатежа | null {
  const { кредитъ, счётъ, сумма, дата, data } = p
  if (!(сумма > 0) || счётъ === '' || счётъ === кредитъ.id || кредитъ.type !== 'credit') return null
  // Не со счёта — операции висят на самом кредите и ничего не списывают.
  const откуда = счётъ ?? кредитъ.id
  const мимо = счётъ ? {} : { offBook: 'out' as const }
  const txs = p.безъ ? data.transactions.filter((t) => t.id !== p.безъ) : data.transactions
  const долгъДо = Math.max(0, -accountBalance(кредитъ, txs, дата))
  const { проценты, тѣло } = разложитьПлатёжъ(долгъДо, кредитъ.credit?.ratePct ?? 0, сумма)
  const есть = new Set(data.categories.map((c) => c.id))
  const статьи: Category[] = []
  const нужна = (c: Category) => {
    if (!есть.has(c.id) && !статьи.some((x) => x.id === c.id)) статьи.push(c)
  }
  const общее = { date: дата, tags: p.tags ?? [], note: p.note || т('Платёж по кредиту «{0}»', кредитъ.name) }
  const операціи: НоваяОперація[] = []

  if (назначеніе(кредитъ) === 'purchase') {
    const доли: { categoryId: string; amount: Money }[] = []
    if (тѣло > 0) доли.push({ categoryId: СТАТЬЯ_ПЛАТЕЖЕЙ.id, amount: тѣло })
    if (проценты > 0) доли.push({ categoryId: СТАТЬЯ_ПРОЦЕНТОВ.id, amount: проценты })
    if (тѣло > 0) нужна(СТАТЬЯ_ПЛАТЕЖЕЙ)
    if (проценты > 0) нужна(СТАТЬЯ_ПРОЦЕНТОВ)
    операціи.push({
      kind: 'expense', amount: сумма, accountId: откуда, debtId: кредитъ.id, debtPrincipal: тѣло,
      ...(доли.length > 1 ? { splits: доли } : { categoryId: доли[0].categoryId }),
      ...мимо,
      ...общее,
    })
    const штраф = штрафъ()
    return { статьи, операціи, долгъДо, проценты, тѣло, расходъ: сумма + штраф }
  }

  if (тѣло > 0) {
    операціи.push(счётъ
      ? { kind: 'transfer', amount: тѣло, accountId: счётъ, toAccountId: кредитъ.id, ...общее }
      : { kind: 'transfer', amount: тѣло, accountId: кредитъ.id, toAccountId: кредитъ.id, offBook: 'in', ...общее })
  }
  if (проценты > 0) {
    нужна(СТАТЬЯ_ПРОЦЕНТОВ)
    операціи.push({
      kind: 'expense', amount: проценты, accountId: откуда, categoryId: СТАТЬЯ_ПРОЦЕНТОВ.id,
      debtId: кредитъ.id, debtPrincipal: 0, ...мимо, ...общее,
    })
  }
  const штраф = штрафъ()
  return { статьи, операціи, долгъДо, проценты, тѣло, расходъ: проценты + штраф }

  function штрафъ(): Money {
    const с = p.штраф ?? 0
    if (!(с > 0) || !p.статьяШтрафа) return 0
    нужна(p.статьяШтрафа)
    операціи.push({
      kind: 'expense', amount: с, accountId: откуда, categoryId: p.статьяШтрафа.id,
      debtId: кредитъ.id, debtPrincipal: 0, ...мимо,
      date: дата, tags: p.tags ?? [], note: т('Штраф по кредиту «{0}»', кредитъ.name),
    })
    return с
  }
}

/* ------------------------------------------------------------------------
 * Остаток по графику.
 *
 * «Дата начала» — день, когда кредит взят. «День платежа» — число месяца.
 * Первый платёж — ближайшее такое число после даты начала. Из этого
 * программа сама знает, сколько платежей уже прошло, и предлагает, сколько
 * осталось выплатить, — человеку не надо считать это в уме.
 * ---------------------------------------------------------------------- */

/** Дата платежа в месяце: 31-е в феврале — последний день февраля. */
function числоВъМѣсяцѣ(месяцъ: string, день: number): string {
  const d = parseISO(месяцъ.slice(0, 7) + '-01')
  const n = Math.min(Math.max(1, день), daysInMonth(d.getFullYear(), d.getMonth()))
  return месяцъ.slice(0, 7) + '-' + String(n).padStart(2, '0')
}

/** Даты платежей после начала и не позже `до`. */
export function датыПлатежей(c: NonNullable<Account['credit']>, до: string): string[] {
  const итогъ: string[] = []
  if (!c.startDate || до <= c.startDate) return итогъ
  let месяцъ = c.startDate.slice(0, 7) + '-01'
  for (let i = 0; i < 600; i++) {
    const д = числоВъМѣсяцѣ(месяцъ, c.paymentDay)
    if (д > до) break
    if (д > c.startDate) итогъ.push(д)
    месяцъ = addMonths(месяцъ, 1)
  }
  return итогъ
}

/** Сколько останется долга после `n` платежей по графику. */
export function остатокПослѣ(c: NonNullable<Account['credit']>, n: number): Money {
  let остатокъ = c.principal
  for (let i = 0; i < n && остатокъ > 0; i++) {
    const { тѣло } = разложитьПлатёжъ(остатокъ, c.ratePct, c.monthlyPayment)
    if (тѣло <= 0) break
    остатокъ = Math.max(0, остатокъ - тѣло)
  }
  return остатокъ
}

/**
 * Подсказка для поля «Осталось выплатить».
 *
 * Считается на день перед первым платежом, уже внесённым в программу: они
 * вычтутся сами, и учесть их второй раз значило бы занизить долг. Если
 * платежей в программе нет — на сегодня.
 */
export function подсказкаОстатка(
  acc: Account,
  data: VaultData,
  now: string = today(),
): { остатокъ: Money; платежей: number; наДату: string } | null {
  const c = acc.credit
  if (!c || !(c.principal > 0) || !(c.monthlyPayment > 0) || !c.startDate) return null
  const свои = data.transactions
    .filter((t) => этоПлатёжПо(acc, t))
    .map((t) => t.date)
    .sort()
  const наДату = свои.length && свои[0] <= now ? addDays(свои[0], -1) : now
  const платежей = датыПлатежей(c, наДату).length
  return { остатокъ: остатокПослѣ(c, платежей), платежей, наДату }
}

/* ------------------------------------------------------------------------
 * Перенос старых кредитов на новый учёт — один раз на счёт.
 *
 * - Остаток: раньше карточка показывала «сумму кредита», а поле «Начальный
 *   остаток» ни на что не влияло, и в него вписывали, сколько осталось.
 *   Положительное число там и означает «осталось выплатить». Ноль — значит
 *   не вписали, и долгом становится сумма кредита: ровно то, что человек
 *   видел на карточке. Кредитной карты с лимитом это не касается — её долг
 *   и раньше складывался из трат.
 * - Назначение: если с кредита переводили деньги на свои счета, это кредит
 *   деньгами; иначе — покупка.
 * - Переводы на кредит-покупку становятся платежами — с расходом, как
 *   договорились. На кредит деньгами перевод и так означает тело.
 * ---------------------------------------------------------------------- */
export function перевестиКредиты(data: VaultData): {
  accounts: Account[]
  transactions: Transaction[]
  статьи: Category[]
  месяцы: string[]
  changed: number
} {
  let changed = 0
  let transactions = data.transactions
  const статьи: Category[] = []
  const месяцы = new Set<string>()
  const accounts = data.accounts.map((a) => {
    if (a.type !== 'credit' || !a.credit || a.credit.v === 2) return a
    changed++
    const c = a.credit
    const карта = (c.kind ?? (c.limit ? 'card' : 'loan')) === 'card'
    // Свои движения со счёта кредита: траты с него или деньги, выведенные с
    // него на другие счета. Если они есть, долг уже сидит в остатке — ставить
    // сверху ещё и сумму кредита значило бы удвоить его.
    const своиТраты = transactions.some((t) => t.kind === 'expense' && t.accountId === a.id && !t.offBook)
    const выведено = transactions.some((t) => t.kind === 'transfer' && t.accountId === a.id && t.toAccountId !== a.id)
    let initialBalance = a.initialBalance
    if (initialBalance > 0) initialBalance = -initialBalance
    else if (initialBalance === 0 && !карта && !своиТраты && !выведено) initialBalance = -(c.principal || 0)
    // Покупки уже записаны расходами с самого кредита (кредитная карта, трата
    // «Диван» со счёта кредита) — тогда платёж не расход, иначе траты
    // посчитались бы дважды. Так же, как у кредита деньгами.
    const деньгами = выведено || своиТраты || карта
    const новый: Account = {
      ...a,
      initialBalance,
      credit: { ...c, purpose: c.purpose ?? (деньгами ? 'cash' : 'purchase'), v: 2 },
    }
    if (новый.credit!.purpose === 'purchase') {
      const переводы = transactions
        .filter((t) => t.kind === 'transfer' && t.toAccountId === a.id && t.accountId !== a.id)
        .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
      for (const t of переводы) {
        const планъ = планъПлатежа({
          кредитъ: новый, счётъ: t.accountId, сумма: t.amount, дата: t.date,
          data: { ...data, accounts: [новый], categories: [...data.categories, ...статьи], transactions },
          безъ: t.id, tags: t.tags, note: t.note,
        })
        if (!планъ) continue
        for (const с of планъ.статьи) if (!статьи.some((x) => x.id === с.id)) статьи.push(с)
        const [платёжъ] = планъ.операціи
        const замѣна: Transaction = {
          ...платёжъ, id: t.id, createdAt: t.createdAt,
          ...(t.attachments ? { attachments: t.attachments } : {}),
          ...(t.recurringId ? { recurringId: t.recurringId } : {}),
          ...(t.goalId ? { goalId: t.goalId } : {}),
        }
        transactions = transactions.map((x) => (x.id === t.id ? замѣна : x))
        месяцы.add(monthKey(t.date))
      }
    }
    return новый
  })
  return { accounts, transactions, статьи, месяцы: [...месяцы], changed }
}

/** Ближайший день платежа — сегодняшний тоже считается. null — дат нет. */
export function следующийПлатёж(c: NonNullable<Account['credit']>, now: string = today()): string | null {
  return датыПлатежей(c, addMonths(now, 2)).find((д) => д >= now) ?? null
}

/**
 * Платёж, записанный в программе: расход с пометкой кредита или перевод на
 * него — в том числе «не со счёта» (offBook). Деньги, выведенные с кредита
 * наружу, платежом не считаются.
 */
export const этоПлатёжПо = (acc: Account, t: Transaction): boolean =>
  (t.kind === 'expense' && t.debtId === acc.id && (t.accountId !== acc.id || t.offBook === 'out') && t.debtPrincipal !== 0) ||
  (t.kind === 'transfer' && t.toAccountId === acc.id && (t.accountId !== acc.id || t.offBook === 'in'))

export interface СводкаКредита extends Кредит {
  /** Сколько брали. */
  principal: Money
  /** Сколько из суммы кредита уже погашено. */
  выплачено: Money
  /** Доля погашенного, 0..1 — для полосы, как у целей. */
  доля: number
  следующій: string | null
  /** Внесённые платежи, свежие впереди. */
  платежи: Transaction[]
}

/**
 * Всё про один кредит для его дашборда: сколько осталось, сколько погашено,
 * когда следующий платёж и какие платежи уже были. Цифра долга — та же, что
 * на карточке и в шапке: остаток счёта.
 */
export function сводкаКредита(acc: Account, data: VaultData, now: string = today()): СводкаКредита {
  const k = creditState(acc, data, now)
  const principal = acc.credit?.principal ?? 0
  const выплачено = Math.max(0, principal - k.debt)
  return {
    ...k,
    principal,
    выплачено,
    доля: principal > 0 ? Math.min(1, выплачено / principal) : 0,
    следующій: acc.credit ? следующийПлатёж(acc.credit, now) : null,
    платежи: data.transactions
      .filter((t) => этоПлатёжПо(acc, t))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
  }
}
