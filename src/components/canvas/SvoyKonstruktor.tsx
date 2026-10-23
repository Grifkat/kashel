import React, { useMemo, useRef, useState } from 'react'
import { Field, Modal, MoneyInput } from '../ui'
import { сЗначкомъ } from '../../lib/catalog'
import { CANVAS_COLORS } from '../../lib/emoji'
import { деревоКатегорий } from '../../engine/podkategorii'
import { всеТеги } from '../../engine/tegi'
import { имяСлова, посчитать, проверитьФормулу } from '../../engine/vidzhety'
import type { ПоказательВиджета, СвойВиджет, VaultData } from '../../lib/types'
import { т } from '../../i18n'
import { СвойВиджетВид, ВИДЫ_СВОЕГО, значениеСвоего } from './Svoy'
import type { Размер } from './Vidzhety'

/*
 * Конструктор своего виджета: что считать, по каким операциям, за какой
 * период, формула поверх и вид. Справа — живой предпросмотр того, что
 * ляжет на доску, слева — поля. Пустая формула — виджет показывает сам
 * выбранный показатель.
 */

const ПОКАЗАТЕЛИ: { id: ПоказательВиджета; name: string }[] = [
  { id: 'income', name: т('Доход') },
  { id: 'expense', name: т('Расход') },
  { id: 'balance', name: т('Остаток на счетах') },
  { id: 'net', name: т('Чистый поток') },
  { id: 'category', name: т('Сумма по категории') },
  { id: 'account', name: т('Остаток счёта') },
  { id: 'goal', name: т('Цель') },
  { id: 'count', name: т('Число операций') },
  { id: 'avg', name: т('Средний чек') },
]

const ПЕРИОДЫ: { id: СвойВиджет['period']; name: string }[] = [
  { id: 'board', name: т('Как у доски') },
  { id: '1m', name: т('месяц') },
  { id: '3m', name: т('3 мес') },
  { id: '12m', name: т('год') },
  { id: 'month', name: т('этот месяц') },
  { id: 'year', name: т('этот год') },
  { id: 'all', name: т('всё время') },
]

const РАЗМЕРЫ: { id: Размер; w: number; h: number }[] = [
  { id: 'S', w: 220, h: 130 },
  { id: 'M', w: 300, h: 200 },
  { id: 'L', w: 380, h: 280 },
]

/** Подпись, если человек её не вписал: по формуле или по показателю. */
export function подписьПоУмолчанию(w: СвойВиджет, data: VaultData): string {
  if (w.formula?.trim()) return w.formula.trim().slice(0, 40)
  const имя = ПОКАЗАТЕЛИ.find((п) => п.id === w.metric)!.name
  const ref = w.ref
  const чьё =
    w.metric === 'category' ? data.categories.find((c) => c.id === ref)?.name
      : w.metric === 'account' ? data.accounts.find((a) => a.id === ref)?.name
        : w.metric === 'goal' ? data.goals.find((g) => g.id === ref)?.name
          : undefined
  return чьё ?? имя
}

