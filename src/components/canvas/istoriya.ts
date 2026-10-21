import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { writeCanvas } from '../../state/vault'
import type { CanvasDoc } from '../../lib/types'
import { т } from '../../i18n'

/** Сколько шагов отмены помнит доска. */
const HISTORY_LIMIT = 60

/*
 * История доски и запись на диск.
 *
 * Сам документ живёт в доске (его читают все её части), здесь — что с ним
 * можно сделать: правка с историей (commit), без неё (touch — промежуточные
 * кадры перетаскивания), отмена и повтор. Запись откладывается на 300 мс и
 * схлопывается: десяток правок подряд — одна запись файла.
 */
export function useИстория({
  current,
  setDoc,
  docRef,
  отметитьДействие,
  toast,
}: {
  /** Имя открытой доски: в её файл идёт запись. */
  current: string
  setDoc: Dispatch<SetStateAction<CanvasDoc>>
  docRef: MutableRefObject<CanvasDoc>
  /** Правка доски — действие для серии, как запись или задача. */
  отметитьДействие(): void
  toast(text: string): void
}) {
  const [past, setPast] = useState<CanvasDoc[]>([])
  const [future, setFuture] = useState<CanvasDoc[]>([])
  /** Отложенная запись: доска сбрасывает её перед удалением и переименованием. */
  const saveTimer = useRef<number | null>(null)
  /** Что ждёт записи — чтобы дописать сразу, не дожидаясь таймера. */
  const ждёт = useRef<{ file: string; doc: CanvasDoc } | null>(null)

  const записать = useCallback((file: string, doc: CanvasDoc) => {
    ждёт.current = null
    void writeCanvas(file, doc).catch((e) =>
      toast(т('Доска не сохранена: ') + (e instanceof Error ? e.message : String(e))),
    )
  }, [toast])

  const persist = useCallback((next: CanvasDoc, file: string) => {
    if (!file) return
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    ждёт.current = { file, doc: next }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      записать(file, next)
    }, 300)
  }, [записать])

  /*
   * Дописать отложенное сразу. Окно, спрятанное в трей, Chromium теперь
   * усыпляет, и 300 мс таймера могли растянуться до минуты — а «Выйти» из
   * трея закрыло бы программу раньше. Поэтому, как только окно прячут или
   * доску закрывают (другая вкладка, другая доска), пишем без ожидания.
   */
  useEffect(() => {
    const дописать = () => {
      if (!ждёт.current) return
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = null
      записать(ждёт.current.file, ждёт.current.doc)
    }
    const спрятали = () => { if (document.visibilityState === 'hidden') дописать() }
    document.addEventListener('visibilitychange', спрятали)
    window.addEventListener('pagehide', дописать)
    return () => {
      document.removeEventListener('visibilitychange', спрятали)
      window.removeEventListener('pagehide', дописать)
      дописать()
    }
  }, [current, записать])

  /** Изменение с записью в историю — всё, что можно отменить. */
  const commit = useCallback(
    (next: CanvasDoc, before?: CanvasDoc) => {
      setPast((p) => [...p, before ?? docRef.current].slice(-HISTORY_LIMIT))
      setFuture([])
      setDoc(next)
      persist(next, current)
      отметитьДействие()
    },
    [current, persist, отметитьДействие, setDoc, docRef],
  )

  /** Изменение без истории — для промежуточных состояний перетаскивания. */
  const touch = useCallback((next: CanvasDoc) => setDoc(next), [setDoc])

  /**
   * Итог перетаскивания: документ уже менялся без истории (touch), теперь
   * в историю ложится снимок «до», а на диск — итог.
   */
  const закончитьПеретаскивание = useCallback(
    (before: CanvasDoc, final: CanvasDoc) => {
      setDoc(final)
      setPast((p) => [...p, before].slice(-HISTORY_LIMIT))
      setFuture([])
      persist(final, current)
    },
    [current, persist, setDoc],
  )

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      const prev = p[p.length - 1]
      setFuture((f) => [docRef.current, ...f].slice(0, HISTORY_LIMIT))
      setDoc(prev)
      persist(prev, current)
      return p.slice(0, -1)
    })
  }, [current, persist, setDoc, docRef])

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      const next = f[0]
      setPast((p) => [...p, docRef.current].slice(-HISTORY_LIMIT))
      setDoc(next)
      persist(next, current)
      return f.slice(1)
    })
  }, [current, persist, setDoc, docRef])

  /** Открыли другую доску — отменять в ней нечего. */
  const забыть = useCallback(() => {
    setPast([])
    setFuture([])
  }, [])

  /** Снять отложенную запись. true — она была. */
  const снятьЗапись = useCallback((): boolean => {
    if (!saveTimer.current) return false
    window.clearTimeout(saveTimer.current)
    saveTimer.current = null
    ждёт.current = null
    return true
  }, [])

  return { можноОтменить: past.length > 0, можноПовторить: future.length > 0, persist, commit, touch, закончитьПеретаскивание, undo, redo, забыть, снятьЗапись }
}
