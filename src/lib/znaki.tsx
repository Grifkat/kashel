import React from 'react'
import georgiy from '../znaki/georgiy.jpg'
import petr from '../znaki/petr.jpg'
import lev from '../znaki/lev.png'
import mendeleev from '../znaki/mendeleev.jpg'
import lomonosov from '../znaki/lomonosov.jpg'
import medved from '../znaki/medved.png'
import suvorov from '../znaki/suvorov.jpg'
import tretyakov from '../znaki/tretyakov.jpg'
import pushkin from '../znaki/pushkin.jpg'
import kutuzov from '../znaki/kutuzov.jpg'
import nahimov from '../znaki/nahimov.png'
import olen from '../znaki/olen.png'
import oryol from '../znaki/oryol.png'
import andrey from '../znaki/andrey.jpg'
import ekaterina from '../znaki/ekaterina.jpg'
import orelbel from '../znaki/orelbel.jpg'
import speransky from '../znaki/speransky.jpg'
import kulibin from '../znaki/kulibin.jpg'
import dal from '../znaki/dal.jpg'
import krylov from '../znaki/krylov.jpg'
import vitte from '../znaki/vitte.jpg'
import ushakov from '../znaki/ushakov.jpg'
import derzhavin from '../znaki/derzhavin.jpg'
import aivazovsky from '../znaki/aivazovsky.jpg'
import kankrin from '../znaki/kankrin.jpg'
import demidov from '../znaki/demidov.jpg'
import nestor from '../znaki/nestor.jpg'
import nevsky from '../znaki/nevsky.jpg'
import stroganov from '../znaki/stroganov.jpg'
import morozov from '../znaki/morozov.png'
import mamontov from '../znaki/mamontov.jpg'
import ryabushinsky from '../znaki/ryabushinsky.jpg'
import kokorev from '../znaki/kokorev.jpg'
import bunge from '../znaki/bunge.jpg'
import soldatenkov from '../znaki/soldatenkov.jpg'
import sytin from '../znaki/sytin.jpg'
import ermak from '../znaki/ermak.jpg'
import stolypin from '../znaki/stolypin.jpg'
import dostoevsky from '../znaki/dostoevsky.jpg'

/*
 * Чеканные знаки къ наградамъ.
 *
 * Лица не рисованы: въ поле медали посаженъ подлинникъ — новгородская икона,
 * Крейцингеръ, Рѣпинъ, Миропольскій, Кипренскій, Доу, губернскіе гербы. Всё
 * общественное достояніе. Сходство отъ этого настоящее, а карикатурѣ взяться
 * неоткуда: лицо не выдумывается.
 *
 * Посадка не подбирается на глазъ, а считается. Для каждаго подлинника указано,
 * гдѣ въ пикселяхъ сидитъ лицо и какой оно высоты; отсюда однозначно выводятся
 * размѣръ и смѣщеніе фона — и лицо всегда выходитъ по центру круга.
 */

interface Подлинникъ {
  src: string
  /** Размѣръ исходника въ пикселяхъ. */
  w: number
  h: number
  /** Середина лица и его высота — тоже въ пикселяхъ исходника. */
  cx: number
  cy: number
  fh: number
  /** Какую долю поперечника медали лицо должно занять. */
  fill: number
  /**
   * Штриховой гербъ на свѣтломъ или прозрачномъ полѣ. Такой рисунокъ кладётся
   * умноженіемъ поверхъ золотого поля: свѣтлое уходитъ въ золото, тёмный
   * контуръ остаётся, и прямоугольникъ исходника пропадаетъ самъ собой.
   */
  light?: boolean
  /** Кто и когда написалъ — показываемъ въ подсказкѣ. */
  from: string
}

const П = (
  src: string, from: string, w: number, h: number,
  cx: number, cy: number, fh: number, fill: number, light?: boolean,
): Подлинникъ => ({ src, from, w, h, cx, cy, fh, fill, light })

/**
 * Знакъ у каждой награды свой. Ордена берутъ знакъ по имени лѣстницы, разовыя
 * отличія — по своему ключу.
 */
