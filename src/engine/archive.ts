import type {
  Account, AccountType, Bucket, CanvasDoc, CanvasEdge, CanvasNode, Category, Freq, Goal,
  ImportRule, Money, Recurring, Reminder, ReminderEvent, ReminderRepeat, ReminderSound,
  RankBranch, Scenario, Settings, Side, Task, TaskList, Transaction, TxKind, VaultData,
} from '../lib/types'
import { migrateSettings } from '../state/defaults'
import { today } from '../lib/date'
import {
  bridge, canvasPath, listAttachments, listCanvases, listNotes, notePath,
  readAttachmentBase64, readCanvas, readNote,
} from '../state/vault'

/*
 * Архив хранилища — всё содержимое программы одним файлом.
 *
 * Внутри обычный JSON с отступами: его можно открыть блокнотом, посмотреть
 * глазами, положить в git и починить руками. Это то же обещание, что даёт
 * само хранилище, просто свёрнутое в один файл для пересылки.
 *
 * Файл приходит от другого человека, поэтому всё, что из него читается,
 * проверяется и приводится к нужному виду: одна кривая запись не должна
 * ронять программу и не должна попадать в хранилище.
 */

export const ARCHIVE_EXT = 'kashel'
/** Версия формата. Файл более новой версии открывать не беремся. */
export const ARCHIVE_FORMAT = 1

export const ARCHIVE_FILTERS = [
  { name: 'Архив Кошеля', extensions: [ARCHIVE_EXT, 'json'] },
]

export interface ArchiveCounts {
  transactions: number
  accounts: number
  categories: number
  recurring: number
  reminders: number
  tasks: number
  goals: number
  scenarios: number
  notes: number
  canvases: number
  attachments: number
}

export interface Archive {
  kashel: 'vault'
  formatVersion: number
  app: string
  exportedAt: string
  counts: ArchiveCounts
  /** Справочники, операции и настройки — ровно то, что лежит в data.json. */
  data: VaultData
  /** Имя заметки → тело markdown. */
  notes: Record<string, string>
  /** Имя доски → документ канваса. */
  canvases: Record<string, CanvasDoc>
  /** Путь внутри хранилища → содержимое картинки в base64. */
  attachments: Record<string, string>
}

// ----------------------------------------------------------------- сборка

/** Собирает всё содержимое хранилища в один объект. */
export async function buildArchive(data: VaultData): Promise<Archive> {
  const noteNames = await listNotes()
  const notes: Record<string, string> = {}
  await Promise.all(
    noteNames.map(async (n) => {
      notes[n] = (await readNote(n)) ?? ''
    }),
  )

  const canvasNames = await listCanvases()
  const canvases: Record<string, CanvasDoc> = {}
  await Promise.all(
    canvasNames.map(async (n) => {
      const doc = await readCanvas(n)
      if (doc) canvases[n] = doc
    }),
  )

  const attachmentPaths = await listAttachments()
  const attachments: Record<string, string> = {}
  await Promise.all(
    attachmentPaths.map(async (rel) => {
      const b64 = await readAttachmentBase64(rel)
      if (b64) attachments[rel] = b64
    }),
  )

  return {
    kashel: 'vault',
    formatVersion: ARCHIVE_FORMAT,
    app: 'Кошель',
    exportedAt: new Date().toISOString(),
    counts: {
      transactions: data.transactions.length,
      accounts: data.accounts.length,
      categories: data.categories.length,
      recurring: data.recurring.length,
      reminders: data.reminders.length,
      tasks: data.tasks.length,
      goals: data.goals.length,
      scenarios: data.scenarios.length,
      notes: Object.keys(notes).length,
      canvases: Object.keys(canvases).length,
      attachments: Object.keys(attachments).length,
    },
    data,
    notes,
    canvases,
    attachments,
  }
}

export const archiveText = (a: Archive): string => JSON.stringify(a, null, 2)

const stamp = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const archiveFileName = (): string => `Кошель ${stamp()}.${ARCHIVE_EXT}`

/** Имя резервной копии внутри хранилища: с часами, их за день бывает несколько. */
export function backupPath(d = new Date()): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `backups/до-загрузки ${stamp(d)} ${hh}-${mm}-${ss}.${ARCHIVE_EXT}`
}

