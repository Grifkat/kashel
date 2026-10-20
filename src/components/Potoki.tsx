/*
 * «Потоки»: схема денег за период — откуда пришли и куда ушли.
 *
 * Счёт и раскладка — в engine/potoki; здесь рисунок, наведение и щелчки.
 * Наведение ведёт след: по лентам, где шли именно эти деньги, светится их
 * доля, а подсказка говорит, откуда деньги пришли и куда ушли.
 *
 * Плавность — на CSS: форма лент (свойство d), места узлов и подписей
 * переходят от прежней раскладки к новой при смене периода, раскрытии
 * подкатегорий и изменении окна, а новые ленты проступают слева направо.
 * Без анимаций переходов нет вовсе. Цикла кадров здесь нет: схема
 * неподвижна, пока её не трогают.
 */
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { moneyShort } from '../lib/format'
import { addMonths, today } from '../lib/date'
import type { Money } from '../lib/types'
import { Toggle } from './ui'
import { useSize } from './charts'
import { useAnimLevel, useДеньги } from './anim'
import {
  потоки, проследить, путьЛенты, разложитьПотоки, черезУзел,
  type ЛентаПотока, type Семя, type УзелПотока,
} from '../engine/potoki'
import { т } from '../i18n'

/** Переживает переключение вкладок, как поворот у графа связей. */
const память = { свёрнуты: new Set<string>(), переводы: true }


/** Прикидка ширины подписи: имя жирным, сумма цифрами, зазоры. Мерить текст в DOM ради этого незачем. */
const БУКВА = 6.9
const ЦИФРА = 6.2
/** Длиннее имя в крайнем столбце обрезается — поле под подписи не съест схему. */
const ИМЯ_НА_КРАЮ = 18
const ИМЯ_НА_КРАЮ_УЗКО = 12
const подписьУзла = (у: УзелПотока) => у.подпись ?? у.имя

interface Props {
  период: number
  setПериод: (k: number) => void
  /** Переключатель «Потоки | Связи» и выбор периода — общие с графом связей. */
  выборВида: React.ReactNode
  выборПериода: React.ReactNode
}

