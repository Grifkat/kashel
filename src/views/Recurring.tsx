import React, { useMemo, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, plural, uid } from '../lib/format'
import { isCatalogIcon } from '../lib/catalog'
import { addMonths, humanDate, monthKey, today } from '../lib/date'
import { occurrencesInMonth } from '../engine/forecast'
import { findRepeats } from '../engine/repeats'
import { Avatar, ColorPicker, Confirm, Field, Modal, MoneyInput, Tbl, Toggle, useToast } from '../components/ui'
import type { Freq, Recurring, TxKind } from '../lib/types'

/** Один формат на колонку и на свёрнутую строку под названием. */
const freqText = (r: Recurring): string =>
  `${FREQ.find((f) => f.k === r.freq)?.t}${r.interval > 1 ? ` × ${r.interval}` : ''}` +
  (r.freq === 'monthly' && r.dayOfMonth ? `, ${r.dayOfMonth} числа` : '')

const FREQ: { k: Freq; t: string }[] = [
  { k: 'monthly', t: 'Ежемесячно' },
  { k: 'weekly', t: 'Еженедельно' },
  { k: 'yearly', t: 'Ежегодно' },
  { k: 'daily', t: 'Ежедневно' },
]

export default function RecurringView() {
  const app = useApp()
  const { data, upsertRecurring, deleteRecurring } = useStore()
  const toast = useToast()
  const [edit, setEdit] = useState<Recurring | null>(null)
  const [del, setDel] = useState<Recurring | null>(null)

  const cur = monthKey(today())
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories])
  const accById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a])), [data.accounts])

  const active = data.recurring.filter((r) => r.active)
  const monthlyExpense = active
    .filter((r) => r.kind === 'expense')
    .reduce((s, r) => s + r.amount * occurrencesInMonth(r, cur), 0)
  const monthlyIncome = active
    .filter((r) => r.kind === 'income')
    .reduce((s, r) => s + r.amount * occurrencesInMonth(r, cur), 0)

  // Повторы ищутся по всем операциям, поэтому считаем их один раз на снимок
  // данных: список из тысячи записей группировать на каждую перерисовку незачем.
  const повторы = useMemo(() => findRepeats(data).slice(0, 6), [data])

  const rows = [...data.recurring].sort(
    (a, b) => Number(b.active) - Number(a.active) || b.amount - a.amount,
  )

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">Регулярные платежи</h1>
          <div className="view-sub">
            Фиксировано {money(monthlyExpense)} расходов и {money(monthlyIncome)} доходов в месяц ·
            за год это {money(monthlyExpense * 12)} обязательных трат
          </div>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            setEdit({
              id: uid('r'), title: '', kind: 'expense', amount: 0,
              accountId: data.accounts[0]?.id ?? '', categoryId: data.categories.find((c) => c.kind === 'expense')?.id,
              freq: 'monthly', interval: 1, dayOfMonth: 1, startDate: today(),
              autoPost: true, tags: [], active: true,
            })
          }
        >
          <Icon name="plus" size={15} /> Добавить
        </button>
      </div>

      {/* Замеченные повторы. Показываем ДО таблицы: человек, который сюда
          зашёл, как раз и думает про регулярные платежи, а на дашборде эта
          подсказка была бы шумом. */}
      {повторы.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">
            <Icon name="repeat" size={14} /> Похоже, это повторяется
          </div>
          <div className="advice-body" style={{ marginBottom: 12 }}>
            Эти траты вы вносили руками, и они идут ровной суммой через равные промежутки.
            Регулярное правило поставит их в прогноз точной суммой в нужный месяц, а не
            размажет по среднему.
          </div>
          {повторы.map((h) => {
            const c = h.categoryId ? catById.get(h.categoryId) : undefined
            return (
              <div key={h.key} className="cat-row">
                <Avatar icon={c?.icon ?? 'repeat'} color={c?.color} size="sm" />
                <span className="name">
                  {h.note || c?.name || 'Без категории'}
                  <span className="d faint small">
                    {' '}{FREQ.find((f) => f.k === h.freq)?.t.toLowerCase()} · {h.dates.length}
                    {' '}{plural(h.dates.length, 'раз', 'раза', 'раз')} · последний {humanDate(h.dates[h.dates.length - 1])}
                  </span>
                </span>
                <span className={'amt num ' + (h.kind === 'income' ? 'pos' : '')}>
                  {h.kind === 'income' ? '+' : '−'}{money(h.amount)}
                </span>
                <button
                  className="btn sm"
                  onClick={() =>
                    setEdit({
                      id: uid('r'),
                      title: h.note || catById.get(h.categoryId ?? '')?.name || 'Повторяющийся платёж',
                      kind: h.kind, amount: h.amount, accountId: h.accountId, categoryId: h.categoryId,
                      freq: h.freq, interval: 1, dayOfMonth: h.dayOfMonth,
                      startDate: h.dates[h.dates.length - 1],
                      autoPost: false, tags: [], active: true,
                    })
                  }
                >
                  Сделать правилом
                </button>
              </div>
            )
          })}
          <div className="faint small" style={{ marginTop: 10 }}>
            Автосоздание операций в предложенном правиле выключено: иначе платёж, который вы
            и дальше будете вносить руками, посчитается дважды.
          </div>
        </div>
      )}

      <div className="card">
        <Tbl>
          <thead>
            <tr>
              <th>Название</th>
              <th className="col-opt">Категория</th>
              <th className="col-opt">Счёт</th>
              <th>Периодичность</th>
              <th className="r">Сумма</th>
              <th className="r col-opt">В год</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = r.categoryId ? catById.get(r.categoryId) : undefined
              const perYear = r.amount * (r.freq === 'monthly' ? 12 : r.freq === 'weekly' ? 52 : r.freq === 'daily' ? 365 : 1) / Math.max(1, r.interval)
              return (
                <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar
                        icon={c?.icon ?? (r.kind === 'income' ? 'banknote' : 'arrow-left-right')}
                        color={c?.color}
                        size="sm"
                      />
                      <span>{r.title}</span>
                      {r.autoPost && <span className="badge" title="Операции создаются автоматически">авто</span>}
                      {/* На узкой таблице колонка периодичности прячется, а её
                          содержимое всплывает здесь. */}
                      <span className="col-fold small faint">{freqText(r)}</span>
                    </div>
                  </td>
                  <td className="faint col-opt">{c?.name ?? '—'}</td>
                  <td className="faint col-opt">{accById.get(r.accountId)?.name ?? '—'}</td>
                  <td className="faint">
                    {freqText(r)}
                  </td>
                  <td className={'r num ' + (r.kind === 'income' ? 'pos' : '')}>
                    {r.kind === 'income' ? '+' : '−'}{money(r.amount)}
                  </td>
                  <td className="r num faint col-opt">{money(perYear)}</td>
                  <td className="r">
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                      <button
                        className="icon-btn"
                        title={r.active ? 'Приостановить' : 'Возобновить'}
                        onClick={() => upsertRecurring({ ...r, active: !r.active })}
                      >
                        <Icon name={r.active ? 'eye' : 'eyeOff'} size={15} />
                      </button>
                      <button className="icon-btn" onClick={() => setEdit(r)}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="icon-btn" onClick={() => setDel(r)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Tbl>
        {!rows.length && <div className="empty">Регулярных платежей нет</div>}
      </div>

      <div className="advice-card info" style={{ marginTop: 16 }}>
        <div className="advice-title">Зачем это нужно прогнозу</div>
        <div className="advice-body">
          Регулярные платежи попадают в прогноз как точные суммы, а не как усреднённая статистика.
          Чем больше обязательных платежей описано здесь, тем точнее прогноз и тем меньше «сюрпризов»
          в конце месяца. Их суммы при этом исключаются из расчёта переменной части категории,
          чтобы не считаться дважды.
        </div>
      </div>

      {edit && (
        <RecurringModal
          value={edit}
          onClose={() => setEdit(null)}
          onSave={(r) => {
            if (!r.title.trim() || !r.amount) {
              toast('Нужны название и сумма')
              return
            }
            // Без категории платёж раньше сохранялся молча и так же молча
            // выпадал из прогноза: человек заводил зарплату и не понимал,
            // почему линия не двинулась.
            if (r.kind !== 'transfer' && !r.categoryId) {
              toast('Выберите категорию — без неё платёж не попадёт в разбор по категориям')
              return
            }
            if (r.kind === 'transfer' && (!r.toAccountId || r.toAccountId === r.accountId)) {
              toast('Для перевода нужны два разных счёта')
              return
            }
            upsertRecurring(r)
            setEdit(null)
          }}
        />
      )}
      {del && (
        <Confirm
          title={`Удалить «${del.title}»?`}
          text="Уже созданные операции останутся. Если платёж просто закончился, лучше приостановить — история прогноза сохранится."
          onConfirm={() => deleteRecurring(del.id)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  )
}

/**
 * Значок из каталога — это имя вроде «credit-card»: в выпадающем списке
 * рисовать его нечем, и оно печаталось бы текстом рядом с названием.
 * Свой смайлик человека показываем как есть.
 */
const значок = (icon: string) => (isCatalogIcon(icon) ? '' : icon + ' ')

function RecurringModal({ value, onSave, onClose }: { value: Recurring; onSave: (r: Recurring) => void; onClose: () => void }) {
  const { data } = useStore()
  const [r, setR] = useState<Recurring>(value)
  const patch = (p: Partial<Recurring>) => setR((x) => ({ ...x, ...p }))
  const cats = data.categories.filter((c) => !c.archived && c.kind === (r.kind === 'income' ? 'income' : 'expense'))
  const chosen = r.categoryId ? data.categories.find((c) => c.id === r.categoryId) : undefined
  // Категория из архива в список не попадает, и выпадающий список молча
  // показывал бы «—», хотя правило по-прежнему на неё ссылается. Показываем
  // её явно, чтобы человек видел, на чём правило висит, и мог сменить.
  const options = chosen && !cats.some((c) => c.id === chosen.id) ? [...cats, chosen] : cats
  const catBad = !!chosen && (chosen.archived || (r.kind !== 'transfer' && chosen.kind !== r.kind))

  /**
   * Смена вида сбрасывает категорию чужого направления — та же защита, что в
   * карточке операции. Без неё расходная категория оставалась висеть на
   * доходном правиле: в списке её уже нет, но в поле она есть, и правило
   * сохранялось с чужой категорией.
   */
  const switchKind = (next: TxKind) => {
    patch({ kind: next })
    if (next === 'transfer') return
    const cat = data.categories.find((c) => c.id === r.categoryId)
    if (cat && cat.kind !== next) patch({ categoryId: undefined })
  }

  return (
    <Modal
      title={value.title ? 'Регулярный платёж' : 'Новый регулярный платёж'}
      icon="repeat"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" onClick={() => onSave(r)}>Сохранить</button>
        </>
      }
    >
      <Field label="Название">
        <input type="text" autoFocus value={r.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Подписка, аренда, зарплата" />
      </Field>

      {catBad && (
        <div className="advice-card warn" style={{ margin: '0 0 14px', padding: '10px 12px' }}>
          Категория «{chosen!.name}» {chosen!.archived ? 'лежит в архиве' : 'другого вида'}. Сумма в
          прогнозе считается, но в разбор по категориям платёж не попадёт — лучше выбрать другую.
        </div>
      )}

      <div className="seg" style={{ marginBottom: 14 }}>
        {(['expense', 'income', 'transfer'] as TxKind[]).map((k) => (
          <button key={k} className={r.kind === k ? 'on' : ''} onClick={() => switchKind(k)}>
            {k === 'expense' ? 'Расход' : k === 'income' ? 'Доход' : 'Перевод'}
          </button>
        ))}
      </div>

      <div className="grid c2">
        <Field label="Сумма">
          <MoneyInput value={r.amount || undefined} onChange={(v) => patch({ amount: v })} />
        </Field>
        <Field label="Счёт">
          <select value={r.accountId} onChange={(e) => patch({ accountId: e.target.value })}>
            {data.accounts.filter((a) => !a.archived).map((a) => (
              <option key={a.id} value={a.id}>{значок(a.icon)}{a.name}</option>
            ))}
          </select>
        </Field>
        {r.kind !== 'transfer' && (
          <Field label="Категория">
            <select value={r.categoryId ?? ''} onChange={(e) => patch({ categoryId: e.target.value || undefined })}>
              <option value="">— выберите —</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {значок(c.icon)}{c.name}
                  {c.archived ? ' (в архиве)' : c.kind !== r.kind ? ' (другой вид)' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {r.kind === 'transfer' && (
          <Field label="На счёт">
            <select value={r.toAccountId ?? ''} onChange={(e) => patch({ toAccountId: e.target.value || undefined })}>
              <option value="">—</option>
              {data.accounts.filter((a) => !a.archived && a.id !== r.accountId).map((a) => (
                <option key={a.id} value={a.id}>{значок(a.icon)}{a.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Периодичность">
          <select value={r.freq} onChange={(e) => patch({ freq: e.target.value as Freq })}>
            {FREQ.map((f) => (
              <option key={f.k} value={f.k}>{f.t}</option>
            ))}
          </select>
        </Field>
        <Field label="Каждые N периодов">
          <input type="number" min={1} value={r.interval} onChange={(e) => patch({ interval: Math.max(1, Number(e.target.value)) })} />
        </Field>
        {r.freq === 'monthly' && (
          <Field label="День месяца">
            <input type="number" min={1} max={31} value={r.dayOfMonth ?? 1} onChange={(e) => patch({ dayOfMonth: Number(e.target.value) })} />
          </Field>
        )}
        <Field label="Начало">
          <input type="date" value={r.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
        </Field>
        <Field label="Окончание" hint="Пусто — бессрочно">
          <input type="date" value={r.endDate ?? ''} onChange={(e) => patch({ endDate: e.target.value || undefined })} />
        </Field>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
        <Toggle checked={r.autoPost} onChange={(v) => patch({ autoPost: v })} label="Создавать операции автоматически" />
        <Toggle checked={r.active} onChange={(v) => patch({ active: v })} label="Активен" />
      </div>
    </Modal>
  )
}
