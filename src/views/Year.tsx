import React, { useMemo, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { Money } from '../components/anim'
import { Avatar, Delta } from '../components/ui'
import { money, pct, plural } from '../lib/format'
import { addMonths, humanDate, MONTHS, MONTHS_SHORT, today } from '../lib/date'
import { categoryTotals, tagTotals, yearSummary } from '../engine/stats'
import { BarChart, StackBar } from '../components/charts'
import { личное } from '../engine/project'
import { т, тр } from '../i18n'

const monthName = (key?: string) => (key ? MONTHS[Number(key.slice(5, 7)) - 1] : '—')

/**
 * Итоги года — витрина поверх уже посчитанного: ничего нового не считается,
 * кроме сравнения с прошлым годом. Прошлый год обрезается по тому же дню,
 * иначе в марте текущий год выглядел бы провалом на фоне полного прошлого.
 */
/**
 * Итоги года — витрина поверх уже посчитанного: ничего нового не считается,
 * кроме сравнения с прошлым годом. Прошлый год обрезается по тому же дню,
 * иначе в марте текущий год выглядел бы провалом на фоне полного прошлого.
 */
export default function YearView() {
  const app = useApp()
  const { data } = useStore()
  const [year, setYear] = useState(() => today().slice(0, 4))

  const hidden = data.settings.hideBalance
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])

  // Итоги года — про свои деньги: проектные счета в них не входят.
  const личн = личное(data)
  const sum = useMemo(() => yearSummary(личн.transactions, year), [личн.transactions, year])
  const prevYear = String(Number(year) - 1)
  const prev = useMemo(
    // Тот же день год назад: для прошедшего года это его 31 декабря.
    () => yearSummary(личн.transactions, prevYear, addMonths(sum.through, -12)),
    [личн.transactions, prevYear, sum.through],
  )

  const yearTx = useMemo(
    () => личн.transactions.filter((t) => t.date.slice(0, 4) === year),
    [личн.transactions, year],
  )
  const prevTx = useMemo(
    () => личн.transactions.filter((t) => t.date.slice(0, 4) === prevYear && t.date <= addMonths(sum.through, -12)),
    [личн.transactions, prevYear, sum.through],
  )

  const cats = useMemo(() => categoryTotals(yearTx, 'expense'), [yearTx])
  const prevCats = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of categoryTotals(prevTx, 'expense')) m.set(c.categoryId, c.amount)
    return m
  }, [prevTx])
  const tags = useMemo(() => tagTotals(yearTx, 'expense').slice(0, 6), [yearTx])

  const years = useMemo(() => {
    const set = new Set(личн.transactions.map((t) => t.date.slice(0, 4)))
    set.add(today().slice(0, 4))
    return [...set].sort()
  }, [личн.transactions])

  const slices = cats.slice(0, 8).map((t) => {
    const c = catById.get(t.categoryId)
    return { id: t.categoryId, label: c?.name ?? т('Без категории'), value: t.amount, color: c?.color ?? '#7c8794' }
  })

  const note = sum.through < `${year}-12-31` ? `${prevYear} по ${humanDate(addMonths(sum.through, -12), true)}` : prevYear
  const empty = sum.count === 0

  return (
    <div className="view wide">
      <div className="view-head">
        <div>
          <h1 className="view-title">{тр('Итоги {0} года', year)}</h1>
          <div className="view-sub">
            {empty
              ? т('За этот год операций нет')
              : `${sum.count} ${plural(sum.count, 'операция', 'операции', 'операций')} · ` +
                (sum.through < `${year}-12-31` ? т('год прожит на {0}%', Math.round((sum.daysLived / 365) * 100)) : т('год закрыт'))}
          </div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" disabled={years[0] >= year} onClick={() => setYear((y) => String(Number(y) - 1))}>
            <Icon name="left" size={15} />
          </button>
          <span className="strong" style={{ minWidth: 54, textAlign: 'center' }}>{year}</span>
          <button
            className="icon-btn"
            disabled={year >= today().slice(0, 4)}
            onClick={() => setYear((y) => String(Number(y) + 1))}
          >
            <Icon name="right" size={15} />
          </button>
          <button className="btn sm ghost" onClick={() => app.openTab('calendar')}>
            <Icon name="calendar" size={14} /> {т(' Календарь')}</button>
        </div>
      </div>

      {/* --------------------------------------------------- главные цифры */}
      <div className="grid c3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">{т('Заработано')}</div>
          <div className="stat">
            <span className="v amount in" style={{ fontSize: 26 }}>
              <span className="sign">+</span>{hidden ? '••••' : <Money value={sum.income} />}
            </span>
            <Delta cur={sum.income} prev={prev.income} goodWhen="up" note={note} hidden={hidden} />
          </div>
        </div>
        <div className="card">
          <div className="card-title">{т('Потрачено')}</div>
          <div className="stat">
            <span className="v amount out" style={{ fontSize: 26 }}>
              <span className="sign">−</span>{hidden ? '••••' : <Money value={sum.expense} />}
            </span>
            <Delta cur={sum.expense} prev={prev.expense} goodWhen="down" note={note} hidden={hidden} />
          </div>
        </div>
        <div className="card">
          <div className="card-title">{т('Отложено')}</div>
          <div className="stat">
            <span className={'v ' + (sum.net >= 0 ? 'pos' : 'neg')} style={{ fontSize: 26 }}>
              {hidden ? '••••' : <Money value={sum.net} sign />}
            </span>
            <span className="d faint">
              {тр('норма сбережений {0}{1}', pct(sum.savingsRate, 1), prev.income > 0 && т(' · год назад {0}', pct(prev.savingsRate, 1)))}</span>
          </div>
        </div>
      </div>

      {!empty && (
        <>
          {/* ----------------------------------------------- по месяцам */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <Icon name="bars" size={14} /> {т(' По месяцам')}</div>
            <BarChart
              groups={sum.months.map((m) => ({
                label: MONTHS_SHORT[Number(m.key.slice(5, 7)) - 1],
                values: [
                  { value: m.income, color: 'var(--money-in)', name: т('Доход') },
                  { value: m.expense, color: 'var(--money-out)', name: т('Расход') },
                ],
              }))}
              height={210}
            />
          </div>

          <div className="grid c2" style={{ alignItems: 'start' }}>
            {/* --------------------------------------------- рекорды */}
            <div className="card">
              <div className="card-title">
                <Icon name="sparkle" size={14} /> {т(' Рекорды года')}</div>
              <div className="record">
                <span className="avatar" style={{ background: 'color-mix(in srgb, var(--money-out) 22%, transparent)' }}>
                  <Icon name="calendar" size={16} />
                </span>
                <div className="rec-main">
                  <div className="rec-title">{т('Самый дорогой день')}</div>
                  <div className="rec-sub">{sum.topDay ? humanDate(sum.topDay.date, true) : т('нет данных')}</div>
                </div>
                <span className="amount out">{sum.topDay ? (hidden ? '••••' : money(sum.topDay.expense)) : '—'}</span>
              </div>
              <div className="record">
                <Avatar
                  icon={(sum.biggest?.categoryId && catById.get(sum.biggest.categoryId)?.icon) || 'shopping-cart'}
                  color={(sum.biggest?.categoryId && catById.get(sum.biggest.categoryId)?.color) || undefined}
                />
                <div className="rec-main">
                  <div className="rec-title">{т('Самая крупная трата')}</div>
                  <div className="rec-sub">
                    {sum.biggest
                      ? `${sum.biggest.note || catById.get(sum.biggest.categoryId || '')?.name || т('без категории')} · ${humanDate(sum.biggest.date, true)}`
                      : т('нет данных')}
                  </div>
                </div>
                <span className="amount out">{sum.biggest ? (hidden ? '••••' : money(sum.biggest.amount)) : '—'}</span>
              </div>
              <div className="record">
                <span className="avatar" style={{ background: 'color-mix(in srgb, var(--warn) 22%, transparent)' }}>
                  <Icon name="bars" size={16} />
                </span>
                <div className="rec-main">
                  <div className="rec-title">{т('Самый дорогой месяц')}</div>
                  <div className="rec-sub">{monthName(sum.topMonth?.key)}</div>
                </div>
                <span className="amount out">{sum.topMonth ? (hidden ? '••••' : money(sum.topMonth.expense)) : '—'}</span>
              </div>
              <div className="record">
                <span className="avatar" style={{ background: 'color-mix(in srgb, var(--money-in) 22%, transparent)' }}>
                  <Icon name="chart" size={16} />
                </span>
                <div className="rec-main">
                  <div className="rec-title">{т('Самый экономный месяц')}</div>
                  <div className="rec-sub">{monthName(sum.leanMonth?.key)}</div>
                </div>
                <span className="amount out">{sum.leanMonth ? (hidden ? '••••' : money(sum.leanMonth.expense)) : '—'}</span>
              </div>
            </div>

            {/* ------------------------------------------- на что ушло */}
            <div className="card cat-list">
              <div className="card-title">
                <Icon name="donut" size={14} /> {т(' На что ушли деньги')}</div>
              {slices.length > 0 && <StackBar slices={slices} />}
              <div style={{ marginTop: 10 }}>
                {cats.slice(0, 8).map((t) => {
                  const c = catById.get(t.categoryId)
                  return (
                    <div
                      key={t.categoryId}
                      className="cat-row"
                      onClick={() => app.openTab('transactions', 'cat:' + t.categoryId, { title: c?.name ?? т('Категория') })}
                    >
                      <Avatar icon={c?.icon} color={c?.color} />
                      <span className="name">{c?.name ?? т('Без категории')}</span>
                      <Delta
                        cur={t.amount}
                        prev={prevCats.get(t.categoryId) ?? 0}
                        goodWhen="down"
                        note={note}
                        hidden={hidden}
                      />
                      <span className="share">{Math.round(t.share * 100)}%</span>
                      <span className="amt num">{hidden ? '••••' : money(t.amount)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* -------------------------------------------------- счётчики */}
          <div className="grid c4" style={{ marginTop: 16 }}>
            <div className="card tight">
              <div className="card-title">{т('Средний чек')}</div>
              <div className="stat"><span className="v">{hidden ? '••••' : money(sum.perTx)}</span></div>
            </div>
            <div className="card tight">
              <div className="card-title">{т('Расход в день')}</div>
              <div className="stat">
                <span className="v">{hidden ? '••••' : money(sum.perDay)}</span>
                <span className="d faint">{тр('по {0} {1}', sum.daysLived, plural(sum.daysLived, 'дню', 'дням', 'дням'))}</span>
              </div>
            </div>
            <div className="card tight">
              <div className="card-title">{т('Дней без трат')}</div>
              <div className="stat">
                <span className="v">{sum.daysWithoutSpending}</span>
                <span className="d faint">{тр('из {0}', sum.daysLived)}</span>
              </div>
            </div>
            <div className="card tight">
              <div className="card-title">{т('Операций')}</div>
              <div className="stat">
                <span className="v">{sum.count}</span>
                <span className="d faint">
                  {тр('{0} в день', (sum.count / Math.max(1, sum.daysLived)).toFixed(1).replace('.', ','))}</span>
              </div>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title">
                <Icon name="tag" size={14} /> {т(' Теги года')}</div>
              <div className="row wrap" style={{ gap: 8 }}>
                {tags.map((t) => (
                  <button
                    key={t.tag}
                    className="chip"
                    onClick={() => app.openTab('transactions', undefined, { title: т('Операции') })}
                  >
                    #{t.tag} · {hidden ? '••••' : money(t.amount)}
                    <span className="faint"> · {t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
