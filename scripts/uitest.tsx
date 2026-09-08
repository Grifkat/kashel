// Проверка интерфейса в jsdom: разделы открываются без ошибок рендера,
// массовое удаление удаляет ровно то, что обещает, и возвращается назад.
// Запуск: npm run uitest
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/App'
import { StoreProvider } from '../src/state/store'
import { ToastProvider } from '../src/components/ui'
import { buildSeed, seedCanvas, seedNotes } from './fixture'
import { THEMES } from '../src/lib/themes'
import { Boundary } from '../src/components/Boundary'
import { applyArchive, archiveText, buildArchive, parseArchive } from '../src/engine/archive'
import { bridge, listCanvases, listNotes, loadVault, readCanvas, saveCore, saveTransactions, writeCanvas } from '../src/state/vault'
import { Obnovlenie, попроситьПроверку } from '../src/components/Obnovlenie'
import { addMonths, endOfMonth, humanDate, MONTHS_SHORT, parseISO, relDate, today } from '../src/lib/date'
import type { VaultData } from '../src/lib/types'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const g = globalThis as any
g.window = dom.window
g.document = dom.window.document
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true })
g.HTMLElement = dom.window.HTMLElement
g.SVGElement = dom.window.SVGElement
g.Node = dom.window.Node
g.Event = dom.window.Event
g.MouseEvent = dom.window.MouseEvent
g.KeyboardEvent = dom.window.KeyboardEvent
g.localStorage = dom.window.localStorage
g.requestAnimationFrame = (cb: any) => setTimeout(() => cb(Date.now()), 16)
g.cancelAnimationFrame = (id: any) => clearTimeout(id)
class ResizeObserverStub {
  constructor(private cb: any) {}
  observe() { this.cb([]) }
  unobserve() {}
  disconnect() {}
}
g.ResizeObserver = ResizeObserverStub
// jsdom ничего не прокручиваетъ; безъ заглушки лента бесѣды роняетъ отрисовку.
dom.window.Element.prototype.scrollIntoView = function () {}
;(dom.window as any).ResizeObserver = ResizeObserverStub

// Управляемая заглушка matchMedia: нужна, чтобы проверить поведение при
// системной просьбе «уменьшить движение» (в Windows — выключенные эффекты).
let systemReduced = false
const mqListeners = new Set<(e: { matches: boolean }) => void>()
;(dom.window as any).matchMedia = (query: string) => ({
  media: query,
  get matches() {
    return query.includes('prefers-reduced-motion') ? systemReduced : false
  },
  onchange: null,
  addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => mqListeners.add(cb),
  removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => mqListeners.delete(cb),
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})
const setSystemReduced = (v: boolean) => {
  systemReduced = v
  for (const cb of mqListeners) cb({ matches: v })
}

/**
 * Программа больше не создаёт демо-данные сама, поэтому хранилище для теста
 * наполняем оснасткой напрямую — заодно проверяется загрузка готового vault.
 */
function seedStorage() {
  const data = buildSeed()
  const { transactions, ...core } = data
  const ls = dom.window.localStorage
  ls.clear()
  ls.setItem('kashel:data.json', JSON.stringify(core))
  const byMonth = new Map<string, typeof transactions>()
  for (const t of transactions) {
    const mk = t.date.slice(0, 7)
    const arr = byMonth.get(mk) || []
    arr.push(t)
    byMonth.set(mk, arr)
  }
  for (const [mk, list] of byMonth) ls.setItem(`kashel:transactions/${mk}.json`, JSON.stringify(list))
  for (const [title, body] of Object.entries(seedNotes())) ls.setItem(`kashel:notes/${title}.md`, body)
  ls.setItem('kashel:canvas/Схема финансов.canvas', JSON.stringify(seedCanvas(data)))
}

const renderErrors: string[] = []
// Шум среды, а не приложения: jsdom не реализует canvas, а React при
// программной установке значения поля лезет в полифил событий для древнего IE.
const ENV_NOISE = /Not implemented:|getContext|attachEvent|detachEvent|InputEventPolyfill/
/**
 * Намеренное падение объявляется заранее и по имени конкретного компонента.
 * Расширять ENV_NOISE под это нельзя: она действует на весь прогон и ослепила
 * бы проверку к настоящим регрессам навсегда.
 */
let expecting: RegExp | null = null
const expected: string[] = []
console.error = (...a: any[]) => {
  const line = a.map((x) => (x instanceof Error ? x.stack : String(x))).join(' ')
  if (ENV_NOISE.test(line)) return
  if (expecting && expecting.test(line)) {
    expected.push(line)
    return
  }
  renderErrors.push(line)
}

async function withExpectedCrash(re: RegExp, body: () => Promise<void>) {
  expected.length = 0
  expecting = re
  try {
    await body()
  } finally {
    expecting = null
  }
}

// Без границ настоящий крах отрисовки убивал node до печати итога, и все
// проверки ниже точки падения становились мёртвым кодом.
process.on('uncaughtException', (e) => renderErrors.push('НЕПОЙМАННОЕ: ' + (e as Error).message))

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const text = () => (document.body.textContent || '').replace(/\s+/g, ' ')
const click = (el: any) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
const mouse = (el: any, type: string, x: number, y: number, opts: Record<string, unknown> = {}) =>
  el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, ...opts }))
const key = (k: string, opts: Record<string, unknown> = {}) =>
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
const all = (sel: string) => [...document.querySelectorAll(sel)]
const menuItem = (label: string) =>
  all('.ctx-menu .ctx-item').find((b) => (b.textContent || '').includes(label)) as any
const byText = (sel: string, needle: string) =>
  [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').includes(needle)) as any

const fails: string[] = []
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fails.push(name)
}

/** Количество операций из строки состояния — единственный надёжный счётчик. */
const totalOps = () => {
  const bar = (document.querySelector('.statusbar')?.textContent || '').replace(/\s+/g, ' ')
  const m = bar.match(/(\d+) операций/)
  return m ? Number(m[1]) : -1
}
const countIn = (btn: any) => {
  const m = (btn?.textContent || '').match(/\((\d+)\)/)
  return m ? Number(m[1]) : 0
}
const open = async (section: string) => {
  const btn = [...document.querySelectorAll('.nav-item')].find((b) =>
    (b.textContent || '').trim().startsWith(section),
  )
  if (!btn) throw new Error('нет раздела ' + section)
  click(btn)
  await wait(450)
}

async function sections() {
  console.log('\n— разделы —')
  const names = [
    'Дашборд', 'Операции', 'Счета', 'Категории', 'Бюджет', 'Цели',
    'Задачи', 'Грамота', 'Регулярные', 'Напоминания', 'Долги и кредиты', 'Прогноз', 'Календарь', 'Итоги года', 'Советы',
    'Канвас', 'Заметки', 'Граф', 'Импорт', 'Настройки',
  ]
  for (const n of names) {
    const before = renderErrors.length
    await open(n)
    check(n, renderErrors.length === before && text().length > 400)
  }
}