export function КонструкторВиджета({
  value,
  data,
  from,
  periodLabel,
  заголовок,
  кнопка,
  onSave,
  onClose,
}: {
  value: СвойВиджет
  data: VaultData
  /** Начало периода доски — для «Как у доски» и предпросмотра. */
  from: string
  periodLabel: string
  заголовок: string
  кнопка: string
  onSave(w: СвойВиджет): void
  onClose(): void
}) {
  const [w, setW] = useState<СвойВиджет>(value)
  const [размер, setРазмер] = useState<Размер>('M')
  const формулаRef = useRef<HTMLInputElement>(null)
  const patch = (p: Partial<СвойВиджет>) => setW((x) => ({ ...x, ...p }))
  const фильтр = w.filter ?? {}
  const patchФильтр = (p: Partial<NonNullable<СвойВиджет['filter']>>) => {
    const next = { ...фильтр, ...p }
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      const v = next[k]
      if (v === undefined || (Array.isArray(v) && !v.length)) delete next[k]
    }
    patch({ filter: Object.keys(next).length ? next : undefined })
  }

  const ошибка = useMemo(() => проверитьФормулу(w, data), [w, data])
  const итог = useMemo(() => (ошибка ? null : посчитать(w, data, from)), [w, data, from, ошибка])
  const теги = useMemo(() => всеТеги(data).slice(0, 24), [data])
  const категории = useMemo(() => деревоКатегорий(data.categories.filter((c) => !c.archived)), [data.categories])
  const счета = data.accounts.filter((a) => !a.archived)

  const вписать = (кусок: string) => {
    const el = формулаRef.current
    const был = w.formula ?? ''
    const at = el?.selectionStart ?? был.length
    const до = был.slice(0, at)
    const пробел = до && !/[\s(]$/.test(до) ? ' ' : ''
    patch({ formula: до + пробел + кусок + был.slice(at) })
    requestAnimationFrame(() => el?.focus())
  }
  const цитата = (имя: string) => (/^[\p{L}\p{N}_ ]+$/u.test(имя) ? имя : `«${имя}»`)
  const подсказки: string[] = [
    ...(['income', 'expense', 'balance', 'net', 'count', 'avg'] as const).map(имяСлова),
    ...data.categories.filter((c) => !c.archived && c.kind === 'expense').slice(0, 2).map((c) => `${имяСлова('expense')}:${цитата(c.name)}`),
    ...data.goals.slice(0, 2).map((g) => цитата(g.name)),
  ]

  const сохранить = () => {
    if (ошибка) {
      формулаRef.current?.focus()
      return
    }
    const имя = w.name.trim() || подписьПоУмолчанию(w, data)
    onSave({ ...w, name: имя, formula: w.formula?.trim() || undefined, updatedAt: new Date().toISOString() })
  }

  const нуженRef = !w.formula?.trim() && (w.metric === 'category' || w.metric === 'account' || w.metric === 'goal')
  const р = РАЗМЕРЫ.find((x) => x.id === размер)!
  const предпросмотр: СвойВиджет = { ...w, name: w.name.trim() || подписьПоУмолчанию(w, data) }

  return (
    <Modal
      wide
      title={заголовок}
      icon="sparkle"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{т('Отмена')}</button>
          <button className="btn primary svw-save" disabled={!!ошибка || (нуженRef && !w.ref)} onClick={сохранить}>{кнопка}</button>
        </>
      }
    >
      <div className="svw">
        <div className="svw-form">
          <div className="grid c2">
            <Field label={т('Подпись')}>
              <input type="text" className="svw-name" autoFocus value={w.name} placeholder={подписьПоУмолчанию(w, data)} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label={т('Цвет')}>
              <div className="svw-colors">
                <button type="button" className={'svw-color none' + (!w.color ? ' on' : '')} title={т('Как у карточки')} onClick={() => patch({ color: undefined })} />
                {CANVAS_COLORS.slice(0, 11).map((c) => (
                  <button key={c.hex} type="button" className={'svw-color' + (w.color === c.hex ? ' on' : '')} style={{ background: c.hex }} title={c.name} onClick={() => patch({ color: c.hex })} />
                ))}
              </div>
            </Field>
          </div>

          <div className="grid c2">
            <Field label={т('Что считать')} hint={w.formula?.trim() ? т('Сейчас считает формула ниже') : undefined}>
              <select className="svw-metric" disabled={!!w.formula?.trim()} value={w.metric} onChange={(e) => patch({ metric: e.target.value as ПоказательВиджета, ref: undefined })}>
                {ПОКАЗАТЕЛИ.map((п) => <option key={п.id} value={п.id}>{п.name}</option>)}
              </select>
            </Field>
            {нуженRef && (
              <Field label={w.metric === 'category' ? т('Категория или подкатегория') : w.metric === 'account' ? т('Счёт') : т('Цель')}>
                <select className="svw-ref" value={w.ref ?? ''} onChange={(e) => patch({ ref: e.target.value || undefined })}>
                  <option value="">{т('— выберите —')}</option>
                  {w.metric === 'category' && категории.map(({ cat, главная }) => (
                    <option key={cat.id} value={cat.id}>{(главная ? '   ' : '') + сЗначкомъ(cat.icon, cat.name)}</option>
                  ))}
                  {w.metric === 'account' && счета.map((a) => <option key={a.id} value={a.id}>{сЗначкомъ(a.icon, a.name)}</option>)}
                  {w.metric === 'goal' && data.goals.map((g) => <option key={g.id} value={g.id}>{сЗначкомъ(g.icon, g.name)}</option>)}
                </select>
              </Field>
            )}
          </div>

          <Field
            label={т('Формула — по желанию')}
            hint={т('Сложить, вычесть, умножить и разделить показатели; имена — как в подсказках ниже, с уточнением через двоеточие. Деньги в формуле — в рублях.')}
          >
            <input
              ref={формулаRef}
              type="text"
              className={'svw-formula mono' + (ошибка ? ' bad' : '')}
              value={w.formula ?? ''}
              placeholder={т('например: {0}', `${имяСлова('expense')}:${цитата(data.categories.find((c) => c.kind === 'expense')?.name ?? т('Еда'))} / ${имяСлова('income')} * 100`)}
              spellCheck={false}
              onChange={(e) => patch({ formula: e.target.value })}
            />
          </Field>
          {ошибка ? (
            <div className="svw-error" role="alert">
              {ошибка.ошибка}
              {ошибка.где > 0 && (w.formula ?? '').length > 0 && (
                <div className="svw-where mono">
                  {(w.formula ?? '').slice(0, ошибка.где)}<mark>{(w.formula ?? '').slice(ошибка.где, ошибка.где + 1) || ' '}</mark>{(w.formula ?? '').slice(ошибка.где + 1)}
                </div>
              )}
            </div>
          ) : w.formula?.trim() && итог ? (
            <div className="svw-result">= <b className="svw-value num">{значениеСвоего(data, итог.значение, итог.формат)}</b>{итог.примечание ? ' · ' + итог.примечание : ''}</div>
          ) : null}
          <div className="svw-chips">
            {подсказки.map((п) => (
              <button key={п} type="button" className="chip" onClick={() => вписать(п)}>{п}</button>
            ))}
            {['+', '−', '×', '/', '(', ')'].map((з) => (
              <button key={з} type="button" className="chip mono" onClick={() => вписать(з === '−' ? '-' : з === '×' ? '*' : з)}>{з}</button>
            ))}
          </div>
          {w.formula?.trim() && (
            <div className="svw-row">
              <span className="svw-label">{т('Писать как')}</span>
              <div className="seg">
                {([undefined, 'money', 'percent', 'number'] as const).map((ф) => (
                  <button key={ф ?? 'auto'} type="button" className={w.format === ф ? 'on' : ''} onClick={() => patch({ format: ф })}>
                    {ф === 'money' ? т('Деньги') : ф === 'percent' ? т('Процент') : ф === 'number' ? т('Число') : т('Авто')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="svw-sec">{т('Фильтры')}</div>
          <div className="svw-row">
            <span className="svw-label">{т('Деньги')}</span>
            <div className="seg">
              <button type="button" className={!фильтр.scope ? 'on' : ''} onClick={() => patchФильтр({ scope: undefined })}>{т('Личные')}</button>
              <button type="button" className={фильтр.scope === 'project' ? 'on' : ''} onClick={() => patchФильтр({ scope: 'project' })}>{т('Проектные')}</button>
              <button type="button" className={фильтр.scope === 'all' ? 'on' : ''} onClick={() => patchФильтр({ scope: 'all' })}>{т('Все')}</button>
            </div>
          </div>
          <div className="svw-row wrap">
            <span className="svw-label">{т('Счета')}</span>
            <div className="svw-chips">
              {счета.map((a) => {
                const on = !!фильтр.accounts?.includes(a.id)
                return (
                  <button key={a.id} type="button" className={'chip svw-acc' + (on ? ' on' : '')}
                    onClick={() => patchФильтр({ accounts: on ? фильтр.accounts!.filter((x) => x !== a.id) : [...(фильтр.accounts ?? []), a.id] })}>
                    {сЗначкомъ(a.icon, a.name)}
                  </button>
                )
              })}
              {!фильтр.accounts?.length && <span className="faint small">{т('все')}</span>}
            </div>
          </div>
          <div className="svw-row wrap">
            <span className="svw-label">{т('Категории')}</span>
            <div className="svw-chips">
              {(фильтр.categories ?? []).map((id) => {
                const c = data.categories.find((x) => x.id === id)
                return (
                  <button key={id} type="button" className="chip on" title={т('Убрать из фильтра')} onClick={() => patchФильтр({ categories: фильтр.categories!.filter((x) => x !== id) })}>
                    {c ? сЗначкомъ(c.icon, c.name) : id} ×
                  </button>
                )
              })}
              <select className="svw-addcat" value="" onChange={(e) => e.target.value && patchФильтр({ categories: [...(фильтр.categories ?? []), e.target.value] })}>
                <option value="">{фильтр.categories?.length ? т('+ ещё') : т('все — добавить…')}</option>
                {категории.filter(({ cat }) => !фильтр.categories?.includes(cat.id)).map(({ cat, главная }) => (
                  <option key={cat.id} value={cat.id}>{(главная ? '   ' : '') + сЗначкомъ(cat.icon, cat.name)}</option>
                ))}
              </select>
            </div>
          </div>
          {теги.length > 0 && (
            <div className="svw-row wrap">
              <span className="svw-label">{т('Теги')}</span>
              <div className="svw-chips">
                {теги.map(({ тег }) => {
                  const on = !!фильтр.tags?.includes(тег)
                  return (
                    <button key={тег} type="button" className={'chip' + (on ? ' on' : '')}
                      onClick={() => patchФильтр({ tags: on ? фильтр.tags!.filter((x) => x !== тег) : [...(фильтр.tags ?? []), тег] })}>
                      #{тег}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="svw-sec">{т('Период и вид')}</div>
          <div className="svw-row wrap">
            <span className="svw-label">{т('Период')}</span>
            <div className="seg svw-period">
              {ПЕРИОДЫ.map((п) => (
                <button key={п.id} type="button" className={w.period === п.id ? 'on' : ''} onClick={() => patch({ period: п.id })}>{п.name}</button>
              ))}
            </div>
          </div>
          <div className="svw-row wrap">
            <span className="svw-label">{т('Вид')}</span>
            <div className="seg svw-view">
              {ВИДЫ_СВОЕГО.map((в) => (
                <button key={в.id} type="button" data-view={в.id} className={w.view === в.id ? 'on' : ''} onClick={() => patch({ view: в.id })}>{в.name}</button>
              ))}
            </div>
          </div>
          {w.view === 'auto' && <div className="faint small svw-note">{т('«Авто» — как у готовых виджетов: маленький показывает число, средний — число и из чего оно, большой — столбцы.')}</div>}
          {(w.view === 'list' || w.view === 'pie') && (
            <div className="svw-row">
              <span className="svw-label">{т('Сколько показать')}</span>
              <input type="number" min={2} max={20} value={w.top ?? 5} style={{ width: 70 }} onChange={(e) => patch({ top: Math.min(20, Math.max(2, Number(e.target.value) || 5)) })} />
            </div>
          )}
          {w.view === 'progress' && !(w.metric === 'goal' && !w.formula?.trim()) && (
            <div className="svw-row">
              <span className="svw-label">{т('Цель')}</span>
              <MoneyInput value={w.target} onChange={(v, пусто) => patch({ target: пусто ? undefined : v })} placeholder={т('сколько нужно')} style={{ width: 160 }} />
            </div>
          )}
        </div>

        <div className="svw-side">
          <div className="svw-side-head">
            <span className="strong">{т('Предпросмотр')}</span>
            <div className="seg">
              {РАЗМЕРЫ.map((x) => (
                <button key={x.id} type="button" className={размер === x.id ? 'on' : ''} onClick={() => setРазмер(x.id)}>{x.id}</button>
              ))}
            </div>
          </div>
          <div className="svw-preview cnode cnode-rich cnode-t-widget" style={{ width: р.w, height: р.h, '--cnode-color': w.color || 'var(--accent)' } as React.CSSProperties}>
            <СвойВиджетВид w={предпросмотр} data={data} from={from} periodLabel={periodLabel} размер={размер} />
          </div>
          <div className="faint small" style={{ lineHeight: 1.5 }}>
            {т('Виджет ляжет в «Мои виджеты» и будет доступен на любой доске. Правка в библиотеке обновит все его копии.')}
          </div>
        </div>
      </div>
    </Modal>
  )
}
