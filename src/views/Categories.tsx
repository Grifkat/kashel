import React, { useMemo, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, uid } from '../lib/format'
import { addMonths, today } from '../lib/date'
import { categoryMonthly, categoryTotals, median } from '../engine/stats'
import { historyKeys } from '../engine/forecast'
import { Avatar, Confirm, Field, IconPicker, Modal, ColorPicker, MoneyInput, useToast } from '../components/ui'
import { Spark } from '../components/charts'
import type { Bucket, Category } from '../lib/types'
import { личное } from '../engine/project'

const BUCKETS: { k: Bucket; t: string; hint: string }[] = [
  { k: 'needs', t: 'Надо', hint: 'обязательные траты: жильё, еда, транспорт' },
  { k: 'wants', t: 'Хочу', hint: 'необязательные: кафе, развлечения, доставка' },
  { k: 'savings', t: 'Вклад в будущее', hint: 'накопления, обучение, здоровье-профилактика' },
]

export default function Categories() {
  const app = useApp()
  const { data, upsertCategory, deleteCategory } = useStore()
  const toast = useToast()
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [edit, setEdit] = useState<Category | null>(null)
  const [del, setDel] = useState<Category | null>(null)

  // Статистика по статьям — своя: проектные траты в неё не входят.
  const личн = личное(data)
  const keys = useMemo(() => historyKeys(личн.transactions, 12), [личн.transactions])
  const since = addMonths(today(), -3)
  const totals = useMemo(
    () => new Map(categoryTotals(личн.transactions.filter((t) => t.date >= since), kind).map((t) => [t.categoryId, t])),
    [личн.transactions, kind, since],
  )

  const list = data.categories.filter((c) => c.kind === kind && !c.archived)

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Категории</h1>
          <div className="view-sub">Иконка, цвет, месячный лимит и роль в правиле 50/30/20</div>
        </div>
        <div className="row">
          <div className="seg">
            <button className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>Расходы</button>
            <button className={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>Доходы</button>
          </div>
          <button
            className="btn primary"
            onClick={() =>
              setEdit({ id: uid('c'), name: '', kind, icon: '⭐', color: '#4cc46a', bucket: kind === 'expense' ? 'wants' : undefined })
            }
          >
            <Icon name="plus" size={15} /> Создать
          </button>
        </div>
      </div>

      <div className="grid c2">
        {list.map((c) => {
          const t = totals.get(c.id)
          const hist = categoryMonthly(личн.transactions, c.id, keys, false, c.kind)
          const norm = median(hist.filter((v) => v > 0))
          const avg = t ? Math.round(t.amount / 3) : 0
          const overPlan = c.plan && avg > c.plan
          return (
            <div key={c.id} className="card tight fx-glare">
              <div className="row">
                <Avatar icon={c.icon} color={c.color} size="lg" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <span className="strong">{c.name}</span>
                    {c.bucket && <span className="badge">{BUCKETS.find((b) => b.k === c.bucket)?.t}</span>}
                    {c.capital && <span className="badge">с капитала</span>}
                  </div>
                  <div className="faint small">
                    {avg ? `${money(avg)} в месяц в среднем` : 'нет операций за 3 месяца'}
                    {c.plan ? ` · лимит ${money(c.plan)}` : ''}
                  </div>
                </div>
                <Spark values={hist} color={c.color} />
                <button className="icon-btn" onClick={() => setEdit(c)} title="Изменить">
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
                      ? `в среднем на ${money(avg - c.plan)} выше лимита`
                      : `запас ${money(c.plan - avg)} к лимиту`}
                  </div>
                </div>
              ) : (
                norm > 0 && (
                  <button
                    className="btn sm ghost"
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      upsertCategory({ ...c, plan: Math.ceil(norm / 50000) * 50000 })
                      toast(`Лимит для «${c.name}» — ${money(Math.ceil(norm / 50000) * 50000)}`)
                    }}
                  >
                    <Icon name="scale" size={13} /> Поставить лимит по медиане ({money(Math.ceil(norm / 50000) * 50000)})
                  </button>
                )
              )}
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <button
                  className="btn sm ghost"
                  onClick={() => app.openTab('transactions', 'cat:' + c.id, { title: c.name })}
                >
                  Операции{t ? ` (${t.count})` : ''}
                </button>
                <span className="spacer" />
                <button className="btn sm danger" onClick={() => setDel(c)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {edit && (
        <CategoryModal
          value={edit}
          onClose={() => setEdit(null)}
          onSave={(c) => {
            if (!c.name.trim()) {
              toast('Введите название категории')
              return
            }
            upsertCategory(c)
            setEdit(null)
          }}
        />
      )}

      {del && (
        <Confirm
          title={`Удалить «${del.name}»?`}
          text="Операции этой категории останутся, но потеряют привязку. Если нужно сохранить историю — лучше пометить категорию архивной."
          onConfirm={() => deleteCategory(del.id)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  )
}

function CategoryModal({
  value,
  onSave,
  onClose,
}: {
  value: Category
  onSave: (c: Category) => void
  onClose: () => void
}) {
  const [c, setC] = useState<Category>(value)
  const [pick, setPick] = useState(false)
  const patch = (p: Partial<Category>) => setC((x) => ({ ...x, ...p }))

  return (
    <>
      <Modal
        title={value.name ? 'Категория' : 'Создание категории'}
        icon="tag"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>Отмена</button>
            <button className="btn primary" onClick={() => onSave(c)}>Сохранить</button>
          </>
        }
      >
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <button className="icon-trigger" onClick={() => setPick(true)} title="Выбрать иконку и цвет">
            <Avatar icon={c.icon} color={c.color} size="lg" style={{ width: 54, height: 54 }} />
          </button>
          <div style={{ flex: 1 }}>
            <Field label="Название категории">
              <input type="text" autoFocus value={c.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="seg" style={{ marginBottom: 14 }}>
          <button className={c.kind === 'expense' ? 'on' : ''} onClick={() => patch({ kind: 'expense' })}>Расходы</button>
          <button className={c.kind === 'income' ? 'on' : ''} onClick={() => patch({ kind: 'income' })}>Доходы</button>
        </div>

        {c.kind === 'expense' && (
          <>
            <Field label="Планирую тратить в месяц" hint="Оставьте пустым, если лимит не нужен">
              <MoneyInput
                value={c.plan || undefined}
                placeholder="не задано"
                onChange={(v, empty) => patch({ plan: empty ? undefined : v })}
              />
            </Field>

            <div className="card-title">Роль в бюджете</div>
            <div className="row wrap" style={{ gap: 7, marginBottom: 6 }}>
              {BUCKETS.map((b) => (
                <span
                  key={b.k}
                  className={'chip' + (c.bucket === b.k ? ' on' : '')}
                  onClick={() => patch({ bucket: b.k })}
                  title={b.hint}
                >
                  {b.t}
                </span>
              ))}
            </div>
            <div className="faint small" style={{ marginBottom: 14 }}>
              {BUCKETS.find((b) => b.k === c.bucket)?.hint}
            </div>
          </>
        )}

        {c.kind === 'income' && (
          <>
            <div className="card-title">Откуда доход</div>
            <label className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={!!c.capital}
                onChange={(e) => patch({ capital: e.target.checked })}
                style={{ marginTop: 3 }}
              />
              <span>
                <span>Доход с капитала, а не с труда</span>
                <span className="d faint small">
                  {' '}
                  Дивиденды, купоны, аренда, проценты по вкладу. Отличить это от заработка
                  сама программа не может: в операции видно только сумму, счёт и статью.
                  Отметка ставится один раз и распространяется на всю историю по статье.
                </span>
              </span>
            </label>
          </>
        )}

        <div className="card-title">Цвет</div>
        <ColorPicker value={c.color} onChange={(color) => patch({ color })} />
      </Modal>
      {pick && (
        <IconPicker
          icon={c.icon}
          color={c.color}
          onChange={(icon, color) => patch({ icon, color })}
          onClose={() => setPick(false)}
        />
      )}
    </>
  )
}
