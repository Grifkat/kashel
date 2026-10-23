import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../lib/icons'
import { uid } from '../lib/format'
import type { CanvasNode, Settings, VaultData, БлокСводки, ЭлементСводки } from '../lib/types'
import { БЛОКИ_ПО_УМОЛЧАНИЮ } from '../lib/types'
import { Виджет } from './canvas/Vidzhety'
import { т } from '../i18n'

/*
 * Сетка «Сводки»: блоки и виджеты в 12 колонках.
 *
 * Двигать и тянуть можно сразу, без особого режима: у элемента под мышью
 * появляются ручка (перетащить), уголок (ширина и высота) и крестик. Ширина
 * встаёт по колонкам, высота виджета — по 20 px: свобода та же, что у
 * свободных окон, но ничего не налезает друг на друга.
 *
 * Виджеты — те же, что на канвасе (canvas/Vidzhety): готовые и свои из
 * библиотеки. Собранный однажды виджет живёт и на досках, и здесь.
 */

export const КОЛОНОК = 12
const МИН_КОЛОНОК = 3
const ВЫСОТА_ВИДЖЕТА = 220
const МИН_ВЫСОТА = 120
const МАКС_ВЫСОТА = 640

/** Раскладка из настроек: своя сеткой, иначе — блоки по старому списку во всю ширину. */
export function раскладкаСводки(s: Settings): ЭлементСводки[] {
  const своя = s.dashLayout
  if (Array.isArray(своя) && своя.length) {
    // Незнакомое и повторы отбрасываем: раскладка могла прийти из другой версии.
    const были = new Set<string>()
    return своя.filter((e) => {
      if (!e || typeof e.id !== 'string' || были.has(e.id)) return false
      были.add(e.id)
      if (e.block) return БЛОКИ_ПО_УМОЛЧАНИЮ.includes(e.block)
      return e.widget === 'flow' || e.widget === 'earn' || e.widget === 'balance' || (e.widget === 'custom' && typeof e.lib === 'string')
    }).map((e) => ({ ...e, span: колонки(e.span) }))
  }
  const блоки = s.dashBlocks?.length
    ? s.dashBlocks.filter((b, i, a) => БЛОКИ_ПО_УМОЛЧАНИЮ.includes(b) && a.indexOf(b) === i)
    : БЛОКИ_ПО_УМОЛЧАНИЮ
  return блоки.map((b) => ({ id: 'b:' + b, block: b, span: КОЛОНОК }))
}

const колонки = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(МИН_КОЛОНОК, Math.min(КОЛОНОК, Math.round(n))) : КОЛОНОК

/** Что записать в настройки: раскладку и рядом порядок блоков для старых версий. */
export function сохранениеРаскладки(список: ЭлементСводки[]): Pick<Settings, 'dashLayout' | 'dashBlocks'> {
  return { dashLayout: список, dashBlocks: список.flatMap((e) => (e.block ? [e.block] : [])) }
}

export function новыйВиджетСводки(widget: NonNullable<ЭлементСводки['widget']>, extra: Partial<ЭлементСводки> = {}): ЭлементСводки {
  return { id: 'w:' + uid('dw'), widget, span: 4, h: ВЫСОТА_ВИДЖЕТА, ...extra }
}

