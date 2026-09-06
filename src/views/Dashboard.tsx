import React, { useEffect, useMemo, useState } from 'react'
import { GradientText, Reveal } from '../components/effects'
import { Amount, Money, useAnimatedList } from '../components/anim'
import { useApp, useTabId } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, moneyShort, pct, plural } from '../lib/format'
import { addMonths, humanDate, monthKey, MONTHS_SHORT, monthTitle, parseISO, today } from '../lib/date'
import {
  balances, balanceTimeline, categoryTotals, comparablePrev, entryDate, inPeriod, isAsset, makePeriod,
  monthlySeries, shiftPeriod, type Period, type PeriodKind,
} from '../engine/stats'
import { BarChart, Donut, LineChart, StackBar } from '../components/charts'
import { useAnalytics } from '../state/analytics'
import { Avatar, Confirm, Delta, useToast } from '../components/ui'
import { Nagrady } from '../components/Nagrady'
import { Kredity } from '../components/Kredity'
import { Proekty } from '../components/Proekty'
import { личное } from '../engine/project'
import { Ogonek } from '../components/Ogonek'
import type { Transaction } from '../lib/types'

const PERIODS: { k: PeriodKind; t: string }[] = [
  { k: 'day', t: 'День' },
  { k: 'week', t: 'Неделя' },
  { k: 'month', t: 'Месяц' },
  { k: 'year', t: 'Год' },
  { k: 'custom', t: 'Период' },
]

