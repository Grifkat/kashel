import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { bridge, wipeAttachments, wipeSpaceFiles } from '../state/vault'
import { plural } from '../lib/format'
import {
  applyArchive, archiveFileName, archiveText, ARCHIVE_FILTERS,
  buildArchive, parseArchive, type Archive,
} from '../engine/archive'
import { имяКопии } from '../state/rezerv'
import { Modal, Tbl, useToast } from './ui'
import { Boundary } from './Boundary'
import { т, тр } from '../i18n'

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
  /** Предложить вернуть резервную копию из backups/ — с тем же окном подтверждения. */
  вернутьКопию(путь: string): Promise<void>
  busy: string
}

const Ctx = createContext<ArchiveApi | null>(null)

export const useArchive = (): ArchiveApi => {
  const v = useContext(Ctx)
  if (!v) throw new Error(т('useArchive вне провайдера'))
  return v
}

/** Вес файла в мегабайтах — по нему сразу видно, влезет ли он в письмо. */
export function fileSize(chars: number): string {
  const mb = chars / 1024 / 1024
  if (mb >= 1) return т('{0} МБ', mb.toFixed(1).replace('.', ','))
  return т('{0} КБ', Math.max(1, Math.round(chars / 1024)))
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

interface Incoming {
  archive: Archive
  dropped: number
  file: string
  bytes: number
  /** Файл со стороны или своя резервная копия — от этого зависят слова окна. */
  вид: 'file' | 'backup'
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
    setBusy(т('Собираю архив…'))
    try {
      const archive = await buildArchive(dataRef.current)
      const text = archiveText(archive)
      const at = await bridge.saveText(archiveFileName(), text, { bom: false, filters: ARCHIVE_FILTERS })
      if (at) toast(т('Сохранено: {0} · {1}', at, fileSize(text.length)))
    } catch (e) {
      toast(т('Не удалось собрать архив: ') + errText(e))
    } finally {
      setBusy('')
    }
  }, [toast])

  /** Разбирает текст файла и показывает, что внутри, до всякой записи. */
  const offer = useCallback(
    (text: string, name: string, вид: Incoming['вид'] = 'file') => {
      const res = parseArchive(text)
      if (!res.ok) {
        toast(res.error)
        return
      }
      setIncoming({ archive: res.archive, dropped: res.dropped, file: name, bytes: text.length, вид })
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
    async (archive: Archive, вид: Incoming['вид'] = 'file') => {
      setIncoming(null)
      setBusy(т('Сохраняю резервную копию…'))
      try {
        const backup = имяКопии(вид === 'backup' ? 'restore' : 'load')
        await bridge.write(backup, archiveText(await buildArchive(dataRef.current)))

        setBusy(т('Очищаю прежнее хранилище…'))
        await wipeSpaceFiles()
        await wipeAttachments()

        setBusy(т('Раскладываю новое…'))
        const report = await applyArchive(archive)
        // Настройки внешнего вида и профиль остаются свои: в архиве они лежат,
        // но чужая тема и чужой день зарплаты пользователю не нужны.
        await store.replaceAll({ ...archive.data, settings: dataRef.current.settings })

        app.resetWorkspace()
        const n = archive.data.transactions.length
        toast(
          т('Хранилище загружено: {0} {1}, ', n, plural(n, 'операция', 'операции', 'операций')) +
            `${report.notes} ${plural(report.notes, 'заметка', 'заметки', 'заметок')}, ` +
            `${report.canvases} ${plural(report.canvases, 'доска', 'доски', 'досок')}. ` +
            т('Копия прежнего — {0}', backup),
        )
        if (report.failed.length) {
          const shown = report.failed.slice(0, 3).join(', ')
          const rest = report.failed.length - 3
          toast(т('Не удалось записать: {0}{1}', shown, rest > 0 ? т(' и ещё {0}', rest) : ''))
        }
      } catch (e) {
        toast(т('Загрузка прервалась: ') + errText(e))
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
          else toast(т('Не удалось прочитать файл: ') + e.file)
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

  const вернутьКопию = useCallback(
    async (путь: string) => {
      try {
        const text = await bridge.read(путь)
        if (text == null) {
          toast(т('Копия не найдена: {0}', путь))
          return
        }
        offer(text, путь.split('/').pop() ?? путь, 'backup')
      } catch (e) {
        toast(т('Не удалось прочитать копию: ') + errText(e))
      }
    },
    [offer, toast],
  )

  const api: ArchiveApi = { save, pick, вернутьКопию, busy }

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
          title={incoming.вид === 'backup' ? т('Вернуть резервную копию?') : т('Загрузить хранилище из файла?')}
          icon="upload"
          onClose={() => setIncoming(null)}
          footer={
            <>
              <button className="btn" onClick={() => setIncoming(null)}>{т('Отмена')}</button>
              <button className="btn primary" onClick={() => void load(incoming.archive, incoming.вид)}>
                {incoming.вид === 'backup' ? т('Вернуть копию') : т('Заменить и загрузить')}</button>
            </>
          }
        >
          <div className="faint small" style={{ marginBottom: 12 }}>
            {incoming.file} · {fileSize(incoming.bytes)}
            {incoming.archive.exportedAt &&
              т(' · выгружен {0}', new Date(incoming.archive.exportedAt).toLocaleString('ru-RU'))}
          </div>

          <div className="card-title">{т('Что внутри')}</div>
          <Tbl style={{ marginBottom: 14 }}>
            <tbody>
              {([
                [т('Операции'), incoming.archive.counts.transactions, data.transactions.length],
                [т('Счета'), incoming.archive.counts.accounts, data.accounts.length],
                [т('Категории'), incoming.archive.counts.categories, data.categories.length],
                [т('Регулярные платежи'), incoming.archive.counts.recurring, data.recurring.length],
                [т('Цели'), incoming.archive.counts.goals, data.goals.length],
                [т('Сценарии'), incoming.archive.counts.scenarios, data.scenarios.length],
                [т('Заметки'), incoming.archive.counts.notes, null],
                [т('Канвасы'), incoming.archive.counts.canvases, null],
                [т('Фото чеков'), incoming.archive.counts.attachments, null],
              ] as [string, number, number | null][]).map(([label, next, now]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="r num strong">{next}</td>
                  <td className="r num faint" style={{ width: 130 }}>
                    {now == null ? '' : т('сейчас {0}', now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tbl>

          {incoming.dropped > 0 && (
            <div className="advice-card warn" style={{ padding: '10px 12px', marginBottom: 12 }}>
              {тр('В файле {0}{1}{2} —{3}{4}. Чаще всего это операции без даты.', incoming.dropped, ' ', plural(incoming.dropped, 'повреждённая запись', 'повреждённые записи', 'повреждённых записей'), ' ', plural(incoming.dropped, 'она будет пропущена', 'они будут пропущены', 'они будут пропущены'))}</div>
          )}

          <div className="advice-card info" style={{ padding: '10px 12px' }}>
            {incoming.вид === 'backup' ? (
              <div className="advice-body" style={{ lineHeight: 1.6 }}>
                {т('Всё нынешнее содержимое хранилища будет заменено содержимым копии — вместе с заметками, досками и чеками. Перед заменой нынешнее состояние тоже сохранится копией «перед возвратом», так что передумать можно тем же способом. Оформление и финансовый профиль останутся нынешними.')}</div>
            ) : (
            <div className="advice-body" style={{ lineHeight: 1.6 }}>
              {т('Всё нынешнее содержимое хранилища будет заменено содержимым файла — вместе с заметками, досками и чеками. Перед заменой программа сложит текущее состояние в ')}<code>backups/</code> {т(' отдельным архивом, так что откатиться можно будет через «Файл» → «Открыть…». Оформление, акцентный цвет и финансовый профиль останутся вашими: в файле они есть, но не применяются.')}</div>
            )}
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}