async function dashboardWipe() {
  console.log('\n— очистка на дашборде —')
  await open('Дашборд')
  const start = totalOps()

  const expBtn = byText('.btn.danger', 'Удалить все расходы')
  const incBtn = byText('.btn.danger', 'Удалить весь заработок')
  check('кнопка расходов на месте', !!expBtn, (expBtn?.textContent || '').trim())
  check('кнопка заработка на месте', !!incBtn, (incBtn?.textContent || '').trim())

  const expCount = countIn(expBtn)
  const incCount = countIn(incBtn)
  check('обе кнопки со своими счётчиками', expCount > 0 && incCount > 0 && expCount !== incCount,
    `расходы ${expCount}, заработок ${incCount}`)
  check('подпись объясняет охват', /Действует на .*Кнопки независимы/.test(text()))

  // Удаляем заработок.
  click(incBtn)
  await wait(350)
  check('подтверждение предупреждает про прогноз', text().includes('норма сбережений и советы считаются от дохода'))
  click(byText('.modal-foot .btn.primary', 'Удалить'))
  await wait(700)

  check('заработок удалён', totalOps() === start - incCount, `${start} → ${totalOps()}, ждали −${incCount}`)
  const expAfter = countIn(byText('.btn.danger', 'Удалить все расходы'))
  check('расходы не тронуты', expAfter === expCount, `${expAfter} против ${expCount}`)
  check('кнопка заработка обнулилась', !countIn(byText('.btn.danger', 'Удалить весь заработок')))

  click(byText('.seg button', 'Доходы'))
  await wait(400)
  check('бублик доходов опустел', text().includes('В этот период доходов не было'))
  click(byText('.seg button', 'Расходы'))
  await wait(300)

  // Возвращаем.
  const undoBtn = byText('.btn', 'Вернуть')
  check('появилась отмена', !!undoBtn, (undoBtn?.textContent || '').trim())
  click(undoBtn)
  await wait(700)
  check('заработок вернулся', totalOps() === start, `${totalOps()}, было ${start}`)

  // Смена периода пересчитывает охват.
  const before = countIn(byText('.btn.danger', 'Удалить все расходы'))
  click(byText('.seg button', 'Год'))
  await wait(500)
  const after = countIn(byText('.btn.danger', 'Удалить все расходы'))
  check('счётчик следует за периодом', after > before, `месяц ${before} → год ${after}`)
  click(byText('.seg button', 'Месяц'))
  await wait(400)
}

async function cardGlare() {
  console.log('\n— блик на карточках —')
  await open('Счета')
  check('карточки счетов с бликом', document.querySelectorAll('.card.fx-glare').length > 0,
    String(document.querySelectorAll('.card.fx-glare').length))
  await open('Категории')
  check('карточки категорий с бликом', document.querySelectorAll('.card.fx-glare').length > 0,
    String(document.querySelectorAll('.card.fx-glare').length))
}

/**
 * Канвас: главное — стрелка, отпущенная на пустом месте, должна предлагать
 * создать карточку, а клик по связи — выделять её, а не удалять.
 */