const ЗНАКИ: Record<string, Подлинникъ> = {
  anna: П(petr, 'ванъ деръ Верфъ, начало XVIII в.', 500, 558, 245, 100, 90, 0.60),
  george: П(georgiy, '«Чудо Георгія о змiѣ», Новгородъ, XV в.', 250, 331, 125, 150, 200, 0.90),
  vladimir: П(lev, 'Гербъ Владиміра, 1781', 500, 605, 250, 300, 590, 0.86, true),
  stanislav: П(mendeleev, 'Рѣпинъ, 1885', 330, 395, 150, 115, 140, 0.70),
  first_income: П(lomonosov, 'Миропольскій, 1787', 254, 409, 120, 130, 228, 0.74),
  plus_month: П(medved, 'Гербъ Ярославля, 1778', 174, 214, 95, 107, 160, 0.80, true),
  plus_three: П(suvorov, 'Крейцингеръ, 1799', 500, 652, 272, 212, 136, 0.72),
  diverse: П(tretyakov, 'Рѣпинъ, 1901', 500, 416, 300, 125, 120, 0.62),
  big_deal: П(pushkin, 'Кипренскій, 1827', 330, 384, 160, 125, 140, 0.70),
  goal_done: П(ermak, 'Парсуна, XVII в.', 346, 480, 168, 120, 105, 0.60),
  tasks50: П(nahimov, 'Портретъ, XIX в.', 500, 634, 250, 210, 379, 0.74),
  diverse5: П(ushakov, 'Бажановъ, 1912', 500, 738, 235, 168, 145, 0.62),
  no_debt: П(olen, 'Гербъ Нижняго Новгорода', 500, 655, 250, 330, 640, 0.86, true),
  year_million: П(oryol, 'Малый гербъ имперіи', 250, 303, 125, 150, 291, 0.86, true),
  // --- ордена, прибавленные вторымъ заходомъ
  andrew: П(andrey, 'Ѳедоръ Зубовъ, 1669', 500, 1050, 250, 152, 168, 0.62),
  catherine: П(ekaterina, 'Левицкій', 500, 647, 255, 130, 170, 0.62),
  eagle: П(orelbel, 'Знакъ ордена Бѣлаго орла', 500, 944, 235, 204, 253, 0.80),
  // --- отличія за дѣйствіе
  receipt10: П(speransky, 'Тропининъ', 500, 639, 210, 122, 125, 0.62),
  split_first: П(kulibin, 'Веденецкій, около 1818', 500, 630, 320, 165, 165, 0.66),
  streak30: П(dal, 'Перовъ, 1872', 500, 577, 235, 200, 195, 0.68),
  inbox_zero: П(stolypin, 'Рѣпинъ, 1910', 500, 766, 268, 215, 150, 0.62),
  // --- долговая вѣтка
  debt_closed: П(krylov, 'Брюлловъ, 1839', 500, 604, 265, 222, 155, 0.64),
  debt_all_closed: П(sytin, 'Портретъ, начало XX в.', 465, 550, 240, 155, 130, 0.62),
  clean_month: П(derzhavin, 'Боровиковскій, 1795', 500, 611, 262, 145, 130, 0.62),
  pomodoro100: П(aivazovsky, 'Автопортретъ, 1874', 500, 549, 235, 235, 200, 0.66),
  debt_falling: П(kankrin, 'Ботманъ, 1872', 500, 693, 268, 205, 105, 0.58),
  // --- вѣхи мѣсячнаго заработка: русскіе промышленники и купцы
  month300: П(stroganov, 'мастерская Рослина', 500, 610, 240, 180, 175, 0.64),
  month500: П(morozov, 'Фотографія, XIX в.', 500, 527, 235, 165, 180, 0.66),
  month700: П(mamontov, 'Рѣпинъ, 1879', 500, 638, 225, 175, 180, 0.66),
  month900: П(ryabushinsky, 'Дункерсъ, 1880', 500, 655, 250, 155, 130, 0.62),
  month1000: П(kokorev, 'Тюринъ, 1889', 500, 637, 268, 190, 130, 0.62),
  // --- накопленія
  save_first: П(vitte, 'Портретъ, начало XX в.', 500, 719, 195, 150, 110, 0.60),
  save_cushion: П(kutuzov, 'Доу, 1829', 500, 864, 260, 327, 70, 0.58),
  save_rate: П(bunge, 'Тюринъ, 1887', 500, 610, 245, 190, 150, 0.64),
  save_growth: П(soldatenkov, 'Портретъ, XIX в.', 500, 612, 245, 210, 190, 0.66),
  // --- орденъ Св. Александра Невскаго
  nevsky: П(nevsky, 'Боровиковскій', 500, 652, 270, 120, 78, 0.55),
  // --- тайныя: знакъ открывается только вмѣстѣ съ наградой
  round_sum: П(demidov, 'Портретъ, XVIII в.', 500, 631, 245, 165, 165, 0.64),
  archive_day: П(nestor, 'Гравюра Соколова', 500, 765, 250, 305, 115, 0.60),
  comeback: П(dostoevsky, 'Перовъ, 1872', 500, 623, 255, 215, 160, 0.66),
}

