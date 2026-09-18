import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { useToast } from './ui'
import { dueReminders } from '../engine/reminders'
import { проиграть, звукиВключены } from '../lib/zvuki'
import { оповестить } from './Opoveshchenie'
import { today } from '../lib/date'

/*
 * Кто показывает напоминания.
 *
 * Проверка идёт по кругу раз в минуту, а не один раз при запуске: окно
 * программы часто живёт сутками, и напоминание, заведённое на пятое число,
 * иначе дождалось бы только следующего перезапуска.
 *
 * Отметку lastFired ставим сразу после показа. Это же и защита от круга: пока
 * отметка равна сегодняшнему дню, dueReminders такое напоминание не вернёт,
 * поэтому запись в хранилище не запускает саму себя заново.
 */
const ПЕРИОД_МС = 60_000

export function ReminderHost() {
  const { data, ready, upsertReminder } = useStore()
  const toast = useToast()
  // Показанные за этот запуск — на случай, если запись в хранилище не успела
  // дойти до следующей проверки. Дублей человек не простит.
  const показаны = useRef(new Set<string>())

  useEffect(() => {
    if (!ready) return

    const проверить = () => {
      const день = today()
      for (const { reminder, detail } of dueReminders(data, день)) {
        const ключ = reminder.id + '@' + день
        if (показаны.current.has(ключ)) continue
        показаны.current.add(ключ)

        оповестить({ title: reminder.title, body: detail, icon: 'bulb', tone: 'warn' })

        // Системное уведомление Windows, когда окно не на виду, шлёт само
        // оповещение. Звук — свой у напоминания, но выключатель и громкость
        // из «Звуков» действуют и на него.
        if (звукиВключены(data.settings)) проиграть(reminder.sound, data.settings, reminder.soundFile)

        upsertReminder({ ...reminder, lastFired: день })
      }
    }

    // Разрешение спрашиваем один раз и молча: отказ ничего не ломает.
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => {})
      }
    } catch {
      /* нет уведомлений — работаем без них */
    }

    проверить()
    const t = setInterval(проверить, ПЕРИОД_МС)
    return () => clearInterval(t)
  }, [data, ready, toast, upsertReminder])

  return null
}
