/*
 * Правка тегов по всему хранилищу.
 *
 * Тег живёт не отдельной записью, а строкой внутри каждой операции. Поэтому
 * опечатку («ройка» вместо «тройка») нельзя поправить в одном месте — её надо
 * пройти по всем операциям и регулярным правилам. Логика отдельно от окна:
 * её проверяет самопроверка.
 */
import type { VaultData } from '../lib/types'
import { monthKey } from '../lib/date'

/** Тег так, как его хранит программа: без решётки и пробелов по краям. */
export const чистыйТег = (s: string): string => s.trim().replace(/^#+/, '').trim()

/** Все теги с числом операций, где они стоят, — частые впереди. */
export function всеТеги(data: VaultData): { тег: string; сколько: number }[] {
  const м = new Map<string, number>()
  for (const t of data.transactions) for (const тег of t.tags) м.set(тег, (м.get(тег) ?? 0) + 1)
  return [...м.entries()]
    .map(([тег, сколько]) => ({ тег, сколько }))
    .sort((a, b) => b.сколько - a.сколько || a.тег.localeCompare(b.тег))
}

/**
 * Переименовать тег везде. Пустое новое имя — удалить тег.
 *
 * Если новое имя уже стоит на операции, дубль не появляется: «ройка» и
 * «тройка» на одной операции сливаются в одну «тройку». Возвращает месяцы,
 * где операции поменялись, — хранилище перепишет только их.
 */
export function переименоватьТег(
  data: VaultData,
  было: string,
  стало: string,
): { transactions: VaultData['transactions']; recurring: VaultData['recurring']; месяцы: string[]; операций: number } {
  const новое = чистыйТег(стало)
  const месяцы = new Set<string>()
  let операций = 0
  const замѣнить = (tags: string[]): string[] | null => {
    if (!tags.includes(было)) return null
    const итогъ: string[] = []
    for (const т of tags) {
      const н = т === было ? новое : т
      if (н && !итогъ.includes(н)) итогъ.push(н)
    }
    return итогъ
  }
  const transactions = data.transactions.map((t) => {
    const tags = замѣнить(t.tags)
    if (!tags) return t
    операций++
    месяцы.add(monthKey(t.date))
    return { ...t, tags }
  })
  const recurring = data.recurring.map((r) => {
    const tags = замѣнить(r.tags)
    return tags ? { ...r, tags } : r
  })
  return { transactions, recurring, месяцы: [...месяцы], операций }
}
