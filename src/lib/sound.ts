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
  chime: [
    { hz: 784, at: 0, len: 0.3, type: 'sine' },
    { hz: 988, at: 0.12, len: 0.3, type: 'sine' },
    { hz: 1175, at: 0.24, len: 0.5, type: 'sine' },
  ],
  pop: [{ hz: 1046, at: 0, len: 0.09, type: 'sine' }, { hz: 1568, at: 0.035, len: 0.12, type: 'sine' }],
  click: [{ hz: 1800, at: 0, len: 0.035, type: 'square' }, { hz: 1200, at: 0.05, len: 0.03, type: 'square' }],
  gong: [
    { hz: 110, at: 0, len: 1.6, type: 'sine' },
    { hz: 220, at: 0, len: 1.1, type: 'sine' },
    { hz: 331, at: 0, len: 0.8, type: 'triangle' },
  ],
  fanfare: [
    { hz: 523, at: 0, len: 0.16, type: 'triangle' },
    { hz: 659, at: 0.14, len: 0.16, type: 'triangle' },
    { hz: 784, at: 0.28, len: 0.16, type: 'triangle' },
    { hz: 1047, at: 0.42, len: 0.55, type: 'triangle' },
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
export function playTone(id: ReminderSound | string, громкость = 1): void {
  const notes = TONES[id]
  // Щелчок — прямоугольная волна, она громче синусоиды той же силы.
  if (notes && громкость > 0) сыграть(notes, 0.22 * громкость * (id === 'click' ? 0.35 : 1))
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

/** Тон записи: доход — две ноты вверх, расход — вниз. */
export function тонЗаписи(kind: 'income' | 'expense', громкость = 1): void {
  if (громкость > 0) сыграть(ЗАПИСЬ[kind], 0.12 * громкость)
}

/** Проигрывает свой файл человека. Ошибку глотаем: звук — не повод падать. */
export function playFile(dataUrl: string, громкость = 0.7): void {
  try {
    const el = new Audio(dataUrl)
    el.volume = Math.max(0, Math.min(1, громкость))
    void el.play().catch(() => {})
  } catch {
    /* нет звуковой карты или формат не поддержан — молчим */
  }
}
