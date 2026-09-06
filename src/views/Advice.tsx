import React, { useMemo, useState } from 'react'
import { Reveal } from '../components/effects'
import { useApp, type ViewId } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { Icon } from '../lib/icons'
import { money, pct, uid } from '../lib/format'
import { categoryMonthly, median } from '../engine/stats'
import { historyKeys } from '../engine/forecast'
import { adviceKindTitle, type Advice, type AdviceKind, type Severity } from '../engine/advice'
import { useToast } from '../components/ui'
import { личное } from '../engine/project'

const SEV_ICON: Record<Severity, string> = { alert: 'warn', warn: 'warn', info: 'bulb', good: 'check' }
const KIND_ICON: Record<AdviceKind, string> = {
  cut: 'minus', income: 'arrowUp', budget: 'scale', risk: 'shield', debt: 'credit', goal: 'target',
}
const KINDS: AdviceKind[] = ['cut', 'income', 'budget', 'risk', 'debt', 'goal']

export default function AdviceView() {
  const app = useApp()
  const { data, upsertScenario, upsertCategory } = useStore()
  const { advice, fc } = useAnalytics(data)
  const toast = useToast()
  const [kind, setKind] = useState<AdviceKind | 'all'>('all')

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  // Разборъ — по своимъ деньгамъ, ровно как и сами советы.
  const личн = личное(data)
  const keys = useMemo(() => historyKeys(личн.transactions, 12), [личн.transactions])

  const list = kind === 'all' ? advice : advice.filter((a) => a.kind === kind)
  const totalImpact = advice.reduce((s, a) => s + a.impactMonthly, 0)
  const counts = KINDS.map((k) => ({ k, n: advice.filter((a) => a.kind === k).length }))

  const apply = (a: Advice) => {
    const act = a.action
    if (!act) return
    if (act.type === 'goto') {
      app.openTab(act.payload.view as ViewId, act.payload.filter as string | undefined)
      return
    }
    if (act.type === 'plan') {
      const ids = act.payload.categoryIds as string[]
      let n = 0
      for (const id of ids) {
        const c = catById.get(id)
        if (!c) continue
        const hist = categoryMonthly(личн.transactions, id, keys, false, c.kind).filter((v) => v > 0)
        const norm = median(hist)
        if (!norm) continue
        upsertCategory({ ...c, plan: Math.ceil(norm / 50000) * 50000 })
        n++
      }
      toast(`Лимиты проставлены: ${n}`)
      app.openTab('budget')
      return
    }
    // Сценарий: собираем из совета и открываем прогноз.
    const p = act.payload as Record<string, unknown>
    const adjusts: { categoryId: string; factor: number }[] = []
    if (typeof p.categoryId === 'string') adjusts.push({ categoryId: p.categoryId, factor: Number(p.factor ?? 1) })
    if (typeof p.categoryName === 'string') {
      const c = data.categories.find((x) => x.name === p.categoryName)
      if (c) adjusts.push({ categoryId: c.id, factor: Number(p.factor ?? 1) })
    }
    if (p.auto === 'save') {
      // Автосценарий: режем необязательные категории пропорционально, пока не наберём нужную сумму.
      const target = Number(p.target ?? 0)
      const wants = fc.bases
        .filter((b) => b.kind === 'expense' && catById.get(b.categoryId)?.bucket === 'wants')
        .sort((x, y) => y.base - x.base)
      let need = target
      for (const b of wants) {
        if (need <= 0) break
        const cut = Math.min(b.base * 0.5, need)
        if (cut < 10000) continue
        adjusts.push({ categoryId: b.categoryId, factor: Math.max(0, 1 - cut / Math.max(1, b.base)) })
        need -= cut
      }
      if (need > 0) toast(`За счёт необязательных трат набирается не всё: не хватает ${money(need)}`)
    }
    const sc = {
      id: uid('sc'),
      name: 'Из совета: ' + a.title.slice(0, 40),
      incomeFactor: Number(p.incomeFactor ?? 1),
      adjusts,
      events: [],
      extraSavingsMonthly: 0,
      note: a.title,
    }
    upsertScenario(sc)
    toast('Сценарий создан — открываю прогноз')
    app.openTab('forecast')
  }

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Советы</h1>
          <div className="view-sub">
            Считается локально по вашей истории. Суммарный потенциал найденного —{' '}
            <b className="pos">{money(totalImpact)} в месяц</b> ({money(totalImpact * 12)} в год)
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
        <span className={'chip' + (kind === 'all' ? ' on' : '')} onClick={() => setKind('all')}>
          Все ({advice.length})
        </span>
        {counts.map(({ k, n }) => (
          <span key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
            {adviceKindTitle(k)} ({n})
          </span>
        ))}
      </div>

      {!list.length && (
        <div className="empty">
          В этой группе замечаний нет — по имеющимся данным всё в порядке.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((a, i) => (
          <Reveal key={a.id} delay={Math.min(i, 6) * 0.045} className={'advice-card ' + a.severity}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <span
                className="avatar"
                style={{
                  background: `color-mix(in srgb, var(--${a.severity === 'alert' ? 'alert' : a.severity === 'warn' ? 'warn' : a.severity === 'good' ? 'good' : 'info'}) 20%, transparent)`,
                  marginTop: 2,
                }}
              >
                <Icon name={SEV_ICON[a.severity]} size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <h3 className="advice-title" style={{ margin: 0 }}>{a.title}</h3>
                  <span className="badge">{adviceKindTitle(a.kind)}</span>
                  {a.impactMonthly > 0 && (
                    <span className="badge good">≈ {money(a.impactMonthly)}/мес</span>
                  )}
                  <span className="badge">усилия: {a.effort}</span>
                </div>
                <div className="advice-body" style={{ marginTop: 6 }}>{a.body}</div>
                {a.evidence.length > 0 && (
                  <div className="advice-ev">
                    {a.evidence.map((e, i) => (
                      <div key={i}>{e}</div>
                    ))}
                  </div>
                )}
                {a.action && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn sm" onClick={() => apply(a)}>
                      <Icon name={a.action.type === 'goto' ? 'arrowRight' : 'play'} size={13} /> {a.action.label}
                    </button>
                    {a.impactMonthly > 0 && (
                      <span className="faint small">
                        за 5 лет это {money(a.impactMonthly * 60)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="advice-card info" style={{ marginTop: 20 }}>
        <div className="advice-title">Как это считается</div>
        <div className="advice-body">
          Никаких обращений в интернет: движок берёт ваши операции, строит по каждой категории
          устойчивую норму (медиана последних месяцев), тренд и разброс, сверяет текущий темп с этой нормой
          и проверяет два десятка правил — от забытых подписок до концентрации дохода в одном источнике.
          Цифры в советах — это ваши же деньги, пересчитанные в месячный и годовой масштаб;
          именно в нём мелкие регулярные траты становятся заметными.
        </div>
      </div>
    </div>
  )
}
