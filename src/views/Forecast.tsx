import React, { useMemo, useState } from 'react'
import { Money, Num } from '../components/anim'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, moneyShort, months as monthsWord, pct, toMinor, uid } from '../lib/format'
import { isCatalogIcon } from '../lib/catalog'
import { addMonths, monthKey, monthTitle, MONTHS_SHORT, today } from '../lib/date'
import { ALL_ACCOUNTS, forecast, scopeToAccount } from '../engine/forecast'
import { LineChart } from '../components/charts'
import { Avatar, Field, Modal, MoneyInput, Tbl, useToast } from '../components/ui'
import type { Scenario, ScenarioEvent } from '../lib/types'

const BASE: Scenario = {
  id: '__base__', name: 'Как есть', incomeFactor: 1, adjusts: [], events: [], extraSavingsMonthly: 0,
}

export default function Forecast() {
  const app = useApp()
  const { data, upsertScenario, deleteScenario } = useStore()
  const toast = useToast()

  const [scenario, setScenario] = useState<Scenario>(BASE)
  const [horizon, setHorizon] = useState(data.settings.forecastHorizon)
  const [saveOpen, setSaveOpen] = useState(false)
  const [accountId, setAccountId] = useState<string>(ALL_ACCOUNTS)

  // Взгляд со стороны выбранного счёта: движок про счета не знает, поэтому
  // ему подаётся проекция данных, а не флаг. См. scopeToAccount.
  const scoped = useMemo(() => scopeToAccount(data, accountId), [data, accountId])
  const oneAccount = scoped !== data

  const catById = useMemo(() => new Map(scoped.categories.map((c) => [c.id, c])), [scoped.categories])

  const base = useMemo(() => forecast(scoped, null, horizon, 400), [scoped, horizon])
  const fc = useMemo(() => forecast(scoped, scenario, horizon, 600), [scoped, scenario, horizon])

  const dirty =
    scenario.incomeFactor !== 1 || scenario.adjusts.some((a) => a.factor !== 1) || scenario.events.length > 0

  const histPoints = base.history
    .filter((h) => h.key < monthKey(today()))
    .slice(-9)
    .map((h, i, arr) => ({
      label: MONTHS_SHORT[Number(h.key.slice(5, 7)) - 1],
      value: 0,
      _key: h.key,
    }))

  // Линия остатка: история фактическая, дальше — прогнозный коридор.
  const points = useMemo(() => {
    const curKey = monthKey(today())
    // Отматываем назад от сегодняшнего остатка — но сначала снимаем итог
    // текущего месяца. Без этого каждая историческая точка оказывалась выше
    // правды ровно на итог незакрытого месяца: приход первого числа поднимал
    // и август, и июль, и лучший месяц рисовался плоской полкой.
    const curNet = base.history.find((h) => h.key === curKey)?.net ?? 0
    const past = base.history
      .filter((h) => h.key < curKey)
      .slice(-6)
    let running = fc.startBalance - curNet
    const back: { label: string; value: number }[] = []
    for (let i = past.length - 1; i >= 0; i--) {
      back.unshift({ label: MONTHS_SHORT[Number(past[i].key.slice(5, 7)) - 1], value: running })
      running -= past[i].net
    }
    const future = fc.months.map((m) => ({
      label: MONTHS_SHORT[Number(m.key.slice(5, 7)) - 1],
      value: m.p50,
      lo: m.p10,
      hi: m.p90,
      forecast: true,
    }))
    return [
      ...back,
      { label: 'сейчас', value: fc.startBalance },
      ...future,
    ]
  }, [base, fc])

  const last = fc.months[fc.months.length - 1]
  const lastBase = base.months[base.months.length - 1]
  const delta = last && lastBase ? last.p50 - lastBase.p50 : 0

  const topCats = useMemo(
    () =>
      fc.bases
        .filter((b) => b.kind === 'expense' && b.base + b.fixed > 0)
        .sort((a, b) => b.base + b.fixed - (a.base + a.fixed))
        .slice(0, 10),
    [fc.bases],
  )

  const setFactor = (categoryId: string, factor: number) =>
    setScenario((s) => ({
      ...s,
      id: s.id === '__base__' ? uid('sc') : s.id,
      adjusts: [...s.adjusts.filter((a) => a.categoryId !== categoryId), { categoryId, factor }],
    }))

  const factorOf = (categoryId: string) => scenario.adjusts.find((a) => a.categoryId === categoryId)?.factor ?? 1

  const monthlySaving = useMemo(() => {
    const baseExp = base.months[0]?.expense ?? 0
    const scExp = fc.months[0]?.expense ?? 0
    const baseInc = base.months[0]?.income ?? 0
    const scInc = fc.months[0]?.income ?? 0
    return baseExp - scExp + (scInc - baseInc)
  }, [base, fc])

  return (
    <div className="view wide">
      <div className="view-head">
        <div>
          <h1 className="view-title">Прогноз</h1>
          <div className="view-sub">
            Тренд по вашей истории плюс известные регулярные платежи. Текущий месяц учтён по
            прожитой части: деньги этого месяца считаются, но растянуть их на полный месяц
            программа не берётся. Коридор — {data.settings.monteCarloRuns}{' '}
            симуляций на фактическом разбросе ваших месяцев.
            {oneAccount && (
              <>
                {' '}Показан один счёт, поэтому переводы на другие ваши счета считаются его
                расходом, а пополнения с них — приходом. На «всех счетах» они по-прежнему не
                учитываются: там перекладывание денег из кармана в карман итог не меняет.
              </>
            )}
          </div>
        </div>
        <div className="row wrap">
          {/* Тот же выбор счёта, что на дашборде. Список, а не переключатель:
              счетов может быть много, и в строку они не влезут. */}
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            style={{ maxWidth: 210 }}
            title="По какому счёту строить прогноз"
          >
            <option value={ALL_ACCOUNTS}>Все счета вместе</option>
            {/* Значок из каталога — это имя вроде «credit-card»: в списке его
                рисовать нечем, и оно печаталось бы текстом рядом с названием.
                Свой смайлик человека показываем как есть. */}
            {data.accounts.filter((a) => !a.archived).map((a) => (
              <option key={a.id} value={a.id}>
                {isCatalogIcon(a.icon) ? '' : a.icon + ' '}{a.name}
              </option>
            ))}
          </select>
          <div className="seg">
            {[6, 12, 24].map((h) => (
              <button key={h} className={horizon === h ? 'on' : ''} onClick={() => setHorizon(h)}>
                {h} мес
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ сценарии */}
      <div className="row wrap" style={{ gap: 7, marginBottom: 14 }}>
        <span className="faint small" style={{ marginRight: 4 }}>Сценарий:</span>
        <span className={'chip' + (scenario.id === '__base__' ? ' on' : '')} onClick={() => setScenario(BASE)}>
          Как есть
        </span>
        {data.scenarios.filter((s) => s.id !== 'sc_base').map((s) => (
          <span key={s.id} className={'chip' + (scenario.id === s.id ? ' on' : '')} onClick={() => setScenario(s)}>
            {s.name}
          </span>
        ))}
        <span className="spacer" />
        {dirty && (
          <>
            <button className="btn sm" onClick={() => setSaveOpen(true)}>
              <Icon name="save" size={13} /> Сохранить сценарий
            </button>
            <button className="btn sm ghost" onClick={() => setScenario(BASE)}>Сбросить</button>
          </>
        )}
      </div>

      {/* ------------------------------------------------------ сводка */}
      <div className="grid c4" style={{ marginBottom: 16 }}>
        <div className="card tight">
          <div className="stat">
            <span className="l">Через {monthsWord(horizon)}</span>
            <span className={'v num ' + (last && last.p50 < 0 ? 'neg' : '')}>{last ? <Money value={last.p50} /> : '—'}</span>
            <span className="d faint">
              {last ? `${moneyShort(last.p10)} … ${moneyShort(last.p90)}` : ''}
              {dirty && delta !== 0 && (
                <span className={delta > 0 ? 'pos' : 'neg'}> · {money(delta, { sign: true })} к базе</span>
              )}
            </span>
          </div>
        </div>
        {/* Плитки показывают прогнозный месяц, а не прошлый: рядом стоят
            «через 12 месяцев» и «риск минуса», которые тоже про будущее и тоже
            слушают сценарий. Пока здесь было прошлое, ползунок двигал линию, а
            плитка под ней не шевелилась. */}
        <div className="card tight">
          <div className="stat">
            <span className="l">Средний месяц</span>
            <span className={'v num ' + (fc.planNet >= 0 ? 'pos' : 'neg')}><Money value={fc.planNet} sign /></span>
            <span className="d faint">
              доход {moneyShort(fc.planIncome)} · расход {moneyShort(fc.planExpense)}
              {!!fc.planEvents && ` · события ${moneyShort(fc.planEvents)}`}
            </span>
          </div>
        </div>
        <div className="card tight">
          <div className="stat">
            <span className="l">Норма сбережений</span>
            <span className={'v num ' + (fc.planSavingsRate >= data.settings.profile.savingsRateTarget ? 'pos' : '')}>
              <Num value={fc.planSavingsRate} digits={1} suffix="%" />
            </span>
            <span className="d faint">цель {pct(data.settings.profile.savingsRateTarget)}</span>
          </div>
        </div>
        <div className="card tight">
          <div className="stat">
            <span className="l">Риск уйти в минус</span>
            <span className={'v num ' + (fc.riskNegative > 0.2 ? 'neg' : fc.riskNegative > 0.05 ? '' : 'pos')}>
              {pct(fc.riskNegative * 100)}
            </span>
            <span className="d faint">
              {fc.firstNegative ? `медиана пробивает ноль в ${monthTitle(fc.firstNegative).toLowerCase()}` : 'медиана держится в плюсе'}
            </span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <Icon name="chart" size={14} /> Остаток на счетах: факт и прогноз
          <span className="spacer" />
          <span className="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>
            закрашено — коридор от 10-го до 90-го процентиля
          </span>
        </div>
        <LineChart points={points} height={280} />
      </div>

      {/* ------------------------------------------------------ что если */}
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title"><Icon name="scale" size={14} /> Что если</div>

          <div style={{ marginBottom: 18 }}>
            <div className="row small" style={{ marginBottom: 4 }}>
              <span className="strong">Доход</span>
              <span className="spacer" />
              <span className={'num ' + (scenario.incomeFactor > 1 ? 'pos' : scenario.incomeFactor < 1 ? 'neg' : 'faint')}>
                {scenario.incomeFactor === 1 ? 'как есть' : pct((scenario.incomeFactor - 1) * 100, 0)}
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={scenario.incomeFactor}
              onChange={(e) =>
                setScenario((s) => ({ ...s, id: s.id === '__base__' ? uid('sc') : s.id, incomeFactor: Number(e.target.value) }))
              }
            />
            <div className="faint small">
              {money(Math.round(fc.avgIncome * scenario.incomeFactor))} в месяц вместо {money(fc.avgIncome)}
            </div>
          </div>

          <div className="card-title">Расходы по категориям</div>
          {topCats.map((b) => {
            const c = catById.get(b.categoryId)
            if (!c) return null
            const f = factorOf(b.categoryId)
            const cur = b.base + b.fixed
            return (
              <div key={b.categoryId} style={{ marginBottom: 12 }}>
                <div className="row small" style={{ marginBottom: 3, gap: 7 }}>
                  <Avatar icon={c.icon} color={c.color} size="sm" />
                  <span>{c.name}</span>
                  <span className="spacer" />
                  <span className="num faint">{money(Math.round(cur * f))}</span>
                  {f !== 1 && (
                    <span className={'num ' + (f < 1 ? 'pos' : 'neg')}>
                      {f < 1 ? '−' : '+'}{money(Math.abs(Math.round(cur * (1 - f))))}
                    </span>
                  )}
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={f}
                  onChange={(e) => setFactor(b.categoryId, Number(e.target.value))}
                />
              </div>
            )
          })}

          <div className="row" style={{ marginTop: 8, gap: 7 }}>
            <span className="chip" onClick={() => topCats.forEach((b) => setFactor(b.categoryId, 0.9))}>Все −10%</span>
            <span
              className="chip"
              onClick={() =>
                topCats
                  .filter((b) => catById.get(b.categoryId)?.bucket === 'wants')
                  .forEach((b) => setFactor(b.categoryId, 0.6))
              }
            >
              «Хочу» −40%
            </span>
            <span className="chip" onClick={() => setScenario((s) => ({ ...s, adjusts: [] }))}>Сбросить расходы</span>
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title"><Icon name="sparkle" size={14} /> Что это даёт</div>
            {!dirty ? (
              <div className="faint" style={{ lineHeight: 1.6 }}>
                Подвигайте ползунки слева — здесь появится разница между сценарием и текущим положением дел:
                сколько это даёт в месяц, в год и как сдвигает точку риска.
              </div>
            ) : (
              <>
                <div className="row" style={{ gap: 22, marginBottom: 12 }}>
                  <div className="stat">
                    <span className="l">В месяц</span>
                    <span className={'v ' + (monthlySaving >= 0 ? 'pos' : 'neg')}>{money(monthlySaving, { sign: true })}</span>
                  </div>
                  <div className="stat">
                    <span className="l">За год</span>
                    <span className={'v ' + (monthlySaving >= 0 ? 'pos' : 'neg')}>{money(monthlySaving * 12, { sign: true })}</span>
                  </div>
                  <div className="stat">
                    <span className="l">Риск минуса</span>
                    <span className="v">{pct(fc.riskNegative * 100)}</span>
                    <span className="d faint">было {pct(base.riskNegative * 100)}</span>
                  </div>
                </div>
                <div className="advice-body">
                  {monthlySaving > 0 ? (
                    <>
                      Такой сценарий высвобождает <b>{money(monthlySaving)}</b> в месяц. За {monthsWord(horizon)}{' '}
                      разница в остатке — <b>{money(delta, { sign: true })}</b>.
                      {/* Сравниваем прогноз со сценарием и прогноз без него.
                          Раньше обе половины брались из прошлого и потому были
                          равны — фраза не показывалась никогда. */}
                      {fc.planSavingsRate > base.planSavingsRate &&
                        ` Норма сбережений поднимается с ${pct(base.planSavingsRate, 1)} до ${pct(fc.planSavingsRate, 1)}.`}
                    </>
                  ) : (
                    <>
                      Сценарий увеличивает траты на <b>{money(Math.abs(monthlySaving))}</b> в месяц.
                      За {monthsWord(horizon)} это <b>{money(delta, { sign: true })}</b> к остатку.
                    </>
                  )}
                </div>
              </>
            )}

            <div className="card-title" style={{ marginTop: 16 }}>Разовые события</div>
            {scenario.events.map((e) => (
              <div key={e.id} className="row" style={{ gap: 7, marginBottom: 6 }}>
                <input
                  type="date"
                  value={e.date}
                  style={{ width: 140 }}
                  onChange={(ev) =>
                    setScenario((s) => ({ ...s, events: s.events.map((x) => (x.id === e.id ? { ...x, date: ev.target.value } : x)) }))
                  }
                />
                <input
                  type="text"
                  value={e.title}
                  placeholder="Событие"
                  onChange={(ev) =>
                    setScenario((s) => ({ ...s, events: s.events.map((x) => (x.id === e.id ? { ...x, title: ev.target.value } : x)) }))
                  }
                />
                <MoneyInput
                  value={e.amount}
                  allowNegative
                  style={{ width: 110 }}
                  onChange={(v) =>
                    setScenario((s) => ({ ...s, events: s.events.map((x) => (x.id === e.id ? { ...x, amount: v } : x)) }))
                  }
                />
                <button
                  className="icon-btn"
                  onClick={() => setScenario((s) => ({ ...s, events: s.events.filter((x) => x.id !== e.id) }))}
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
            <button
              className="btn sm"
              onClick={() =>
                setScenario((s) => ({
                  ...s,
                  id: s.id === '__base__' ? uid('sc') : s.id,
                  events: [...s.events, { id: uid('e'), date: addMonths(today(), 2), title: 'Крупная покупка', amount: -toMinor(50000) }],
                }))
              }
            >
              <Icon name="plus" size={13} /> Добавить событие
            </button>
            <div className="faint small" style={{ marginTop: 6 }}>
              Отрицательная сумма — трата, положительная — поступление.
            </div>
          </div>

          <div className="card">
            <div className="card-title"><Icon name="list" size={14} /> Помесячно</div>
            <Tbl>
              <thead>
                <tr>
                  <th>Месяц</th>
                  <th className="r">Доход</th>
                  <th className="r">Расход</th>
                  <th className="r">Итог</th>
                  <th className="r">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {fc.months.map((m) => (
                  <tr key={m.key}>
                    <td>{monthTitle(m.key)}</td>
                    <td className="r num pos">{moneyShort(m.income)}</td>
                    <td className="r num">{moneyShort(m.expense)}</td>
                    <td className={'r num ' + (m.net >= 0 ? 'pos' : 'neg')}>{moneyShort(m.net)}</td>
                    <td className={'r num ' + (m.p50 < 0 ? 'neg' : '')}>
                      {money(m.p50)}
                      <div className="faint" style={{ fontSize: 10.5 }}>
                        {moneyShort(m.p10)} … {moneyShort(m.p90)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tbl>
          </div>
        </div>
      </div>

      {saveOpen && (
        <SaveScenario
          scenario={scenario}
          onClose={() => setSaveOpen(false)}
          onSave={(name) => {
            const s = { ...scenario, id: scenario.id === '__base__' ? uid('sc') : scenario.id, name }
            upsertScenario(s)
            setScenario(s)
            setSaveOpen(false)
            toast(`Сценарий «${name}» сохранён`)
          }}
        />
      )}
    </div>
  )
}

function SaveScenario({
  scenario,
  onSave,
  onClose,
}: {
  scenario: Scenario
  onSave: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(scenario.name === 'Как есть' ? 'Мой сценарий' : scenario.name)
  return (
    <Modal
      title="Сохранить сценарий"
      icon="save"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" onClick={() => onSave(name.trim() || 'Сценарий')}>Сохранить</button>
        </>
      }
    >
      <Field label="Название">
        <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="faint small">
        Сохранённый сценарий можно открыть одним кликом и положить карточкой на канвас,
        чтобы сравнивать варианты рядом.
      </div>
    </Modal>
  )
}
