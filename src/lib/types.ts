// Все денежные величины — целые копейки. Никаких float-накоплений в суммах.
export type Money = number

export type TxKind = 'expense' | 'income' | 'transfer'
export type CategoryKind = 'expense' | 'income'
export type Bucket = 'needs' | 'wants' | 'savings'

export interface Split {
  categoryId: string
  amount: Money
  note?: string
}

export interface Transaction {
  id: string
  kind: TxKind
  date: string // YYYY-MM-DD
  amount: Money // всегда положительная, знак определяется kind
  accountId: string // для перевода — счёт-источник
  toAccountId?: string // только для перевода
  categoryId?: string
  splits?: Split[] // если задано — сумма долей равна amount
  tags: string[]
  note?: string
  attachments?: string[] // относительные пути внутри хранилища
  recurringId?: string // операция порождена регулярным правилом
  debtId?: string // платёж по долгу/кредиту
  goalId?: string // пополнение цели
  createdAt: string
}

export type AccountType = 'cash' | 'card' | 'savings' | 'credit' | 'debt'

export interface Account {
  id: string
  name: string
  type: AccountType
  icon: string
  color: string
  initialBalance: Money
  archived?: boolean
  /**
   * Счёт заведён под проект: деньги на нём лежат у вас, но не ваши.
   *
   * Аванс за работу, сбор на издание, бюджет кампании. Такой счёт целиком
   * выпадает из личных цифр — дохода, расхода, чистого капитала, прогноза и
   * наград, — но остаётся видимым, и по нему считается своя сводка. Правила
   * и единственное исключение (перевод через границу) — в engine/project.
   */
  project?: boolean
  /*
   * Кредит.
   *
   * Долг живёт в остатке счёта, как у всего остального: трата с кредитного
   * счёта его увеличивает, перевод на счёт — гасит. Поля ниже описывают не
   * долг, а условия — по ним считаются переплата, срок и график.
   *
   * Раньше долг хранился отдельно, в `principal`, и не совпадал с остатком:
   * кредит на полмиллиона весил в дашборде ноль рублей. Теперь `principal` —
   * это только «сколько взяли изначально», для графика и переплаты.
   */
  credit?: {
    /** Карта с возобновляемым лимитом или заём с графиком платежей. */
    kind?: 'card' | 'loan'
    /** Лимит карты. Осмыслен только у kind: 'card'. */
    limit?: Money
    /** Беспроцентный период карты в днях. Ноль или пусто — его нет. */
    graceDays?: number
    /** Сколько взято изначально. У займа — тело, у карты не используется. */
    principal: Money
    ratePct: number // годовых
    termMonths: number
    startDate: string
    paymentDay: number
    monthlyPayment: Money
  }
  // Долг человеку или человека мне
  debt?: {
    counterparty: string
    direction: 'i_owe' | 'owed_to_me'
    dueDate?: string
  }
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  parentId?: string
  icon: string
  color: string
  plan?: Money // «планирую тратить X в месяц»
  bucket?: Bucket // для правила 50/30/20
  /**
   * Доход с капитала, а не с труда: дивиденды, купоны, аренда, проценты.
   *
   * Отличить одно от другого приложение само не может — по операции видно
   * только сумму, счёт и статью. Поэтому признак ставится руками, один раз
   * на статью, и сразу распространяется на всю историю по ней.
   *
   * Осмысленно только у статей дохода.
   */
  capital?: boolean
  archived?: boolean
}

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Recurring {
  id: string
  title: string
  kind: TxKind
  amount: Money
  accountId: string
  toAccountId?: string
  categoryId?: string
  freq: Freq
  interval: number // каждые N периодов
  dayOfMonth?: number
  weekday?: number // 0 — воскресенье
  startDate: string
  endDate?: string
  autoPost: boolean // создавать операции автоматически при наступлении даты
  lastPosted?: string
  tags: string[]
  note?: string
  active: boolean
}

/**
 * Напоминание, заведённое человеком.
 *
 * Два вида, и они устроены по-разному. «По дате» — обычный ежедневник: текст
 * и день, когда его показать. «По событию» — условие, за которым программа
 * следит сама: давно не вносили траты, остаток упал ниже порога, категория
 * вышла за лимит.
 *
 * Оговорка, которую честнее держать в виду: напоминание приходит только пока
 * окно открыто. Служебного фонового режима у программы нет, и заводить его
 * ради этого — значит поселить её в автозапуске без спроса.
 */
export type ReminderSound = 'none' | 'soft' | 'bell' | 'low' | 'double' | 'file'

export type ReminderRepeat = 'once' | 'weekly' | 'monthly' | 'yearly'

