import type { ReminderSound } from './types'
import { т } from '../i18n'

/*
 * Звуки напоминаний.
 *
 * Готовых звуковых файлов в программе нет и тянуть их со стороны нельзя:
 * установщик и так весит 80 мегабайт, а внешних зависимостей у программы
 * не заведено принципиально. Поэтому тоны синтезируются на месте — несколько
 * синусоид с затуханием. Весят они ноль байт и звучат одинаково на любой
 * машине, где есть звуковая карта.
 *
 * Свой файл человек может выбрать сам: он копируется в хранилище и едет
 * вместе с ним в архиве, так что на другом компьютере звук не потеряется.
 */

export interface SoundOption {
  id: ReminderSound
  name: string
  hint: string
}

export const SOUNDS: SoundOption[] = [
  { id: 'none', name: т('Без звука'), hint: т('только окно') },
  { id: 'soft', name: т('Мягкий'), hint: т('короткий тёплый тон') },
  { id: 'bell', name: т('Звонкий'), hint: т('как колокольчик') },
  { id: 'low', name: т('Низкий'), hint: т('глухой, не вздрагиваешь') },
  { id: 'double', name: т('Двойной'), hint: т('два коротких — трудно не заметить') },
  { id: 'file', name: т('Свой файл'), hint: т('из вашего хранилища') },
]

/** Ноты тонов: частоты в герцах и длительности в секундах. */
const TONES: Record<string, { hz: number; at: number; len: number; type: OscillatorType }[]> = {
  soft: [{ hz: 528, at: 0, len: 0.32, type: 'sine' }],
  bell: [
    { hz: 988, at: 0, len: 0.22, type: 'sine' },
    { hz: 1319, at: 0.06, len: 0.5, type: 'sine' },
  ],
  low: [{ hz: 196, at: 0, len: 0.42, type: 'triangle' }],
  double: [
    { hz: 740, at: 0, len: 0.14, type: 'sine' },
    { hz: 740, at: 0.19, len: 0.18, type: 'sine' },
  ],
}

// Один контекст на всю программу: браузеры ограничивают их число, а создавать
// новый на каждый звонок — верный способ упереться в этот предел за день.
let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  if (ctx) return ctx
  const C = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext
  if (!C) return null
  try {
    ctx = new C()
    return ctx
  } catch {
    return null
  }
}

/**
 * Проигрывает встроенный тон.
 *
 * Затухание обязательно: без него осциллятор обрывается на середине волны
 * и вместо мягкого тона слышен щелчок.
 */
export function playTone(id: ReminderSound): void {
  const notes = TONES[id]
  if (notes) сыграть(notes, 0.22)
}

function сыграть(notes: { hz: number; at: number; len: number; type: OscillatorType }[], громкость: number): void {
  const a = audio()
  if (!a) return
  // Звук из окна, которое человек ещё не трогал, браузер держит на паузе.
  if (a.state === 'suspended') void a.resume().catch(() => {})
  const t0 = a.currentTime
  for (const n of notes) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = n.type
    osc.frequency.value = n.hz
    gain.gain.setValueAtTime(0.0001, t0 + n.at)
    gain.gain.exponentialRampToValueAtTime(громкость, t0 + n.at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len)
    osc.connect(gain)
    gain.connect(a.destination)
    osc.start(t0 + n.at)
    osc.stop(t0 + n.at + n.len + 0.02)
  }
}

/*
 * Звук записи операции — короткий и тихий, чтобы было слышно, что запись
 * легла, но не надоедало на сотой трате. Доход — две ноты вверх, расход —
 * вниз: на слух понятно, что записалось. Выключается в настройках.
 */
const ЗАПИСЬ: Record<'income' | 'expense', { hz: number; at: number; len: number; type: OscillatorType }[]> = {
  income: [
    { hz: 659, at: 0, len: 0.12, type: 'sine' },
    { hz: 988, at: 0.07, len: 0.22, type: 'sine' },
  ],
  expense: [
    { hz: 880, at: 0, len: 0.1, type: 'sine' },
    { hz: 587, at: 0.06, len: 0.2, type: 'sine' },
  ],
}

/** Звук записи. `включено` — настройка saveSound; пусто значит «включено». */
export function звукЗаписи(kind: string, включено?: boolean): void {
  if (включено === false) return
  if (kind !== 'income' && kind !== 'expense') return
  try {
    сыграть(ЗАПИСЬ[kind], 0.12)
  } catch {
    /* звука нет — запись от этого не хуже */
  }
}

/** Проигрывает свой файл человека. Ошибку глотаем: звук — не повод падать. */
export function playFile(dataUrl: string): void {
  try {
    const el = new Audio(dataUrl)
    el.volume = 0.7
    void el.play().catch(() => {})
  } catch {
    /* нет звуковой карты или формат не поддержан — молчим */
  }
}