export function СеткаСводки({
  items,
  data,
  from,
  periodLabel,
  блок,
  названиеБлока,
  названиеВиджета,
  настройка,
  onChange,
  onEditCustom,
}: {
  items: ЭлементСводки[]
  data: VaultData
  /** Начало периода «Сводки» — для виджетов с периодом «как у доски». */
  from: string
  periodLabel: string
  блок(b: БлокСводки): React.ReactNode
  названиеБлока(b: БлокСводки): string
  названиеВиджета(e: ЭлементСводки): string
  /** Режим «Настроить вид»: элементы обведены, управление видно всегда. */
  настройка: boolean
  onChange(next: ЭлементСводки[]): void
  onEditCustom(e: ЭлементСводки): void
}) {
  const сетка = useRef<HTMLDivElement>(null)
  const [тяга, setТяга] = useState<{ id: string; над?: string; после?: boolean } | null>(null)
  const [правка, setПравка] = useState<{ id: string; span: number; h?: number } | null>(null)

  const видимые = items.filter((e) => !e.block || блок(e.block) != null)

  const перетащить = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    let над: string | undefined
    let после = false
    setТяга({ id })
    const move = (ev: PointerEvent) => {
      const под = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-dash-id]')
      const цель = под?.dataset.dashId
      if (!под || !цель || цель === id) {
        над = undefined
        setТяга({ id })
        return
      }
      const r = под.getBoundingClientRect()
      const широкий = r.width > (сетка.current?.clientWidth ?? 0) * 0.7
      // Во всю ширину — выше или ниже; в ряду — левее или правее.
      после = широкий ? ev.clientY > r.top + r.height / 2 : ev.clientX > r.left + r.width / 2
      над = цель
      setТяга({ id, над, после })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setТяга(null)
      if (!над) return
      const next = items.filter((x) => x.id !== id)
      const сам = items.find((x) => x.id === id)!
      const i = next.findIndex((x) => x.id === над)
      next.splice(i + (после ? 1 : 0), 0, сам)
      onChange(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const тянутьУгол = (e: React.PointerEvent, эл: ЭлементСводки) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const узел = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-dash-id]')
    const полотно = сетка.current
    if (!узел || !полотно) return
    const r = узел.getBoundingClientRect()
    const зазор = parseFloat(getComputedStyle(полотно).columnGap) || 16
    const шаг = (полотно.clientWidth + зазор) / КОЛОНОК
    const x0 = e.clientX
    const y0 = e.clientY
    let итог = { id: эл.id, span: эл.span, h: эл.h }
    setПравка(итог)
    const move = (ev: PointerEvent) => {
      const span = Math.max(МИН_КОЛОНОК, Math.min(КОЛОНОК, Math.round((r.width + зазор + ev.clientX - x0) / шаг)))
      const h = эл.widget
        ? Math.max(МИН_ВЫСОТА, Math.min(МАКС_ВЫСОТА, Math.round((r.height + ev.clientY - y0) / 20) * 20))
        : undefined
      итог = { id: эл.id, span, h }
      setПравка(итог)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setПравка(null)
      if (итог.span === эл.span && итог.h === эл.h) return
      onChange(items.map((x) => (x.id === эл.id ? { ...x, span: итог.span, ...(x.widget ? { h: итог.h } : {}) } : x)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const убрать = (id: string) => onChange(items.filter((x) => x.id !== id))
  const сдвинуть = (id: string, шаг: 1 | -1) => {
    const i = items.findIndex((x) => x.id === id)
    const j = i + шаг
    if (i < 0 || j < 0 || j >= items.length) return
    const next = [...items]
    next.splice(i, 1)
    next.splice(j, 0, items[i])
    onChange(next)
  }

  return (
    <div ref={сетка} className={'dash-grid' + (настройка ? ' editing' : '') + (тяга ? ' dragging' : '')}>
      {видимые.map((эл) => {
        const p = правка?.id === эл.id ? правка : null
        const span = p?.span ?? эл.span
        const h = p?.h ?? эл.h
        const имя = эл.block ? названиеБлока(эл.block) : названиеВиджета(эл)
        return (
          <div
            key={эл.id}
            data-dash-id={эл.id}
            className={
              'dash-item' + (эл.widget ? ' is-widget' : '') + (span === КОЛОНОК ? ' wide' : '') +
              (тяга?.id === эл.id ? ' moving' : '') +
              (тяга?.над === эл.id ? (тяга.после ? ' drop-after' : ' drop-before') : '') +
              (p ? ' resizing' : '')
            }
            style={{ gridColumn: `span ${span}` }}
          >
            <div className="dash-tools">
              <button
                className="dash-grip"
                title={т('Перетащить «{0}»', имя)}
                aria-label={т('Перетащить «{0}»', имя)}
                onPointerDown={(e) => перетащить(e, эл.id)}
              >
                <Icon name="dots" size={13} />
                {настройка && <span>{имя}</span>}
              </button>
              <span className="spacer" />
              {/* Стрелки — для тех, кому удобнее без мыши: тот же порядок, что перетаскиванием. */}
              {настройка && (
                <>
                  <button className="icon-btn" title={т('Выше')} aria-label={т('Выше')} disabled={items[0]?.id === эл.id} onClick={() => сдвинуть(эл.id, -1)}>
                    <Icon name="up" size={13} />
                  </button>
                  <button className="icon-btn" title={т('Ниже')} aria-label={т('Ниже')} disabled={items[items.length - 1]?.id === эл.id} onClick={() => сдвинуть(эл.id, 1)}>
                    <Icon name="down" size={13} />
                  </button>
                </>
              )}
              {эл.widget === 'custom' && (
                <button className="icon-btn" title={т('Править виджет')} aria-label={т('Править виджет')} onClick={() => onEditCustom(эл)}>
                  <Icon name="edit" size={13} />
                </button>
              )}
              <button
                className="icon-btn"
                title={эл.block ? т('Скрыть') : т('Убрать со «Сводки»')}
                aria-label={эл.block ? т('Скрыть') : т('Убрать со «Сводки»')}
                onClick={() => убрать(эл.id)}
              >
                <Icon name={эл.block ? 'eyeOff' : 'x'} size={13} />
              </button>
            </div>
            {эл.block ? (
              <div className="dash-block">{блок(эл.block)}</div>
            ) : (
              <ВиджетСводки эл={эл} h={h ?? ВЫСОТА_ВИДЖЕТА} data={data} from={from} periodLabel={periodLabel} />
            )}
            <span
              className="dash-resize"
              title={эл.widget ? т('Потяните: ширина и высота') : т('Потяните: ширина')}
              aria-hidden="true"
              onPointerDown={(e) => тянутьУгол(e, эл)}
            />
            {p && <span className="dash-size-badge">{p.span}/{КОЛОНОК}{эл.widget && p.h ? ` · ${p.h}px` : ''}</span>}
          </div>
        )
      })}
    </div>
  )
}

/** Виджет канваса на «Сводке»: размер S/M/L — по настоящему месту, как на доске. */
function ВиджетСводки({ эл, h, data, from, periodLabel }: { эл: ЭлементСводки; h: number; data: VaultData; from: string; periodLabel: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ширина, setШирина] = useState(320)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setШирина(el.clientWidth)
    const ro = new ResizeObserver(() => setШирина(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Узел-обёртка: виджет канваса берёт вид и размер из узла доски.
  const узел = useMemo<CanvasNode>(() => ({
    id: эл.id, type: 'widget', x: 0, y: 0, width: ширина, height: h,
    ...(эл.ref ? { ref: эл.ref } : {}),
    options: эл.widget === 'custom' ? { widget: 'custom', lib: эл.lib } : { widget: эл.widget },
  }), [эл.id, эл.widget, эл.lib, эл.ref, ширина, h])
  return (
    <div ref={ref} className="dash-widget" style={{ height: h }}>
      <Виджет node={узел} data={data} from={from} periodLabel={periodLabel} />
    </div>
  )
}
