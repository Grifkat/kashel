// Оснастка только для тестов: программа сама демо-данные больше не создаёт —
// новое хранилище открывается пустым. Здесь генератор нужен, чтобы прогонять
// прогноз, советы и интерфейс на реалистичной истории, а не на пустоте.
import type {
  Account,
  Category,
  Goal,
  Recurring,
  Scenario,
  Transaction,
  VaultData,
} from '../src/lib/types'
import { addDays, addMonths, iso, monthRange, parseISO, startOfMonth, today } from '../src/lib/date'
import { toMinor, uid } from '../src/lib/format'
import type { CanvasDoc } from '../src/lib/types'
import { DEFAULT_SETTINGS } from '../src/state/defaults'

/** Детерминированный ГПСЧ: демо-данные должны быть одинаковыми при каждом запуске. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}


interface CatSpec {
  name: string
  icon: string
  color: string
  bucket: 'needs' | 'wants' | 'savings'
  base: number // рублей в месяц
  min: number // операций в месяц
  max: number
  plan?: number
}

const EXPENSE_SPECS: CatSpec[] = [
  { name: 'Дом', icon: 'house', color: '#e8833a', bucket: 'needs', base: 25000, min: 2, max: 4, plan: 26000 },
  { name: 'Рабочие расходы', icon: 'briefcase', color: '#e8c53a', bucket: 'needs', base: 22000, min: 4, max: 8, plan: 24000 },
  { name: 'Продукты', icon: 'shopping-basket', color: '#4cc46a', bucket: 'needs', base: 16000, min: 12, max: 20, plan: 18000 },
  { name: 'Кафе', icon: 'coffee', color: '#8b5cf6', bucket: 'wants', base: 7000, min: 8, max: 15, plan: 6000 },
  { name: 'Подарки', icon: 'gift', color: '#e05a91', bucket: 'wants', base: 6000, min: 1, max: 3 },
  { name: 'Семья', icon: 'users', color: '#e8b93a', bucket: 'needs', base: 5000, min: 1, max: 3 },
  { name: 'Одежда', icon: 'footprints', color: '#3ec98a', bucket: 'wants', base: 4500, min: 0, max: 2 },
  { name: 'Готовая еда', icon: 'sandwich', color: '#c95cc9', bucket: 'wants', base: 4000, min: 3, max: 7 },
  { name: 'Здоровье', icon: 'heart-pulse', color: '#e05252', bucket: 'needs', base: 3500, min: 0, max: 2 },
  { name: 'Досуг', icon: 'film', color: '#3ec9c0', bucket: 'wants', base: 3000, min: 1, max: 4 },
  { name: 'Транспорт', icon: 'bus', color: '#4aa3e8', bucket: 'needs', base: 2800, min: 5, max: 10 },
  { name: 'Такси', icon: 'car-taxi-front', color: '#8fce4a', bucket: 'wants', base: 2500, min: 3, max: 8 },
  { name: 'Спорт', icon: 'dumbbell', color: '#5566e8', bucket: 'wants', base: 2400, min: 0, max: 1 },
  { name: 'Образование', icon: 'graduation-cap', color: '#4aa3e8', bucket: 'savings', base: 3500, min: 0, max: 1 },
  { name: 'Благотворительность', icon: 'hand-heart', color: '#3ec98a', bucket: 'savings', base: 1000, min: 0, max: 1 },
]

const FIXED_SPECS: CatSpec[] = [
  { name: 'Интернет', icon: 'wifi', color: '#3ec9c0', bucket: 'needs', base: 1750, min: 1, max: 1, plan: 1750 },
  { name: 'Подписки', icon: 'cloud', color: '#5566e8', bucket: 'wants', base: 1897, min: 3, max: 3, plan: 1500 },
  { name: 'Бухгалтер', icon: 'receipt-text', color: '#7c8794', bucket: 'needs', base: 3000, min: 1, max: 1, plan: 3000 },
  { name: 'Сайт', icon: 'laptop', color: '#8b5cf6', bucket: 'needs', base: 1200, min: 1, max: 1, plan: 1200 },
  { name: 'Налоги', icon: 'landmark', color: '#e05252', bucket: 'needs', base: 0, min: 0, max: 0 },
  { name: 'Платёж по кредиту', icon: 'credit-card', color: '#e05252', bucket: 'needs', base: 0, min: 0, max: 0 },
]

const INCOME_SPECS = [
  { name: 'Навар', icon: 'hand-coins', color: '#c95cc9' },
  { name: 'Зарплата', icon: 'banknote', color: '#4aa3e8' },
  { name: 'Возвраты', icon: 'recycle', color: '#3ec98a' },
]

const MERCHANTS: Record<string, string[]> = {
  Продукты: ['Пятёрочка', 'Магнит', 'Лента', 'ВкусВилл', 'Ашан', 'рынок'],
  Кафе: ['Кофейня на углу', 'Surf Coffee', 'Столовая', 'бизнес-ланч', 'Шоколадница'],
  'Готовая еда': ['Яндекс.Еда', 'Delivery', 'Додо Пицца', 'суши'],
  Такси: ['Яндекс.Такси', 'Ситимобил', 'inDrive'],
  Транспорт: ['метро', 'проездной', 'автобус', 'электричка'],
  Дом: ['коммуналка', 'аренда', 'ремонт', 'мебель', 'бытовая химия'],
  'Рабочие расходы': ['подрядчик', 'реклама', 'материалы', 'сервис', 'комиссия'],
  Подарки: ['день рождения', 'подарок маме', 'цветы', 'сувенир'],
  Одежда: ['Ozon', 'Wildberries', 'Zara', 'кроссовки'],
  Здоровье: ['аптека', 'приём врача', 'анализы', 'стоматолог'],
  Досуг: ['кино', 'концерт', 'выставка', 'боулинг'],
  Семья: ['детский сад', 'кружок', 'игрушки'],
  Спорт: ['абонемент', 'бассейн'],
  Образование: ['курс', 'книги', 'вебинар'],
}

export function buildSeed(): VaultData {
  const rand = rng(20260820)
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
  const between = (a: number, b: number) => a + rand() * (b - a)
  const intBetween = (a: number, b: number) => Math.floor(a + rand() * (b - a + 1))

  // ------------------------------------------------------------- счета
  const main: Account = {
    id: 'acc_main', name: 'Основной', type: 'card', icon: 'credit-card', color: '#4cc46a',
    initialBalance: toMinor(48_000),
  }
  const cash: Account = {
    id: 'acc_cash', name: 'Наличные', type: 'cash', icon: 'banknote', color: '#8fce4a',
    initialBalance: toMinor(6_500),
  }
  const fund: Account = {
    id: 'acc_fund', name: 'Челяба фонд', type: 'savings', icon: 'vault', color: '#e05252',
    initialBalance: toMinor(4_100),
  }
  const credit: Account = {
    id: 'acc_credit', name: 'Рассрочка на технику', type: 'credit', icon: 'credit-card', color: '#e8833a',
    initialBalance: 0,
    credit: {
      principal: toMinor(180_000), ratePct: 19.9, termMonths: 24,
      startDate: addMonths(startOfMonth(today()), -8), paymentDay: 20,
      monthlyPayment: toMinor(9_150),
    },
  }
  const debt: Account = {
    id: 'acc_debt', name: 'Долг Диме', type: 'debt', icon: 'handshake', color: '#e8c53a',
    initialBalance: toMinor(-25_000),
    debt: { counterparty: 'Дима', direction: 'i_owe', dueDate: addMonths(today(), 4) },
  }
  const accounts = [main, cash, fund, credit, debt]

  // --------------------------------------------------------- категории
  const categories: Category[] = []
  const catId = new Map<string, string>()
  for (const s of [...EXPENSE_SPECS, ...FIXED_SPECS]) {
    const id = 'cat_' + categories.length
    catId.set(s.name, id)
    categories.push({
      id, name: s.name, kind: 'expense', icon: s.icon, color: s.color,
      bucket: s.bucket, plan: s.plan ? toMinor(s.plan) : undefined,
    })
  }
  for (const s of INCOME_SPECS) {
    const id = 'cat_' + categories.length
    catId.set(s.name, id)
    categories.push({ id, name: s.name, kind: 'income', icon: s.icon, color: s.color })
  }
  const C = (name: string) => catId.get(name)!

  // -------------------------------------------------------- операции
  const tx: Transaction[] = []
  const push = (t: Omit<Transaction, 'id' | 'createdAt' | 'tags'> & { tags?: string[] }) => {
    tx.push({
      id: uid('t'), createdAt: new Date().toISOString(), tags: t.tags || [],
      ...t,
    } as Transaction)
  }

  const start = addMonths(startOfMonth(today()), -14)
  const monthKeys = monthRange(start, today())
  const todayISO = today()

  const dayIn = (mk: string, from = 1, to = 28) => {
    const d = `${mk}-${String(intBetween(from, to)).padStart(2, '0')}`
    return d > todayISO ? todayISO : d
  }

  monthKeys.forEach((mk, mi) => {
    const isCurrent = mi === monthKeys.length - 1
    const progress = isCurrent ? parseISO(todayISO).getDate() / 30 : 1
    const growth = 1 + mi * 0.012 // лёгкая инфляция расходов от месяца к месяцу

    // --- доходы
    push({
      kind: 'income', date: dayIn(mk, 10, 10), amount: toMinor(10_000),
      accountId: main.id, categoryId: C('Зарплата'), note: 'Зарплата',
      recurringId: 'rec_salary',
    })
    const gigs = intBetween(2, 5)
    for (let i = 0; i < gigs * progress; i++) {
      const season = mk.endsWith('-12') || mk.endsWith('-11') ? 1.35 : 1
      push({
        kind: 'income', date: dayIn(mk, 3, 27),
        amount: toMinor(Math.round(between(18_000, 46_000) * season * growth / 100) * 100),
        accountId: main.id, categoryId: C('Навар'), note: pick(['проект', 'заказ', 'подряд', 'консультация']),
        tags: ['работа'],
      })
    }
    if (rand() < 0.25) {
      push({
        kind: 'income', date: dayIn(mk), amount: toMinor(Math.round(between(500, 4_000))),
        accountId: main.id, categoryId: C('Возвраты'), note: 'возврат',
      })
    }

    // --- переменные расходы
    for (const s of EXPENSE_SPECS) {
      const n = Math.max(0, Math.round(intBetween(s.min, s.max) * progress))
      if (!n) continue
      // Разброс месячной суммы: часть месяцев заметно дороже.
      const monthFactor = between(0.75, 1.3) * (rand() < 0.12 ? 1.6 : 1) * growth
      const total = s.base * monthFactor * progress
      let left = total
      for (let i = 0; i < n; i++) {
        const share = i === n - 1 ? left : (total / n) * between(0.5, 1.5)
        const amount = Math.max(50, Math.min(left, share))
        left -= amount
        if (amount < 20) continue
        const account = s.name === 'Продукты' && rand() < 0.25 ? cash : main
        push({
          kind: 'expense', date: dayIn(mk), amount: toMinor(Math.round(amount / 10) * 10),
          accountId: account.id, categoryId: C(s.name),
          note: MERCHANTS[s.name] ? pick(MERCHANTS[s.name]) : undefined,
          tags: rand() < 0.1 ? ['разово'] : [],
        })
        if (left <= 0) break
      }
    }

    // --- фиксированные платежи
    push({ kind: 'expense', date: dayIn(mk, 5, 5), amount: toMinor(1_750), accountId: main.id, categoryId: C('Интернет'), note: 'Интернет', recurringId: 'rec_net' })
    push({ kind: 'expense', date: dayIn(mk, 3, 3), amount: toMinor(599), accountId: main.id, categoryId: C('Подписки'), note: 'Музыка', recurringId: 'rec_sub1' })
    push({ kind: 'expense', date: dayIn(mk, 12, 12), amount: toMinor(699), accountId: main.id, categoryId: C('Подписки'), note: 'Облако 2 ТБ', recurringId: 'rec_sub2' })
    // Забытая подписка: включилась 9 месяцев назад и с тех пор не отменялась.
    if (mi >= monthKeys.length - 9) {
      push({ kind: 'expense', date: dayIn(mk, 17, 17), amount: toMinor(599), accountId: main.id, categoryId: C('Подписки'), note: 'Фитнес-приложение', recurringId: 'rec_sub3' })
    }
    push({ kind: 'expense', date: dayIn(mk, 7, 7), amount: toMinor(3_000), accountId: main.id, categoryId: C('Бухгалтер'), note: 'Бухгалтерия', recurringId: 'rec_acc' })
    push({ kind: 'expense', date: dayIn(mk, 9, 9), amount: toMinor(1_200), accountId: main.id, categoryId: C('Сайт'), note: 'Хостинг и домен', recurringId: 'rec_site' })

    // Налоги — раз в квартал.
    const m = Number(mk.slice(5, 7))
    if ([1, 4, 7, 10].includes(m)) {
      push({ kind: 'expense', date: dayIn(mk, 22, 25), amount: toMinor(Math.round(between(11_000, 16_000) / 100) * 100), accountId: main.id, categoryId: C('Налоги'), note: 'Налог УСН' })
    }

    // Кредит.
    if (mi >= monthKeys.length - 8) {
      push({ kind: 'expense', date: dayIn(mk, 20, 20), amount: toMinor(9_150), accountId: main.id, categoryId: C('Платёж по кредиту'), note: 'Платёж по рассрочке', debtId: credit.id, recurringId: 'rec_credit' })
    }

    // Пополнение копилки — но не каждый месяц, чтобы движку было что заметить.
    if (rand() < 0.65) {
      push({
        kind: 'transfer', date: dayIn(mk, 11, 15),
        amount: toMinor(Math.round(between(5_000, 14_000) / 1000) * 1000),
        accountId: main.id, toAccountId: fund.id, note: 'В Челяба фонд', goalId: 'goal_fund',
      })
    }
    // Снятие наличных.
    push({ kind: 'transfer', date: dayIn(mk, 2, 6), amount: toMinor(10_000), accountId: main.id, toAccountId: cash.id, note: 'Снятие наличных' })
  })

  // Разбитый чек — показать работу сплита.
  const splitTotal = toMinor(5_480)
  push({
    kind: 'expense', date: addDays(todayISO, -3), amount: splitTotal, accountId: main.id,
    categoryId: C('Продукты'), note: 'Большая закупка',
    splits: [
      { categoryId: C('Продукты'), amount: toMinor(3_900) },
      { categoryId: C('Дом'), amount: toMinor(1_180), note: 'бытовая химия' },
      { categoryId: C('Здоровье'), amount: toMinor(400), note: 'аптечка' },
    ],
    tags: ['закупка'],
  })

  // ------------------------------------------------------ регулярные
  const recurring: Recurring[] = [
    { id: 'rec_salary', title: 'Зарплата', kind: 'income', amount: toMinor(10_000), accountId: main.id, categoryId: C('Зарплата'), freq: 'monthly', interval: 1, dayOfMonth: 10, startDate: start, autoPost: true, tags: [], active: true },
    { id: 'rec_net', title: 'Интернет', kind: 'expense', amount: toMinor(1_750), accountId: main.id, categoryId: C('Интернет'), freq: 'monthly', interval: 1, dayOfMonth: 5, startDate: start, autoPost: true, tags: [], active: true },
    { id: 'rec_sub1', title: 'Подписка: музыка', kind: 'expense', amount: toMinor(599), accountId: main.id, categoryId: C('Подписки'), freq: 'monthly', interval: 1, dayOfMonth: 3, startDate: start, autoPost: true, tags: ['подписка'], active: true },
    { id: 'rec_sub2', title: 'Подписка: облако 2 ТБ', kind: 'expense', amount: toMinor(699), accountId: main.id, categoryId: C('Подписки'), freq: 'monthly', interval: 1, dayOfMonth: 12, startDate: start, autoPost: true, tags: ['подписка'], active: true },
    { id: 'rec_sub3', title: 'Подписка: фитнес-приложение', kind: 'expense', amount: toMinor(599), accountId: main.id, categoryId: C('Подписки'), freq: 'monthly', interval: 1, dayOfMonth: 17, startDate: addMonths(start, 5), autoPost: true, tags: ['подписка'], active: true },
    { id: 'rec_acc', title: 'Бухгалтер', kind: 'expense', amount: toMinor(3_000), accountId: main.id, categoryId: C('Бухгалтер'), freq: 'monthly', interval: 1, dayOfMonth: 7, startDate: start, autoPost: true, tags: [], active: true },
    { id: 'rec_site', title: 'Хостинг и домен', kind: 'expense', amount: toMinor(1_200), accountId: main.id, categoryId: C('Сайт'), freq: 'monthly', interval: 1, dayOfMonth: 9, startDate: start, autoPost: true, tags: [], active: true },
    { id: 'rec_credit', title: 'Платёж по рассрочке', kind: 'expense', amount: toMinor(9_150), accountId: main.id, categoryId: C('Платёж по кредиту'), freq: 'monthly', interval: 1, dayOfMonth: 20, startDate: addMonths(start, 6), autoPost: true, tags: ['кредит'], active: true },
  ]

  // ----------------------------------------------------------- цели
  const goals: Goal[] = [
    { id: 'goal_fund', name: 'Челяба фонд', icon: 'building-2', color: '#e05252', targetAmount: toMinor(300_000), targetDate: addMonths(todayISO, 14), accountId: fund.id, saved: 0, priority: 1, note: 'Переезд и обустройство' },
    { id: 'goal_safety', name: 'Подушка безопасности', icon: 'shield-check', color: '#4aa3e8', targetAmount: toMinor(600_000), targetDate: addMonths(todayISO, 24), saved: toMinor(35_000), priority: 2, note: '6 месяцев расходов' },
    { id: 'goal_mac', name: 'Новый ноутбук', icon: 'laptop', color: '#8b5cf6', targetAmount: toMinor(180_000), targetDate: addMonths(todayISO, 8), saved: toMinor(12_000), priority: 3 },
  ]

  const scenarios: Scenario[] = [
    { id: 'sc_base', name: 'Базовый', incomeFactor: 1, adjusts: [], events: [], extraSavingsMonthly: 0, note: 'Всё идёт как идёт' },
    {
      id: 'sc_save', name: 'Режим экономии', incomeFactor: 1,
      adjusts: [
        { categoryId: C('Кафе'), factor: 0.6 },
        { categoryId: C('Такси'), factor: 0.5 },
        { categoryId: C('Готовая еда'), factor: 0.5 },
        { categoryId: C('Подписки'), factor: 0.5 },
      ],
      events: [], extraSavingsMonthly: toMinor(10_000),
      note: 'Срезаем импульсные траты и докладываем в копилку',
    },
    {
      id: 'sc_growth', name: 'Рост дохода +20%', incomeFactor: 1.2, adjusts: [],
      events: [{ id: uid('e'), date: addMonths(todayISO, 3), title: 'Оборудование для нового направления', amount: -toMinor(60_000) }],
      extraSavingsMonthly: 0, note: 'Новое направление: вложение сейчас, отдача дальше',
    },
  ]

  return {
    version: 1,
    accounts,
    categories,
    transactions: tx,
    recurring,
    reminders: [],
    tasks: [],
    taskLists: [],
    honors: { branch: 'civil' as const, awarded: {} },
    goals,
    scenarios,
    importRules: [
      { id: uid('r'), match: 'пятёрочка', categoryId: C('Продукты') },
      { id: uid('r'), match: 'магнит', categoryId: C('Продукты') },
      { id: uid('r'), match: 'яндекс.такси', categoryId: C('Такси') },
      { id: uid('r'), match: 'кофе', categoryId: C('Кафе') },
      { id: uid('r'), match: 'аптека', categoryId: C('Здоровье') },
    ],
    settings: DEFAULT_SETTINGS,
  }
}

/** Стартовые заметки: показывают вики-ссылки, теги и живые запросы. */
export function seedNotes(): Record<string, string> {
  return {
    'Финансовый план': `---
теги: план, финансы
---

# Финансовый план

Три опоры: [[Подушка безопасности]], [[Челяба фонд]] и рост дохода — [[Идеи по доходу]].

## Правила
- Норма сбережений — не ниже 20% от дохода.
- Импульсные траты (кафе, такси, доставка) — не больше 12% расходов.
- Любой новый регулярный платёж записываю в раздел регулярных, иначе он теряется.

## Куда уходят деньги за 6 месяцев

\`\`\`kashel
type: chart
chart: donut
kind: expense
period: 6m
group: category
limit: 8
\`\`\`

## Динамика дохода и расхода

\`\`\`kashel
type: chart
chart: line
period: 12m
group: month
\`\`\`

#план #обзор
`,
    'Подушка безопасности': `# Подушка безопасности

Цель — 6 месяцев расходов на отдельном счёте. Пока копится медленнее плана,
потому что деньги уходят в [[Челяба фонд]].

Пороговое значение считаю от среднего расхода за последние 6 месяцев:

\`\`\`kashel
type: sum
kind: expense
period: 6m
\`\`\`

#цель #защита
`,
    'Челяба фонд': `# Челяба фонд

Отдельный счёт под переезд. Пополняю переводом с основного счёта.

\`\`\`kashel
type: table
kind: transfer
period: 12m
limit: 12
\`\`\`

Связано: [[Финансовый план]]

#цель
`,
    'Идеи по доходу': `# Идеи по доходу

Доход держится на «Наваре» — это один канал, и это риск. Смотри вкладку
«Советы», раздел про концентрацию дохода.

- [ ] Поднять чек постоянным заказчикам на 15%
- [ ] Второй канал: консультации по часу
- [ ] Убрать самые дешёвые заказы — они съедают время

\`\`\`kashel
type: chart
chart: bar
kind: income
period: 12m
group: month
\`\`\`

#доход #идеи
`,
  }
}

