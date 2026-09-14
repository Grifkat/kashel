import React, { useCallback, useEffect, useState } from 'react'
import { СвоиОформленія } from '../components/Konstruktor'
import { порядокъДней, WEEKDAYS_FULL } from '../lib/date'
import type { ДеньНедѣли } from '../lib/types'
import { useApp } from '../App'
import { isDesktop, useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, pct, plural } from '../lib/format'
import { bridge, type AssocStatus } from '../state/vault'
import { toCsv } from '../engine/csv'
import { useArchive } from '../components/ArchiveHost'
import { ColorPicker, Confirm, Field, Modal, Toggle, useToast } from '../components/ui'
import { PALETTE } from '../lib/emoji'
import { THEMES } from '../lib/themes'
import { categoriesFromCatalog } from '../state/defaults'
import { ThemeThumb } from '../components/ThemePicker'
import { Obnovlenie } from '../components/Obnovlenie'
import type { AnimLevel, Density, ReadingFont } from '../lib/types'
import { т, тр } from '../i18n'

export default function SettingsView() {
  const app = useApp()
  const store = useStore()
  const { data, patchSettings } = store
  const toast = useToast()
  const archive = useArchive()
  const [wipeOpen, setWipeOpen] = useState(false)
  const [addAll, setAddAll] = useState(false)
  /** Связано ли расширение .kashel с программой. Спрашиваем систему при входе. */
  /** Связано ли расширение .kashel с программой. Спрашиваем систему при входе. */
  const [assoc, setAssoc] = useState<AssocStatus | null>(null)

  const refreshAssoc = useCallback(async () => {
    if (!bridge.assocStatus) return
    setAssoc(await bridge.assocStatus())
  }, [])

  useEffect(() => {
    void refreshAssoc()
  }, [refreshAssoc])

  // Сколько категорий добавится, если развернуть весь каталог.
  const fromCatalog = categoriesFromCatalog(data.categories)

  const p = data.settings.profile
  const patchProfile = (x: Partial<typeof p>) => patchSettings({ profile: { ...p, ...x } })

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Настройки')}</h1>
          <div className="view-sub">{т('Всё хранится в вашей папке — программа никуда ничего не отправляет')}</div>
        </div>
      </div>

      <div className="grid c2">
        {/* ------------------------------------------------ вид */}
        <div className="card">
          <div className="card-title"><Icon name="sun" size={14} /> {т(' Внешний вид')}</div>
          <div className="grid c3" style={{ marginBottom: 16, gap: 10 }}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                title={t.about}
                onClick={() => patchSettings({ theme: t.id, accent: t.accent, customTheme: undefined })}
                style={{
                  textAlign: 'left',
                  background: 'transparent',
                  border: '2px solid ' + (!data.settings.customTheme && data.settings.theme === t.id ? 'var(--accent)' : 'var(--border-soft)'),
                  borderRadius: 'var(--radius-lg)',
                  padding: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <ThemeThumb theme={t} size={0.85} />
                <span className="small strong">{t.name}</span>
              </button>
            ))}
            <СвоиОформленія size={0.9} />
          </div>
          <div className="faint small" style={{ marginBottom: 16, lineHeight: 1.5 }}>
            {THEMES.find((t) => t.id === data.settings.theme)?.about}
          </div>

          <div className="row" style={{ marginBottom: 14 }}>
            <span style={{ flex: 1 }}>{т('Анимации')}</span>
            <div className="seg">
              {(['system', 'off', 'subtle', 'full'] as AnimLevel[]).map((a) => (
                <button
                  key={a}
                  className={data.settings.animations === a ? 'on' : ''}
                  onClick={() => patchSettings({ animations: a })}
                >
                  {a === 'system' ? т('Как в системе') : a === 'off' ? т('Выкл') : a === 'subtle' ? т('Умеренные') : т('Полные')}
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ marginBottom: 14 }}>
            <span style={{ flex: 1 }}>{т('Плотность')}</span>
            <div className="seg">
              {(['compact', 'normal', 'roomy'] as Density[]).map((d) => (
                <button
                  key={d}
                  className={data.settings.density === d ? 'on' : ''}
                  onClick={() => patchSettings({ density: d })}
                >
                  {d === 'compact' ? т('Плотно') : d === 'normal' ? т('Обычно') : т('Просторно')}
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ marginBottom: 14 }}>
            <span style={{ flex: 1 }} title={т('Влияет только на текст заметок, интерфейс не меняется')}>
              {т('Шрифт заметок')}</span>
            <div className="seg">
              {(['ui', 'serif'] as ReadingFont[]).map((f) => (
                <button
                  key={f}
                  className={data.settings.readingFont === f ? 'on' : ''}
                  onClick={() => patchSettings({ readingFont: f })}
                >
                  {f === 'ui' ? т('Как в интерфейсе') : т('С засечками')}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span style={{ flex: 1 }}>{т('Акцентный цвет')}</span>
            </div>
            <ColorPicker value={data.settings.accent} onChange={(accent) => patchSettings({ accent })} />
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <span style={{ flex: 1 }}>{т('Скрывать баланс')}</span>
            <Toggle checked={data.settings.hideBalance} onChange={(v) => patchSettings({ hideBalance: v })} />
          </div>
          {/* Любой день, а не только понедельник или воскресенье: неделю
              удобно начинать и с собственного выходного. Меняет все календари
              разом — сетку года, календарь задач, выбор даты и периоды. */}
          <div className="row" style={{ marginBottom: 12 }}>
            <span style={{ flex: 1 }}>{т('Неделя начинается с')}</span>
            <select
              value={data.settings.firstDayOfWeek ?? 1}
              onChange={(e) => patchSettings({ firstDayOfWeek: Number(e.target.value) as ДеньНедѣли })}
              style={{ maxWidth: 170 }}
            >
              {порядокъДней(1).map((i) => <option key={i} value={i}>{WEEKDAYS_FULL[i]}</option>)}
            </select>
          </div>

          <div className="row" style={{ marginBottom: 6 }}>
            <span style={{ flex: 1 }}>{т('Формат даты')}</span>
            <div className="seg">
              {([['ru', '03.09.2026'], ['us', '09/03/2026']] as const).map(([f, t]) => (
                <button
                  key={f}
                  className={(data.settings.dateFormat ?? 'ru') === f ? 'on' : ''}
                  onClick={() => patchSettings({ dateFormat: f })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="faint small" style={{ marginBottom: 12 }}>
            {т('Свои даты программа перепишет сразу. Встроенный выбор даты берёт язык при запуске, поэтому там формат сменится со следующего открытия.')}</div>

          <div className="row">
            <span style={{ flex: 1 }}>
              {т('Сворачивать в трей')}<span className="d faint small">
                {тр('{0}Крестик и сворачивание прячут окно, программа продолжает работать — напоминания и помидор остаются живыми. Выйти совсем — правой кнопкой по значку в трее.', ' ')}</span>
            </span>
            <Toggle
              checked={data.settings.tray ?? true}
              onChange={(v) => patchSettings({ tray: v })}
            />
          </div>
        </div>

        {/* ------------------------------------------------ профиль */}
        <div className="card">
          <div className="card-title"><Icon name="target" size={14} /> {т(' Финансовый профиль')}</div>
          <div className="faint small" style={{ marginBottom: 12 }}>
            {т('От этих чисел зависят советы: с ними сверяются норма сбережений, размер подушки и выгодность досрочного погашения.')}</div>
          <div className="grid c2">
            <Field label={т('Подушка, месяцев расходов')}>
              <input type="number" min={0} max={24} value={p.emergencyMonths} onChange={(e) => patchProfile({ emergencyMonths: Number(e.target.value) })} />
            </Field>
            <Field label={т('Целевая норма сбережений, %')}>
              <input type="number" min={0} max={90} value={p.savingsRateTarget} onChange={(e) => patchProfile({ savingsRateTarget: Number(e.target.value) })} />
            </Field>
            <Field label={т('Инфляция, % в год')}>
              <input type="number" min={0} max={50} value={p.inflationPct} onChange={(e) => patchProfile({ inflationPct: Number(e.target.value) })} />
            </Field>
            <Field label={т('Ставка по вкладу, % годовых')}>
              <input type="number" min={0} max={50} value={p.depositRatePct} onChange={(e) => patchProfile({ depositRatePct: Number(e.target.value) })} />
            </Field>
            <Field label={т('День зарплаты')}>
              <input type="number" min={1} max={31} value={p.payday} onChange={(e) => patchProfile({ payday: Number(e.target.value) })} />
            </Field>
            <Field label={т('Символ валюты')}>
              <input type="text" value={p.currency} onChange={(e) => patchProfile({ currency: e.target.value })} />
            </Field>
          </div>
        </div>

        {/* ------------------------------------------------ прогноз */}
        <div className="card">
          <div className="card-title"><Icon name="chart" size={14} /> {т(' Прогноз')}</div>
          <Field label={т('Горизонт: {0} мес.', data.settings.forecastHorizon)}>
            <input
              type="range"
              min={3}
              max={36}
              step={1}
              value={data.settings.forecastHorizon}
              onChange={(e) => patchSettings({ forecastHorizon: Number(e.target.value) })}
            />
          </Field>
          <Field
            label={т('Симуляций Монте-Карло: {0}', data.settings.monteCarloRuns)}
            hint={т('Больше симуляций — более гладкий коридор, но заметнее задержка при пересчёте')}
          >
            <input
              type="range"
              min={100}
              max={3000}
              step={100}
              value={data.settings.monteCarloRuns}
              onChange={(e) => patchSettings({ monteCarloRuns: Number(e.target.value) })}
            />
          </Field>
        </div>

        {/* ------------------------------------------------ хранилище */}
        <div className="card">
          <div className="card-title"><Icon name="folder" size={14} /> {т(' Хранилище')}</div>
          <div className="faint small" style={{ marginBottom: 10, wordBreak: 'break-all' }}>{store.vaultPath}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {isDesktop && (
              <>
                <button className="btn sm" onClick={() => void bridge.revealVault()}>
                  <Icon name="folder" size={13} /> {т(' Открыть папку')}</button>
                <button className="btn sm" onClick={() => void store.chooseVault()}>
                  <Icon name="upload" size={13} /> {т(' Сменить папку')}</button>
              </>
            )}
            <button className="btn sm" onClick={() => app.openTab('import')}>
              <Icon name="upload" size={13} /> {т(' Импорт выписки')}</button>
            <button className="btn sm" onClick={() => setAddAll(true)}>
              <Icon name="palette" size={13} /> {т(' Категории из всех иконок')}</button>
          </div>

          {/* ------------------------------------------- архив целиком */}
          <div className="card-title" style={{ marginTop: 18 }}>
            <Icon name="save" size={14} /> {т(' Всё одним файлом')}</div>
          <div className="faint small" style={{ marginBottom: 10, lineHeight: 1.6 }}>
            {т('Операции, счета, категории, цели, регулярные платежи, сценарии, правила импорта, заметки, канвасы и фото чеков складываются в один файл ')}<code>.kashel</code>{т('. Его можно унести на другой компьютер или отправить человеку: он откроет файл здесь же и получит ровно то, что видите вы. Внутри обычный JSON — читается блокнотом.')}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm primary" onClick={() => void archive.save()} disabled={!!archive.busy}>
              <Icon name="download" size={13} /> {т(' Сохранить всё в файл')}</button>
            <button className="btn sm" onClick={() => void archive.pick()} disabled={!!archive.busy}>
              <Icon name="upload" size={13} /> {т(' Загрузить из файла')}</button>
            {archive.busy && <span className="faint small">{archive.busy}</span>}
          </div>
          <div className="faint small" style={{ marginTop: 8 }}>
            {т('То же самое лежит в меню «Файл» — «Сохранить как…» и «Открыть…». Загрузка заменяет хранилище целиком; прежнее состояние программа перед этим сама кладёт в ')}<code>backups/</code> {т(' таким же файлом, вернуться можно той же кнопкой.')}</div>

          {assoc?.supported && (
            <>
              <div className="row" style={{ marginTop: 14, gap: 8, alignItems: 'flex-start' }}>
                <Icon name={assoc.linked && !assoc.stale ? 'check' : 'warn'} size={15}
                  style={{ marginTop: 2, color: assoc.linked && !assoc.stale ? 'var(--good)' : 'var(--muted)' }} />
                <div style={{ flex: 1 }}>
                  <div className="small">
                    {assoc.stale
                      ? т('Файлы .kashel связаны с прежним расположением программы — двойной клик открывает не то.')
                      : assoc.linked
                        ? т('Файлы .kashel открываются двойным кликом.')
                        : т('Двойной клик по файлу .kashel пока ничего не открывает.')}
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 7 }}>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        const ok = await bridge.assocSet?.()
                        await refreshAssoc()
                        toast(ok ? т('Готово: файлы .kashel открываются Кошелём') : т('Не удалось прописать связь'))
                      }}
                    >
                      {assoc.linked ? т('Переставить связь на эту программу') : т('Связать файлы .kashel с Кошелем')}
                    </button>
                    {assoc.linked && (
                      <button
                        className="btn sm ghost"
                        onClick={async () => {
                          await bridge.assocClear?.()
                          await refreshAssoc()
                          toast(т('Связь снята'))
                        }}
                      >
                        {т('Отвязать')}</button>
                    )}
                  </div>
                </div>
              </div>
              <div className="faint small" style={{ marginTop: 8, lineHeight: 1.55 }}>
                {т('Связь прописывается только для вашей учётной записи и прав администратора не требует. Если Кошель установлен через установщик, это уже сделано — кнопка нужна, когда программу запускают прямо из папки проекта.')}</div>
            </>
          )}
          <div className="faint small" style={{ marginTop: 12, lineHeight: 1.6 }}>
            {т('Внутри папки: ')}<code>data.json</code> {т(' — счета, категории, цели и настройки;')}<code> {т(' transactions/ГГГГ-ММ.json')}</code> {т(' — операции по месяцам;')}<code> notes/</code> {т(' — заметки в markdown; ')}<code>canvas/</code> {т(' — канвасы;')}<code> attachments/</code> {т(' — фото чеков. Всё это обычные текстовые файлы: их можно версионировать через git и синхронизировать любым облаком.')}</div>
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn sm danger" onClick={() => setWipeOpen(true)}>{т('Стереть всё и начать заново')}</button>
          </div>
        </div>
      </div>

      <Obnovlenie />

      {/* ------------------------------------------------ горячие клавиши */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><Icon name="menu" size={14} /> {т(' Горячие клавиши')}</div>
        <div className="grid c3">
          {[
            ['Ctrl+O', т('Открыть файл .kashel')],
            ['Ctrl+Shift+S', т('Сохранить всё в файл')],
            ['Ctrl+P', т('Палитра команд — всё в одном месте')],
            ['Ctrl+N', т('Быстрый ввод операции строкой')],
            ['Ctrl+Shift+F', т('Поиск по операциям и заметкам')],
            ['Ctrl+W', т('Закрыть вкладку')],
            ['Ctrl+\\', т('Разделить панель пополам')],
            ['Ctrl+B', т('Показать или скрыть левую панель')],
            ['Ctrl+I', т('Показать или скрыть правую панель')],
            ['Delete', т('Удалить выбранный узел на канвасе')],
            [т('Двойной клик'), т('На канвасе — новая заметка; по узлу — правка')],
          ].map(([k, t]) => (
            <div key={k} className="row" style={{ gap: 10, padding: '4px 0' }}>
              <kbd style={{ minWidth: 92, textAlign: 'center' }}>{k}</kbd>
              <span className="small">{t}</span>
            </div>
          ))}
        </div>
      </div>

      {addAll && (
        <Confirm
          title={т('Создать {0} {1}?', fromCatalog.length, plural(fromCatalog.length, 'категорию', 'категории', 'категорий'))}
          text={
            т('Из каждой иконки каталога получится своя категория — с названием, иконкой и цветом. ') +
            т('Сейчас у вас {0}, станет {1}. ', data.categories.length, data.categories.length + fromCatalog.length) +
            т('Списки, бюджет и бублик на дашборде станут заметно длиннее; лишнее удаляется по одной ') +
            т('в «Категориях». Уже заведённые категории и их иконки не трогаются.')
          }
          confirmLabel={т('Создать {0}', fromCatalog.length)}
          onConfirm={() => {
            for (const c of fromCatalog) store.upsertCategory(c)
            toast(т('Создано категорий: {0}', fromCatalog.length))
            setAddAll(false)
            app.openTab('categories')
          }}
          onClose={() => setAddAll(false)}
        />
      )}

      {wipeOpen && (
        <Confirm
          title={т('Стереть всё и начать заново?')}
          text={
            т('Хранилище вернётся к состоянию только что установленной программы: исчезнут ') +
            т('{0} операций, {1} счетов вместе с кредитами и долгами, ', data.transactions.length, data.accounts.length) +
            т('{0} категорий, {1} целей, {2} регулярных платежей, ', data.categories.length, data.goals.length, data.recurring.length) +
            т('а также все заметки и канвасы. Настройки и путь к хранилищу сохранятся. ') +
            т('Отменить нельзя — если данные нужны, сначала сохраните их кнопкой «Сохранить всё в файл» выше.')
          }
          confirmLabel={т('Стереть всё')}
          onConfirm={async () => {
            await store.wipeAll()
            toast(т('Хранилище очищено — можно заполнять своими данными'))
          }}
          onClose={() => setWipeOpen(false)}
        />
      )}
    </div>
  )
}
