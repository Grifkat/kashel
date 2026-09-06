import type { Money, RankBranch, VaultData } from '../lib/types'
import { addMonths, diffDays, endOfMonth, monthKey, monthRange, today } from '../lib/date'
import { balances, creditRemaining, monthlySeries, yearSummary } from './stats'
import { streak } from './streak'
import { forecast } from './forecast'
import { личное } from './project'

/*
 * Чинъ, награды и характеристики.
 *
 * Весь слой — чистый счётъ по хранилищу: ничего не копится отдѣльно, всё
 * выводится изъ операцій, задачъ и цѣлей. Это не украшательство, а условіе
 * честности: загрузили архивъ или поправили старую запись — чинъ и награды
 * пересчитались, а не остались отъ прошлой жизни.
 *
 * Въ хранилищѣ лежитъ ровно то, что изъ данныхъ не выводится: выбранная
 * лѣстница чиновъ и день, когда награда сошлась впервые.
 */

// ------------------------------------------------------------------ чины

/**
 * Три лѣстницы на выборъ.
 *
 * Гражданская и военная — Табель о рангахъ 1722 года, четырнадцать классовъ
 * отъ младшаго къ старшему. Купеческая лѣстница составлена: купеческое
 * сословіе классовъ не имѣло, но званія гильдій и почётнаго гражданства
 * складываются въ такую же чреду, а къ заработку она ближе прочихъ.
 */
export const RANKS: Record<RankBranch, string[]> = {
  civil: [
    'Коллежскій регистраторъ',
    'Провинціальный секретарь',
    'Губернскій секретарь',
    'Корабельный секретарь',
    'Коллежскій секретарь',
    'Титулярный совѣтникъ',
    'Коллежскій асессоръ',
    'Надворный совѣтникъ',
    'Коллежскій совѣтникъ',
    'Статскій совѣтникъ',
    'Дѣйствительный статскій совѣтникъ',
    'Тайный совѣтникъ',
    'Дѣйствительный тайный совѣтникъ',
    'Канцлеръ',
  ],
  military: [
    'Прапорщикъ',
    'Подпоручикъ',
    'Поручикъ',
    'Штабсъ-капитанъ',
    'Капитанъ',
    'Маіоръ',
    'Подполковникъ',
    'Полковникъ',
    'Бригадиръ',
    'Генералъ-маіоръ',
    'Генералъ-лейтенантъ',
    'Генералъ-аншефъ',
    'Генералъ отъ инфантеріи',
    'Генералъ-фельдмаршалъ',
  ],
  merchant: [
    'Коробейникъ',
    'Лавочникъ',
    'Мѣщанинъ',
    'Торговый гость',
    'Купецъ третьей гильдіи',
    'Купецъ второй гильдіи',
    'Купецъ первой гильдіи',
    'Почётный гражданинъ',
    'Потомственный почётный гражданинъ',
    'Поставщикъ Двора',
    'Коммерціи совѣтникъ',
    'Мануфактуръ-совѣтникъ',
    'Первогильдейскій промышленникъ',
    'Негоціантъ первой руки',
  ],
}

export const BRANCH_NAMES: Record<RankBranch, string> = {
  civil: 'Гражданская',
  military: 'Военная',
  merchant: 'Купеческая',
}

/** Обращеніе по классу чина — какъ полагалось по Табели. */
export function address(level: number): string {
  const cls = 15 - level // уровень 1 — это XIV классъ, уровень 14 — I
  if (cls >= 9) return 'Ваше благородіе'
  if (cls >= 6) return 'Ваше высокоблагородіе'
  if (cls === 5) return 'Ваше высокородіе'
  if (cls >= 3) return 'Ваше превосходительство'
  return 'Ваше высокопревосходительство'
}

/** Классъ чина римскими — какъ въ бумагахъ. */
export const romanClass = (level: number): string =>
  ['XIV', 'XIII', 'XII', 'XI', 'X', 'IX', 'VIII', 'VII', 'VI', 'V', 'IV', 'III', 'II', 'I'][level - 1] ?? 'XIV'

/**
 * Пороги опыта по уровнямъ.
 *
 * Ростъ нарочно крутой: четырнадцатый чинъ долженъ быть дѣломъ годовъ, а не
 * пары удачныхъ мѣсяцевъ. Иначе лѣстница кончается раньше, чѣмъ входитъ въ
 * привычку, и смотрѣть на неё становится незачѣмъ.
 */
export const XP_STEPS = [
  0, 1_000, 2_200, 3_800, 6_000, 9_000, 13_000, 18_500, 25_500, 34_500, 46_000, 61_000, 80_000, 105_000,
]

export function levelOf(xp: number): number {
  let lvl = 1
  for (let i = 0; i < XP_STEPS.length; i++) if (xp >= XP_STEPS[i]) lvl = i + 1
  return lvl
}

// ------------------------------------------------------------------ опытъ

export interface XpPart {
  key: string
  title: string
  xp: number
  hint: string
}

/**
 * Опытъ за доходъ считается съ затуханіемъ — по корню изъ тысячъ.
 *
 * Прямая пропорція здѣсь губительна: одинъ гонораръ въ двѣсти тысячъ далъ бы
 * въ двѣсти разъ больше тысячнаго, и всѣ прочіе мѣсяцы обратились бы въ шумъ.
 * Корень оставляетъ крупный доходъ крупнымъ — вдесятеро большая сумма даётъ
 * втрое больше опыта, — но не отмѣняетъ смысла мелкихъ поступленій.
 */
const xpForMonthIncome = (m: Money): number => Math.round(60 * Math.sqrt(Math.max(0, m) / 100_000))

