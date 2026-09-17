import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ClickSparkLayer, ShinyText, useПодсвѣткаЗаКурсоромъ } from './components/effects'
import { useAnimLevel } from './components/anim'
import { MotionConfig, motion } from 'motion/react'
import { Icon } from './lib/icons'
import { useStore } from './state/store'
import { money } from './lib/format'
import { balances } from './engine/stats'
import { CommandPalette } from './components/CommandPalette'
import { QuickAdd } from './components/QuickAdd'
import { TransactionModal } from './components/TransactionModal'
import { PogashenieOkno, type ЦельПогашения } from './components/PogashenieOkno'
import { RightPanel } from './components/RightPanel'
import { GlobalSearch } from './components/GlobalSearch'
import { ThemePicker } from './components/ThemePicker'
import { ArchiveProvider } from './components/ArchiveHost'
import { ReminderHost } from './components/ReminderHost'
import { HonorsHost } from './components/HonorsHost'
import { UvedomleniyaHost, UvedomleniyaKnopka } from './components/Uvedomleniya'
import { ЧтоНовогоХост } from './components/ChtoNovogo'
import { PomodoroProvider, clock, usePomodoro } from './components/PomodoroHost'
import { Boundary } from './components/Boundary'
import { VaultFailureScreen } from './components/VaultFailure'
import { themeById, counterpart } from './lib/themes'
import { применитьТокены } from './lib/svoitemy'
import Dashboard from './views/Dashboard'
import Transactions from './views/Transactions'
import Categories from './views/Categories'
import Accounts from './views/Accounts'
import Budget from './views/Budget'
import Goals from './views/Goals'
import Debts from './views/Debts'
import RecurringView from './views/Recurring'
import RemindersView from './views/Reminders'
import TasksView from './views/Tasks'
import ProfileView from './views/Profile'
import ZnakiView from './views/Znaki'
import Forecast from './views/Forecast'
import AdviceView from './views/Advice'
import CanvasView from './views/Canvas'
import Notes from './views/Notes'
import GraphView from './views/Graph'
import ImportView from './views/Import'
import CalendarView from './views/Calendar'
import YearView from './views/Year'
import SettingsView from './views/Settings'
import { relDate, setDateFormat, today } from './lib/date'
import { bridge } from './state/vault'
import type { Transaction, TxKind } from './lib/types'
import { попроситьПроверку, useЕстьОбновленіе } from './components/Obnovlenie'
import { т, тр, текущійЯзык, запомнитьЯзык } from './i18n'

export type ViewId =
  | 'dashboard' | 'transactions' | 'categories' | 'accounts' | 'budget' | 'goals'
  | 'debts' | 'recurring' | 'reminders' | 'tasks' | 'profile' | 'znaki' | 'forecast' | 'advice' | 'calendar' | 'year'
  | 'canvas' | 'notes' | 'graph' | 'import' | 'settings'

export interface Tab {
  id: string
  view: ViewId
  arg?: string
  title: string
  icon: string
}

interface Pane {
  id: string
  tabs: Tab[]
  active: string
}

export const VIEW_META: Record<ViewId, { title: string; icon: string }> = {
  dashboard: { title: т('Дашборд'), icon: 'donut' },
  transactions: { title: т('Операции'), icon: 'list' },
  categories: { title: т('Категории'), icon: 'tag' },
  accounts: { title: т('Счета'), icon: 'wallet' },
  budget: { title: т('Бюджет'), icon: 'scale' },
  goals: { title: т('Цели'), icon: 'target' },
  debts: { title: т('Долги и кредиты'), icon: 'credit' },
  recurring: { title: т('Регулярные'), icon: 'repeat' },
  reminders: { title: т('Напоминания'), icon: 'bulb' },
  tasks: { title: т('Задачи'), icon: 'list' },
  profile: { title: т('Грамота'), icon: 'sparkle' },
  znaki: { title: т('Кто на знаках'), icon: 'shield' },
  forecast: { title: т('Прогноз'), icon: 'chart' },
  advice: { title: т('Советы'), icon: 'bulb' },
  calendar: { title: т('Календарь'), icon: 'calendar' },
  year: { title: т('Итоги года'), icon: 'sparkle' },
  canvas: { title: т('Канвас'), icon: 'canvas' },
  notes: { title: т('Заметки'), icon: 'note' },
  graph: { title: т('Граф'), icon: 'graph' },
  import: { title: т('Импорт'), icon: 'download' },
  settings: { title: т('Настройки'), icon: 'gear' },
}

