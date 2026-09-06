import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { Icon } from '../lib/icons'
import { money, pct } from '../lib/format'
import { projectsSummary, type Проектъ } from '../engine/project'

/*
 * Проекты на дашбордѣ.
 *
 * Смысл блока — отделить чужое от своего и не потерять чужое из виду.
 * Проектные деньги выпали из дохода, капитала, прогноза и наград; если бы на
 * этом всё кончилось, они пропали бы совсем, а они лежат на счету и за них
 * надо отчитываться.
 *
 * Показано ровно то, что о проекте спрашивают: сколько собрано, сколько
 * освоено, сколько осталось, на что ушло и сколько вы взяли себе. Ничего
 * своего не считается — всё берёт движок проектов.
 */
export function Proekty({ style }: { style?: React.CSSProperties }) {
  const { data } = useStore()
  const app = useApp()
  const сводка = useMemo(() => projectsSummary(data), [data])

  if (!сводка.список.length) return null

  return (
    <div className="card proekty" style={style}>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Icon name="folder" size={14} /> Проекты
        </div>
        <span className="spacer" />
        <span className="faint small">
          не ваши деньги · на счетах <b>{money(сводка.остатокъ)}</b>
        </span>
        <button className="btn sm ghost" style={{ marginLeft: 10 }} onClick={() => app.openTab('accounts')}>
          Счета <Icon name="right" size={13} />
        </button>
      </div>

      {сводка.список.map((p) => (
        <Одинъ key={p.acc.id} p={p} />
      ))}
    </div>
  )
}

function Одинъ({ p }: { p: Проектъ }) {
  const { data } = useStore()
  const app = useApp()
  const статья = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? 'без статьи'
  const собрано = p.пришло + p.внесено

  return (
    <div className="kredit-row">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <span className="strong">{p.acc.name}</span>
        <span className="faint small">проект</span>
        <span className="spacer" />
        <span className={'num strong' + (p.остатокъ < 0 ? ' neg' : '')} style={{ fontSize: 17 }}>
          {money(p.остатокъ)}
        </span>
      </div>

      {/* Полоса освоения: сколько от собранного уже потрачено. */}
      {собрано > 0 && (
        <>
          <div className="kredit-bar proekt-bar" title={`Освоено ${pct(p.освоено * 100, 0)} собранного`}>
            <span style={{ width: `${Math.round(p.освоено * 100)}%` }} />
          </div>
          <div className="faint small">
            собрано {money(собрано)} · освоено {money(p.потрачено)} · осталось{' '}
            <b>{money(Math.max(0, собрано - p.потрачено))}</b>
          </div>
        </>
      )}

      {/* Свои деньги, вложенные в проект, и своя доля, забранная из него. */}
      {(p.внесено > 0 || p.выведено > 0) && (
        <div className="faint small" style={{ marginTop: 6 }}>
          {p.внесено > 0 && <>Вложено своих {money(p.внесено)}. </>}
          {p.выведено > 0 && <>Взято себе {money(p.выведено)} — доходом это не считается, заведите приход, если деньги ваши.</>}
        </div>
      )}

      {p.остатокъ < 0 && (
        <div className="small neg" style={{ marginTop: 6 }}>
          Проект ушёл в минус на {money(-p.остатокъ)}: потрачено больше, чем собрано.
        </div>
      )}

      {/* Куда ушли деньги проекта. Отчитываться придётся именно этим. */}
      {p.статьи.length > 0 && (
        <div className="faint small" style={{ marginTop: 8 }}>
          Потрачено с этого счёта {money(p.потрачено)}:{' '}
          {p.статьи.slice(0, 4).map((t, i) => (
            <span key={t.categoryId ?? 'нет'}>
              {i > 0 && ', '}{статья(t.categoryId)} {money(t.amount)}
            </span>
          ))}
          {p.статьи.length > 4 && ` и ещё ${p.статьи.length - 4}`}
        </div>
      )}

      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn sm" onClick={() => app.editTransaction({ kind: 'income', accountId: p.acc.id })}>
          Приход по проекту
        </button>
        <button className="btn sm ghost" onClick={() => app.editTransaction({ kind: 'expense', accountId: p.acc.id })}>
          Потратить с проекта
        </button>
        <button
          className="btn sm ghost"
          onClick={() => app.editTransaction({ kind: 'transfer', accountId: p.acc.id })}
          title="Перевести часть себе — это перемещение, а не доход"
        >
          Взять себе
        </button>
      </div>
    </div>
  )
}
