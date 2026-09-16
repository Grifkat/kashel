import React, { useMemo, useState } from 'react'
import { KategoriyaVybor } from '../components/KategoriyaVybor'
import { счётПоУмолчанию } from '../engine/stats'
import { сЗначкомъ } from '../lib/catalog'
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
import { т, тр } from '../i18n'

export default function ImportView() {
  const app = useApp()
  const { data, setData, setImportRules } = useStore()
  const toast = useToast()

  const [file, setFile] = useState<string>('')
  const [table, setTable] = useState<CsvTable | null>(null)
  const [map, setMap] = useState<ColumnMap>({ date: 0, amount: 1, description: 2 })
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [accountId, setAccountId] = useState(() => счётПоУмолчанию(data.accounts, data.transactions))
  const [skipDup, setSkipDup] = useState(true)

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])

  const pick = async () => {
    const res = await bridge.openText([{ name: т('Выписка'), extensions: ['csv', 'txt'] }])
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
      toast(т('Нечего импортировать'))
      return
    }
    const txs = rowsToTransactions(list, accountId)
    const months = [...new Set(txs.map((t) => t.date.slice(0, 7)))]
    setData((d) => ({ ...d, transactions: [...d.transactions, ...txs] }), months)
    toast(т('Импортировано операций: {0}', txs.length))
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
          <h1 className="view-title">{т('Импорт выписки')}</h1>
          <div className="view-sub">
            {т('Любой CSV: колонки сопоставляются вручную, категории проставляются по правилам, повторы отлавливаются по дате, сумме и описанию')}</div>
        </div>
        <button className="btn primary" onClick={pick}>
          <Icon name="download" size={15} /> {т(' Выбрать файл')}</button>
      </div>

      {!table && (
        <div className="card">
          <div className="advice-body" style={{ lineHeight: 1.7 }}>
            <b>{т('Как это работает.')}</b> {т(' Выгрузите операции из банка в CSV и откройте файл здесь. Кошель определит разделитель и кодировку (в том числе windows-1251, в которой приходит большинство российских выписок), попробует угадать колонки с датой, суммой и описанием — а вы поправите, если он ошибся.')}<br />
            <br />
            {т('Дальше по правилам ниже операциям проставятся категории: правило — это просто кусок текста из описания. Например, «пятёрочка» → Продукты. Что не распозналось, останется без категории и будет ждать в разделе «Операции».')}</div>
        </div>
      )}

      {table && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row" style={{ marginBottom: 12 }}>
              <Icon name="note" size={16} />
              <span className="strong">{file}</span>
              <span className="faint small">
                {тр('{0} строк · разделитель «{1}»', table.rows.length, table.delimiter === '\t' ? т('таб') : table.delimiter)}</span>
              <span className="spacer" />
              <button className="btn sm ghost" onClick={() => { setTable(null); setRows([]) }}>{т('Отменить')}</button>
            </div>

            <div className="grid c4">
              <Field label={т('Колонка с датой')}>
                <select value={map.date} onChange={(e) => remap({ ...map, date: Number(e.target.value) })}>
                  {table.header.map((h, i) => (
                    <option key={i} value={i}>{h || т('колонка {0}', i + 1)}</option>
                  ))}
                </select>
              </Field>
              <Field label={т('Колонка с суммой')}>
                <select value={map.amount} onChange={(e) => remap({ ...map, amount: Number(e.target.value) })}>
                  {table.header.map((h, i) => (
                    <option key={i} value={i}>{h || т('колонка {0}', i + 1)}</option>
                  ))}
                </select>
              </Field>
              <Field label={т('Отдельная колонка прихода')} hint={т('Если приход и расход разнесены')}>
                <select
                  value={map.amountIn ?? ''}
                  onChange={(e) => remap({ ...map, amountIn: e.target.value === '' ? undefined : Number(e.target.value) })}
                >
                  <option value="">{т('нет')}</option>
                  {table.header.map((h, i) => (
                    <option key={i} value={i}>{h || т('колонка {0}', i + 1)}</option>
                  ))}
                </select>
              </Field>
              <Field label={т('Колонка с описанием')}>
                <select value={map.description} onChange={(e) => remap({ ...map, description: Number(e.target.value) })}>
                  {table.header.map((h, i) => (
                    <option key={i} value={i}>{h || т('колонка {0}', i + 1)}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="row wrap" style={{ gap: 12, marginTop: 6 }}>
              <div style={{ width: 220 }}>
                <Field label={т('Импортировать на счёт')}>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    {data.accounts.filter((a) => !a.archived).map((a) => (
                      <option key={a.id} value={a.id}>{сЗначкомъ(a.icon, a.name)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <button className={'chip' + (skipDup ? ' on' : '')} onClick={() => setSkipDup((v) => !v)}>
                {тр('пропускать повторы ({0})', dups)}</button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row">
              <div className="stat">
                <span className="l">{т('К импорту')}</span>
                <span className="v">{included.length}</span>
              </div>
              <span className="spacer" />
              <div className="stat">
                <span className="l">{т('Приход')}</span>
                <span className="v amount in"><span className="sign">+</span>{money(sumIn)}</span>
              </div>
              <span className="spacer" />
              <div className="stat">
                <span className="l">{т('Расход')}</span>
                <span className="v amount out"><span className="sign">−</span>{money(sumOut)}</span>
              </div>
              <span className="spacer" />
              <div className="stat">
                <span className="l">{т('Без категории')}</span>
                <span className="v">{uncategorized}</span>
              </div>
              <span className="spacer" />
              <button className="btn primary" onClick={doImport}>
                <Icon name="check" size={15} /> {тр(' Импортировать {0}', included.length)}</button>
            </div>
          </div>

          <div className="card">
            <Tbl>
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>{т('Дата')}</th>
                  <th>{т('Описание')}</th>
                  <th>{т('Категория')}</th>
                  <th className="r">{т('Сумма')}</th>
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
                      {r.duplicate && <span className="badge warn" style={{ marginLeft: 8 }}>{т('похоже на повтор')}</span>}
                    </td>
                    <td>
                      <KategoriyaVybor
                        value={r.categoryId ?? ''}
                        onChange={(id) => setRows((l) => l.map((x, j) => (j === i ? { ...x, categoryId: id || undefined } : x)))}
                        cats={data.categories.filter((c) => !c.archived && c.kind === (r.amount > 0 ? 'income' : 'expense'))}
                        pusto="—"
                        style={{ minWidth: 180 }}
                      />
                    </td>
                    <td className={'r num ' + (r.amount > 0 ? 'pos' : '')}>{money(r.amount, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </Tbl>
            {rows.length > 300 && <div className="faint small center" style={{ padding: 10 }}>{тр('Показаны первые 300 строк из {0}', rows.length)}</div>}
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
      <div className="card-title"><Icon name="filter" size={14} /> {т(' Правила автокатегоризации')}</div>
      <div className="faint small" style={{ marginBottom: 12 }}>
        {т('Если описание операции содержит указанный текст, категория проставится сама. Регистр не важен, проверка идёт по вхождению подстроки.')}</div>

      {data.importRules.map((r) => (
        <div key={r.id} className="row" style={{ gap: 8, marginBottom: 6 }}>
          <input
            type="text"
            value={r.match}
            onChange={(e) => setImportRules(data.importRules.map((x) => (x.id === r.id ? { ...x, match: e.target.value } : x)))}
            style={{ width: 240 }}
          />
          <Icon name="arrowRight" size={14} />
          <KategoriyaVybor
            value={r.categoryId}
            onChange={(id) => setImportRules(data.importRules.map((x) => (x.id === r.id ? { ...x, categoryId: id } : x)))}
            cats={data.categories.filter((c) => !c.archived || c.id === r.categoryId)}
            style={{ width: 220 }}
          />
          <button className="icon-btn" onClick={() => setImportRules(data.importRules.filter((x) => x.id !== r.id))}>
            <Icon name="x" size={15} />
          </button>
        </div>
      ))}

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <input
          type="text"
          placeholder={т('текст в описании')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ width: 240 }}
        />
        <Icon name="arrowRight" size={14} />
        <KategoriyaVybor
          value={catId}
          onChange={setCatId}
          cats={data.categories.filter((c) => !c.archived)}
          pusto={т('выберите категорию')}
          style={{ width: 220 }}
        />
        <button
          className="btn sm"
          disabled={!draft.trim() || !catId}
          onClick={() => {
            setImportRules([...data.importRules, { id: uid('r'), match: draft.trim(), categoryId: catId }])
            setDraft('')
            setCatId('')
          }}
        >
          <Icon name="plus" size={13} /> {т(' Добавить')}</button>
      </div>
    </div>
  )
}
