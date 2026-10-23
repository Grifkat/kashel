import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { useToast } from './ui'
import { Icon } from '../lib/icons'
import { humanDate, today } from '../lib/date'
import { непросмотренныеВыпуски } from '../lib/versiya'
import { т, текущійЯзык } from '../i18n'
import { ДЕВИЗ, type Цитата } from '../citaty/baza'
import type { Автор } from '../citaty/avtory'
import { ПОРТРЕТЫ } from '../citaty/portrety'
import { авторЦитаты, выбратьНаДень, ещёЦитата, обстановка, разрезать, цитатаПоId } from '../citaty/vybor'
import type { НастройкиЦитат } from '../lib/types'
import { ContextMenu } from './canvas/ContextMenu'

/*
 * Окно цитаты по просьбе, а не только раз в день при запуске: правый клик по
 * цитате на «Сводке», кнопка в разделе «Цитаты». Окно одно на всю программу —
 * его держит ЦитатыХост, сюда же приходит просьба показать нужную цитату.
 */
const СОБЫТИЕ_ОКНА = 'kashel:citata-okno'

/** Открыть окно на весь экран: с этой цитатой или, без неё, — с цитатой дня. */
export function открытьЦитату(ц?: Цитата) {
  window.dispatchEvent(new window.CustomEvent(СОБЫТИЕ_ОКНА, { detail: ц?.id }))
}

/*
 * Цитаты в окне программы: цитата дня на «Сводке», окно при запуске,
 * избранное. Сами цитаты и выбор — в src/citaty, здесь только показ.
 */

// ------------------------------------------------------------ язык цитаты
/*
 * Цитаты — данные, а не надписи: перевод лежит в самой записи. Нет
 * перевода — показываем по-русски, как и обещано в английском окне.
 */
const поАнглийски = () => текущійЯзык() === 'en'
export const текстЦ = (ц: Цитата) => (поАнглийски() && ц.en?.текст) || ц.текст
export const кЧемуЦ = (ц: Цитата) => (поАнглийски() && ц.en?.кЧему) || ц.кЧему
export const источникЦ = (ц: Цитата) => (поАнглийски() && ц.en?.источник) || ц.источник
export const оговоркаЦ = (ц: Цитата) => (поАнглийски() && ц.en?.оговорка) || ц.оговорка
export const имяА = (а: Автор | undefined) => (а ? (поАнглийски() && а.en?.имя) || а.имя : '')
export const годыА = (а: Автор | undefined) => (а ? (поАнглийски() && а.en?.годы) || а.годы : '')
export const славаА = (а: Автор | undefined) => (а ? (поАнглийски() && а.en?.слава) || а.слава : '')

// ------------------------------------------------------------ состояние
/** Цитата дня: запомненная на сегодня или выбранная под положение человека. */
export function useЦитатаДня(): Цитата {
  const { data } = useStore()
  const q = data.settings.quotes
  const день = today()
  // Положение зависит только от денег — пересчитывать его на каждую правку настроек незачем.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const обст = useMemo(() => обстановка(data, день), [data.accounts, data.transactions, день])
  const id = useMemo(() => выбратьНаДень(день, q?.days, обст, q?.tone ?? 'neutral'), [день, q?.days, обст, q?.tone])
  return цитатаПоId(id) ?? цитатаПоId(ДЕВИЗ)!
}

/** Избранное. Пока человек ничего не отмечал, в нём один девиз. */
export function useИзбранное() {
  const { data, patchQuotes } = useStore()
  const список = data.settings.quotes?.favorites ?? [ДЕВИЗ]
  return {
    список,
    есть: (id: string) => список.includes(id),
    /** Переключает отметку; true — цитата теперь в избранном. */
    переключить(id: string): boolean {
      patchQuotes((q) => {
        const было = q.favorites ?? [ДЕВИЗ]
        return { ...q, favorites: было.includes(id) ? было.filter((x) => x !== id) : [...было, id] }
      })
      return !список.includes(id)
    },
  }
}

/** Звезда с уведомлением «Добавлено в избранное · Открыть». */
export function useЗвезда() {
  const избранное = useИзбранное()
  const toast = useToast()
  const app = useApp()
  return {
    ...избранное,
    нажать(id: string, послеОткрытия?: () => void) {
      if (избранное.переключить(id)) {
        toast(т('Добавлено в избранное'), {
          label: т('Открыть'),
          onClick: () => {
            послеОткрытия?.()
            app.openTab('quotes')
          },
        })
      } else {
        toast(т('Убрано из избранного'))
      }
    },
  }
}

// ------------------------------------------------------------ портрет
/** Портрет автора; нет свободного портрета — монограмма. */
export function Портрет({ автор, className }: { автор: Автор | undefined; className?: string }) {
  const src = автор ? ПОРТРЕТЫ[автор.портрет ?? автор.id] : undefined
  if (src) return <img className={'citata-portret ' + (className ?? '')} src={src} alt={имяА(автор)} draggable={false} />
  const буквы = имяА(автор)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((с) => с[0])
    .join('')
  return (
    <div className={'citata-portret citata-monogramma ' + (className ?? '')} role="img" aria-label={имяА(автор)}>
      <span>{буквы}</span>
    </div>
  )
}

