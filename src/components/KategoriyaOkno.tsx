import React, { useState } from 'react'
import { useStore } from '../state/store'
import { Avatar, ColorPicker, Field, IconPicker, Modal, MoneyInput, useToast } from './ui'
import { KategoriyaVybor } from './KategoriyaVybor'
import { подкатегории, возможныеРодители, нельзяВложить } from '../engine/podkategorii'
import type { Bucket, Category } from '../lib/types'
import { т, тр } from '../i18n'

export const BUCKETS: { k: Bucket; t: string; hint: string }[] = [
  { k: 'needs', t: т('Надо'), hint: т('обязательные траты: жильё, еда, транспорт') },
  { k: 'wants', t: т('Хочу'), hint: т('необязательные: кафе, развлечения, доставка') },
  { k: 'savings', t: т('Вклад в будущее'), hint: т('накопления, обучение, здоровье-профилактика') },
]

/**
 * Окно категории: создание и правка. Одно на всю программу — открывается
 * из раздела «Категории», из плиток быстрого ввода и окна операции (правым
 * щелчком), чтобы правка не требовала уходить в другой раздел.
 *
 * Без onSave окно само записывает категорию.
 */
export function KategoriyaOkno({
  value,
  onSave,
  onClose,
}: {
  value: Category
  onSave?: (c: Category) => void
  onClose: () => void
}) {
  const { data, upsertCategory } = useStore()
  const toast = useToast()
  const [c, setC] = useState<Category>(value)
  const [pick, setPick] = useState(false)
  const patch = (p: Partial<Category>) => setC((x) => ({ ...x, ...p }))

  // Список «Главная категория»: только главные того же вида, не сама она.
  const все = data.categories.some((x) => x.id === c.id) ? data.categories.map((x) => (x.id === c.id ? c : x)) : [...data.categories, c]
  const дети = подкатегории(c.id, все)
  const родители = возможныеРодители(c, все).filter((x) => x.kind === c.kind)

  const сохранить = () => {
    if (!c.name.trim()) {
      toast(т('Введите название категории'))
      return
    }
    if (c.parentId && нельзяВложить(c, c.parentId, все)) {
      toast(т('Эту категорию нельзя сделать подкатегорией выбранной'))
      return
    }
    const готовая = { ...c, name: c.name.trim(), parentId: c.parentId || undefined }
    if (onSave) onSave(готовая)
    else {
      upsertCategory(готовая)
      onClose()
    }
  }

  return (
    <>
      <Modal
        title={data.categories.some((x) => x.id === value.id) ? т('Категория') : т('Создание категории')}
        icon="tag"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={onClose}>{т('Отмена')}</button>
            <button className="btn primary" onClick={сохранить}>{т('Сохранить')}</button>
          </>
        }
      >
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <button className="icon-trigger" onClick={() => setPick(true)} title={т('Выбрать иконку и цвет')}>
            <Avatar icon={c.icon} color={c.color} size="lg" style={{ width: 54, height: 54 }} />
          </button>
          <div style={{ flex: 1 }}>
            <Field label={т('Название категории')}>
              <input
                type="text"
                autoFocus
                value={c.name}
                onChange={(e) => patch({ name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && сохранить()}
              />
            </Field>
          </div>
        </div>

        <div className="seg" style={{ marginBottom: 14 }}>
          {/* Вид меняется — родитель другого вида снимается. */}
          <button className={c.kind === 'expense' ? 'on' : ''} onClick={() => patch({ kind: 'expense', parentId: undefined })}>{т('Расходы')}</button>
          <button className={c.kind === 'income' ? 'on' : ''} onClick={() => patch({ kind: 'income', parentId: undefined })}>{т('Доходы')}</button>
        </div>

        <Field
          label={т('Главная категория')}
          hint={дети.length
            ? т('Это главная категория: в ней подкатегорий — {0}. Подкатегорией она стать не может.', дети.length)
            : т('Подкатегория складывается в главную: в отчётах видна сумма, а по щелчку — из чего она.')}
        >
          {дети.length ? (
            <div className="faint small">{дети.map((д) => д.name).join(', ')}</div>
          ) : (
            <KategoriyaVybor
              value={c.parentId ?? ''}
              onChange={(id) => patch({ parentId: id || undefined })}
              cats={родители}
              pusto={т('— это главная категория')}
            />
          )}
        </Field>

        {c.kind === 'expense' && (
          <>
            <Field
              label={т('Планирую тратить в месяц')}
              hint={дети.length
                ? т('Лимит общий — на эту категорию вместе с подкатегориями.')
                : т('Оставьте пустым, если лимит не нужен')}
            >
              <MoneyInput
                value={c.plan || undefined}
                placeholder={т('не задано')}
                onChange={(v, empty) => patch({ plan: empty ? undefined : v })}
              />
            </Field>

            <div className="card-title">{т('Роль в бюджете')}</div>
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
            <div className="card-title">{т('Откуда доход')}</div>
            <label className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={!!c.capital}
                onChange={(e) => patch({ capital: e.target.checked })}
                style={{ marginTop: 3 }}
              />
              <span>
                <span>{т('Доход с капитала, а не с труда')}</span>
                <span className="d faint small">
                  {тр('{0}Дивиденды, купоны, аренда, проценты по вкладу. Отличить это от заработка сама программа не может: в операции видно только сумму, счёт и статью. Отметка ставится один раз и распространяется на всю историю по статье.', ' ')}</span>
              </span>
            </label>
          </>
        )}

        <div className="card-title">{т('Цвет')}</div>
        <ColorPicker value={c.color} onChange={(color) => patch({ color })} />

        {/* Архив — вместо удаления: история остаётся при статье, а в списках
            выбора её больше нет. Вернуть можно из списка «В архиве». */}
        <label className="row" style={{ gap: 8, marginTop: 14 }}>
          <input type="checkbox" checked={!!c.archived} onChange={(e) => patch({ archived: e.target.checked || undefined })} />
          <span>{т('В архиве (скрыта из списков, история остаётся)')}</span>
        </label>
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