// ------------------------------------------------------------- приведение

type Raw = Record<string, unknown>

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {})
const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb)
const num = (v: unknown, fb = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb)
const money = (v: unknown): Money => Math.round(num(v))
const bool = (v: unknown): boolean => v === true
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const strList = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === 'string')
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T =>
  (allowed as readonly string[]).includes(str(v)) ? (v as T) : fb
const isDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s)
const dateOr = (v: unknown, fb: string): string => (isDate(str(v)) ? str(v) : fb)
const opt = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

const KINDS = ['expense', 'income', 'transfer'] as const
const ACCOUNT_TYPES = ['cash', 'card', 'savings', 'credit', 'debt'] as const
const BUCKETS = ['needs', 'wants', 'savings'] as const
const FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const
const REMINDER_SOUNDS = ['none', 'soft', 'bell', 'low', 'double', 'file'] as const
const REMINDER_REPEATS = ['once', 'weekly', 'monthly', 'yearly'] as const
const REMINDER_EVENTS: readonly ReminderEvent[] =
  ['recurring-due', 'task-due', 'no-entries', 'limit-exceeded', 'big-expense', 'low-balance']
const SIDES = ['top', 'right', 'bottom', 'left'] as const
const NODE_KINDS = ['text', 'note', 'account', 'category', 'goal', 'flow', 'query', 'scenario', 'group'] as const

/** Счётчик отброшенного: показываем итог, а не молчим о потере. */
interface Drop {
  n: number
}

function normTransaction(v: unknown, drop: Drop): Transaction | null {
  const r = asRaw(v)
  const id = str(r.id)
  const date = str(r.date)
  // Запись без даты в файл месяца не ложится и ни в один период не попадает —
  // такую лучше отбросить сразу, чем потом искать её по всему хранилищу.
  if (!id || !isDate(date)) {
    drop.n++
    return null
  }
  const kind = oneOf<TxKind>(r.kind, KINDS, 'expense')
  const splits = list(r.splits)
    .map((s) => {
      const x = asRaw(s)
      const categoryId = str(x.categoryId)
      return categoryId ? { categoryId, amount: money(x.amount), ...(opt(x.note) ? { note: str(x.note) } : {}) } : null
    })
    .filter((s): s is NonNullable<typeof s> => !!s)

  return {
    id,
    kind,
    date,
    amount: Math.abs(money(r.amount)),
    accountId: str(r.accountId),
    toAccountId: kind === 'transfer' ? opt(r.toAccountId) : undefined,
    categoryId: opt(r.categoryId),
    splits: splits.length ? splits : undefined,
    tags: strList(r.tags),
    note: opt(r.note),
    attachments: strList(r.attachments).length ? strList(r.attachments) : undefined,
    recurringId: opt(r.recurringId),
    debtId: opt(r.debtId),
    goalId: opt(r.goalId),
    createdAt: str(r.createdAt) || new Date().toISOString(),
  }
}

function normAccount(v: unknown, drop: Drop): Account | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  const credit = asRaw(r.credit)
  const debt = asRaw(r.debt)
  return {
    id,
    name: str(r.name, 'Счёт'),
    type: oneOf<AccountType>(r.type, ACCOUNT_TYPES, 'card'),
    icon: str(r.icon, 'credit-card'),
    color: str(r.color, '#4cc46a'),
    initialBalance: money(r.initialBalance),
    ...(bool(r.archived) ? { archived: true } : {}),
    ...(r.credit
      ? {
          credit: {
            principal: money(credit.principal),
            ratePct: num(credit.ratePct),
            termMonths: Math.max(1, Math.round(num(credit.termMonths, 12))),
            startDate: dateOr(credit.startDate, '1970-01-01'),
            paymentDay: Math.min(31, Math.max(1, Math.round(num(credit.paymentDay, 1)))),
            monthlyPayment: money(credit.monthlyPayment),
          },
        }
      : {}),
    ...(r.debt
      ? {
          debt: {
            counterparty: str(debt.counterparty),
            direction: debt.direction === 'owed_to_me' ? 'owed_to_me' : 'i_owe',
            ...(isDate(str(debt.dueDate)) ? { dueDate: str(debt.dueDate) } : {}),
          },
        }
      : {}),
  }
}

