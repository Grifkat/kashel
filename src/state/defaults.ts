import { ICON_GROUPS } from '../lib/catalog'
import { PALETTE } from '../lib/emoji'
import type { Account, Category, Settings, ThemeId, VaultData } from '../lib/types'

export const DEFAULT_SETTINGS: VaultData['settings'] = {
  theme: 'imperial',
  animations: 'full',
  density: 'normal',
  readingFont: 'ui',
  pinnedCategories: [],
  accent: '#4cc46a',
  hideBalance: false,
  forecastHorizon: 12,
  monteCarloRuns: 800,
  firstDayOfWeek: 1,
  pomodoro: { work: 25, rest: 5 },
  profile: {
    emergencyMonths: 6,
    savingsRateTarget: 20,
    inflationPct: 8,
    depositRatePct: 16,
    payday: 10,
    currency: '₽',
    locale: 'ru-RU',
  },
}

/** Новое хранилище открывается пустым: никаких придуманных счетов и операций. */
export const emptyVault = (): VaultData => ({
  version: 1,
  accounts: [],
  categories: [],
  transactions: [],
  recurring: [],
  reminders: [],
  tasks: [],
  taskLists: [],
  honors: { branch: 'civil', awarded: {} },
  goals: [],
  scenarios: [],
  importRules: [],
  settings: DEFAULT_SETTINGS,
})

/**
 * Стандартный набор категорий: то, с чего начинают почти все.
 *
 * Создаётся один раз, при первом запуске пустого хранилища, и дальше живёт
 * как обычные категории — переименовывается, перекрашивается и удаляется.
 * Иконки взяты из каталога (catalog.ts), цвета — из общей палитры.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  // расходы — набор, с которого начинают почти все
  { id: 'cat_health', name: 'Здоровье', kind: 'expense', icon: 'heart-pulse', color: '#e05252', bucket: 'needs' },
  { id: 'cat_fun', name: 'Досуг', kind: 'expense', icon: 'film', color: '#3ec9c0', bucket: 'wants' },
  { id: 'cat_home', name: 'Дом', kind: 'expense', icon: 'house', color: '#e8833a', bucket: 'needs' },
  { id: 'cat_cafe', name: 'Кафе', kind: 'expense', icon: 'utensils', color: '#8b5cf6', bucket: 'wants' },
  { id: 'cat_edu', name: 'Образование', kind: 'expense', icon: 'graduation-cap', color: '#4aa3e8', bucket: 'savings' },
  { id: 'cat_gifts', name: 'Подарки', kind: 'expense', icon: 'gift', color: '#e05a91', bucket: 'wants' },
  { id: 'cat_food', name: 'Продукты', kind: 'expense', icon: 'shopping-basket', color: '#4cc46a', bucket: 'needs' },
  { id: 'cat_family', name: 'Семья', kind: 'expense', icon: 'users', color: '#e8b93a', bucket: 'needs' },
  { id: 'cat_sport', name: 'Спорт', kind: 'expense', icon: 'dumbbell', color: '#e8833a', bucket: 'wants' },
  { id: 'cat_transport', name: 'Транспорт', kind: 'expense', icon: 'bus', color: '#4aa3e8', bucket: 'needs' },
  { id: 'cat_other', name: 'Другое', kind: 'expense', icon: 'circle-help', color: '#7c8794', bucket: 'wants' },
  { id: 'cat_charity', name: 'Благотворительность', kind: 'expense', icon: 'hand-heart', color: '#8fce4a', bucket: 'savings' },
  { id: 'cat_subs', name: 'Подписки', kind: 'expense', icon: 'cloud', color: '#8b5cf6', bucket: 'wants' },
  { id: 'cat_internet', name: 'Интернет', kind: 'expense', icon: 'wifi', color: '#3ec9c0', bucket: 'needs' },
  { id: 'cat_work', name: 'Рабочие расходы', kind: 'expense', icon: 'briefcase', color: '#e8b93a', bucket: 'needs' },
  { id: 'cat_taxi', name: 'Такси', kind: 'expense', icon: 'car-taxi-front', color: '#8fce4a', bucket: 'wants' },
  { id: 'cat_takeaway', name: 'Готовая еда', kind: 'expense', icon: 'sandwich', color: '#c95cc9', bucket: 'wants' },
  { id: 'cat_site', name: 'Сайт', kind: 'expense', icon: 'laptop', color: '#5566e8', bucket: 'needs' },
  { id: 'cat_taxes', name: 'Налоги', kind: 'expense', icon: 'landmark', color: '#7c8794', bucket: 'needs' },
  { id: 'cat_account', name: 'Бухгалтер', kind: 'expense', icon: 'receipt-text', color: '#8b5cf6', bucket: 'needs' },
  { id: 'cat_clothes', name: 'Одежда', kind: 'expense', icon: 'shirt', color: '#3ec98a', bucket: 'wants' },
  // доходы
  { id: 'cat_salary', name: 'Зарплата', kind: 'income', icon: 'banknote', color: '#4cc46a' },
  { id: 'cat_extra', name: 'Подработка', kind: 'income', icon: 'hard-hat', color: '#8fce4a' },
  { id: 'cat_business', name: 'Своё дело', kind: 'income', icon: 'briefcase', color: '#3ec98a' },
  { id: 'cat_interest', name: 'Проценты', kind: 'income', icon: 'percent', color: '#3ec9c0' },
  { id: 'cat_refund', name: 'Возвраты', kind: 'income', icon: 'recycle', color: '#4aa3e8' },
  { id: 'cat_income_gift', name: 'Подарки', kind: 'income', icon: 'gift', color: '#e05a91' },
  { id: 'cat_income_other', name: 'Прочее', kind: 'income', icon: 'ellipsis', color: '#7c8794' },
]

/**
 * Хранилище только что установленной программы: своих операций и счетов нет,
 * а категории уже есть — без них не работают ни быстрый ввод, ни отчёты,
 * и придумывать два десятка названий руками никто не хочет.
 */
