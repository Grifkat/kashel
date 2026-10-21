/*
 * «Потоки»: схема денег за период — откуда пришли и куда ушли.
 *
 * Счёт и раскладка — в engine/potoki; здесь рисунок, наведение и щелчки.
 * Наведение ведёт след: по лентам, где шли именно эти деньги, светится их
 * доля, а подсказка говорит, откуда деньги пришли и куда ушли.
 *
 * Над столбцами — их смысл: «Откуда», «Счета», «Куда», «Подкатегории».
 * Без этого статья дохода и счёт с одним именем («Комикс» и «Комикс»)
 * читались как одно и то же. Проектный счёт — на той же схеме, но в
 * штриховке, в пунктирной рамке и с плашкой «проект»: деньги на нём не
 * личные.
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

/*
 * Переживает переключение вкладок, как поворот у графа связей. Переводы
 * между счетами по умолчанию скрыты: схема «доходы → счета → траты» без
 * них проще, а включить их — один щелчок.
 */
const память = { свёрнуты: new Set<string>(), переводы: false }

/** Прикидка ширины подписи: имя жирным, сумма цифрами, зазоры. Мерить текст в DOM ради этого незачем. */
const БУКВА = 6.9
const ЦИФРА = 6.2
/** В узком окне длиннее имя в крайнем столбце обрезается — поле под подписи не съест схему. */
const ИМЯ_НА_КРАЮ_УЗКО = 12
/** Строка подписи по высоте: столько места у каждого узла, даже самого тонкого. */
const СТРОКА = 15
/** Плашка «проект» у проектного счёта: ширина по буквам мелкого шрифта. */
const плашка = () => т('проект').length * 5.8 + 12
const подписьУзла = (у: УзелПотока) => у.подпись ?? у.имя
/** Проектный счёт — его подпись всегда в две строки: имя, под ним плашка и сумма. */
const сПлашкой = (у: УзелПотока) => !!(у.счёт && у.проект)

/** Чем столбец является для человека — по узлам в нём. */
type ВидСтолбца = 'in' | 'isub' | 'acc' | 'out' | 'esub'
function видСтолбца(узлы: УзелПотока[]): ВидСтолбца {
  if (узлы.some((у) => у.счёт)) return 'acc'
  if (узлы.some((у) => у.вид === 'income')) return узлы.some((у) => у.главная) ? 'isub' : 'in'
  if (узлы.some((у) => у.вид === 'expense')) return узлы.some((у) => у.главная) ? 'esub' : 'out'
  // одни служебные: источники слева, стоки справа
  return узлы.some((у) => !у.вход) ? 'in' : 'out'
}