export function xpBreakdown(data: VaultData, now: string = today()): XpPart[] {
  // Чинъ и знаки даются за свои деньги: проектные счета сюда не входятъ.
  // Иначе награда за мѣсячный доходъ сходилась бы отъ чужого аванса,
  // прошедшаго черезъ счётъ, а не отъ заработаннаго.
  data = личное(data)
  const txs = data.transactions
  const out: XpPart[] = []
  if (!txs.length) return out

  const first = txs.reduce((min, t) => (t.date < min ? t.date : min), txs[0].date)
  const months = monthlySeries(txs, first, now)

  // --- главное: заработанное
  const доход = months.reduce((s, m) => s + xpForMonthIncome(m.income), 0)
  out.push({
    key: 'income',
    title: 'За заработанное',
    xp: доход,
    hint: `${months.filter((m) => m.income > 0).length} мѣсяцевъ съ доходомъ`,
  })

  // --- рекорды: ростъ важнѣе разовой удачи
  const съДоходомъ = months.filter((m) => m.income > 0)
  let ростъ = 0
  for (let i = 1; i < months.length; i++) if (months[i].income > months[i - 1].income && months[i].income > 0) ростъ++
  const лучшій = съДоходомъ.length ? Math.max(...съДоходомъ.map((m) => m.income)) : 0
  out.push({
    key: 'records',
    title: 'За ростъ и рекорды',
    xp: ростъ * 150 + (лучшій > 0 ? 250 : 0),
    hint: ростъ ? `${ростъ} мѣсяцевъ лучше предыдущаго` : 'ростъ пока не начался',
  })

  // --- источники дохода: одинъ заказчикъ — это не доходъ, а зависимость
  const поИсточникамъ = new Map<string, number>()
  for (const t of txs) {
    if (t.kind !== 'income') continue
    поИсточникамъ.set(t.categoryId ?? '—', (поИсточникамъ.get(t.categoryId ?? '—') ?? 0) + t.amount)
  }
  const всего = [...поИсточникамъ.values()].reduce((s, v) => s + v, 0)
  const весомые = [...поИсточникамъ.values()].filter((v) => всего > 0 && v / всего >= 0.05).length
  out.push({
    key: 'sources',
    title: 'За независимость',
    xp: Math.max(0, весомые - 1) * 200,
    hint: `${весомые} ${весомые === 1 ? 'источникъ' : 'источниковъ'} дохода`,
  })

  // --- привычки: третья часть, не больше
  const дни = new Set(txs.map((t) => t.date)).size
  const задачи = (data.tasks ?? []).filter((t) => t.done).length
  const помидоры = (data.tasks ?? []).reduce((s, t) => s + (t.pomodoros ?? 0), 0)
  const цѣли = data.goals.filter((g) => g.done).length
  out.push({
    key: 'habit',
    title: 'За постоянство',
    xp: дни * 5 + задачи * 15 + помидоры * 5 + цѣли * 300,
    hint: `${дни} дней съ записями, ${задачи} закрытыхъ дѣлъ`,
  })

  // --- заданія и серія: наградa за привычку, а не за сумму
  const заданій = questsDone(data, now)
  const с = streak(data, now)
  out.push({
    key: 'quests',
    title: 'За заданія и серію',
    xp: заданій * QUEST_XP + с.best * 10,
    hint: `${заданій} закрытыхъ заданій, лучшая серія ${с.best} дн.`,
  })

  // --- порядокъ въ бумагахъ
  const безъКатегоріи = txs.filter((t) => t.kind !== 'transfer' && !t.categoryId && !t.splits?.length).length
  const чистыхъМѣсяцевъ = months.filter((m) => {
    const свои = txs.filter((t) => monthKey(t.date) === m.key && t.kind !== 'transfer')
    return свои.length > 0 && свои.every((t) => t.categoryId || t.splits?.length)
  }).length
  out.push({
    key: 'order',
    title: 'За порядокъ въ бумагахъ',
    xp: чистыхъМѣсяцевъ * 100,
    hint: безъКатегоріи ? `${безъКатегоріи} записей безъ категоріи` : 'всѣ записи разнесены',
  })

  return out
}

export const totalXp = (data: VaultData, now: string = today()): number =>
  xpBreakdown(data, now).reduce((s, p) => s + p.xp, 0)

// ------------------------------------------------------- характеристики

export interface Trait {
  key: string
  title: string
  value: number // 0..100
  hint: string
}

/**
 * Шесть шкалъ. Каждая — пересказъ того, что программа и такъ считаетъ,
 * приведённый къ сотнѣ. Ничего новаго тутъ не измѣряется: если шкала
 * разойдётся съ разделомъ, изъ котораго взята, вѣрить надо разделу.
 */
export function traits(data: VaultData, now: string = today()): Trait[] {
  // Чинъ и знаки даются за свои деньги: проектные счета сюда не входятъ.
  // Иначе награда за мѣсячный доходъ сходилась бы отъ чужого аванса,
  // прошедшаго черезъ счётъ, а не отъ заработаннаго.
  data = личное(data)
  const fc = forecast(data, null, 12, 120)
  const bal = balances(data.accounts, data.transactions)
  const годъДней = yearSummary(data.transactions, now.slice(0, 4), now)
  const txs = data.transactions

  const шкала = (v: number, max: number) => Math.max(0, Math.min(100, Math.round((v / max) * 100)))

  const мѣсяцевъЗапаса = fc.avgExpense > 0 ? bal.assets / fc.avgExpense : 0
  const безъКатегоріи = txs.filter((t) => t.kind !== 'transfer' && !t.categoryId && !t.splits?.length).length
  const разнесено = txs.length ? 1 - безъКатегоріи / txs.length : 1
  const съЛимитомъ = data.categories.filter((c) => !c.archived && c.plan)
  const въЛимитѣ = съЛимитомъ.filter((c) => {
    const потрачено = txs
      .filter((t) => t.categoryId === c.id && monthKey(t.date) === monthKey(now))
      .reduce((s, t) => s + t.amount, 0)
    return потрачено <= (c.plan ?? 0)
  }).length
  const дней = Math.max(1, годъДней.daysLived)
  const сЗаписями = new Set(txs.filter((t) => t.date >= addMonths(now, -3)).map((t) => t.date)).size

  return [
    {
      key: 'income',
      title: 'Доходъ',
      value: шкала(fc.planIncome, 30_000_000),
      hint: 'средній мѣсяцъ впередъ по прогнозу',
    },
    {
      key: 'thrift',
      title: 'Бережливость',
      value: шкала(Math.max(0, fc.planSavingsRate), 60),
      hint: 'норма сбереженій',
    },
    {
      key: 'reserve',
      title: 'Запасъ прочности',
      value: шкала(мѣсяцевъЗапаса, data.settings.profile.emergencyMonths || 6),
      hint: `остатка хватитъ на ${мѣсяцевъЗапаса.toFixed(1)} мѣс.`,
    },
    {
      key: 'discipline',
      title: 'Дисциплина',
      value: шкала(сЗаписями, дней * 0.5),
      hint: `${сЗаписями} дней съ записями за три мѣсяца`,
    },
    {
      key: 'order',
      title: 'Порядокъ въ бумагахъ',
      value: Math.round(разнесено * 100),
      hint: безъКатегоріи ? `${безъКатегоріи} записей безъ категоріи` : 'всё разнесено по статьямъ',
    },
    {
      key: 'foresight',
      title: 'Прозорливость',
      value: съЛимитомъ.length ? Math.round((въЛимитѣ / съЛимитомъ.length) * 100) : 0,
      hint: съЛимитомъ.length ? `${въЛимитѣ} изъ ${съЛимитомъ.length} статей въ предѣлѣ` : 'лимиты не назначены',
    },
  ]
}