async function canvasBoard() {
  console.log('\n— канвас —')
  await open('Канвас')
  await wait(600)

  const nodes = () => all('.cnode').length
  const edges = () => all('.cv-hit').length
  const wrap = () => document.querySelector('.canvas-wrap') as any
  check('доска загрузилась', nodes() > 0 && edges() > 0, `${nodes()} узлов, ${edges()} связей`)

  // Мир → экран: getBoundingClientRect в jsdom нулевой, поэтому смещение известно.
  const V = { x: 420, y: 260, k: 0.9 }
  const toScreen = (wx: number, wy: number) => ({ x: wx * V.k + V.x, y: wy * V.k + V.y })

  // --- клик по связи выделяет, а не удаляет
  const edgesBefore = edges()
  const hit = all('.cv-hit')[0] as any
  mouse(hit, 'mousedown', 300, 300)
  mouse(dom.window, 'mouseup', 300, 300)
  await wait(250)
  check('клик по связи её не удалил', edges() === edgesBefore, `${edgesBefore} → ${edges()}`)
  check('появилась панель связи', !!document.querySelector('.edge-bar'))

  // --- подпись связи
  const labelInput = document.querySelector('.edge-bar input') as any
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(labelInput, 'проверка')
  labelInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  await wait(300)
  check('подпись связи сохранилась', (document.querySelector('.edge-bar input') as any)?.value === 'проверка')

  // --- удаление связи и отмена
  key('Delete')
  await wait(300)
  check('связь удалена по Delete', edges() === edgesBefore - 1, `${edges()}`)
  key('z', { ctrlKey: true })
  await wait(300)
  check('Ctrl+Z вернул связь', edges() === edgesBefore, `${edges()}`)

  // --- стрелка на пустое место предлагает меню
  const nodesBefore = nodes()
  const handle = document.querySelector('.cnode .cnode-handle.h-right') as any
  check('у карточки есть манипулятор связи', !!handle)
  mouse(handle, 'mousedown', 100, 100)
  const empty = toScreen(1200, 800)
  mouse(dom.window, 'mousemove', empty.x, empty.y)
  await wait(80)
  check('тянется призрачная связь', !!document.querySelector('.cv-ghost'))
  mouse(dom.window, 'mouseup', empty.x, empty.y)
  await wait(250)

  check('на пустом месте открылось меню', !!document.querySelector('.ctx-menu'))
  check('меню объясняет, что произойдёт', text().includes('Что здесь создать?'))
  for (const label of ['Текстовая карточка', 'Заметка из хранилища', 'Счёт', 'Категория', 'Цель', 'Блок-запрос']) {
    check(`  пункт «${label}»`, !!menuItem(label))
  }

  click(menuItem('Текстовая карточка'))
  await wait(350)
  check('карточка создана', nodes() === nodesBefore + 1, `${nodesBefore} → ${nodes()}`)
  check('и сразу соединена стрелкой', edges() === edgesBefore + 1, `${edgesBefore} → ${edges()}`)
  key('Escape')
  await wait(200)

  // --- отмена создания
  key('z', { ctrlKey: true })
  await wait(300)
  check('Ctrl+Z отменил создание карточки', nodes() === nodesBefore, `${nodes()}`)
  key('y', { ctrlKey: true })
  await wait(300)
  check('Ctrl+Y вернул её', nodes() === nodesBefore + 1, `${nodes()}`)

  // --- оформление карточек
  const styleBtn = (name: string) =>
    all('.canvas-tools .seg button').find((b) => (b.textContent || '').trim() === name) as any
  click(styleBtn('Как в Obsidian'))
  await wait(300)
  check('стиль «Как в Obsidian» применился', all('.cnode-minimal').length > 0, String(all('.cnode-minimal').length))
  click(styleBtn('Плашки'))
  await wait(300)
  check('стиль «Плашки» применился', all('.cnode-flat').length > 0)
  click(styleBtn('Полные'))
  await wait(300)
  check('стиль «Полные» вернулся', all('.cnode-rich').length > 0)

  // --- рамка выделения
  const a = toScreen(-800, -400)
  const b = toScreen(900, 700)
  mouse(wrap(), 'mousedown', a.x, a.y)
  mouse(dom.window, 'mousemove', (a.x + b.x) / 2, (a.y + b.y) / 2)
  await wait(60)
  check('рамка выделения рисуется', !!document.querySelector('.cv-marquee'))
  mouse(dom.window, 'mousemove', b.x, b.y)
  mouse(dom.window, 'mouseup', b.x, b.y)
  await wait(300)
  const selected = all('.cnode.sel').length
  check('рамка выделила несколько узлов', selected > 1, String(selected))

  // --- копирование и вставка
  const beforePaste = nodes()
  key('c', { ctrlKey: true })
  await wait(150)
  key('v', { ctrlKey: true })
  await wait(350)
  check('вставка добавила копии', nodes() === beforePaste + selected, `${beforePaste} → ${nodes()}`)
  key('z', { ctrlKey: true })
  await wait(300)
  check('вставку можно отменить', nodes() === beforePaste, String(nodes()))

  // --- правый клик по узлу
  const node = document.querySelector('.cnode') as any
  node.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 }))
  await wait(250)
  check('правый клик по карточке открыл меню', !!document.querySelector('.ctx-menu'))
  check('в меню есть «Удалить»', !!menuItem('Удалить'))
  key('Escape')
  await wait(200)

  // --- правый клик по полотну
  wrap().dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 400, clientY: 400 }))
  await wait(250)
  check('правый клик по полотну открыл меню', !!menuItem('Добавить'))
  key('Escape')
  await wait(200)

  // --- регрессия: клик по пустому месту снимает выделение
  // Событие отправляем на слой связей — в браузере именно он лежит сверху,
  // и раньше он молча съедал все клики по фону.
  const overlay = document.querySelector('.canvas-edges') as any
  const dots = document.querySelector('.canvas-dots') as any
  const someCard = document.querySelector('.cnode') as any
  mouse(someCard, 'mousedown', 300, 300)
  mouse(dom.window, 'mouseup', 300, 300)
  await wait(200)
  check('карточка выделилась кликом', all('.cnode.sel').length === 1, String(all('.cnode.sel').length))

  mouse(overlay, 'mousedown', 900, 640)
  mouse(dom.window, 'mouseup', 900, 640)
  await wait(250)
  check('клик по фону снял выделение', all('.cnode.sel').length === 0, String(all('.cnode.sel').length))

  // и то же самое через слой точек
  mouse(someCard, 'mousedown', 300, 300)
  mouse(dom.window, 'mouseup', 300, 300)
  await wait(150)
  mouse(dots, 'mousedown', 910, 650)
  mouse(dom.window, 'mouseup', 910, 650)
  await wait(250)
  check('клик по сетке тоже снимает выделение', all('.cnode.sel').length === 0)

  // выделенная связь тоже сбрасывается кликом по фону
  mouse(all('.cv-hit')[0] as any, 'mousedown', 300, 300)
  mouse(dom.window, 'mouseup', 300, 300)
  await wait(200)
  check('связь выделена', !!document.querySelector('.edge-bar'))
  mouse(overlay, 'mousedown', 900, 640)
  mouse(dom.window, 'mouseup', 900, 640)
  await wait(250)
  check('клик по фону снял выделение связи', !document.querySelector('.edge-bar'))

  // двойной клик по фону создаёт карточку
  const beforeDbl = nodes()
  overlay.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, clientX: 1000, clientY: 700 }))
  await wait(300)
  check('двойной клик по фону создал карточку', nodes() === beforeDbl + 1, `${beforeDbl} → ${nodes()}`)
  key('Escape')
  await wait(150)
  key('z', { ctrlKey: true })
  await wait(250)

  // --- снятие выделения кликом по пустому фону
  const anyCard = document.querySelector('.cnode') as any
  mouse(anyCard, 'mousedown', 300, 300)
  mouse(dom.window, 'mouseup', 300, 300)
  await wait(250)
  check('клик по карточке выделил её', all('.cnode.sel').length === 1, String(all('.cnode.sel').length))

  const bgPoint = toScreen(1400, 950)
  mouse(wrap(), 'mousedown', bgPoint.x, bgPoint.y)
  mouse(dom.window, 'mouseup', bgPoint.x, bgPoint.y)
  await wait(250)
  check('клик по пустому фону снял выделение', all('.cnode.sel').length === 0, String(all('.cnode.sel').length))

  /*
   * Ключевая регрессия. В браузере клик по пустому месту приходит не на само
   * полотно, а на прозрачные слои поверх него — слой связей и слой карточек.
   * Раньше обработчик признавал фоном только само полотно и молча выходил,
   * поэтому выделение не снималось никогда.
   */
  for (const layer of ['.canvas-edges', '.canvas-layer']) {
    mouse(document.querySelector('.cnode'), 'mousedown', 300, 300)
    mouse(dom.window, 'mouseup', 300, 300)
    await wait(200)
    const target = document.querySelector(layer) as any
    mouse(target, 'mousedown', bgPoint.x, bgPoint.y)
    mouse(dom.window, 'mouseup', bgPoint.x, bgPoint.y)
    await wait(220)
    check(`клик сквозь слой ${layer} снимает выделение`, all('.cnode.sel').length === 0,
      String(all('.cnode.sel').length))
  }

  // то же самое для выделенной связи
  const anyEdge = all('.cv-hit')[0] as any
  mouse(anyEdge, 'mousedown', 320, 320)
  mouse(dom.window, 'mouseup', 320, 320)
  await wait(250)
  check('связь выделяется кликом', !!document.querySelector('.edge-bar'))
  mouse(wrap(), 'mousedown', bgPoint.x, bgPoint.y)
  mouse(dom.window, 'mouseup', bgPoint.x, bgPoint.y)
  await wait(250)
  check('клик по фону убрал панель связи', !document.querySelector('.edge-bar'))

  // --- перетаскивание карточки
  const card = document.querySelector('.cnode') as any
  const posOf = (el: any) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })
  const p0 = posOf(card)
  mouse(card, 'mousedown', 500, 500)
  mouse(dom.window, 'mousemove', 680, 590)
  mouse(dom.window, 'mouseup', 680, 590)
  await wait(300)
  const p1 = posOf(document.querySelector('.cnode') as any)
  check('карточка переехала', p1.x !== p0.x || p1.y !== p0.y, `(${p0.x},${p0.y}) → (${p1.x},${p1.y})`)
  // Доска открывается на 100 %, поэтому мышь и карточка ходят один в один.
  // Раньше стартовый масштаб был 0.9, и здесь ждали 200 вместо 180.
  check('сдвиг соответствует движению мыши', Math.abs(p1.x - p0.x - 180) <= 10, String(p1.x - p0.x))
  key('z', { ctrlKey: true })
  await wait(300)
  const p2 = posOf(document.querySelector('.cnode') as any)
  check('перемещение отменяется', p2.x === p0.x && p2.y === p0.y, `(${p2.x},${p2.y})`)

  // --- изменение размера за каждый из четырёх углов
  const first = () => document.querySelector('.cnode') as any
  const rectOf = (el: any) => ({
    x: parseFloat(el.style.left), y: parseFloat(el.style.top),
    w: parseFloat(el.style.width), h: parseFloat(el.style.height),
  })
  check('у карточки четыре угла', all('.cnode .cnode-resize').length >= 4 * nodes() / nodes(),
    String(first().querySelectorAll('.cnode-resize').length))

  for (const [corner, expect] of [
    ['se', 'ширина и высота растут'],
    ['nw', 'левый верхний тянет за собой начало'],
    ['ne', 'правый верхний'],
    ['sw', 'левый нижний'],
  ] as const) {
    const before = rectOf(first())
    const h = first().querySelector('.cnode-resize.r-' + corner) as any
    mouse(h, 'mousedown', 500, 500)
    mouse(dom.window, 'mousemove', 560, 560)
    mouse(dom.window, 'mouseup', 560, 560)
    await wait(250)
    const after = rectOf(first())
    const changed = after.w !== before.w || after.h !== before.h || after.x !== before.x || after.y !== before.y
    check(`угол ${corner}: ${expect}`, changed,
      `${before.w}×${before.h} @${before.x},${before.y} → ${after.w}×${after.h} @${after.x},${after.y}`)
    key('z', { ctrlKey: true })
    await wait(200)
  }

  // --- изменения переживают переоткрытие доски
  const nodesNow = nodes()
  const edgesNow = edges()
  await open('Дашборд')
  await wait(300)
  await open('Канвас')
  await wait(700)
  check('доска перечитана с диска без потерь', nodes() === nodesNow && edges() === edgesNow,
    `${nodes()} узлов, ${edges()} связей — было ${nodesNow}/${edgesNow}`)

  // --- удаление доски
  const dropBtn = all('.canvas-tools .icon-btn').find((b) => b.getAttribute('title') === 'Удалить доску') as any
  check('кнопка удаления доски есть', !!dropBtn)
  click(dropBtn)
  await wait(250)
  check('удаление доски спрашивает подтверждение', text().includes('Файл доски исчезнет'))
  const cancel = all('.modal-foot .btn').find((b) => (b.textContent || '').includes('Отмена')) as any
  click(cancel)
  await wait(250)
  check('отмена сохраняет доску', nodes() === nodesNow)
}

