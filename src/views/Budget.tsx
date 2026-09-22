import React, { useMemo, useRef, useState } from 'react'
import { useДеньги } from '../components/anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { useAnalytics } from '../state/analytics'
import { Icon } from '../lib/icons'
import { money, moneyShort, pct, plural } from '../lib/format'
import { addMonths, daysInMonth, monthKey, monthTitle, parseISO, today } from '../lib/date'
import { categoryTotals, median } from '../engine/stats'
import { StackBar } from '../components/charts'
import { Avatar, Confirm, MoneyInput, Tbl, useToast } from '../components/ui'
import { ДиапазонДат } from '../components/DiapazonDat'
import { ПЕРИОДЫ_ЛИМИТА, заПериод, исполнениеЛимита, лимитВМесяц, периодЛимита, потраченоЗа, type ВидПериода } from '../engine/limity'
import { ОТМЕНА_МС } from '../components/Udalenie'
import type { Bucket, Category, Money, ПериодЛимита } from '../lib/types'
import { личное } from '../engine/project'
import { т, тр } from '../i18n'
import { родитель, подкатегории } from '../engine/podkategorii'

const BUCKET_TITLE: Record<Bucket, string> = { needs: т('Надо'), wants: т('Хочу'), savings: т('В будущее') }
const BUCKET_COLOR: Record<Bucket, string> = { needs: '#4aa3e8', wants: '#e8833a', savings: '#4cc46a' }
const TARGET: Record<Bucket, number> = { needs: 50, wants: 30, savings: 20 }

/**
 * Цвет полосы по заполнению лимита: пусто — зелёный, к концу — красный,
 * через жёлтый и оранжевый. Перерасход — тревожный красный.
 */
export function цветЗаполнения(доля: number): string {
  if (доля > 1) return 'var(--alert)'
  const оттенок = Math.round(140 * (1 - Math.max(0, Math.min(1, доля))))
  return `hsl(${оттенок}, 68%, 48%)`
}

/**
 * «Исполнение» — по фактически потраченному. Прогноз по темпу месяца —
 * только подсказкой: платёж раз в месяц (интернет, аренда) темпом не
 * тратится, и пугать перерасходом, которого нет, нельзя.
 */
function Исполнение({ spent, projected, plan, isCurrent, money, период }: {
  spent: Money
  projected: Money
  plan: Money
  isCurrent: boolean
  money: (v: Money) => string
  /** Период лимита: у немесячного подпись говорит, за что считается. */
  период?: ПериодЛимита
}) {
  const заЧто = период && период.kind !== 'month' ? ' ' + заПериод(период) : ''
  const доля = plan ? spent / plan : 0
  const сверх = spent > plan
  const темпСверх = isCurrent && !сверх && projected > plan
  return (
    <>
      <div className="bar-track">
        <div
          className="bar-fill budget-bar"
          style={{ width: `${Math.min(100, доля * 100)}%`, background: цветЗаполнения(доля) }}
        />
      </div>
      <div className={'small ' + (сверх ? 'neg' : 'faint')} style={{ marginTop: 3 }}>
        {сверх ? т('перерасход {0}', money(spent - plan)) + заЧто : т('{0}% лимита', Math.round(доля * 100)) + заЧто}
        {!сверх && заЧто && <div className="budget-ostatok">{т('осталось {0}', money(plan - spent))}</div>}
        {темпСверх && <div className="budget-tempo">{т('по темпу — {0}', money(projected))}</div>}
      </div>
    </>
  )
}

