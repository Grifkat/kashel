import type { ReminderSound } from './types'

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
  { id: 'none', name: 'Без звука', hint: 'только окно' },
  { id: 'soft', name: 'Мягкий', hint: 'короткий тёплый тон' },
  { id: 'bell', name: 'Звонкий', hint: 'как колокольчик' },
  { id: 'low', name: 'Низкий', hint: 'глухой, не вздрагиваешь' },
  { id: 'double', name: 'Двойной', hint: 'два коротких — трудно не заметить' },
  { id: 'file', name: 'Свой файл', hint: 'из вашего хранилища' },
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
  if (!notes) return
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
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + n.at + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len)
    osc.connect(gain)
    gain.connect(a.destination)
    osc.start(t0 + n.at)
    osc.stop(t0 + n.at + n.len + 0.02)
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
