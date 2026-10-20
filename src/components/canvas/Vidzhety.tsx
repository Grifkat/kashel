import React from 'react'
import { Icon } from '../../lib/icons'
import { money, moneyShort } from '../../lib/format'
import { MONTHS_SHORT, addMonths, startOfMonth, today } from '../../lib/date'
import { balanceTimeline, balances, monthlySeries, sumOf } from '../../engine/stats'
import { прогрессЗаработка, этоЗаработок } from '../../engine/zarabotok'
import { личное, проектный } from '../../engine/project'
import { BarChart, Spark } from '../charts'
import type { CanvasNode, Money, VaultData } from '../../lib/types'
import { т } from '../../i18n'

/*
 * Виджеты доски: кусок Кошеля, живущий на канвасе рядом с карточками.
 *
 * Главное правило — виджет сам решает, что показать, по своему размеру, как
 * виджеты на телефоне. Маленький — одно число, средний — число с разбивкой
 * или трендом, большой — график. Растянул угол — увидел больше; настроек нет.
 *
 * Числа — личные, как на дашборде: проектные счета в доход, расход и
 * остаток не входят (деньги на них чужие, см. engine/project). «Остаток на
 * счетах» в большом виде показывает и проектные — с пометкой «проект».
 *
 * В файле доски виджет — узел type: 'widget', вид — в options.widget, цель
 * заработка — в ref. Ещё в node.text лежит обычная фраза: старые версии
 * Кошеля и архив прежних версий незнакомый узел превращают в текстовую
 * карточку, и вместо пустоты человек увидит, что это и где открыть.
 */

export type ВидВиджета = 'flow' | 'earn' | 'balance'

export const ВИДЖЕТЫ: { id: ВидВиджета; name: string; about: string; icon: string }[] = [
  { id: 'flow', name: т('Доход и расход'), about: т('Сколько пришло и ушло за период доски'), icon: 'bars' },
  { id: 'earn', name: т('Заработок'), about: т('Как идёт цель «заработать»'), icon: 'target' },
  { id: 'balance', name: т('Остаток на счетах'), about: т('Сколько денег сейчас и куда идёт остаток'), icon: 'wallet' },
]

/** Вид виджета из узла; незнакомое — «Доход и расход». */
export const видВиджета = (n: CanvasNode): ВидВиджета => {
  const v = n.options?.widget
  return v === 'earn' || v === 'balance' ? v : 'flow'
}

/** Фраза для старых версий: её покажет текстовая карточка, если узел виджета им незнаком. */
export const текстДляСтарых = (вид: ВидВиджета): string =>
  т('Виджет «{0}» — обновите Кошель, чтобы его увидеть', ВИДЖЕТЫ.find((w) => w.id === вид)!.name)

type Размер = 'S' | 'M' | 'L'
/** Размер по самой карточке: пороги — где следующий вид уже помещается без давки. */
const размерОт = (n: CanvasNode): Размер =>
  n.width < 240 || n.height < 150 ? 'S' : n.width >= 340 && n.height >= 250 ? 'L' : 'M'

const месяц = (key: string) => MONTHS_SHORT[Number(key.slice(5, 7)) - 1]

export function Виджет({
  node,
  data,
  from,
  periodLabel,
}: {
  node: CanvasNode
  data: VaultData
  /** Начало периода доски (месяц, 3 месяца, год). */
  from: string
  periodLabel: string
}) {
  const вид = видВиджета(node)
  const размер = размерОт(node)
  const о = ВИДЖЕТЫ.find((w) => w.id === вид)!
  const col = node.color || 'var(--accent)'
  const тело =
    вид === 'flow' ? <ДоходИРасход data={data} from={from} размер={размер} />
      : вид === 'earn' ? <Заработок data={data} goalId={node.ref} размер={размер} />
        : <Остаток data={data} from={from} размер={размер} />
  const подпись = вид === 'earn' ? data.goals.find((g) => g.id === node.ref)?.name ?? о.name : о.name
  return (
    <div className={'cw cw-' + размер} data-widget={вид}>
      <div className="cw-head" style={{ background: `color-mix(in srgb, ${col} 18%, transparent)` }}>
        <span className="cw-icon" style={{ color: col }}><Icon name={о.icon} size={14} /></span>
        <span className="cw-title">{подпись}</span>
        {вид !== 'earn' && <span className="cw-period">{periodLabel}</span>}
      </div>
      <div className="cw-body">{тело}</div>
    </div>
  )
}

