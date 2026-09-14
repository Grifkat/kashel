import React, { useState } from 'react'
import { Icon } from '../lib/icons'
import { bridge, isDesktop } from '../state/vault'
import { useStore, type VaultFailure } from '../state/store'
import { т, тр } from '../i18n'

/*
 * Экран «хранилище не открылось». На его месте была вечная заставка: ни
 * объяснения, ни выхода — окно навсегда замирало на «Открываю хранилище…».
 *
 * Правила те же, что у запасного экрана границы отрисовки, и по той же причине:
 *  - из хуков только useStore и собственный useState;
 *  - ничего не считать из data — её тут просто нет, загрузка не дошла до конца;
 *  - каждый обработчик в перехвате: бросок из обработчика показать некому;
 *  - никакой кнопки «продолжить без хранилища». Пустая программа поверх
 *    непрочитанного хранилища — это приглашение ввести данные, которые лягут
 *    поверх настоящих.
 */
const СОВЕТ: Record<VaultFailure['stage'], string> = {
  path: т('Программа не смогла узнать, где лежит хранилище.'),
  read: т('Файлы хранилища на месте, но прочитать их не вышло.'),
  create: т('Программа сочла хранилище новым и не смогла его создать.'),
}

export function VaultFailureScreen({ info }: { info: VaultFailure }) {
  const store = useStore()
  const [note, setNote] = useState('')
  const mono = { fontFamily: 'var(--mono)' } as React.CSSProperties

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setNote(what + '…')
    try {
      await fn()
      setNote('')
    } catch (e) {
      setNote(т('Не вышло: ') + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div className="splash">
      <div className="card" style={{ maxWidth: 560, width: 'min(560px, 90vw)' }}>
        <div className="card-title">
          <Icon name="warn" size={14} /> {т(' Не удалось открыть хранилище')}</div>
        <div className="muted" style={{ lineHeight: 1.6 }}>
          {тр('{0} Файлы на диске не тронуты — программа просто не смогла до них добраться.', СОВЕТ[info.stage])}</div>
        {/* Путь моноширинно и с переносом: чаще всего человек увидит на нём
            прямые слэши или чужую букву диска и поймёт всё сам. */}
        <div className="faint small" style={{ ...mono, marginTop: 10, wordBreak: 'break-all' }}>
          {info.path || т('путь неизвестен')}
        </div>
        <div style={{ ...mono, fontSize: 13, color: 'var(--faint)', marginTop: 6, wordBreak: 'break-word' }}>
          {info.message.slice(0, 300)}
        </div>

        <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
          {isDesktop && (
            <button className="btn primary" onClick={() => void run(т('Выбираю папку'), () => store.chooseVault())}>
              <Icon name="folder" size={14} /> {т(' Выбрать папку хранилища')}</button>
          )}
          {/* Для причин, которые проходят сами: сетевой диск не успел
              подключиться, файл держал антивирус, облако синхронизировалось. */}
          <button className="btn" onClick={() => void run(т('Пробую снова'), () => store.retryBoot())}>
            <Icon name="repeat" size={14} /> {т(' Попробовать снова')}</button>
          {isDesktop && (
            <button
              className="btn ghost"
              onClick={() => void run(т('Открываю папку'), async () => { await bridge.revealVault() })}
            >
              <Icon name="folder" size={14} /> {т(' Открыть папку хранилища')}</button>
          )}
          <button className="btn ghost" onClick={() => window.location.reload()}>
            <Icon name="repeat" size={14} /> {т(' Перезагрузить окно')}</button>
        </div>

        {note && <div className="small faint" style={{ marginTop: 10 }}>{note}</div>}
      </div>
    </div>
  )
}
