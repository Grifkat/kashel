import React, { useMemo, useState } from 'react'
import { useУдаление } from '../components/Udalenie'
import { цвѣтъПодсвѣтки } from '../components/effects'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, uid } from '../lib/format'
import { addMonths, today } from '../lib/date'
import { categoryMonthly, categoryTotals, median } from '../engine/stats'
import { historyKeys } from '../engine/forecast'
import { Avatar, Confirm, useToast } from '../components/ui'
import { Spark } from '../components/charts'
import type { Category } from '../lib/types'
import { BUCKETS, KategoriyaOkno } from '../components/KategoriyaOkno'
import { деревоКатегорий, подкатегории, семья } from '../engine/podkategorii'
import { личное } from '../engine/project'
import { т, тр } from '../i18n'


export default function Categories() {
  const app = useApp()
  const { data, upsertCategory, deleteCategory } = useStore()
  const toast = useToast()
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [edit, setEdit] = useState<Category | null>(null)
  const [del, setDel] = useState<Category | null>(null)
  const удаление = useУдаление()
  const удалить = (c: Category) => (подкатегории(c.id, data.categories).length ? setDel(c) : удаление.категорию(c.id))

  // Статистика по статьям — своя: проектные траты в неё не входят.
  const личн = личное(data)
  const keys = useMemo(() => historyKeys(личн.transactions, 12), [личн.transactions])
  const since = addMonths(today(), -3)
  const totals = useMemo(
    () => new Map(categoryTotals(личн.transactions.filter((t) => t.date >= since), kind).map((t) => [t.categoryId, t])),
    [личн.transactions, kind, since],
  )

  // Главные с подкатегориями под ними; поиск ищет и по имени главной.
  const [поиск, setПоиск] = useState('')
  const [раскрытые, setРаскрытые] = useState<Set<string>>(new Set())
  const переключить = (id: string) =>
    setРаскрытые((м) => {
      const н = new Set(м)
      if (н.has(id)) н.delete(id)
      else н.add(id)
      return н
    })
  const дерево = деревоКатегорий(data.categories.filter((c) => c.kind === kind && !c.archived), поиск)
  const главные = дерево.filter((x) => !x.главная).map((x) => x.cat)
  const детиПоиска = new Map<string, Category[]>()
  for (const x of дерево) {
    if (!x.главная) continue
    детиПоиска.set(x.главная.id, [...(детиПоиска.get(x.главная.id) ?? []), x.cat])
  }
  const вАрхиве = data.categories.filter((c) => c.kind === kind && c.archived)
  const [архивОткрыт, setАрхивОткрыт] = useState(false)

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Категории')}</h1>
          <div className="view-sub">{т('Иконка, цвет, месячный лимит и роль в правиле 50/30/20')}</div>
        </div>
        <div className="row">
          <div className="seg">
            <button className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>{т('Расходы')}</button>
            <button className={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>{т('Доходы')}</button>
          </div>
          <button
            className="btn primary"
            onClick={() =>
              setEdit({ id: uid('c'), name: '', kind, icon: '⭐', color: '#4cc46a', bucket: kind === 'expense' ? 'wants' : undefined })
            }
          >
            <Icon name="plus" size={15} /> {т(' Создать')}</button>
        </div>
      </div>

      <input
        type="search"
        placeholder={т('Найти категорию')}
        value={поиск}
        onChange={(e) => setПоиск(e.target.value)}
        style={{ maxWidth: 320, marginBottom: 14 }}
      />
      {!главные.length && <div className="empty">{т('Ничего не нашлось')}</div>}
      <div className="grid c2">
        {главные.map((c) => {
          const дети = детиПоиска.get(c.id) ?? []
          const всеДети = подкатегории(c.id, data.categories)
          const свои = семья(c.id, data.categories)
          // Главная считается вместе с подкатегориями: в ней всё, что к ней относится.
          const t = [...свои].reduce<{ amount: number; count: number } | null>((acc, id) => {
            const x = totals.get(id)
            return x ? { amount: (acc?.amount ?? 0) + x.amount, count: (acc?.count ?? 0) + x.count } : acc
          }, null)
          const hist = [...свои]
            .map((id) => categoryMonthly(личн.transactions, id, keys, false, c.kind))
            .reduce((a, b) => a.map((v, i) => v + (b[i] ?? 0)))
          const norm = median(hist.filter((v) => v > 0))
          const avg = t ? Math.round(t.amount / 3) : 0
          const overPlan = c.plan && avg > c.plan
          const раскрыта = раскрытые.has(c.id) || (!!поиск.trim() && дети.length > 0)
          return (
            <div key={c.id} className="card tight fx-glare" style={цвѣтъПодсвѣтки(c.color)}>
              <div className="row">
                <Avatar icon={c.icon} color={c.color} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <span className="strong">{c.name}</span>
                    {c.bucket && <span className="badge">{BUCKETS.find((b) => b.k === c.bucket)?.t}</span>}
                    {c.capital && <span className="badge">{т('с капитала')}</span>}
                  </div>
                  <div className="faint small">
                    {avg ? т('{0} в месяц в среднем', money(avg)) : т('нет операций за 3 месяца')}
                    {c.plan ? т(' · лимит {0}', money(c.plan)) : ''}
                  </div>
                </div>
                <Spark values={hist} color={c.color} />
                <button className="icon-btn" onClick={() => setEdit(c)} title={т('Изменить')}>
                  <Icon name="edit" size={15} />
                </button>
              </div>
              {c.plan ? (
                <div style={{ marginTop: 9 }}>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${Math.min(100, (avg / c.plan) * 100)}%`,
                        background: overPlan ? 'var(--alert)' : c.color,
                      }}
                    />
                  </div>
                  <div className={'small ' + (overPlan ? 'neg' : 'faint')} style={{ marginTop: 4 }}>
                    {overPlan
                      ? т('в среднем на {0} выше лимита', money(avg - c.plan))
                      : т('запас {0} к лимиту', money(c.plan - avg))}
                  </div>
                </div>
              ) : (
                norm > 0 && (
                  <button
                    className="btn sm ghost"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      upsertCategory({ ...c, plan: Math.ceil(norm / 50000) * 50000 })
                      toast(т('Лимит для «{0}» — {1}', c.name, money(Math.ceil(norm / 50000) * 50000)))
                    }}
                  >
                    <Icon name="scale" size={13} /> {тр(' Поставить лимит по медиане ({0})', money(Math.ceil(norm / 50000) * 50000))}</button>
                )
              )}

              {раскрыта && (
                <div className="kat-deti">
                  {/* Траты, записанные прямо в главную, — отдельной строкой. */}
                  {(totals.get(c.id)?.amount ?? 0) > 0 && (
                    <div className="row small kat-rebenok">
                      <span className="faint" style={{ flex: 1 }}>{т('{0} — без подкатегории', c.name)}</span>
                      <span className="num">{т('{0} в месяц', money(Math.round((totals.get(c.id)?.amount ?? 0) / 3)))}</span>
                    </div>
                  )}
                  {дети.map((д) => (
                    <div key={д.id} className="row small kat-rebenok">
                      <Avatar icon={д.icon} color={д.color} size="sm" />
                      <span style={{ flex: 1, minWidth: 0 }} className="schet-vybor-name">{д.name}</span>
                      <span className="num faint">
                        {totals.get(д.id) ? т('{0} в месяц', money(Math.round(totals.get(д.id)!.amount / 3))) : '—'}</span>
                      {д.plan ? <span className="badge">{т('лимит {0}', money(д.plan))}</span> : null}
                      <button className="icon-btn" onClick={() => app.openTab('transactions', 'cat:' + д.id, { title: д.name })} title={т('Операции')}>
                        <Icon name="list" size={13} />
                      </button>
                      <button className="icon-btn" onClick={() => setEdit(д)} title={т('Изменить')}>
                        <Icon name="edit" size={13} />
                      </button>
                      <button className="icon-btn" onClick={() => удалить(д)} title={т('Удалить')}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <button
                  className="btn sm ghost"
                  onClick={() => app.openTab('transactions', 'cat:' + c.id, { title: c.name })}
                >
                  {тр('Операции{0}', t ? ` (${t.count})` : '')}</button>
                {всеДети.length > 0 && (
                  <button className="btn sm ghost" onClick={() => переключить(c.id)}>
                    <Icon name={раскрыта ? 'up' : 'down'} size={13} /> {т(' Подкатегории: {0}', всеДети.length)}</button>
                )}
                <button
                  className="btn sm ghost"
                  title={т('Новая подкатегория в «{0}»', c.name)}
                  onClick={() => setEdit({ id: uid('c'), name: '', kind: c.kind, icon: '⭐', color: c.color, parentId: c.id, bucket: c.bucket })}
                >
                  <Icon name="plus" size={13} /> {т(' Подкатегория')}</button>
                <span className="spacer" />
                <button className="btn sm danger" onClick={() => удалить(c)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {вАрхиве.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <button className="btn sm ghost" onClick={() => setАрхивОткрыт((v) => !v)}>
            <Icon name={архивОткрыт ? 'up' : 'down'} size={13} /> {т(' В архиве: {0}', вАрхиве.length)}</button>
          {архивОткрыт && (
            <div className="grid c3" style={{ marginTop: 10, opacity: 0.75 }}>
              {вАрхиве.map((c) => (
                <div key={c.id} className="card tight row" style={{ gap: 10 }}>
                  <Avatar icon={c.icon} color={c.color} />
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <button className="btn sm" onClick={() => upsertCategory({ ...c, archived: undefined })}>{т('Вернуть')}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {edit && (
        <KategoriyaOkno
          value={edit}
          onClose={() => setEdit(null)}
          onSave={(c) => {
            upsertCategory(c)
            setEdit(null)
          }}
        />
      )}

      {del && (
        <Confirm
          title={т('Удалить «{0}»?', del.name)}
          text={т('Операции этой категории останутся без категории, а её подкатегории станут главными. Сразу после удаления всё можно вернуть кнопкой «Отменить».')}
          onConfirm={() => удаление.категорию(del.id)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  )
}
