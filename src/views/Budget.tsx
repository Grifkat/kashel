import React, { useMemo, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { Icon } from '../lib/icons'
import { money, moneyShort, pct, plural } from '../lib/format'
import { addMonths, daysInMonth, monthKey, monthTitle, parseISO, today } from '../lib/date'
import { categoryTotals, median } from '../engine/stats'
import { StackBar } from '../components/charts'
import { Avatar, MoneyInput, Tbl, useToast } from '../components/ui'
import type { Bucket, Category, Money } from '../lib/types'
import { личное } from '../engine/project'
import { т, тр } from '../i18n'

const BUCKET_TITLE: Record<Bucket, string> = { needs: т('Надо'), wants: т('Хочу'), savings: т('В будущее') }
const BUCKET_COLOR: Record<Bucket, string> = { needs: '#4aa3e8', wants: '#e8833a', savings: '#4cc46a' }
const TARGET: Record<Bucket, number> = { needs: 50, wants: 30, savings: 20 }

export default function Budget() {
  const app = useApp()
  const { data, upsertCategory } = useStore()
  const { fc } = useAnalytics(data)
  const toast = useToast()
  const [anchor, setAnchor] = useState(today())
  const [planner, setPlanner] = useState(false)

  const mk = monthKey(anchor)
  const isCurrent = mk === monthKey(today())
  const d = parseISO(today())
  const progress = isCurrent ? d.getDate() / daysInMonth(d.getFullYear(), d.getMonth()) : 1

  // Бюджет ведётся по своим деньгам: проектные траты идут по своей смѣтѣ.
  const личн = личное(data)
  const monthTx = useMemo(() => личн.transactions.filter((t) => monthKey(t.date) === mk), [личн.transactions, mk])
  const spentByCat = useMemo(
    () => new Map(categoryTotals(monthTx, 'expense').map((t) => [t.categoryId, t.amount])),
    [monthTx],
  )
  const income = monthTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = monthTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)

  const cats = data.categories.filter((c) => c.kind === 'expense' && !c.archived)
  const planned = cats.reduce((s, c) => s + (c.plan ?? 0), 0)

  const byBucket = useMemo(() => {
    const out: Record<Bucket, Money> = { needs: 0, wants: 0, savings: 0 }
    for (const c of cats) out[c.bucket ?? 'wants'] += spentByCat.get(c.id) ?? 0
    return out
  }, [cats, spentByCat])

  const baseIncome = income || fc.avgIncome
  const shares: Record<Bucket, number> = {
    needs: baseIncome ? (byBucket.needs / baseIncome) * 100 : 0,
    wants: baseIncome ? (byBucket.wants / baseIncome) * 100 : 0,
    savings: baseIncome ? ((baseIncome - expense) / baseIncome) * 100 : 0,
  }

  const rows = cats
    .map((c) => {
      const spent = spentByCat.get(c.id) ?? 0
      const projected = Math.round(spent / Math.max(0.05, progress))
      return { c, spent, projected, plan: c.plan ?? 0 }
    })
    .sort((a, b) => (b.plan || b.spent) - (a.plan || a.spent))

  /** Автоплан: обязательное по факту, «хочу» ужимаем до ориентира, остаток — в цели. */
  const autoPlan = () => {
    const target = fc.avgIncome
    if (!target) {
      toast(т('Недостаточно истории доходов для автоплана'))
      return
    }
    const keys = fc.bases
    let changed = 0
    for (const c of cats) {
      const base = keys.find((b) => b.categoryId === c.id)
      if (!base) continue
      const norm = base.median + base.fixed
      if (norm <= 0) continue
      const factor = c.bucket === 'wants' ? 0.85 : 1
      const plan = Math.max(10000, Math.round((norm * factor) / 10000) * 10000)
      if (c.plan !== plan) {
        upsertCategory({ ...c, plan })
        changed++
      }
    }
    toast(т('Лимиты пересобраны: {0} {1}', changed, plural(changed, 'категория', 'категории', 'категорий')))
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Бюджет')}</h1>
          <div className="view-sub">{т('Лимиты по категориям и раскладка дохода')}</div>
        </div>
        <div className="row">
          <button className="icon-btn" onClick={() => setAnchor((a) => addMonths(a, -1))}>
            <Icon name="left" size={15} />
          </button>
          <span className="strong" style={{ minWidth: 150, textAlign: 'center' }}>{monthTitle(mk)}</span>
          <button className="icon-btn" onClick={() => setAnchor((a) => addMonths(a, 1))}>
            <Icon name="right" size={15} />
          </button>
          <button className="btn" onClick={autoPlan} title={т('Пересчитать лимиты по вашей истории')}>
            <Icon name="sparkle" size={15} /> {т(' Автоплан')}</button>
        </div>
      </div>

      {/* ---------------------------------------------------- 50/30/20 */}
      <div className="grid c2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title"><Icon name="scale" size={14} /> {т(' Раскладка дохода')}</div>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Доход за месяц')}</span>
              <span className="v amount in"><span className="sign">+</span>{money(income)}</span>
              {!income && <span className="d faint">{тр('беру средний: {0}', money(fc.avgIncome))}</span>}
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Расход')}</span>
              <span className="v amount out"><span className="sign">−</span>{money(expense)}</span>
              {isCurrent && <span className="d faint">{тр('по темпу {0}', money(Math.round(expense / Math.max(0.05, progress))))}</span>}
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Остаётся')}</span>
              <span className={'v ' + (baseIncome - expense >= 0 ? 'pos' : 'neg')}>{money(baseIncome - expense, { sign: true })}</span>
            </div>
          </div>
          <StackBar
            height={16}
            slices={[
              { label: т('Надо'), value: byBucket.needs, color: BUCKET_COLOR.needs },
              { label: т('Хочу'), value: byBucket.wants, color: BUCKET_COLOR.wants },
              { label: т('В будущее'), value: Math.max(0, baseIncome - expense), color: BUCKET_COLOR.savings },
            ]}
          />
          <div className="row" style={{ marginTop: 12, gap: 16 }}>
            {(['needs', 'wants', 'savings'] as Bucket[]).map((b) => {
              const cur = shares[b]
              const diff = cur - TARGET[b]
              return (
                <div key={b} style={{ flex: 1 }}>
                  <div className="row small" style={{ gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: BUCKET_COLOR[b] }} />
                    <span>{BUCKET_TITLE[b]}</span>
                  </div>
                  <div className="num strong" style={{ fontSize: 17 }}>{pct(cur)}</div>
                  <div className={'small ' + (Math.abs(diff) < 5 ? 'faint' : diff > 0 && b !== 'savings' ? 'neg' : 'pos')}>
                    {тр('ориентир {0}% · {1}{2} п.п.', TARGET[b], diff > 0 ? '+' : '', Math.round(diff))}</div>
                </div>
              )
            })}
          </div>
          <div className="faint small" style={{ marginTop: 10, lineHeight: 1.55 }}>
            {т('50/30/20 — не закон, а быстрый способ увидеть перекос. Если «надо» стабильно выше 60%, бюджет негибкий: в плохой месяц резать будет нечего.')}</div>
        </div>

        <div className="card">
          <div className="card-title"><Icon name="target" size={14} /> {т(' Сколько уже расписано')}</div>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Сумма лимитов')}</span>
              <span className="v">{money(planned)}</span>
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Без лимита')}</span>
              <span className="v">{cats.filter((c) => !c.plan).length}</span>
              <span className="d faint">{т('категорий')}</span>
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Свободно от лимитов')}</span>
              <span className={'v ' + (baseIncome - planned >= 0 ? 'pos' : 'neg')}>{money(baseIncome - planned, { sign: true })}</span>
            </div>
          </div>
          {planned > baseIncome && baseIncome > 0 && (
            <div className="advice-card warn" style={{ padding: '10px 12px' }}>
              {тр('Сумма лимитов на {0} больше типичного дохода. Такой план невыполним по определению — либо лимиты завышены, либо доход должен вырасти.', money(planned - baseIncome))}</div>
          )}
          <div className="row" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn sm" onClick={() => app.openTab('goals')}>
              <Icon name="target" size={13} /> {т(' Цели')}</button>
            <button className="btn sm" onClick={() => app.openTab('advice')}>
              <Icon name="bulb" size={13} /> {т(' Что можно улучшить')}</button>
            <button className="btn sm" onClick={() => app.openTab('forecast')}>
              <Icon name="chart" size={13} /> {т(' Прогноз')}</button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- лимиты */}
      <div className="card">
        <div className="card-title"><Icon name="list" size={14} /> {т(' Категории и лимиты')}</div>
        <Tbl>
          <thead>
            <tr>
              <th>{т('Категория')}</th>
              <th className="col-opt">{т('Роль')}</th>
              <th className="r">{т('Потрачено')}</th>
              {isCurrent && <th className="r col-opt">{т('Прогноз месяца')}</th>}
              <th className="r">{т('Лимит')}</th>
              <th className="w-impl">{т('Исполнение')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, spent, projected, plan }) => {
              const use = plan ? (isCurrent ? projected : spent) / plan : 0
              const over = plan > 0 && use > 1
              return (
                <tr key={c.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar icon={c.icon} color={c.color} size="sm" />
                      <span
                        style={{ cursor: 'pointer' }}
                        onClick={() => app.openTab('transactions', 'cat:' + c.id, { title: c.name })}
                      >
                        {c.name}
                      </span>
                    </div>
                  </td>
                  <td className="col-opt">
                    <span className="badge" style={{ background: `color-mix(in srgb, ${BUCKET_COLOR[c.bucket ?? 'wants']} 20%, transparent)`, color: BUCKET_COLOR[c.bucket ?? 'wants'] }}>
                      {BUCKET_TITLE[c.bucket ?? 'wants']}
                    </span>
                  </td>
                  <td className="r num">{money(spent)}</td>
                  {isCurrent && (
                    <td className={'r num col-opt ' + (over ? 'neg' : '')}>{plan || spent ? money(projected) : '—'}</td>
                  )}
                  <td className="r">
                    <MoneyInput
                      className="num in-plan"
                      value={plan || undefined}
                      placeholder="—"
                      onChange={(v, empty) => upsertCategory({ ...c, plan: empty ? undefined : v })}
                    />
                  </td>
                  <td>
                    {plan ? (
                      <>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${Math.min(100, use * 100)}%`,
                              background: over ? 'var(--alert)' : use > 0.85 ? 'var(--warn)' : c.color,
                            }}
                          />
                        </div>
                        <div className={'small ' + (over ? 'neg' : 'faint')} style={{ marginTop: 3 }}>
                          {over ? т('перерасход {0}', money((isCurrent ? projected : spent) - plan)) : т('{0}% лимита', Math.round(use * 100))}
                        </div>
                      </>
                    ) : (
                      <span className="faint small">{т('лимит не задан')}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Tbl>
      </div>
    </div>
  )
}
