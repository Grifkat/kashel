import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../state/store'
import { Confirm, useToast } from './ui'
import { ContextMenu, type MenuItem } from './canvas/ContextMenu'
import { KategoriyaOkno } from './KategoriyaOkno'
import { подкатегории, возможныеРодители, родитель } from '../engine/podkategorii'
import type { Category } from '../lib/types'
import { т } from '../i18n'

/**
 * Меню категории по правому щелчку: изменить, сделать подкатегорией (или
 * главной), удалить. Одно на плитки быстрого ввода и окна операции.
 *
 * Меню и его окна рисуются поверх всего через портал: окно операции
 * анимируется сдвигом, и «fixed» внутри него считался бы от окна, а не от
 * экрана. Слой помечен data-escape-layer — Escape закрывает меню, а не окно.
 */
export function useKategoriyaMenyu() {
  const [меню, setМеню] = useState<{ cat: Category; x: number; y: number } | null>(null)
  const открыть = (cat: Category) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setМеню({ cat, x: e.clientX, y: e.clientY })
  }
  const узелъ = <KategoriyaMenyu меню={меню} onClose={() => setМеню(null)} />
  return { открыть, узелъ }
}

function KategoriyaMenyu({ меню, onClose }: { меню: { cat: Category; x: number; y: number } | null; onClose: () => void }) {
  const { data, upsertCategory, deleteCategory } = useStore()
  const toast = useToast()
  const [правка, setПравка] = useState<Category | null>(null)
  const [удалить, setУдалить] = useState<Category | null>(null)

  const cat = меню ? data.categories.find((c) => c.id === меню.cat.id) ?? меню.cat : null
  const items: MenuItem[] = []
  if (cat) {
    const естьДети = подкатегории(cat.id, data.categories).length > 0
    const главная = родитель(cat, data.categories)
    const куда = возможныеРодители(cat, data.categories).filter((c) => c.kind === cat.kind)
    items.push({ id: 'edit', label: т('Изменить'), icon: 'edit', onClick: () => setПравка(cat) })
    if (главная) {
      items.push({
        id: 'main',
        label: т('Сделать главной (убрать из «{0}»)', главная.name),
        icon: 'up',
        onClick: () => upsertCategory({ ...cat, parentId: undefined }),
      })
    }
    items.push({
      id: 'move',
      label: главная ? т('Перенести в другую главную…') : т('Сделать подкатегорией…'),
      icon: 'tag',
      disabled: естьДети || !куда.filter((c) => c.id !== главная?.id).length,
      hint: естьДети ? т('есть свои подкатегории') : undefined,
      children: куда
        .filter((c) => c.id !== главная?.id)
        .map((c) => ({
          id: 'to-' + c.id,
          label: c.name,
          onClick: () => {
            upsertCategory({ ...cat, parentId: c.id })
            toast(т('«{0}» теперь в «{1}»', cat.name, c.name))
          },
        })),
    })
    items.push({ id: 'del', label: т('Удалить'), icon: 'trash', danger: true, onClick: () => setУдалить(cat) })
  }

  return createPortal(
    <>
      {меню && cat && (
        <div data-escape-layer="">
          <ContextMenu x={меню.x} y={меню.y} title={cat.name} items={items} onClose={onClose} />
        </div>
      )}
      {правка && <KategoriyaOkno value={правка} onClose={() => setПравка(null)} />}
      {удалить && (
        <Confirm
          title={т('Удалить «{0}»?', удалить.name)}
          text={
            подкатегории(удалить.id, data.categories).length
              ? т('Операции этой категории останутся без категории, а её подкатегории станут главными. Если историю жалко — лучше убрать категорию в архив.')
              : т('Операции этой категории останутся, но потеряют привязку. Если нужно сохранить историю — лучше пометить категорию архивной.')
          }
          onConfirm={() => deleteCategory(удалить.id)}
          onClose={() => setУдалить(null)}
        />
      )}
    </>,
    document.body,
  )
}