/*
 * Цвѣтъ въ знакахъ — признакъ, а не украшеніе.
 *
 * У каждаго ордена Россійской имперіи была своя лента; она и легла кольцомъ
 * вокругъ медальона. Четыре ленты красныя и различаются каймой — ровно такъ
 * они различались на колодкѣ, и спутать ихъ, глядя на полосы, нельзя.
 *
 * Разовыя отличія лентъ не имѣли, ихъ раздѣляетъ металлъ: за что дано, изъ
 * того и отчеканено. Портретъ въ полѣ окрашенъ въ тотъ же металлъ, поэтому
 * набор остаётся наборомъ, а не разсыпается въ мозаику.
 */

/** Полосы поперёкъ — какъ на орденской лентѣ. */
const полосы = (...цвета: string[]) => {
  const шагъ = 100 / цвета.length
  return `repeating-linear-gradient(90deg, ${цвета
    .map((c, i) => `${c} ${(i * шагъ).toFixed(2)}%, ${c} ${((i + 1) * шагъ).toFixed(2)}%`)
    .join(', ')})`
}

const ЛЕНТЫ: Record<string, { ribbon: string; name: string }> = {
  andrew: { ribbon: 'linear-gradient(90deg,#7fb3e0,#4b86c2 50%,#7fb3e0)', name: 'небесно-голубая' },
  george: { ribbon: полосы('#1c1a17', '#e08a2a', '#1c1a17', '#e08a2a', '#1c1a17'), name: 'чёрно-оранжевая' },
  vladimir: { ribbon: полосы('#1c1a17', '#b4322e', '#1c1a17'), name: 'чёрно-красная' },
  anna: { ribbon: полосы('#e0b44a', '#c8322b', '#c8322b', '#c8322b', '#e0b44a'), name: 'красная съ жёлтой каймой' },
  stanislav: { ribbon: полосы('#e8e2d6', '#c8322b', '#c8322b', '#c8322b', '#e8e2d6'), name: 'красная съ бѣлой каймой' },
  catherine: { ribbon: полосы('#cfd6dc', '#a8283a', '#a8283a', '#a8283a', '#cfd6dc'), name: 'красная съ серебряной каймой' },
  eagle: { ribbon: 'linear-gradient(90deg,#3a63a8,#22407a 50%,#3a63a8)', name: 'тёмно-синяя' },
  nevsky: { ribbon: 'linear-gradient(90deg,#d0433a,#a3241f 50%,#d0433a)', name: 'красная' },
}

export type Металлъ = 'gold' | 'silver' | 'copper' | 'steel'

/** Металлъ разового отличія. Всё, что не названо здѣсь, — золото. */
const МЕТАЛЛЪ: Record<string, Металлъ> = {
  // серебро — за порядокъ и дѣла
  clean_month: 'silver', streak30: 'silver', receipt10: 'silver', split_first: 'silver',
  pomodoro100: 'silver', inbox_zero: 'silver', tasks50: 'silver', goal_done: 'silver',
  // серебро же — накопленія: отложенное родня порядку, а не заработку
  save_first: 'silver', save_cushion: 'silver', save_rate: 'silver', save_growth: 'silver',
  // мѣдь — за сведённые долги
  debt_closed: 'copper', debt_all_closed: 'copper', debt_falling: 'copper', no_debt: 'copper',
  // воронёная сталь — тайныя
  round_sum: 'steel', archive_day: 'steel', comeback: 'steel',
}

