/*
 * Резервные копии хранилища.
 *
 * Копия — обычный архив .kashel (см. engine/archive) в папке backups/
 * внутри хранилища: открыть её можно и кнопкой «Вернуть», и через «Файл» →
 * «Открыть…». Вид копии записан в начале имени файла — по нему список
 * подписывает копии и подчищает ежедневные, не читая сами файлы.
 *
 * Копии делаются только в программе на компьютере: в браузере хранилище
 * живёт в localStorage, и полный архив на каждый день его переполнил бы.
 */
import type { VaultData } from '../lib/types'
import { archiveText, buildArchive } from '../engine/archive'
import { bridge, isDesktop } from './vault'
import { EN } from '../i18n/en'
import { т, тк } from '../i18n'

export type ВидКопии = 'daily' | 'update' | 'wipe' | 'restore' | 'load' | 'manual'

export const ПАПКА_КОПИЙ = 'backups'
/** Сколько ежедневных копий держать. Прочие виды редкие — они не подчищаются. */
export const ЕЖЕДНЕВНЫХ_ХРАНИТЬ = 14

const ВИДЫ: Record<ВидКопии, string> = {
  daily: тк('ежедневная'),
  update: тк('перед обновлением'),
  wipe: тк('перед очисткой'),
  restore: тк('перед возвратом'),
  load: тк('до-загрузки'),
  manual: тк('вручную'),
}

/** Подпись вида копии на текущем языке. */
export const подписьВида = (вид: ВидКопии): string => т(ВИДЫ[вид])

const два = (n: number) => String(n).padStart(2, '0')
export const деньКопии = (d: Date) => `${d.getFullYear()}-${два(d.getMonth() + 1)}-${два(d.getDate())}`

/** Путь новой копии: «backups/ежедневная 2026-09-17 10-05-00.kashel». */
export function имяКопии(вид: ВидКопии, d = new Date()): string {
  return `${ПАПКА_КОПИЙ}/${подписьВида(вид)} ${деньКопии(d)} ${два(d.getHours())}-${два(d.getMinutes())}-${два(d.getSeconds())}.kashel`
}

export interface Копия {
  /** Путь внутри хранилища. */
  путь: string
  файл: string
  /** Вид, если имя узнано; копии прежних версий и чужие файлы — без вида. */
  вид?: ВидКопии
  /** Подпись из имени файла — как есть. */
  подпись: string
  когда: Date
  день: string
  размер?: number
}

/**
 * Разбор имени копии. Вид узнаётся на обоих языках: копию, сделанную в
 * английском режиме, русский режим тоже узнаёт — и наоборот.
 */
export function разобратьИмяКопии(файл: string): Копия | null {
  const м = файл.match(/^(.+) (\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})\.kashel$/)
  if (!м) return null
  const [, подпись, г, мес, д, ч, мин, с] = м
  const когда = new Date(+г, +мес - 1, +д, +ч, +мин, +с)
  if (Number.isNaN(когда.getTime())) return null
  const вид = (Object.keys(ВИДЫ) as ВидКопии[]).find((в) => подпись === ВИДЫ[в] || подпись === EN[ВИДЫ[в]])
  return { путь: `${ПАПКА_КОПИЙ}/${файл}`, файл, вид, подпись, когда, день: `${г}-${мес}-${д}` }
}

/** Копии новыми вперёд. Посторонние файлы в папке пропускаются. */
export function упорядочитьКопии(файлы: { name: string; size?: number }[]): Копия[] {
  const out: Копия[] = []
  for (const ф of файлы) {
    const к = разобратьИмяКопии(ф.name)
    if (к) out.push({ ...к, размер: ф.size })
  }
  return out.sort((a, b) => b.когда.getTime() - a.когда.getTime())
}

/** Ежедневные копии сверх нормы — старейшие. */
export function лишниеЕжедневные(копии: Копия[], оставить = ЕЖЕДНЕВНЫХ_ХРАНИТЬ): Копия[] {
  return копии
    .filter((к) => к.вид === 'daily')
    .sort((a, b) => b.когда.getTime() - a.когда.getTime())
    .slice(оставить)
}

/** Копии пишутся прямо в папку хранилища на диске, а не в облако и не в браузер. */
export const копииДоступны = (): boolean =>
  isDesktop && bridge === (window as unknown as { kashel?: unknown }).kashel

export async function списокКопий(): Promise<Копия[]> {
  if (!копииДоступны()) return []
  const файлы = bridge.listInfo
    ? await bridge.listInfo(ПАПКА_КОПИЙ)
    : (await bridge.list(ПАПКА_КОПИЙ, '.kashel')).map((name) => ({ name, size: undefined }))
  return упорядочитьКопии(файлы)
}

/** Сделать копию и подчистить лишние ежедневные. Возвращает путь копии. */
export async function сделатьКопию(data: VaultData, вид: ВидКопии, когда = new Date()): Promise<string> {
  const путь = имяКопии(вид, когда)
  await bridge.write(путь, archiveText(await buildArchive(data)))
  if (вид === 'daily') {
    try {
      for (const к of лишниеЕжедневные(await списокКопий())) await bridge.remove(к.путь)
    } catch {
      // Не подчистилось — не беда: копия уже лежит, лишняя подождёт до завтра.
    }
  }
  return путь
}

/** Ежедневная копия, если за сегодня её ещё нет. Возвращает путь или null. */
export async function ежедневнаяКопия(data: VaultData, сейчас = new Date()): Promise<string | null> {
  if (!копииДоступны()) return null
  const день = деньКопии(сейчас)
  const есть = (await списокКопий()).some((к) => к.вид === 'daily' && к.день === день)
  if (есть) return null
  return сделатьКопию(data, 'daily', сейчас)
}
