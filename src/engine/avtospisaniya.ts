/*
 * Автосписания регулярных правил.
 *
 * Прежде правило проводилось раз в месяц и только за текущий месяц: платёж
 * на 31-е не проходил в коротких месяцах никогда, пропущенный месяц не
 * догонялся, еженедельное правило срабатывало раз в месяц, а годовое
 * ставилось на первое число, иногда раньше своей даты начала.
 *
 * Теперь у правила считаются настоящие даты, и проводится каждая, что уже
 * наступила. Назад — не дальше трёх месяцев: правило, заведённое давно и
 * ни разу не проводившееся, не должно вывалить год операций разом.
 */
import type { Category, Recurring, Transaction, VaultData } from '../lib/types'
import { планъПлатежа } from './credit'
import { addDays, addMonths, daysInMonth, monthKey, parseISO, today } from '../lib/date'

const ДОГОНЯТЬ_ДНЕЙ = 92

const число = (месяцъ: string, день: number): string => {
  const d = parseISO(месяцъ.slice(0, 7) + '-01')
  return месяцъ.slice(0, 7) + '-' + String(Math.min(Math.max(1, день), daysInMonth(d.getFullYear(), d.getMonth()))).padStart(2, '0')
}

/** Даты срабатывания правила в промежутке [от, до]. */
export function датыПравила(r: Recurring, от: string, до: string): string[] {
  const итогъ: string[] = []
  const конец = r.endDate && r.endDate < до ? r.endDate : до
  const шагъ = Math.max(1, r.interval || 1)
  const push = (д: string) => {
    if (д >= от && д <= конец && д >= r.startDate) итогъ.push(д)
  }
  if (конец < от) return итогъ
  switch (r.freq) {
    case 'daily': {
      let д = r.startDate
      // Прыжком к окрестности «от», чтобы не шагать с начала правила по дню.
      const прошло = Math.max(0, Math.floor((parseISO(от).getTime() - parseISO(д).getTime()) / 86_400_000 / шагъ) - 1)
      д = addDays(д, прошло * шагъ)
      for (let i = 0; i < 400 && д <= конец; i++, д = addDays(д, шагъ)) push(д)
      break
    }
    case 'weekly': {
      let д = r.startDate
      // День недели из правила: первый такой день не раньше начала.
      if (r.weekday != null) {
        const сдвигъ = (r.weekday - parseISO(д).getDay() + 7) % 7
        д = addDays(д, сдвигъ)
      }
      const прошло = Math.max(0, Math.floor((parseISO(от).getTime() - parseISO(д).getTime()) / 86_400_000 / (7 * шагъ)) - 1)
      д = addDays(д, прошло * 7 * шагъ)
      for (let i = 0; i < 100 && д <= конец; i++, д = addDays(д, 7 * шагъ)) push(д)
      break
    }
    case 'yearly': {
      const день = r.dayOfMonth ?? Number(r.startDate.slice(8, 10))
      for (let y = Number(от.slice(0, 4)) - 1; y <= Number(конец.slice(0, 4)); y++) {
        const лѣтъ = y - Number(r.startDate.slice(0, 4))
        if (лѣтъ < 0 || лѣтъ % шагъ) continue
        push(число(`${y}-${r.startDate.slice(5, 7)}`, день))
      }
      break
    }
    case 'monthly':
    default: {
      const день = r.dayOfMonth ?? Number(r.startDate.slice(8, 10))
      let месяцъ = monthKey(от) + '-01'
      for (let i = 0; i < 40 && месяцъ <= конец; i++, месяцъ = addMonths(месяцъ, 1)) {
        const мѣсяцевъ =
          (Number(месяцъ.slice(0, 4)) - Number(r.startDate.slice(0, 4))) * 12 +
          (Number(месяцъ.slice(5, 7)) - Number(r.startDate.slice(5, 7)))
        if (мѣсяцевъ < 0 || мѣсяцевъ % шагъ) continue
        push(число(месяцъ, день))
      }
    }
  }
  return итогъ
}

/**
 * С какого дня проверять правило. Прежняя отметка lastPosted — месяц
 * («2026-09»: месяц проведён), новая lastPostedDate — день.
 */
function начало(r: Recurring, сегодня: string): string {
  const предѣлъ = addDays(сегодня, -ДОГОНЯТЬ_ДНЕЙ)
  let от = r.startDate
  if (r.lastPostedDate) от = addDays(r.lastPostedDate, 1)
  else if (r.lastPosted) от = addMonths(r.lastPosted.slice(0, 7) + '-01', 1)
  return от > предѣлъ ? от : предѣлъ
}

export function провестиАвтосписания(
  data: VaultData,
  сегодня: string = today(),
  новыйId: () => string,
): { data: VaultData; created: Transaction[]; coreChanged: boolean } {
  const created: Transaction[] = []
  const статьи: Category[] = []
  const отмечены = new Set<string>()
  for (const r of data.recurring) {
    if (!r.active || !r.autoPost) continue
    const от = начало(r, сегодня)
    if (от > сегодня) continue
    отмечены.add(r.id)
    const свои = data.transactions.filter((t) => t.recurringId === r.id)
    const дни = new Set(свои.map((t) => t.date))
    const мѣсяцы = new Set(свои.map((t) => monthKey(t.date)))
    const поМѣсяцу = r.freq === 'monthly' || r.freq === 'yearly'
    for (const date of датыПравила(r, от, сегодня)) {
      // Уже есть операция этого правила за этот срок — второй раз не ставим.
      // Месячное и годовое сверяются по месяцу: запись могли передвинуть на
      // другой день, и это всё ещё тот же платёж.
      if (поМѣсяцу ? мѣсяцы.has(monthKey(date)) : дни.has(date)) continue
      // Перевод на кредит — это платёж: расход и погашение считаются по
      // условиям кредита, так же как у платежа, внесённого руками.
      const кредитъ = r.kind === 'transfer'
        ? data.accounts.find((a) => a.id === r.toAccountId && a.type === 'credit' && a.credit)
        : undefined
      if (кредитъ) {
        const планъ = планъПлатежа({
          кредитъ, счётъ: r.accountId, сумма: r.amount, дата: date,
          data: { ...data, categories: [...data.categories, ...статьи], transactions: [...data.transactions, ...created] },
          tags: r.tags, note: r.title,
        })
        if (планъ) {
          for (const с of планъ.статьи) if (!статьи.some((x) => x.id === с.id)) статьи.push(с)
          for (const о of планъ.операціи) created.push({ ...о, id: новыйId(), recurringId: r.id, createdAt: new Date().toISOString() })
          continue
        }
      }
      created.push({
        id: новыйId(),
        kind: r.kind,
        date,
        amount: r.amount,
        accountId: r.accountId,
        toAccountId: r.toAccountId,
        categoryId: r.categoryId,
        tags: r.tags,
        note: r.title,
        recurringId: r.id,
        createdAt: new Date().toISOString(),
      })
    }
  }
  if (!отмечены.size) return { data, created, coreChanged: false }
  return {
    data: {
      ...data,
      transactions: created.length ? [...data.transactions, ...created] : data.transactions,
      categories: статьи.length ? [...data.categories, ...статьи] : data.categories,
      recurring: data.recurring.map((r) =>
        отмечены.has(r.id) ? { ...r, lastPosted: monthKey(сегодня), lastPostedDate: сегодня } : r,
      ),
    },
    created,
    coreChanged: true,
  }
}
