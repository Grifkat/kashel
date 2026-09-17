/*
 * Возврат удалённого — для кнопки «Отменить».
 *
 * Возвращаем точечно, а не снимком всего хранилища: за секунды до нажатия
 * человек мог успеть записать что-то ещё, и откат снимком стёр бы это.
 * Запись встаёт на прежнее место в списке — порядок категорий и счетов
 * виден в интерфейсе.
 */
import type { Account, Category, Recurring, Transaction, VaultData } from '../lib/types'
import { monthKey } from '../lib/date'

/** Вставить запись на прежнее место, если её там ещё нет. */
export function вставитьНазад<T extends { id: string }>(список: T[], запись: T, место: number): T[] {
  if (список.some((x) => x.id === запись.id)) return список
  const i = Math.max(0, Math.min(место, список.length))
  return [...список.slice(0, i), запись, ...список.slice(i)]
}

export interface СнимокКатегории {
  категория: Category
  место: number
  /** Подкатегории, которые при удалении стали главными. */
  дети: string[]
}

export const снимокКатегории = (d: VaultData, id: string): СнимокКатегории | null => {
  const место = d.categories.findIndex((c) => c.id === id)
  if (место < 0) return null
  return {
    категория: d.categories[место],
    место,
    дети: d.categories.filter((c) => c.parentId === id && c.id !== id).map((c) => c.id),
  }
}

/** Категория возвращается, а её бывшие подкатегории — снова под неё (если их не перенесли). */
export function вернутьКатегорию(d: VaultData, с: СнимокКатегории): VaultData {
  const дети = new Set(с.дети)
  const categories = вставитьНазад(d.categories, с.категория, с.место).map((c) =>
    дети.has(c.id) && !c.parentId ? { ...c, parentId: с.категория.id } : c,
  )
  return { ...d, categories }
}

export interface СнимокСчёта {
  счёт: Account
  место: number
  /** Регулярные правила, которые удаление выключило. */
  правила: string[]
}

export const снимокСчёта = (d: VaultData, id: string): СнимокСчёта | null => {
  const место = d.accounts.findIndex((a) => a.id === id)
  if (место < 0) return null
  return {
    счёт: d.accounts[место],
    место,
    правила: d.recurring.filter((r) => r.active && (r.accountId === id || r.toAccountId === id)).map((r) => r.id),
  }
}

export function вернутьСчёт(d: VaultData, с: СнимокСчёта): VaultData {
  const правила = new Set(с.правила)
  return {
    ...d,
    accounts: вставитьНазад(d.accounts, с.счёт, с.место),
    recurring: d.recurring.map((r) => (правила.has(r.id) && !r.active ? { ...r, active: true } : r)),
  }
}

type Списочные = 'goals' | 'recurring' | 'reminders' | 'tasks'

export interface СнимокЗаписи<K extends Списочные = Списочные> {
  ключ: K
  запись: VaultData[K][number]
  место: number
}

export function снимокЗаписи<K extends Списочные>(d: VaultData, ключ: K, id: string): СнимокЗаписи<K> | null {
  const список = d[ключ] as { id: string }[]
  const место = список.findIndex((x) => x.id === id)
  if (место < 0) return null
  return { ключ, запись: список[место] as VaultData[K][number], место }
}

export function вернутьЗапись<K extends Списочные>(d: VaultData, с: СнимокЗаписи<K>): VaultData {
  const список = d[с.ключ] as unknown as { id: string }[]
  return { ...d, [с.ключ]: вставитьНазад(список, с.запись as { id: string }, с.место) } as VaultData
}

export interface СнимокТега {
  тег: string
  /** Где тег стоял и на каком месте. */
  операции: { id: string; место: number; месяц: string }[]
  правила: { id: string; место: number }[]
}

export function снимокТега(d: VaultData, тег: string): СнимокТега {
  const где = <T extends { id: string; tags: string[] }>(x: T) => ({ id: x.id, место: x.tags.indexOf(тег) })
  return {
    тег,
    операции: d.transactions.filter((t) => t.tags.includes(тег)).map((t) => ({ ...где(t), месяц: monthKey(t.date) })),
    правила: d.recurring.filter((r) => r.tags.includes(тег)).map(где),
  }
}

const тегНаМесто = (tags: string[], тег: string, место: number): string[] =>
  tags.includes(тег) ? tags : [...tags.slice(0, место), тег, ...tags.slice(место)]

/** Тег возвращается на те операции и правила, где стоял. */
export function вернутьТег(d: VaultData, с: СнимокТега): VaultData {
  const оп = new Map(с.операции.map((x) => [x.id, x.место]))
  const пр = new Map(с.правила.map((x) => [x.id, x.место]))
  return {
    ...d,
    transactions: d.transactions.map((t: Transaction) => (оп.has(t.id) ? { ...t, tags: тегНаМесто(t.tags, с.тег, оп.get(t.id)!) } : t)),
    recurring: d.recurring.map((r: Recurring) => (пр.has(r.id) ? { ...r, tags: тегНаМесто(r.tags, с.тег, пр.get(r.id)!) } : r)),
  }
}
