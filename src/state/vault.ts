import type { CanvasDoc, Transaction, VaultData } from '../lib/types'
import { monthKey } from '../lib/date'

// Обёртка над файловым API Electron. В обычном браузере (vite без Electron)
// подменяется на localStorage, чтобы интерфейс можно было открыть и без сборки.
interface Bridge {
  vaultPath(): Promise<string>
  chooseVault(): Promise<string | null>
  revealVault(): Promise<unknown>
  read(rel: string): Promise<string | null>
  write(rel: string, data: string): Promise<boolean>
  remove(rel: string): Promise<boolean>
  rename(from: string, to: string): Promise<boolean>
  list(rel: string, ext?: string): Promise<string[]>
  writeBinary(rel: string, base64: string): Promise<string>
  readBinary(rel: string): Promise<string | null>
  openText(filters?: unknown): Promise<{ name: string; text: string } | null>
  saveText(name: string, text: string, opts?: SaveTextOpts): Promise<string | null>
  openImage(): Promise<{ name: string; base64: string } | null>
  openSound(): Promise<{ name: string; base64: string } | null>
  /** Настройки оболочки: трей и язык встроенного выбора даты. */
  shellPrefs?(prefs: { tray?: boolean; dateFormat?: 'ru' | 'us' }): Promise<boolean>

  // Ниже — только рабочий стол: меню «Файл», двойной клик по .kashel и связь
  // расширения с программой. В браузере всего этого нет, поэтому необязательны.
  pendingArchive?(): Promise<ExternalFile | null>
  readArchive?(file: string): Promise<ExternalFile | null>
  onFileCommand?(cb: (e: FileCommand) => void): () => void
  assocStatus?(): Promise<AssocStatus>
  assocSet?(): Promise<boolean>
  assocClear?(): Promise<boolean>

  /*
   * Обновление. Проверка и установка разделены нарочно: программа не
   * скачивает ничего сама, решение всегда за человѣкомъ.
   */
  updateCheck?(): Promise<Находка>
  updatePending?(): Promise<{ версія: string; находка: Находка | null }>
  updateInstall?(находка: Находка): Promise<{ путь: string; действіе: string }>
  onUpdate?(cb: (e: СобытіеОбновленія) => void): () => void
}

/** Что известно о версии на хостинге. */
export interface Находка {
  version: string
  date: string
  notes: string
  url: string
  sha256: string
  size: number
  /** Версия действительно новее нынешней. */
  есть: boolean
  текущая: string
}

export type СобытіеОбновленія =
  | { kind: 'progress'; было: number; всего: number }
  | { kind: 'found'; находка: Находка }
  /** Пункт «Проверить обновление» в меню «Вид». */
  | { kind: 'menu' }

/** Файл за пределами хранилища: архив, с которым программу запустили. */
export interface ExternalFile {
  name: string
  path: string
  text: string
}

export type FileCommand =
  | { kind: 'file'; file: string }
  | { kind: 'open' }
  | { kind: 'save' }

export interface AssocStatus {
  /** Связь расширений умеет только Windows. */
  supported: boolean
  linked: boolean
  /** Связь ведёт на прежнее расположение программы — её надо переставить. */
  stale?: boolean
  command?: string | null
}

/** Метка порядка байтов нужна только выгрузке в CSV, архиву она ломает разбор. */
export interface SaveTextOpts {
  bom?: boolean
  filters?: { name: string; extensions: string[] }[]
}

const LS_PREFIX = 'kashel:'

