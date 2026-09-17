import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Account, Category, Goal, Honors, ImportRule, Recurring, Reminder, Scenario, Settings, Task, TaskList,
  Transaction, VaultData,
} from '../lib/types'
import { monthKey, today } from '../lib/date'
import { uid } from '../lib/format'
import { bridge, isDesktop, loadVault, saveCore, saveTransactions, wipeSpaceFiles } from './vault'
import {
  DEFAULT_CATEGORIES, DEFAULT_SETTINGS, emptyVault, freshVault, migrateSettings,
} from './defaults'
import { перевестиКредиты } from '../engine/credit'
import { провестиАвтосписания } from '../engine/avtospisaniya'
import { перевестиДолги } from '../engine/stats'
import { безРодителя } from '../engine/podkategorii'
import { отметитьУчётКредитов } from '../engine/pogashenie'
import { occurrencesInMonth } from '../engine/forecast'
import { т } from '../i18n'
import { ВЕРСИЯ } from '../lib/versiya'
import { копииДоступны, сделатьКопию, ежедневнаяКопия } from './rezerv'

/** Почему хранилище не открылось — от этого зависит текст совета на экране. */
export interface VaultFailure {
  stage: 'path' | 'read' | 'create'
  path: string
  message: string
}

interface Store {
  data: VaultData
  ready: boolean
  vaultPath: string
  dirty: boolean
  lastSaved: number | null
  /** Не null — хранилище не открылось; интерфейс рисовать нечем и незачем. */
  failure: VaultFailure | null
  /** Последний отказ записи. Раньше он молча терялся в отложенном таймере. */
  saveError: string | null
  retryBoot(): Promise<void>
  saveNow(): Promise<void>
  /**
   * Правка данных. Любая ручная правка отмечает сегодняшний день для серии;
   * фоновые (уведомления, награды) передают безОтметки.
   */
  setData(updater: (d: VaultData) => VaultData, touched?: string[], опции?: { безОтметки?: boolean }): void
  /** Отметить день действием, которое живёт не в данных: канвас, заметки. */
  отметитьДействие(): void

  addTransaction(t: Omit<Transaction, 'id' | 'createdAt'>): Transaction
  updateTransaction(t: Transaction): void
  deleteTransaction(id: string): void
  deleteTransactions(ids: string[]): void
  restoreTransactions(list: Transaction[]): void

  upsertAccount(a: Account): void
  deleteAccount(id: string): void
  upsertCategory(c: Category): void
  deleteCategory(id: string): void
  upsertRecurring(r: Recurring): void
  deleteRecurring(id: string): void
  upsertReminder(r: Reminder): void
  deleteReminder(id: string): void
  upsertTask(t: Task): void
  deleteTask(id: string): void
  upsertTaskList(l: TaskList): void
  deleteTaskList(id: string): void
  patchHonors(p: Partial<Honors>): void
  upsertGoal(g: Goal): void
  deleteGoal(id: string): void
  upsertScenario(s: Scenario): void
  deleteScenario(id: string): void
  setImportRules(rules: ImportRule[]): void
  patchSettings(p: Partial<Settings>): void

  /** Стереть всё. Перед этим — резервная копия; возвращает её путь (или null в браузере). */
  wipeAll(): Promise<string | null>
  replaceAll(next: VaultData): Promise<void>
  chooseVault(): Promise<void>
}

const Ctx = createContext<Store | null>(null)