// ------------------------------------------------------- доход и расход
function ДоходИРасход({ data, from, размер }: { data: VaultData; from: string; размер: Размер }) {
  const своё = личное(data)
  const за = своё.transactions.filter((t) => t.date >= from)
  const доход = sumOf(за, 'income')
  const расход = sumOf(за, 'expense')
  const итог = доход - расход
  const макс = Math.max(1, доход, расход)

  if (размер === 'S') {
    return (
      <>
        <div className={'cw-big num' + (итог < 0 ? ' neg' : ' pos')}>{money(итог, { sign: true })}</div>
        <div className="cw-sub num">+{moneyShort(доход)} · −{moneyShort(расход)}</div>
      </>
    )
  }
  const строки = (
    <div className="cw-rows">
      {[
        { имя: т('Доход'), v: доход, цвет: 'var(--money-in)' },
        { имя: т('Расход'), v: расход, цвет: 'var(--money-out)' },
      ].map((р) => (
        <div key={р.имя} className="cw-row">
          <span className="cw-row-name">{р.имя}</span>
          <span className="cw-row-bar"><i style={{ width: `${(р.v / макс) * 100}%`, background: р.цвет }} /></span>
          <span className="cw-row-v num">{moneyShort(р.v)}</span>
        </div>
      ))}
      <div className="cw-row cw-total">
        <span className="cw-row-name">{т('Итог')}</span>
        <span />
        <span className={'cw-row-v num' + (итог < 0 ? ' neg' : ' pos')}>{money(итог, { sign: true })}</span>
      </div>
    </div>
  )
  if (размер === 'M') return строки

  // Большой: по месяцам — за полгода, на годовой доске — за год.
  const месяцев = from <= addMonths(today(), -12) ? 12 : 6
  const ряд = monthlySeries(своё.transactions, startOfMonth(addMonths(today(), -(месяцев - 1))), today())
  return (
    <>
      {строки}
      <div className="cw-chart">
        <BarChart
          height={130}
          groups={ряд.map((p) => ({
            label: месяц(p.key),
            values: [
              { value: p.income, color: 'var(--money-in)', name: т('Доход') },
              { value: p.expense, color: 'var(--money-out)', name: т('Расход') },
            ],
          }))}
        />
      </div>
    </>
  )
}

// ------------------------------------------------------------- заработок
function Заработок({ data, goalId, размер }: { data: VaultData; goalId?: string; размер: Размер }) {
  const g = data.goals.find((x) => x.id === goalId)
  if (!g || !этоЗаработок(g)) return <div className="cw-empty">{т('Цель удалена или это не цель «заработать»')}</div>
  const п = прогрессЗаработка(g, data)
  const доля = Math.min(1, п.доля)
  const полоса = (
    <div className="bar-track cw-progress"><div className="bar-fill" style={{ width: `${доля * 100}%`, background: 'var(--money-in)' }} /></div>
  )
  if (размер === 'S') {
    return (
      <>
        <div className="cw-big num">{Math.round(п.доля * 100)}%</div>
        {полоса}
        <div className="cw-sub num">{moneyShort(п.заработано)} {т('из')} {moneyShort(g.targetAmount)}</div>
      </>
    )
  }
  const детали: [string, string][] = [
    [т('Заработано'), money(п.заработано)],
    [т('Осталось'), money(п.осталось)],
    [т('Темп'), п.темп ? т('{0} в месяц', moneyShort(п.темп)) : '—'],
  ]
  if (п.нужноВМесяц != null) детали.push([т('Нужно'), т('{0} в месяц', moneyShort(п.нужноВМесяц))])
  if (п.нужноВДень != null) детали.push([т('Нужно'), т('{0} в день', moneyShort(п.нужноВДень))])
  return (
    <>
      <div className="cw-line">
        <span className="cw-big num">{Math.round(п.доля * 100)}%</span>
        {п.успевает != null && (
          <span className={'cw-chip ' + (п.успевает ? 'pos' : 'neg')}>{п.успевает ? т('успеваете') : т('не успеваете')}</span>
        )}
      </div>
      {полоса}
      <dl className={'cw-dl' + (размер === 'L' ? ' wide' : '')}>
        {(размер === 'L' ? детали : детали.slice(0, 2)).map(([k, v], i) => (
          <React.Fragment key={k + i}><dt>{k}</dt><dd className="num">{v}</dd></React.Fragment>
        ))}
      </dl>
    </>
  )
}

// ------------------------------------------------------- остаток на счетах
function Остаток({ data, from, размер }: { data: VaultData; from: string; размер: Размер }) {
  const б = balances(data.accounts, data.transactions)
  const свои = data.accounts.filter((a) => !a.archived && !проектный(a))
  const кривая = balanceTimeline(свои, data.transactions, from, today()).map((p) => p.value)
  const было: Money = кривая[0] ?? б.assets
  const сдвиг = б.assets - было

  const итог = (
    <>
      <div className="cw-big num">{money(б.assets)}</div>
      {размер !== 'S' && (
        <div className="cw-line">
          <span className={'cw-sub num ' + (сдвиг < 0 ? 'neg' : 'pos')}>{money(сдвиг, { sign: true })}</span>
          <Spark values={кривая.filter((_, i) => i % Math.max(1, Math.floor(кривая.length / 40)) === 0)} color="var(--accent)" width={120} height={28} />
        </div>
      )}
    </>
  )
  if (размер !== 'L') return итог
  const счета = data.accounts.filter((a) => !a.archived)
  return (
    <>
      {итог}
      <div className="cw-accounts">
        {счета.map((a) => (
          <div key={a.id} className="cw-acc">
            <span className="cw-acc-dot" style={{ background: a.color }} />
            <span className="cw-acc-name">{a.name}</span>
            {проектный(a) && <span className="cw-chip">{т('проект')}</span>}
            <span className={'cw-acc-v num' + ((б.byAccount.get(a.id) ?? 0) < 0 ? ' neg' : '')}>{money(б.byAccount.get(a.id) ?? 0)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