/**
 * Ключъ знака. У ордена id — «anna3», «george1» и прочіе: степень на знакъ не
 * влiяетъ, поэтому цифру отбрасываемъ.
 */
const ключъ = (id: string) => (ЗНАКИ[id] ? id : id.replace(/\d+$/, ''))

/** Тотъ же ключъ наружу: разделъ «Кто на знакахъ» сводитъ по нему награды. */
export const ключъЗнака = ключъ

/** Есть ли у награды свой знакъ. */
export const знакъЕсть = (id: string) => ключъ(id) in ЗНАКИ

/** Есть ли знакъ у каждой награды — провѣряется самопровѣркой. */
export const ВСЕ_ЗНАКИ = ЗНАКИ

interface Посадка {
  bg: string
  pos: string
  /**
   * Подлинникъ уже круга — край легъ бы прямоугольнымъ швомъ. Такой знакъ
   * растворяемъ по краю маской.
   */
  soft: boolean
}

function посадка(п: Подлинникъ): Посадка {
  const соотн = п.w / п.h
  const ширина = (п.fill * соотн) / (п.fh / п.h)
  const высота = ширина / соотн
  const x = (0.5 - (п.cx / п.w) * ширина) / (1 - ширина)
  const y = (0.5 - (п.cy / п.h) * высота) / (1 - высота)
  return {
    bg: (ширина * 100).toFixed(1) + '%',
    pos: (x * 100).toFixed(1) + '% ' + (y * 100).toFixed(1) + '%',
    soft: ширина < 1 || высота < 1,
  }
}

const ПОСАДКИ = new Map<string, Посадка>()
for (const [k, п] of Object.entries(ЗНАКИ)) ПОСАДКИ.set(k, посадка(п))

export interface ZnakProps {
  /** Ключъ награды: «george2», «first_income» и прочіе. */
  id: string
  /** Поперечникъ въ пикселяхъ. */
  size: number
  /** Пожаловано — бронза со свѣтомъ; нѣтъ — та же чеканка, остывшая до чугуна. */
  on: boolean
  /**
   * Тайное отличіе, ещё не сошедшееся: вмѣсто лица — силуэтъ. Раскрывать его
   * заранѣе нельзя, иначе тайны не остаётся вовсе.
   */
  hidden?: boolean
  title?: string
}

/**
 * Чеканный медальонъ. Объёмъ собранъ слоями, какъ на настоящей медали: рантъ со
 * свѣтовымъ градіентомъ, тѣнь подъ нимъ, утопленное поле съ внутренней фаской и
 * косой бликъ. Подъ портретомъ лежитъ размытая копія той же картины — иначе
 * лицо, посаженное цѣликомъ, упиралось бы въ пустые края круга.
 */
export function Znak({ id, size, on, hidden, title }: ZnakProps) {
  const k = ключъ(id)
  const п = hidden ? null : ЗНАКИ[k] ?? null
  const с = ПОСАДКИ.get(k) ?? null
  const лента = ЛЕНТЫ[k]
  const металлъ = МЕТАЛЛЪ[k] ?? 'gold'
  const своя = [п?.from, лента && `лента ${лента.name}`].filter(Boolean).join(' · ')
  const подпись = hidden ? 'Тайное отличіе' : title ?? (своя || undefined)
  return (
    <span
      className={
        'znak m-' + металлъ + (лента ? ' with-ribbon' : '') +
        (on ? '' : ' cold') + (hidden ? ' secret' : '')
      }
      style={{ width: size, height: size }}
      title={подпись}
      aria-hidden
    >
      {лента && <span className="ribbon" style={{ background: лента.ribbon }} />}
      <span className="rim" />
      <span className="seat">
        {п && (
          <>
            <span
              className="fill"
              style={
                п.light
                  ? { background: 'radial-gradient(circle at 42% 34%, #f3e6bd, #c8ab63 62%, #8d7431)' }
                  : { backgroundImage: `url(${п.src})` }
              }
            />
            <span
              className={'face' + (п.light ? ' blend soft' : с?.soft ? ' soft' : '')}
              style={{ backgroundImage: `url(${п.src})`, backgroundSize: с?.bg, backgroundPosition: с?.pos }}
            />
          </>
        )}
      </span>
      <span className="lip" />
      <span className="shine" />
    </span>
  )
}