// ---------------------------------------------------------------- награды

export interface Award {
  id: string
  /** Орденъ съ степенями или разовое отличіе. */
  order?: string
  degree?: number
  title: string
  about: string
  /** Условіе выполнено сейчасъ. */
  earned: boolean
  /** Насколько близко, 0..1 — для непожалованныхъ. */
  progress: number
  /** Что осталось сдѣлать. */
  left: string
  /**
   * Тайное отличіе: до полученія въ грамотѣ стоитъ силуэтъ, а названіе и
   * условіе скрыты. Смыслъ — награда, о которой нельзя догадаться заранѣе;
   * найденная случайно, она стоитъ дороже вымѣренной.
   */
  secret?: boolean
}

const рубли = (m: Money) => Math.round(m / 100).toLocaleString('ru-RU')

/**
 * Ордена Россійской имперіи имѣли степени — отъ младшей четвёртой къ старшей
 * первой. Это готовая лѣстница наградъ, гдѣ «золото» не выдумка, а первая
 * степень; ею и пользуемся вмѣсто бронзы съ серебромъ.
 */
function ladder(
  id: string,
  order: string,
  about: string,
  value: number,
  steps: { at: number; degree: number; title: string; unit?: (n: number) => string }[],
): Award[] {
  return steps.map((s) => ({
    id: `${id}${s.degree}`,
    order,
    degree: s.degree,
    title: s.title,
    about,
    earned: value >= s.at,
    progress: Math.max(0, Math.min(1, s.at > 0 ? value / s.at : 0)),
    left: value >= s.at ? '' : `осталось ${(s.unit ?? рубли)(s.at - value)}`,
  }))
}

