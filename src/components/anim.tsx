import React, { useEffect, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { useStore } from '../state/store'
import { money } from '../lib/format'
import type { AnimLevel, ResolvedAnim, Money as Minor, TxKind } from '../lib/types'

/**
 * Перекат цифр работает на Web Animations API и кастомных элементах.
 * В Electron это есть всегда, а вот в тестовой среде и в экзотических
 * сборках — нет, поэтому проверяем и молча откатываемся к обычному тексту.
 */
export const NUMBER_ANIMATION_SUPPORTED =
  typeof window !== 'undefined' &&
  typeof Element !== 'undefined' &&
  typeof (Element.prototype as unknown as { animate?: unknown }).animate === 'function' &&
  typeof window.customElements !== 'undefined'

/** Просит ли система уменьшить движение (в Windows — «Эффекты анимации» выключены). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/**
 * Итоговый уровень. Системная настройка — это значение по умолчанию, а не
 * запрет: если человек явно выбрал «полные», значит он их и хочет видеть.
 */
export function useAnimLevel(): ResolvedAnim {
  const raw = useStore().data.settings.animations
  const reduced = usePrefersReducedMotion()
  if (raw === 'system') return reduced ? 'off' : 'full'
  return raw
}

/** Пружины под уровень: «умеренно» — короче и жёстче, «полно» — мягче и заметнее. */
export function springOf(level: ResolvedAnim) {
  if (level === 'off') return { duration: 0 }
  return level === 'subtle'
    ? { type: 'spring' as const, stiffness: 460, damping: 40, mass: 0.7 }
    : { type: 'spring' as const, stiffness: 300, damping: 26, mass: 0.9 }
}

export function useSpring() {
  return springOf(useAnimLevel())
}

/**
 * Денежная сумма с перекатом цифр. Копейки показываются только когда они есть,
 * знак и символ валюты берутся из тех же правил, что и у текстового money(),
 * чтобы анимированные и обычные числа выглядели одинаково.
 */
export function Money({
  value,
  sign,
  cents,
  unit,
  className,
  style,
}: {
  value: Minor
  sign?: boolean
  cents?: boolean
  unit?: string
  className?: string
  style?: React.CSSProperties
}) {
  const { data } = useStore()
  const level = useAnimLevel()
  const u = unit ?? data.settings.profile.currency ?? '₽'

  if (level === 'off' || !NUMBER_ANIMATION_SUPPORTED) {
    return (
      <span className={className} style={style}>
        {money(value, { sign, cents, unit: u })}
      </span>
    )
  }

  const abs = Math.abs(value) / 100
  const showCents = cents ?? Math.abs(value) % 100 !== 0
  const prefix = sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  const ms = level === 'subtle' ? 340 : 680

  return (
    <NumberFlow
      className={className}
      style={style}
      value={abs}
      locales="ru-RU"
      format={{
        minimumFractionDigits: showCents ? 2 : 0,
        maximumFractionDigits: showCents ? 2 : 0,
      }}
      prefix={prefix}
      suffix={' ' + u}
      respectMotionPreference={false}
      transformTiming={{ duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)' }}
      spinTiming={{ duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)' }}
      opacityTiming={{ duration: 220, easing: 'ease-out' }}
    />
  )
}

/**
 * Сумма операции. Вид операции задаёт сразу три признака: цвет, насыщенность
 * и знак в отдельной колонке — по одному цвету список читать нельзя.
 * Перекат цифр здесь намеренно не включаем: это списки на сотни строк.
 */
export function Amount({
  value,
  kind,
  hidden,
  className,
  onClick,
}: {
  value: Minor
  kind: TxKind
  hidden?: boolean
  className?: string
  onClick?: () => void
}) {
  const { data } = useStore()
  const u = data.settings.profile.currency ?? '₽'
  const tone = kind === 'income' ? 'in' : kind === 'transfer' ? 'move' : 'out'
  const sign = kind === 'income' ? '+' : kind === 'transfer' ? '↔' : '−'
  return (
    <span className={`amount ${tone}${className ? ' ' + className : ''}`} onClick={onClick}>
      <span className="sign">{sign}</span>
      {hidden ? '••••' : money(Math.abs(value), { unit: u })}
    </span>
  )
}

/** Проценты и прочие «голые» числа — тем же перекатом. */
export function Num({
  value,
  digits = 0,
  suffix,
  className,
  style,
}: {
  value: number
  digits?: number
  suffix?: string
  className?: string
  style?: React.CSSProperties
}) {
  const level = useAnimLevel()
  if (level === 'off' || !NUMBER_ANIMATION_SUPPORTED || !Number.isFinite(value)) {
    return (
      <span className={className} style={style}>
        {(Number.isFinite(value) ? value : 0).toFixed(digits).replace('.', ',')}
        {suffix}
      </span>
    )
  }
  const ms = level === 'subtle' ? 340 : 680
  return (
    <NumberFlow
      className={className}
      style={style}
      value={value}
      locales="ru-RU"
      format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}
      suffix={suffix}
      respectMotionPreference={false}
      transformTiming={{ duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)' }}
      spinTiming={{ duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)' }}
    />
  )
}

/**
 * Список, который сам анимирует появление и исчезновение строк.
 * Вешается на контейнер: <div ref={useAnimatedList()}>…</div>
 */
export function useAnimatedList<T extends HTMLElement>() {
  const level = useAnimLevel()
  const [ref, enable] = useAutoAnimate<T>({
    duration: level === 'subtle' ? 160 : 260,
    easing: 'cubic-bezier(.2,.7,.2,1)',
    // Системную просьбу уже учли при разрешении уровня — здесь она мешала бы
    // явному выбору «полные».
    disrespectUserMotionPreference: true,
  })
  useEffect(() => {
    enable(level !== 'off')
  }, [level, enable])
  return ref
}