// ------------------------------------------------------------ «Сводка»
/** Строка под балансом: цитата дня и автор, при наведении — звезда. */
export function ЦитатаДняСтрока() {
  const app = useApp()
  const ц = useЦитатаДня()
  const звезда = useЗвезда()
  const а = авторЦитаты(ц)
  const отмечена = звезда.есть(ц.id)
  const [меню, setМеню] = useState<{ x: number; y: number } | null>(null)
  return (
    <div
      className="hero-deviz citata-stroka"
      onContextMenu={(e) => {
        e.preventDefault()
        setМеню({ x: e.clientX, y: e.clientY })
      }}
    >
      {меню && (
        <ContextMenu
          x={меню.x}
          y={меню.y}
          title={т('Цитата дня')}
          onClose={() => setМеню(null)}
          items={[
            { id: 'full', label: т('Открыть на весь экран'), icon: 'fit', onClick: () => открытьЦитату(ц) },
            { id: 'star', label: отмечена ? т('Убрать из избранного') : т('В избранное'), icon: 'star', onClick: () => звезда.нажать(ц.id) },
            { id: 'all', label: т('Раздел «Цитаты»'), icon: 'quote', onClick: () => app.openTab('quotes') },
          ]}
        />
      )}
      <button className="citata-stroka-tekst" onClick={() => app.openTab('quotes')} title={т('Открыть раздел «Цитаты». Правый щелчок — на весь экран')}>
        {т('«{0}»', текстЦ(ц))} <span className="citata-stroka-avtor">— {имяА(а)}</span>
      </button>
      <button
        className={'citata-zvezda' + (отмечена ? ' on' : '')}
        aria-pressed={отмечена}
        title={отмечена ? т('Убрать из избранного') : т('В избранное')}
        onClick={() => звезда.нажать(ц.id)}
      >
        <Icon name="star" size={15} />
      </button>
    </div>
  )
}

// ------------------------------------------------------------ окно при запуске
/**
 * Окно «Поверх Кошеля»: тёмная завеса над программой, цитата крупно,
 * пояснение и портрет во всю высоту. Закрывается Esc и кликом мимо карточки.
 */