export function awards(data: VaultData, now: string = today()): Award[] {
  // Чинъ и знаки даются за свои деньги: проектные счета сюда не входятъ.
  // Иначе награда за мѣсячный доходъ сходилась бы отъ чужого аванса,
  // прошедшаго черезъ счётъ, а не отъ заработаннаго.
  data = личное(data)
  const txs = data.transactions
  const fc = forecast(data, null, 12, 120)
  const bal = balances(data.accounts, data.transactions)
  const годъ = yearSummary(txs, now.slice(0, 4), now)
  const первый = txs.length ? txs.reduce((min, t) => (t.date < min ? t.date : min), txs[0].date) : now
  const months = txs.length ? monthlySeries(txs, первый, now) : []

  const всегоДохода = txs.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const лучшійМѣсяцъ = months.length ? Math.max(0, ...months.map((m) => m.income)) : 0
  const крупнѣйшій = txs.filter((t) => t.kind === 'income').reduce((mx, t) => Math.max(mx, t.amount), 0)
  const въПлюсѣ = months.filter((m) => m.net > 0).length
  const мѣсяцевъЗапаса = fc.avgExpense > 0 ? bal.assets / fc.avgExpense : 0
  const источники = new Set(txs.filter((t) => t.kind === 'income').map((t) => t.categoryId ?? '—')).size
  const дней = new Set(txs.map((t) => t.date)).size
  const дѣлъ = (data.tasks ?? []).filter((t) => t.done).length
  const цѣлей = data.goals.filter((g) => g.done).length
  const долговъ = data.accounts.filter((a) => a.type === 'debt' || a.type === 'credit').length

  // --- величины для новыхъ орденовъ
  // Норма сбереженій и ростъ считаются по двѣнадцати мѣсяцамъ, а не по одному:
  // одинъ удачный мѣсяцъ орденомъ не награждается, на то есть Георгій.
  const хвостъ = (n: number, skip = 0) => months.slice(Math.max(0, months.length - n - skip), months.length - skip)
  const годовые = хвостъ(12)
  const прошлые = хвостъ(12, 12)
  const доходъГода = годовые.reduce((s, m) => s + m.income, 0)
  const расходъГода = годовые.reduce((s, m) => s + m.expense, 0)
  const доходъПрошлаго = прошлые.reduce((s, m) => s + m.income, 0)
  const норма = доходъГода > 0 ? ((доходъГода - расходъГода) / доходъГода) * 100 : 0
  // Ростъ считаемъ только когда есть съ чѣмъ сравнивать: изъ пустоты въ
  // тысячу — это не ростъ на бесконечность, а первый годъ учёта.
  const ростъГода = доходъПрошлаго > 0
    ? ((доходъГода - доходъПрошлаго) / доходъПрошлаго) * 100
    : 0

  // --- доходъ съ капитала: только по статьямъ, отмѣченнымъ вручную
  const капитальныя = new Set(data.categories.filter((c) => c.capital).map((c) => c.id))
  const съКапитала = годовые.length
    ? txs
        .filter((t) => t.kind === 'income' && годовые.some((m) => m.key === monthKey(t.date)) && капитальныя.has(t.categoryId ?? ''))
        .reduce((s, t) => s + t.amount, 0)
    : 0
  const доляКапитала = доходъГода > 0 ? (съКапитала / доходъГода) * 100 : 0

  /*
   * Ростъ отъ начала. Считаемъ по первымъ тремъ мѣсяцамъ учёта, а не по
   * первому: одинъ пустой мѣсяцъ на старте раздулъ бы отношеніе до небесъ.
   * Пока мѣсяцевъ меньше шести, ростъ не считаемъ вовсе — сравнивать не съ чѣмъ.
   */
  const начало = months.slice(0, 3).filter((m) => m.income > 0)
  const стартъ = начало.length ? начало.reduce((s, m) => s + m.income, 0) / начало.length : 0
  const ростъОтъНачала = months.length >= 6 && стартъ > 0 ? лучшійМѣсяцъ / стартъ : 0

  // --- накопленія: сколько лежитъ на счетахъ-копилкахъ
  const копилки = data.accounts.filter((a) => !a.archived && a.type === 'savings')
  const накоплено = копилки.reduce((s, a) => s + (bal.byAccount.get(a.id) ?? 0), 0)
  /*
   * «Отложено» — это дѣйствіе, а не число на счётѣ. Начальный остатокъ,
   * вписанный при заведеніи копилки, откладываніемъ не является: иначе
   * награда за первый отложенный рубль доставалась бы за одно только
   * заполненіе формы.
   */
  const отложено = txs.some(
    (t) =>
      (t.kind === 'transfer' && копилки.some((a) => a.id === t.toAccountId)) ||
      (t.kind === 'income' && копилки.some((a) => a.id === t.accountId)),
  )
  const подушка = data.settings.profile.emergencyMonths || 6
  const запасъМѣсяцевъ = мѣсяцевъЗапаса
  // Росли ли накопленія изъ мѣсяца въ мѣсяцъ. Полгода подрядъ — не случайность.
  const ростъНакопленій = (() => {
    if (!копилки.length) return 0
    let подрядъ = 0
    let было: number | null = null
    for (const м of months.slice(-12)) {
      const кДатѣ = balances(data.accounts, txs, endOfMonth(м.key + '-01'))
      const стало = копилки.reduce((s, a) => s + (кДатѣ.byAccount.get(a.id) ?? 0), 0)
      if (было != null && стало > было) подрядъ++
      else if (было != null) подрядъ = 0
      было = стало
    }
    return подрядъ
  })()

  // --- величины для новыхъ отличій
  const съЧекомъ = txs.filter((t) => (t.attachments?.length ?? 0) > 0).length
  const съДолями = txs.filter((t) => (t.splits?.length ?? 0) > 0).length
  const чистыхъМѣсяцевъ = months.filter((m) => {
    const свои = txs.filter((t) => monthKey(t.date) === m.key && t.kind !== 'transfer')
    return свои.length > 0 && свои.every((t) => t.categoryId || t.splits?.length)
  }).length
  const серія = streak(data, now)
  const помидоровъ = (data.tasks ?? []).reduce((s, t) => s + (t.pomodoros ?? 0), 0)
  const задачъ = (data.tasks ?? []).length
  const входящихъ = (data.tasks ?? []).filter((t) => !t.done && !t.listId).length

  /*
   * Долги. Счётъ считается сведённымъ только если задолженность по нему
   * дѣйствительно была: пустой долговой счётъ съ нулёмъ на остаткѣ — это не
   * закрытый долгъ, а заведённая и брошенная строка. Безъ этой оговорки
   * награда за погашеніе доставалась бы даромъ, стоило завести счётъ.
   */
  const долгъБылъ_у = (a: typeof data.accounts[number]) =>
    a.initialBalance < 0 || (a.credit?.principal ?? 0) > 0 || txs.some((t) => t.debtId === a.id)
  const остатокъДолга = (a: typeof data.accounts[number]) =>
    a.credit ? creditRemaining(a, txs) : Math.max(0, -(bal.byAccount.get(a.id) ?? 0))
  const долговые = data.accounts.filter(
    (a) => !a.archived && (a.type === 'debt' || a.type === 'credit') && долгъБылъ_у(a),
  )
  const закрытыхъДолговъ = долговые.filter((a) => остатокъДолга(a) === 0).length
  const всеСведены = долговые.length > 0 && закрытыхъДолговъ === долговые.length
  const полгодаНазадъ = balances(data.accounts, txs, addMonths(now, -6))
  const долгъТеперь = -bal.liabilities
  const долгъБылъ = -полгодаНазадъ.liabilities
  const долгъУбылъ = долгъБылъ > 0 && долгъТеперь < долгъБылъ

  // --- тайныя
  const круглый = txs.some((t) => t.kind === 'income' && t.amount === 100_000_00)
  // «Годъ въ одинъ день»: за одинъ заходъ внесены записи болѣе чѣмъ за
  // шестьдесятъ разныхъ датъ — такъ выглядитъ разборъ накопившагося архива.
  const заЗаходъ = new Map<string, Set<string>>()
  for (const t of txs) {
    const k = t.createdAt.slice(0, 10)
    if (!заЗаходъ.has(k)) заЗаходъ.set(k, new Set())
    заЗаходъ.get(k)!.add(t.date)
  }
  const разборъАрхива = [...заЗаходъ.values()].some((s) => s.size > 60)
  // «Возвращеніе»: былъ перерывъ въ мѣсяцъ и больше, а послѣ него — недѣля
  // записей. Награда не за пропускъ, а за то, что вернулись и довели до конца.
  const датыПодрядъ = [...new Set(txs.map((t) => t.date))].sort()
  let вернулся = false
  for (let i = 1; i < датыПодрядъ.length; i++) {
    if (diffDays(датыПодрядъ[i - 1], датыПодрядъ[i]) < 30) continue
    const послѣ = датыПодрядъ.slice(i).filter((d) => diffDays(датыПодрядъ[i], d) < 30)
    if (послѣ.length >= 7) { вернулся = true; break }
  }

  const мѣс = (n: number) => `${n.toFixed(1)} мѣс.`
  const проц = (n: number) => `${n.toFixed(1)} %`
  const разы = (n: number) => `×${n.toFixed(1)}`
  const штукъ = (n: number) => `${Math.ceil(n)}`

  return [
    ...ladder('anna', 'Орденъ Св. Анны', 'За доходъ, добытый трудомъ', всегоДохода, [
      { at: 10_000_00, degree: 4, title: 'Анна 4-й степени' },
      { at: 100_000_00, degree: 3, title: 'Анна 3-й степени' },
      { at: 1_000_000_00, degree: 2, title: 'Анна 2-й степени' },
      { at: 5_000_000_00, degree: 1, title: 'Анна 1-й степени' },
    ]),
    /*
     * Георгій — ранняя лѣстница за мѣсячный доходъ. Потолокъ у него нарочно
     * низкій: выше идутъ вѣхи (триста тысячъ и далѣе), и мѣрить одну и ту же
     * величину двумя наградами съ одинаковыми порогами значило бы просто
     * выдать её дважды.
     */
    ...ladder('george', 'Орденъ Св. Георгія', 'За выдающійся мѣсяцъ', лучшійМѣсяцъ, [
      { at: 50_000_00, degree: 4, title: 'Георгій 4-й степени' },
      { at: 120_000_00, degree: 3, title: 'Георгій 3-й степени' },
      { at: 250_000_00, degree: 2, title: 'Георгій 2-й степени' },
      { at: 500_000_00, degree: 1, title: 'Георгій 1-й степени' },
    ]),
    ...ladder('vladimir', 'Орденъ Св. Владиміра', 'За запасъ прочности', мѣсяцевъЗапаса, [
      { at: 1, degree: 4, title: 'Владиміръ 4-й степени', unit: мѣс },
      { at: 3, degree: 3, title: 'Владиміръ 3-й степени', unit: мѣс },
      { at: 6, degree: 2, title: 'Владиміръ 2-й степени', unit: мѣс },
      { at: 24, degree: 1, title: 'Владиміръ 1-й степени', unit: мѣс },
    ]),
    ...ladder('stanislav', 'Орденъ Св. Станислава', 'За порядокъ въ бумагахъ', дней, [
      { at: 30, degree: 3, title: 'Станиславъ 3-й степени', unit: штукъ },
      { at: 150, degree: 2, title: 'Станиславъ 2-й степени', unit: штукъ },
      { at: 400, degree: 1, title: 'Станиславъ 1-й степени', unit: штукъ },
    ]),
    ...ladder('andrew', 'Орденъ Св. Андрея Первозваннаго', 'За чистый капиталъ', bal.net, [
      { at: 100_000_00, degree: 4, title: 'Андрей 4-й степени' },
      { at: 1_000_000_00, degree: 3, title: 'Андрей 3-й степени' },
      { at: 5_000_000_00, degree: 2, title: 'Андрей 2-й степени' },
      { at: 20_000_000_00, degree: 1, title: 'Андрей 1-й степени' },
    ]),
    /*
     * Екатерина — за капиталъ, который самъ приноситъ. Мѣримъ долей дохода
     * съ капитала въ общемъ доходѣ за годъ, а не суммой: сто тысячъ рентой
     * при заработкѣ въ милліонъ — ещё не независимость, а при заработкѣ въ
     * двѣсти тысячъ — уже половина пути.
     */
    ...ladder('catherine', 'Орденъ Св. Екатерины', 'За капиталъ, который самъ приноситъ', доляКапитала, [
      { at: 5, degree: 4, title: 'Екатерина 4-й степени', unit: проц },
      { at: 15, degree: 3, title: 'Екатерина 3-й степени', unit: проц },
      { at: 30, degree: 2, title: 'Екатерина 2-й степени', unit: проц },
      { at: 50, degree: 1, title: 'Екатерина 1-й степени', unit: проц },
    ]),
    /*
     * Невскій — за путь отъ малыхъ денегъ къ большимъ. Сравниваемъ лучшій
     * мѣсяцъ со среднимъ изъ первыхъ трёхъ мѣсяцевъ учёта: важно не сколько
     * заработано, а во сколько разъ выросло противъ того, съ чего начинали.
     */
    ...ladder('nevsky', 'Орденъ Св. Александра Невскаго', 'Изъ малыхъ денегъ — большія', ростъОтъНачала, [
      { at: 3, degree: 4, title: 'Невскій 4-й степени', unit: разы },
      { at: 5, degree: 3, title: 'Невскій 3-й степени', unit: разы },
      { at: 10, degree: 2, title: 'Невскій 2-й степени', unit: разы },
      { at: 20, degree: 1, title: 'Невскій 1-й степени', unit: разы },
    ]),
    ...ladder('eagle', 'Орденъ Бѣлаго орла', 'За ростъ дохода къ прошлому году', ростъГода, [
      { at: 10, degree: 4, title: 'Бѣлый орелъ 4-й степени', unit: проц },
      { at: 25, degree: 3, title: 'Бѣлый орелъ 3-й степени', unit: проц },
      { at: 50, degree: 2, title: 'Бѣлый орелъ 2-й степени', unit: проц },
      { at: 100, degree: 1, title: 'Бѣлый орелъ 1-й степени', unit: проц },
    ]),
    // --- разовыя отличія
    {
      id: 'first_income',
      title: 'Первый доходъ',
      about: 'Записанъ первый приходъ',
      earned: всегоДохода > 0,
      progress: всегоДохода > 0 ? 1 : 0,
      left: всегоДохода > 0 ? '' : 'запишите первый приходъ',
    },
    {
      id: 'plus_month',
      title: 'Мѣсяцъ сведёнъ въ плюсъ',
      about: 'Заработано больше, чѣмъ истрачено',
      earned: въПлюсѣ > 0,
      progress: въПлюсѣ > 0 ? 1 : 0,
      left: въПлюсѣ > 0 ? '' : 'ни одного мѣсяца въ плюсѣ',
    },
    {
      id: 'plus_three',
      title: 'Три мѣсяца кряду въ плюсѣ',
      about: 'Не случайность, а порядокъ',
      earned: въПлюсѣ >= 3,
      progress: Math.min(1, въПлюсѣ / 3),
      left: въПлюсѣ >= 3 ? '' : `осталось ${3 - въПлюсѣ}`,
    },
    {
      id: 'diverse',
      title: 'Три источника дохода',
      about: 'Одинъ заказчикъ — не доходъ, а зависимость',
      earned: источники >= 3,
      progress: Math.min(1, источники / 3),
      left: источники >= 3 ? '' : `осталось ${3 - источники}`,
    },
    {
      id: 'big_deal',
      title: 'Гонораръ мечты',
      about: 'Одинъ приходъ свыше ста тысячъ',
      earned: крупнѣйшій >= 100_000_00,
      progress: Math.min(1, крупнѣйшій / 100_000_00),
      left: крупнѣйшій >= 100_000_00 ? '' : `осталось ${рубли(100_000_00 - крупнѣйшій)}`,
    },
    {
      id: 'goal_done',
      title: 'Цѣль достигнута',
      about: 'Задуманное доведено до конца',
      earned: цѣлей > 0,
      progress: цѣлей > 0 ? 1 : 0,
      left: цѣлей > 0 ? '' : 'ни одной закрытой цѣли',
    },
    {
      id: 'tasks50',
      title: 'Полсотни дѣлъ',
      about: 'Пятьдесятъ закрытыхъ задачъ',
      earned: дѣлъ >= 50,
      progress: Math.min(1, дѣлъ / 50),
      left: дѣлъ >= 50 ? '' : `осталось ${50 - дѣлъ}`,
    },
    {
      id: 'no_debt',
      title: 'Безъ долговъ',
      about: 'Ни кредита, ни займа',
      earned: долговъ === 0 && txs.length > 0,
      progress: долговъ === 0 ? 1 : 0,
      left: долговъ === 0 ? '' : `остаётся закрыть ${долговъ}`,
    },
    /*
     * Вѣхи мѣсячнаго заработка. Не орденъ и не степени: каждая — самостоятельная
     * зарубка, которую видно въ грамотѣ отдѣльнымъ знакомъ. Считаются по лучшему
     * мѣсяцу за всё время: взятая вѣха назадъ не отбирается.
     */
    ...([300, 500, 700, 900, 1000] as const).map((тыс) => ({
      id: `month${тыс}`,
      title: тыс === 500 ? 'Полмилліона за мѣсяцъ'
        : тыс === 1000 ? 'Милліонъ за мѣсяцъ'
        : `${{ 300: 'Триста', 700: 'Семьсотъ', 900: 'Девятьсотъ' }[тыс]} тысячъ за мѣсяцъ`,
      about: `Мѣсяцъ съ доходомъ отъ ${(тыс * 1000).toLocaleString('ru-RU')} ₽`,
      earned: лучшійМѣсяцъ >= тыс * 1000_00,
      progress: Math.min(1, лучшійМѣсяцъ / (тыс * 1000_00)),
      left: лучшійМѣсяцъ >= тыс * 1000_00 ? '' : `осталось ${рубли(тыс * 1000_00 - лучшійМѣсяцъ)}`,
    })),
    {
      id: 'diverse5',
      title: 'Пять источниковъ дохода',
      about: 'Пять статей, по которымъ шли приходы',
      earned: источники >= 5,
      progress: Math.min(1, источники / 5),
      left: источники >= 5 ? '' : `осталось ${5 - источники}`,
    },
    // --- накопленія
    {
      id: 'save_first',
      title: 'Первый отложенный рубль',
      about: 'На копилку переведены деньги',
      earned: отложено,
      progress: отложено ? 1 : 0,
      left: копилки.length ? 'ни одного перевода на копилку' : 'нѣтъ ни одного счёта-копилки',
    },
    {
      id: 'save_cushion',
      title: 'Подушка по вашей мѣркѣ',
      about: `Запаса хватитъ на ${подушка} мѣс. — какъ и задумано въ профилѣ`,
      earned: запасъМѣсяцевъ >= подушка,
      progress: подушка > 0 ? Math.min(1, запасъМѣсяцевъ / подушка) : 0,
      left: запасъМѣсяцевъ >= подушка ? '' : `осталось ${(подушка - запасъМѣсяцевъ).toFixed(1)} мѣс.`,
    },
    {
      id: 'save_rate',
      title: 'Пятая часть отложена',
      about: 'Норма сбереженій за годъ не ниже двадцати сотыхъ',
      earned: норма >= 20,
      progress: Math.max(0, Math.min(1, норма / 20)),
      left: норма >= 20 ? '' : `сейчасъ ${норма.toFixed(1)} %`,
    },
    {
      id: 'save_growth',
      title: 'Копилка растётъ',
      about: 'Полгода подрядъ накопленій становилось больше',
      earned: ростъНакопленій >= 6,
      progress: Math.min(1, ростъНакопленій / 6),
      left: ростъНакопленій >= 6 ? '' : `подрядъ ${ростъНакопленій} изъ 6`,
    },
    {
      id: 'receipt10',
      title: 'Чекъ къ дѣлу',
      about: 'Десять записей съ приложеннымъ чекомъ',
      earned: съЧекомъ >= 10,
      progress: Math.min(1, съЧекомъ / 10),
      left: съЧекомъ >= 10 ? '' : `осталось ${10 - съЧекомъ}`,
    },
    {
      id: 'split_first',
      title: 'Раскладка',
      about: 'Запись разложена по нѣсколькимъ статьямъ',
      earned: съДолями > 0,
      progress: съДолями > 0 ? 1 : 0,
      left: съДолями > 0 ? '' : 'ни одной записи съ долями',
    },
    {
      id: 'clean_month',
      title: 'Всё разнесено',
      about: 'Мѣсяцъ безъ единой записи мимо статьи',
      earned: чистыхъМѣсяцевъ > 0,
      progress: чистыхъМѣсяцевъ > 0 ? 1 : 0,
      left: чистыхъМѣсяцевъ > 0 ? '' : 'ни одного чистаго мѣсяца',
    },
    {
      id: 'streak30',
      title: 'Ни дня безъ строчки',
      about: 'Тридцать дней серіи подрядъ',
      earned: серія.best >= 30,
      progress: Math.min(1, серія.best / 30),
      left: серія.best >= 30 ? '' : `осталось ${30 - серія.best}`,
    },
    {
      id: 'pomodoro100',
      title: 'Сто помидоровъ',
      about: 'Сотня засчитанныхъ помидоровъ',
      earned: помидоровъ >= 100,
      progress: Math.min(1, помидоровъ / 100),
      left: помидоровъ >= 100 ? '' : `осталось ${100 - помидоровъ}`,
    },
    {
      id: 'inbox_zero',
      title: 'Разгребено',
      about: 'Во «Входящихъ» не осталось ни одного дѣла',
      earned: задачъ > 0 && входящихъ === 0,
      progress: задачъ > 0 && входящихъ === 0 ? 1 : 0,
      left: задачъ === 0 ? 'дѣлъ пока нѣтъ' : `осталось разобрать ${входящихъ}`,
    },
    {
      id: 'debt_closed',
      title: 'Долгъ платежомъ красенъ',
      about: 'Первый долговой счётъ сведёнъ въ ноль',
      earned: закрытыхъДолговъ > 0,
      progress: закрытыхъДолговъ > 0 ? 1 : 0,
      left: долговые.length ? 'ни одинъ долгъ ещё не сведёнъ' : 'долговыхъ счетовъ нѣтъ',
    },
    {
      id: 'debt_all_closed',
      title: 'Послѣдній рубль долга',
      about: 'Всѣ долговые счета сведены въ ноль',
      earned: всеСведены,
      progress: долговые.length ? закрытыхъДолговъ / долговые.length : 0,
      // Безъ долговыхъ счетовъ «остаётся свести 0» читалось бы какъ насмѣшка:
      // ноль остатка и награда не дана. Говоримъ прямо, чего именно нѣтъ.
      left: всеСведены
        ? ''
        : долговые.length
          ? `остаётся свести ${долговые.length - закрытыхъДолговъ}`
          : 'долговыхъ счетовъ нѣтъ',
    },
    {
      id: 'debt_falling',
      title: 'Долгъ убываетъ',
      about: 'Долговъ меньше, чѣмъ полгода назадъ',
      earned: долгъУбылъ,
      progress: долгъБылъ > 0 ? Math.min(1, Math.max(0, (долгъБылъ - долгъТеперь) / долгъБылъ)) : 0,
      left: долгъБылъ > 0 ? `сейчасъ ${рубли(долгъТеперь)}, было ${рубли(долгъБылъ)}` : 'полгода назадъ долговъ не было',
    },
    // --- тайныя: названіе и условіе скрыты, пока не сойдётся
    {
      id: 'round_sum',
      secret: true,
      title: 'Ровно сто тысячъ',
      about: 'Приходъ ровно въ сто тысячъ рублей',
      earned: круглый,
      progress: круглый ? 1 : 0,
      left: '',
    },
    {
      id: 'archive_day',
      secret: true,
      title: 'Годъ въ одинъ день',
      about: 'За одинъ заходъ внесены записи болѣе чѣмъ за шестьдесятъ датъ',
      earned: разборъАрхива,
      progress: разборъАрхива ? 1 : 0,
      left: '',
    },
    {
      id: 'comeback',
      secret: true,
      title: 'Возвращеніе',
      about: 'Послѣ мѣсяца молчанія — недѣля записей',
      earned: вернулся,
      progress: вернулся ? 1 : 0,
      left: '',
    },
    {
      id: 'year_million',
      title: 'Милліонъ за годъ',
      about: 'Годовой доходъ свыше милліона',
      earned: годъ.income >= 1_000_000_00,
      progress: Math.min(1, годъ.income / 1_000_000_00),
      left: годъ.income >= 1_000_000_00 ? '' : `осталось ${рубли(1_000_000_00 - годъ.income)}`,
    },
  ]
}

