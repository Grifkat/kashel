import React, { useMemo } from 'react'
import { useStore } from '../state/store'
import { useApp } from '../App'
import { Icon } from '../lib/icons'
import { Znak } from '../lib/znaki'
import { money, plural } from '../lib/format'
import { humanDate } from '../lib/date'
import {
  awards, BRANCH_NAMES, currentQuests, RANKS, standing, titles, traits, quests,
  xpBreakdown, XP_STEPS,
} from '../engine/honors'
import { FREEZES_PER_MONTH, streak } from '../engine/streak'
import type { RankBranch } from '../lib/types'

const ВѢТВИ: RankBranch[] = ['civil', 'military', 'merchant']

/** Дни недѣли полностью — въ короткомъ спискѣ «Вс» читается хуже. */
const ДНИ = ['воскресенье', 'понедѣльникъ', 'вторникъ', 'среда', 'четвергъ', 'пятница', 'суббота']

export default function Profile() {
  const { data, patchHonors, patchSettings } = useStore()
  const app = useApp()

  const st = useMemo(() => standing(data), [data])
  const шкалы = useMemo(() => traits(data), [data])
  const опытъ = useMemo(() => xpBreakdown(data), [data])
  const всѣНаграды = useMemo(() => awards(data), [data])
  const званія = useMemo(() => titles(data), [data])
  const дѣла = useMemo(() => quests(data), [data])
  const серія = useMemo(() => streak(data), [data])
  const заданія = useMemo(() => currentQuests(data), [data])
  const branch = data.honors?.branch ?? 'civil'
  const пожалованы = data.honors?.awarded ?? {}

  const ордена = всѣНаграды.filter((a) => a.order)
  const отличія = всѣНаграды.filter((a) => !a.order)
  /*
   * Рядомъ съ чиномъ ставимъ старшую изъ пожалованныхъ: сперва орденъ высшей
   * степени, а если ордена нѣтъ — послѣднее полученное отличіе. Не заслужено
   * ничего — показываемъ Георгія остывшимъ, чтобы поле не пустовало.
   */
  const старшая =
    ордена.filter((a) => a.earned).sort((a, b) => (a.degree ?? 4) - (b.degree ?? 4))[0]
    ?? [...отличія].reverse().find((a) => a.earned)
    ?? null
  const поОрденамъ = new Map<string, typeof ордена>()
  for (const a of ордена) {
    const l = поОрденамъ.get(a.order!) ?? []
    l.push(a)
    поОрденамъ.set(a.order!, l)
  }

  return (
    <div className="view gramota">
      <div className="view-head">
        <div>
          <h1 className="view-title">Грамота</h1>
          <div className="view-sub">
            Чинъ, ордена и характеристики выводятся изъ вашихъ же записей и пересчитываются
            всякій разъ заново. Ничего не копится отдѣльно: поправите старую запись — сойдётся
            и здѣсь.
          </div>
        </div>
        <select
          value={branch}
          onChange={(e) => patchHonors({ branch: e.target.value as RankBranch })}
          style={{ maxWidth: 190 }}
          title="По какой лѣстницѣ считать чинъ"
        >
          {ВѢТВИ.map((b) => <option key={b} value={b}>{BRANCH_NAMES[b]} лѣстница</option>)}
        </select>
      </div>

      {/* ------------------------------------------------------------ чинъ */}
      <div className="card gramota-head" style={{ marginBottom: 16 }}>
        <Znak
          id={старшая?.id ?? 'george'}
          size={88}
          on={!!старшая}
          title={старшая ? `${старшая.title} — ${старшая.about}` : 'Пока не заслужено ни одной награды'}
        />
        <div className="gramota-class">{st.roman}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="faint small">{st.address}</div>
          <div className="gramota-rank">{st.rank}</div>
          <div className="faint small" style={{ marginTop: 2 }}>
            {BRANCH_NAMES[branch]} лѣстница · {st.level}-й уровень изъ 14
            {данныйТитулъ(званія, data.honors?.pinned) && ` · ${данныйТитулъ(званія, data.honors?.pinned)}`}
          </div>
          <div className="xp-bar" title={`${st.xp} опыта`}>
            <span style={{ width: `${Math.round(st.progress * 100)}%` }} />
          </div>
          <div className="faint small">
            {st.xp.toLocaleString('ru-RU')} опыта
            {st.toNext == null
              ? ' · выше чина нѣтъ'
              : ` · до чина «${RANKS[branch][st.level]}» ещё ${st.toNext.toLocaleString('ru-RU')}`}
          </div>
        </div>
        <div className="gramota-awards">
          <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{st.awarded}</div>
          <div className="faint small">изъ {st.awardsTotal} наградъ</div>
        </div>
      </div>

      <div className="grid c2" style={{ alignItems: 'start' }}>
        {/* --------------------------------------------------- характеристики */}
        <div className="card">
          <div className="card-title"><Icon name="scale" size={14} /> Характеристики</div>
          {шкалы.map((t) => (
            <div key={t.key} className="trait">
              <div className="row">
                <span className="name">{t.title}</span>
                <span className="spacer" />
                <span className="num strong">{t.value}</span>
              </div>
              <div className="trait-bar"><span style={{ width: `${t.value}%` }} /></div>
              <div className="faint small">{t.hint}</div>
            </div>
          ))}
        </div>

        {/* ----------------------------------------------------------- опытъ */}
        <div className="card">
          <div className="card-title"><Icon name="chart" size={14} /> Откуда опытъ</div>
          {опытъ.map((p) => (
            <div key={p.key} className="cat-row">
              <span className="name">
                {p.title}
                <span className="d faint small"> {p.hint}</span>
              </span>
              <span className="amt num">{p.xp.toLocaleString('ru-RU')}</span>
            </div>
          ))}
          {!опытъ.length && <div className="empty">Записей пока нѣтъ</div>}
          <div className="faint small" style={{ marginTop: 10, lineHeight: 1.6 }}>
            Опытъ за доходъ считается съ затуханіемъ: вдесятеро большая сумма даётъ втрое больше,
            а не вдесятеро. Иначе одинъ крупный гонораръ обратилъ бы всѣ прочіе мѣсяцы въ шумъ.
            Опытъ не отнимается никогда.
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- серія и заданія */}
      <div className="grid c2" style={{ alignItems: 'start', marginTop: 16 }}>
        <div className="card">
          <div className="card-title"><Icon name="repeat" size={14} /> Серія записей</div>
          <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
            <span className="num strong" style={{ fontSize: 34 }}>{серія.days}</span>
            <span className="faint">
              {plural(серія.days, 'день', 'дня', 'дней')} подрядъ
            </span>
            <span className="spacer" />
            <span className="faint small">лучшая — {серія.best}</span>
          </div>
          <div className="faint small" style={{ marginTop: 6, lineHeight: 1.6 }}>
            Пропущенный день закрывается заморозкой: ихъ {FREEZES_PER_MONTH} на мѣсяцъ, осталось{' '}
            <b>{серія.freezesLeft}</b>. Третій пропускъ серію рветъ. Сдѣлано это нарочно: серія,
            которую рушитъ одна забытая суббота, отбиваетъ охоту продолжать вовсе.
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
            <span className="faint small">Выходной</span>
            <select
              value={data.settings.restDay ?? ''}
              onChange={(e) => patchSettings({ restDay: e.target.value === '' ? undefined : Number(e.target.value) })}
              style={{ maxWidth: 170 }}
              title="Этотъ день недѣли въ серію не считается"
            >
              <option value="">безъ выходного</option>
              {ДНИ.map((д, i) => <option key={д} value={i}>{д}</option>)}
            </select>
            <span className="faint small">
              {серія.todayDone ? 'сегодня записано' : 'сегодня записи ещё нѣтъ'}
            </span>
          </div>
        </div>

        <div className="card">
          <div className="card-title"><Icon name="target" size={14} /> Заданія мѣсяца</div>
          <div className="faint small" style={{ marginBottom: 10 }}>
            Три штуки, свои на каждый мѣсяцъ. Нигдѣ не хранятся: и выборъ, и выполненіе
            выводятся изъ записей — поправите старую, и заданіе сойдётся вмѣстѣ съ ней.
          </div>
          {заданія.map((q) => (
            <div key={q.id} className="trait">
              <div className="row">
                <span className={'name' + (q.done ? ' strong' : '')}>{q.title}</span>
                <span className="spacer" />
                <span className="num faint">{q.done ? `+${q.xp}` : `${Math.round(q.progress * 100)} %`}</span>
              </div>
              <div className="trait-bar"><span style={{ width: `${Math.round(q.progress * 100)}%` }} /></div>
              <div className="faint small">{q.about}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------- ордена */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><Icon name="sparkle" size={14} /> Ордена</div>
        <div className="faint small" style={{ marginBottom: 12 }}>
          У орденовъ Россійской имперіи были степени — отъ младшей четвёртой къ старшей первой.
          Здѣсь они и служатъ ступенями награды.
        </div>
        {[...поОрденамъ.entries()].map(([имя, степени]) => (
          <div key={имя} className="order-row">
            <div className="order-body">
              <Znak id={степени[0].id} size={62} on={степени.some((a) => a.earned)} />
              <div>
            <div className="row">
              <span className="strong">{имя}</span>
              <span className="spacer" />
              <span className="faint small">{степени[0].about}</span>
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              {степени.map((a) => (
                <span
                  key={a.id}
                  className={'medal' + (a.earned ? ' on' : '')}
                  title={
                    a.earned
                      ? пожалованы[a.id] ? `Пожаловано ${humanDate(пожалованы[a.id], true)}` : 'Пожаловано'
                      : a.left
                  }
                >
                  <span className="medal-deg">{'IV III II I'.split(' ')[4 - (a.degree ?? 4)] ?? 'IV'}</span>
                  {a.earned ? 'ст.' : `${Math.round(a.progress * 100)}%`}
                </span>
              ))}
            </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* -------------------------------------------------------- отличія */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><Icon name="check" size={14} /> Отличія</div>
        <div className="otlichiya">
          {отличія.map((a) => (
            <div key={a.id} className="otlichie">
              <Znak id={a.id} size={76} on={a.earned} hidden={!!a.secret && !a.earned} />
              <div className={'nm strong' + (a.earned ? '' : ' faint')}>
                {a.secret && !a.earned ? 'Тайное отличіе' : a.title}
              </div>
              <div className="faint small" style={{ lineHeight: 1.3, marginTop: 2 }}>
                {a.secret && !a.earned
                  ? 'откроется, когда сойдётся'
                  : a.earned
                    ? пожалованы[a.id] ? humanDate(пожалованы[a.id], true) : a.about
                    : a.left || a.about}
              </div>
              {/* Сколько пройдено. Невзятая награда без числа — просто серый
                  кружок; с числом видно, близко до неё или ещё нет. */}
              {!a.earned && !a.secret && a.progress > 0 && (
                <div className="znak-progress" title={`Пройдено ${Math.round(a.progress * 100)} %`}>
                  <span style={{ width: `${Math.min(100, Math.round(a.progress * 100))}%` }} />
                  <b>{Math.round(a.progress * 100)} %</b>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------------- званія */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><Icon name="tag" size={14} /> Званія</div>
        <div className="faint small" style={{ marginBottom: 10 }}>
          Даются за характеристику, доросшую до восьмидесяти. Нажмите, чтобы закрѣпить рядомъ съ чиномъ.
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {званія.map((t) => (
            <span
              key={t.key}
              className={'chip' + (data.honors?.pinned === t.title ? ' on' : '') + (t.earned ? '' : ' faint')}
              style={{ cursor: t.earned ? 'pointer' : 'default' }}
              onClick={() => t.earned && patchHonors({ pinned: data.honors?.pinned === t.title ? undefined : t.title })}
            >
              {t.title}{t.earned ? '' : ' — не заслужено'}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------- дѣла */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><Icon name="list" size={14} /> Что впереди</div>
        {дѣла.map((q) => (
          <div key={q.id} className="cat-row">
            <span className="name">
              {q.title}
              <span className="d faint small"> {q.about}</span>
            </span>
            {q.xp > 0 && <span className="amt num faint">+{q.xp}</span>}
          </div>
        ))}
        {!дѣла.length && <div className="empty">Ничего не намѣчено</div>}
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={() => app.openTab('tasks')}>Къ дѣламъ</button>
          <button className="btn ghost" onClick={() => app.openTab('advice')}>Къ совѣтамъ</button>
        </div>
      </div>

      {/* ------------------------------------------------------- лѣстница */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><Icon name="chart" size={14} /> Лѣстница чиновъ</div>
        {RANKS[branch].map((имя, i) => {
          const lvl = i + 1
          const тутъ = lvl === st.level
          return (
            <div key={имя} className={'cat-row' + (lvl > st.level ? ' faint' : '')} style={тутъ ? { fontWeight: 700 } : undefined}>
              <span className="gramota-class small" style={{ minWidth: 42 }}>
                {['XIV','XIII','XII','XI','X','IX','VIII','VII','VI','V','IV','III','II','I'][i]}
              </span>
              <span className="name">{имя}</span>
              <span className="amt num faint">
                {XP_STEPS[i].toLocaleString('ru-RU')}
              </span>
            </div>
          )
        })}
        <div className="faint small" style={{ marginTop: 10 }}>
          {plural(st.awarded, 'Пожалована', 'Пожаловано', 'Пожаловано')} {st.awarded}{' '}
          {plural(st.awarded, 'награда', 'награды', 'наградъ')}. Слѣдующая ближайшая —{' '}
          {st.nearest ? `${st.nearest.title}: ${st.nearest.left}` : 'всё уже получено'}.
        </div>
      </div>
    </div>
  )
}

const данныйТитулъ = (
  список: { title: string; earned: boolean }[],
  закрѣплённый?: string,
): string | null => (закрѣплённый && список.some((t) => t.title === закрѣплённый && t.earned) ? закрѣплённый : null)

/** Строка чина для правой панели: чинъ, доля до слѣдующаго и ближайшая награда. */
export function StandingLine() {
  const { data } = useStore()
  const app = useApp()
  const st = useMemo(() => standing(data), [data])
  return (
    <div className="card tight">
      <div className="card-title" style={{ marginBottom: 6 }}>Чинъ</div>
      <div className="strong" style={{ fontSize: 15 }}>{st.rank}</div>
      <div className="xp-bar"><span style={{ width: `${Math.round(st.progress * 100)}%` }} /></div>
      <div className="faint small">
        {st.awarded} изъ {st.awardsTotal} наградъ
        {st.nearest && ` · ближайшая: ${st.nearest.title}`}
      </div>
      <button className="btn sm" style={{ marginTop: 10, width: '100%' }} onClick={() => app.openTab('profile')}>
        Открыть грамоту
      </button>
    </div>
  )
}
