import React, { useMemo } from 'react'
import { Tbl } from './ui'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, moneyShort } from '../lib/format'
import { humanDate } from '../lib/date'
import { runQuery } from '../engine/query'
import { BarChart, Donut, LineChart } from './charts'

/** Блок ```kashel — считает по операциям прямо в заметке. */
export function QueryBlock({ source }: { source: string }) {
  const { data } = useStore()
  const res = useMemo(() => runQuery(source, data), [source, data])

  if (res.type === 'error') {
    return <div className="query-block"><span className="neg small">{res.message}</span></div>
  }

  return (
    <div className="query-block">
      <div className="query-head">
        <Icon name="donut" size={12} />
        живой запрос · {res.spec.periodLabel}
        {res.spec.kind && ` · ${res.spec.kind === 'expense' ? 'расходы' : res.spec.kind === 'income' ? 'доходы' : 'переводы'}`}
      </div>

      {res.type === 'sum' && (
        <div>
          <div className="num" style={{ fontSize: 26, fontWeight: 650, color: 'var(--text-strong)' }}>{money(res.value)}</div>
          <div className="faint small">{res.count} операций</div>
        </div>
      )}

      {res.type === 'chart' && res.chart === 'donut' && (
        <div className="row wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
          <Donut
            slices={res.slices.map((s, i) => ({ id: String(i), label: s.label, value: s.value, color: s.color }))}
            size={190}
            thickness={26}
            center={<div className="num strong">{moneyShort(res.slices.reduce((s, x) => s + x.value, 0))}</div>}
          />
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            {res.slices.map((s, i) => (
              <div key={i} className="row" style={{ gap: 8, padding: '2px 0' }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: 'none' }} />
                {/* Без min-width:0 самое длинное название задаёт минимальную
                    ширину всей строки — ровно та ошибка, что вылечена в .cat-row. */}
                <span
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={s.label}
                >
                  {s.label}
                </span>
                <span className="faint small num nowrap">{Math.round(s.share * 100)}%</span>
                <span className="num nowrap">{money(s.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {res.type === 'chart' && res.chart === 'bar' && (
        <BarChart
          groups={res.series.map((s) => ({
            label: s.key.slice(5),
            values: [
              { value: s.income, color: 'var(--good)', name: 'Доход' },
              { value: s.expense, color: 'var(--alert)', name: 'Расход' },
            ],
          }))}
          height={200}
        />
      )}

      {res.type === 'chart' && res.chart === 'line' && (
        <LineChart
          points={res.series.map((s) => ({ label: s.key.slice(5), value: s.income - s.expense }))}
          height={200}
        />
      )}

      {(res.type === 'table' || res.type === 'list') && (
        <Tbl>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Описание</th>
              <th className="r">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {res.rows.map((t) => (
              <tr key={t.id}>
                <td className="faint">{humanDate(t.date, true)}</td>
                <td>{t.note || '—'}</td>
                <td className={'r num ' + (t.kind === 'income' ? 'pos' : '')}>{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </Tbl>
      )}
    </div>
  )
}