function normCategory(v: unknown, drop: Drop): Category | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  const plan = r.plan == null ? undefined : money(r.plan)
  return {
    id,
    name: str(r.name, 'Категория'),
    kind: r.kind === 'income' ? 'income' : 'expense',
    parentId: opt(r.parentId),
    icon: str(r.icon, 'circle-help'),
    color: str(r.color, '#7c8794'),
    ...(plan ? { plan } : {}),
    ...(typeof r.bucket === 'string' ? { bucket: oneOf<Bucket>(r.bucket, BUCKETS, 'wants') } : {}),
    ...(bool(r.archived) ? { archived: true } : {}),
  }
}

function normRecurring(v: unknown, drop: Drop): Recurring | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  const day = Math.round(num(r.dayOfMonth, 1))
  return {
    id,
    title: str(r.title, 'Платёж'),
    kind: oneOf<TxKind>(r.kind, KINDS, 'expense'),
    amount: Math.abs(money(r.amount)),
    accountId: str(r.accountId),
    toAccountId: opt(r.toAccountId),
    categoryId: opt(r.categoryId),
    freq: oneOf<Freq>(r.freq, FREQS, 'monthly'),
    interval: Math.max(1, Math.round(num(r.interval, 1))),
    dayOfMonth: Math.min(31, Math.max(1, day || 1)),
    ...(r.weekday == null ? {} : { weekday: Math.min(6, Math.max(0, Math.round(num(r.weekday)))) }),
    startDate: dateOr(r.startDate, '1970-01-01'),
    ...(isDate(str(r.endDate)) ? { endDate: str(r.endDate) } : {}),
    autoPost: bool(r.autoPost),
    ...(typeof r.lastPosted === 'string' ? { lastPosted: str(r.lastPosted) } : {}),
    tags: strList(r.tags),
    note: opt(r.note),
    active: r.active !== false,
  }
}

/**
 * Напоминание из чужого архива.
 *
 * Вид и событие приводим к известным значениям, а не доверяем строке:
 * неизвестное событие превратило бы вечно молчащее напоминание в вечно
 * звонящее или наоборот, и человек не понял бы, почему.
 */
function normReminder(v: unknown, drop: Drop): Reminder | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  const kind: Reminder['kind'] = r.kind === 'event' ? 'event' : 'date'
  const ev = REMINDER_EVENTS.includes(str(r.event) as ReminderEvent)
    ? (str(r.event) as ReminderEvent)
    : 'no-entries'
  return {
    id,
    title: str(r.title, 'Напоминание'),
    active: r.active !== false,
    sound: oneOf<ReminderSound>(r.sound, REMINDER_SOUNDS, 'soft'),
    ...(typeof r.soundFile === 'string' && r.soundFile ? { soundFile: str(r.soundFile) } : {}),
    kind,
    ...(kind === 'date'
      ? {
          date: dateOr(r.date, today()),
          repeat: oneOf<ReminderRepeat>(r.repeat, REMINDER_REPEATS, 'once'),
        }
      : {
          event: ev,
          threshold: Math.max(0, Math.round(num(r.threshold, 0))),
          ...(r.accountId == null ? {} : { accountId: str(r.accountId) }),
          ...(r.categoryId == null ? {} : { categoryId: str(r.categoryId) }),
        }),
    ...(isDate(str(r.lastFired)) ? { lastFired: str(r.lastFired) } : {}),
  }
}

/**
 * Задача из чужого архива.
 *
 * Сумма без вида — беда: пришлось бы гадать, трата это или приход, и
 * ошибка гадания уехала бы прямо в прогноз. Поэтому вид приводим к
 * известному, а сумму без вида считаем тратой — так ошибка идёт в сторону
 * осторожности, а не в сторону мнимого богатства.
 */