/** Форматирование текста, подгонка размера и палитра карточек. */
async function canvasText() {
  console.log('\n— текст и цвет карточек —')
  await open('Канвас')
  await wait(600)

  const textCard = all('.cnode').find((c) => c.className.includes('cnode-t-text')) as any
  check('текстовая карточка на доске есть', !!textCard)
  textCard.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, clientX: 400, clientY: 400 }))
  await wait(300)

  const area = () => document.querySelector('.cnode-edit') as any
  check('двойной клик открыл правку', !!area())
  check('появилась панель форматирования', !!document.querySelector('.text-toolbar'))

  const ttBtn = (title: string) =>
    all('.text-toolbar .tt-btn').find((b) => (b.getAttribute('title') || '').startsWith(title)) as any
  for (const t of ['Заголовок', 'Жирный', 'Курсив', 'Подчёркнутый', 'Список', 'Ссылка на заметку']) {
    check(`  кнопка «${t}»`, !!ttBtn(t))
  }

  // Ставим курсор в конец и жмём «Жирный».
  const before = area().value
  area().setSelectionRange(before.length, before.length)
  click(ttBtn('Жирный'))
  await wait(250)
  check('кнопка «Жирный» вставила разметку', area().value.includes('**текст**'),
    JSON.stringify(area().value.slice(-14)))

  // Заголовок применяется к строке целиком.
  click(ttBtn('Заголовок'))
  await wait(250)
  check('кнопка «Заголовок» добавила решётку', /(^|\n)# /.test(area().value))

  // Размер шрифта.
  const sizeNow = () => Number((document.querySelector('.tt-size') as any)?.textContent)
  const s0 = sizeNow()
  click(ttBtn('Крупнее'))
  await wait(200)
  check('шрифт увеличивается', sizeNow() === s0 + 1, `${s0} → ${sizeNow()}`)
  click(ttBtn('Мельче'))
  await wait(200)
  check('шрифт уменьшается', sizeNow() === s0, String(sizeNow()))

  // Режим подгонки.
  const fitSel = document.querySelector('.text-toolbar select') as any
  check('переключатель поведения текста есть', !!fitSel)
  const setSelect = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!
  setSelect.call(fitSel, 'shrink')
  fitSel.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await wait(300)
  key('Escape')
  await wait(300)
  check('режим «вписывать» отключил прокрутку', !!document.querySelector('.cnode-scroll.no-scroll'),
    String(all('.cnode-scroll.no-scroll').length))
  // Возвращаем обычный режим, чтобы прогон был повторяемым.
  const again = all('.cnode').find((c) => c.className.includes('cnode-t-text')) as any
  again.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, clientX: 400, clientY: 400 }))
  await wait(300)
  const sel2 = document.querySelector('.text-toolbar select') as any

  setSelect.call(sel2, 'fixed')
  sel2.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await wait(250)

  key('Escape')
  await wait(250)
  check('Escape закрыл правку', !document.querySelector('.text-toolbar'))

  /*
   * Подгонка работает в режиме просмотра, а не правки: пока карточка
   * редактируется, на экране поле ввода. Поэтому режим ставим через меню.
   * Режим «растить» меряет содержимое и просит новую высоту — при неверном
   * сравнении это зациклило бы перерисовку, и React ругнулся бы на глубину
   * обновлений. Проверяем именно это.
   */
  const textNode = () => all('.cnode').find((c) => c.className.includes('cnode-t-text')) as any
  const setFit = async (label: string) => {
    textNode().dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 350, clientY: 350 }))
    await wait(220)
    click(menuItem('Поведение текста'))
    await wait(200)
    click(menuItem(label))
    await wait(500)
  }

  const errorsBefore = renderErrors.length
  await setFit('Растить карточку')
  check('режим «растить» не зациклил перерисовку', renderErrors.length === errorsBefore,
    renderErrors.slice(errorsBefore)[0]?.slice(0, 80) ?? 'ошибок нет')
  check('высота карточки осталась вменяемой', parseFloat(textNode().style.height) >= 80,
    textNode().style.height)

  await setFit('Обычный')
  check('режим вернулся к обычному', !!textNode())

  // --- палитра
  const card = document.querySelector('.cnode') as any
  card.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }))
  await wait(250)
  click(menuItem('Цвет'))
  await wait(220)
  const quick = all('.ctx-menu .ctx-swatch').length
  check('в меню быстрый ряд цветов', quick === 7, String(quick))
  check('есть вход в полную палитру', !!menuItem('Все цвета'))

  click(menuItem('Все цвета'))
  await wait(320)
  check('палитра открылась', !!document.querySelector('.pal-grid'))
  check('в палитре не меньше 12 цветов', all('.pal-swatch').length >= 12, String(all('.pal-swatch').length))
  check('видно ряд быстрого доступа', all('.pal-quick').length === 7, String(all('.pal-quick').length))

  // Добавляем цвет в быстрый ряд.
  const unpinned = all('.pal-cell').find((c) => !c.querySelector('.pal-pin.on')) as any
  click(unpinned.querySelector('.pal-pin'))
  await wait(300)
  check('цвет добавился в быстрый доступ', all('.pal-quick').length === 8, String(all('.pal-quick').length))
  click(unpinned.querySelector('.pal-pin'))
  await wait(300)
  check('и убирается обратно', all('.pal-quick').length === 7, String(all('.pal-quick').length))

  // Красим карточку.
  const swatch = all('.pal-swatch')[3] as any
  click(swatch)
  await wait(350)
  check('палитра закрылась после выбора', !document.querySelector('.pal-grid'))
  const painted = (document.querySelector('.cnode') as any).style.getPropertyValue('--cnode-color')
  check('карточка перекрасилась', !!painted, painted)
}

async function transactionsBulk() {
  console.log('\n— массовое выделение в операциях —')
  await open('Операции')
  const start = totalOps()

  click(byText('.seg button', 'Расходы'))
  await wait(400)
  const m = (document.querySelector('.view-sub')?.textContent || '').match(/^(\d+) записей/)
  const filtered = m ? Number(m[1]) : 0
  check('фильтр сузил список', filtered > 0 && filtered < start, `${filtered} из ${start}`)

  const label = byText('label.row', 'Выделить все')
  check('есть «Выделить все»', !!label, (label?.textContent || '').trim())
  click(label.querySelector('input[type=checkbox]'))
  await wait(400)
  check('выделено по фильтру', text().includes(`выбрано ${filtered}`))

  click(byText('.btn.danger', 'Удалить выбранные'))
  await wait(300)
  click(byText('.modal-foot .btn.primary', 'Удалить'))
  await wait(700)
  check('удалено ровно выделенное', totalOps() === start - filtered, `${totalOps()}, ждали ${start - filtered}`)

  click(byText('.view-head .btn', 'Вернуть'))
  await wait(700)
  check('возврат сработал', totalOps() === start, `${totalOps()}, было ${start}`)
}

/**
 * Дата новой записи идёт за открытым периодом.
 *
 * Проверяется путь до того самого поля, которое уходит в хранилище: пометка
 * на кнопке → быстрый ввод → поле даты в подробной карточке. Самого нажатия
 * «Записать» здесь нет, и не по недосмотру: модалка живёт порталом в body,
 * вне корня React, и набор текста в её поле до обработчиков в jsdom не
 * доходит — событие до body долетает, React на него не откликается. Клики
 * порталу приходят, поэтому всё остальное проверяется как обычно, а сама
 * запись операции проверена в настоящем окне.
 */
async function entryDateFollowsPeriod() {
  console.log('\n— дата новой записи идёт за периодом —')
  await open('Дашборд')

  const expBtn = () => document.querySelector('.btn.tone-out') as any
  const label = () => (expBtn()?.textContent || '').trim()

  // Стрелки периода берём от кнопки «К текущему периоду»: заголовок у неё
  // единственный на всё окно, а порядок кнопок внутри строки задан разметкой.
  const nav = (document.querySelector('.icon-btn[title="К текущему периоду"]') as any).parentElement
  const back = nav.querySelectorAll('.icon-btn')[0]
  const toNow = nav.querySelectorAll('.icon-btn')[2]

  check('на текущем месяце пометки нет', label() === 'Расход', label())

  const prevEnd = endOfMonth(addMonths(today(), -1))
  const day = parseISO(prevEnd)
  const mark = ' · ' + day.getDate() + ' ' + MONTHS_SHORT[day.getMonth()]

  click(back)
  await wait(500)
  check('после листания кнопка называет дату', label() === 'Расход' + mark, label())
  check('подсказка кнопки объясняет полностью',
    expBtn().getAttribute('title') === 'Записать расход за ' + humanDate(prevEnd),
    expBtn().getAttribute('title'))

  click(expBtn())
  await wait(450)
  const quick = () => byText('.modal', 'Быстрый ввод')
  check('быстрый ввод открылся', !!quick())
  check('пустое поле сразу предупреждает о дате',
    (quick()?.textContent || '').includes('Запись уйдёт на ' + relDate(prevEnd)), relDate(prevEnd))

  // «Подробно…» переносит разобранное в карточку операции. Поле даты в ней —
  // ровно то значение, которое уйдёт в хранилище при сохранении.
  click(byText('.modal-foot .btn', 'Подробно'))
  await wait(500)
  const card = byText('.modal', 'Новая операция')
  check('карточка операции открылась', !!card)
  const dateField = card?.querySelector('input[type="date"]') as any
  check('в поле даты стоит дата периода, а не сегодняшняя',
    dateField?.value === prevEnd, dateField?.value + ', сегодня ' + today())

  click(byText('.modal-foot .btn', 'Отмена'))
  await wait(400)
  check('карточка закрылась, ничего не записав', !byText('.modal', 'Новая операция'))

  click(toNow)
  await wait(450)
  check('возврат к текущему периоду снимает пометку', label() === 'Расход', label())
}
function mount(): Root {
  const root = createRoot(document.getElementById('root')!)
  root.render(
    React.createElement(StoreProvider, null, React.createElement(ToastProvider, null, React.createElement(App))),
  )
  return root
}

