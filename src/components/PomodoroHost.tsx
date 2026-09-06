import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useToast } from './ui'
import { playTone } from '../lib/sound'

/*
 * Помидор.
 *
 * Состояние живёт здесь, а не в разделе «Задачи», и это главное решение:
 * человек запускает таймер и уходит смотреть прогноз или записывать трату.
 * Если бы отсчёт хранился в самом разделе, он умирал бы при переключении
 * вкладки — то есть ровно тогда, когда он и нужен.
 *
 * Считаем не тиками, а по часам: setInterval на неактивной вкладке браузеры
 * придерживают, и таймер, сложенный из тиков, отстал бы на минуты. Поэтому
 * храним момент окончания и каждую секунду смотрим, сколько до него осталось.
 */

export type PomodoroPhase = 'idle' | 'work' | 'rest'

interface Pomodoro {
  phase: PomodoroPhase
  /** Сколько секунд осталось. Когда стоит на паузе — застывшее значение. */
  left: number
  paused: boolean
  /** Над какой задачей идёт работа. Пусто — просто отсчёт. */
  taskId: string | null
  /** Сколько рабочих отрезков закрыто за этот запуск программы. */
  doneToday: number
  start(taskId: string | null): void
  pause(): void
  resume(): void
  stop(): void
  skip(): void
}

const Ctx = createContext<Pomodoro | null>(null)

export const usePomodoro = (): Pomodoro => {
  const v = useContext(Ctx)
  if (!v) throw new Error('usePomodoro вне провайдера')
  return v
}

export function PomodoroProvider({ children }: { children: React.ReactNode }) {
  const { data, upsertTask } = useStore()
  const toast = useToast()
  const [phase, setPhase] = useState<PomodoroPhase>('idle')
  const [left, setLeft] = useState(0)
  const [paused, setPaused] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [doneToday, setDoneToday] = useState(0)
  const endAt = useRef<number | null>(null)

  const minutes = data.settings.pomodoro
  // Ссылки на свежие значения: обработчик тика создаётся один раз, а решения
  // принимает по тому, что происходит сейчас.
  const cur = useRef({ phase, taskId, minutes })
  cur.current = { phase, taskId, minutes }

  const начать = useCallback((next: PomodoroPhase, secs: number) => {
    endAt.current = Date.now() + secs * 1000
    setPhase(next)
    setLeft(secs)
    setPaused(false)
  }, [])

  const start = useCallback(
    (id: string | null) => {
      setTaskId(id)
      начать('work', Math.max(1, minutes.work) * 60)
    },
    [начать, minutes.work],
  )

  const pause = useCallback(() => {
    if (endAt.current) setLeft(Math.max(0, Math.round((endAt.current - Date.now()) / 1000)))
    endAt.current = null
    setPaused(true)
  }, [])

  const resume = useCallback(() => {
    endAt.current = Date.now() + left * 1000
    setPaused(false)
  }, [left])

  const stop = useCallback(() => {
    endAt.current = null
    setPhase('idle')
    setLeft(0)
    setPaused(false)
    setTaskId(null)
  }, [])

  /** Завершает текущий отрезок: рабочий засчитывается задаче, отдых — нет. */
  const завершить = useCallback(() => {
    const { phase: p, taskId: id, minutes: m } = cur.current
    if (p === 'work') {
      setDoneToday((n) => n + 1)
      if (id) {
        const t = data.tasks.find((x) => x.id === id)
        if (t) upsertTask({ ...t, pomodoros: (t.pomodoros ?? 0) + 1 })
      }
      playTone('bell')
      toast('Отрезок закрыт — перерыв ' + Math.max(1, m.rest) + ' мин')
      начать('rest', Math.max(1, m.rest) * 60)
    } else {
      playTone('soft')
      toast('Перерыв закончился')
      начать('work', Math.max(1, m.work) * 60)
    }
  }, [data.tasks, upsertTask, toast, начать])

  useEffect(() => {
    if (phase === 'idle' || paused) return
    const t = setInterval(() => {
      if (!endAt.current) return
      const secs = Math.max(0, Math.round((endAt.current - Date.now()) / 1000))
      setLeft(secs)
      if (secs === 0) завершить()
    }, 1000)
    return () => clearInterval(t)
  }, [phase, paused, завершить])

  const value: Pomodoro = {
    phase, left, paused, taskId, doneToday,
    start, pause, resume, stop,
    skip: завершить,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Минуты и секунды из остатка: 1500 → «25:00». */
export const clock = (secs: number): string =>
  `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
