import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { boundsOf } from './geometry'
import type { CanvasNode } from '../../lib/types'

/*
 * Камера доски: сдвиг и масштаб, колесо и тачпад.
 *
 * Масштаб — плавный, от 20 до 300 %. Прежде он шёл ступенями (25, 33, 50 …
 * 250 %): при произвольном коэффициенте текст карточек растягивался из
 * готового растра и мылился. Но ступени и давали рывки, на тачпаде особенно.
 * Теперь масштаб любой, а мыло лечится иначе: пока доска движется, слой
 * карточек живёт готовой картинкой (will-change — быстро), а через 160 мс
 * после остановки рисуется заново, и текст чёткий при любом масштабе
 * (.cv-moving в canvas.css).
 */
export const K_MIN = 0.2
export const K_MAX = 3
export const ZOOM_DEFAULT = 1
export const клампМасштаб = (k: number) => Math.min(K_MAX, Math.max(K_MIN, k))
/** Шаг кнопок «−/+» и клавиш Ctrl+=/−. */
const ШАГ_КНОПОК = 1.25
/** Одна щёлка колеса мыши (deltaY ≈ 100). */
const ШАГ_КОЛЕСА = 1.2
/** Сколько длится плавный шаг масштаба, мс. */
const ПЛАВНО_МС = 140

/**
 * Что делает колесо мыши: масштаб (по умолчанию, как в Miro) или прокрутку
 * (как в Figma). Выбор — свойство компьютера, а не хранилища: на ноутбуке с
 * тачпадом и на столе с мышью он может быть разным, поэтому живёт в
 * localStorage окна, рядом со свёрнутыми группами левой панели.
 */
export type Колесо = 'zoom' | 'scroll'
const ГДЕ_КОЛЕСО = 'kashel:canvas-wheel'
const прочестьКолесо = (): Колесо => {
  try {
    return localStorage.getItem(ГДЕ_КОЛЕСО) === 'scroll' ? 'scroll' : 'zoom'
  } catch {
    return 'zoom'
  }
}

/**
 * Мышь или тачпад. У мыши щёлка — шаг по одной оси; тачпад шлёт мелкие и
 * дробные сдвиги, часто по обеим осям. Начатый тачпадом жест держим за
 * тачпадом ещё 400 мс: в конце взмаха и он может прислать крупный шаг.
 *
 * По одному размеру шага мышь не узнать: при «прокручивать по 1 строке» в
 * Windows щёлка даёт deltaY ≈ 33, при увеличенном окне — ещё меньше, а
 * плавное колесо (Logitech и т. п.) шлёт доли. Зато Chromium в wheelDelta
 * отдаёт щёлку мыши кратной 120 при любых настройках и масштабе окна — по
 * ней мышь и узнаём. Shift+колесо Chromium поворачивает вбок (deltaX), и это
 * тоже мышь: прежде такая щёлка считалась тачпадом и на 400 мс «заражала»
 * следующие — обычное колесо после Shift двигало доску вместо масштаба.
 */
let последнийТачпад = 0
const этоТачпад = (e: WheelEvent): boolean => {
  const now = performance.now()
  const w = e as WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number }
  const щёлка = (d?: number) => typeof d === 'number' && d !== 0 && d % 120 === 0
  const мышиный =
    e.deltaMode === 1 ||
    (e.deltaX === 0 && (Math.abs(e.deltaY) >= 50 || щёлка(w.wheelDeltaY))) ||
    (e.deltaY === 0 && e.shiftKey && (Math.abs(e.deltaX) >= 50 || щёлка(w.wheelDeltaX)))
  if (!мышиный) последнийТачпад = now
  return !мышиный || now - последнийТачпад < 400
}

/** Сдвиг колеса в пикселях при любом deltaMode. */
const вПикселях = (e: WheelEvent, d: number): number => (e.deltaMode === 1 ? d * 33 : e.deltaMode === 2 ? d * 800 : d)

/** Можно ли элементу под курсором прокрутиться самому в эту сторону. */
const своёКолесо = (target: EventTarget | null, dy: number): boolean => {
  for (let el = target as HTMLElement | null; el && !el.classList?.contains('canvas-wrap'); el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight + 1) continue
    const oy = getComputedStyle(el).overflowY
    if (oy !== 'auto' && oy !== 'scroll') continue
    if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true
  }
  return false
}

export interface Вид {
  x: number
  y: number
  k: number
}

