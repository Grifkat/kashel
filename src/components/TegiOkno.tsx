import React, { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { Confirm, Modal, useToast } from './ui'
import { Icon } from '../lib/icons'
import { plural } from '../lib/format'
import { всеТеги, переименоватьТег, чистыйТег } from '../engine/tegi'
import { т, тр } from '../i18n'

/**
 * Окно «Теги»: переименовать или удалить тег сразу во всех операциях.
 *
 * Новое имя, совпадающее с уже существующим тегом, сливает их — так
 * исправляется опечатка: «ройка» переименовывается в «тройка».
 */
export function TegiOkno({ onClose }: { onClose: () => void }) {
  const { data, setData } = useStore()
  const toast = useToast()
  const теги = useMemo(() => всеТеги(data), [data])
  const [правка, setПравка] = useState<Record<string, string>>({})
  const [удалить, setУдалить] = useState<string | null>(null)

  const применить = (было: string, стало: string) => {
    const итогъ = переименоватьТег(data, было, стало)
    if (!итогъ.операций) return
    // Операции переписываются по своим месяцам, а регулярные правила живут в
    // основном файле — его тоже надо отметить к записи.
    setData((d) => {
      const { transactions, recurring } = переименоватьТег(d, было, стало)
      return { ...d, transactions, recurring }
    }, итогъ.месяцы)
    setData((d) => d)
    setПравка((п) => {
      const { [было]: _, ...прочее } = п
      return прочее
    })
    const новое = чистыйТег(стало)
    toast(новое
      ? т('#{0} → #{1}: {2} {3}', было, новое, итогъ.операций, plural(итогъ.операций, 'операция', 'операции', 'операций'))
      : т('Тег #{0} убран из {1} {2}', было, итогъ.операций, plural(итогъ.операций, 'операции', 'операций', 'операций')))
  }

  return (
    <>
      <Modal
        title={т('Теги')}
        icon="tag"
        onClose={onClose}
        footer={<button className="btn" onClick={onClose}>{т('Готово')}</button>}
      >
        <div className="faint small" style={{ marginBottom: 12, lineHeight: 1.55 }}>
          {т('Новое имя меняет тег во всех операциях. Если такой тег уже есть — они сольются в один: так исправляется опечатка.')}</div>
        {!теги.length && <div className="faint">{т('Тегов пока нет.')}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {теги.map(({ тег, сколько }) => {
            const значеніе = правка[тег] ?? тег
            const измѣнёнъ = чистыйТег(значеніе) !== тег
            return (
              <div key={тег} className="row" style={{ gap: 8 }}>
                <span className="faint" style={{ width: 14 }}>#</span>
                <input
                  type="text"
                  value={значеніе}
                  onChange={(e) => setПравка((п) => ({ ...п, [тег]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && измѣнёнъ && чистыйТег(значеніе)) применить(тег, значеніе)
                  }}
                  style={{ flex: 1 }}
                />
                <span className="faint small nowrap" style={{ width: 90, textAlign: 'right' }}>
                  {тр('{0} {1}', сколько, plural(сколько, 'операция', 'операции', 'операций'))}</span>
                <button
                  className="btn sm"
                  disabled={!измѣнёнъ || !чистыйТег(значеніе)}
                  onClick={() => применить(тег, значеніе)}
                >
                  {т('Переименовать')}</button>
                <button className="icon-btn" title={т('Удалить тег из всех операций')} onClick={() => setУдалить(тег)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            )
          })}
        </div>
      </Modal>
      {удалить !== null && (
        <Confirm
          title={т('Удалить тег #{0}?', удалить)}
          text={т('Тег уберётся из всех операций. Сами операции останутся.')}
          onConfirm={() => применить(удалить, '')}
          onClose={() => setУдалить(null)}
        />
      )}
    </>
  )
}