/**
 * Регрессия: удалённые операции обязаны пережить перезапуск. Раньше правила
 * регулярных платежей заново создавали удалённые автосписания текущего месяца.
 */
async function persistence(root: Root): Promise<Root> {
  console.log('\n— сохранение между запусками —')
  await open('Дашборд')
  const start = totalOps()

  const incBtn = byText('.btn.danger', 'Удалить весь заработок')
  const incCount = countIn(incBtn)
  click(incBtn)
  await wait(300)
  click(byText('.modal-foot .btn.primary', 'Удалить'))
  await wait(1200)
  const afterDelete = totalOps()
  check('заработок удалён', afterDelete === start - incCount, `${start} → ${afterDelete}`)
  check('строка состояния сообщает о сохранении', /сохранено в \d\d:\d\d/.test(text()))

  root.unmount()
  await wait(250)
  const next = mount()
  await wait(1800)
  check('после перезапуска ничего не воскресло', totalOps() === afterDelete,
    `${totalOps()}, ожидали ${afterDelete}`)

  // Возвращаем состояние, чтобы прогон был повторяемым.
  const undo = byText('.btn', 'Вернуть')
  if (undo) {
    click(undo)
    await wait(700)
  }
  return next
}

async function saveButton() {
  console.log('\n— ручное сохранение —')
  const btn = byText('.statusbar .btn', 'сохран')
  check('кнопка сохранения в строке состояния', !!btn, (btn?.textContent || '').trim())
  click(btn)
  await wait(600)
  check('после нажатия показано время сохранения', /сохранено в \d\d:\d\d/.test(text()))
}

/**
 * Полная очистка: хранилище должно опустеть целиком и остаться пустым после
 * перезапуска — программа демо-данные больше не досочиняет.
 */
async function wipeEverything(root: Root): Promise<Root> {
  console.log('\n— стереть всё —')
  await open('Дашборд')

  const btn = byText('.btn.danger', 'Стереть всё и начать заново')
  check('кнопка полной очистки на месте', !!btn)
  click(btn)
  await wait(350)
  check('подтверждение перечисляет, что уйдёт', /Будут удалены: \d+ операц/.test(text()))
  check('подтверждение предупреждает об отсутствии отмены', text().includes('Отмены у этого действия нет'))
  click(byText('.modal-foot .btn.primary', 'Стереть всё'))
  await wait(1200)

  check('операций не осталось', totalOps() === 0, String(totalOps()))
  check('появилось приглашение начать', text().includes('Хранилище пустое'))
  check('есть кнопка создания счёта', !!byText('.btn', 'Создать первый счёт'))
  check('карточка очистки скрыта', !byText('.btn.danger', 'Удалить все расходы'))

  await open('Счета')
  check('счета исчезли', !text().includes('Основной') && !text().includes('Долг Диме'))
  await open('Цели')
  check('цели исчезли', !text().includes('Челяба фонд'))
  await open('Регулярные')
  check('регулярные исчезли', text().includes('Регулярных платежей нет'))
  await open('Заметки')
  check('заметки исчезли', text().includes('Заметок пока нет'))

  // Перезапуск — демо-данные не должны вернуться.
  root.unmount()
  await wait(250)
  const next = mount()
  await wait(1800)
  check('после перезапуска хранилище всё ещё пустое', totalOps() === 0, String(totalOps()))
  check('демо-данные не сгенерировались заново', text().includes('Хранилище пустое'))
  return next
}

/**
 * Архив: всё содержимое уезжает в один файл и возвращается на пустой машине.
 *
 * Проверяется именно то, ради чего файл нужен: человек получил его, у него
 * своего ничего нет — и после открытия есть всё, вплоть до оформления доски.
 */
async function archiveRoundTrip(root: Root): Promise<Root> {
  console.log('\n— архив: всё одним файлом —')

  // Оформление доски и её быстрые цвета — часть документа наравне с узлами.
  const boardName = (await listCanvases())[0]
  const board = await readCanvas(boardName)
  await writeCanvas(boardName, { ...board!, cardStyle: 'flat', quickColors: ['#e05252', '#4cc46a'] })

  const live = (await loadVault()) as VaultData
  const noteNames = await listNotes()
  const archive = await buildArchive(live)

  check('операции собраны', archive.counts.transactions === live.transactions.length,
    `${archive.counts.transactions} из ${live.transactions.length}`)
  check('счета собраны', archive.counts.accounts === live.accounts.length, String(archive.counts.accounts))
  check('заметки собраны', archive.counts.notes === noteNames.length,
    `${archive.counts.notes} из ${noteNames.length}`)
  check('доски собраны', archive.counts.canvases >= 1, String(archive.counts.canvases))
  check('оформление доски попало в архив', archive.canvases[boardName]?.cardStyle === 'flat',
    String(archive.canvases[boardName]?.cardStyle))

  const file = archiveText(archive)
  check('файл читается глазами', file.startsWith('{\n') && file.includes('"kashel": "vault"'))

  // Файл приходит от постороннего: мусор внутрь хранилища попасть не должен.
  check('посторонний JSON отвергнут', parseArchive('{"foo":1}').ok === false)
  check('битый файл отвергнут', parseArchive('{это не json').ok === false)
  check('пустой файл отвергнут', parseArchive('   ').ok === false)
  // Блокнот дописывает метку порядка байтов — разбор обязан её пережить.
  check('метка порядка байтов не мешает', parseArchive('﻿' + file).ok === true)

  // Чистая машина: у получателя своего нет ничего.
  root.unmount()
  await wait(700)
  dom.window.localStorage.clear()

  const res = parseArchive(file)
  if (!res.ok) throw new Error('архив не разобрался: ' + res.error)
  check('повреждённых записей нет', res.dropped === 0, String(res.dropped))

  const report = await applyArchive(res.archive)
  await saveCore(res.archive.data)
  await saveTransactions(res.archive.data.transactions, new Set())
  check('заметки разложены', report.notes === noteNames.length, `${report.notes} из ${noteNames.length}`)
  check('при записи ничего не потерялось', report.failed.length === 0, report.failed.join(', '))

  const next = mount()
  await wait(1800)
  check('операции вернулись', totalOps() === live.transactions.length,
    `${totalOps()}, ждали ${live.transactions.length}`)
  await open('Счета')
  check('счета вернулись', text().includes(live.accounts[0].name), live.accounts[0].name)
  await open('Цели')
  check('цели вернулись', live.goals.every((g) => text().includes(g.name)))
  await open('Заметки')
  check('заметки вернулись', noteNames.every((n) => text().includes(n)), noteNames.join(', ').slice(0, 60))
  await open('Канвас')
  check('доска вернулась', text().includes(boardName), boardName)
  const restored = await readCanvas(boardName)
  check('оформление доски пережило перенос', restored?.cardStyle === 'flat', String(restored?.cardStyle))
  check('быстрые цвета доски пережили перенос', restored?.quickColors?.length === 2,
    String(restored?.quickColors?.length))
  return next
}

