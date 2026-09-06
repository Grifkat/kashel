import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Account, Category, Goal, Honors, ImportRule, Recurring, Reminder, Scenario, Settings, Task, TaskList,
  Transaction, VaultData,
} from '../lib/types'
import { monthKey, today } from '../lib/date'
import { uid } from '../lib/format'
import { bridge, isDesktop, loadVault, saveCore, saveTransactions, wipeSpaceFiles } from './vault'
import {
  DEFAULT_CATEGORIES, DEFAULT_SETTINGS, emptyVault, freshVault, migrateCredits, migrateSettings,
} from './defaults'
import { occurrencesInMonth } from '../engine/forecast'

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
  setData(updater: (d: VaultData) => VaultData, touched?: string[]): void

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

  wipeAll(): Promise<void>
  replaceAll(next: VaultData): Promise<void>
  chooseVault(): Promise<void>
}

const Ctx = createContext<Store | null>(null)

export const useStore = (): Store => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore вне провайдера')
  return v
}

/**
 * Догоняет пропущенные автосписания регулярных платежей до сегодняшнего дня.
 *
 * Отметка lastPosted обязательна: без неё удалённое пользователем автосписание
 * воскресало при следующем запуске, потому что правило снова не находило
 * операции за текущий месяц и создавало её заново.
 */
function postDueRecurring(data: VaultData): { data: VaultData; created: number; coreChanged: boolean } {
  const cur = monthKey(today())
  const created: Transaction[] = []
  const handled = new Set<string>()
  const day = Number(today().slice(8, 10))

  for (const r of data.recurring) {
    if (!r.active || !r.autoPost) continue
    if (r.lastPosted && r.lastPosted >= cur) continue
    if (!occurrencesInMonth(r, cur)) continue
    if (r.freq === 'monthly' && (r.dayOfMonth ?? 1) > day) continue
    const exists = data.transactions.some((t) => t.recurringId === r.id && monthKey(t.date) === cur)
    if (exists) {
      // Операция уже есть (например, из демо-данных) — отмечаем месяц как
      // проведённый, чтобы после её удаления она не появилась снова.
      handled.add(r.id)
      continue
    }

    const date = `${cur}-${String(Math.min(r.dayOfMonth ?? 1, day)).padStart(2, '0')}`
    created.push({
      id: uid('t'),
      kind: r.kind,
      date,
      amount: r.amount,
      accountId: r.accountId,
      toAccountId: r.toAccountId,
      categoryId: r.categoryId,
      tags: r.tags,
      note: r.title,
      recurringId: r.id,
      createdAt: new Date().toISOString(),
    })
    handled.add(r.id)
  }
  if (!handled.size) return { data, created: 0, coreChanged: false }
  return {
    data: {
      ...data,
      transactions: created.length ? [...data.transactions, ...created] : data.transactions,
      recurring: data.recurring.map((r) => (handled.has(r.id) ? { ...r, lastPosted: cur } : r)),
    },
    created: created.length,
    coreChanged: true,
  }
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

      // Старым кредитам проставляем остаток: без этого они не видны нигде,
      // кроме своего раздела. Правка разовая — второй раз условие не сойдётся.
      const кредиты = migrateCredits(start)
      const сКредитами = кредиты.changed
        ? { ...start, accounts: кредиты.accounts }
        : start

      const posted = postDueRecurring(сКредитами)
      if (seq !== bootSeq.current) return
      setDataRaw(posted.data)
      dataRef.current = posted.data
      if (posted.coreChanged || needCats || кредиты.changed) {
        coreDirty.current = true
        if (posted.created) touchedRef.current.add(monthKey(today()))
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
  const queueSave = useCallback(() => {
    setDirty(true)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
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
    }, 400)
  }, [])

  /**
   * Полное сохранение по требованию: пишет и справочники, и все месяцы,
   * не дожидаясь отложенной записи. Используется кнопкой «Сохранить»,
   * Ctrl+S, автосохранением по таймеру и закрытием окна.
   */
  const saveNow = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
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
  }, [])

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

  const setData = useCallback(
    (updater: (d: VaultData) => VaultData, touched?: string[]) => {
      if (touched?.length) for (const t of touched) touchedRef.current.add(t)
      else coreDirty.current = true
      setDataRaw((d) => updater(d))
      queueSave()
    },
    [queueSave],
  )

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
        return { ...d, transactions: d.transactions.map((x) => (x.id === t.id ? t : x)) }
      })
      queueSave()
    },
    [queueSave],
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      setDataRaw((d) => {
        const prev = d.transactions.find((x) => x.id === id)
        if (prev) touchedRef.current.add(monthKey(prev.date))
        return { ...d, transactions: d.transactions.filter((x) => x.id !== id) }
      })
      queueSave()
    },
    [queueSave],
  )

  /** Групповое удаление одним обновлением: по одному это сотни лишних перерисовок. */
  const deleteTransactions = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      const set = new Set(ids)
      setDataRaw((d) => {
        for (const t of d.transactions) if (set.has(t.id)) touchedRef.current.add(monthKey(t.date))
        return { ...d, transactions: d.transactions.filter((x) => !set.has(x.id)) }
      })
      queueSave()
    },
    [queueSave],
  )

  /** Возврат удалённого пакета — страховка для кнопки «отменить». */
  const restoreTransactions = useCallback(
    (list: Transaction[]) => {
      if (!list.length) return
      setDataRaw((d) => {
        const have = new Set(d.transactions.map((t) => t.id))
        const back = list.filter((t) => !have.has(t.id))
        for (const t of back) touchedRef.current.add(monthKey(t.date))
        return { ...d, transactions: [...d.transactions, ...back] }
      })
      queueSave()
    },
    [queueSave],
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
  const deleteAccount = remove('accounts')
  const upsertCategory = upsert('categories') as (c: Category) => void
  const deleteCategory = remove('categories')
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

  const patchSettings = useCallback(
    (p: Partial<Settings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } })),
    [setData],
  )

  const patchHonors = useCallback(
    (p: Partial<Honors>) => setData((d) => ({ ...d, honors: { ...d.honors, ...p } })),
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
  }, [])

  /**
   * Полная замена справочников и операций — этим пользуется загрузка архива.
   *
   * Пишем сразу и целиком, не дожидаясь отложенного сохранения: пустой набор
   * затронутых месяцев означает «переписать все и подчистить лишние файлы»,
   * иначе месяцы прежнего хранилища остались бы лежать рядом с новыми.
   */
  const replaceAll = useCallback(async (next: VaultData) => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    touchedRef.current.clear()
    coreDirty.current = false
    setDataRaw(next)
    dataRef.current = next
    await saveCore(next)
    await saveTransactions(next.transactions, new Set())
    setLastSaved(Date.now())
    setDirty(false)
  }, [])

  const chooseVault = useCallback(async () => {
    const p = await bridge.chooseVault()
    if (p) await boot()
  }, [boot])

  const value = useMemo<Store>(
    () => ({
      data, ready, vaultPath, dirty, lastSaved, saveNow, setData,
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
