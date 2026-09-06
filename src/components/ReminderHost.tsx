import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { useToast } from './ui'
import { dueReminders } from '../engine/reminders'
import { playFile, playTone } from '../lib/sound'
import { readAttachmentBase64 } from '../state/vault'
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

        toast(`${reminder.title} — ${detail}`)

        // Системное уведомление приходит поверх других окон; если браузерный
        // движок его запретил, тихо обходимся всплывающей подсказкой.
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(reminder.title, { body: detail, silent: reminder.sound !== 'none' })
          }
        } catch {
          /* уведомления недоступны — не повод падать */
        }

        if (reminder.sound === 'file' && reminder.soundFile) {
          void readAttachmentBase64(reminder.soundFile).then((b64) => {
            if (b64) playFile('data:audio/mpeg;base64,' + b64)
          })
        } else if (reminder.sound !== 'none') {
          playTone(reminder.sound)
        }

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
