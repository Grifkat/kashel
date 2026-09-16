/*
 * Уведомления: платёж по кредиту в его день.
 *
 * У кредита с галочкой «Напоминать» программа в день платежа заводит
 * уведомление и ждёт ответа. «Платёж прошёл» записывает операции по тем же
 * правилам, что и кнопка «Внести платёж» (engine/credit), «Не прошёл» просто
 * закрывает вопрос. Ответ остаётся в истории.
 *
 * Уведомление за день, на который платёж уже внесён руками, не заводится:
 * спрашивать о том, что человек и так записал, — лишнее.
 */
import type { Money, Notice, VaultData } from '../lib/types'
import { addDays, today } from '../lib/date'
import { creditRemaining } from './stats'
import { датыПлатежей, планъПлатежа, этоПлатёжПо, type ПланъПлатежа } from './credit'

export const уведомленія = (data: VaultData): Notice[] => data.notifications ?? []
export const ждущія = (data: VaultData): Notice[] =>
  уведомленія(data).filter((n) => n.status === 'pending').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))

/**
 * Какие уведомления пора завести на сегодня. Возвращает только новые — те,
 * которых ещё нет в хранилище (ни ждущих, ни отвеченных).
 */
export function новыеУведомления(data: VaultData, now: string = today()): Notice[] {
  const есть = new Set(уведомленія(data).map((n) => n.accountId + '@' + n.dueDate))
  const итогъ: Notice[] = []
  for (const acc of data.accounts) {
    const c = acc.credit
    if (acc.archived || acc.type !== 'credit' || !c?.remind || !(c.monthlyPayment > 0)) continue
    const долгъ = creditRemaining(acc, data.transactions)
    if (долгъ <= 0) continue
    const съ = c.remindFrom ?? now
    for (const день of датыПлатежей(c, now)) {
      if (день < съ || есть.has(acc.id + '@' + день)) continue
      // Платёж за этот период уже внесён — между прошлым днём платежа и этим.
      const прошлый = addDays(день, -27)
      if (data.transactions.some((t) => этоПлатёжПо(acc, t) && t.date > прошлый && t.date <= день)) continue
      итогъ.push({
        id: 'n_' + acc.id + '_' + день,
        kind: 'credit_payment',
        accountId: acc.id,
        dueDate: день,
        amount: Math.min(c.monthlyPayment, долгъ),
        createdAt: new Date().toISOString(),
        status: 'pending',
      })
    }
  }
  return итогъ
}

/**
 * Ответ «платёж прошёл»: план операций и уведомление в новом виде.
 * null — план не сложился (нет суммы, платят с самого кредита).
 */
export function подтвердитьПлатёж(
  data: VaultData,
  n: Notice,
  p: { счётъ: string; сумма: Money; дата?: string },
): { планъ: ПланъПлатежа; уведомленіе: (txIds: string[]) => Notice } | null {
  const кредитъ = data.accounts.find((a) => a.id === n.accountId)
  if (!кредитъ) return null
  const планъ = планъПлатежа({ кредитъ, счётъ: p.счётъ, сумма: p.сумма, дата: p.дата ?? n.dueDate, data })
  if (!планъ) return null
  return {
    планъ,
    уведомленіе: (txIds) => ({ ...n, status: 'paid', resolvedAt: new Date().toISOString(), txIds, amount: p.сумма }),
  }
}

export const отклонить = (n: Notice): Notice => ({ ...n, status: 'skipped', resolvedAt: new Date().toISOString() })
