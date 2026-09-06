import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { bridge, wipeAttachments, wipeSpaceFiles } from '../state/vault'
import { plural } from '../lib/format'
import {
  applyArchive, archiveFileName, archiveText, ARCHIVE_FILTERS, backupPath,
  buildArchive, parseArchive, type Archive,
} from '../engine/archive'
import { Modal, Tbl, useToast } from './ui'
import { Boundary } from './Boundary'

/*
 * Один хозяин на всю программу: и кнопки в настройках, и меню «Файл», и
 * двойной клик по файлу .kashel приводят сюда. Окно подтверждения одно на
 * все три пути — заменять хранилище молча нельзя, откуда бы ни пришёл файл.
 */

interface ArchiveApi {
  /** Сохранить всё содержимое программы в файл. */
  save(): Promise<void>
  /** Выбрать файл вручную и предложить загрузку. */
  pick(): Promise<void>
  busy: string
}

const Ctx = createContext<ArchiveApi | null>(null)

export const useArchive = (): ArchiveApi => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useArchive вне провайдера')
  return v
}

/** Вес файла в мегабайтах — по нему сразу видно, влезет ли он в письмо. */
export function fileSize(chars: number): string {
  const mb = chars / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} МБ`
  return `${Math.max(1, Math.round(chars / 1024))} КБ`
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

interface Incoming {
  archive: Archive
  dropped: number
  file: string
  bytes: number
}

export function ArchiveProvider({ children }: { children: React.ReactNode }) {
  const app = useApp()
  const store = useStore()
  const { data, ready } = store
  const toast = useToast()

  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const [busy, setBusy] = useState('')

  // Обработчикам меню нужен свежий снимок без пересоздания подписки.
  const dataRef = useRef(data)
  dataRef.current = data

  const save = useCallback(async () => {
    setBusy('Собираю архив…')
    try {
      const archive = await buildArchive(dataRef.current)
      const text = archiveText(archive)
      const at = await bridge.saveText(archiveFileName(), text, { bom: false, filters: ARCHIVE_FILTERS })
      if (at) toast(`Сохранено: ${at} · ${fileSize(text.length)}`)
    } catch (e) {
      toast('Не удалось собрать архив: ' + errText(e))
    } finally {
      setBusy('')
    }
  }, [toast])

  /** Разбирает текст файла и показывает, что внутри, до всякой записи. */
  const offer = useCallback(
    (text: string, name: string) => {
      const res = parseArchive(text)
      if (!res.ok) {
        toast(res.error)
        return
      }
      setIncoming({ archive: res.archive, dropped: res.dropped, file: name, bytes: text.length })
    },
    [toast],
  )

  const pick = useCallback(async () => {
    const file = await bridge.openText(ARCHIVE_FILTERS)
    if (file) offer(file.text, file.name)
  }, [offer])

  /**
   * Загрузка заменяет хранилище целиком, поэтому первым делом складывает
   * нынешнее состояние в backups/ таким же архивом: вернуться можно будет
   * той же кнопкой «Открыть».
   */
  const load = useCallback(
    async (archive: Archive) => {
      setIncoming(null)
      setBusy('Сохраняю резервную копию…')
      try {
        const backup = backupPath()
        await bridge.write(backup, archiveText(await buildArchive(dataRef.current)))

        setBusy('Очищаю прежнее хранилище…')
        await wipeSpaceFiles()
        await wipeAttachments()

        setBusy('Раскладываю новое…')
        const report = await applyArchive(archive)
        // Настройки внешнего вида и профиль остаются свои: в архиве они лежат,
        // но чужая тема и чужой день зарплаты пользователю не нужны.
        await store.replaceAll({ ...archive.data, settings: dataRef.current.settings })

        app.resetWorkspace()
        const n = archive.data.transactions.length
        toast(
          `Хранилище загружено: ${n} ${plural(n, 'операция', 'операции', 'операций')}, ` +
            `${report.notes} ${plural(report.notes, 'заметка', 'заметки', 'заметок')}, ` +
            `${report.canvases} ${plural(report.canvases, 'доска', 'доски', 'досок')}. ` +
            `Копия прежнего — ${backup}`,
        )
        if (report.failed.length) {
          const shown = report.failed.slice(0, 3).join(', ')
          const rest = report.failed.length - 3
          toast(`Не удалось записать: ${shown}${rest > 0 ? ` и ещё ${rest}` : ''}`)
        }
      } catch (e) {
        toast('Загрузка прервалась: ' + errText(e))
      } finally {
        setBusy('')
      }
    },
    [app, store, toast],
  )

  // ---------------------------------------------------------- меню и клик
  useEffect(() => {
    if (!bridge.onFileCommand) return
    return bridge.onFileCommand((e) => {
      if (e.kind === 'save') void save()
      else if (e.kind === 'open') void pick()
      else if (e.kind === 'file' && e.file) {
        void bridge.readArchive?.(e.file).then((f) => {
          if (f) offer(f.text, f.name)
          else toast('Не удалось прочитать файл: ' + e.file)
        })
      }
    })
  }, [save, pick, offer, toast])

  // Программу запустили двойным кликом по архиву: файл ждёт, пока хранилище
  // догрузится — до этого момента резервную копию делать не из чего.
  useEffect(() => {
    if (!ready || !bridge.pendingArchive) return
    void bridge.pendingArchive().then((f) => {
      if (f) offer(f.text, f.name)
    })
  }, [ready, offer])

  const api: ArchiveApi = { save, pick, busy }

  return (
    <Ctx.Provider value={api}>
      {/* Граница ниже подписки на меню «Файл» (эффект выше): после краха
          интерфейса пункты «Сохранить как…» и «Открыть…» остаются не только
          нарисованными, но и рабочими. И состояние App — вкладки, панели —
          не размонтируется, поэтому «Продолжить работу» возвращает рабочее
          место целиком. */}
      <Boundary level="window">{children}</Boundary>
      {incoming && (
        <Modal
          title="Загрузить хранилище из файла?"
          icon="upload"
          onClose={() => setIncoming(null)}
          footer={
            <>
              <button className="btn" onClick={() => setIncoming(null)}>Отмена</button>
              <button className="btn primary" onClick={() => void load(incoming.archive)}>
                Заменить и загрузить
              </button>
            </>
          }
        >
          <div className="faint small" style={{ marginBottom: 12 }}>
            {incoming.file} · {fileSize(incoming.bytes)}
            {incoming.archive.exportedAt &&
              ` · выгружен ${new Date(incoming.archive.exportedAt).toLocaleString('ru-RU')}`}
          </div>

          <div className="card-title">Что внутри</div>
          <Tbl style={{ marginBottom: 14 }}>
            <tbody>
              {([
                ['Операции', incoming.archive.counts.transactions, data.transactions.length],
                ['Счета', incoming.archive.counts.accounts, data.accounts.length],
                ['Категории', incoming.archive.counts.categories, data.categories.length],
                ['Регулярные платежи', incoming.archive.counts.recurring, data.recurring.length],
                ['Цели', incoming.archive.counts.goals, data.goals.length],
                ['Сценарии', incoming.archive.counts.scenarios, data.scenarios.length],
                ['Заметки', incoming.archive.counts.notes, null],
                ['Канвасы', incoming.archive.counts.canvases, null],
                ['Фото чеков', incoming.archive.counts.attachments, null],
              ] as [string, number, number | null][]).map(([label, next, now]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="r num strong">{next}</td>
                  <td className="r num faint" style={{ width: 130 }}>
                    {now == null ? '' : `сейчас ${now}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tbl>

          {incoming.dropped > 0 && (
            <div className="advice-card warn" style={{ padding: '10px 12px', marginBottom: 12 }}>
              В файле {incoming.dropped}{' '}
              {plural(incoming.dropped, 'повреждённая запись', 'повреждённые записи', 'повреждённых записей')} —
              {' '}{plural(incoming.dropped, 'она будет пропущена', 'они будут пропущены', 'они будут пропущены')}.
              Чаще всего это операции без даты.
            </div>
          )}

          <div className="advice-card info" style={{ padding: '10px 12px' }}>
            <div className="advice-body" style={{ lineHeight: 1.6 }}>
              Всё нынешнее содержимое хранилища будет заменено содержимым файла — вместе с
              заметками, досками и чеками. Перед заменой программа сложит текущее состояние
              в <code>backups/</code> отдельным архивом, так что откатиться можно будет через
              «Файл» → «Открыть…». Оформление, акцентный цвет и финансовый профиль останутся
              вашими: в файле они есть, но не применяются.
            </div>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}
