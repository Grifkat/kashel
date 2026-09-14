import React, { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { useAnimLevel } from './anim'

/*
 * Декоративные эффекты по мотивам React Bits (https://github.com/DavidHDev/react-bits,
 * MIT + Commons Clause). Техники те же, но цвета переведены на переменные тем,
 * а тяжёлые места переписаны: искры рисуются только когда есть что рисовать.
 *
 * Все эффекты включаются лишь на уровне анимаций «полные»: при «умеренных»
 * остаётся только функциональное движение, при «выключенных» — ничего.
 */

const useDecor = () => useAnimLevel() === 'full'

// --------------------------------------------------------------- блик по тексту
/** Медленный световой блик по надписи. Хорош для одиночного акцента, не для списка. */
export function ShinyText({
  children,
  className,
  speed = 5,
}: {
  children: React.ReactNode
  className?: string
  speed?: number
}) {
  const on = useDecor()
  return (
    <span
      className={(className ? className + ' ' : '') + (on ? 'fx-shiny' : '')}
      style={on ? ({ '--fx-shine-speed': `${speed}s` } as React.CSSProperties) : undefined}
    >
      {children}
    </span>
  )
}

// ------------------------------------------------------------ градиентный текст
/** Заголовок с медленно переливающимся градиентом из акцента темы. */
export function GradientText({
  children,
  className,
  speed = 8,
}: {
  children: React.ReactNode
  className?: string
  speed?: number
}) {
  const on = useDecor()
  return (
    <span
      className={(className ? className + ' ' : '') + (on ? 'fx-gradient' : '')}
      style={on ? ({ '--fx-gradient-speed': `${speed}s` } as React.CSSProperties) : undefined}
    >
      {children}
    </span>
  )
}

// ------------------------------------------------------------- появление словами
/** Заголовок проявляется словами: расфокус плюс подъём. */
export function BlurWords({
  text,
  className,
  delay = 0.05,
}: {
  text: string
  className?: string
  delay?: number
}) {
  const level = useAnimLevel()
  if (level === 'off') return <span className={className}>{text}</span>

  const words = text.split(' ')
  return (
    <span className={className}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          style={{ display: 'inline-block', willChange: 'filter, transform, opacity' }}
          initial={{ opacity: 0, filter: 'blur(8px)', y: 10 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ delay: i * delay, duration: level === 'full' ? 0.5 : 0.28, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {w}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  )
}

// ------------------------------------------------------------------- появление
/** Блок выезжает снизу с задержкой — для карточек, появляющихся пачкой. */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  style?: React.CSSProperties
}) {
  const level = useAnimLevel()
  if (level === 'off') {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: level === 'full' ? 0.42 : 0.22, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Класс подсветки при наведении. */
export const glare = (extra?: string) => (extra ? extra + ' fx-glare' : 'fx-glare')

/**
 * Цвет подсветки карточки — цвет её хозяина: категории, цели, счёта.
 * Карточка «Здоровья» светится красным, «Досуга» — бирюзовым; одинаковый
 * акцент на всех превращал бы разноцветный список в одноцветный.
 */
export const цвѣтъПодсвѣтки = (цвѣтъ: string | undefined): React.CSSProperties =>
  (цвѣтъ ? ({ ['--glare' as string]: цвѣтъ } as React.CSSProperties) : {})

/**
 * Пятно света следует за курсором.
 *
 * Один слушатель на всё окно, а не по обработчику на карточку: карточек в
 * списке категорий бывает полсотни, и вешать на каждую свой слушатель
 * незачем. Координаты кладутся в CSS-переменные ближайшей .fx-glare — сама
 * подсветка целиком в CSS и без JS просто стоит пятном посередине.
 */
export function useПодсвѣткаЗаКурсоромъ() {
  useEffect(() => {
    let кадръ = 0
    let послѣдній: PointerEvent | null = null
    const поставить = () => {
      кадръ = 0
      const e = послѣдній
      if (!e) return
      const карточка = (e.target as Element | null)?.closest?.('.fx-glare') as HTMLElement | null
      if (!карточка) return
      const r = карточка.getBoundingClientRect()
      карточка.style.setProperty('--mx', `${e.clientX - r.left}px`)
      карточка.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    const onMove = (e: PointerEvent) => {
      послѣдній = e
      // Не чаще кадра: pointermove приходит сотнями в секунду.
      if (!кадръ) кадръ = requestAnimationFrame(поставить)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (кадръ) cancelAnimationFrame(кадръ)
    }
  }, [])
}

// ----------------------------------------------------------------------- искры
interface Spark {
  x: number
  y: number
  angle: number
  born: number
}

/**
 * Искры при нажатии на главные кнопки. В отличие от оригинала цикл отрисовки
 * запускается только когда искры есть и останавливается, когда они погасли, —
 * иначе программа, открытая весь день, впустую будит видеокарту.
 */
export function ClickSparkLayer() {
  const level = useAnimLevel()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sparks = useRef<Spark[]>([])
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (level !== 'full') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const DURATION = 420
    const RADIUS = 18
    const SIZE = 9
    const COUNT = 8

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const color = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4cc46a'

    const draw = (now: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      ctx.strokeStyle = color()
      ctx.lineWidth = 2
      ctx.lineCap = 'round'

      sparks.current = sparks.current.filter((s) => {
        const t = (now - s.born) / DURATION
        if (t >= 1) return false
        const eased = t * (2 - t)
        const dist = eased * RADIUS
        const len = SIZE * (1 - eased)
        ctx.globalAlpha = 1 - eased
        ctx.beginPath()
        ctx.moveTo(s.x + dist * Math.cos(s.angle), s.y + dist * Math.sin(s.angle))
        ctx.lineTo(s.x + (dist + len) * Math.cos(s.angle), s.y + (dist + len) * Math.sin(s.angle))
        ctx.stroke()
        return true
      })
      ctx.globalAlpha = 1

      // Цикл живёт ровно столько, сколько живут искры.
      if (sparks.current.length) frame.current = requestAnimationFrame(draw)
      else frame.current = null
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest?.('.btn.primary, [data-spark]')) return
      const now = performance.now()
      for (let i = 0; i < COUNT; i++) {
        sparks.current.push({ x: e.clientX, y: e.clientY, angle: (2 * Math.PI * i) / COUNT, born: now })
      }
      if (frame.current == null) frame.current = requestAnimationFrame(draw)
    }

    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('resize', resize)
      if (frame.current != null) cancelAnimationFrame(frame.current)
      frame.current = null
      sparks.current = []
    }
  }, [level])

  if (level !== 'full') return null
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 400 }}
    />
  )
}