/** Титулы: даются за характеристику, доросшую до восьмидесяти. */
export function titles(data: VaultData, now: string = today()): { key: string; title: string; earned: boolean }[] {
  const t = traits(data, now)
  const по = (k: string) => t.find((x) => x.key === k)?.value ?? 0
  return [
    { key: 'income', title: 'Промышленникъ', earned: по('income') >= 80 },
    { key: 'thrift', title: 'Рачительный хозяинъ', earned: по('thrift') >= 80 },
    { key: 'reserve', title: 'Хранитель казны', earned: по('reserve') >= 80 },
    { key: 'discipline', title: 'Неусыпный', earned: по('discipline') >= 80 },
    { key: 'order', title: 'Столоначальникъ', earned: по('order') >= 80 },
    { key: 'foresight', title: 'Прозорливый', earned: по('foresight') >= 80 },
  ]
}

/** Сводка для профиля и правой панели. */
export interface Standing {
  xp: number
  level: number
  rank: string
  roman: string
  address: string
  /** Сколько опыта до слѣдующаго чина. null — выше некуда. */
  toNext: number | null
  /** Доля пройденнаго внутри текущаго чина, 0..1. */
  progress: number
  awarded: number
  awardsTotal: number
  /** Ближайшая награда, до которой недалеко. */
  nearest: Award | null
}

