import React from 'react'
import { Icon } from '../../lib/icons'
import { diffDays, shortDate } from '../../lib/date'
import { BarChart, Donut, LineChart, Spark } from '../charts'
import type { CanvasNode, VaultData, СвойВиджет } from '../../lib/types'
import { текущійЯзык, т } from '../../i18n'
import { нормСвойВиджет } from '../../engine/archive'
import { посчитать, разбивкаВиджета, рядВиджета, цельПрогресса, type Доля, type ИтогВиджета } from '../../engine/vidzhety'
import { деньги, кратко, месяц, type Размер } from './Vidzhety'

/*
 * Свой виджет на доске — собранный в конструкторе (см. SvoyKonstruktor).
 *
 * Счёт — в engine/vidzhety, здесь только вид. Вид выбирают руками (число,
 * линия, столбцы, круговая, список, прогресс) или оставляют «Авто» — тогда,
 * как у готовых виджетов, всё решает размер карточки.
 */

/**
 * Свой виджет узла. На доске он лежит ссылкой на библиотеку (lib) и копией
 * (def) на случай, если в библиотеке его уже нет: отвязанный или удалённый
 * из библиотеки виджет продолжает показываться по копии.
 */
export function свойИзУзла(n: CanvasNode, data: VaultData): { w: СвойВиджет; вБиблиотеке: boolean } | null {
  const lib = typeof n.options?.lib === 'string' ? n.options.lib : undefined
  const изБиблиотеки = lib ? data.widgets?.find((w) => w.id === lib) : undefined
  if (изБиблиотеки) return { w: изБиблиотеки, вБиблиотеке: true }
  const копия = нормСвойВиджет(n.options?.def)
  return копия ? { w: копия, вБиблиотеке: false } : null
}

export const ВИДЫ_СВОЕГО: { id: СвойВиджет['view']; name: string }[] = [
  { id: 'auto', name: т('Авто') },
  { id: 'number', name: т('Число') },
  { id: 'line', name: т('Линия') },
  { id: 'bars', name: т('Столбцы') },
  { id: 'pie', name: т('Круговая') },
  { id: 'list', name: т('Список') },
  { id: 'progress', name: т('Прогресс') },
]

const числа = () => new Intl.NumberFormat(текущійЯзык() === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: 2 })

/** Число своего виджета: деньги — с учётом «Скрыть баланс», проценты и просто числа — как есть. */
export function значениеСвоего(data: VaultData, v: number | null, формат: ИтогВиджета['формат'], коротко = false): string {
  if (v == null) return '—'
  if (формат === 'money') return коротко ? кратко(data, v) : деньги(data, v)
  if (формат === 'percent') return числа().format(Math.round(v * 10) / 10) + ' %'
  return числа().format(v)
}

export function СвойНаДоске({ node, data, from, periodLabel, размер }: { node: CanvasNode; data: VaultData; from: string; periodLabel: string; размер: Размер }) {
  const свой = свойИзУзла(node, data)
  if (!свой) {
    return (
      <div className={'cw cw-' + размер} data-widget="custom">
        <div className="cw-head"><span className="cw-icon"><Icon name="sparkle" size={14} /></span><span className="cw-title">{т('Свой виджет')}</span></div>
        <div className="cw-body"><div className="cw-empty">{т('Виджета нет ни в библиотеке, ни на доске. Удалите карточку или соберите его заново.')}</div></div>
      </div>
    )
  }
  return <СвойВиджетВид w={свой.w} data={data} from={from} periodLabel={periodLabel} размер={размер} цвет={node.color} связан={свой.вБиблиотеке} />
}

const ПЕРИОДЫ_СВОЕГО: Record<string, string> = {
  '1m': т('месяц'), '3m': т('3 месяца'), '12m': т('год'), month: т('этот месяц'), year: т('этот год'), all: т('всё время'),
}

/** Свой виджет целиком — на доске и в предпросмотре конструктора. */
export function СвойВиджетВид({
  w, data, from, periodLabel, размер, цвет, связан,
}: {
  w: СвойВиджет
  data: VaultData
  from: string
  periodLabel: string
  размер: Размер
  цвет?: string
  /** Лежит в библиотеке — в шапке значок связи. */
  связан?: boolean
}) {
  const col = w.color || цвет || 'var(--accent)'
  return (
    <div className={'cw cw-' + размер} data-widget="custom" data-view={w.view}>
      <div className="cw-head" style={{ background: `color-mix(in srgb, ${col} 18%, transparent)` }}>
        <span className="cw-icon" style={{ color: col }}><Icon name="sparkle" size={14} /></span>
        <span className="cw-title">{w.name || т('Свой виджет')}</span>
        {связан && <span className="cw-period cw-linked" title={т('Из библиотеки: правка видна на всех досках')}><Icon name="link" size={12} /></span>}
        <span className="cw-period">{w.period === 'board' ? periodLabel : ПЕРИОДЫ_СВОЕГО[w.period]}</span>
      </div>
      <div className="cw-body"><ТелоСвоего w={w} data={data} from={from} размер={размер} цвет={col} /></div>
    </div>
  )
}