function normTask(v: unknown, drop: Drop): Task | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  const amount = Math.abs(money(r.amount))
  return {
    id,
    title: str(r.title, 'Задача'),
    done: r.done === true,
    ...(isDate(str(r.doneAt)) ? { doneAt: str(r.doneAt) } : {}),
    ...(isDate(str(r.due)) ? { due: str(r.due) } : {}),
    important: r.important === true,
    ...(amount
      ? {
          amount,
          moneyKind: r.moneyKind === 'income' ? ('income' as const) : ('expense' as const),
        }
      : {}),
    ...(r.categoryId == null ? {} : { categoryId: str(r.categoryId) }),
    ...(r.accountId == null ? {} : { accountId: str(r.accountId) }),
    ...(r.listId == null ? {} : { listId: str(r.listId) }),
    note: opt(r.note),
    tags: strList(r.tags),
    ...(r.pomodoros == null ? {} : { pomodoros: Math.max(0, Math.round(num(r.pomodoros))) }),
    order: Math.round(num(r.order)),
    createdAt: str(r.createdAt, today()),
  }
}

function normTaskList(v: unknown, drop: Drop): TaskList | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  return { id, name: str(r.name, 'Список'), color: str(r.color, '#4cc46a'), ...(r.archived ? { archived: true } : {}) }
}

/**
 * Чины и награды изъ чужого архива.
 *
 * Даты полученія переносимъ какъ есть, а условія всё равно пересчитаются
 * на своихъ данныхъ: чужая награда за чужой доходъ у себя не удержится.
 */
function normHonors(v: unknown): VaultData['honors'] {
  const r = asRaw(v)
  const branch = oneOf<RankBranch>(r.branch, ['civil', 'military', 'merchant'] as const, 'civil')
  const awarded: Record<string, string> = {}
  const raw = r.awarded && typeof r.awarded === 'object' ? (r.awarded as Record<string, unknown>) : {}
  for (const [k, when] of Object.entries(raw)) if (isDate(str(when))) awarded[k] = str(when)
  return { branch, awarded, ...(opt(r.pinned) ? { pinned: str(r.pinned) } : {}) }
}

function normGoal(v: unknown, drop: Drop): Goal | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  return {
    id,
    name: str(r.name, 'Цель'),
    icon: str(r.icon, 'target'),
    color: str(r.color, '#4cc46a'),
    targetAmount: Math.abs(money(r.targetAmount)),
    ...(isDate(str(r.targetDate)) ? { targetDate: str(r.targetDate) } : {}),
    accountId: opt(r.accountId),
    saved: money(r.saved),
    priority: Math.round(num(r.priority, 1)),
    note: opt(r.note),
    ...(bool(r.done) ? { done: true } : {}),
  }
}

function normScenario(v: unknown, drop: Drop): Scenario | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  return {
    id,
    name: str(r.name, 'Сценарий'),
    incomeFactor: num(r.incomeFactor, 1),
    adjusts: list(r.adjusts)
      .map((a) => {
        const x = asRaw(a)
        const categoryId = str(x.categoryId)
        return categoryId ? { categoryId, factor: num(x.factor, 1) } : null
      })
      .filter((a): a is { categoryId: string; factor: number } => !!a),
    events: list(r.events)
      .map((e) => {
        const x = asRaw(e)
        const eid = str(x.id)
        return eid && isDate(str(x.date))
          ? { id: eid, date: str(x.date), title: str(x.title), amount: money(x.amount) }
          : null
      })
      .filter((e): e is { id: string; date: string; title: string; amount: Money } => !!e),
    extraSavingsMonthly: money(r.extraSavingsMonthly),
    note: opt(r.note),
  }
}

function normRule(v: unknown, drop: Drop): ImportRule | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) {
    drop.n++
    return null
  }
  return { id, match: str(r.match), categoryId: str(r.categoryId), tags: strList(r.tags) }
}

function normNode(v: unknown): CanvasNode | null {
  const r = asRaw(v)
  const id = str(r.id)
  if (!id) return null
  return {
    id,
    type: oneOf(r.type, NODE_KINDS, 'text'),
    x: num(r.x),
    y: num(r.y),
    width: Math.max(20, num(r.width, 260)),
    height: Math.max(20, num(r.height, 140)),
    ...(opt(r.color) ? { color: str(r.color) } : {}),
    ...(typeof r.text === 'string' ? { text: r.text } : {}),
    ...(opt(r.file) ? { file: str(r.file) } : {}),
    ...(opt(r.ref) ? { ref: str(r.ref) } : {}),
    ...(typeof r.label === 'string' ? { label: r.label } : {}),
    ...(opt(r.fit) ? { fit: oneOf(r.fit, ['fixed', 'scale', 'shrink', 'grow'] as const, 'fixed') } : {}),
    ...(r.fontSize == null ? {} : { fontSize: num(r.fontSize, 16) }),
    ...(r.options && typeof r.options === 'object' ? { options: r.options as Record<string, unknown> } : {}),
  }
}