/**
 * Правая панель скрывается и возвращается.
 *
 * Регрессия: хук «ближайших списаний» стоял ниже раннего выхода по !open.
 * У закрытой панели хуков оказывалось меньше, чем у открытой, React снимал
 * всё дерево — и окно становилось пустым. Проверяем сам факт: переключили
 * дважды, ошибок рендера нет, приложение на месте.
 */
async function rightPanel() {
  console.log('\n— правая панель —')
  await open('Дашборд')
  const btn = [...document.querySelectorAll('button')].find((b) =>
    (b.getAttribute('title') || '').includes('Боковая панель'),
  ) as any
  check('кнопка скрытия панели на месте', !!btn)

  check('панель открыта', !!document.querySelector('.rightbar:not(.hidden)'))
  const before = renderErrors.length

  click(btn)
  await wait(400)
  check('панель свернулась', !!document.querySelector('.rightbar.hidden'))
  check('дерево пережило скрытие', renderErrors.length === before && text().length > 400)

  click(btn)
  await wait(400)
  check('панель вернулась', !!document.querySelector('.rightbar:not(.hidden)'))
  check('содержимое панели на месте', text().includes('Сводка'))
  check('переключение обошлось без ошибок', renderErrors.length === before,
    renderErrors.slice(before).map((e) => e.slice(0, 80)).join(' | '))
}

/** Оформление: галерея открывается, все шесть тем применяются к корню документа. */
async function themes() {
  console.log('\n— оформления —')
  await open('Дашборд')

  const ribbonButtons = [...document.querySelectorAll('.ribbon-btn')] as any[]
  const themeBtn = ribbonButtons.find((b) => (b.getAttribute('title') || '').startsWith('Оформление'))
  check('кнопка оформления в ленте', !!themeBtn, themeBtn?.getAttribute('title')?.slice(0, 34))
  click(themeBtn)
  await wait(350)
  check('галерея открылась', text().includes('Оформление') && text().includes('Анимации'))

  for (const t of THEMES) {
    const card = [...document.querySelectorAll('.modal .grid button')].find((b) =>
      (b.textContent || '').includes(t.name),
    ) as any
    if (!card) {
      check(`тема «${t.name}»`, false, 'карточка не найдена')
      continue
    }
    const before = renderErrors.length
    click(card)
    await wait(220)
    const applied = document.documentElement.dataset.theme === t.id
    check(`тема «${t.name}»`, applied && renderErrors.length === before, document.documentElement.dataset.theme)
  }

  for (const level of ['off', 'subtle', 'full']) {
    const chip = [...document.querySelectorAll('.modal .chip')].find((c) =>
      (c.textContent || '').includes(level === 'off' ? 'Выключены' : level === 'subtle' ? 'Умеренные' : 'Полные'),
    ) as any
    click(chip)
    await wait(200)
    check(`анимации: ${level}`, document.documentElement.dataset.anim === level, document.documentElement.dataset.anim)
  }

  // Декоративные эффекты живут только на уровне «полные».
  const setLevel = async (name: string) => {
    const chip = [...document.querySelectorAll('.modal .chip')].find((c) =>
      (c.textContent || '').includes(name),
    ) as any
    click(chip)
    await wait(250)
  }
  await setLevel('Полные')
  check('блик по названию включён', !!document.querySelector('.fx-shiny'))
  check('слой искр смонтирован', !!document.querySelector('canvas[aria-hidden]'))
  await setLevel('Выключены')
  check('блик снят', !document.querySelector('.fx-shiny'))
  check('слой искр убран', !document.querySelector('canvas[aria-hidden]'))
  await setLevel('Полные')

  // Регрессия: системная просьба уменьшить движение — это значение по
  // умолчанию, а не запрет. Явный выбор пользователя должен её перебивать.
  await setLevel('Полные')
  setSystemReduced(true)
  await wait(250)
  check('система просит покоя, но выбраны «Полные» — анимации живы',
    document.documentElement.dataset.anim === 'full', document.documentElement.dataset.anim)
  check('блик остался на месте', !!document.querySelector('.fx-shiny'))

  await setLevel('Как в системе')
  await wait(250)
  check('режим «как в системе» слушается системы', document.documentElement.dataset.anim === 'off',
    document.documentElement.dataset.anim)
  check('подсказка про настройку Windows показана', text().includes('Windows сейчас просит уменьшить движение'))

  setSystemReduced(false)
  await wait(250)
  check('система разрешила — движение вернулось', document.documentElement.dataset.anim === 'full',
    document.documentElement.dataset.anim)
  await setLevel('Полные')

  // Возвращаем исходное оформление и закрываем окно.
  const obsidian = [...document.querySelectorAll('.modal .grid button')].find((b) =>
    (b.textContent || '').includes('Обсидиан'),
  ) as any
  click(obsidian)
  await wait(200)
  const close = document.querySelector('.modal-head .icon-btn') as any
  click(close)
  await wait(300)
  check('галерея закрылась', !document.querySelector('.modal'))
}

/** Компонент, который падает по требованию. Только для проверки границ. */
function Boom(): React.ReactElement {
  throw new Error('намеренное падение рендера')
}

/**
 * Границы отрисовки. Без них любая ошибка в рендере снимала всё дерево и
 * оставляла пустое окно — так уже случалось дважды. Проверяем три вещи:
 * запасной экран появляется, он умеет записать хранилище, и падение раздела
 * стоит одной вкладки, а не всей программы.
 *
 * Фаза идёт последней: она поднимает второй StoreProvider, который сам зовёт
 * boot() и пишет в localStorage, — соседним проверкам это испортило бы оснастку.
 */
async function boundaries(root: Root): Promise<Root> {
  console.log('\n— границы отрисовки —')
  const box = document.createElement('div')
  document.body.appendChild(box)
  const inBox = (needle: string) => (box.textContent || '').replace(/\s+/g, ' ').includes(needle)
  const btnInBox = (needle: string) =>
    [...box.querySelectorAll('button')].find((b) => (b.textContent || '').includes(needle)) as any

  // ---- рубеж окна, синтетическое падение
  const r2 = createRoot(box)
  let before = renderErrors.length
  await withExpectedCrash(/The above error occurred in the <Boom> component/, async () => {
    r2.render(
      React.createElement(StoreProvider, null,
        React.createElement(ToastProvider, null,
          React.createElement(Boundary, { level: 'window' }, React.createElement(Boom)))),
    )
    await wait(700)
  })
  check('React сообщил о падении ровно один раз', expected.length === 1, String(expected.length))
  check('посторонних ошибок в окне ожидания нет', renderErrors.length === before,
    renderErrors.slice(before)[0]?.slice(0, 100) ?? '')
  check('вместо пустоты — запасной экран', inBox('Интерфейс не отрисовался'))
  check('экран показывает причину', inBox('намеренное падение рендера'))

  // Кнопка записи обязана работать: ошибка из обработчика летит мимо границы
  // и попала бы прямо в счётчик ошибок.
  before = renderErrors.length
  click(btnInBox('Сохранить в хранилище'))
  await wait(700)
  check('запись из запасного экрана прошла', inBox('Записано в хранилище'))
  check('запись не добавила ошибок', renderErrors.length === before)
  r2.unmount()
  await wait(200)

  // ---- рубеж слота: колонка окна обязана сохранить свой класс
  const r3 = createRoot(box)
  before = renderErrors.length
  await withExpectedCrash(/The above error occurred in the <Boom> component/, async () => {
    r3.render(
      React.createElement(StoreProvider, null,
        React.createElement(ToastProvider, null,
          React.createElement(Boundary, { level: 'slot', slotClass: 'rightbar', where: 'Сводка' },
            React.createElement(Boom)))),
    )
    await wait(600)
  })
  check('запасной экран слота держит свою колонку', !!box.querySelector('.rightbar'))
  check('слот назвал упавшее место', inBox('Сводка не собралась'))
  check('слот не добавил посторонних ошибок', renderErrors.length === before)
  r3.unmount()
  box.remove()
  await wait(200)

  // ---- боевое падение раздела: портим данные так же, как это сделала бы рука
  root.unmount()
  await wait(250)
  seedStorage()
  const ls = dom.window.localStorage
  for (const k of Object.keys(ls)) {
    if (!k.startsWith('kashel:transactions/')) continue
    const list = JSON.parse(ls.getItem(k)!)
    for (const t of list) delete t.tags
    ls.setItem(k, JSON.stringify(list))
  }
  before = renderErrors.length
  let next = root
  await withExpectedCrash(/The above error occurred in the <Dashboard> component/, async () => {
    next = mount()
    await wait(2000)
  })
  check('падение раздела объявлено и посчитано', expected.length >= 1, String(expected.length))
  check('посторонних ошибок нет', renderErrors.length === before,
    renderErrors.slice(before)[0]?.slice(0, 100) ?? '')
  check('вместо раздела — запасной экран', text().includes('не отрисовался'))
  check('лента жива', !!document.querySelector('.ribbon'))
  check('меню разделов живо', !!document.querySelector('.sidebar'))
  check('сводка жива', !!document.querySelector('.rightbar'))
  check('строка состояния жива', totalOps() !== -1, String(totalOps()))
  check('кнопка сохранения внизу на месте', !!byText('.statusbar .btn', 'сохран'))

  before = renderErrors.length
  await open('Счета')
  check('соседний раздел открывается', text().includes('Счета') && renderErrors.length === before)
  return next
}