/** Стартовый канвас: доходы → счета → категории, цели и живой запрос. */
export function seedCanvas(data: VaultData): CanvasDoc {
  const cat = (n: string) => data.categories.find((c) => c.name === n)!.id
  const nodes: CanvasDoc['nodes'] = [
    { id: 'n_inc1', type: 'category', ref: cat('Навар'), x: -640, y: -120, width: 240, height: 120, color: '#c95cc9' },
    { id: 'n_inc2', type: 'category', ref: cat('Зарплата'), x: -640, y: 40, width: 240, height: 120, color: '#4aa3e8' },
    { id: 'n_main', type: 'account', ref: 'acc_main', x: -260, y: -40, width: 260, height: 130, color: '#4cc46a' },
    { id: 'n_fund', type: 'account', ref: 'acc_fund', x: -260, y: 180, width: 260, height: 130, color: '#e05252' },
    { id: 'n_home', type: 'category', ref: cat('Дом'), x: 160, y: -260, width: 240, height: 120, color: '#e8833a' },
    { id: 'n_work', type: 'category', ref: cat('Рабочие расходы'), x: 160, y: -110, width: 240, height: 120, color: '#e8c53a' },
    { id: 'n_food', type: 'category', ref: cat('Продукты'), x: 160, y: 40, width: 240, height: 120, color: '#4cc46a' },
    { id: 'n_cafe', type: 'category', ref: cat('Кафе'), x: 160, y: 190, width: 240, height: 120, color: '#8b5cf6' },
    { id: 'n_goal', type: 'goal', ref: 'goal_fund', x: 160, y: 350, width: 240, height: 130, color: '#e05252' },
    {
      id: 'n_note', type: 'text', x: -660, y: 260, width: 320, height: 150, color: '#8b95a5',
      text: 'Схема живая: цифры на карточках берутся из операций за выбранный период. Двойной клик по пустому месту — новая заметка, перетаскивание от края карточки — стрелка.',
    },
    {
      id: 'n_q', type: 'query', x: 520, y: -40, width: 320, height: 260, color: '#3ec9c0',
      text: 'type: chart\nchart: bar\nkind: expense\nperiod: 6m\ngroup: month',
    },
  ]
  const edges: CanvasDoc['edges'] = [
    { id: 'e1', fromNode: 'n_inc1', fromSide: 'right', toNode: 'n_main', toSide: 'left', flow: true },
    { id: 'e2', fromNode: 'n_inc2', fromSide: 'right', toNode: 'n_main', toSide: 'left', flow: true },
    { id: 'e3', fromNode: 'n_main', fromSide: 'right', toNode: 'n_home', toSide: 'left', flow: true },
    { id: 'e4', fromNode: 'n_main', fromSide: 'right', toNode: 'n_work', toSide: 'left', flow: true },
    { id: 'e5', fromNode: 'n_main', fromSide: 'right', toNode: 'n_food', toSide: 'left', flow: true },
    { id: 'e6', fromNode: 'n_main', fromSide: 'right', toNode: 'n_cafe', toSide: 'left', flow: true },
    { id: 'e7', fromNode: 'n_main', fromSide: 'bottom', toNode: 'n_fund', toSide: 'top', flow: true, label: 'пополнение' },
    { id: 'e8', fromNode: 'n_fund', fromSide: 'right', toNode: 'n_goal', toSide: 'left', color: '#e05252' },
  ]
  return { nodes, edges }
}