export function standing(data: VaultData, now: string = today()): Standing {
  const xp = totalXp(data, now)
  const level = levelOf(xp)
  const branch = data.honors?.branch ?? 'civil'
  const низъ = XP_STEPS[level - 1] ?? 0
  const верхъ = XP_STEPS[level] ?? null
  const all = awards(data, now)
  const мимо = all.filter((a) => !a.earned).sort((a, b) => b.progress - a.progress)
  return {
    xp,
    level,
    rank: RANKS[branch][level - 1] ?? RANKS[branch][0],
    roman: romanClass(level),
    address: address(level),
    toNext: верхъ == null ? null : верхъ - xp,
    progress: верхъ == null ? 1 : Math.max(0, Math.min(1, (xp - низъ) / (верхъ - низъ))),
    awarded: all.filter((a) => a.earned).length,
    awardsTotal: all.length,
    nearest: мимо[0] ?? null,
  }
}

// -------------------------------------------------------- заданія мѣсяца

/*
 * Три заданія на мѣсяцъ.
 *
 * Они не хранятся: и выборъ трёхъ изъ набора, и выполненіе выводятся изъ
 * ключа мѣсяца и самихъ записей. Это то же условіе честности, что и у
 * наградъ, — поправите старую запись, и заданіе прошлаго мѣсяца сойдётся
 * или разойдётся вмѣстѣ съ ней, а не останется отъ прошлой жизни.
 *
 * Опытъ за заданія считается по всѣмъ мѣсяцамъ разомъ, а не только по
 * текущему. Иначе первого числа онъ падалъ бы — а опытъ не отнимается.
 */