/**
 * Отказ хранилища на старте. Раньше загрузка роняла промис, готовность не
 * наступала никогда, и окно навсегда оставалось на заставке «Открываю
 * хранилище…»: ни объяснения, ни выхода.
 */
async function vaultFailure(root: Root): Promise<Root> {
  console.log('\n— хранилище не открылось —')
  root.unmount()
  await wait(80)

  const ls = dom.window.localStorage
  ls.clear()
  // Браузерный мост пишет data.json именно сюда, поэтому подмена повторяет
  // форму дефекта один в один: чтение вернёт пусто, загрузка решит
  // «хранилище новое» и попробует его создать.
  // Хранилище в jsdom — прокси: присвоение ls.setItem записалось бы обычным
  // ключом, а не подменило метод. Подменяем на прототипе.
  const proto = (dom.window as any).Storage.prototype
  const real = proto.setItem
  proto.setItem = function (k: string, v: string) {
    if (k === 'kashel:data.json') throw new Error('Диск переполнен')
    return real.call(this, k, v)
  }

  const next = mount()
  await wait(1400)
  check('заставка ушла', !text().includes('Открываю хранилище'))
  check('видно объяснение', text().includes('Не удалось открыть хранилище'))
  check('видна причина', text().includes('Диск переполнен'))
  check('есть кнопка «Попробовать снова»', !!byText('.btn', 'Попробовать снова'))

  proto.setItem = real
  click(byText('.btn', 'Попробовать снова'))
  await wait(1800)
  check('после устранения причины программа поднимается', !!document.querySelector('.ribbon'))
  check('заставка не вернулась', !text().includes('Открываю хранилище'))
  return next
}


/*
 * Обновление.
 *
 * Проверить это в jsdom можно только подставив мост: настоящий живёт в
 * Electron. Подставляется он прямо в объекте bridge — тот же объект, из
 * которого читает компонент, поэтому подмена честная, а не мимо кода.
 *
 * Смотрим не «нарисовалось ли», а три вещи, которые ломаются молча: блока не
 * должно быть там, где обновлять нечего; отказ должен быть виден человѣку, а
 * не только в журнале; и ничего не должно скачиваться до нажатия.
 */
async function updates() {
  console.log('\n— обновление —')
  /*
   * Уводим приложение с «Настроек».
   *
   * Просьба из меню — общая на всю программу, и раздел настроек, открытый в
   * самом приложении, держит на неё своего слушателя. Пока он жив, просьба
   * достаётся ему, а не блоку, который проверяется здѣсь: проверка мерила бы
   * чужой экземпляр и молча зеленела.
   */
  await open('Дашборд')
  const holder = document.createElement('div')
  document.body.appendChild(holder)
  const б = bridge as any
  const было = { ...б }
  let ставили = 0
  let проверокъ = 0

  // Перерисовкой тут не обойтись: опрос моста живёт в эффекте с пустыми
  // зависимостями и на живом компоненте второй раз не пойдёт. В программе
  // мост подменять некому, а здесь — надо, поэтому каждый заход монтируется
  // заново. Иначе проверка мерила бы не то, что видит человѣкъ.
  let r = createRoot(holder)
  const заново = async () => {
    r.unmount()
    r = createRoot(holder)
    await рисовать()
  }
  const рисовать = async () => {
    r.render(
      <Boundary>
        <ToastProvider>
          <Obnovlenie />
        </ToastProvider>
      </Boundary>,
    )
    await wait(120)
  }
  const въБлокѣ = () => (holder.textContent || '').replace(/\s+/g, ' ')
  const кнопка = (needle: string) =>
    [...holder.querySelectorAll('.btn')].find((b) => (b.textContent || '').includes(needle)) as any

  // 1. В браузере обновлять нечего — блока быть не должно.
  delete б.updateCheck
  delete б.updatePending
  delete б.onUpdate
  await рисовать()
  check('без рабочего стола блок не рисуется', въБлокѣ().trim() === '', въБлокѣ().slice(0, 40))

  // 2. Рабочий стол, свежая версия.
  const находка = {
    version: '1.1.0', date: '2026-09-05', notes: 'Проектные счета',
    url: 'https://x.test/a.exe', sha256: 'c'.repeat(64), size: 3_000_000,
    есть: true, текущая: '1.0.0',
  }
  б.updatePending = async () => ({ версія: '1.0.0', находка: null })
  // Мост отдаёт события по-настоящему: пункт меню проверяется тем же путём,
  // каким событие приходит из главного процесса.
  const подписчики = new Set<(e: any) => void>()
  const послать = (e: any) => { for (const ф of подписчики) ф(e) }
  б.onUpdate = (cb: (e: any) => void) => {
    подписчики.add(cb)
    return () => подписчики.delete(cb)
  }
  б.updateCheck = async () => ({ ...находка, есть: false })
  б.updateInstall = async () => { ставили++; return { путь: 'C:/tmp/a.exe', действіе: 'установщик запущен' } }
  await заново()
  check('блок виден и знает нынешнюю версию', въБлокѣ().includes('у вас версия 1.0.0'), въБлокѣ().slice(0, 60))
  check('до нажатия ничего не скачано', ставили === 0)

  click(кнопка('Проверить обновление'))
  await wait(180)
  check('на своей версии так и сказано', въБлокѣ().includes('последняя версия'))

  // 3. Есть новая: показывается версия, описание и размер.
  б.updateCheck = async () => находка
  click(кнопка('Проверить обновление'))
  await wait(180)
  check('новая версия названа', въБлокѣ().includes('Есть версия 1.1.0'))
  check('описание показано', въБлокѣ().includes('Проектные счета'))
  check('размер показан', въБлокѣ().includes('2.9 МБ'), въБлокѣ().slice(0, 200))
  check('и всё ещё ничего не скачано', ставили === 0)

  // 4. Установка — только по нажатию.
  click(кнопка('Скачать и установить'))
  await wait(200)
  check('установка пошла по нажатию', ставили === 1)
  check('итог показан человѣку', въБлокѣ().includes('установщик запущен'), въБлокѣ().slice(0, 200))

  // 5. Пункт меню «Вид» при открытом разделе: проверка идёт без нажатия кнопки.
  б.updateCheck = async () => { проверокъ++; return находка }
  послать({ kind: 'menu' })
  await wait(200)
  check('пункт меню запускает проверку при открытом разделе', проверокъ === 1, `проверок: ${проверокъ}`)
  check('и находка показана', въБлокѣ().includes('Есть версия 1.1.0'))

  /*
   * 6. Пункт меню, нажатый до того, как раздел открыли.
   *
   * Ровно тот случай, ради которого пункт и добавлен: человѣкъ в настройки
   * ещё не заходил. Просьба обязана дождаться раздела, а не пропасть.
   */
  r.unmount()
  // Даём размонтированию доснять слушателя: пока он жив, просьба ушла бы в
  // уже мёртвый компонент, и проверка мерила бы не то.
  await wait(60)
  проверокъ = 0
  попроситьПроверку()
  // Раздел закрыт — проверке начаться не с чего: просьба обязана ждать.
  check('в закрытом разделе просьба не выполняется сразу', проверокъ === 0, `проверок: ${проверокъ}`)
  await заново()
  // Проверка начинается уже после отрисовки, из эффекта: её ответу нужен
  // ещё один оборот, иначе меряли бы состояние до него.
  await wait(200)
  check('просьба из меню дожидается открытия раздела', проверокъ === 1, `проверок: ${проверокъ}`)
  check('и версия показана', въБлокѣ().includes('Есть версия 1.1.0'), въБлокѣ().slice(0, 60))

  // 7. Отказ обязан быть виден, а не проглочен.
  б.updateCheck = async () => { throw new Error('подпись обновления не сошлась') }
  click(кнопка('Проверить обновление'))
  await wait(180)
  check('отказ показан прямо в блоке', въБлокѣ().includes('подпись обновления не сошлась'))

  r.unmount()
  holder.remove()
  for (const k of ['updateCheck', 'updatePending', 'updateInstall', 'onUpdate']) delete б[k]
  Object.assign(б, было)
}