export default function ПотокиДенег({ период, setПериод, выборВида, выборПериода }: Props) {
  const app = useApp()
  const { data } = useStore()
  const деньги = useДеньги()
  const скрыто = data.settings.hideBalance
  const коротко = (m: Money) => (скрыто ? '••••' : moneyShort(m))
  const animLevel = useAnimLevel()
  const [свёрнуты, setСвёрнуты] = useState(память.свёрнуты)
  const [переводы, setПереводы] = useState(память.переводы)
  const [наведено, setНаведено] = useState<Семя | null>(null)
  const [wrapRef, { w, h }] = useSize<HTMLDivElement>()
  const [panelRef, { h: ph }] = useSize<HTMLDivElement>()
  const подсказкаRef = useRef<HTMLDivElement>(null)
  /*
   * Первая раскладка строится до того, как известен размер окна, и сразу
   * же перестраивается под настоящий. Переходы до этого выключены — иначе
   * схема при открытии переезжала бы из угла на место.
   */
  const [свежо, setСвежо] = useState(true)
  useEffect(() => {
    if (!w || !h || !свежо) return
    const к = setTimeout(() => setСвежо(false), 60)
    return () => clearTimeout(к)
  }, [w, h, свежо])
  // Два графа в соседних панелях не должны делить градиенты по id.
  const префикс = 'pg' + useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    память.свёрнуты = свёрнуты
    память.переводы = переводы
  }, [свёрнуты, переводы])

  const схема = useMemo(
    () => потоки({
      transactions: data.transactions, categories: data.categories, accounts: data.accounts,
      с: период ? addMonths(today(), -период) : '', переводы, свёрнуты,
    }),
    [data.transactions, data.categories, data.accounts, период, переводы, свёрнуты],
  )
  const поId = useMemo(() => new Map(схема.узлы.map((у) => [у.id, у])), [схема])
  /*
   * Элементы рисуются в постоянном порядке — по id, а не по сумме. Иначе
   * при смене периода React переставлял бы их в DOM, а переставленный
   * элемент заново проигрывает анимацию появления.
   */
  const поПорядку = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const ленты = useMemo(() => поПорядку(схема.ленты), [схема])
  const узлы = useMemo(() => поПорядку(схема.узлы), [схема])
  useEffect(() => setНаведено(null), [схема])

  // -------------------------------------------------------- рамка и раскладка
  const узко = w > 0 && w < 760
  const последний = схема.столбцов - 1
  const тесно = w > 0 && w < 480
  /** В узком окне у средних столбцов подписано только имя, в тесном — у всех; сумма — в подсказке. */
  const сСуммой = (у: УзелПотока) => !тесно && (!узко || у.столбец === 0 || у.столбец === последний)
  const ширинаПодписи = (у: УзелПотока) =>
    Math.min(узко ? ИМЯ_НА_КРАЮ_УЗКО : ИМЯ_НА_КРАЮ, подписьУзла(у).length + (у.подкатегорий ? 2 : 0)) * БУКВА
      + (сСуммой(у) ? коротко(черезУзел(у)).length * ЦИФРА : 0) + 26
  const полеЛ = Math.min((w || 800) * 0.22, Math.max(0, ...схема.узлы.filter((у) => у.столбец === 0).map(ширинаПодписи)))
  const полеП = Math.min((w || 800) * 0.24, Math.max(0, ...схема.узлы.filter((у) => у.столбец === последний).map(ширинаПодписи)))
  // Панель лежит строкой сверху: схеме нужна вся ширина.
  const верх = (ph || 60) + 34
  const рамка = {
    x: 14 + полеЛ,
    y: верх,
    w: Math.max(120, (w || 800) - 28 - полеЛ - полеП),
    h: Math.max(120, (h || 600) - верх - (узко ? 20 : 40)),
  }
  // Промежуток после столбца — по самой широкой подписи в нём, плюс место лентам.
  const промежутки = useMemo(
    () => Array.from({ length: Math.max(0, схема.столбцов - 1) }, (_, i) =>
      Math.max(0, ...схема.узлы.filter((у) => у.столбец === i && i > 0).map(ширинаПодписи)) + 34),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [схема, скрыто, узко, тесно],
  )
  const раскладка = useMemo(
    () => разложитьПотоки(схема, рамка, узко ? 10 : 12, промежутки),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [схема, рамка.x, рамка.y, рамка.w, рамка.h, узко, промежутки],
  )
  const пути = useMemo(() => {
    const м = new Map<string, string>()
    for (const [id, место] of раскладка.ленты) м.set(id, путьЛенты(место))
    return м
  }, [раскладка])

  // -------------------------------------------------------- след
  const след = useMemo(() => (наведено ? проследить(схема, наведено) : null), [схема, наведено])

  // -------------------------------------------------------- подписи
  /*
   * Подпись — имя и сумма у полосы узла: у первого столбца слева от полосы,
   * у прочих справа. Подпись не заходит за соседний столбец: длинное имя
   * укорачивается. Крупные ставятся первыми, а мелкая, что налезла бы на
   * поставленную, ждёт наведения. При наведении подписаны только узлы
   * цепочки, и их суммы — доля, что прошла по ней.
   */
  const подписи = useMemo(() => {
    const итог: { у: УзелПотока; x: number; y: number; слева: boolean; имя: string; сумма: string }[] = []
    const коробки: { x0: number; x1: number; y0: number; y1: number }[] = []
    const xs = раскладка.столбцы
    const полоса = раскладка.полоса
    const вес = (у: УзелПотока) => (след ? след.узлы.get(у.id) ?? 0 : черезУзел(у))
    const кандидаты = схема.узлы.filter((у) => !след || след.узлы.has(у.id)).sort((a, b) => вес(b) - вес(a))
    for (const у of кандидаты) {
      const м = раскладка.узлы.get(у.id)
      if (!м) continue
      const i = у.столбец
      const слеваОт = i === 0
      const место = слеваОт ? полеЛ - 6 : i === последний ? полеП - 6 : xs[i + 1] - (xs[i] + полоса) - 14
      const сумма = сСуммой(у) ? коротко(след ? вес(у) : черезУзел(у)) : ''
      const знак = у.подкатегорий ? 2 : 0
      const букв = Math.floor((место - сумма.length * ЦИФРА - 8) / БУКВА) - знак
      if (букв < 3) continue
      const полное = подписьУзла(у)
      const имя = полное.length > букв ? полное.slice(0, букв - 1) + '…' : полное
      const ширина = (имя.length + знак) * БУКВА + сумма.length * ЦИФРА + 8
      const y = м.y + м.h / 2
      const x = слеваОт ? м.x - 7 : м.x + полоса + 7
      const к = { x0: слеваОт ? x - ширина : x, x1: слеваОт ? x : x + ширина, y0: y - 8, y1: y + 8 }
      if (коробки.some((б) => к.x0 < б.x1 && к.x1 > б.x0 && к.y0 < б.y1 && к.y1 > б.y0)) continue
      коробки.push(к)
      итог.push({ у, x, y, слева: слеваОт, имя, сумма })
    }
    return итог
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [схема, раскладка, след, скрыто, полеЛ, полеП, последний, узко, тесно])

  // -------------------------------------------------------- действия
  const открыть = (у: УзелПотока) => {
    if (!у.ref) return
    if (у.счёт) app.openTab('transactions', 'acc:' + у.ref, { title: у.имя })
    else if (у.ref === 'uncategorized') app.openTab('transactions', 'uncategorized', { title: у.имя })
    else app.openTab('transactions', 'cat:' + у.ref, { title: у.имя })
  }
  const переключить = (у: УзелПотока) => {
    const id = у.ref!
    setСвёрнуты((s) => {
      const н = new Set(s)
      if (н.has(id)) н.delete(id)
      else н.add(id)
      return н
    })
  }
  const щелчокПоУзлу = (у: УзелПотока) => (у.подкатегорий ? переключить(у) : открыть(у))
  /** Чьи операции у ленты: у дохода — статьи, у расхода — статьи, у перевода — счёта-источника. */
  const чьяЛента = (л: ЛентаПотока): УзелПотока | undefined => {
    const из = поId.get(л.из)
    const в = поId.get(л.в)
    if (л.вид === 'income' || л.вид === 'transfer') return из
    if (л.вид === 'expense') return в
    if (л.вид === 'sub') return из?.главная ? из : в
    return из?.счёт ? из : в
  }

  /** Подсказка идёт за мышью сама, без перерисовки схемы. */
  const мышь = useRef({ x: 0, y: 0 })
  const вестиПодсказку = () => {
    const el = подсказкаRef.current
    const wrap = wrapRef.current?.getBoundingClientRect()
    if (!el || !wrap) return
    let x = мышь.current.x - wrap.left + 16
    let y = мышь.current.y - wrap.top + 14
    if (x + el.offsetWidth > wrap.width - 8) x = мышь.current.x - wrap.left - el.offsetWidth - 14
    if (y + el.offsetHeight > wrap.height - 8) y = Math.max(8, wrap.height - el.offsetHeight - 8)
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }
  // Подсказка появляется сразу у мыши, а не прыгает из угла.
  useLayoutEffect(() => {
    if (наведено) вестиПодсказку()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [наведено])

  const пусто = !схема.узлы.length
  const естьОперации = data.transactions.some((t) => t.kind !== 'transfer')
  const разница = схема.пришло - схема.ушло
  const подсвечено = !!след

  return (
    <div
      className={'graph-wrap graph-flows flows-anim-' + animLevel + (узко ? ' narrow' : '') + (подсвечено ? ' flows-dim' : '') + (свежо ? ' flows-fresh' : '')}
      ref={wrapRef}
      onMouseMove={(e) => {
        мышь.current = { x: e.clientX, y: e.clientY }
        if (наведено) вестиПодсказку()
      }}
      onMouseLeave={() => setНаведено(null)}
    >
      {пусто ? (
        <div className="flows-empty" style={{ top: верх - 20 }}>
          <span className="flows-empty-icon"><Icon name="flow" size={26} /></span>
          <div className="strong">{естьОперации ? т('За этот период движений нет') : т('Здесь появятся потоки денег')}</div>
          <div className="faint">
            {естьОперации
              ? т('Схема рисует доходы и расходы за выбранный период. Возьмите период подлиннее.')
              : т('Запишите доходы и расходы — схема покажет, откуда пришли деньги, через какие счета прошли и на что ушли.')}
          </div>
          {естьОперации && период !== 0 && (
            <button type="button" className="btn sm" onClick={() => setПериод(0)}>{т('Показать за всё время')}</button>
          )}
        </div>
      ) : (
        <svg width="100%" height="100%" className="flows-svg">
          <defs>
            {ленты.map((л, i) => {
              const м = раскладка.ленты.get(л.id)
              if (!м) return null
              return (
                <linearGradient key={л.id} id={префикс + i} gradientUnits="userSpaceOnUse" x1={м.x0} x2={м.x1} y1={0} y2={0}>
                  <stop offset="0" style={{ stopColor: поId.get(л.из)?.цвет }} />
                  <stop offset="1" style={{ stopColor: поId.get(л.в)?.цвет }} />
                </linearGradient>
              )
            })}
          </defs>
          <g className="flows-links">
            {ленты.map((л, i) => {
              const d = пути.get(л.id)
              if (!d) return null
              const столбец = поId.get(л.из)?.столбец ?? 0
              return (
                <path
                  key={л.id}
                  data-id={л.id}
                  data-sum={л.сумма}
                  className={'flow-link k-' + л.вид + (след?.ленты.has(л.id) ? ' in-trace' : '') + (чьяЛента(л)?.ref ? '' : ' still')}
                  d={d}
                  fill={`url(#${префикс + i})`}
                  style={{ d: `path("${d}")`, '--i': столбец } as React.CSSProperties}
                  onMouseEnter={() => setНаведено({ вид: 'link', id: л.id })}
                  onMouseLeave={() => setНаведено(null)}
                  onClick={() => {
                    const у = чьяЛента(л)
                    if (у) открыть(у)
                  }}
                />
              )
            })}
          </g>
          {след && (
            <g className="flows-trace" pointerEvents="none">
              {ленты.map((л, i) => {
                const доля = след.ленты.get(л.id)
                const м = раскладка.ленты.get(л.id)
                if (!доля || !м) return null
                return <path key={л.id} className="flow-trace" d={путьЛенты(м, Math.min(1, доля / л.сумма))} fill={`url(#${префикс + i})`} />
              })}
            </g>
          )}
          <g className="flows-nodes">
            {узлы.map((у) => {
              const м = раскладка.узлы.get(у.id)
              if (!м) return null
              return (
                <rect
                  key={у.id}
                  data-id={у.id}
                  className={'flow-node' + (у.ref ? '' : ' still') + (след?.узлы.has(у.id) ? ' in-trace' : '') + (у.подкатегорий ? ' group' : '')}
                  x={м.x} y={м.y} width={раскладка.полоса} height={м.h} rx={3}
                  style={{ x: м.x, y: м.y, height: м.h, fill: у.цвет, '--i': у.столбец } as React.CSSProperties}
                  onMouseEnter={() => setНаведено({ вид: 'node', id: у.id })}
                  onMouseLeave={() => setНаведено(null)}
                  onClick={() => щелчокПоУзлу(у)}
                  onDoubleClick={() => у.подкатегорий && открыть(у)}
                />
              )
            })}
          </g>
          <g className="flows-labels">
            {поПорядку(подписи.map((п) => ({ ...п, id: п.у.id }))).map(({ у, x, y, слева, имя, сумма }) => (
              <g
                key={у.id}
                data-id={у.id}
                className={'flow-label' + (у.ref ? '' : ' still')}
                style={{ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`, '--i': у.столбец } as React.CSSProperties}
                onMouseEnter={() => setНаведено({ вид: 'node', id: у.id })}
                onMouseLeave={() => setНаведено(null)}
                onClick={() => щелчокПоУзлу(у)}
                onDoubleClick={() => у.подкатегорий && открыть(у)}
              >
                <text textAnchor={слева ? 'end' : 'start'} dominantBaseline="central">
                  {у.подкатегорий ? <tspan className="flow-chev">{у.раскрыта ? '▾ ' : '▸ '}</tspan> : null}
                  <tspan className={'flow-name' + (у.подпись ? ' own' : '')}>{имя}</tspan>
                  {сумма ? <tspan className="flow-sum" dx={6}>{сумма}</tspan> : null}
                </text>
              </g>
            ))}
          </g>
        </svg>
      )}

      {/* ---------------------------------------------- панель */}
      <div className="graph-panel flows-panel" ref={panelRef}>
        <div className="graph-panel-head">
          <Icon name="flow" size={15} />
          <span className="strong">{т('Потоки денег')}</span>
        </div>
        {выборВида}
        {выборПериода}
        <div className="graph-kind flows-transfers">
          <span className="graph-kind-icon" style={{ background: 'var(--money-move)' }}><Icon name="repeat" size={11} /></span>
          <span style={{ flex: 1 }}>{т('Переводы между счетами')}</span>
          <Toggle checked={переводы} onChange={setПереводы} />
        </div>
        {!пусто && (
          <div className="flows-totals">
            <div><span className="faint small">{т('Пришло')}</span><span className="num strong money-in">{деньги(схема.пришло)}</span></div>
            <div><span className="faint small">{т('Ушло')}</span><span className="num strong money-out">{деньги(схема.ушло)}</span></div>
            <div>
              <span className="faint small">{разница >= 0 ? т('Осталось') : т('Перерасход')}</span>
              <span className={'num strong ' + (разница >= 0 ? 'money-in' : 'money-out')}>{деньги(Math.abs(разница))}</span>
            </div>
          </div>
        )}
      </div>
      {!пусто && (
        <div className="faint small flows-hint">
          {т('Наведите на ленту или статью — увидите путь денег. Щелчок по главной категории раскрывает подкатегории, по остальному — открывает операции.')}
        </div>
      )}

      {наведено && след && (
        <Подсказка
          ref={подсказкаRef}
          семя={наведено}
          схема={схема}
          поId={поId}
          след={след}
          деньги={деньги}
          чьяЛента={чьяЛента}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------ подсказка

const Подсказка = React.forwardRef<HTMLDivElement, {
  семя: Семя
  схема: ReturnType<typeof потоки>
  поId: Map<string, УзелПотока>
  след: ReturnType<typeof проследить>
  деньги: (m: Money) => string
  чьяЛента: (л: ЛентаПотока) => УзелПотока | undefined
}>(function Подсказка({ семя, схема, поId, след, деньги, чьяЛента }, ref) {
  const лента = семя.вид === 'link' ? схема.ленты.find((л) => л.id === семя.id) : undefined
  const узел = семя.вид === 'node' ? поId.get(семя.id) : undefined
  if (!лента && !узел) return null
  const из = лента ? поId.get(лента.из) : undefined
  const в = лента ? поId.get(лента.в) : undefined
  const сумма = лента ? лента.сумма : черезУзел(узел!)
  const свои = new Set([узел?.id, лента?.из, лента?.в].filter(Boolean) as string[])

  // Откуда: статьи дохода и «запасы»; куда: главные категории расходов и
  // «Осталось». У главной категории — из чего она сложена.
  const начало = (у: УзелПотока) => (у.вид === 'income' && !у.главная) || у.id === 'stock' || у.id === 'loan'
  const конец = (у: УзелПотока) => (у.вид === 'expense' && !у.главная) || у.id === 'left' || у.id === 'repaid'
  const список = (годится: (у: УзелПотока) => boolean) =>
    [...след.узлы].map(([id, v]) => ({ у: поId.get(id)!, v }))
      .filter(({ у, v }) => у && !свои.has(у.id) && годится(у) && v >= 50)
      .sort((a, b) => b.v - a.v)
  // Подкатегории наведённой главной — «из чего» она; у подкатегории своего
  // «откуда» (дохода) или «куда» (расхода) нет — это её главная.
  const подкатегории = узел?.подкатегорий ? список((у) => у.главная === узел.id) : []
  const откуда = узел && начало(узел) ? подкатегории : узел?.главная && узел.вид === 'income' ? [] : список(начало)
  const куда = узел && конец(узел) ? подкатегории : узел?.главная && узел.вид === 'expense' ? [] : список(конец)
  const подпись = узел
    ? узел.подкатегорий
      ? т('Щелчок — {0} подкатегории, двойной — операции', узел.раскрыта ? т('свернуть') : т('раскрыть'))
      : узел.ref ? т('Щелчок — операции') : ''
    : лента && чьяЛента(лента)?.ref ? т('Щелчок — операции') : ''
  const вид = (у: УзелПотока) =>
    у.счёт ? т('Счёт') : у.вид === 'income' ? т('Доход') : у.вид === 'expense' ? т('Расход') : ''
  // Служебные узлы сведения — что они значат, словами.
  const пояснение: Record<string, string> = {
    stock: т('Потрачено сверх пришедшего за период — из денег, что уже лежали на счетах.'),
    loan: т('Потрачено в долг — с кредитной карты или в счёт долга.'),
    left: т('Пришло, но не потрачено — осталось на счетах.'),
    repaid: т('Ушло на погашение кредитов и долгов.'),
  }

  return (
    <div className="flows-tip" ref={ref}>
      {лента ? (
        <div className="flows-tip-head">
          <span className="graph-dot" style={{ background: из?.цвет }} />
          <span className="strong">{из?.имя}</span>
          <span className="faint">→</span>
          <span className="graph-dot" style={{ background: в?.цвет }} />
          <span className="strong">{в?.имя}</span>
        </div>
      ) : (
        <div className="flows-tip-head">
          <span className="graph-dot" style={{ background: узел!.цвет }} />
          <span className="strong">{узел!.имя}</span>
          <span className="faint small">{вид(узел!)}</span>
        </div>
      )}
      {узел && пояснение[узел.id] && <div className="faint small">{пояснение[узел.id]}</div>}
      <div className="num flows-tip-sum">{деньги(сумма)}</div>
      {откуда.length > 0 && <Строки заголовок={узел && начало(узел) ? т('Из чего') : т('Откуда')} строки={откуда} деньги={деньги} />}
      {куда.length > 0 && <Строки заголовок={узел && конец(узел) ? т('Из чего') : т('Куда')} строки={куда} деньги={деньги} />}
      {подпись && <div className="faint small flows-tip-hint">{подпись}</div>}
    </div>
  )
})

function Строки({ заголовок, строки, деньги }: { заголовок: string; строки: { у: УзелПотока; v: number }[]; деньги: (m: Money) => string }) {
  const видно = строки.slice(0, 5)
  return (
    <div className="flows-tip-list">
      <div className="faint small flows-tip-sub">{заголовок}</div>
      {видно.map(({ у, v }) => (
        <div key={у.id} className="flows-tip-row">
          <span className="graph-dot" style={{ background: у.цвет }} />
          <span className="graph-found-name">{у.имя}</span>
          <span className="num small">{деньги(Math.round(v / 100) * 100)}</span>
        </div>
      ))}
      {строки.length > видно.length && <div className="faint small">{т('и ещё {0}', строки.length - видно.length)}</div>}
    </div>
  )
}