export interface MonthQuest {
  id: string
  title: string
  about: string
  done: boolean
  /** 0..1 — для незакрытыхъ. */
  progress: number
  xp: number
}

/** Опытъ за одно закрытое заданіе. */
export const QUEST_XP = 250

interface Заданіе {
  id: string
  title: string
  about: string
  /** Возвращаетъ долю выполненнаго, 0..1. */
  progress: (данные: VaultData, мк: string) => number
}

const мѣсяцаЗаписи = (data: VaultData, мк: string) =>
  data.transactions.filter((t) => monthKey(t.date) === мк)

const НАБОРЪ: Заданіе[] = [
  {
    id: 'entries20',
    title: 'Двадцать записей',
    about: 'Внести за мѣсяцъ двадцать операцій',
    progress: (d, мк) => Math.min(1, мѣсяцаЗаписи(d, мк).length / 20),
  },
  {
    id: 'month_plus',
    title: 'Мѣсяцъ въ плюсъ',
    about: 'Заработать больше, чѣмъ истратить',
    progress: (d, мк) => {
      const свои = мѣсяцаЗаписи(d, мк)
      const приходъ = свои.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
      const расходъ = свои.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
      return приходъ > расходъ ? 1 : 0
    },
  },
  {
    id: 'clean_month',
    title: 'Ничего мимо статьи',
    about: 'Разнести всѣ записи мѣсяца по статьямъ',
    progress: (d, мк) => {
      const свои = мѣсяцаЗаписи(d, мк).filter((t) => t.kind !== 'transfer')
      if (!свои.length) return 0
      const разнесено = свои.filter((t) => t.categoryId || t.splits?.length).length
      return разнесено / свои.length
    },
  },
  {
    id: 'tasks10',
    title: 'Десять дѣлъ',
    about: 'Закрыть за мѣсяцъ десять задачъ',
    progress: (d, мк) => {
      const закрыто = (d.tasks ?? []).filter((t) => t.done && t.doneAt && monthKey(t.doneAt) === мк).length
      return Math.min(1, закрыто / 10)
    },
  },
  {
    id: 'in_limits',
    title: 'Не выйти за смѣту',
    about: 'Уложиться во всѣ назначенные лимиты',
    progress: (d, мк) => {
      const съЛимитомъ = d.categories.filter((c) => !c.archived && c.plan)
      if (!съЛимитомъ.length) return 0
      const свои = мѣсяцаЗаписи(d, мк)
      const въПредѣлѣ = съЛимитомъ.filter((c) => {
        const потрачено = свои.filter((t) => t.categoryId === c.id).reduce((s, t) => s + t.amount, 0)
        return потрачено <= (c.plan ?? 0)
      }).length
      return въПредѣлѣ / съЛимитомъ.length
    },
  },
  {
    id: 'save10',
    title: 'Отложить десятую часть',
    about: 'Оставить отъ дохода мѣсяца хотя бы десять сотыхъ',
    progress: (d, мк) => {
      const свои = мѣсяцаЗаписи(d, мк)
      const приходъ = свои.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
      if (приходъ <= 0) return 0
      const расходъ = свои.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
      return Math.max(0, Math.min(1, ((приходъ - расходъ) / приходъ) / 0.1))
    },
  },
  {
    id: 'five_days',
    title: 'Пять дней кряду',
    about: 'Пять дней подрядъ съ записями внутри мѣсяца',
    progress: (d, мк) => {
      const дни = [...new Set(мѣсяцаЗаписи(d, мк).map((t) => t.date))].sort()
      let лучшее = 0
      let текущее = 0
      for (let i = 0; i < дни.length; i++) {
        текущее = i > 0 && diffDays(дни[i - 1], дни[i]) === 1 ? текущее + 1 : 1
        if (текущее > лучшее) лучшее = текущее
      }
      return Math.min(1, лучшее / 5)
    },
  },
  {
    id: 'new_source',
    title: 'Новый источникъ',
    about: 'Приходъ по статьѣ, которой раньше не было',
    progress: (d, мк) => {
      const раньше = new Set(
        d.transactions.filter((t) => t.kind === 'income' && monthKey(t.date) < мк).map((t) => t.categoryId ?? '—'),
      )
      const новый = мѣсяцаЗаписи(d, мк)
        .filter((t) => t.kind === 'income')
        .some((t) => !раньше.has(t.categoryId ?? '—'))
      return новый ? 1 : 0
    },
  },
]