const browserBridge: Bridge = {
  vaultPath: async () => 'localStorage (браузерный режим)',
  chooseVault: async () => null,
  revealVault: async () => null,
  read: async (rel) => localStorage.getItem(LS_PREFIX + rel),
  write: async (rel, data) => {
    localStorage.setItem(LS_PREFIX + rel, data)
    return true
  },
  remove: async (rel) => {
    localStorage.removeItem(LS_PREFIX + rel)
    return true
  },
  rename: async (from, to) => {
    const v = localStorage.getItem(LS_PREFIX + from)
    if (v == null) return false
    localStorage.setItem(LS_PREFIX + to, v)
    localStorage.removeItem(LS_PREFIX + from)
    return true
  },
  list: async (rel, ext) =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX + rel + '/'))
      .map((k) => k.slice((LS_PREFIX + rel + '/').length))
      .filter((n) => !ext || n.endsWith(ext)),
  writeBinary: async (rel, base64) => {
    localStorage.setItem(LS_PREFIX + rel, base64)
    return rel
  },
  readBinary: async (rel) => {
    const v = localStorage.getItem(LS_PREFIX + rel)
    return v ? `data:image/png;base64,${v}` : null
  },
  openText: async () => null,
  saveText: async (name, text) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    return name
  },
  openImage: async () => null,
  openSound: async () => null,
}

export const bridge: Bridge =
  (typeof window !== 'undefined' && (window as unknown as { kashel?: Bridge }).kashel) || browserBridge

export const isDesktop = typeof window !== 'undefined' && !!(window as unknown as { kashel?: Bridge }).kashel

const DATA_FILE = 'data.json'
const txFile = (mk: string) => `transactions/${mk}.json`

/**
 * Читает JSON хранилища.
 *
 * Битый файл — это ОТКАЗ, а не «пусто». Прежний молчаливый откат к пустому
 * значению вёл к худшему исходу, какой в этой программе вообще возможен:
 * loadVault отдавал null, загрузка решала «хранилище новое» и записывала
 * поверх пустые справочники, а через пять минут полное автосохранение звало
 * saveTransactions с пустым набором месяцев — а пустой набор по договору
 * означает «переписать все и подчистить лишние файлы». Вся история операций
 * стиралась. Достаточно было одной временной ошибки чтения от антивируса
 * или облачной синхронизации.
 */
async function readJSON<T>(rel: string): Promise<T | null> {
  const raw = await bridge.read(rel)
  if (raw == null || raw === '') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error('Файл хранилища испорчен и не читается: ' + rel)
  }
}

const writeJSON = (rel: string, value: unknown) => bridge.write(rel, JSON.stringify(value, null, 2))

/**
 * Читает справочники + все помесячные файлы операций.
 *
 * null означает ровно одно: хранилище пустое — ни справочников, ни месяцев.
 * Любая другая беда вылетает исключением, потому что вызывающая сторона
 * трактует null как «заводим новое» и пишет поверх.
 *
 * Заодно чинится случай «data.json удалили руками, а месяцы остались»:
 * раньше до списка файлов дело просто не доходило.
 */
export async function loadVault(): Promise<Partial<VaultData> | null> {
  const core = await readJSON<Partial<VaultData>>(DATA_FILE)
  const files = await bridge.list('transactions', '.json')
  if (!core && !files.length) return null
  const chunks = await Promise.all(
    files.sort().map(async (f) => (await readJSON<Transaction[]>(`transactions/${f}`)) ?? []),
  )
  return { ...(core ?? {}), transactions: chunks.flat() }
}

export async function saveCore(data: VaultData): Promise<void> {
  const { transactions, ...core } = data
  await writeJSON(DATA_FILE, core)
}

/**
 * Переписывает только затронутые месяцы. Пустой набор означает полное
 * сохранение: тогда заодно подчищаются файлы месяцев, из которых удалили
 * последнюю операцию, — иначе они бы вернулись при следующей загрузке.
 */
export async function saveTransactions(
  transactions: Transaction[],
  touchedMonths: Set<string>,
): Promise<void> {
  const byMonth = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const mk = monthKey(t.date)
    let arr = byMonth.get(mk)
    if (!arr) byMonth.set(mk, (arr = []))
    arr.push(t)
  }

  let months: Set<string>
  if (touchedMonths.size) {
    months = touchedMonths
  } else {
    months = new Set(byMonth.keys())
    const existing = await bridge.list('transactions', '.json')
    for (const f of existing) months.add(f.replace(/\.json$/, ''))
  }

  await Promise.all(
    [...months].map((mk) => {
      const list = byMonth.get(mk)
      if (!list || !list.length) return bridge.remove(txFile(mk))
      list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      return writeJSON(txFile(mk), list)
    }),
  )
}