export default function Dashboard() {
  const app = useApp()
  const store = useStore()
  const { data, patchSettings, deleteTransactions, restoreTransactions } = store
  const toast = useToast()
  const { fc } = useAnalytics(data)
  const [side, setSide] = useState<'expense' | 'income'>('expense')
  const [period, setPeriod] = useState<Period>(() => makePeriod('month', today(), data.settings.firstDayOfWeek))
  const [accountId, setAccountId] = useState<string>('__all__')
  const [pickAccount, setPickAccount] = useState(false)
  const [activeCat, setActiveCat] = useState<string | undefined>()
  // null — диалога нет; иначе какая из двух кнопок его открыла.
  const [confirmWipe, setConfirmWipe] = useState<'expense' | 'income' | 'all' | null>(null)
  // Удалённый пакет держим в памяти сеанса, чтобы промах можно было отменить.
  const [undoBuffer, setUndoBuffer] = useState<Transaction[]>([])
  const catListRef = useAnimatedList<HTMLDivElement>()
  const recentRef = useAnimatedList<HTMLDivElement>()

  // Дата, на которую уйдёт новая запись, — см. entryDate. Отдаём её на всё
  // окно, чтобы Ctrl+N, «+» на ленте и палитра команд открывали ввод той же
  // датой, что и две кнопки в шапке: иначе поведение зависело бы от того,
  // каким путём человек начал запись.
  const tabId = useTabId()
  const entry = entryDate(period)
  const { setEntryDate } = app
  useEffect(() => {
    setEntryDate(tabId, entry)
    // Уборка за собой: закрытая вкладка не должна диктовать дату живым.
    return () => setEntryDate(tabId, null)
  }, [tabId, entry, setEntryDate])

  // Подстановка обязана быть видна до нажатия: молча ушедшая в пролистанный
  // месяц трата потом ищется в сегодняшнем дне и не находится.
  const entryDay = parseISO(entry)
  const entryMark = entry === today() ? '' : ` · ${entryDay.getDate()} ${MONTHS_SHORT[entryDay.getMonth()]}`
  const entryHint = (what: string) => (entryMark ? `${what} за ${humanDate(entry)}` : what)

  const bal = balances(data.accounts, data.transactions)
  const hidden = data.settings.hideBalance

  // Свои деньги отдельно от проектных: «Итого» и суммы за период считаются по
  // личным операциям. Выбран конкретный счёт — показывается он сам, включая
  // проектный: там как раз и нужно видеть чужие деньги целиком.
  const личн = личное(data)

  const scoped = useMemo(
    () =>
      accountId === '__all__'
        ? личн.transactions
        : data.transactions.filter((t) => t.accountId === accountId || t.toAccountId === accountId),
    [личн.transactions, data.transactions, accountId],
  )
  const inRange = useMemo(() => scoped.filter((t) => inPeriod(t, period)), [scoped, period])
  const totals = useMemo(() => categoryTotals(inRange, side), [inRange, side])
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])

  const sumSide = totals.reduce((s, t) => s + t.amount, 0)
  const income = inRange.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = inRange.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)

  // ------------------------------------------------ прошлый такой же период
  // Незаконченный месяц сравнивается с таким же куском прошлого: иначе пятого
  // числа программа радостно сообщала бы о падении расходов на 80 %.
  const prev = useMemo(
    () => comparablePrev(period, data.settings.firstDayOfWeek),
    [period, data.settings.firstDayOfWeek],
  )
  const prevRange = useMemo(
    () => scoped.filter((t) => t.date >= prev.from && t.date <= prev.to),
    [scoped, prev],
  )
  const prevIncome = prevRange.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0)
  const prevExpense = prevRange.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amount, 0)
  const prevByCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of categoryTotals(prevRange, side)) m.set(c.categoryId, c.amount)
    return m
  }, [prevRange, side])
  const prevNote = prev.partial
    ? `${prev.label.toLowerCase()}, за те же ${prev.days} ${plural(prev.days, 'день', 'дня', 'дней')}`
    : prev.label.toLowerCase()

  const headline =
    accountId === '__all__'
      ? bal.assets
      : bal.byAccount.get(accountId) ?? 0
  const headlineName =
    accountId === '__all__' ? 'Итого' : data.accounts.find((a) => a.id === accountId)?.name ?? 'Счёт'

  const slices = totals.slice(0, 12).map((t) => {
    const c = catById.get(t.categoryId)
    return { id: t.categoryId, label: c?.name ?? 'Без категории', value: t.amount, color: c?.color ?? '#7c8794' }
  })

  const year = useMemo(() => monthlySeries(личн.transactions, addMonths(today(), -11), today()), [личн.transactions])
  const timeline = useMemo(
    () => balanceTimeline(личн.accounts, личн.transactions, addMonths(today(), -3), today()),
    [личн.accounts, личн.transactions],
  )

  const recent = useMemo(
    () => [...inRange].sort((a, b) => (a.date < b.date ? 1 : a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8),
    [inRange],
  )

  // ------------------------------------------------ массовое удаление
  // Обе кнопки видны всегда и не зависят от выбранной вкладки: переключаться
  // между «Расходами» и «Доходами» ради удаления — лишний шаг.
  const wipeExpense = useMemo(() => inRange.filter((t) => t.kind === 'expense'), [inRange])
  const wipeIncome = useMemo(() => inRange.filter((t) => t.kind === 'income'), [inRange])
  const wipeTargets = confirmWipe === 'income' ? wipeIncome : wipeExpense
  const wipeSum = wipeTargets.reduce((s, t) => s + t.amount, 0)

  const doWipe = () => {
    const doomed = [...wipeTargets]
    deleteTransactions(doomed.map((t) => t.id))
    setUndoBuffer(doomed)
    toast(`Удалено операций: ${doomed.length}`, {
      label: 'Вернуть',
      onClick: () => {
        restoreTransactions(doomed)
        setUndoBuffer([])
      },
    })
  }

  const undoWipe = () => {
    restoreTransactions(undoBuffer)
    toast(`Возвращено операций: ${undoBuffer.length}`)
    setUndoBuffer([])
  }

  return (
    <div className="view wide">
      {/* ------------------------------------------------ шапка со счётом */}
      <div className="hero" style={{ marginBottom: 18 }}>
        <div className="row">
          <div style={{ position: 'relative' }}>
            <button className="btn ghost" onClick={() => setPickAccount((v) => !v)}>
              <Icon name="wallet" size={16} /> {headlineName} <Icon name="down" size={13} />
            </button>
            {pickAccount && (
              <div
                className="card"
                style={{ position: 'absolute', top: 34, left: 0, zIndex: 30, width: 280, boxShadow: 'var(--shadow)' }}
              >
                <div className="card-title">Выберите счёт</div>
                <div
                  className="cat-row"
                  onClick={() => {
                    setAccountId('__all__')
                    setPickAccount(false)
                  }}
                >
                  <span className="avatar" style={{ background: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}>
                    <Icon name="wallet" size={16} />
                  </span>
                  <span className="name">Итого</span>
                  <span className="amt num">{hidden ? '••••' : money(bal.assets)}</span>
                </div>
                {data.accounts.filter((a) => !a.archived).map((a) => (
                  <div
                    key={a.id}
                    className="cat-row"
                    onClick={() => {
                      setAccountId(a.id)
                      setPickAccount(false)
                    }}
                  >
                    <Avatar icon={a.icon} color={a.color} />
                    <span className="name">{a.name}</span>
                    <span className="amt num">{hidden ? '••••' : money(bal.byAccount.get(a.id) ?? 0)}</span>
                  </div>
                ))}
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn sm" onClick={() => patchSettings({ hideBalance: !hidden })}>
                    <Icon name={hidden ? 'eye' : 'eyeOff'} size={14} /> {hidden ? 'Показать баланс' : 'Скрыть баланс'}
                  </button>
                </div>
              </div>
            )}
          </div>
          <span className="spacer" />
          {/* Огонёк серии стоит рядом с кнопками записи не случайно: он про
              то, чтобы запись случилась сегодня. */}
          <Ogonek />
          {/* Две кнопки вместо одной переключаемой: вид операции выбирается
              сразу, без лишнего клика по вкладке «Расходы/Доходы». */}
          <button className="btn tone-out" onClick={() => app.openQuickAdd('', 'expense')} title={entryHint('Записать расход')}>
            <Icon name="plus" size={16} /> Расход{entryMark}
          </button>
          <button className="btn tone-in" onClick={() => app.openQuickAdd('', 'income')} title={entryHint('Записать доход')}>
            <Icon name="plus" size={16} /> Доход{entryMark}
          </button>
        </div>
        <div className="hero-total num" style={{ marginTop: 6 }}>
          {hidden ? '•••••••' : <Money value={headline} />}
        </div>
        <div className="hero-label">
          чистый капитал {hidden ? '••••' : money(bal.net)}
          {bal.liabilities < 0 && ` · обязательства ${hidden ? '••••' : money(bal.liabilities)}`}
        </div>
      </div>

      {/* ------------------------------------------------ пустое хранилище */}
      {!data.accounts.length && (
        <Reveal className="card" style={{ marginBottom: 18, padding: 'calc(22px * var(--dens)) calc(24px * var(--dens))' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 19, color: 'var(--text-strong)' }}>
            <GradientText>Хранилище пустое — заполните его своими данными</GradientText>
          </h2>
          <div className="advice-body" style={{ maxWidth: 700 }}>
            Программа ничего не придумывает за вас: ни счетов, ни операций. Начать проще всего
            со счёта — карты или наличных — и указать на нём текущий остаток. Дальше появятся
            категории, а прогноз и советы включатся сами, как только наберётся история за
            пару месяцев.
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
            <button className="btn primary" onClick={() => app.openTab('accounts')}>
              <Icon name="wallet" size={15} /> Создать первый счёт
            </button>
            <button className="btn" onClick={() => app.openTab('categories')}>
              <Icon name="tag" size={15} /> Категории
            </button>
            <button className="btn" onClick={() => app.openTab('import')}>
              <Icon name="download" size={15} /> Загрузить выписку из банка
            </button>
          </div>
        </Reveal>
      )}

      {/* ------------------------------------------------ период и сторона */}
      <div className="row wrap" style={{ marginBottom: 16, gap: 12 }}>
        <div className="seg">
          <button className={side === 'expense' ? 'on' : ''} onClick={() => setSide('expense')}>Расходы</button>
          <button className={side === 'income' ? 'on' : ''} onClick={() => setSide('income')}>Доходы</button>
        </div>
        <div className="seg">
          {PERIODS.map((p) => (
            <button
              key={p.k}
              className={period.kind === p.k ? 'on' : ''}
              onClick={() => setPeriod(makePeriod(p.k, period.anchor, data.settings.firstDayOfWeek))}
            >
              {p.t}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" onClick={() => setPeriod((p) => shiftPeriod(p, -1, data.settings.firstDayOfWeek))}>
            <Icon name="left" size={15} />
          </button>
          <span style={{ minWidth: 170, textAlign: 'center' }} className="strong">{period.label}</span>
          <button className="icon-btn" onClick={() => setPeriod((p) => shiftPeriod(p, 1, data.settings.firstDayOfWeek))}>
            <Icon name="right" size={15} />
          </button>
          <button
            className="icon-btn"
            title="К текущему периоду"
            onClick={() => setPeriod(makePeriod(period.kind, today(), data.settings.firstDayOfWeek))}
          >
            <Icon name="fit" size={15} />
          </button>
        </div>
        {period.kind === 'custom' && (
          <div className="row" style={{ gap: 6 }}>
            <input
              type="date"
              value={period.from}
              style={{ width: 150 }}
              onChange={(e) =>
                setPeriod((p) => makePeriod('custom', p.anchor, data.settings.firstDayOfWeek, { from: e.target.value, to: p.to }))
              }
            />
            <span className="faint">—</span>
            <input
              type="date"
              value={period.to}
              style={{ width: 150 }}
              onChange={(e) =>
                setPeriod((p) => makePeriod('custom', p.anchor, data.settings.firstDayOfWeek, { from: p.from, to: e.target.value }))
              }
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------ донат и категории */}
      <div className="grid split" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 'calc(22px * var(--dens)) calc(18px * var(--dens))' }}>
          <Donut
            slices={slices}
            size={250}
            thickness={34}
            activeId={activeCat}
            onSelect={setActiveCat}
            center={
              <div>
                {sumSide === 0 ? (
                  <div className="faint" style={{ fontSize: 14, lineHeight: 1.4 }}>
                    {side === 'expense' ? 'В этот период расходов не было' : 'В этот период доходов не было'}
                  </div>
                ) : (
                  <>
                    <div className="num" style={{ fontSize: 25, fontWeight: 650, color: 'var(--text-strong)' }}>
                      {hidden ? '••••' : <Money value={activeCat ? totals.find((t) => t.categoryId === activeCat)?.amount ?? 0 : sumSide} />}
                    </div>
                    <div className="faint small">
                      {activeCat ? catById.get(activeCat)?.name : side === 'expense' ? 'расходы' : 'доходы'}
                    </div>
                  </>
                )}
              </div>
            }
          />
          {slices.length > 0 && (
            <div style={{ width: '100%', marginTop: 16 }}>
              <StackBar slices={slices} />
            </div>
          )}
          <div className="row" style={{ width: '100%', marginTop: 14 }}>
            <div className="stat">
              <span className="l">Доход</span>
              <span className="v amount in" style={{ fontSize: 16 }}>
                <span className="sign">+</span>{hidden ? '••••' : <Money value={income} />}
              </span>
              <Delta cur={income} prev={prevIncome} goodWhen="up" note={prevNote} hidden={hidden} />
            </div>
            <span className="spacer" />
            <div className="stat">
              <span className="l">Расход</span>
              <span className="v amount out" style={{ fontSize: 16 }}>
                <span className="sign">−</span>{hidden ? '••••' : <Money value={expense} />}
              </span>
              <Delta cur={expense} prev={prevExpense} goodWhen="down" note={prevNote} hidden={hidden} />
            </div>
            <span className="spacer" />
            <div className="stat">
              <span className="l">Итог</span>
              <span className={'v ' + (income - expense >= 0 ? 'pos' : 'neg')} style={{ fontSize: 16 }}>
                {hidden ? '••••' : <Money value={income - expense} sign />}
              </span>
              <Delta cur={income - expense} prev={prevIncome - prevExpense} goodWhen="up" note={prevNote} hidden={hidden} />
            </div>
          </div>
          {(prevIncome > 0 || prevExpense > 0) && (
            <div className="faint small" style={{ width: '100%', marginTop: 8 }}>
              Сравнение с периодом «{prev.label}»
              {prev.partial && ` — взяты первые ${prev.days} ${plural(prev.days, 'день', 'дня', 'дней')}, столько же, сколько прошло сейчас`}
            </div>
          )}
        </div>

        {/* Массовая чистка ровно того, что показывает бублик: текущий счёт,
            период и выбранная сторона — расходы или доходы. */}
        {(data.transactions.length > 0 || data.accounts.length > 0) && (
        <div className="card tight">
          <div className="card-title" style={{ marginBottom: 8 }}>
            <Icon name="trash" size={13} /> Очистка
          </div>
          {undoBuffer.length > 0 && (
            <button className="btn" style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }} onClick={undoWipe}>
              <Icon name="repeat" size={15} /> Вернуть {undoBuffer.length} {plural(undoBuffer.length, 'операцию', 'операции', 'операций')}
            </button>
          )}
          <button
            className="btn danger"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={!wipeExpense.length}
            onClick={() => setConfirmWipe('expense')}
          >
            <Icon name="arrowDown" size={15} />
            Удалить все расходы{wipeExpense.length ? ` (${wipeExpense.length})` : ''}
          </button>
          <button
            className="btn danger"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            disabled={!wipeIncome.length}
            onClick={() => setConfirmWipe('income')}
          >
            <Icon name="arrowUp" size={15} />
            Удалить весь заработок{wipeIncome.length ? ` (${wipeIncome.length})` : ''}
          </button>
          <button
            className="btn danger"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8, borderTop: '1px solid var(--border-soft)', borderRadius: 'var(--radius)' }}
            onClick={() => setConfirmWipe('all')}
          >
            <Icon name="trash" size={15} />
            Стереть всё и начать заново
          </button>
          <div className="faint small" style={{ marginTop: 10, lineHeight: 1.5 }}>
            {wipeExpense.length || wipeIncome.length ? (
              <>
                Действует на {period.label.toLowerCase()}
                {accountId !== '__all__' ? ` и счёт «${headlineName}»` : ''}:
                расходы {money(expense)}, пополнения {money(income)}.
                Кнопки независимы, переводы между счетами не трогаются.
              </>
            ) : (
              <>За выбранный период удалять нечего.</>
            )}
            {' '}Нижняя кнопка не смотрит на период: она очищает хранилище целиком.
          </div>
        </div>
        )}
        </div>

        {/* cat-list — свой контейнер: что прятать в строке, решает ширина самой
            карточки, а не окна. */}
        <div className="card cat-list" style={{ padding: 'calc(10px * var(--dens)) calc(8px * var(--dens))' }} ref={catListRef}>
          {totals.length === 0 && <div className="empty">Нет операций за выбранный период</div>}
          {totals.map((t) => {
            const c = catById.get(t.categoryId)
            return (
              <div
                key={t.categoryId}
                className="cat-row"
                onMouseEnter={() => setActiveCat(t.categoryId)}
                onMouseLeave={() => setActiveCat(undefined)}
                onClick={() => app.openTab('transactions', 'cat:' + t.categoryId, { title: c?.name ?? 'Категория' })}
              >
                <Avatar icon={c?.icon} color={c?.color} />
                <span className="name">{c?.name ?? 'Без категории'}</span>
                <span className="cnt faint small nowrap">{t.count} оп.</span>
                <Delta
                  cur={t.amount}
                  prev={prevByCat.get(t.categoryId) ?? 0}
                  goodWhen={side === 'income' ? 'up' : 'down'}
                  note={prevNote}
                  hidden={hidden}
                />
                <span className="share">{Math.round(t.share * 100)}%</span>
                <span className="amt num">{hidden ? '••••' : money(t.amount)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------ динамика */}
      <div className="grid c2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">
            <Icon name="bars" size={14} /> Доходы и расходы за 12 месяцев
          </div>
          <BarChart
            groups={year.map((m) => ({
              label: MONTHS_SHORT[Number(m.key.slice(5, 7)) - 1],
              values: [
                { value: m.income, color: 'var(--good)', name: 'Доход' },
                { value: m.expense, color: 'var(--alert)', name: 'Расход' },
              ],
            }))}
            height={190}
          />
        </div>
        <div className="card">
          <div className="card-title">
            <Icon name="chart" size={14} /> Остаток на счетах за 3 месяца
          </div>
          <LineChart
            points={timeline
              .filter((_, i) => i % 2 === 0)
              .map((p) => ({ label: p.date.slice(8) + '.' + p.date.slice(5, 7), value: p.value }))}
            height={190}
          />
        </div>
      </div>

      {/* ------------------------------------------------ кредиты */}
      <Kredity style={{ marginTop: 16 }} />

      <Proekty style={{ marginTop: 16 }} />

      {/* ------------------------------------------------ отличия */}
      <Nagrady style={{ marginTop: 16 }} />

      {/* ------------------------------------------------ последние операции */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <div className="card-title" style={{ margin: 0 }}>
            <Icon name="list" size={14} /> Последние операции
          </div>
          <span className="spacer" />
          <button className="btn sm ghost" onClick={() => app.openTab('transactions')}>
            Все операции <Icon name="right" size={13} />
          </button>
        </div>
        <div ref={recentRef}>
        {recent.length === 0 && <div className="empty">Пусто</div>}
        {recent.map((t) => {
          const c = t.categoryId ? catById.get(t.categoryId) : undefined
          const acc = data.accounts.find((a) => a.id === t.accountId)
          return (
            <div
              key={t.id}
              className={'tx-row ' + (t.kind === 'income' ? 'in' : t.kind === 'transfer' ? 'move' : 'out')}
              onClick={() => app.editTransaction(t)}
            >
              <Avatar icon={t.kind === 'transfer' ? 'arrow-left-right' : c?.icon} color={c?.color} />
              <div className="tx-main">
                <div className="tx-title">{t.note || c?.name || (t.kind === 'transfer' ? 'Перевод' : 'Операция')}</div>
                <div className="tx-sub">
                  {humanDate(t.date)} · {acc?.name}
                  {c ? ' · ' + c.name : ''}
                  {t.tags.length ? ' · ' + t.tags.map((x) => '#' + x).join(' ') : ''}
                </div>
              </div>
              <Amount value={t.amount} kind={t.kind} hidden={hidden} />
            </div>
          )
        })}
        </div>
      </div>

      {confirmWipe === 'all' && (
        <Confirm
          title="Стереть всё и начать заново?"
          confirmLabel="Стереть всё"
          text={
            `Хранилище вернётся к состоянию только что установленной программы. ` +
            `Будут удалены: ${data.transactions.length} ${plural(data.transactions.length, 'операция', 'операции', 'операций')}, ` +
            `${data.accounts.length} ${plural(data.accounts.length, 'счёт', 'счёта', 'счетов')} вместе с кредитами и долгами, ` +
            `${data.categories.length} ${plural(data.categories.length, 'категория', 'категории', 'категорий')}, ` +
            `${data.goals.length} ${plural(data.goals.length, 'цель', 'цели', 'целей')}, ` +
            `${data.recurring.length} ${plural(data.recurring.length, 'регулярный платёж', 'регулярных платежа', 'регулярных платежей')}, ` +
            `а также все заметки и канвасы. Настройки и путь к хранилищу останутся. ` +
            `Отмены у этого действия нет — кнопка «Вернуть» здесь не поможет. ` +
            `Если в данных есть что-то нужное, сначала сохраните их: «Настройки» → «Сохранить всё в файл».`
          }
          onConfirm={() => void store.wipeAll()}
          onClose={() => setConfirmWipe(null)}
        />
      )}

      {(confirmWipe === 'expense' || confirmWipe === 'income') && (
        <Confirm
          title={
            confirmWipe === 'income'
              ? `Удалить весь заработок за ${period.label.toLowerCase()}?`
              : `Удалить все расходы за ${period.label.toLowerCase()}?`
          }
          confirmLabel={`Удалить ${wipeTargets.length}`}
          text={
            `Будет удалено ${wipeTargets.length} ${plural(wipeTargets.length, 'операция', 'операции', 'операций')} ` +
            `на ${money(wipeSum)}` +
            (accountId !== '__all__' ? ` по счёту «${headlineName}»` : '') +
            `. ` +
            (confirmWipe === 'income'
              ? `История пополнений за этот период исчезнет, расходы останутся. Учтите, что прогноз, ` +
                `норма сбережений и советы считаются от дохода — без него картина станет заметно мрачнее. `
              : `История трат за этот период исчезнет, пополнения останутся. `) +
            `Остатки по счетам пересчитаются. ` +
            `Сразу после удаления здесь же появится кнопка «Вернуть» — она действует до закрытия программы; ` +
            `если данные важны, надёжнее сначала выгрузить их из раздела «Операции» в CSV.`
          }
          onConfirm={doWipe}
          onClose={() => setConfirmWipe(null)}
        />
      )}
    </div>
  )
}