function normEdge(v: unknown): CanvasEdge | null {
  const r = asRaw(v)
  const id = str(r.id)
  const fromNode = str(r.fromNode)
  const toNode = str(r.toNode)
  if (!id || !fromNode || !toNode) return null
  return {
    id,
    fromNode,
    toNode,
    fromSide: oneOf<Side>(r.fromSide, SIDES, 'right'),
    toSide: oneOf<Side>(r.toSide, SIDES, 'left'),
    ...(opt(r.color) ? { color: str(r.color) } : {}),
    ...(typeof r.label === 'string' ? { label: r.label } : {}),
    ...(opt(r.arrow) ? { arrow: oneOf(r.arrow, ['end', 'both', 'none'] as const, 'end') } : {}),
    ...(bool(r.flow) ? { flow: true } : {}),
  }
}

function normCanvas(v: unknown): CanvasDoc {
  const r = asRaw(v)
  const nodes = list(r.nodes).map(normNode).filter((n): n is CanvasNode => !!n)
  const ids = new Set(nodes.map((n) => n.id))
  return {
    nodes,
    // Ребро в никуда рисовать нечем: концы должны существовать.
    edges: list(r.edges)
      .map(normEdge)
      .filter((e): e is CanvasEdge => !!e && ids.has(e.fromNode) && ids.has(e.toNode)),
    ...(opt(r.cardStyle) ? { cardStyle: oneOf(r.cardStyle, ['rich', 'minimal', 'flat'] as const, 'rich') } : {}),
    ...(strList(r.quickColors).length ? { quickColors: strList(r.quickColors) } : {}),
  }
}

// ------------------------------------------------------------- имена файлов

// Windows не даёт этих символов в именах, а заметки и доски — это файлы.
const FORBIDDEN = /[\\/:*?"<>|]/g
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

export function safeFileName(name: string): string {
  const cleaned = name
    .replace(FORBIDDEN, '_')
    // Управляющие символы: в файловой системе им тоже не место.
    .split('')
    .filter((ch) => ch.charCodeAt(0) > 31)
    .join('')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 100)
  if (!cleaned) return 'Без названия'
  return RESERVED.test(cleaned) ? cleaned + '_' : cleaned
}

const isSafeAttachment = (rel: string): boolean =>
  /^attachments\/[^\\/]+$/.test(rel) && !rel.includes('..') && safeFileName(rel.slice(12)) === rel.slice(12)

// ------------------------------------------------------------------ разбор

export type ParseResult =
  | { ok: true; archive: Archive; dropped: number }
  | { ok: false; error: string }