// ------------------------------------------------------------- заметки
export const notePath = (title: string) => `notes/${title}.md`

export async function listNotes(): Promise<string[]> {
  const files = await bridge.list('notes', '.md')
  return files.map((f) => f.replace(/\.md$/, '')).sort((a, b) => a.localeCompare(b, 'ru'))
}

export const readNote = (title: string) => bridge.read(notePath(title))
export const writeNote = (title: string, body: string) => bridge.write(notePath(title), body)
export const deleteNote = (title: string) => bridge.remove(notePath(title))
export const renameNote = (from: string, to: string) => bridge.rename(notePath(from), notePath(to))

// ------------------------------------------------------------- канвасы
export const canvasPath = (name: string) => `canvas/${name}.canvas`

export async function listCanvases(): Promise<string[]> {
  const files = await bridge.list('canvas', '.canvas')
  return files.map((f) => f.replace(/\.canvas$/, '')).sort((a, b) => a.localeCompare(b, 'ru'))
}

export async function readCanvas(name: string): Promise<CanvasDoc | null> {
  const raw = await bridge.read(canvasPath(name))
  if (!raw) return null
  try {
    const doc = JSON.parse(raw) as CanvasDoc
    // Оформление доски и её быстрые цвета — часть документа наравне с узлами:
    // они пишутся при каждой правке, и терять их при чтении нельзя.
    return {
      nodes: doc.nodes || [],
      edges: doc.edges || [],
      ...(doc.cardStyle ? { cardStyle: doc.cardStyle } : {}),
      ...(doc.quickColors?.length ? { quickColors: doc.quickColors } : {}),
    }
  } catch {
    return null
  }
}

export const writeCanvas = (name: string, doc: CanvasDoc) =>
  bridge.write(canvasPath(name), JSON.stringify(doc, null, 2))

export const deleteCanvas = (name: string) => bridge.remove(canvasPath(name))
export const renameCanvas = (from: string, to: string) =>
  bridge.rename(canvasPath(from), canvasPath(to))

/** Стирает заметки и канвасы — используется полной очисткой хранилища. */
export async function wipeSpaceFiles(): Promise<void> {
  const notes = await bridge.list('notes', '.md')
  const canvases = await bridge.list('canvas', '.canvas')
  await Promise.all([
    ...notes.map((f) => bridge.remove(`notes/${f}`)),
    ...canvases.map((f) => bridge.remove(`canvas/${f}`)),
  ])
}

// ------------------------------------------------------------- вложения
export async function saveAttachment(name: string, base64: string): Promise<string> {
  const safe = name.replace(/[^\wа-яА-ЯёЁ.\-]/g, '_')
  const rel = `attachments/${Date.now().toString(36)}_${safe}`
  await bridge.writeBinary(rel, base64)
  return rel
}

/** Пути всех вложений хранилища. Временные файлы атомарной записи пропускаем. */
export async function listAttachments(): Promise<string[]> {
  const files = await bridge.list('attachments')
  return files.filter((f) => !f.endsWith('.tmp')).map((f) => `attachments/${f}`)
}

/** Голый base64 без префикса data-url — в таком виде вложение едет в архив. */
export async function readAttachmentBase64(rel: string): Promise<string | null> {
  const url = await bridge.readBinary(rel)
  if (!url) return null
  const at = url.indexOf('base64,')
  return at < 0 ? null : url.slice(at + 7)
}

export async function wipeAttachments(): Promise<void> {
  const files = await listAttachments()
  await Promise.all(files.map((f) => bridge.remove(f)))
}