function ТелоСвоего({ w, data, from, размер, цвет }: { w: СвойВиджет; data: VaultData; from: string; размер: Размер; цвет: string }) {
  const итог = посчитать(w, data, from)
  if (итог.ошибка) return <div className="cw-empty cw-error">{т('Ошибка в формуле: {0}', итог.ошибка)}</div>
  const вид = w.view === 'auto' ? (размер === 'S' ? 'number' : размер === 'M' ? 'auto' : 'bars') : w.view
  const большое = (
    <div className="cw-line">
      <span className={'cw-big num' + (итог.значение != null && итог.значение < 0 ? ' neg' : '')}>{значениеСвоего(data, итог.значение, итог.формат)}</span>
      {итог.примечание && <span className="cw-sub">{итог.примечание}</span>}
    </div>
  )
  const коротко = (v: number) => значениеСвоего(data, v, итог.формат, true)

  if (вид === 'number') return большое

  if (вид === 'line' || вид === 'bars' || вид === 'auto') {
    const ряд = рядВиджета(w, data, from)
    const числаРяда = ряд.map((р) => р.значение ?? 0)
    const понедельно = ряд.every((р) => diffDays(р.from, р.to) <= 6)
    const подпись = (с: string) => (понедельно ? shortDate(с) : месяц(с))
    if (вид === 'auto') {
      // Средний «Авто»: число и под ним — из чего оно, а если раскладывать нечего — тренд.
      const доли = разбивкаВиджета(w, data, from).slice(0, 3)
      if (доли.length) return <>{большое}<СписокДолей доли={доли} data={data} /></>
      return <>{большое}<Spark values={числаРяда} color={цвет} width={200} height={34} /></>
    }
    if (размер === 'S') return <>{большое}<Spark values={числаРяда} color={цвет} width={160} height={28} /></>
    const высота = размер === 'L' ? 140 : 90
    return (
      <>
        {большое}
        <div className="cw-chart">
          {вид === 'line' ? (
            <LineChart height={высота} color={цвет} format={коротко} points={ряд.map((р) => ({ label: подпись(р.from), value: р.значение ?? 0 }))} />
          ) : (
            <BarChart
              height={высота}
              format={коротко}
              groups={ряд.map((р) => ({
                label: подпись(р.from),
                values: [{ value: Math.abs(р.значение ?? 0), color: (р.значение ?? 0) < 0 ? 'var(--alert)' : цвет, name: w.name || т('Свой виджет') }],
              }))}
            />
          )}
        </div>
      </>
    )
  }

  if (вид === 'pie' || вид === 'list') {
    const все = разбивкаВиджета(w, data, from)
    if (!все.length) return <>{большое}<div className="cw-empty">{т('Раскладывать нечего: у этого показателя нет частей. Выберите вид «Число» или «Линия».')}</div></>
    const n = Math.max(2, w.top ?? 5)
    const доли: Доля[] = все.length > n
      ? [...все.slice(0, n - 1), {
          id: '__rest__', имя: т('Прочее'), значение: все.slice(n - 1).reduce((s, x) => s + x.значение, 0), цвет: 'var(--faint)', размерность: все[0].размерность,
        }]
      : все
    if (вид === 'list') return <>{размер !== 'S' && большое}<СписокДолей доли={доли} data={data} /></>
    const донат = (
      <Donut
        size={размер === 'L' ? 150 : размер === 'M' ? 110 : 80}
        thickness={размер === 'L' ? 22 : 16}
        slices={доли.map((д) => ({ id: д.id, label: д.имя, value: Math.abs(д.значение), color: д.цвет }))}
        center={размер === 'S' ? undefined : <span className="cw-sub num">{коротко(итог.значение ?? 0)}</span>}
      />
    )
    if (размер === 'S') return донат
    return <div className="cw-pie">{донат}<СписокДолей доли={доли} data={data} безПолос /></div>
  }

  // Прогресс к цели.
  const нужно = цельПрогресса(w, data, итог)
  if (!нужно) return <>{большое}<div className="cw-empty">{т('Для прогресса нужна цель: выберите цель в «Что считать» или впишите сумму в конструкторе.')}</div></>
  const доля = итог.значение == null ? 0 : Math.max(0, Math.min(1, итог.значение / нужно))
  return (
    <>
      <div className="cw-line">
        <span className="cw-big num">{Math.round(доля * 100)}%</span>
        {размер !== 'S' && <span className="cw-sub num">{коротко(итог.значение ?? 0)} {т('из')} {коротко(нужно)}</span>}
      </div>
      <div className="bar-track cw-progress"><div className="bar-fill" style={{ width: `${доля * 100}%`, background: цвет }} /></div>
      {размер === 'L' && итог.значение != null && итог.значение < нужно && (
        <div className="cw-sub num">{т('Осталось: {0}', значениеСвоего(data, нужно - итог.значение, итог.формат))}</div>
      )}
    </>
  )
}

function СписокДолей({ доли, data, безПолос }: { доли: Доля[]; data: VaultData; безПолос?: boolean }) {
  const макс = Math.max(1, ...доли.map((д) => Math.abs(д.значение)))
  return (
    <div className="cw-rows cw-parts">
      {доли.map((д) => (
        <div key={д.id} className={'cw-row' + (безПолос ? ' no-bar' : '')}>
          <span className="cw-row-name" title={д.имя}>{безПолос && <i className="cw-acc-dot" style={{ background: д.цвет }} />}{д.имя}</span>
          {!безПолос && <span className="cw-row-bar"><i style={{ width: `${(Math.abs(д.значение) / макс) * 100}%`, background: д.цвет }} /></span>}
          <span className={'cw-row-v num' + (д.значение < 0 ? ' neg' : '')}>
            {значениеСвоего(data, д.значение, д.размерность === 'm' ? 'money' : 'number', true)}
          </span>
        </div>
      ))}
    </div>
  )
}