export const useStore = (): Store => {
  const v = useContext(Ctx)
  if (!v) throw new Error(т('useStore вне провайдера'))
  return v
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataRaw] = useState<VaultData>(emptyVault)
  const [ready, setReady] = useState(false)
  const [vaultPath, setVaultPath] = useState('')
  const [dirty, setDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [failure, setFailure] = useState<VaultFailure | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Загрузку зовут повторно — из «Выбрать другую папку» и «Попробовать снова».
  // Без счётчика поколений ответ отменённого запуска перетёр бы свежий.
  const bootSeq = useRef(0)

  const touchedRef = useRef<Set<string>>(new Set())
  const saveTimer = useRef<number | null>(null)
  const coreDirty = useRef(false)
  // Таймеру сохранения нужен актуальный снимок без подписки на ререндер.
  const dataRef = useRef<VaultData>(data)
  dataRef.current = data

  // ------------------------------------------------------------ загрузка
  const boot = useCallback(async () => {
    const seq = ++bootSeq.current
    setReady(false)
    setFailure(null)
    let stage: VaultFailure['stage'] = 'path'
    let p = ''
    try {
      p = await bridge.vaultPath()
      if (seq !== bootSeq.current) return
      setVaultPath(p)

      stage = 'read'
      let loaded = await loadVault()
      const новое = !loaded

      if (!loaded) {
        // Своих операций и счетов программа не выдумывает, а вот категории
        // кладёт сразу: пустой список категорий делает бесполезными и быстрый
        // ввод, и отчёты, а набор всё равно у всех примерно одинаковый.
        stage = 'create'
        const blank = freshVault()
        await saveCore(blank)
        loaded = blank
      }

      const merged: VaultData = {
        ...emptyVault(),
        ...loaded,
        settings: migrateSettings(loaded.settings),
      }

      // Ни одной категории и ни одной операции — хранилище всё равно что новое:
      // набор класть безопасно, своего в нём ещё ничего нет. Так же лечатся
      // хранилища прошлых версий, где категорий не было. Если операции есть,
      // а категорий нет, значит их удалили руками — не лезем.
      const needCats = merged.categories.length === 0 && merged.transactions.length === 0
      const start = needCats
        ? { ...merged, categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })) }
        : merged

      // Старые кредиты — на новый учёт: остаток = сколько осталось выплатить,
      // переводы на покупку в долг — платежи с расходом. Правка разовая: счёт
      // получает отметку версии, и второй раз его не трогают.
      const долги = перевестиДолги(start.accounts)
      // С какого дня следить за платежами кредита — отметка ставится один раз.
      const учёт = отметитьУчётКредитов(долги.accounts, today())
      const сДолгами = долги.changed || учёт.changed ? { ...start, accounts: учёт.accounts } : start
      const кредиты = перевестиКредиты(сДолгами)
      const сКредитами = кредиты.changed
        ? {
            ...сДолгами,
            accounts: кредиты.accounts,
            transactions: кредиты.transactions,
            categories: [...start.categories, ...кредиты.статьи],
          }
        : сДолгами
      for (const м of кредиты.месяцы) touchedRef.current.add(м)

      /*
       * Копия «перед обновлением»: версия сменилась или новая версия
       * собирается что-то переделать. Снимок — ровно то, что лежало на диске,
       * до всяких правок. Не вышло — работаем дальше: запись в тот же диск,
       * скорее всего, тоже не выйдет, и об этом скажет строка сохранения.
       */
      const былаВерсия = merged.settings.appVersion
      const естьДанные = merged.transactions.length > 0 || merged.accounts.length > 0
      const сменаВерсии = !новое && былаВерсия !== ВЕРСИЯ && (!!былаВерсия || естьДанные)
      if ((сменаВерсии || долги.changed || учёт.changed || кредиты.changed) && копииДоступны()) {
        try {
          await сделатьКопию(merged, 'update')
        } catch (e) {
          console.warn(т('Копия перед обновлением не сделана:'), e)
        }
        if (seq !== bootSeq.current) return
      }

      // Автосписания — см. engine/avtospisaniya: точные даты правил и догон
      // пропущенного. Отметка дня обязательна: без неё удалённое автосписание
      // воскресало бы при следующем запуске.
      const posted = провестиАвтосписания(сКредитами, today(), () => uid('t'))
      if (seq !== bootSeq.current) return
      // Отметка версии; новому хранилищу показывать «Что нового» незачем.
      const отметкаВерсии = posted.data.settings.appVersion !== ВЕРСИЯ || (новое && posted.data.settings.whatsNewSeen !== ВЕРСИЯ)
      const готово: VaultData = отметкаВерсии
        ? {
            ...posted.data,
            settings: {
              ...posted.data.settings,
              appVersion: ВЕРСИЯ,
              ...(новое ? { whatsNewSeen: ВЕРСИЯ } : {}),
            },
          }
        : posted.data
      setDataRaw(готово)
      dataRef.current = готово
      if (posted.coreChanged || needCats || кредиты.changed || долги.changed || учёт.changed || отметкаВерсии) {
        coreDirty.current = true
        for (const t of posted.created) touchedRef.current.add(monthKey(t.date))
        queueSave()
      }
      setReady(true)
    } catch (e) {
      if (seq !== bootSeq.current) return
      // Заставка обязана уступить место объяснению. Раньше отказ отсюда
      // становился необработанным промисом: setReady(true) не достигался
      // никогда, граница отрисовки отклонённый промис не ловит по устройству,
      // и окно навсегда оставалось на «Открываю хранилище…».
      setFailure({ stage, path: p, message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  // ------------------------------------------------------------ сохранение
  /*
   * Очередь записей. Отложенная запись, Ctrl+S, таймер и замена хранилища
   * не должны писать одни файлы одновременно: старая запись, закончившись
   * позже, откатила бы файл к прежнему виду. Каждая ждёт предыдущую.
   */
  const очередь = useRef<Promise<unknown>>(Promise.resolve())
  const вОчередь = useCallback(<T,>(дѣло: () => Promise<T>): Promise<T> => {
    const р = очередь.current.then(дѣло, дѣло)
    очередь.current = р.catch(() => {})
    return р
  }, [])

  const queueSave = useCallback(() => {
    setDirty(true)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void вОчередь(async () => {
      saveTimer.current = null
      const touched = new Set(touchedRef.current)
      touchedRef.current.clear()
      const needCore = coreDirty.current
      coreDirty.current = false
      const cur = dataRef.current
      try {
        if (needCore) await saveCore(cur)
        if (touched.size) await saveTransactions(cur.transactions, touched)
        setSaveError(null)
        setDirty(false)
        setLastSaved(Date.now())
      } catch (e) {
        // Возвращаем отметки: иначе следующая запись решит, что писать нечего,
        // и правки останутся только в памяти. Молчать тоже нельзя — «сохраняю…»
        // висело бы навсегда без объяснения.
        for (const m of touched) touchedRef.current.add(m)
        if (needCore) coreDirty.current = true
        setSaveError(e instanceof Error ? e.message : String(e))
      }
    }), 400)
  }, [вОчередь])

  /**
   * Полное сохранение по требованию: пишет и справочники, и все месяцы,
   * не дожидаясь отложенной записи. Используется кнопкой «Сохранить»,
   * Ctrl+S, автосохранением по таймеру и закрытием окна.
   */
  const saveNow = useCallback((): Promise<void> => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    return вОчередь(async () => {
      const touched = new Set(touchedRef.current)
      touchedRef.current.clear()
      coreDirty.current = false
      setDirty(true)
      const cur = dataRef.current
      try {
        await saveCore(cur)
        await saveTransactions(cur.transactions, new Set())
        setSaveError(null)
        setDirty(false)
        setLastSaved(Date.now())
      } catch (e) {
        for (const m of touched) touchedRef.current.add(m)
        coreDirty.current = true
        setSaveError(e instanceof Error ? e.message : String(e))
        // Бросаем дальше: запасной экран границы отрисовки показывает этот текст
        // в своей строке отчёта. Все прочие вызовы гасят отказ своим перехватом.
        throw e
      }
    })
  }, [вОчередь])

  // Оболочка выходит только после того, как правки дописаны.
  useEffect(() => bridge.onSaveBeforeQuit?.(() => saveNow().catch(() => {})), [saveNow])

  /*
   * Ежедневная копия: при открытии и потом раз в полчаса — программу
   * держат открытой сутками, и «раз в день» должно значить именно это.
   */
  useEffect(() => {
    if (!ready || !копииДоступны()) return
    const сделать = () => void ежедневнаяКопия(dataRef.current).catch((e) => console.warn(т('Ежедневная копия не сделана:'), e))
    сделать()
    const id = window.setInterval(сделать, 30 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [ready])

  // Страховка на случай, если отложенная запись почему-то не сработала:
  // раз в пять минут переписываем хранилище целиком.
  useEffect(() => {
    if (!ready) return
    const id = window.setInterval(() => void saveNow().catch(() => {}), 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [ready, saveNow])

  // Закрытие окна не должно съедать последние правки.
  useEffect(() => {
    const onLeave = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
        const cur = dataRef.current
        void saveCore(cur).catch(() => {})
        void saveTransactions(cur.transactions, new Set()).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  /*
   * День действия для серии. Отметка живёт в основном файле, поэтому новая
   * отметка помечает его к записи, даже если правились только операции.
   */
  const сОтметкой = useCallback((d: VaultData): VaultData => {
    const день = today()
    const дни = d.activityDays ?? []
    if (дни.includes(день)) return d
    coreDirty.current = true
    return { ...d, activityDays: [...дни, день].slice(-800) }
  }, [])

  const setData = useCallback(
    (updater: (d: VaultData) => VaultData, touched?: string[], опции?: { безОтметки?: boolean }) => {
      if (touched?.length) for (const t of touched) touchedRef.current.add(t)
      else coreDirty.current = true
      setDataRaw((d) => (опции?.безОтметки ? updater(d) : сОтметкой(updater(d))))
      queueSave()
    },
    [queueSave, сОтметкой],
  )

  const отметитьДействие = useCallback(() => {
    if ((dataRef.current.activityDays ?? []).includes(today())) return
    setDataRaw((d) => сОтметкой(d))
    queueSave()
  }, [queueSave, сОтметкой])

  // -------------------------------------------------------------- операции
  const addTransaction = useCallback(
    (t: Omit<Transaction, 'id' | 'createdAt'>) => {
      const full: Transaction = { ...t, id: uid('t'), createdAt: new Date().toISOString() }
      setData((d) => ({ ...d, transactions: [...d.transactions, full] }), [monthKey(full.date)])
      return full
    },
    [setData],
  )

  const updateTransaction = useCallback(
    (t: Transaction) => {
      setDataRaw((d) => {
        const prev = d.transactions.find((x) => x.id === t.id)
        if (prev) touchedRef.current.add(monthKey(prev.date))
        touchedRef.current.add(monthKey(t.date))
        return сОтметкой({ ...d, transactions: d.transactions.map((x) => (x.id === t.id ? t : x)) })
      })
      queueSave()
    },
    [queueSave, сОтметкой],
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      setDataRaw((d) => {
        const prev = d.transactions.find((x) => x.id === id)
        if (prev) touchedRef.current.add(monthKey(prev.date))
        return сОтметкой({ ...d, transactions: d.transactions.filter((x) => x.id !== id) })
      })
      queueSave()
    },
    [queueSave, сОтметкой],
  )

  /** Групповое удаление одним обновлением: по одному это сотни лишних перерисовок. */
  const deleteTransactions = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      const set = new Set(ids)
      setDataRaw((d) => {
        for (const t of d.transactions) if (set.has(t.id)) touchedRef.current.add(monthKey(t.date))
        return сОтметкой({ ...d, transactions: d.transactions.filter((x) => !set.has(x.id)) })
      })
      queueSave()
    },
    [queueSave, сОтметкой],
  )

  /** Возврат удалённого пакета — страховка для кнопки «отменить». */
  const restoreTransactions = useCallback(
    (list: Transaction[]) => {
      if (!list.length) return
      setDataRaw((d) => {
        const have = new Set(d.transactions.map((t) => t.id))
        const back = list.filter((t) => !have.has(t.id))
        for (const t of back) touchedRef.current.add(monthKey(t.date))
        return сОтметкой({ ...d, transactions: [...d.transactions, ...back] })
      })
      queueSave()
    },
    [queueSave, сОтметкой],
  )

  // -------------------------------------------------------------- справочники
  const upsert = <K extends keyof VaultData>(key: K) =>
    useCallback(
      (item: { id: string }) => {
        setData((d) => {
          const list = d[key] as unknown as { id: string }[]
          const exists = list.some((x) => x.id === item.id)
          return {
            ...d,
            [key]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item],
          } as VaultData
        })
      },
      [setData],
    )

  const remove = <K extends keyof VaultData>(key: K) =>
    useCallback(
      (id: string) => {
        setData((d) => ({
          ...d,
          [key]: (d[key] as unknown as { id: string }[]).filter((x) => x.id !== id),
        } as VaultData))
      },
      [setData],
    )

  const upsertAccount = upsert('accounts') as (a: Account) => void
  /*
   * Удаление счёта. Операции на нём остаются — это история, — а вот
   * регулярные правила с него и на него выключаются: иначе они продолжали бы
   * проводиться на счёт, которого больше нет.
   */
  const deleteAccount = useCallback(
    (id: string) => {
      setData((d) => ({
        ...d,
        accounts: d.accounts.filter((x) => x.id !== id),
        recurring: d.recurring.map((r) => (r.active && (r.accountId === id || r.toAccountId === id) ? { ...r, active: false } : r)),
      }))
    },
    [setData],
  )
  const upsertCategory = upsert('categories') as (c: Category) => void
  // Подкатегории удалённой главной становятся главными — см. engine/podkategorii.
  const deleteCategory = useCallback(
    (id: string) => setData((d) => ({ ...d, categories: безРодителя(d, id) })),
    [setData],
  )
  const upsertRecurring = upsert('recurring') as (r: Recurring) => void
  const deleteRecurring = remove('recurring')
  const upsertReminder = upsert('reminders') as (r: Reminder) => void
  const deleteReminder = remove('reminders')
  const upsertTask = upsert('tasks') as (t: Task) => void
  const deleteTask = remove('tasks')
  const upsertTaskList = upsert('taskLists') as (l: TaskList) => void
  const deleteTaskList = remove('taskLists')
  const upsertGoal = upsert('goals') as (g: Goal) => void
  const deleteGoal = remove('goals')
  const upsertScenario = upsert('scenarios') as (s: Scenario) => void
  const deleteScenario = remove('scenarios')

  const setImportRules = useCallback(
    (rules: ImportRule[]) => setData((d) => ({ ...d, importRules: rules })),
    [setData],
  )

  // Настройки и награды — не действие для серии: награды пишутся сами, а тема — не учёт.
  const patchSettings = useCallback(
    (p: Partial<Settings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }), undefined, { безОтметки: true }),
    [setData],
  )

  const patchHonors = useCallback(
    (p: Partial<Honors>) => setData((d) => ({ ...d, honors: { ...d.honors, ...p } }), undefined, { безОтметки: true }),
    [setData],
  )


  // -------------------------------------------------------------- служебное
  /**
   * Полная очистка: хранилище возвращается к состоянию «программа только что
   * установлена». Стираются операции, счета, категории, цели, регулярные
   * платежи, сценарии, правила импорта, заметки и канвасы. Настройки и путь
   * к хранилищу сохраняются — это про данные, а не про программу.
   */
  const wipeAll = useCallback(async () => {
    // Сначала копия. Не вышла — ничего не стираем: отказ уходит в интерфейс.
    const копия = копииДоступны() ? await сделатьКопию(dataRef.current, 'wipe') : null
    const months = new Set(dataRef.current.transactions.map((t) => monthKey(t.date)))
    // «Стереть всё» возвращает состояние только что установленной программы —
    // значит, вместе с данными возвращается и стандартный набор категорий.
    const blank: VaultData = { ...freshVault(), settings: dataRef.current.settings }
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    touchedRef.current.clear()
    coreDirty.current = false
    setDataRaw(blank)
    dataRef.current = blank
    await saveCore(blank)
    await saveTransactions([], months)
    await wipeSpaceFiles()
    setLastSaved(Date.now())
    setDirty(false)
    return копия
  }, [])

  /**
   * Полная замена справочников и операций — этим пользуется загрузка архива.
   *
   * Пишем сразу и целиком, не дожидаясь отложенного сохранения: пустой набор
   * затронутых месяцев означает «переписать все и подчистить лишние файлы»,
   * иначе месяцы прежнего хранилища остались бы лежать рядом с новыми.
   */
  const replaceAll = useCallback(async (пришло: VaultData) => {
    // Архив мог быть сделан прежней версией — кредиты переводим так же, как при открытии.
    const сДолгами = { ...пришло, accounts: отметитьУчётКредитов(перевестиДолги(пришло.accounts).accounts, today()).accounts }
    const к = перевестиКредиты(сДолгами)
    const next = к.changed
      ? { ...сДолгами, accounts: к.accounts, transactions: к.transactions, categories: [...пришло.categories, ...к.статьи] }
      : сДолгами
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    touchedRef.current.clear()
    coreDirty.current = false
    setDataRaw(next)
    dataRef.current = next
    await вОчередь(async () => {
      await saveCore(next)
      await saveTransactions(next.transactions, new Set())
    })
    setLastSaved(Date.now())
    setDirty(false)
  }, [вОчередь])

  const chooseVault = useCallback(async () => {
    const p = await bridge.chooseVault()
    if (p) await boot()
  }, [boot])

  const value = useMemo<Store>(
    () => ({
      data, ready, vaultPath, dirty, lastSaved, saveNow, setData, отметитьДействие,
      addTransaction, updateTransaction, deleteTransaction, deleteTransactions, restoreTransactions,
      upsertAccount, deleteAccount, upsertCategory, deleteCategory,
      upsertRecurring, deleteRecurring, upsertReminder, deleteReminder,
      upsertTask, deleteTask, upsertTaskList, deleteTaskList, upsertGoal, deleteGoal,
      upsertScenario, deleteScenario, setImportRules, patchSettings, patchHonors,
      wipeAll, replaceAll, chooseVault,
      failure, saveError, retryBoot: boot,
    }),
    [data, ready, vaultPath, dirty, lastSaved, saveNow, failure, saveError, boot],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { isDesktop }