/** Читает файл архива: проверяет формат и приводит содержимое к нужному виду. */
export function parseArchive(text: string): ParseResult {
  // Блокнот и часть выгрузок дописывают метку порядка байтов — JSON.parse
  // на ней спотыкается, поэтому снимаем её молча.
  const clean = text.replace(/^﻿/, '').trim()
  if (!clean) return { ok: false, error: 'Файл пустой' }

  let raw: unknown
  try {
    raw = JSON.parse(clean)
  } catch {
    return { ok: false, error: 'Файл повреждён: внутри не JSON' }
  }

  const r = asRaw(raw)
  if (r.kashel !== 'vault') {
    return { ok: false, error: 'Это не архив Кошеля — в файле нет его признака' }
  }
  const format = num(r.formatVersion, 0)
  if (format > ARCHIVE_FORMAT) {
    return { ok: false, error: `Файл сделан более новой версией программы (формат ${format}) — обновите Кошель` }
  }

  const d = asRaw(r.data)
  const drop: Drop = { n: 0 }
  const data: VaultData = {
    version: Math.max(1, Math.round(num(d.version, 1))),
    accounts: list(d.accounts).map((x) => normAccount(x, drop)).filter((x): x is Account => !!x),
    categories: list(d.categories).map((x) => normCategory(x, drop)).filter((x): x is Category => !!x),
    transactions: list(d.transactions).map((x) => normTransaction(x, drop)).filter((x): x is Transaction => !!x),
    recurring: list(d.recurring).map((x) => normRecurring(x, drop)).filter((x): x is Recurring => !!x),
    reminders: list(d.reminders).map((x) => normReminder(x, drop)).filter((x): x is Reminder => !!x),
    tasks: list(d.tasks).map((x) => normTask(x, drop)).filter((x): x is Task => !!x),
    taskLists: list(d.taskLists).map((x) => normTaskList(x, drop)).filter((x): x is TaskList => !!x),
    honors: normHonors(d.honors),
    goals: list(d.goals).map((x) => normGoal(x, drop)).filter((x): x is Goal => !!x),
    scenarios: list(d.scenarios).map((x) => normScenario(x, drop)).filter((x): x is Scenario => !!x),
    importRules: list(d.importRules).map((x) => normRule(x, drop)).filter((x): x is ImportRule => !!x),
    settings: migrateSettings(asRaw(d.settings) as Partial<Settings>),
  }

  const notes: Record<string, string> = {}
  for (const [name, body] of Object.entries(asRaw(r.notes))) {
    if (typeof body === 'string') notes[safeFileName(name)] = body
  }

  const canvases: Record<string, CanvasDoc> = {}
  for (const [name, doc] of Object.entries(asRaw(r.canvases))) {
    canvases[safeFileName(name)] = normCanvas(doc)
  }

  const attachments: Record<string, string> = {}
  for (const [rel, b64] of Object.entries(asRaw(r.attachments))) {
    if (typeof b64 === 'string' && isSafeAttachment(rel)) attachments[rel] = b64
    else drop.n++
  }

  const archive: Archive = {
    kashel: 'vault',
    formatVersion: format || ARCHIVE_FORMAT,
    app: str(r.app, 'Кошель'),
    exportedAt: str(r.exportedAt),
    counts: {
      transactions: data.transactions.length,
      accounts: data.accounts.length,
      categories: data.categories.length,
      recurring: data.recurring.length,
      reminders: data.reminders.length,
      tasks: data.tasks.length,
      goals: data.goals.length,
      scenarios: data.scenarios.length,
      notes: Object.keys(notes).length,
      canvases: Object.keys(canvases).length,
      attachments: Object.keys(attachments).length,
    },
    data,
    notes,
    canvases,
    attachments,
  }

  if (!data.accounts.length && !data.transactions.length && !archive.counts.notes && !archive.counts.canvases) {
    return { ok: false, error: 'В архиве нет ни одной записи — открывать нечего' }
  }
  return { ok: true, archive, dropped: drop.n }
}

// --------------------------------------------------------------- раскладка

export interface ApplyReport {
  notes: number
  canvases: number
  attachments: number
  /** Имена, которые не удалось записать: чаще всего запрещённые в системе. */
  failed: string[]
}

/**
 * Раскладывает заметки, доски и вложения по хранилищу. Операции и справочники
 * сюда не входят: их пишет само хранилище через store, одной транзакцией.
 */
export async function applyArchive(a: Archive): Promise<ApplyReport> {
  const report: ApplyReport = { notes: 0, canvases: 0, attachments: 0, failed: [] }

  const write = async (rel: string, body: string, label: string, ok: () => void) => {
    try {
      await bridge.write(rel, body)
      ok()
    } catch {
      report.failed.push(label)
    }
  }

  await Promise.all([
    ...Object.entries(a.notes).map(([name, body]) =>
      write(notePath(name), body, name, () => report.notes++),
    ),
    ...Object.entries(a.canvases).map(([name, doc]) =>
      write(canvasPath(name), JSON.stringify(doc, null, 2), name, () => report.canvases++),
    ),
    ...Object.entries(a.attachments).map(async ([rel, b64]) => {
      try {
        await bridge.writeBinary(rel, b64)
        report.attachments++
      } catch {
        report.failed.push(rel)
      }
    }),
  ])

  return report
}