interface AppApi {
  openTab(view: ViewId, arg?: string, opts?: { title?: string; pane?: number; newTab?: boolean }): void
  closeTab(paneIdx: number, tabId: string): void
  activeTab: Tab | null
  panes: Pane[]
  focusPane: number
  setFocusPane(i: number): void
  splitPane(): void
  /** Схлопывает всё до одной вкладки дашборда — после полной смены хранилища. */
  resetWorkspace(): void
  editTransaction(t: Transaction | Partial<Transaction> | null): void
  /** Окно «Погасить»: кредит, долг человеку, новый долг. */
  погасить(цель: ЦельПогашения): void
  openPalette(): void
  openQuickAdd(prefill?: string, kind?: TxKind): void
  /**
   * Дата, на которую уйдёт новая запись. Её публикует активная вкладка:
   * дашборд отдаёт дату открытого периода. null — значит сегодня, и тогда
   * подставлять нечего.
   */
  entryDate: string | null
  setEntryDate(tabId: string, date: string | null): void
  /** Счёт, открытый во вкладке (фильтр операций, счёт на дашборде), — для новой записи. */
  entryAccount: string | null
  setEntryAccount(tabId: string, id: string | null): void
  openSearch(q?: string): void
  rightOpen: boolean
  toggleRight(): void
  sidebarOpen: boolean
  toggleSidebar(): void
}

const AppCtx = createContext<AppApi | null>(null)
export const useApp = (): AppApi => {
  const v = useContext(AppCtx)
  if (!v) throw new Error(т('useApp вне провайдера'))
  return v
}

/**
 * Ид вкладки, внутри которой нарисован раздел. Нужен, чтобы раздел мог
 * заявить о себе на весь App — например, отдать дату открытого периода — и
 * чтобы в разделённом окне два одинаковых раздела не затирали друг друга.
 *
 * Запасное значение — для раздела, отрисованного вне вкладок (в оснастке):
 * такой раздел просто делит общую ячейку, а не роняет окно.
 */
const TabIdCtx = createContext<string | null>(null)
export const useTabId = (): string => useContext(TabIdCtx) ?? 'вне-вкладок'

let tabSeq = 0
const mkTab = (view: ViewId, arg?: string, title?: string): Tab => ({
  id: `tab${++tabSeq}`,
  view,
  arg,
  title: title || (arg ? `${arg}` : VIEW_META[view].title),
  icon: VIEW_META[view].icon,
})

