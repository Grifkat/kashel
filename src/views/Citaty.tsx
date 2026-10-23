import React from 'react'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { humanDate, today } from '../lib/date'
import { т } from '../i18n'
import type { Цитата } from '../citaty/baza'
import { авторЦитаты, цитатаПоId } from '../citaty/vybor'
import {
  Портрет, useЗвезда, useЦитатаДня, открытьЦитату,
  годыА, имяА, источникЦ, кЧемуЦ, оговоркаЦ, славаА, текстЦ,
} from '../components/Citaty'

/*
 * Раздел «Цитаты»: сверху цитата дня крупно, ниже избранное, внизу —
 * цитаты прошлых дней с самого первого запуска.
 */
export default function CitatyView() {
  const { data } = useStore()
  const дня = useЦитатаДня()
  const звезда = useЗвезда()
  const а = авторЦитаты(дня)
  const отмечена = звезда.есть(дня.id)

  const избранные = звезда.список.map(цитатаПоId).filter((ц): ц is Цитата => !!ц).reverse()
  const сегодня = today()
  const прошлые = Object.entries(data.settings.quotes?.days ?? {})
    .filter(([д]) => д < сегодня)
    .sort(([x], [y]) => (x < y ? 1 : -1))
    .map(([д, id]) => ({ д, ц: цитатаПоId(id) }))
    .filter((x): x is { д: string; ц: Цитата } => !!x.ц)

  return (
    <div className="view citaty-view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Цитаты')}</h1>
          <div className="view-sub">{т('Деньги — не свобода, а лучший инструмент достижения свободы.')}</div>
        </div>
      </div>

      <div className="card citaty-den">
        <Портрет автор={а} className="citaty-den-portret" />
        <div className="citaty-den-tekst">
          <div className="citata-metka">{т('Цитата дня · {0}', humanDate(сегодня))}</div>
          <blockquote className="citaty-den-citata">{т('«{0}»', текстЦ(дня))}</blockquote>
          <div className="citaty-den-avtor">
            <b>{имяА(а)}</b>
            <span className="faint"> {годыА(а)}</span>
          </div>
          <div className="faint small citaty-slava">{славаА(а)}</div>
          <Источник ц={дня} />
          <div className="citata-k-chemu citaty-den-k-chemu">
            <div className="citata-k-chemu-metka">{т('К чему это')}</div>
            <p>{кЧемуЦ(дня)}</p>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className={'btn citaty-zvezda-btn' + (отмечена ? ' on' : '')}
              aria-pressed={отмечена}
              onClick={() => звезда.нажать(дня.id)}
            >
              <Icon name="star" size={15} /> {отмечена ? т('В избранном') : т('В избранное')}
            </button>
            <button className="btn" onClick={() => открытьЦитату(дня)}>
              <Icon name="fit" size={15} /> {т('На весь экран')}
            </button>
          </div>
        </div>
      </div>

      <h2 className="citaty-zagolovok"><Icon name="star" size={15} /> {т(' Избранное')}</h2>
      {избранные.length ? (
        <div className="citaty-spisok">
          {избранные.map((ц) => (
            <Строка key={ц.id} ц={ц} />
          ))}
        </div>
      ) : (
        <div className="faint citaty-pusto">{т('Отметьте звездой цитату, которая отзывается, — она останется здесь.')}</div>
      )}

      <h2 className="citaty-zagolovok"><Icon name="clock" size={15} /> {т(' Были раньше')}</h2>
      {прошлые.length ? (
        <div className="citaty-spisok">
          {прошлые.map(({ д, ц }) => (
            <Строка key={д} ц={ц} день={д} />
          ))}
        </div>
      ) : (
        <div className="faint citaty-pusto">{т('Здесь соберутся цитаты прошлых дней — начиная с сегодняшнего.')}</div>
      )}
    </div>
  )
}

function Источник({ ц }: { ц: Цитата }) {
  const источник = источникЦ(ц)
  const оговорка = оговоркаЦ(ц)
  if (!источник && ц.точно) return null
  return (
    <div className="faint small citaty-istochnik">
      {источник}
      {!ц.точно && (
        <span title={т('Устоявшаяся формулировка, а не дословная')}>
          {источник ? ' · ' : ''}≈ {оговорка || т('в пересказе')}
        </span>
      )}
    </div>
  )
}

function Строка({ ц, день }: { ц: Цитата; день?: string }) {
  const звезда = useЗвезда()
  const а = авторЦитаты(ц)
  const отмечена = звезда.есть(ц.id)
  return (
    <div className="card citaty-stroka">
      <Портрет автор={а} className="citaty-stroka-portret" />
      <div className="citaty-stroka-tekst">
        {день && <div className="faint small">{humanDate(день, true)}</div>}
        <div className="citaty-stroka-citata">{т('«{0}»', текстЦ(ц))}</div>
        <div className="small"><b>{имяА(а)}</b> <span className="faint">{годыА(а)}</span></div>
        <div className="faint small citaty-stroka-k-chemu">{кЧемуЦ(ц)}</div>
      </div>
      <button
        className={'citata-zvezda' + (отмечена ? ' on' : '')}
        aria-pressed={отмечена}
        title={отмечена ? т('Убрать из избранного') : т('В избранное')}
        onClick={() => звезда.нажать(ц.id)}
      >
        <Icon name="star" size={16} />
      </button>
      <button className="icon-btn citaty-na-ekran" title={т('Открыть на весь экран')} aria-label={т('Открыть на весь экран')} onClick={() => открытьЦитату(ц)}>
        <Icon name="fit" size={16} />
      </button>
    </div>
  )
}