interface Подпись {
  у: УзелПотока
  x: number
  y: number
  слева: boolean
  имя: string
  сумма: string
  /** Сумма под именем, а не рядом: так подпись вдвое уже. */
  вДве: boolean
}

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
  const [hintRef, { h: hh }] = useSize<HTMLDivElement>()
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
  // Появление — только первые полторы секунды после открытия: дальше всё,
  // что появится, видно сразу (см. flows-reveal в app.css).
  const [проявление, setПроявление] = useState(true)
  useEffect(() => {
    const к = setTimeout(() => setПроявление(false), 1600)
    return () => clearTimeout(к)
  }, [])
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
  /** Лента касается проектного счёта: деньги на ней не личные. */
  const проектная = (л: ЛентаПотока) => !!(поId.get(л.из)?.проект || поId.get(л.в)?.проект)

  // -------------------------------------------------------- рамка и раскладка
  const узко = w > 0 && w < 760
  const последний = схема.столбцов - 1
  const тесно = w > 0 && w < 480
  /** В узком окне у средних столбцов подписано только имя, в тесном — у всех; сумма — в подсказке. */
  const сСуммой = (у: УзелПотока) => !тесно && (!узко || у.столбец === 0 || у.столбец === последний)
  const ширинаИмени = (у: УзелПотока, край = false) =>
    (край && узко ? Math.min(ИМЯ_НА_КРАЮ_УЗКО, подписьУзла(у).length) : подписьУзла(у).length) * БУКВА
      + (у.подкатегорий ? 2 * БУКВА : 0)
  const ширинаСуммы = (у: УзелПотока) => (сСуммой(у) ? коротко(черезУзел(у)).length * ЦИФРА : 0)
  /** Подпись в строку: имя и сумма рядом. */
  const вОдну = (у: УзелПотока, край = false) => ширинаИмени(у, край) + (ширинаСуммы(у) ? ширинаСуммы(у) + 6 : 0) + 10
  /** Подпись в две строки: имя, под ним сумма (и плашка проекта). */
  const вДве = (у: УзелПотока, край = false) =>
    Math.max(ширинаИмени(у, край), (сПлашкой(у) ? плашка() + 6 : 0) + ширинаСуммы(у)) + 10
  const крайние = (i: number) => схема.узлы.filter((у) => у.столбец === i)
  const полеЛ = Math.min((w || 800) * 0.28, Math.max(0, ...крайние(0).map((у) => вОдну(у, true) + 16)))
  const полеП = Math.min((w || 800) * 0.28, Math.max(0, ...крайние(последний).map((у) => (сПлашкой(у) ? вДве(у, true) : вОдну(у, true)) + 16)))
  // Панель лежит строкой сверху, под ней — подписи столбцов; подсказка — внизу.
  // Схема кончается выше подсказки, какой бы высоты та ни вышла.
  const верх = (ph || 60) + 56
  const низ = узко ? 16 : (hh || 30) + 26
  const рамка = {
    x: 14 + полеЛ,
    y: верх,
    w: Math.max(120, (w || 800) - 28 - полеЛ - полеП),
    h: Math.max(120, (h || 600) - верх - низ),
  }
  /*
   * Промежуток после столбца — по самой широкой подписи в нём плюс место
   * лентам. Не хватает ширины на подписи в строку — редкие столбцы (счета)
   * переходят на подписи в две строки, имя сверху, сумма снизу: так они
   * вдвое уже. Густому столбцу (тридцать статей расходов) две строки не
   * помогут — по высоте им не уместиться, — его промежуток остаётся под
   * строку. И только если всё равно тесно, промежутки ужимаются поровну.
   */
  const промежутки = useMemo(() => {
    const щелей = Math.max(0, схема.столбцов - 1)
    const вСтолбце = (i: number) => (i > 0 ? схема.узлы.filter((у) => у.столбец === i) : [])
    const густо = (i: number) => вСтолбце(i).length > 0 && рамка.h / вСтолбце(i).length < 34
    const нужно = (вДвеМожно: boolean) =>
      Array.from({ length: щелей }, (_, i) => Math.max(0, ...вСтолбце(i).map((у) =>
        сПлашкой(у) || (вДвеМожно && !густо(i)) ? вДве(у) : вОдну(у))) + 34)
    const свободно = рамка.w - (узко ? 10 : 12) * схема.столбцов
    const сумма = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
    return сумма(нужно(false)) <= свободно ? нужно(false) : нужно(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [схема, скрыто, узко, тесно, рамка.w, рамка.h])
  const раскладка = useMemo(
    () => разложитьПотоки(схема, рамка, узко ? 10 : 12, промежутки, (у) => (сПлашкой(у) ? 2 * СТРОКА : СТРОКА)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [схема, рамка.x, рамка.y, рамка.w, рамка.h, узко, промежутки],
  )
  const пути = useMemo(() => {
    const м = new Map<string, string>()
    for (const [id, место] of раскладка.ленты) м.set(id, путьЛенты(место))
    return м
  }, [раскладка])

  // -------------------------------------------------------- подписи столбцов
  const шапки = useMemo(() => {
    const xs = раскладка.столбцы
    const полоса = раскладка.полоса
    const виды = xs.map((_, i) => видСтолбца(схема.узлы.filter((у) => у.столбец === i)))
    const текст: Record<ВидСтолбца, string> = {
      in: т('Откуда'), isub: т('Подкатегории'), acc: т('Счета'), out: т('Куда'), esub: т('Подкатегории'),
    }
    const итог: { id: string; x: number; якорь: 'start' | 'end'; текст: string }[] = []
    /*
     * Шапка стоит над своим столбцом с той стороны, где его подписи: у
     * первого — справа по краю полосы (подписи слева от неё), у прочих —
     * слева по краю полосы (подписи справа). Счета, разнесённые переводами
     * по нескольким столбцам, — под одной шапкой, над первым из них.
     */
    for (let i = 0; i < виды.length; i++) {
      let j = i
      while (виды[i] === 'acc' && виды[j + 1] === 'acc') j++
      итог.push({
        id: виды[i] + i,
        x: i === 0 ? xs[i] + полоса : xs[i],
        якорь: i === 0 ? 'end' : 'start',
        текст: текст[виды[i]],
      })
      i = j
    }
    return итог
  }, [схема, раскладка])

  // -------------------------------------------------------- след
  const след = useMemo(() => (наведено ? проследить(схема, наведено) : null), [схема, наведено])

  // -------------------------------------------------------- подписи узлов
  /*
   * Подпись — имя и сумма у полосы узла: у первого столбца слева от полосы,
   * у прочих справа. Подпись не заходит за соседний столбец. Не влезает в
   * строку — сумма уходит под имя, и только если и так не влезает, имя
   * укорачивается. Крупные ставятся первыми, а мелкая, что налезла бы на
   * поставленную, ждёт наведения. При наведении подписаны только узлы
   * цепочки, и их суммы — доля, что прошла по ней.
   */
  const подписи = useMemo(() => {
    const итог: Подпись[] = []
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
      const полное = подписьУзла(у)
      const знак = у.подкатегорий ? 2 : 0
      const сумм = сумма ? сумма.length * ЦИФРА + 6 : 0
      const под = (сПлашкой(у) ? плашка() + 6 : 0) + сумма.length * ЦИФРА
      const y = м.y + м.h / 2
      const x = слеваОт ? м.x - 7 : м.x + полоса + 7
      const свободно = (ширина: number, высота: number) => {
        const к = { x0: слеваОт ? x - ширина : x, x1: слеваОт ? x : x + ширина, y0: y - высота / 2, y1: y + высота / 2 }
        return коробки.some((б) => к.x0 < б.x1 && к.x1 > б.x0 && к.y0 < б.y1 && к.y1 > б.y0) ? null : к
      }
      const имяВ = (ширина: number) => {
        const букв = Math.floor(ширина / БУКВА) - знак
        return букв < 3 ? '' : полное.length > букв ? полное.slice(0, букв - 1) + '…' : полное
      }
      // Варианты по порядку: целиком в строку, целиком в две, укороченное в две, укороченное в строку.
      const варианты: { имя: string; вДве: boolean; безСуммы?: boolean }[] = []
      const полностью = (полное.length + знак) * БУКВА
      if (!сПлашкой(у) && полностью + сумм <= место) варианты.push({ имя: полное, вДве: false })
      if (сумма || сПлашкой(у)) {
        if (Math.max(полностью, под) <= место) варианты.push({ имя: полное, вДве: true })
        else if (под <= место) варианты.push({ имя: имяВ(место), вДве: true })
      }
      // Проектному счёту в тесном промежутке важнее имя и плашка, чем сумма — она есть в подсказке.
      if (сПлашкой(у) && сумма) варианты.push({ имя: имяВ(место), вДве: true, безСуммы: true })
      if (!сПлашкой(у)) варианты.push({ имя: имяВ(место - сумм), вДве: false })
      for (const в of варианты) {
        if (!в.имя) continue
        const подВ = в.безСуммы ? плашка() : под
        const ширина = Math.max((в.имя.length + знак) * БУКВА + (в.вДве ? 0 : сумм), в.вДве ? подВ : 0) + 8
        // Глиф строки — около 12 px: в густом столбце, где шаг меньше строки, подписи всё равно не слипаются.
        const к = свободно(ширина, в.вДве ? 2 * СТРОКА - 4 : СТРОКА - 3)
        if (!к) continue
        коробки.push(к)
        итог.push({ у, x, y, слева: слеваОт, имя: в.имя, сумма: в.безСуммы ? '' : сумма, вДве: в.вДве })
        break
      }
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
  const маска = `url(#${префикс}pm)`

  return (
    <div
      className={'graph-wrap graph-flows flows-anim-' + animLevel + (узко ? ' narrow' : '') + (подсвечено ? ' flows-dim' : '') + (свежо ? ' flows-fresh' : '') + (проявление ? ' flows-reveal' : '')}
      ref={wrapRef}
      onMouseMove={(e) => {
        мышь.current = { x: e.clientX, y: e.clientY }
        if (наведено) вестиПодсказку()
      }}
      onMouseLeave={() => setНаведено(null)}
    >
      {пусто ? (
        <div className="flows-empty" style={{ top: верх - 40 }}>
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
        <svg width="100%" height="100%" className="flows-svg" data-niz={Math.round(рамка.y + рамка.h)}>
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
            {/* Штриховка проектных денег: косые просветы, сквозь которые виден фон. */}
            <pattern id={префикс + 'ps'} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={7} height={7} fill="white" />
              <rect width={2.6} height={7} fill="black" fillOpacity={0.62} />
            </pattern>
            <mask id={префикс + 'pm'} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect width="100%" height="100%" fill={`url(#${префикс}ps)`} />
            </mask>
          </defs>
          <g className="flows-heads">
            {шапки.map((ш) => (
              <text
                key={ш.id}
                className="flows-head"
                textAnchor={ш.якорь}
                style={{ transform: `translate(${Math.round(ш.x)}px, ${Math.round(рамка.y - 16)}px)` }}
              >
                {ш.текст}
              </text>
            ))}
          </g>
          <g className="flows-links">
            {ленты.map((л, i) => {
              const d = пути.get(л.id)
              if (!d) return null
              const столбец = поId.get(л.из)?.столбец ?? 0
              const проект = проектная(л)
              return (
                <path
                  key={л.id}
                  data-id={л.id}
                  data-sum={л.сумма}
                  className={'flow-link k-' + л.вид + (проект ? ' project' : '') + (след?.ленты.has(л.id) ? ' in-trace' : '') + (чьяЛента(л)?.ref ? '' : ' still')}
                  d={d}
                  fill={`url(#${префикс + i})`}
                  mask={проект ? маска : undefined}
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
                return (
                  <path
                    key={л.id}
                    className="flow-trace"
                    d={путьЛенты(м, Math.min(1, доля / л.сумма))}
                    fill={`url(#${префикс + i})`}
                    mask={проектная(л) ? маска : undefined}
                  />
                )
              })}
            </g>
          )}
          <g className="flows-nodes">
            {узлы.map((у) => {
              const м = раскладка.узлы.get(у.id)
              if (!м) return null
              const полоса = раскладка.полоса
              const свет = след?.узлы.has(у.id) ? ' in-trace' : ''
              return (
                <React.Fragment key={у.id}>
                  {/* Проектный узел — в пунктирной рамке своего цвета. */}
                  {у.проект && (
                    <rect
                      className={'flow-frame' + свет}
                      x={м.x - 3.5} y={м.y - 3.5} width={полоса + 7} height={м.h + 7} rx={5}
                      style={{ x: м.x - 3.5, y: м.y - 3.5, height: м.h + 7, stroke: у.цвет, '--i': у.столбец } as React.CSSProperties}
                    />
                  )}
                  <rect
                    data-id={у.id}
                    className={'flow-node' + (у.ref ? '' : ' still') + свет + (у.подкатегорий ? ' group' : '') + (у.проект ? ' project' : '')}
                    x={м.x} y={м.y} width={полоса} height={м.h} rx={3}
                    mask={у.проект ? маска : undefined}
                    style={{ x: м.x, y: м.y, height: м.h, fill: у.цвет, '--i': у.столбец } as React.CSSProperties}
                    onMouseEnter={() => setНаведено({ вид: 'node', id: у.id })}
                    onMouseLeave={() => setНаведено(null)}
                    onClick={() => щелчокПоУзлу(у)}
                    onDoubleClick={() => у.подкатегорий && открыть(у)}
                  />
                </React.Fragment>
              )
            })}
          </g>
          <g className="flows-labels">
            {поПорядку(подписи.map((п) => ({ ...п, id: п.у.id }))).map(({ у, x, y, слева, имя, сумма, вДве: два }) => (
              <g
                key={у.id}
                data-id={у.id}
                className={'flow-label' + (у.ref ? '' : ' still') + (два ? ' two' : '')}
                style={{ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`, '--i': у.столбец } as React.CSSProperties}
                onMouseEnter={() => setНаведено({ вид: 'node', id: у.id })}
                onMouseLeave={() => setНаведено(null)}
                onClick={() => щелчокПоУзлу(у)}
                onDoubleClick={() => у.подкатегорий && открыть(у)}
              >
                <text textAnchor={слева ? 'end' : 'start'} dominantBaseline="central" y={два ? -7 : 0}>
                  {у.подкатегорий ? <tspan className="flow-chev">{у.раскрыта ? '▾ ' : '▸ '}</tspan> : null}
                  <tspan className={'flow-name' + (у.подпись ? ' own' : '')}>{имя}</tspan>
                  {сумма && !два ? <tspan className="flow-sum" dx={6}>{сумма}</tspan> : null}
                </text>
                {два && (
                  <g className="flow-line2" transform="translate(0, 8)">
                    {сПлашкой(у) && (
                      <g className="flow-tag" transform={слева ? `translate(${-плашка()}, 0)` : undefined}>
                        <rect x={0} y={-6.5} width={плашка()} height={13} rx={6.5}
                          style={{ fill: `color-mix(in srgb, ${у.цвет} 20%, var(--bg))`, stroke: у.цвет }} />
                        <text x={плашка() / 2} y={0} textAnchor="middle" dominantBaseline="central">{т('проект')}</text>
                      </g>
                    )}
                    {сумма && (
                      <text
                        className="flow-sum"
                        textAnchor={слева ? 'end' : 'start'}
                        dominantBaseline="central"
                        x={сПлашкой(у) ? (слева ? -плашка() - 6 : плашка() + 6) : 0}
                      >
                        {сумма}
                      </text>
                    )}
                  </g>
                )}
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
            <div>
              <span className="faint small">{т('Пришло')}</span>
              <span className="num strong money-in">{деньги(схема.пришло)}</span>
              {схема.проектПришло > 0 && <span className="faint small">{т('из них проект {0}', коротко(схема.проектПришло))}</span>}
            </div>
            <div>
              <span className="faint small">{т('Ушло')}</span>
              <span className="num strong money-out">{деньги(схема.ушло)}</span>
              {схема.проектУшло > 0 && <span className="faint small">{т('из них проект {0}', коротко(схема.проектУшло))}</span>}
            </div>
            <div>
              <span className="faint small">{разница >= 0 ? т('Осталось') : т('Перерасход')}</span>
              <span className={'num strong ' + (разница >= 0 ? 'money-in' : 'money-out')}>{деньги(Math.abs(разница))}</span>
            </div>
          </div>
        )}
      </div>
      {!пусто && (
        <div className="faint small flows-hint" ref={hintRef}>
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

  // Откуда: статьи дохода и служебные источники («Из прежних остатков»);
  // куда: главные категории расходов и стоки («Осталось»). У главной
  // категории — из чего она сложена.
  const начало = (у: УзелПотока) => (у.вид === 'income' && !у.главная) || (у.вид === 'stock' && !у.вход)
  const конец = (у: УзелПотока) => (у.вид === 'expense' && !у.главная) || (у.вид === 'stock' && !у.выход)
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
  // Служебные узлы сведения и проектные деньги — что они значат, словами.
  const пояснение: Record<string, string> = {
    stock: т('Потрачено сверх пришедшего за период — из денег, что уже лежали на счетах.'),
    loan: т('Потрачено в долг — с кредитной карты или в счёт долга.'),
    left: т('Пришло, но не потрачено — осталось на счетах.'),
    repaid: т('Ушло на погашение кредитов и долгов.'),
    pstock: т('Потрачено с проектного счёта сверх пришедшего — из прежних денег проекта.'),
    pleft: т('Проектные деньги, что пришли и ещё не потрачены.'),
  }
  const проектИз = !!из?.проект
  const проектВ = !!в?.проект
  const оПроекте = узел
    ? узел.счёт && узел.проект ? т('Деньги на этом счёте — проектные, не личные.') : пояснение[узел.id] ?? ''
    : лента && (проектИз || проектВ)
      ? лента.вид === 'transfer' && проектИз !== проектВ ? т('Перевод между проектным и личным счётом.') : т('Проектные деньги — не личные.')
      : ''

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
          {узел!.счёт && узел!.проект && <span className="flows-tip-tag" style={{ borderColor: узел!.цвет }}>{т('проект')}</span>}
        </div>
      )}
      {оПроекте && <div className="faint small flows-tip-note">{оПроекте}</div>}
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