export function ЦитатаОкно({ onClose, начальная }: { onClose: () => void; начальная?: Цитата }) {
  const дня = useЦитатаДня()
  const звезда = useЗвезда()
  const [показ, setПоказ] = useState<Цитата>(начальная ?? дня)
  const [номер, setНомер] = useState(0)
  const [было, setБыло] = useState<string[]>([(начальная ?? дня).id])
  const перваяКнопка = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    перваяКнопка.current?.focus()
    // Esc ловим раньше всех: под завесой могут быть открытые окна и поля,
    // и закрыться должна только она.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const а = авторЦитаты(показ)
  const { голова, хвост } = разрезать(текстЦ(показ))
  const источник = источникЦ(показ)
  const оговорка = оговоркаЦ(показ)
  const отмечена = звезда.есть(показ.id)
  const ещё = () => {
    const н = ещёЦитата(today(), номер + 1, было)
    setНомер(номер + 1)
    setБыло([...было, н.id].slice(-40))
    setПоказ(н)
  }

  return (
    <div
      className="citata-okno"
      role="dialog"
      aria-modal="true"
      aria-label={т('Цитата дня')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="citata-karta" key={показ.id}>
        <div className="citata-okno-tekst">
          <div className="citata-metka">
            {показ.id === дня.id ? т('Цитата дня · {0}', humanDate(today())) : т('Цитата')}
          </div>
          <blockquote className={'citata-golova' + (голова.length > 70 ? ' dlinnaya' : '')}>{голова}</blockquote>
          {хвост && <div className="citata-hvost">{хвост}</div>}
          <div className="citata-avtor">
            <span className="citata-avtor-imya">{имяА(а)}</span>
            <span className="citata-avtor-gody">
              {[годыА(а), источник].filter(Boolean).join(' · ')}
              {!показ.точно && <span title={оговорка || т('Устоявшаяся формулировка')}>{т(' · ≈ в пересказе')}</span>}
            </span>
          </div>
          <div className="citata-razdel" aria-hidden="true"><span /><b>✦</b><span /></div>
          <div className="citata-k-chemu">
            <div className="citata-k-chemu-metka">{т('К чему это')}</div>
            <p>{кЧемуЦ(показ)}</p>
          </div>
          <div className="citata-knopki">
            <button
              ref={перваяКнопка}
              className={'btn citata-btn-zoloto' + (отмечена ? ' on' : '')}
              aria-pressed={отмечена}
              onClick={() => звезда.нажать(показ.id, onClose)}
            >
              {отмечена ? т('★ В избранном') : т('★ В избранное')}
            </button>
            <button className="btn citata-btn" onClick={ещё}>{т('Ещё цитата')}</button>
            <button className="btn ghost citata-btn-tiho" onClick={onClose}>{т('Закрыть · Esc')}</button>
          </div>
        </div>
        <div className="citata-okno-portret">
          <Портрет автор={а} />
          <div className="citata-okno-podpis">{славаА(а)}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Живёт в App всегда: запоминает цитату дня в хранилище (из этого списка —
 * «Были раньше») и решает, показать ли окно при запуске.
 *
 * Окно ждёт «Что нового»: два окна разом закрывали бы друг друга.
 */
export function ЦитатыХост() {
  const { data, ready, patchQuotes } = useStore()
  const ц = useЦитатаДня()
  const [открыто, setОткрыто] = useState(false)
  /** Какую цитату показать — когда окно открыли по просьбе, а не при запуске. */
  const [какая, setКакая] = useState<Цитата | undefined>()
  const решено = useRef(false)

  useEffect(() => {
    const открыть = (e: Event) => {
      const id = (e as CustomEvent<string | undefined>).detail
      setКакая(id ? цитатаПоId(id) : undefined)
      setОткрыто(true)
    }
    window.addEventListener(СОБЫТИЕ_ОКНА, открыть)
    return () => window.removeEventListener(СОБЫТИЕ_ОКНА, открыть)
  }, [])
  const день = today()
  const q: НастройкиЦитат = data.settings.quotes ?? {}

  useEffect(() => {
    if (!ready || q.days?.[день] === ц.id) return
    patchQuotes((было) => (было.days?.[день] ? было : { ...было, days: { ...было.days, [день]: ц.id } }))
  }, [ready, день, ц.id, q.days, patchQuotes])

  const естьДанные = data.transactions.length > 0 || data.accounts.length > 0
  const ждётЧтоНового = непросмотренныеВыпуски(data.settings.whatsNewSeen, естьДанные).length > 0

  useEffect(() => {
    if (!ready || решено.current || ждётЧтоНового) return
    решено.current = true
    const режим = q.popup ?? 'daily'
    if (режим === 'off') return
    if (режим === 'daily' && q.popupSeen === день) return
    setОткрыто(true)
    patchQuotes((было) => ({ ...было, popupSeen: день }))
  }, [ready, ждётЧтоНового, q.popup, q.popupSeen, день, patchQuotes])

  if (!открыто) return null
  // key: новая просьба при открытом окне начинает показ заново, с той цитаты.
  return <ЦитатаОкно key={какая?.id ?? 'den'} начальная={какая} onClose={() => { setОткрыто(false); setКакая(undefined) }} />
}

// ------------------------------------------------------------ настройки
/** Карточка в «Настройках»: окно при запуске и стиль общения. */
export function НастройкиЦитатКарточка() {
  const { data, patchQuotes } = useStore()
  const q = data.settings.quotes ?? {}
  const окно = q.popup ?? 'daily'
  const тон = q.tone ?? 'neutral'
  const ОКНО: { v: NonNullable<НастройкиЦитат['popup']>; t: string }[] = [
    { v: 'daily', t: т('Раз в день') },
    { v: 'launch', t: т('При каждом запуске') },
    { v: 'off', t: т('Не показывать') },
  ]
  const ТОН: { v: NonNullable<НастройкиЦитат['tone']>; t: string }[] = [
    { v: 'support', t: т('Поддержка') },
    { v: 'neutral', t: т('Нейтрально') },
    { v: 'hard', t: т('Жёстко, но по делу') },
  ]
  return (
    <div className="card nastroyki-citaty">
      <div className="card-title"><Icon name="quote" size={14} /> {т(' Цитаты')}</div>
      <div className="row wrap" style={{ marginBottom: 14, gap: 8 }}>
        <span style={{ flex: 1, minWidth: 160 }}>{т('Окно с цитатой при запуске')}</span>
        <div className="seg">
          {ОКНО.map((о) => (
            <button key={о.v} className={окно === о.v ? 'on' : ''} onClick={() => patchQuotes((x) => ({ ...x, popup: о.v }))}>
              {о.t}
            </button>
          ))}
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 8, gap: 8 }}>
        <span style={{ flex: 1, minWidth: 160 }}>{т('Стиль общения')}</span>
        <div className="seg">
          {ТОН.map((о) => (
            <button key={о.v} className={тон === о.v ? 'on' : ''} onClick={() => patchQuotes((x) => ({ ...x, tone: о.v }))}>
              {о.t}
            </button>
          ))}
        </div>
      </div>
      <div className="faint small" style={{ lineHeight: 1.5 }}>
        {тон === 'support'
          ? т('Чаще слова поддержки — когда тяжело и много долгов.')
          : тон === 'hard'
            ? т('Чаще прямые слова о дисциплине и труде. Жёстко — значит честно, без оскорблений.')
            : т('Цитата подбирается по вашему положению: долги, подушка, цели.')}
      </div>
    </div>
  )
}