/**
 * Камера доски. Держит вид, плавный масштаб и колесо; доска даёт ей обёртку
 * (wrapRef) и имя открытой доски — по нему слушатель колеса вешается заново.
 */
export function useКамера(wrapRef: RefObject<HTMLDivElement>, current: string, animLevel: string) {
  const [view, setView] = useState<Вид>({ x: 420, y: 260, k: ZOOM_DEFAULT })
  const viewRef = useRef(view)
  viewRef.current = view
  /** Плавный шаг масштаба: куда идём и кадр анимации. */
  const анимация = useRef<{ to: number; frame: number } | null>(null)
  /** Доска движется — слой карточек живёт готовой картинкой. */
  const [движется, setДвижется] = useState(false)
  const стопДвижения = useRef<number | null>(null)
  const [колесо, setКолесо] = useState<Колесо>(прочестьКолесо)

  /** Доска сдвинулась или поменяла масштаб: слой карточек — картинкой, пока не замрёт. */
  const отметитьДвижение = useCallback(() => {
    setДвижется(true)
    if (стопДвижения.current) window.clearTimeout(стопДвижения.current)
    стопДвижения.current = window.setTimeout(() => setДвижется(false), 160)
  }, [])

  const остановитьАнимацию = () => {
    if (анимация.current) cancelAnimationFrame(анимация.current.frame)
    анимация.current = null
  }

  /**
   * Масштаб к значению `target`, оставляя точку (px, py) экрана над той же
   * точкой доски. Без точки — середина полотна (кнопки и клавиши). Плавно —
   * за ПЛАВНО_МС; новый шаг посреди анимации продолжает её с текущего места.
   * Каждый кадр считается внутри setView от текущего вида: точка под
   * курсором остаётся на месте при любой скорости колеса.
   */
  const масштабК = useCallback(
    (target: number, px?: number, py?: number, плавно = true) => {
      const r = wrapRef.current?.getBoundingClientRect()
      const mx = px ?? (r ? r.width / 2 : 0)
      const my = py ?? (r ? r.height / 2 : 0)
      const to = клампМасштаб(target)
      const применить = (k: number) =>
        setView((v) => (k === v.k ? v : { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }))
      отметитьДвижение()
      остановитьАнимацию()
      if (!плавно || animLevel === 'off' || typeof requestAnimationFrame !== 'function') {
        применить(to)
        return
      }
      const from = viewRef.current.k
      const start = performance.now()
      const шаг = (now: number) => {
        // Время кадра бывает чуть раньше старта — назад не шагаем.
        const t = Math.min(1, Math.max(0, (now - start) / ПЛАВНО_МС))
        const e = 1 - Math.pow(1 - t, 3)
        применить(from * Math.pow(to / from, e))
        анимация.current = t < 1 ? { to, frame: requestAnimationFrame(шаг) } : null
      }
      анимация.current = { to, frame: requestAnimationFrame(шаг) }
    },
    [wrapRef, отметитьДвижение, animLevel],
  )

  /**
   * Масштаб множителем сразу, без анимации — для щипка тачпада. Считаем от
   * текущего вида внутри setView: за кадр приходит по два-три события щипка,
   * и посчитанные от одного и того же масштаба они съедали бы друг друга.
   */
  const масштабМножителем = useCallback(
    (f: number, mx: number, my: number) => {
      отметитьДвижение()
      остановитьАнимацию()
      setView((v) => {
        const k = клампМасштаб(v.k * f)
        return k === v.k ? v : { k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }
      })
    },
    [отметитьДвижение],
  )

  /** Куда идёт масштаб: шаги колеса копятся от цели, а не от середины анимации. */
  const цельМасштаба = () => анимация.current?.to ?? viewRef.current.k

  /** Шаг кнопок и клавиш: крупнее (1) или мельче (−1). */
  const zoomBy = useCallback(
    (dir: 1 | -1, px?: number, py?: number) =>
      масштабК((анимация.current?.to ?? viewRef.current.k) * (dir > 0 ? ШАГ_КНОПОК : 1 / ШАГ_КНОПОК), px, py),
    [масштабК],
  )

  /** Сдвиг вида на (dx, dy) экранных пикселей. */
  const сдвинуть = useCallback(
    (dx: number, dy: number) => {
      отметитьДвижение()
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
    },
    [отметитьДвижение],
  )

  /** Поставить вид так, чтобы начало сдвига (ox, oy) ушло на (dx, dy) — для перетаскивания доски. */
  const тянуть = useCallback(
    (ox: number, oy: number, dx: number, dy: number) => {
      отметитьДвижение()
      setView((v) => ({ ...v, x: ox + dx, y: oy + dy }))
    },
    [отметитьДвижение],
  )

  /** Вписать карточки в видимую часть — между верхней панелью и полкой. */
  const вписать = useCallback(
    (list: CanvasNode[]) => {
      const b = boundsOf(list)
      const r = wrapRef.current?.getBoundingClientRect()
      if (!b || !r) {
        setView({ x: 420, y: 260, k: ZOOM_DEFAULT })
        return
      }
      // Панель и полка лежат поверх доски, и «вписанное» по всей высоте
      // пряталось под ними верхним рядом.
      const сверху = wrapRef.current?.querySelector('.canvas-tools')?.getBoundingClientRect()
      const снизу = wrapRef.current?.querySelector('.canvas-dock')?.getBoundingClientRect()
      const верх = сверху ? сверху.bottom - r.top + 24 : 60
      const низ = снизу ? r.bottom - снизу.top + 24 : 60
      const высота = Math.max(80, r.height - верх - низ)
      const k = клампМасштаб(Math.min((r.width - 96) / (b.width || 1), высота / (b.height || 1)))
      остановитьАнимацию()
      отметитьДвижение()
      setView({ k, x: r.width / 2 - (b.x + b.width / 2) * k, y: верх + высота / 2 - (b.y + b.height / 2) * k })
    },
    [wrapRef, отметитьДвижение],
  )

  /*
   * Колесо и тачпад.
   *
   * Слушатель — свой, не React-овский: React вешает колесо пассивным, и
   * preventDefault в нём не действует — Ctrl+колесо масштабировало всё окно,
   * а горизонтальный взмах тачпада мог листать историю. Прежде любое колесо
   * масштабировало ступенями, горизонтальный взмах не делал ничего, и двигать
   * доску можно было только средней кнопкой или пробелом.
   */
  const наКолесо = (e: WheelEvent) => {
    // Над панелями и меню колесо — их собственное.
    if ((e.target as Element | null)?.closest?.('.ctx-menu, .canvas-tools, .canvas-hud, .canvas-dock, .text-toolbar-holder, .edge-bar, .cv-help-pop')) return
    const dx = вПикселях(e, e.deltaX)
    const dy = вПикселях(e, e.deltaY)
    // Длинная заметка или текст в карточке сперва прокручиваются сами.
    if (!e.ctrlKey && !e.metaKey && своёКолесо(e.target, dy)) return
    e.preventDefault()
    const r = wrapRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    const тачпад = этоТачпад(e)

    if (e.ctrlKey || e.metaKey) {
      // Щипок тачпада приходит как Ctrl+колесо мелкими шагами — масштаб
      // следует за пальцами без анимации. Ctrl+колесо мыши — плавный шаг.
      if (тачпад) масштабМножителем(Math.exp(-dy * 0.01), mx, my)
      else масштабК(цельМасштаба() * Math.pow(ШАГ_КОЛЕСА, -dy / 100), mx, my)
      return
    }
    if (тачпад || колесо === 'scroll' || e.shiftKey) {
      // Тачпад — двумя пальцами в любую сторону; мышь в режиме прокрутки —
      // вверх-вниз, с Shift — вбок.
      const сдвигX = тачпад ? dx : e.shiftKey ? dy || dx : dx
      const сдвигY = тачпад ? dy : e.shiftKey ? 0 : dy
      сдвинуть(-сдвигX, -сдвигY)
      return
    }
    масштабК(цельМасштаба() * Math.pow(ШАГ_КОЛЕСА, -dy / 100), mx, my)
  }
  const наКолесоRef = useRef(наКолесо)
  наКолесоRef.current = наКолесо
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const h = (e: WheelEvent) => наКолесоRef.current(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [wrapRef, current])

  const выбратьКолесо = useCallback((к: Колесо) => {
    setКолесо(к)
    try {
      localStorage.setItem(ГДЕ_КОЛЕСО, к)
    } catch {
      /* приватное окно */
    }
  }, [])

  /**
   * Остановить плавный масштаб — перед тем как тянуть доску рукой: иначе
   * анимация продолжала двигать вид от точки, где схватили, и доску дёргало.
   */
  const замереть = остановитьАнимацию

  return { view, setView, viewRef, движется, масштабК, zoomBy, сдвинуть, тянуть, вписать, колесо, выбратьКолесо, замереть }
}