export default function App() {
  const store = useStore()
  const { data, ready, dirty, vaultPath, lastSaved, failure, saveError } = store

  const [panes, setPanes] = useState<Pane[]>(() => {
    const t = mkTab('dashboard')
    return [{ id: 'p1', tabs: [t], active: t.id }]
  })
  const [focusPane, setFocusPane] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState<{ text: string; kind?: TxKind; date?: string } | null>(null)
  // Дата периода хранится по вкладкам: в разделённом окне два дашборда
  // смотрят на разные месяцы, и запись должна идти по той вкладке, на
  // которую человек сейчас смотрит, а не по той, что открылась позже.
  const [entryDates, setEntryDates] = useState<Record<string, string>>({})
  const [entryAccounts, setEntryAccounts] = useState<Record<string, string>>({})
  const [searchOpen, setSearchOpen] = useState<string | null>(null)
  const [editing, setEditingRaw] = useState<Transaction | Partial<Transaction> | null>(null)
  const [погашение, setПогашение] = useState<ЦельПогашения | null>(null)
  // Запись «без счёта» правится в окне «Погасить»: в обычной форме у неё нет второго счёта.
  const setEditing = useCallback((t: Transaction | Partial<Transaction> | null) => {
    if (t && 'id' in t && t.id && t.offBook) setПогашение({ вид: 'edit', операция: t as Transaction })
    else setEditingRaw(t)
  }, [])
  const [rightOpen, setRightOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [themeOpen, setThemeOpen] = useState(false)
  const animLevel = useAnimLevel()
  useПодсвѣткаЗаКурсоромъ()

  /*
   * Язык из настроек сверяется с тем, на котором окно уже загружено.
   * Разошлись — запоминаем новый в зеркале и перезапускаем окно: константы
   * модулей переводятся при загрузке, и живьём их не перевести. Сверка идёт
   * только по готовому хранилищу, иначе умолчание до чтения данных
   * перезапускало бы окно на каждом старте.
   */
  useEffect(() => {
    if (!ready) return
    const нужный = data.settings.language ?? 'ru'
    if (нужный !== текущійЯзык()) {
      // Сперва сохранить: запись в хранилище идёт с задержкой, и
      // перезапуск без неё терял бы сам выбор — окно вернулось бы назад.
      void store.saveNow().catch(() => {}).finally(() => {
        запомнитьЯзык(нужный)
        window.location.reload()
      })
    }
    // store стабилен; зависим от готовности и самого языка.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.settings.language])

  useEffect(() => {
    const root = document.documentElement
    /*
     * Своя тема — это основа плюс свои переменные поверх. Основа ставится
     * атрибутом, как обычная тема: от неё берутся характерные правила
     * разметки (градиент шапки, буквы на кнопках). Переменные — на корень.
     */
    const своя = data.settings.customTheme
      ? data.settings.customThemes?.find((тм) => тм.id === data.settings.customTheme)
      : undefined
    root.dataset.theme = своя ? своя.base : data.settings.theme
    применитьТокены(root, своя ? своя.tokens : null)
    if (своя?.tokens['accent-text']) root.dataset.accentText = ''
    else delete root.dataset.accentText
    root.dataset.anim = animLevel
    root.dataset.density = data.settings.density
    root.dataset.reading = data.settings.readingFont

    /*
     * Формат дат ставим до отрисовки: его читают десятки мест через модуль
     * date, а не через настройки. Оболочке отдаём трей и язык встроенного
     * выбора даты — язык применится со следующего запуска, Chromium читает
     * его один раз при старте.
     */
    setDateFormat(data.settings.dateFormat ?? 'ru')
    void bridge.shellPrefs?.({
      tray: data.settings.tray ?? true,
      dateFormat: data.settings.dateFormat ?? 'ru',
      language: data.settings.language ?? 'ru',
    })
    root.style.setProperty('--accent', своя ? своя.accent : data.settings.accent)
  }, [data.settings.theme, data.settings.customTheme, data.settings.customThemes, animLevel, data.settings.accent, data.settings.density, data.settings.readingFont])

  const openTab = useCallback<AppApi['openTab']>((view, arg, opts) => {
    const paneIdx = opts?.pane ?? focusPane
    setPanes((ps) => {
      const next = ps.map((p) => ({ ...p, tabs: [...p.tabs] }))
      const pane = next[Math.min(paneIdx, next.length - 1)]
      const existing = pane.tabs.find((t) => t.view === view && t.arg === arg)
      if (existing && !opts?.newTab) {
        pane.active = existing.id
        return next
      }
      const t = mkTab(view, arg, opts?.title)
      // Не плодим вкладки бесконечно: заменяем текущую, если она «одноразовая».
      pane.tabs.push(t)
      pane.active = t.id
      return next
    })
    setFocusPane(Math.min(paneIdx, panes.length - 1))
  }, [focusPane, panes.length])

  const closeTab = useCallback((paneIdx: number, tabId: string) => {
    setPanes((ps) => {
      const next = ps.map((p) => ({ ...p, tabs: [...p.tabs] }))
      const pane = next[paneIdx]
      if (!pane) return ps
      const i = pane.tabs.findIndex((t) => t.id === tabId)
      if (i < 0) return ps
      pane.tabs.splice(i, 1)
      if (!pane.tabs.length) {
        if (next.length > 1) {
          next.splice(paneIdx, 1)
          return next
        }
        const t = mkTab('dashboard')
        pane.tabs.push(t)
        pane.active = t.id
        return next
      }
      if (pane.active === tabId) pane.active = pane.tabs[Math.max(0, i - 1)].id
      return next
    })
  }, [])

  /*
   * Пункт «Проверить обновление» в меню «Вид».
   *
   * Меню только просит; всё остальное делает раздел «Настройки» — тот же, что
   * и при нажатии кнопки там. Открываем его и передаём просьбу дальше: если
   * раздел уже был открыт, он отзовётся сразу, если нет — как только встанет.
   */
  useEffect(() => {
    if (!bridge.onUpdate) return
    return bridge.onUpdate((e) => {
      if (e.kind !== 'menu') return
      openTab('settings')
      попроситьПроверку()
    })
  }, [openTab])

  const splitPane = useCallback(() => {
    setPanes((ps) => {
      if (ps.length > 1) return [ps[0]]
      const cur = ps[0].tabs.find((t) => t.id === ps[0].active)
      const t = mkTab(cur?.view ?? 'dashboard', cur?.arg)
      return [...ps, { id: 'p2', tabs: [t], active: t.id }]
    })
  }, [])

  /**
   * После загрузки архива открытые вкладки показывают то, чего в хранилище
   * больше нет: заметку прежнего владельца, удалённую доску. Заново открытый
   * дашборд честнее, чем список призраков.
   */
  const resetWorkspace = useCallback(() => {
    const t = mkTab('dashboard')
    setPanes([{ id: 'p1', tabs: [t], active: t.id }])
    setFocusPane(0)
  }, [])

  const activeTab = useMemo(() => {
    const p = panes[Math.min(focusPane, panes.length - 1)]
    return p?.tabs.find((t) => t.id === p.active) ?? null
  }, [panes, focusPane])

  const setEntryDate = useCallback<AppApi['setEntryDate']>((tabId, date) => {
    setEntryDates((m) => {
      // Ранний выход обязателен: вкладка публикует дату из эффекта, а новый
      // объект на каждый вызов запустил бы этот эффект по кругу без конца.
      if ((m[tabId] ?? null) === date) return m
      const next = { ...m }
      if (date) next[tabId] = date
      else delete next[tabId]
      return next
    })
  }, [])

  const setEntryAccount = useCallback<AppApi['setEntryAccount']>((tabId, id) => {
    setEntryAccounts((m) => {
      if ((m[tabId] ?? null) === id) return m
      const next = { ...m }
      if (id) next[tabId] = id
      else delete next[tabId]
      return next
    })
  }, [])
  const entryAccount = activeTab ? entryAccounts[activeTab.id] ?? null : null

  // Сегодняшний день наружу не отдаём: он и так стоит по умолчанию, а так
  // непустое значение здесь означает ровно одно — дата будет не сегодняшняя.
  const entryDate = useMemo(() => {
    const d = activeTab ? entryDates[activeTab.id] ?? null : null
    return d && d !== today() ? d : null
  }, [activeTab, entryDates])

  const openQuickAdd = useCallback<AppApi['openQuickAdd']>(
    (prefill, kind) => setQuickAdd({ text: prefill ?? '', kind, date: entryDate ?? undefined }),
    [entryDate],
  )

  const api = useMemo<AppApi>(
    () => ({
      openTab, closeTab, activeTab, panes, focusPane, setFocusPane, splitPane, resetWorkspace,
      editTransaction: setEditing,
      погасить: setПогашение,
      openPalette: () => setPaletteOpen(true),
      openQuickAdd,
      entryDate,
      setEntryDate,
      entryAccount,
      setEntryAccount,
      openSearch: (q?: string) => setSearchOpen(q ?? ''),
      rightOpen,
      toggleRight: () => setRightOpen((v) => !v),
      sidebarOpen,
      toggleSidebar: () => setSidebarOpen((v) => !v),
    }),
    [openTab, closeTab, activeTab, panes, focusPane, splitPane, resetWorkspace, rightOpen, sidebarOpen, openQuickAdd, entryDate, setEntryDate, entryAccount, setEntryAccount],
  )

  // ------------------------------------------------------------ клавиатура
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const inField = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      if (mod && e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault()
        setPaletteOpen(true)
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openQuickAdd()
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen('')
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void store.saveNow().catch(() => {})
      } else if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        const p = panes[focusPane]
        if (p) closeTab(focusPane, p.active)
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        splitPane()
      } else if (mod && e.key.toLowerCase() === 'b' && !inField) {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      } else if (mod && e.key.toLowerCase() === 'i' && !inField) {
        e.preventDefault()
        setRightOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panes, focusPane, closeTab, splitPane, store, openQuickAdd])

  // Отказ загрузки обязан проверяться ВЫШЕ заставки и ниже всех хуков:
  // иначе экран отказа не появится, и окно снова замрёт навсегда.
  if (failure) return <VaultFailureScreen info={failure} />

  if (!ready) {
    return (
      <div className="splash">
        <div style={{ fontSize: 30 }}>💰</div>
        <div>{т('Открываю хранилище…')}</div>
      </div>
    )
  }

  const bal = balances(data.accounts, data.transactions)

  return (
    <AppCtx.Provider value={api}>
      {/* Системную просьбу уменьшить движение мы уже учли при разрешении
          уровня — motion не должен резать анимации ещё раз поверх выбора. */}
      <MotionConfig reducedMotion={animLevel === 'off' ? 'always' : 'never'}>
      <ArchiveProvider>
      <PomodoroProvider>
      <ReminderHost />
      <HonorsHost />
      <UvedomleniyaHost />
      <ЧтоНовогоХост />
      <div className="app">
        <Ribbon onTheme={() => setThemeOpen(true)} />
        <Sidebar />
        <div className="main">
          <div className="panes">
            {panes.map((pane, pi) => (
              <div key={pane.id} className="pane" onMouseDown={() => setFocusPane(pi)} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="tabbar">
                  {pane.tabs.map((t) => (
                    <button
                      key={t.id}
                      className={'tab' + (t.id === pane.active ? ' active' : '')}
                      onClick={() =>
                        setPanes((ps) => ps.map((p, i) => (i === pi ? { ...p, active: t.id } : p)))
                      }
                      onAuxClick={(e) => {
                        if (e.button === 1) closeTab(pi, t.id)
                      }}
                    >
                      <Icon name={t.icon} size={14} />
                      <span className="tab-title">{t.title}</span>
                      <span
                        className="close"
                        onClick={(e) => {
                          e.stopPropagation()
                          closeTab(pi, t.id)
                        }}
                      >
                        <Icon name="x" size={12} />
                      </span>
                    </button>
                  ))}
                  <div className="tabbar-actions">
                    <button className="icon-btn" title={т('Разделить панель (Ctrl+\\)')} onClick={splitPane}>
                      <Icon name="panel" size={15} />
                    </button>
                    <button className="icon-btn" title={т('Боковая панель (Ctrl+I)')} onClick={() => setRightOpen((v) => !v)}>
                      <Icon name="menu" size={15} />
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                  <ViewHost tab={pane.tabs.find((t) => t.id === pane.active) ?? null} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Дефект №1 жил здесь: хук ниже раннего выхода по !open. Панель
            смонтирована всегда, поэтому её падение уносило всё окно.
            slotClass повторяет разметку самой панели, иначе колонка сетки
            .app потеряет ширину, а скрытая панель станет видимой. */}
        <Boundary
          level="slot"
          where={т('Сводка')}
          slotClass={'rightbar' + (rightOpen ? '' : ' hidden')}
          resetKey={String(rightOpen)}
        >
          <RightPanel open={rightOpen} />
        </Boundary>
        <div className="statusbar">
          {/* Бегущий помидор виден отовсюду: таймер, о котором забыли,
              потому что ушли на другой экран, — не таймер. */}
          <PomodoroBadge />
          <span>
            <b>{т('Активы:')}</b> {data.settings.hideBalance ? '••••' : money(bal.assets)}
          </span>
          {bal.liabilities < 0 && (
            <span>
              <b>{т('Обязательства:')}</b> {data.settings.hideBalance ? '••••' : money(bal.liabilities)}
            </span>
          )}
          <span>
            <b>{т('Чистый капитал:')}</b> {data.settings.hideBalance ? '••••' : money(bal.net)}
          </span>
          <span className="sp" />
          <span>{тр('{0} операций', data.transactions.length)}</span>
          <button
            className="btn sm ghost"
            style={{ padding: '1px 8px', fontSize: 12 }}
            onClick={() => void store.saveNow().catch(() => {})}
            title={т('Сохранить сейчас (Ctrl+S). Кроме того, изменения пишутся сразу после правки и раз в пять минут целиком.')}
          >
            <Icon name="save" size={13} />
            {dirty
              ? т('сохраняю…')
              : lastSaved
                ? т('сохранено в {0}', new Date(lastSaved).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
                : т('сохранить')}
          </button>
          {saveError && (
            <span style={{ color: 'var(--money-out)' }} title={saveError}>
              {т('не сохраняется')}</span>
          )}
          <span title={vaultPath} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {vaultPath}
          </span>
        </div>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {quickAdd !== null && (
        <QuickAdd initial={quickAdd.text} kind={quickAdd.kind} date={quickAdd.date} onClose={() => setQuickAdd(null)} />
      )}
      {searchOpen !== null && <GlobalSearch initial={searchOpen} onClose={() => setSearchOpen(null)} />}
      {editing && <TransactionModal draft={editing} onClose={() => setEditing(null)} />}
      {погашение && <PogashenieOkno цель={погашение} onClose={() => setПогашение(null)} />}
      {themeOpen && <ThemePicker onClose={() => setThemeOpen(false)} />}
      <ClickSparkLayer />
      </PomodoroProvider>
      </ArchiveProvider>
      </MotionConfig>
    </AppCtx.Provider>
  )
}

// ------------------------------------------------------------------ лента
const RIBBON: { view: ViewId; hint: string }[] = [
  { view: 'dashboard', hint: т('Дашборд') },
  { view: 'transactions', hint: т('Операции') },
  { view: 'budget', hint: т('Бюджет') },
  { view: 'forecast', hint: т('Прогноз') },
  { view: 'advice', hint: т('Советы') },
  { view: 'canvas', hint: т('Канвас') },
  { view: 'notes', hint: т('Заметки') },
  { view: 'graph', hint: т('Граф') },
]

function Ribbon({ onTheme }: { onTheme: () => void }) {
  const app = useApp()
  const store = useStore()
  const cur = app.activeTab?.view
  const обновленіе = useЕстьОбновленіе()

  return (
    <div className="ribbon">
      {/* Единственная кнопка левой панели — и в ленте, а не на самой панели:
          кнопка, которая прячется вместе с тем, что прячет, вернуть его уже
          не может. Так и было: свернул — и развернуть нечем. */}
      <button
        className="ribbon-btn"
        title={app.sidebarOpen ? т('Скрыть левую панель (Ctrl+B)') : т('Показать левую панель (Ctrl+B)')}
        aria-pressed={app.sidebarOpen}
        onClick={app.toggleSidebar}
      >
        <Icon name={app.sidebarOpen ? 'left' : 'right'} size={17} />
      </button>
      {/* Подсказка называет дату, когда она не сегодняшняя: с ленты не
          видно, какой период открыт на вкладке. */}
      <button
        className="ribbon-btn"
        title={app.entryDate ? т('Новая операция за ') + relDate(app.entryDate) + ' (Ctrl+N)' : т('Новая операция (Ctrl+N)')}
        onClick={() => app.openQuickAdd()}
      >
        <Icon name="plus" size={19} />
      </button>
      <div style={{ height: 8 }} />
      {RIBBON.map((r) => (
        <button
          key={r.view}
          className={'ribbon-btn' + (cur === r.view ? ' active' : '')}
          title={r.hint}
          onClick={() => app.openTab(r.view)}
        >
          <Icon name={VIEW_META[r.view].icon} size={18} />
        </button>
      ))}
      <div className="ribbon-spacer" />
      <UvedomleniyaKnopka className="ribbon-btn" />
      <button
        className="ribbon-btn"
        title={т('Оформление: {0}. Клик — галерея, средняя кнопка — светлая/тёмная', store.data.settings.customThemes?.find((тм) => тм.id === store.data.settings.customTheme)?.name ??
          themeById(store.data.settings.theme).name)}
        onClick={onTheme}
        onAuxClick={(e) => {
          // Светлость переключается у встроенной темы; своя при этом снимается,
          // иначе переключатель менял бы невидимую основу и казался сломанным.
          if (e.button === 1) store.patchSettings({ theme: counterpart(store.data.settings.theme), customTheme: undefined })
        }}
      >
        <Icon name={themeById(store.data.settings.theme).mode === 'dark' ? 'moon' : 'sun'} size={17} />
      </button>
      <button className="ribbon-btn" title={т('Палитра команд (Ctrl+P)')} onClick={app.openPalette}>
        <Icon name="search" size={17} />
      </button>
      <button
        className={'ribbon-btn' + (cur === 'settings' ? ' active' : '')}
        title={обновленіе ? т('Настройки · есть новая версия') : т('Настройки')}
        onClick={() => app.openTab('settings')}
      >
        <Icon name="gear" size={17} />
        {обновленіе && <span className="nav-dot" />}
      </button>
    </div>
  )
}

// --------------------------------------------------------------- сайдбар
function Sidebar() {
  const app = useApp()
  const { data } = useStore()
  const обновленіе = useЕстьОбновленіе()
  // Хук стоит выше раннего выхода: иначе при скрытии панели число хуков
  // менялось бы между отрисовками, и React ронял бы окно.
  const [свёрнуты, поставитьСвёрнуты] = useСвёрнутыеГруппы()
  if (!app.sidebarOpen) return <div className="sidebar hidden" />

  const groups: { title: string; items: ViewId[] }[] = [
    { title: т('Учёт'), items: ['dashboard', 'transactions', 'accounts', 'categories'] },
    { title: т('Планирование'), items: ['tasks', 'budget', 'goals', 'recurring', 'reminders', 'debts'] },
    { title: т('Анализ'), items: ['profile', 'znaki', 'forecast', 'calendar', 'year', 'advice'] },
    { title: т('Пространство'), items: ['canvas', 'notes', 'graph'] },
    { title: т('Данные'), items: ['import', 'settings'] },
  ]

  const counts: Partial<Record<ViewId, number>> = {
    transactions: data.transactions.length,
    accounts: data.accounts.filter((a) => !a.archived).length,
    categories: data.categories.filter((c) => !c.archived).length,
    goals: data.goals.filter((g) => !g.done).length,
    recurring: data.recurring.filter((r) => r.active).length,
    reminders: (data.reminders ?? []).filter((r) => r.active).length,
    tasks: (data.tasks ?? []).filter((t) => !t.done).length,
  }

  const всеСвёрнуты = groups.every((g) => свёрнуты.has(g.title))

  return (
    <div className="sidebar">
      {/* Кнопки «скрыть панель» здѣсь больше нет: она живёт в ленте слева,
          одна на панель и всегда на виду. Прежняя стрелка прятала панель
          вместе с собой, и вернуть её можно было только Ctrl+B. */}
      <div className="sidebar-head">
        <ShinyText speed={7}>{т('Кошель')}</ShinyText>
        <button
          className="icon-btn"
          title={всеСвёрнуты ? т('Развернуть все группы') : т('Свернуть все группы')}
          onClick={() => поставитьСвёрнуты(всеСвёрнуты ? new Set() : new Set(groups.map((g) => g.title)))}
        >
          <Icon name={всеСвёрнуты ? 'down' : 'up'} size={14} />
        </button>
      </div>
      <div className="sidebar-body">
        {groups.map((g) => {
          const свёрнута = свёрнуты.has(g.title)
          return (
            <div key={g.title} className={'nav-block' + (свёрнута ? ' svernuta' : '')}>
              <button
                className="nav-group"
                aria-expanded={!свёрнута}
                onClick={() => {
                  const н = new Set(свёрнуты)
                  if (свёрнута) н.delete(g.title)
                  else н.add(g.title)
                  поставитьСвёрнуты(н)
                }}
              >
                {g.title}
                <span className="nav-chev"><Icon name="down" size={12} /></span>
              </button>
              <div className="nav-items">
                {/* inert: свёрнутые пункты остаются в разметке ради плавной
                    анимации, но Tab по ним ходить не должен. */}
                <div {...(свёрнута ? { inert: '' } : {})}>
                  {g.items.map((v) => (
                    <button
                      key={v}
                      className={'nav-item' + (app.activeTab?.view === v && !app.activeTab?.arg ? ' active' : '')}
                      onClick={() => app.openTab(v)}
                    >
                      <Icon name={VIEW_META[v].icon} size={15} />
                      <span>{VIEW_META[v].title}</span>
                      {counts[v] != null && <span className="count">{counts[v]}</span>}
                      {v === 'settings' && обновленіе && <span className="nav-dot" title={т('Есть новая версия')} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/*
 * Какие группы свёрнуты — помнится между запусками.
 *
 * Хранится в localStorage, а не в хранилище: это привычка окна, а не данные
 * о деньгах, и уезжать вместе с ними в облако на другой компьютер ей незачем.
 */
const ГДѢ_СВЁРНУТЫ = 'kashel:свёрнутыеГруппы'

function useСвёрнутыеГруппы(): [Set<string>, (н: Set<string>) => void] {
  const [свёрнуты, setСвёрнуты] = useState<Set<string>>(() => {
    try {
      const сырое = localStorage.getItem(ГДѢ_СВЁРНУТЫ)
      return new Set(сырое ? (JSON.parse(сырое) as string[]) : [])
    } catch {
      return new Set()
    }
  })
  const поставить = useCallback((н: Set<string>) => {
    setСвёрнуты(н)
    try { localStorage.setItem(ГДѢ_СВЁРНУТЫ, JSON.stringify([...н])) } catch { /* приватное окно */ }
  }, [])
  return [свёрнуты, поставить]
}

// ---------------------------------------------------------------- вьюхи
function ViewHost({ tab }: { tab: Tab | null }) {
  const level = useStore().data.settings.animations
  if (!tab) return null
  return (
    <motion.div
      key={tab.id}
      style={{ height: '100%' }}
      initial={level === 'off' ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: level === 'full' ? 0.22 : 0.12, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {/* Граница внутри motion.div с key={tab.id}: при переключении вкладки
          она размонтируется, и состояние ошибки снимается само. Снаружи
          ViewHost она пережила бы смену вкладки и показывала бы чужой отказ
          на здоровом экране. */}
      <TabIdCtx.Provider value={tab.id}>
        <Boundary level="view" where={tab.title}>
          {renderView(tab)}
        </Boundary>
      </TabIdCtx.Provider>
    </motion.div>
  )
}

function renderView(tab: Tab) {
  switch (tab.view) {
    case 'dashboard': return <Dashboard />
    case 'transactions': return <Transactions filter={tab.arg} />
    case 'categories': return <Categories />
    case 'accounts': return <Accounts />
    case 'budget': return <Budget />
    case 'goals': return <Goals />
    case 'debts': return <Debts />
    case 'recurring': return <RecurringView />
    case 'reminders': return <RemindersView />
    case 'tasks': return <TasksView />
    case 'profile': return <ProfileView />
    case 'znaki': return <ZnakiView />
    case 'forecast': return <Forecast />
    case 'advice': return <AdviceView />
    case 'calendar': return <CalendarView />
    case 'year': return <YearView />
    case 'canvas': return <CanvasView name={tab.arg} />
    case 'notes': return <Notes note={tab.arg} />
    case 'graph': return <GraphView />
    case 'import': return <ImportView />
    case 'settings': return <SettingsView />
    default: return null
  }
}

/** Отсчёт помидора в строке состояния. Молчит, пока таймер не запущен. */
function PomodoroBadge() {
  const app = useApp()
  const p = usePomodoro()
  if (p.phase === 'idle') return null
  return (
    <span
      className="btn sm ghost"
      style={{ cursor: 'pointer' }}
      title={p.phase === 'work' ? т('Идёт работа') : т('Перерыв')}
      onClick={() => app.openTab('tasks')}
    >
      <Icon name="clock" size={13} /> {clock(p.left)}
      {p.paused ? т(' · пауза') : p.phase === 'rest' ? т(' · перерыв') : ''}
    </span>
  )
}
