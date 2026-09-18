/*
 * Настройка полосы значков слева: какие разделы на ней и в каком порядке.
 *
 * Открывается правым щелчком по полосе и из «Настроек». Разделы включаются
 * галочкой, порядок меняется стрелками или перетаскиванием. «Настройки»,
 * уведомления, оформление и поиск стоят внизу всегда: без них из программы
 * не выбраться, и прятать их нельзя.
 */
import { useState } from 'react'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { Modal, Toggle } from './ui'
import { т } from '../i18n'

export interface РазделЛенты {
  view: string
  title: string
  icon: string
}

export function НастройкаЛенты({
  все,
  исходные,
  onClose,
}: {
  /** Все разделы, которые можно поставить на полосу. */
  все: РазделЛенты[]
  /** Набор по умолчанию. */
  исходные: string[]
  onClose: () => void
}) {
  const { data, patchSettings } = useStore()
  const включены = (data.settings.ribbon ?? исходные).filter((v) => все.some((x) => x.view === v))
  const выключены = все.filter((x) => !включены.includes(x.view))
  const [тащим, setТащим] = useState<string | null>(null)
  const сохранить = (список: string[]) => patchSettings({ ribbon: список })
  const сдвинуть = (v: string, на: -1 | 1) => {
    const i = включены.indexOf(v)
    const j = i + на
    if (i < 0 || j < 0 || j >= включены.length) return
    const next = [...включены]
    ;[next[i], next[j]] = [next[j], next[i]]
    сохранить(next)
  }
  const строка = (x: РазделЛенты, вкл: boolean) => (
    <div
      key={x.view}
      className={'lenta-row' + (тащим === x.view ? ' drag' : '')}
      draggable={вкл}
      onDragStart={(e) => {
        setТащим(x.view)
        e.dataTransfer?.setData('text/plain', x.view)
      }}
      onDragOver={(e) => {
        if (тащим && вкл) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (!тащим || тащим === x.view) return
        const next = включены.filter((v) => v !== тащим)
        next.splice(next.indexOf(x.view), 0, тащим)
        сохранить(next)
        setТащим(null)
      }}
      onDragEnd={() => setТащим(null)}
    >
      {вкл ? <span className="lenta-grip" title={т('Потяните, чтобы переставить')}><Icon name="menu" size={14} /></span> : <span className="lenta-grip" />}
      <span className="lenta-icon"><Icon name={x.icon} size={16} /></span>
      <span className="lenta-name">{x.title}</span>
      {вкл && (
        <>
          <button className="icon-btn" title={т('Выше')} disabled={включены[0] === x.view} onClick={() => сдвинуть(x.view, -1)}>
            <Icon name="up" size={14} />
          </button>
          <button className="icon-btn" title={т('Ниже')} disabled={включены[включены.length - 1] === x.view} onClick={() => сдвинуть(x.view, 1)}>
            <Icon name="down" size={14} />
          </button>
        </>
      )}
      <Toggle
        checked={вкл}
        onChange={(v) => сохранить(v ? [...включены, x.view] : включены.filter((y) => y !== x.view))}
      />
    </div>
  )
  return (
    <Modal
      title={т('Полоса значков')}
      icon="panel"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => patchSettings({ ribbon: undefined })}>
            {т('Как было')}</button>
          <button className="btn primary" onClick={onClose}>{т('Готово')}</button>
        </>
      }
    >
      <div className="faint small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
        {т('Какие разделы стоят на полосе слева и в каком порядке. Уведомления, оформление, поиск и настройки всегда внизу.')}</div>
      <div className="lenta-list">
        {включены.map((v) => {
          const x = все.find((y) => y.view === v)
          return x ? строка(x, true) : null
        })}
      </div>
      {выключены.length > 0 && (
        <>
          <div className="card-title" style={{ marginTop: 14 }}>{т('Не на полосе')}</div>
          <div className="lenta-list">{выключены.map((x) => строка(x, false))}</div>
        </>
      )}
    </Modal>
  )
}