/**
 * Три заданія выбираются по ключу мѣсяца — одни и тѣ же при каждомъ пересчётѣ,
 * но разные отъ мѣсяца къ мѣсяцу. Простой перебор со сдвигомъ вмѣсто случайности:
 * случайность тутъ означала бы, что задания меняются при каждой перерисовкѣ.
 */
export function monthQuests(data: VaultData, мк: string): MonthQuest[] {
  // Чинъ и знаки даются за свои деньги: проектные счета сюда не входятъ.
  // Иначе награда за мѣсячный доходъ сходилась бы отъ чужого аванса,
  // прошедшаго черезъ счётъ, а не отъ заработаннаго.
  data = личное(data)
  let сѣмя = 0
  for (const ch of мк) сѣмя = (сѣмя * 31 + ch.charCodeAt(0)) % 100003
  const взято: Заданіе[] = []
  for (let i = 0; взято.length < 3 && i < НАБОРЪ.length * 4; i++) {
    const з = НАБОРЪ[(сѣмя + i * 3) % НАБОРЪ.length]
    if (!взято.includes(з)) взято.push(з)
  }
  return взято.map((з) => {
    const p = Math.max(0, Math.min(1, з.progress(data, мк)))
    return { id: з.id, title: з.title, about: з.about, done: p >= 1, progress: p, xp: QUEST_XP }
  })
}

/** Заданія текущаго мѣсяца. */
export const currentQuests = (data: VaultData, now: string = today()): MonthQuest[] =>
  monthQuests(data, monthKey(now))

/** Сколько заданій закрыто за всё время учёта. */
export function questsDone(data: VaultData, now: string = today()): number {
  // Чинъ и знаки даются за свои деньги: проектные счета сюда не входятъ.
  // Иначе награда за мѣсячный доходъ сходилась бы отъ чужого аванса,
  // прошедшаго черезъ счётъ, а не отъ заработаннаго.
  data = личное(data)
  if (!data.transactions.length) return 0
  const первый = data.transactions.reduce((min, t) => (t.date < min ? t.date : min), data.transactions[0].date)
  let всего = 0
  for (const м of monthRange(monthKey(первый) + '-01', now)) {
    всего += monthQuests(data, м).filter((q) => q.done).length
  }
  return всего
}

/** Квесты: совѣты программы и задачи, за которыя положенъ опытъ. */
export interface Quest {
  id: string
  title: string
  about: string
  xp: number
}

export function quests(data: VaultData, now: string = today()): Quest[] {
  const out: Quest[] = []
  const st = standing(data, now)
  if (st.nearest) {
    out.push({
      id: 'award_' + st.nearest.id,
      title: st.nearest.title,
      about: st.nearest.left || st.nearest.about,
      xp: 0,
    })
  }
  for (const t of (data.tasks ?? []).filter((x) => !x.done).slice(0, 5)) {
    out.push({
      id: 'task_' + t.id,
      title: t.title,
      about: t.amount ? `${t.moneyKind === 'income' ? 'приходъ' : 'трата'} ${рубли(t.amount)} ₽` : 'дѣло безъ суммы',
      xp: t.amount && t.moneyKind === 'income' ? 60 : 15,
    })
  }
  return out
}

/**
 * Награды, сошедшіяся впервые: ихъ надо отмѣтить датой и показать человѣку.
 * Чистая функція — записываетъ тотъ, кто показалъ.
 */
export function freshAwards(data: VaultData, now: string = today()): Award[] {
  const было = data.honors?.awarded ?? {}
  return awards(data, now).filter((a) => a.earned && !было[a.id])
}
