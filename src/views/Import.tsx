import React, { useMemo, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, uid } from '../lib/format'
import { humanDate } from '../lib/date'
import { bridge } from '../state/vault'
import {
  buildPreview, guessColumns, parseCsv, rowsToTransactions,
  type ColumnMap, type CsvTable, type ImportPreviewRow,
} from '../engine/csv'
import { Field, Tbl, useToast } from '../components/ui'
import type { ImportRule } from '../lib/types'

export default function ImportView() {
  const app = useApp()
  const { data, setData, setImportRules } = useStore()
  const toast = useToast()

  const [file, setFile] = useState<string>('')
  const [table, setTable] = useState<CsvTable | null>(null)
  const [map, setMap] = useState<ColumnMap>({ date: 0, amount: 1, description: 2 })
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [accountId, setAccountId] = useState(data.accounts.find((a) => a.type === 'card')?.id ?? data.accounts[0]?.id ?? '')
  const [skipDup, setSkipDup] = useState(true)

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])

  const pick = async () => {
    const res = await bridge.openText([{ name: 'Выписка', extensions: ['csv', 'txt'] }])
    if (!res) return
    const t = parseCsv(res.text)
    const m = guessColumns(t.header)
    setFile(res.name)
    setTable(t)
    setMap(m)
    setRows(buildPreview(t, m, data.importRules, data.transactions))
  }

  const remap = (m: ColumnMap) => {
    setMap(m)
    if (table) setRows(buildPreview(table, m, data.importRules, data.transactions))
  }

  const doImport = () => {
    const list = rows.filter((r) => r.include && (!skipDup || !r.duplicate))
    if (!list.length) {
      toast('Нечего импортировать')
      return
    }
    const txs = rowsToTransactions(list, accountId)
    const months = [...new Set(txs.map((t) => t.date.slice(0, 7)))]
    setData((d) => ({ ...d, transactions: [...d.transactions, ...txs] }), months)
    toast(`Импортировано операций: ${txs.length}`)
    setRows([])
    setTable(null)
    setFile('')
    app.openTab('transactions')
  }

  const included = rows.filter((r) => r.include && (!skipDup || !r.duplicate))
  const sumIn = included.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const sumOut = included.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0)
  const dups = rows.filter((r) => r.duplicate).length
  const uncategorized = included.filter((r) => !r.categoryId).length

  return (
    <div className="view wide">
      <div className="view-head">
        <div>
          <h1 className="view-title">Импорт выписки</h1>
          <div className="view-sub">
            Любой CSV: колонки сопоставляются вручную, категории проставляются по правилам,
            повторы отлавливаются по дате, сумме и описанию
          </div>
        </div>
        <button className="btn primary" onClick={pick}>
          <Icon name="download" size={15} /> Выбрать файл
        </button>
      </div>

      {!table && (
        <div className="card">
          <div className="advice-body" style={{ lineHeight: 1.7 }}>
            <b>Как это работает.</b> Выгрузите операции из банка в CSV и откройте файл здесь.
            Кошель определит разделитель и кодировку (в том числе windows-1251, в которой приходит
            большинство российских выписок), попробует угадать колонки с датой, суммой и описанием —
            а вы поправите, если он ошибся.
            <br />
            <br />
            Дальше по правилам ниже операциям проставятся категории: правило — это просто кусок текста
            из описания. Например, «пятёрочка» → Продукты. Что не распозналось, останется без категории
            и будет ждать в разделе «Операции».
          </div>
        </div>
      )}

      {table && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row" style={{ marginBottom: 12 }}>
              <Icon name="note" size={16} />
              <span className="strong">{file}</span>
              <span className="faint small">
                {table.rows.length} строк · разделитель «{table.delimiter === '\t' ? 'таб' : table.delimiter}»
              </span>
              <span className="spacer" />
              <button className="btn sm ghost" onClick={() => { setTable(null); setRows([]) }}>Отменить</button>
            </div>

            <div className="grid c4">
              <Field label="Колонка с датой">
                <select value={map.date} onChange={(e) => remap({ ...map, date: Number(e.target.value) })}>
                  {table.header.map((h, i) => (
                    <option key={i} value={i}>{h || `колонка ${i + 1}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Колонка с суммой">
                <select value={map.amount} onChange={(e) => remap({ ...map, amount: Number(e.target.value) })}>
                  {table.header.map((h, i) => (
                    <option key={i} value={i}>{h || `колонка ${i + 1}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Отдельная колонка прихода" hint="Если приход и расход разнесены">
                <select
                  value={map.amountIn ?? ''}
                  onChange={(e) => remap({ ...map, amountIn: e.target.value === '' ? undefined : Number(e.target.value) })}
                >
                  <option value="">нет</option>
                  {table.header.map((h, i) => (
                    <option key={i} value={i}>{h || `колонка ${i + 1}`}</option>
                  ))}
                </select>
              </Field>
              <Field label="Колонка с описанием">
                <select value={map.description} onChange={(e) => remap({ ...map, description: Number(e.target.value) })}>
                  {table.header.map((h, i) => (
                    <option key={i} value={i}>{h || `колонка ${i + 1}`}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="row wrap" style={{ gap: 12, marginTop: 6 }}>
              <div style={{ width: 220 }}>
                <Field label="Импортировать на счёт">
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {data.accounts.filter((a) => !a.archived).map((a) => (
                      <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <button className={'chip' + (skipDup ? ' on' : '')} onClick={() => setSkipDup((v) => !v)}>
                пропускать повторы ({dups})
              </button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row">
              <div className="stat">
                <span className="l">К импорту</span>
                <span className="v">{included.length}</span>
              </div>
              <span className="spacer" />
              <div className="stat">
                <span className="l">Приход</span>
                <span className="v amount in"><span className="sign">+</span>{money(sumIn)}</span>
              </div>
              <span className="spacer" />
              <div className="stat">
                <span className="l">Расход</span>
                <span className="v amount out"><span className="sign">−</span>{money(sumOut)}</span>
              </div>
              <span className="spacer" />
              <div className="stat">
                <span className="l">Без категории</span>
                <span className="v">{uncategorized}</span>
              </div>
              <span className="spacer" />
              <button className="btn primary" onClick={doImport}>
                <Icon name="check" size={15} /> Импортировать {included.length}
              </button>
            </div>
          </div>

          <div className="card">
            <Tbl>
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Дата</th>
                  <th>Описание</th>
                  <th>Категория</th>
                  <th className="r">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r, i) => (
                  <tr key={i} style={{ opacity: r.include && (!skipDup || !r.duplicate) ? 1 : 0.4 }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => setRows((l) => l.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                        style={{ width: 15, height: 15 }}
                      />
                    </td>
                    <td className="faint nowrap">{humanDate(r.date, true)}</td>
                    <td>
                      {r.description}
                      {r.duplicate && <span className="badge warn" style={{ marginLeft: 8 }}>похоже на повтор</span>}
                    </td>
                    <td>
                      <select
                        value={r.categoryId ?? ''}
                        onChange={(e) => setRows((l) => l.map((x, j) => (j === i ? { ...x, categoryId: e.target.value || undefined } : x)))}
                        className="in-cat"
                      >
                        <option value="">—</option>
                        {data.categories
                          .filter((c) => !c.archived && c.kind === (r.amount > 0 ? 'income' : 'expense'))
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                      </select>
                    </td>
                    <td className={'r num ' + (r.amount > 0 ? 'pos' : '')}>{money(r.amount, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </Tbl>
            {rows.length > 300 && <div className="faint small center" style={{ padding: 10 }}>Показаны первые 300 строк из {rows.length}</div>}
          </div>
        </>
      )}

      <RulesEditor />
    </div>
  )
}

function RulesEditor() {
  const { data, setImportRules } = useStore()
  const [draft, setDraft] = useState('')
  const [catId, setCatId] = useState('')

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title"><Icon name="filter" size={14} /> Правила автокатегоризации</div>
      <div className="faint small" style={{ marginBottom: 12 }}>
        Если описание операции содержит указанный текст, категория проставится сама.
        Регистр не важен, проверка идёт по вхождению подстроки.
      </div>

      {data.importRules.map((r) => (
        <div key={r.id} className="row" style={{ gap: 8, marginBottom: 6 }}>
          <input
            type="text"
            value={r.match}
            onChange={(e) => setImportRules(data.importRules.map((x) => (x.id === r.id ? { ...x, match: e.target.value } : x)))}
            style={{ width: 240 }}
          />
          <Icon name="arrowRight" size={14} />
          <select
            value={r.categoryId}
            onChange={(e) => setImportRules(data.importRules.map((x) => (x.id === r.id ? { ...x, categoryId: e.target.value } : x)))}
            style={{ width: 200 }}
          >
            {data.categories.filter((c) => !c.archived).map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          <button className="icon-btn" onClick={() => setImportRules(data.importRules.filter((x) => x.id !== r.id))}>
            <Icon name="x" size={15} />
          </button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input
          type="text"
          placeholder="текст в описании"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ width: 240 }}
        />
        <Icon name="arrowRight" size={14} />
        <select value={catId} onChange={(e) => setCatId(e.target.value)} style={{ width: 200 }}>
          <option value="">выберите категорию</option>
          {data.categories.filter((c) => !c.archived).map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
        <button
          className="btn sm"
          disabled={!draft.trim() || !catId}
          onClick={() => {
            setImportRules([...data.importRules, { id: uid('r'), match: draft.trim(), categoryId: catId }])
            setDraft('')
            setCatId('')
          }}
        >
          <Icon name="plus" size={13} /> Добавить
        </button>
      </div>
    </div>
  )
}
