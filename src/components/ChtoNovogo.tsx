import React, { useState } from 'react'
import { useStore } from '../state/store'
import { Modal } from './ui'
import { Icon } from '../lib/icons'
import { ВЕРСИЯ, ВЫПУСКИ, непросмотренныеВыпуски, type Выпуск } from '../lib/versiya'
import { humanDate } from '../lib/date'
import { т } from '../i18n'

/** Окно со списком изменений по выпускам. */
export function ЧтоНовогоОкно({ выпуски, onClose }: { выпуски: Выпуск[]; onClose: () => void }) {
  return (
    <Modal
      title={т('Что нового')}
      icon="sparkle"
      onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>{т('Понятно')}</button>}
    >
      <div className="chto-novogo">
        {выпуски.map((в) => (
          <section key={в.версия}>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <span className="strong">{т('Версия {0}', в.версия)}</span>
              <span className="faint small">{humanDate(в.дата)}</span>
            </div>
            <ul>
              {в.пункты.map((п) => (
                <li key={п}>{п}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}

/**
 * После обновления — один раз показать, что изменилось. Отметка «видел»
 * хранится в настройках хранилища, поэтому окно не всплывает второй раз
 * и после перезапуска.
 */
export function ЧтоНовогоХост() {
  const { data, ready, patchSettings } = useStore()
  const [закрыто, setЗакрыто] = useState(false)
  if (!ready || закрыто) return null
  const естьДанные = data.transactions.length > 0 || data.accounts.length > 0
  const выпуски = непросмотренныеВыпуски(data.settings.whatsNewSeen, естьДанные)
  if (!выпуски.length) return null
  return (
    <ЧтоНовогоОкно
      выпуски={выпуски}
      onClose={() => {
        setЗакрыто(true)
        patchSettings({ whatsNewSeen: ВЕРСИЯ })
      }}
    />
  )
}

/** Карточка «О программе» в настройках. */
export function ОПрограмме() {
  const [открыто, setОткрыто] = useState(false)
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ gap: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Icon name="wallet" size={14} /> {т(' О программе')}</div>
        <span className="spacer" />
        <span className="small o-programme-versiya">{т('Кошель, версия {0}', ВЕРСИЯ)}</span>
        <button className="btn sm" onClick={() => setОткрыто(true)}>{т('Что нового')}</button>
      </div>
      {открыто && <ЧтоНовогоОкно выпуски={ВЫПУСКИ} onClose={() => setОткрыто(false)} />}
    </div>
  )
}
