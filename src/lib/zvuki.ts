/*
 * Звуки событий: что звучит, когда, и насколько громко.
 *
 * «Настройки» → «Звуки»: общий выключатель, громкость и свой звук у каждого
 * события — из встроенного набора или свой файл из хранилища. Звуки
 * напоминаний выбираются у самих напоминаний, но выключатель и громкость
 * действуют и на них.
 *
 * Прежде звук был только у записи операции (его выключали отдельной
 * галочкой), а помидор молчал на старте и звенел только вместе со
 * всплывающей подсказкой, поэтому казалось, что звук «то есть, то нет».
 */
import type { Settings } from './types'
import { playFile, playTone, тонЗаписи } from './sound'
import { readAttachmentBase64 } from '../state/vault'
import { т } from '../i18n'

export type ЗвукСобытие = 'save' | 'pomodoroStart' | 'pomodoroWorkEnd' | 'pomodoroRestEnd' | 'task' | 'award' | 'notice'

export interface СобытиеЗвука {
  id: ЗвукСобытие
  name: string
  /** Звук по умолчанию. */
  def: string
}

export const СОБЫТИЯ: СобытиеЗвука[] = [
  { id: 'save', name: т('Запись операции'), def: 'auto' },
  { id: 'pomodoroStart', name: т('Помидор: начало работы'), def: 'click' },
  { id: 'pomodoroWorkEnd', name: т('Помидор: конец работы'), def: 'bell' },
  { id: 'pomodoroRestEnd', name: т('Помидор: конец перерыва'), def: 'chime' },
  { id: 'task', name: т('Задача выполнена'), def: 'pop' },
  { id: 'award', name: т('Награда'), def: 'fanfare' },
  { id: 'notice', name: т('Уведомление'), def: 'double' },
]

/** Встроенные звуки. «auto» — только у записи: доход вверх, расход вниз. */
export const ЗВУКИ: { id: string; name: string }[] = [
  { id: 'none', name: т('Без звука') },
  { id: 'auto', name: т('Доход вверх, расход вниз') },
  { id: 'bell', name: т('Колокольчик') },
  { id: 'soft', name: т('Мягкий') },
  { id: 'chime', name: т('Перезвон') },
  { id: 'double', name: т('Двойной') },
  { id: 'pop', name: т('Капля') },
  { id: 'click', name: т('Щелчок') },
  { id: 'low', name: т('Низкий') },
  { id: 'gong', name: т('Гонг') },
  { id: 'fanfare', name: т('Фанфары') },
  { id: 'file', name: т('Свой файл…') },
]

export const звукиВключены = (s: Settings): boolean => s.sounds?.enabled !== false
export const громкость = (s: Settings): number => Math.max(0, Math.min(1, s.sounds?.volume ?? 0.7))

/** Какой звук у события. Старая галочка «Звук при записи операции» тоже учитывается. */
export function звукСобытия(s: Settings, e: ЗвукСобытие): string {
  const свой = s.sounds?.events?.[e]
  if (свой) return свой
  if (e === 'save' && s.saveSound === false) return 'none'
  return СОБЫТИЯ.find((x) => x.id === e)?.def ?? 'none'
}

/** Проиграть выбранное: встроенный тон, запись или свой файл. */
export function проиграть(выбор: string, s: Settings, файл?: string, вид?: 'income' | 'expense'): void {
  const г = громкость(s)
  if (выбор === 'none' || г <= 0) return
  try {
    if (выбор === 'auto') тонЗаписи(вид ?? 'income', г)
    else if (выбор === 'file') {
      if (!файл) return
      void readAttachmentBase64(файл).then((b64) => {
        if (b64) playFile('data:audio/mpeg;base64,' + b64, г)
      })
    } else playTone(выбор as never, г)
  } catch {
    /* звука нет — событие от этого не хуже */
  }
}

/** Звук события по настройкам. */
export function звук(s: Settings, e: ЗвукСобытие, вид?: 'income' | 'expense'): void {
  if (!звукиВключены(s)) return
  проиграть(звукСобытия(s, e), s, s.sounds?.files?.[e], вид)
}

/** Звук записи операции. Перевод и прочее — без звука, как и прежде. */
export function звукЗаписи(s: Settings, kind: string): void {
  if (kind === 'income' || kind === 'expense') звук(s, 'save', kind)
}
