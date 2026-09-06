import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { Icon } from '../lib/icons'
import { humanDate } from '../lib/date'
import { awards } from '../engine/honors'
import { Znak, ключъЗнака } from '../lib/znaki'
import { ВСТУПЛЕНІЕ, РАЗДѢЛЫ } from '../lib/znakiText'

/*
 * «Кто на знакахъ» — справочникъ къ грамотѣ.
 *
 * Названіе награды, её состояніе и подпись о пожалованіи берутся изъ того же
 * слоя чиновъ, что и сама грамота. Здѣсь ничего не считается заново: разойдись
 * этотъ разделъ съ грамотой — вѣрить надо грамотѣ.
 */
export default function Znaki() {
  const { data } = useStore()
  const app = useApp()

  const всѣ = useMemo(() => awards(data), [data])
  const пожалованы = data.honors?.awarded ?? {}

  /** Награда, отвѣчающая знаку. У ордена берётся младшая степень. */
  const награда = (key: string) => {
    const свои = всѣ.filter((a) => ключъЗнака(a.id) === key)
    return свои.find((a) => a.earned) ?? свои[0] ?? null
  }

  return (
    <div className="view gramota znaki-spravka">
      <div className="view-head">
        <div>
          <h1 className="view-title">Кто на знакахъ</h1>
          <div className="view-sub">
            Тридцать девять подлинниковъ и ни одного выдуманнаго лица. Здѣсь сказано, кто на
            каждомъ знакѣ, почему именно онъ и за что даётся награда.
          </div>
        </div>
        <button className="btn ghost" onClick={() => app.openTab('profile')}>Къ грамотѣ</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        {ВСТУПЛЕНІЕ.map((абзацъ, i) => (
          <p key={i} className="znaki-lede" style={i === 2 ? { fontWeight: 700, color: 'var(--text-strong)' } : undefined}>
            {абзацъ}
          </p>
        ))}
      </div>

      {РАЗДѢЛЫ.map((р) => (
        <div key={р.title} className="card" style={{ marginTop: 16 }}>
          <div className="card-title"><Icon name="sparkle" size={14} /> {р.title}</div>
          <div className="faint small" style={{ marginBottom: 14, lineHeight: 1.6, maxWidth: 760 }}>
            {р.lede}
          </div>

          {р.faces.map((f) => {
            const a = награда(f.key)
            const взято = !!a?.earned
            const день = a && пожалованы[a.id]
            return (
              <div key={f.key} className="znaki-row">
                <Znak id={f.key} size={84} on={взято} title={f.name} />
                <div className="znaki-body">
                  <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
                    <span className="znaki-name">{f.name}</span>
                    <span className="faint small">{f.years}</span>
                    <span className="spacer" />
                    <span className={'badge' + (взято ? ' on' : '')}>
                      {взято ? (день ? `пожаловано ${humanDate(день, true)}` : 'пожаловано') : 'ещё нѣтъ'}
                    </span>
                  </div>
                  <div className="znaki-award">{a?.order ?? a?.title ?? '—'}</div>
                  <p className="znaki-who">{f.who}</p>
                  <p className="znaki-why"><b>Почему онъ.</b> {f.why}</p>
                  <p className="znaki-rule"><b>За что даётся.</b> {f.rule}</p>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="faint small" style={{ lineHeight: 1.7 }}>
          Всѣ изображенія — общественное достояніе: иконы, портреты кисти Рѣпина, Боровиковскаго,
          Кипренскаго, Перова, Тропинина, Левицкаго, Крейцингера, Доу, Брюллова, Миропольскаго,
          Веденецкаго, Тюрина, Бажанова, Дункерса, Ботмана, Зубова, парсуны XVII вѣка и губернскіе
          гербы XVIII столѣтія. Лица не рисованы и не сочинены: въ поле медали посаженъ подлинникъ,
          вогнанный въ цвѣтъ металла.
        </div>
      </div>
    </div>
  )
}