export type ReminderEvent =
  /** Скоро сработает регулярный платёж. threshold — за сколько дней предупредить. */
  | 'recurring-due'
  /** Давно не вносили операций. threshold — сколько дней молчания терпеть. */
  | 'no-entries'
  /** Категория вышла за свой месячный лимит. categoryId пуст — следим за всеми. */
  | 'limit-exceeded'
  /** Трата заметно крупнее обычной для своей категории. threshold — во сколько раз. */
  | 'big-expense'
  /** Остаток счёта ниже порога. threshold — сумма в копейках. */
  | 'low-balance'
  /** Задача со сроком на подходе. threshold — за сколько дней предупредить. */
  | 'task-due'

export interface Reminder {
  id: string
  title: string
  active: boolean
  sound: ReminderSound
  /** Свой звук: путь внутри хранилища. Осмыслен только при sound: 'file'. */
  soundFile?: string
  kind: 'date' | 'event'
  // ---- по дате
  date?: string
  repeat?: ReminderRepeat
  // ---- по событию
  event?: ReminderEvent
  threshold?: number
  accountId?: string
  categoryId?: string
  /** Когда показывали в последний раз — чтобы не звонить об одном и том же дважды. */
  lastFired?: string
}

/**
 * Задача.
 *
 * Половина дел в списке любого человека — про деньги: продлить хостинг,
 * заплатить юристу, отправить договор. Поэтому у задачи есть необязательная
 * сумма: с ней задача становится запланированной тратой и попадает в прогноз,
 * а без неё остаётся обычным делом. «Найти юриста» суммы не имеет и на цифры
 * не влияет.
 *
 * Срочность нигде не хранится: она считается от срока. Это и есть смысл
 * матрицы Эйзенхауэра — дело само переползает в «срочное» по мере
 * приближения срока, а не потому, что кто-то не забыл переставить флажок.
 */
export interface Task {
  id: string
  title: string
  done: boolean
  doneAt?: string
  /** Срок. Без срока задача несрочная и живёт во «Входящих». */
  due?: string
  /**
   * Флажок «важно» — вторая ось матрицы.
   *
   * Остаётся ради старых хранилищ и держится в согласии с `priority`: он
   * взводится, когда важность средняя или выше. Читать в новом коде надо
   * `priorityOf` и `isImportant` из engine/tasks — там оба случая сведены.
   */
  important: boolean
  /**
   * Важность: 0 — нет, 1 — низкая, 2 — средняя, 3 — высокая.
   *
   * Пусто у задач, заведённых до появления шкалы: у них важность выводится
   * из флажка `important`, и «важно» равно высокой.
   */
  priority?: 0 | 1 | 2 | 3
  /** Планируемая сумма. Пусто — задача не про деньги. */
  amount?: Money
  /** Куда пойдёт сумма: трата или приход. Осмысленно только вместе с amount. */
  moneyKind?: 'expense' | 'income'
  categoryId?: string
  accountId?: string
  /** Список-проект. Пусто — «Входящие». */
  listId?: string
  note?: string
  tags: string[]
  /** Сколько помидоров засчитано на эту задачу. */
  pomodoros?: number
  order: number
  createdAt: string
}

export interface TaskList {
  id: string
  name: string
  color: string
  archived?: boolean
}

/**
 * Чинъ и награды — игровой слой поверх учёта.
 *
 * Хранится здесь только то, что из данных не выводится: выбранная
 * лестница чиновъ, дата первого получения каждой награды и закреплённый
 * титулъ. Сами условия наградъ пересчитываются всегда — иначе загрузка
 * чужого архива или правка старой записи оставила бы награду, которой
 * человѣкъ не заслужилъ, и отняла бы ту, что заслужилъ.
 */
export type RankBranch = 'civil' | 'military' | 'merchant'

export interface Honors {
  branch: RankBranch
  /** Ид награды → день, когда она впервые сошлась. */
  awarded: Record<string, string>
  /** Закреплённый титулъ: показывается рядомъ съ чиномъ. */
  pinned?: string
}

export interface Goal {
  id: string
  name: string
  icon: string
  color: string
  targetAmount: Money
  targetDate?: string
  accountId?: string // копилка, если цель привязана к счёту
  saved: Money // ручной остаток, если счёт не привязан
  priority: number
  note?: string
  done?: boolean
}

export interface ImportRule {
  id: string
  match: string // подстрока в описании операции, регистр не важен
  categoryId: string
  tags?: string[]
}

export interface Profile {
  emergencyMonths: number // целевой размер подушки в месяцах расходов
  savingsRateTarget: number // целевая норма сбережений, %
  inflationPct: number
  depositRatePct: number
  payday: number // день зарплаты
  currency: string
  locale: string
}

/** Оформления различаются не только цветом: скруглениями, плотностью, тенями. */
export type ThemeId = 'obsidian' | 'mint' | 'graphite' | 'glass' | 'neon' | 'warm' | 'imperial'

