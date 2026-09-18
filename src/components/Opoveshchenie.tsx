/*
 * Оповещения — то, что человек не должен пропустить: конец отрезка
 * помидора, напоминание, награда, платёж по кредиту.
 *
 * Прежде они шли той же маленькой подсказкой в углу, что и «Сохранено», и
 * их не замечали: звук был, а откуда — непонятно. Теперь это большая
 * плашка сверху по центру: значок, крупный заголовок, полоса оставшегося
 * времени. Наведение мыши её держит. Награда — отдельное окно посередине.
 *
 * Если окно не на виду — свёрнуто, в трее, под другими окнами, — то же
 * самое уходит системным уведомлением Windows, а значок на панели задач
 * мигает. Щелчок по уведомлению возвращает окно.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../state/store'
import { bridge } from '../state/vault'
import { Icon } from '../lib/icons'
import { звук, type ЗвукСобытие } from '../lib/zvuki'
import { т } from '../i18n'

export interface Оповещение {
  title: string
  body?: string
  icon?: string
  /** Оттенок плашки: акцент, удача, внимание. */
  tone?: 'accent' | 'good' | 'warn'
  /** Какой звук играть. Пусто — без звука. */
  звук?: ЗвукСобытие
  /** 'award' — окно посередине вместо плашки. */
  вид?: 'banner' | 'award'
  действие?: { label: string; onClick: () => void }
  /** Сколько держать плашку, мс. */
  держать?: number
}

type Слушатель = (о: Оповещение) => void
let слушатель: Слушатель | null = null

/** Показать оповещение. Работает из любого места программы. */
export function оповестить(о: Оповещение): void {
  слушатель?.(о)
}

/** Окно сейчас не на виду — свёрнуто, в трее или под другими окнами. */
const окноНеНаВиду = (): boolean => {
  if (typeof document === 'undefined') return false
  return document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus())
}

interface Плашка extends Оповещение {
  id: number
  до: number
  пауза?: number
}

const ДЕРЖАТЬ = 9000
let счётчик = 0

export function OpoveshchenieHost() {
  const { data } = useStore()
  const [плашки, setПлашки] = useState<Плашка[]>([])
  const [награды, setНаграды] = useState<Оповещение[]>([])
  const настройки = useRef(data.settings)
  настройки.current = data.settings

  const принять = useCallback<Слушатель>((о) => {
    const s = настройки.current
    if (о.звук) звук(s, о.звук)
    if (о.вид === 'award') setНаграды((н) => [...н, о].slice(-4))
    else {
      const держать = о.держать ?? ДЕРЖАТЬ
      setПлашки((п) => [...п, { ...о, id: ++счётчик, до: Date.now() + держать }].slice(-3))
    }
    if (s.notices?.system !== false && окноНеНаВиду()) {
      const заголовок = о.title
      const текст = о.body ?? ''
      if (bridge.notify) void bridge.notify({ title: заголовок, body: текст }).catch(() => {})
      else {
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(заголовок, { body: текст, silent: true })
        } catch {
          /* системные уведомления недоступны — хватит плашки */
        }
      }
    }
  }, [])

  useEffect(() => {
    слушатель = принять
    return () => {
      if (слушатель === принять) слушатель = null
    }
  }, [принять])

  // Плашки уходят сами; наведённая держится.
  useEffect(() => {
    if (!плашки.length) return
    const t = setInterval(() => {
      const сейчас = Date.now()
      setПлашки((п) => (п.some((x) => !x.пауза && x.до <= сейчас) ? п.filter((x) => x.пауза || x.до > сейчас) : п))
    }, 250)
    return () => clearInterval(t)
  }, [плашки.length])

  const убрать = (id: number) => setПлашки((п) => п.filter((x) => x.id !== id))
  const держать = (id: number, да: boolean) =>
    setПлашки((п) => п.map((x) => {
      if (x.id !== id) return x
      if (да) return { ...x, пауза: Math.max(0, x.до - Date.now()) }
      return { ...x, до: Date.now() + Math.max(2500, x.пауза ?? 0), пауза: undefined }
    }))

  if (typeof document === 'undefined') return null
  return createPortal(
    <>
      <div className="opov-stack" aria-live="assertive">
        {плашки.map((п) => (
          <div
            key={п.id}
            className={'opov tone-' + (п.tone ?? 'accent') + (п.пауза !== undefined ? ' held' : '')}
            role="alert"
            onMouseEnter={() => держать(п.id, true)}
            onMouseLeave={() => держать(п.id, false)}
          >
            <div className="opov-icon"><Icon name={п.icon ?? 'bell'} size={22} /></div>
            <div className="opov-text">
              <div className="opov-title">{п.title}</div>
              {п.body && <div className="opov-body">{п.body}</div>}
            </div>
            {п.действие && (
              <button
                className="btn sm primary"
                onClick={() => {
                  п.действие!.onClick()
                  убрать(п.id)
                }}
              >
                {п.действие.label}</button>
            )}
            <button className="icon-btn opov-close" title={т('Закрыть')} onClick={() => убрать(п.id)}>
              <Icon name="x" size={15} />
            </button>
            <div className="opov-timer" style={{ animationDuration: (п.держать ?? ДЕРЖАТЬ) + 'ms' }} />
          </div>
        ))}
      </div>

      {награды.length > 0 && (
        <div className="opov-award-shade" onMouseDown={() => setНаграды([])}>
          <div className="opov-award" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="opov-medal"><Icon name="sparkle" size={42} /></div>
            <div className="opov-award-kicker">{награды.length > 1 ? т('Пожалованы награды') : т('Пожалована награда')}</div>
            {награды.map((н, i) => (
              <div key={i} className="opov-award-item">
                <div className="opov-award-title">{н.title}</div>
                {н.body && <div className="opov-award-body">{н.body}</div>}
              </div>
            ))}
            <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 16 }}>
              {награды[0].действие && (
                <button
                  className="btn"
                  onClick={() => {
                    награды[0].действие!.onClick()
                    setНаграды([])
                  }}
                >
                  {награды[0].действие.label}</button>
              )}
              <button className="btn primary" autoFocus onClick={() => setНаграды([])}>{т('Благодарствую')}</button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  )
}

