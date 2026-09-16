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
import { addDays, addMonths, parseISO, today } from '../lib/date'
import { creditRemaining } from './stats'
import { датыПлатежей, планъПлатежа, этоПлатёжПо, type ПланъПлатежа } from './credit'

export const уведомленія = (data: VaultData): Notice[] => data.notifications ?? []
/**
 * Ждущие ответа. Уведомление по кредиту, у которого напоминание выключили,
 * который убрали в архив или удалили, больше не висит на колокольчике.
 */
export const ждущія = (data: VaultData): Notice[] =>
  уведомленія(data)
    .filter((n) => n.status === 'pending')
    .filter((n) => {
      const acc = data.accounts.find((a) => a.id === n.accountId)
      return !!acc && !acc.archived && !!acc.credit?.remind
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))

/**
 * Очистить историю. Чтобы отвеченные дни не вернулись следующей проверкой,
 * напоминание у кредита сдвигается на день после последнего отвеченного.
 */
export function очиститьИсторію(data: VaultData): VaultData {
  const послѣдній = new Map<string, string>()
  for (const n of уведомленія(data)) {
    if (n.status === 'pending') continue
    if ((послѣдній.get(n.accountId) ?? '') < n.dueDate) послѣдній.set(n.accountId, n.dueDate)
  }
  return {
    ...data,
    notifications: уведомленія(data).filter((n) => n.status === 'pending'),
    accounts: data.accounts.map((a) => {
      const день = послѣдній.get(a.id)
      if (!день || !a.credit) return a
      const съ = addDays(день, 1)
      return (a.credit.remindFrom ?? '') >= съ ? a : { ...a, credit: { ...a.credit, remindFrom: съ } }
    }),
  }
}

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
    const дни = датыПлатежей(c, now)
    /*
     * Какие дни уже оплачены. Каждый внесённый платёж закрывает один день —
     * ближайший к нему (не дальше 25 дней). Так платёж с опозданием
     * закрывает свой месяц, а не следующий, а внесённый заранее — свой, а не
     * прошлый. Ближайший будущий день тоже в счёт: платёж за октябрь,
     * внесённый в начале октября, не должен закрыть сентябрь.
     */
    const кандидаты = датыПлатежей(c, addMonths(now, 1))
    const платежи = data.transactions.filter((t) => этоПлатёжПо(acc, t)).map((t) => t.date).sort()
    const оплачены = new Set<string>()
    const разница = (a: string, b: string) => Math.abs(parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000
    for (const п of платежи) {
      const ближайшій = кандидаты
        .filter((д) => !оплачены.has(д) && разница(д, п) <= 25)
        .sort((x, y) => разница(x, п) - разница(y, п))[0]
      if (ближайшій) оплачены.add(ближайшій)
    }
    дни.forEach((день) => {
      if (день < съ || есть.has(acc.id + '@' + день) || оплачены.has(день)) return
      итогъ.push({
        id: 'n_' + acc.id + '_' + день,
        kind: 'credit_payment',
        accountId: acc.id,
        dueDate: день,
        amount: Math.min(c.monthlyPayment, долгъ),
        createdAt: new Date().toISOString(),
        status: 'pending',
      })
    })
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