/**
 * Насколько живо ведёт себя интерфейс.
 * «system» следует системной просьбе уменьшить движение, остальные три —
 * явный выбор пользователя, и он системную настройку перебивает.
 */
export type AnimLevel = 'system' | 'off' | 'subtle' | 'full'
/** Уровень после учёта системной настройки — именно он доходит до компонентов. */
export type ResolvedAnim = 'off' | 'subtle' | 'full'

/** Плотность интерфейса: множитель отступов, размеры шрифта не трогает. */
export type Density = 'compact' | 'normal' | 'roomy'
/** Чем набирать длинный текст заметок: тем же гротеском или шрифтом с засечками. */
export type ReadingFont = 'ui' | 'serif'

export interface Settings {
  theme: ThemeId
  animations: AnimLevel
  density: Density
  readingFont: ReadingFont
  /** Категории, закреплённые в быстром вводе. Порядок — как закрепляли. */
  pinnedCategories: string[]
  accent: string
  hideBalance: boolean
  forecastHorizon: number
  monteCarloRuns: number
  firstDayOfWeek: 0 | 1
  /** Помидор: сколько минут работать и сколько отдыхать. */
  pomodoro: { work: number; rest: number }
  /**
   * Как писать даты цифрами: по-русски 03.09.2026 или по-американски
   * 09/03/2026. Влияет и на встроенный выбор даты, но тот берёт язык при
   * запуске программы — значит, применится со следующего открытия.
   */
  dateFormat?: 'ru' | 'us'
  /**
   * Прятать окно в трей вместо закрытия и сворачивания. Программа при этом
   * продолжает работать: напоминания и помидор остаются живыми.
   */
  tray?: boolean
  /**
   * Выходной для серии записей: 0 — воскресенье, 6 — суббота.
   * Этот день недели в серию не считается — не наращивает её и не рвёт.
   * Пусто — выходного нет, считаются все дни.
   */
  restDay?: number
  profile: Profile
}

export interface ScenarioAdjust {
  categoryId: string
  factor: number // 1 = без изменений, 0.8 = минус 20%
}

export interface ScenarioEvent {
  id: string
  date: string
  title: string
  amount: Money // положительная — доход, отрицательная — расход
}

export interface Scenario {
  id: string
  name: string
  incomeFactor: number
  adjusts: ScenarioAdjust[]
  events: ScenarioEvent[]
  extraSavingsMonthly: Money
  note?: string
}

// ------------------------------------------------------------ канвас
// Формат совместим с JSON Canvas Obsidian, расширен узлом типа 'kashel'.
export type CanvasNodeKind =
  | 'text'
  | 'note'
  | 'account'
  | 'category'
  | 'goal'
  | 'flow'
  | 'query'
  | 'scenario'
  | 'group'

/**
 * Как текст ведёт себя при изменении размера карточки.
 * fixed  — размер шрифта постоянный, длинный текст прокручивается
 * scale  — шрифт тянется вместе с карточкой, как надпись на табличке
 * shrink — шрифт уменьшается ровно настолько, чтобы всё поместилось
 * grow   — шрифт постоянный, а карточка сама растёт под содержимое
 */
export type TextFit = 'fixed' | 'scale' | 'shrink' | 'grow'

export interface CanvasNode {
  id: string
  type: CanvasNodeKind
  x: number
  y: number
  width: number
  height: number
  color?: string
  text?: string // для text/query
  file?: string // для note
  ref?: string // id счёта/категории/цели/сценария
  label?: string // для group
  fit?: TextFit
  fontSize?: number // базовый кегль текстовой карточки, px
  options?: Record<string, unknown>
}

export type Side = 'top' | 'right' | 'bottom' | 'left'

/** Куда смотрит наконечник: в конец, в обе стороны или никуда. */
export type EdgeArrow = 'end' | 'both' | 'none'

export interface CanvasEdge {
  id: string
  fromNode: string
  fromSide: Side
  toNode: string
  toSide: Side
  color?: string
  label?: string
  arrow?: EdgeArrow
  flow?: boolean // ребро-денежный поток: толщина по сумме
}

/** Оформление карточек: у каждой доски своё. */
export type CardStyle = 'rich' | 'minimal' | 'flat'

export interface CanvasDoc {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  cardStyle?: CardStyle
  /** Цвета быстрого доступа в меню карточки — свои у каждой доски. */
  quickColors?: string[]
}

// ------------------------------------------------------------ заметки
export interface Note {
  path: string // notes/Имя.md
  title: string
  body: string
  tags: string[]
  links: string[] // [[цели]]
  mtime: number
}

export interface VaultData {
  version: number
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  recurring: Recurring[]
  reminders: Reminder[]
  tasks: Task[]
  taskLists: TaskList[]
  honors: Honors
  goals: Goal[]
  scenarios: Scenario[]
  importRules: ImportRule[]
  settings: Settings
}
