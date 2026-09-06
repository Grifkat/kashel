import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { Icon } from '../lib/icons'
import { humanDate } from '../lib/date'
import { plural } from '../lib/format'
import { awards, standing } from '../engine/honors'
import { Znak } from '../lib/znaki'

/*
 * Полоса взятыхъ наградъ.
 *
 * Смыслъ у неё одинъ: держать награды на глазахъ. Въ грамоту заходятъ разъ въ
 * недѣлю, а на дашбордъ — каждый день, и знакъ, которого не видно, не манитъ.
 *
 * Ничего своего тутъ не считается: чинъ, награды и даты пожалованія берутся
 * изъ того же слоя, что и грамота. Обрамленіе — карточка на переменныхъ темы,
 * поэтому полоса одинаково сидитъ во всѣхъ оформленіяхъ; свой цвѣтъ у одного
 * лишь медальона, и это его собственная бронза, а не тема.
 */

export interface NagradyProps {
  /** Сколько знаковъ показать; остальные сворачиваются въ «ещё N». */
  limit?: number
  /** Поперечникъ знака. */
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function Nagrady({ limit = 14, size = 46, className, style }: NagradyProps) {
  const { data } = useStore()
  const app = useApp()

  const st = useMemo(() => standing(data), [data])
  const всѣ = useMemo(() => awards(data), [data])
  const пожалованы = data.honors?.awarded ?? {}

  /*
   * Орденъ показывается однимъ знакомъ — старшей изъ полученныхъ степеней.
   * Иначе полоса заполняется повторами: у Анны четыре степени, у Бѣлаго орла
   * четыре, и на дашбордѣ выходитъ одно и то же лицо подрядъ. Носятъ тоже
   * старшую, а не всѣ разомъ.
   */
  const взятыя = useMemo(() => {
    const свои = всѣ.filter((a) => a.earned)
    const лучшія = new Map<string, { a: typeof свои[number]; i: number }>()
    свои.forEach((a, i) => {
      const ключъ = a.order ?? a.id
      const было = лучшія.get(ключъ)
      // Меньшая цифра степени — старшая степень: первая выше четвёртой.
      if (!было || (a.degree ?? 9) < (было.a.degree ?? 9)) лучшія.set(ключъ, { a, i })
    })
    return [...лучшія.values()]
      .map((x) => ({ ...x, день: пожалованы[x.a.id] ?? '' }))
      .sort((x, y) => (x.день === y.день ? x.i - y.i : y.день.localeCompare(x.день)))
      .map((x) => x.a)
  }, [всѣ, пожалованы])

  const видно = взятыя.slice(0, limit)
  const скрыто = взятыя.length - видно.length

  return (
    <div className={'card nagrady' + (className ? ' ' + className : '')} style={style}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Icon name="sparkle" size={14} /> Отличія
        </div>
        <span className="spacer" />
        <span className="faint small">{st.rank}</span>
        <button className="btn sm ghost" style={{ marginLeft: 10 }} onClick={() => app.openTab('profile')}>
          Грамота <Icon name="right" size={13} />
        </button>
      </div>

      {взятыя.length === 0 ? (
        <div className="empty" style={{ padding: '10px 0' }}>
          Пока ни одной награды. {st.nearest ? `Ближайшая — «${st.nearest.title}»: ${st.nearest.left}.` : ''}
        </div>
      ) : (
        <>
          <div className="nagrady-strip">
            {видно.map((a) => (
              <button
                key={a.id}
                className="nagrady-one"
                onClick={() => app.openTab('znaki')}
                title={
                  (a.order ? `${a.order} · ${a.title}` : a.title) +
                  (пожалованы[a.id] ? ` — пожаловано ${humanDate(пожалованы[a.id], true)}` : '')
                }
              >
                <Znak id={a.id} size={size} on />
              </button>
            ))}
            {скрыто > 0 && (
              <button className="nagrady-more" onClick={() => app.openTab('profile')} style={{ width: size, height: size }}>
                +{скрыто}
              </button>
            )}
          </div>
          <div className="faint small" style={{ marginTop: 10 }}>
            {st.awarded} {plural(st.awarded, 'награда', 'награды', 'наградъ')} изъ {st.awardsTotal}
            {взятыя.length < st.awarded && ` · ордена показаны старшей степенью`}
            {st.nearest && ` · ближайшая — «${st.nearest.title}»: ${st.nearest.left}`}
          </div>
        </>
      )}
    </div>
  )
}