/*
 * Разборъ нейросетью: что именно уходитъ къ модели.
 *
 * Провѣряется не отвѣтъ модели — она поддѣльная, — а ровно то, изъ-за чего
 * весь этотъ переключатель и появился: къ модели уходитъ то, что выбрано, и
 * ничего сверхъ того. Безъ галочки — одинъ вопросъ; съ галочкой по умолчанію
 * — всё до послѣдняго комментарія; по нажатію «итоги» — одни итоги. Оснастка
 * велика (за тысячу операцій), потому здѣсь же провѣряется остереженіе: оно
 * показывается, когда выгрузка перевалила за порогъ.
 *
 * Ollama здѣсь подмѣнена: настоящая на машинѣ проверяющаго можетъ быть не
 * запущена, а проверка обязана мѣрить программу, а не чужой демонъ.
 */
async function besjeda() {
  console.log('\n— разборъ нейросетью —')
  const тѣла: string[] = []
  const былъ = g.fetch
  g.fetch = async (адресъ: any, како: any) => {
    const у = String(адресъ)
    if (у.endsWith('/api/tags')) {
      return { ok: true, json: async () => ({ models: [{ name: 'проба:9b', size: 6_000_000_000 }] }) } as any
    }
    тѣла.push(String(како?.body ?? ''))
    const ndjson =
      JSON.stringify({ message: { content: 'Отвѣтъ.' } }) + '\n' +
      JSON.stringify({ done: true, done_reason: 'stop' }) + '\n'
    const байты = new TextEncoder().encode(ndjson)
    let отдали = false
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => (отдали ? { done: true, value: undefined } : ((отдали = true), { done: false, value: байты })),
        }),
      },
    } as any
  }

  // Заходъ заново: при первомъ обходѣ разделовъ Ollama ещё не была подменена.
  await open('Дашборд')
  await open('Советы')
  await wait(400)

  check('модель нашлась', text().includes('Приложить мои данные'))

  const поле = document.querySelector('.besjeda-вводъ textarea') as any
  /*
   * Набрать текстъ въ полѣ оказалось не такъ просто, какъ нажать кнопку.
   *
   * react-dom рѣшаетъ разъ и навсегда при своей загрузкѣ, поддерживаетъ ли
   * браузеръ событіе input; здѣсь онъ грузится раньше, чѣмъ поднятъ jsdom, и
   * рѣшаетъ, что не поддерживаетъ. Дальше онъ живётъ по запасному пути,
   * писанному подъ старый Internet Explorer: слѣдитъ за полемъ, пока оно въ
   * фокусѣ, и сличаетъ значеніе по нажатіямъ клавишъ. Потому здѣсь фокусъ,
   * сбросъ слѣда и keyup — иначе набранное въ состояніе не попадаетъ и
   * кнопка «Спросить» остаётся серой.
   */
  const вписать = (что: string) => {
    поле.focus()
    поле.dispatchEvent(new dom.window.Event('focusin', { bubbles: true }))
    поле.value = что
    ;(поле as any)._valueTracker?.setValue('')
    поле.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    поле.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: 'а', bubbles: true }))
  }
  const спросить = async (что: string) => {
    вписать(что)
    await wait(60)
    const кн = byText('.besjeda-вводъ button', 'Спросить')

    check('кнопка «Спросить» доступна', !!кн && !кн.disabled)
    click(кн)
    await wait(250)
  }
  const чипъ = (подпись: string) =>
    all('.besjeda-вводъ .chip').find((c) => (c.textContent || '').trim() === подпись) as any

  // --- безъ галочки не уходитъ ничего, кромѣ вопроса
  await спросить('Сколько я трачу?')
  check('спросили безъ данныхъ', тѣла.length === 1)
  check('и данныя не приложились', !тѣла[0].includes('Данные пользователя'))
  check('и остереженія безъ галочки нѣтъ', !document.querySelector('.besjeda-остереженіе'))
  check('но вопросъ дошёлъ', тѣла[0].includes('Сколько я трачу?'))

  // --- галочка: по умолчанію уходитъ всё
  click(document.querySelector('.besjeda-галка input'))
  await wait(700)
  check('по умолчанію выбрано всё целикомъ', чипъ('всё целиком')?.className.includes('on') === true)
  check('на большой выгрузкѣ показано остереженіе', !!document.querySelector('.besjeda-остереженіе'))
  await спросить('А что за покупка была?')
  check('приложилось всё', тѣла[1].includes('ЧАСТЬ 2. Перечень операций'))

  // --- переключеніе на итоги
  click(чипъ('итоги'))
  await wait(300)
  /*
   * Оговорка къ этой строкѣ: на итогахъ остереженіе пропадаетъ и потому, что
   * они короче порога, — то есть проверка тутъ переопредѣлена и одна, безъ
   * сосѣдней, ничего бы не стерегла. Настоящій стражъ порога — строка выше,
   * на полной выгрузкѣ: подмѣна порога миллиономъ её роняетъ.
   */
  check('на итогахъ остереженія не видно', !document.querySelector('.besjeda-остереженіе'))
  await спросить('А по статьямъ?')
  check('приложились итоги', тѣла[2].includes('Данные пользователя') && тѣла[2].includes('Чистый капитал'))
  check('и перечня операцій въ нихъ нѣтъ', !тѣла[2].includes('ЧАСТЬ 2. Перечень операций'))
  check('и это заведомо меньше полной выгрузки',
    тѣла[1].length > тѣла[2].length * 5, `${тѣла[1].length} противъ ${тѣла[2].length}`)

  // --- въ лентѣ видно, что къ какому вопросу приложили
  const помѣты = all('.besjeda-помѣта').map((п) => (п.textContent || '').trim())
  check('помѣтъ ровно двѣ', помѣты.length === 2, помѣты.join(' / '))
  check('и онѣ разныя',
    помѣты[0].includes('записями') && помѣты[1].includes('итогами'), помѣты.join(' / '))

  g.fetch = былъ
}

async function main() {
  seedStorage()
  let root = mount()
  await wait(1700)

  await sections()
  await updates()
  await besjeda()
  await rightPanel()
  await themes()
  await cardGlare()
  await canvasBoard()
  await canvasText()
  await dashboardWipe()
  await transactionsBulk()
  await entryDateFollowsPeriod()
  root = await persistence(root)
  await saveButton()
  root = await archiveRoundTrip(root)
  root = await wipeEverything(root)
  root = await boundaries(root)
  root = await vaultFailure(root)

  console.log(`\nошибок рендера: ${renderErrors.length}`)
  for (const e of renderErrors.slice(0, 5)) console.log('  • ' + e.slice(0, 300))
  console.log(`провалено проверок: ${fails.length}`)
  for (const f of fails) console.log('  ✗ ' + f)
  process.exit(fails.length || renderErrors.length ? 1 : 0)
}

main().catch((e) => {
  console.log('ФАТАЛЬНО:', e)
  process.exit(2)
})