export const freshVault = (): VaultData => ({
  ...emptyVault(),
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
})

/**
 * Категория на каждую иконку каталога.
 *
 * Вид берём по разделу: то, что лежит в «Работе и доходе», приходит, остальное
 * уходит. Корзина — тоже по разделу, иначе бюджет 50/30/20 считает пустоту.
 * Имена, которые уже заняты, пропускаем: одна и та же иконка встречается в
 * нескольких разделах, а две «Заботы» в списке никому не помогут.
 */
const GROUP_KIND: Record<string, 'expense' | 'income'> = {
  'Работа и доход': 'income',
}

const GROUP_BUCKET: Record<string, 'needs' | 'wants' | 'savings'> = {
  'Финансы': 'savings',
  'Еда и напитки': 'needs',
  'Транспорт': 'needs',
  'Покупки': 'wants',
  'Дом': 'needs',
  'Здоровье': 'needs',
  'Красота': 'wants',
  'Развлечения': 'wants',
  'Счета и услуги': 'needs',
  'Спорт': 'wants',
  'Отдых': 'wants',
  'Образование': 'savings',
  'Семья и дети': 'needs',
  'Прочее': 'wants',
}

export function categoriesFromCatalog(existing: Category[]): Category[] {
  const taken = new Set(existing.map((c) => c.kind + '|' + c.name.trim().toLowerCase()))
  const usedIcons = new Set(existing.map((c) => c.icon))
  const out: Category[] = []
  let color = 0

  for (const group of ICON_GROUPS) {
    const kind = GROUP_KIND[group.title] ?? 'expense'
    const bucket = kind === 'expense' ? GROUP_BUCKET[group.title] ?? 'wants' : undefined
    for (const icon of group.items) {
      if (usedIcons.has(icon.id)) continue
      const key = kind + '|' + icon.title.trim().toLowerCase()
      if (taken.has(key)) continue
      taken.add(key)
      usedIcons.add(icon.id)
      out.push({
        id: 'cat_' + icon.id,
        name: icon.title,
        kind,
        icon: icon.id,
        color: PALETTE[color++ % PALETTE.length],
        ...(bucket ? { bucket } : {}),
      })
    }
  }
  return out
}

/** Раньше тема была просто «тёмная/светлая» — переводим старые хранилища. */
export function migrateSettings(raw: Partial<Settings> | undefined): Settings {
  const legacy: Record<string, ThemeId> = { dark: 'obsidian', light: 'mint' }
  const theme = raw?.theme && legacy[raw.theme] ? legacy[raw.theme] : raw?.theme
  return {
    ...DEFAULT_SETTINGS,
    ...(raw || {}),
    theme: (theme as ThemeId) || DEFAULT_SETTINGS.theme,
    animations: raw?.animations ?? DEFAULT_SETTINGS.animations,
    density: raw?.density ?? DEFAULT_SETTINGS.density,
    pinnedCategories: raw?.pinnedCategories ?? [],
    readingFont: raw?.readingFont ?? DEFAULT_SETTINGS.readingFont,
    pomodoro: { ...DEFAULT_SETTINGS.pomodoro, ...(raw?.pomodoro || {}) },
    profile: { ...DEFAULT_SETTINGS.profile, ...(raw?.profile || {}) },
  }
}

/*
 * Перенос кредитов на остаток счёта.
 *
 * Раньше долг по кредиту хранился отдельным полем `principal`, а остаток
 * счёта оставался нулём. Из-за этого кредит на полмиллиона весил в дашборде
 * и в чистом капитале ноль рублей, а погашения не существовало вовсе: платёж
 * требовал пометки, которую в программе негде было поставить.
 *
 * Теперь долг живёт в остатке, как у всего прочего. Старым счетам остаток
 * надо проставить — иначе они так и останутся невидимыми.
 *
 * Условие нарочно узкое: трогаем только те, у кого остаток ровно ноль и по
 * которым нет ни одной операции. Значит, человек завёл кредит и больше ничего
 * с ним не делал, и другого источника правды, кроме `principal`, у нас нет.
 * Где остаток уже задан или операции есть — не лезем.
 */
export function migrateCredits(data: VaultData): { accounts: Account[]; changed: number } {
  let changed = 0
  const accounts = data.accounts.map((a) => {
    if (a.type !== 'credit' || !a.credit) return a
    const тело = a.credit.principal || 0
    if (тело <= 0 || a.initialBalance !== 0) return a
    if (data.transactions.some((t) => t.accountId === a.id || t.toAccountId === a.id)) return a
    changed++
    return { ...a, initialBalance: -тело }
  })
  return { accounts, changed }
}