export default function Budget() {
  // Суммы на экране — с учётом «Скрывать баланс».
  const money = useДеньги()
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
  /*
   * Траты и прогноз по каждой категории считает engine/limity — за отрезок
   * периода её лимита (месяц, квартал, год, всё время, свои даты). Прогноз —
   * по темпу, и одна-две операции темпом не тратятся: это разовый платёж.
   */
  const income = monthTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = monthTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)

  const cats = data.categories.filter((c) => c.kind === 'expense' && !c.archived)
  /*
   * Строки бюджета — главные категории; лимит главной покрывает и её
   * подкатегории. Подкатегории идут под главной и могут иметь свой лимит
   * внутри общего. Если у главной лимита нет, в общий план идут лимиты
   * её подкатегорий.
   */
  const главные = cats.filter((c) => !родитель(c, data.categories))
  const детиГлавной = (id: string) => подкатегории(id, data.categories)
  // Сумма лимитов — в пересчёте на месяц: её сравнивают с месячным доходом.
  // Лимит «за всё время» на месяц не делится и в сумму не идёт.
  const вМесяц = (c: Category) => лимитВМесяц(c, data.categories) ?? 0
  const planned = главные.reduce(
    (s, c) => s + (c.plan ? вМесяц(c) : детиГлавной(c.id).reduce((x, д) => x + вМесяц(д), 0)),
    0,
  )
  const безМесяца = cats.filter((c) => c.plan && лимитВМесяц(c, data.categories) === null).length

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

  /*
   * Порядок строк замирает, пока в строке вводят лимит: сортировка по лимиту
   * переставляла строку на каждом нажатии («1» — вниз, «15000» — вверх), и
   * поле уезжало из-под пальцев.
   */
  const [правимъ, setПравимъ] = useState<string | null>(null)
  const порядокъ = useRef<string[]>([])
  const исп = (c: Category) => исполнениеЛимита(c, data.categories, личн.transactions, anchor)
  const своиГлавной = (c: Category, от: string, до: string) =>
    потраченоЗа(c, data.categories, личн.transactions, от, до).сумма -
    детиГлавной(c.id).reduce((x, д) => x + потраченоЗа(д, data.categories, личн.transactions, от, до).сумма, 0)
  const посчитанные = главные.map((c) => {
    const и = исп(c)
    return { c, spent: и.потрачено, projected: и.прогноз, plan: c.plan ?? 0, и }
  })
  if (!правимъ) {
    порядокъ.current = [...посчитанные].sort((a, b) => (b.plan || b.spent) - (a.plan || a.spent)).map((r) => r.c.id)
  }
  const мѣсто = (id: string) => {
    const i = порядокъ.current.indexOf(id)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const rows = [...посчитанные].sort((a, b) => мѣсто(a.c.id) - мѣсто(b.c.id))

  /** Автоплан: обязательное по факту, «хочу» ужимаем до ориентира, остаток — в цели. */
  const autoPlan = () => {
    const target = fc.avgIncome
    if (!target) {
      toast(т('Недостаточно истории доходов для автоплана'))
      return
    }
    const keys = fc.bases
    let changed = 0
    // Лимит ставим главным — по норме всей семьи; свои лимиты подкатегорий не трогаем.
    for (const c of главные) {
      const свои = [c.id, ...детиГлавной(c.id).map((д) => д.id)]
      const bases = keys.filter((b) => свои.includes(b.categoryId))
      if (!bases.length) continue
      const norm = bases.reduce((s, b) => s + b.median + b.fixed, 0)
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
              <span className="d faint">{безМесяца ? т('в месяц; без {0} «за всё время»', безМесяца) : т('в месяц')}</span>
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <span className="l">{т('Без лимита')}</span>
              <span className="v">{главные.filter((c) => !c.plan).length}</span>
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
        <div className="row wrap budget-limits-head">
          <div className="card-title" style={{ margin: 0, flex: 1 }}><Icon name="list" size={14} /> {т(' Категории и лимиты')}</div>
          <ПериодДляВсех />
        </div>
        <Tbl>
          <thead>
            <tr>
              <th>{т('Категория')}</th>
              <th className="col-opt">{т('Роль')}</th>
              <th className="r">{т('Потрачено')}</th>
              {isCurrent && <th className="r col-opt" title={т('К концу периода лимита, по темпу трат')}>{т('Прогноз')}</th>}
              <th className="r">{т('Лимит')}</th>
              <th className="w-impl">{т('Исполнение')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap(({ c, spent, projected, plan, и }) => {
              const over = plan > 0 && spent > plan
              const темп = isCurrent && plan > 0 && projected > plan
              const дети = детиГлавной(c.id)
              return [
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
                    <td className={'r num col-opt ' + (over ? 'neg' : темп ? 'budget-tempo' : '')}>{plan || spent ? money(projected) : '—'}</td>
                  )}
                  <td className="r">
                    <MoneyInput
                      className="num in-plan"
                      value={plan || undefined}
                      placeholder="—"
                      onFocus={() => setПравимъ(c.id)}
                      onBlur={() => setПравимъ(null)}
                      onChange={(v, empty) => upsertCategory({ ...c, plan: empty ? undefined : v })}
                    />
                    {plan > 0 && <ПериодВСтроке c={c} />}
                  </td>
                  <td>
                    {plan ? (
                      <Исполнение spent={spent} projected={projected} plan={plan} isCurrent={isCurrent} money={money} период={и.п} />
                    ) : (
                      <span className="faint small">
                        {дети.some((д) => д.plan) ? т('лимиты только у подкатегорий') : т('лимит не задан')}</span>
                    )}
                  </td>
                </tr>,
                ...(дети.length && своиГлавной(c, и.от, и.до) > 0
                  ? [
                      <tr key={c.id + ':own'} className="budget-pod">
                        <td>
                          <span className="faint">{т('{0} — без подкатегории', c.name)}</span>
                        </td>
                        <td className="col-opt" />
                        <td className="r num">{money(своиГлавной(c, и.от, и.до))}</td>
                        {isCurrent && <td className="col-opt" />}
                        <td />
                        <td />
                      </tr>,
                    ]
                  : []),
                ...дети.map((д) => {
                  const ди = исп(д)
                  const дПотрачено = ди.потрачено
                  const дПрогноз = ди.прогноз
                  const дПлан = д.plan ?? 0
                  const дСверх = дПлан > 0 && дПотрачено > дПлан
                  const дТемп = isCurrent && дПлан > 0 && дПрогноз > дПлан
                  return (
                    <tr key={д.id} className="budget-pod">
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <Avatar icon={д.icon} color={д.color} size="sm" />
                          <span
                            style={{ cursor: 'pointer' }}
                            title={т('Подкатегория «{0}»', c.name)}
                            onClick={() => app.openTab('transactions', 'cat:' + д.id, { title: д.name })}
                          >
                            {д.name}
                          </span>
                        </div>
                      </td>
                      <td className="col-opt" />
                      <td className="r num">{money(дПотрачено)}</td>
                      {isCurrent && (
                        <td className={'r num col-opt ' + (дСверх ? 'neg' : дТемп ? 'budget-tempo' : '')}>{дПлан || дПотрачено ? money(дПрогноз) : '—'}</td>
                      )}
                      <td className="r">
                        <MoneyInput
                          className="num in-plan"
                          value={дПлан || undefined}
                          placeholder="—"
                          title={т('Свой лимит подкатегории — внутри лимита главной')}
                          onFocus={() => setПравимъ(д.id)}
                          onBlur={() => setПравимъ(null)}
                          onChange={(v, empty) => upsertCategory({ ...д, plan: empty ? undefined : v })}
                        />
                        {дПлан > 0 && <ПериодВСтроке c={д} главная={c} />}
                      </td>
                      <td>
                        {дПлан ? (
                          <Исполнение spent={дПотрачено} projected={дПрогноз} plan={дПлан} isCurrent={isCurrent} money={money} период={ди.п} />
                        ) : (
                          <span className="faint small">{т('в общем лимите')}</span>
                        )}
                      </td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </Tbl>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ период лимита

const подписьПериода = (п: ПериодЛимита): string =>
  п.kind === 'custom' && п.from && п.to
    ? т('свой: {0}–{1}', `${п.from.slice(8, 10)}.${п.from.slice(5, 7)}`, `${п.to.slice(8, 10)}.${п.to.slice(5, 7)}`)
    : ПЕРИОДЫ_ЛИМИТА.find((x) => x.k === п.kind)?.кратко ?? ''

/**
 * Период лимита — маленьким списком под суммой: без новой колонки, чтобы
 * таблица не раздувалась. У подкатегории первый пункт — «как у главной».
 */
function ПериодВСтроке({ c, главная }: { c: Category; главная?: Category }) {
  const { data, upsertCategory } = useStore()
  const [свой, setСвой] = useState(false)
  const п = периодЛимита(c, data.categories)
  const значение = главная && !c.planPeriod ? 'inherit' : п.kind
  const задать = (v: string) => {
    if (v === 'custom') {
      setСвой(true)
      return
    }
    upsertCategory(v === 'inherit' ? { ...c, planPeriod: undefined } : { ...c, planPeriod: { kind: v as ВидПериода } })
  }
  return (
    <div className="limit-period-wrap">
      <select
        className="limit-period"
        value={значение}
        title={т('За какой период лимит')}
        onChange={(e) => задать(e.target.value)}
      >
        {главная && <option value="inherit">{т('как у главной')}</option>}
        {ПЕРИОДЫ_ЛИМИТА.map((x) => (
          <option key={x.k} value={x.k}>{x.k === 'custom' && п.kind === 'custom' && c.planPeriod ? подписьПериода(п) : x.кратко}</option>
        ))}
      </select>
      {п.kind === 'custom' && c.planPeriod && (
        <button type="button" className="icon-btn limit-period-dates" title={т('Изменить даты')} onClick={() => setСвой(true)}>
          <Icon name="calendar" size={12} />
        </button>
      )}
      {свой && (
        <ДиапазонДат
          from={п.from}
          to={п.to}
          onClose={() => setСвой(false)}
          onPick={(from, to) => {
            upsertCategory({ ...c, planPeriod: { kind: 'custom', from, to } })
            setСвой(false)
          }}
        />
      )}
    </div>
  )
}

/**
 * «Применить ко всем»: один период — всем категориям с лимитом. Сначала
 * спрашиваем, сколько категорий изменится; после — «Вернуть», как у прочих
 * массовых действий.
 */
function ПериодДляВсех() {
  const { data, setData } = useStore()
  const toast = useToast()
  const [вид, setВид] = useState<ВидПериода>('month')
  const [даты, setДаты] = useState<{ from: string; to: string } | null>(null)
  const [выбор, setВыбор] = useState(false)
  const [спросить, setСпросить] = useState(false)
  const сЛимитом = data.categories.filter((c) => c.kind === 'expense' && !c.archived && c.plan)
  const период = (): ПериодЛимита => (вид === 'custom' && даты ? { kind: 'custom', ...даты } : { kind: вид })
  const применить = () => {
    const прежние = new Map(сЛимитом.map((c) => [c.id, c.planPeriod]))
    const п = период()
    setData((d) => ({ ...d, categories: d.categories.map((c) => (прежние.has(c.id) ? { ...c, planPeriod: п.kind === 'month' ? undefined : п } : c)) }))
    toast(т('Период «{0}» — у {1} {2}', ПЕРИОДЫ_ЛИМИТА.find((x) => x.k === вид)?.t ?? '', сЛимитом.length, plural(сЛимитом.length, 'категории', 'категорий', 'категорий')), {
      label: т('Вернуть'),
      onClick: () => setData((d) => ({ ...d, categories: d.categories.map((c) => (прежние.has(c.id) ? { ...c, planPeriod: прежние.get(c.id) } : c)) })),
    }, { duration: ОТМЕНА_МС })
  }
  return (
    <div className="row limit-period-all" style={{ gap: 6, position: 'relative' }}>
      <select
        className="limit-period"
        value={вид}
        title={т('Период для всех лимитов')}
        onChange={(e) => {
          const v = e.target.value as ВидПериода
          setВид(v)
          if (v === 'custom') setВыбор(true)
        }}
      >
        {ПЕРИОДЫ_ЛИМИТА.map((x) => <option key={x.k} value={x.k}>{x.k === 'custom' && даты ? подписьПериода({ kind: 'custom', ...даты }) : x.t}</option>)}
      </select>
      <button
        type="button"
        className="btn sm"
        disabled={!сЛимитом.length || (вид === 'custom' && !даты)}
        onClick={() => setСпросить(true)}
      >
        {т('Применить ко всем')}</button>
      {выбор && (
        <ДиапазонДат
          from={даты?.from}
          to={даты?.to}
          onClose={() => setВыбор(false)}
          onPick={(from, to) => {
            setДаты({ from, to })
            setВыбор(false)
          }}
        />
      )}
      {спросить && (
        <Confirm
          title={т('Один период для всех лимитов')}
          text={т('Период «{0}» получат {1} {2} с лимитом. Суммы лимитов не меняются. Отменить можно сразу после.',
            вид === 'custom' && даты ? подписьПериода(период()) : ПЕРИОДЫ_ЛИМИТА.find((x) => x.k === вид)?.t ?? '',
            сЛимитом.length, plural(сЛимитом.length, 'категория', 'категории', 'категорий'))}
          confirmLabel={т('Применить')}
          onConfirm={() => {
            применить()
            setСпросить(false)
          }}
          onClose={() => setСпросить(false)}
        />
      )}
    </div>
  )
}
