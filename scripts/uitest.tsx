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
import { Donut } from '../src/components/charts'
import { addMonths, endOfMonth, humanDate, MONTHS_SHORT, numericDate, parseISO, relDate, today } from '../src/lib/date'
import type { VaultData } from '../src/lib/types'
import { creditRemaining } from '../src/engine/stats'
import { money } from '../src/lib/format'

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
  // Одно ждущее уведомление о платеже — для проверки колокольчика.
  const уведомленіе = { id: 'n_test', kind: 'credit_payment', accountId: 'acc_credit', dueDate: today(),
    amount: 9_150_00, createdAt: new Date().toISOString(), status: 'pending' }
  // Напоминание у кредита включено, но с далёкой даты: новых уведомлений
  // служба не заведёт, а заготовленное будет видно.
  const счета = core.accounts.map((a) => (a.id === 'acc_credit' && a.credit
    ? { ...a, credit: { ...a.credit, remind: true, remindFrom: '2099-01-01' } }
    : a))
  // «Что нового» уже просмотрено — иначе окно закрыло бы собой все проверки. Само окно проверяется отдельно.
  ls.setItem('kashel:data.json', JSON.stringify({ ...core, settings: { ...core.settings, whatsNewSeen: '99.0.0' },
    accounts: счета, notifications: [уведомленіе] }))
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
  console.log('\n— подсветка карточек —')
  await open('Счета')
  check('карточки счетов с подсветкой', document.querySelectorAll('.card.fx-glare').length > 0,
    String(document.querySelectorAll('.card.fx-glare').length))
  await open('Категории')
  const карточки = [...document.querySelectorAll('.card.fx-glare')] as HTMLElement[]
  check('карточки категорий с подсветкой', карточки.length > 0, String(карточки.length))

  // Каждая светится своим цветом, а не общим акцентом.
  const цвета = new Set(карточки.map((к) => к.style.getPropertyValue('--glare')).filter(Boolean))
  check('у карточек свой цвет подсветки', цвета.size > 1, `${цвета.size} разных`)

  /*
   * Пятно света идёт за курсором: один слушатель на окно кладёт координаты
   * в ближайшую карточку. jsdom не мерит раскладку (прямоугольник нулевой),
   * поэтому координаты выходят равными clientX/clientY — этого и ждём.
   */
  const к = карточки[0]
  const внутри = к.querySelector('.row') || к
  внутри.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true, clientX: 37, clientY: 21 }))
  await wait(60)
  check('координаты курсора дошли до карточки',
    к.style.getPropertyValue('--mx') === '37px' && к.style.getPropertyValue('--my') === '21px',
    `${к.style.getPropertyValue('--mx')} ${к.style.getPropertyValue('--my')}`)

  await open('Цели')
  const цели = [...document.querySelectorAll('.card.fx-glare')] as HTMLElement[]
  check('карточки целей с подсветкой своего цвета',
    цели.length > 0 && цели.every((ц) => !!ц.style.getPropertyValue('--glare')), String(цели.length))
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
  const досокБыло = Object.keys(dom.window.localStorage).filter((k) => k.startsWith('kashel:canvas/')).length
  click(dropBtn)
  await wait(400)
  check('доска удаляется сразу, без окна', !text().includes('Файл доски исчезнет') &&
    Object.keys(dom.window.localStorage).filter((k) => k.startsWith('kashel:canvas/')).length === досокБыло - 1)
  const вернуть = all('[data-sonner-toast]').filter((т) => (т.textContent || '').includes('удалена'))
    .map((т) => т.querySelector('[data-button]')).find((б) => (б?.textContent || '').includes('Отменить'))
  check('у удалённой доски есть «Отменить»', !!вернуть)
  click(вернуть)
  await wait(700)
  check('«Отменить» возвращает доску целиком', nodes() === nodesNow && edges() === edgesNow, `${nodes()} узлов`)
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

  /*
   * Режим подгонки.
   *
   * Прежде здесь был <select>, и этот тест выставлял ему значение напрямую —
   * jsdom не смотрит на погашенный mousedown, так что тест был зелёным, а у
   * человека список не открывался вовсе. Теперь проверяем ровно то, что
   * делает человек: жмём кнопку режима, затем пункт меню. И отдельно — что
   * <select> в панель не вернётся.
   */
  check('в панели нет <select> — он там не раскрывается', !document.querySelector('.text-toolbar select'))
  const выбратьРежимъ = async (имя: string) => {
    click(document.querySelector('.tt-fit-btn'))
    await wait(200)
    const пунктъ = all('.tt-fit-item').find((b) => (b.textContent || '').includes(имя)) as any
    click(пунктъ)
    await wait(250)
    return !!пунктъ
  }
  click(document.querySelector('.tt-fit-btn'))
  await wait(200)
  check('кнопка режима раскрыла меню', all('.tt-fit-item').length === 4, String(all('.tt-fit-item').length))
  check('и правка при этом не оборвалась', !!area())
  click(document.querySelector('.tt-fit-btn'))
  await wait(200)

  check('режим «Вписывать» выбирается из меню', await выбратьРежимъ('Вписывать'))
  check('кнопка показывает выбранный режим', (document.querySelector('.tt-fit-btn')?.textContent || '').includes('Вписывать'))
  check('поле правки тоже без прокрутки — подгонка работает и при правке', area()?.classList.contains('no-scroll') === true)

  /*
   * Уход фокуса в панель — ещё правка, а не её конец.
   *
   * Синтетический focusout здесь до onBlur не доходит: React загружен
   * раньше, чем поднят jsdom, и часть событий живёт мимо него (та же беда,
   * что с вводом в textarea). Первая версия этой проверки поэтому была
   * пустой — зеленела и без защиты, мутация это показала. Вызываем
   * обработчик React напрямую: он получает то же, что получил бы в окне.
   */
  const пропсыПоля = (el: any) => el?.[Object.keys(el).find((k) => k.startsWith('__reactProps')) as string]
  const onBlur = пропсыПоля(area())?.onBlur
  check('у поля правки есть обработчик ухода фокуса', typeof onBlur === 'function')
  onBlur?.({ relatedTarget: document.querySelector('.tt-fit-btn') })
  await wait(200)
  check('фокус в панели не обрывает правку', !!area())

  /*
   * Панель встаёт над карточкой по своей настоящей высоте. jsdom высоту не
   * мерит (offsetHeight всегда 0), поэтому подставляем её сами: верх панели
   * плюс её высота обязан оставаться одним и тем же — это верх карточки
   * минус зазор. Прежняя постоянная «−44» этого не выдержала бы.
   */
  const держатель = () => document.querySelector('.text-toolbar-holder') as HTMLElement
  const верхъ0 = parseFloat(держатель().style.top)
  const место0 = держатель().dataset.place
  const proto = dom.window.HTMLElement.prototype
  const родное = Object.getOwnPropertyDescriptor(proto, 'offsetHeight')!
  Object.defineProperty(proto, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) { return this.classList?.contains('text-toolbar-holder') ? 110 : 0 },
  })
  click(ttBtn('Крупнее'))
  await wait(200)
  click(ttBtn('Мельче'))
  await wait(200)
  const верхъ1 = parseFloat(держатель().style.top)
  const место1 = держатель().dataset.place
  Object.defineProperty(proto, 'offsetHeight', родное)
  check('панель поднимается на свою высоту, а не на постоянные 44',
    место0 === 'above' && место1 === 'above' ? Math.abs((верхъ0 + 0) - (верхъ1 + 110)) < 0.5 : место1 === 'below',
    `${место0} ${верхъ0} → ${место1} ${верхъ1}`)

  key('Escape')
  await wait(300)
  check('режим «вписывать» отключил прокрутку', !!document.querySelector('.cnode-scroll.no-scroll'),
    String(all('.cnode-scroll.no-scroll').length))
  // Возвращаем обычный режим, чтобы прогон был повторяемым.
  const again = all('.cnode').find((c) => c.className.includes('cnode-t-text')) as any
  again.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true, clientX: 400, clientY: 400 }))
  await wait(300)
  await выбратьРежимъ('Обычный')

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
  // Поле даты теперь своё и показывает дату так, как её читает человек
  // (14.09.2026), а не в ISO — поэтому сравниваем с тем же видом.
  const dateField = card?.querySelector('.datefield input') as any
  check('в поле даты стоит дата периода, а не сегодняшняя',
    dateField?.value === numericDate(prevEnd), dateField?.value + ', сегодня ' + today())

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

  // Свой значок категории — картинка в хранилище, и без неё восстановленная
  // категория осталась бы с пустым кружком. Кладём значок и ставим его статье.
  const ЗНАЧОКЪ = 'icons/probaznachok.png'
  const КРАСНАЯ_ТОЧКА = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
  await bridge.writeBinary(ЗНАЧОКЪ, КРАСНАЯ_ТОЧКА)
  const живой = (await loadVault()) as VaultData
  await saveCore({ ...живой, categories: живой.categories.map((к, i) => (i === 0 ? { ...к, icon: 'file:' + ЗНАЧОКЪ } : к)) })

  const live = (await loadVault()) as VaultData
  const noteNames = await listNotes()
  const archive = await buildArchive(live)
  check('свой значок попал в архив', archive.attachments[ЗНАЧОКЪ] === КРАСНАЯ_ТОЧКА)

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

  check('свой значок вернулся в хранилище', (await bridge.readBinary(ЗНАЧОКЪ))?.endsWith(КРАСНАЯ_ТОЧКА) === true)
  await open('Категории')
  await wait(300)
  const картинка = document.querySelector('.card .avatar.svoy img') as HTMLImageElement | null
  check('и рисуется в списке категорий картинкой', !!картинка && картинка.src.startsWith('data:image/png;base64,'),
    картинка?.src.slice(0, 30))
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

  /*
   * Одна кнопка на панель.
   *
   * Прежде «Сводку» прятали две кнопки — ≡ в полосе вкладок и › в шапке самой
   * панели, — и человѣкъ спрашивал, чем они отличаются. Ничем. Остаётся ≡:
   * она видна и при скрытой панели, а значит, ею же панель и возвращается.
   */
  // Единственная кнопка в шапке — настройка виджетов; скрывающей там нет.
  const кнопкиШапки = [...document.querySelectorAll('.rightbar .sidebar-head button')]
  check('в шапке «Сводки» своей кнопки скрытия нет',
    кнопкиШапки.length === 1 && кнопкиШапки[0].getAttribute('title') === 'Настроить виджеты',
    кнопкиШапки.map((б) => б.getAttribute('title')).join(' | '))
}

/*
 * Конструктор оформления.
 *
 * Собираем свою тему в простом режиме, сохраняем — переменные ложатся на
 * корень, в галерее появляется карточка. Выбор встроенной темы свою снимает
 * и переменные убирает. И отдельно — окно поверх окна: конструктор,
 * открытый из галереи «Оформление», закрывается по Escape один, галерея
 * под ним остаётся.
 */
async function конструкторъОформленія() {
  console.log('\n— конструктор оформления —')
  await open('Настройки')
  const новая = document.querySelector('.svoya-tema-new') as any
  check('в галерее есть «Своё оформление»', !!новая)
  click(новая)
  await wait(400)
  const окно = () => [...document.querySelectorAll('.modal')].find((м) => м.querySelector('.konstruktor')) as HTMLElement | undefined
  check('конструктор открылся', !!окно())
  const превью = () => окно()?.querySelector('.konstruktor-preview') as HTMLElement | null
  check('предпросмотр с настоящей карточкой и кнопкой', !!превью()?.querySelector('.card') && !!превью()?.querySelector('.btn.primary'))

  const setInput = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
  const вписать = async (подпись: string, v: string) => {
    const поле = [...(окно()?.querySelectorAll('.konstruktor-list label.field') ?? [])]
      .find((l) => (l.querySelector('span')?.textContent || '').startsWith(подпись))?.querySelector('input[type="text"]') as any
    /*
     * Поля конструктора живут в портале, и старый путь ввода React в этой
     * оснастке (загружен раньше jsdom) до них не доходит — ни событием
     * input, ни фокусом с нажатием. Поэтому, как с редактором канваса,
     * зовём обработчик поля напрямую: он получает то же значение, что от
     * набора с клавиатуры.
     */
    setInput.call(поле, v)
    const пропсы = поле[Object.keys(поле).find((k) => k.startsWith('__reactProps')) as string]
    пропсы?.onChange?.({ target: поле, currentTarget: поле })
    await wait(80)
  }
  await вписать('Фон окна', '#f4f4f5')
  await вписать('Карточки', '#ffffff')
  await вписать('Текст', '#26262a')
  await вписать('Акцент', '#ffd700')
  await wait(200)
  check('предпросмотр получил цвета', превью()?.style.getPropertyValue('--bg') === '#f4f4f5' && превью()?.style.getPropertyValue('--accent') === '#ffd700',
    `${превью()?.style.getPropertyValue('--bg')} ${превью()?.style.getPropertyValue('--accent')}`)
  check('а само окно — ещё нет', document.documentElement.style.getPropertyValue('--bg') !== '#f4f4f5')
  check('жёлтым по белому не пишет: акцентные буквы — цвет заголовков',
    превью()?.style.getPropertyValue('--accent-ink') !== '#ffd700' && !!превью()?.style.getPropertyValue('--accent-ink'))

  click([...(окно()?.querySelectorAll('.modal-foot .btn') ?? [])].find((б) => (б.textContent || '').includes('Сохранить и включить')))
  await wait(600)
  const root = document.documentElement
  check('конструктор закрылся', !окно())
  check('своя тема включилась — переменные на корне', root.style.getPropertyValue('--bg') === '#f4f4f5', root.style.getPropertyValue('--bg'))
  check('и буквы на акценте заданы', root.hasAttribute('data-accent-text'))
  const сохранено = (await loadVault()).settings
  check('тема сохранилась в настройках', (сохранено.customThemes ?? []).length === 1 && сохранено.customTheme === сохранено.customThemes?.[0].id)
  check('в галерее карточка своей темы', document.querySelectorAll('.svoya-tema').length === 1)

  // --- окно поверх окна
  const ribbonTheme = [...document.querySelectorAll('.ribbon-btn')].find((б) => (б.getAttribute('title') || '').startsWith('Оформление')) as any
  check('кнопка в ленте называет свою тему', /Моя тема/.test(ribbonTheme?.getAttribute('title') || ''), ribbonTheme?.getAttribute('title')?.slice(0, 30))
  click(ribbonTheme)
  await wait(400)
  const галерея = () => [...document.querySelectorAll('.modal')].find((м) => /Анимации/.test(м.textContent || '') && !м.querySelector('.konstruktor'))
  check('галерея «Оформление» открылась', !!галерея())
  click(галерея()?.querySelector('.svoya-tema .icon-btn'))
  await wait(400)
  check('поверх неё — конструктор', !!окно() && !!галерея())
  key('Escape')
  await wait(400)
  check('Escape закрыл только конструктор', !окно() && !!галерея())
  key('Escape')
  await wait(400)
  check('второй Escape — галерею', !галерея())

  // --- встроенная тема снимает свою
  await open('Настройки')
  const обсидианъ = [...document.querySelectorAll('.view button')].find((б) => (б.textContent || '').trim() === 'Обсидиан') as any
  click(обсидианъ)
  await wait(400)
  check('встроенная тема сняла свою', !(await loadVault()).settings.customTheme)
  check('и убрала её переменные с корня', root.style.getPropertyValue('--bg') === '' && !root.hasAttribute('data-accent-text'),
    root.style.getPropertyValue('--bg'))
}

/*
 * Пополнение цели из окна.
 *
 * Ровно то, что не работало у человека: «Пополнить» открывало форму перевода
 * со счёта на счёт, и цель без счёта пополнить было нечем.
 */
async function пополненіеЦѣли() {
  console.log('\n— пополнение цели —')
  const окно = () => document.querySelector('.modal')
  const кнопкаЦели = (имя: string) => {
    const карточка = [...document.querySelectorAll('.view .card')].find((к) => к.querySelector('.strong')?.textContent === имя)
    return [...(карточка?.querySelectorAll('.btn') ?? [])].find((б) => (б.textContent || '').includes('Пополнить')) as any
  }
  const подтвердить = async () => {
    click([...(окно()?.querySelectorAll('.modal-foot .btn') ?? [])].find((б) => (б.textContent || '').trim() === 'Пополнить'))
    await wait(1300)
  }

  // --- цель без счёта: ровно случай со скриншота
  await open('Цели')
  const безъСчёта = 'Подушка безопасности'
  const было = (await loadVault()).goals.find((г) => г.name === безъСчёта)!
  const операцийБыло = (await loadVault()).transactions.length
  check('у цели без счёта есть «Пополнить»', !!кнопкаЦели(безъСчёта))
  click(кнопкаЦели(безъСчёта))
  await wait(400)
  check('открылось окно пополнения, а не форма перевода',
    /Пополнить цель/.test(окно()?.textContent || '') && !/На счёт/.test(окно()?.textContent || ''))
  const тумблеръ = [...(окно()?.querySelectorAll('button.row') ?? [])].find((б) => (б.textContent || '').includes('Вычесть')) as any
  check('есть галочка «Вычесть со счёта»', !!тумблеръ)
  click(тумблеръ)
  await wait(200)
  check('после галочки появился выбор счёта', /С какого счёта/.test(окно()?.textContent || ''))
  await подтвердить()
  check('окно закрылось', !окно())
  const стало = await loadVault()
  const цель = стало.goals.find((г) => г.id === было.id)
  check('цель выросла', (цель?.saved ?? 0) > (было.saved ?? 0), `${было.saved} → ${цель?.saved}`)
  const расходъ = стало.transactions.find((т) => т.goalId === было.id && т.kind === 'expense')
  check('появился расход по статье «Цели»', !!расходъ && расходъ.categoryId === 'cat_goals')
  check('и сама статья «Цели» появилась', стало.categories.some((к) => к.id === 'cat_goals'))
  check('ровно одна новая операция', стало.transactions.length === операцийБыло + 1, `${операцийБыло} → ${стало.transactions.length}`)

  // --- цель со счётом: перевод на её счёт, без формы операции
  await open('Цели')
  const соСчётомъ = 'Челяба фонд'
  const фондъ = стало.goals.find((г) => г.name === соСчётомъ)!
  click(кнопкаЦели(соСчётомъ))
  await wait(400)
  check('цель со счётом: спрашивает, откуда перевести', /Откуда/.test(окно()?.textContent || ''))
  await подтвердить()
  check('появился перевод на счёт цели',
    (await loadVault()).transactions.some((т) => т.goalId === фондъ.id && т.kind === 'transfer' && т.toAccountId === фондъ.accountId))
}

/*
 * Неделя с любого дня: настройка меняет календарик в поле даты.
 *
 * Выбираем среду в настройках и открываем календарик в окне операции: шапка
 * обязана начинаться со «Ср», первая клетка — быть средой. Escape закрывает
 * только календарик, а не окно операции под ним.
 */
async function недѣляИКалендарикъ() {
  console.log('\n— неделя и календарик —')
  await open('Настройки')
  const выборъ = [...document.querySelectorAll('.view select')].find((с) =>
    [...(с as HTMLSelectElement).options].some((о) => о.textContent === 'среда') && (с as HTMLSelectElement).options.length === 7,
  ) as HTMLSelectElement | undefined
  check('в настройках выбор любого дня', !!выборъ)
  if (!выборъ) return
  const setSelect = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')!.set!
  setSelect.call(выборъ, '3')
  выборъ.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await wait(300)

  await open('Операции')
  click(document.querySelector('.tx-row .tx-main'))
  await wait(500)
  const поле = document.querySelector('.modal .datefield') as HTMLElement | null
  check('в окне операции своё поле даты', !!поле)
  click(поле?.querySelector('.datefield-btn'))
  await wait(250)
  const поп = document.querySelector('.datepop')
  const шапка = [...(поп?.querySelectorAll('.datepop-wd') ?? [])].map((е) => е.textContent).join(' ')
  check('календарик открылся', !!поп)
  check('неделя в нём со среды', шапка === 'Ср Чт Пт Сб Вс Пн Вт', шапка)
  // Первая клетка — среда. Число её не скажет, а дата в заголовке месяца
  // и сетка из 42 клеток — да: проверяем через саму сетку.
  check('в сетке шесть недель', (поп?.querySelectorAll('.datepop-day').length ?? 0) === 42)

  const день = [...(поп?.querySelectorAll('.datepop-day:not(.other)') ?? [])].find((б) => б.textContent === '17') as any
  click(день)
  await wait(250)
  check('выбор дня ставит дату в поле', /^17\./.test((поле?.querySelector('input') as HTMLInputElement)?.value || ''),
    (поле?.querySelector('input') as HTMLInputElement)?.value)
  check('и календарик закрылся', !document.querySelector('.datepop'))

  click(поле?.querySelector('.datefield-btn'))
  await wait(200)
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await wait(250)
  check('Escape закрыл календарик', !document.querySelector('.datepop'))
  check('а окно операции осталось', !!document.querySelector('.modal .datefield'))

  click(byText('.modal-foot .btn', 'Отмена'))
  await wait(300)
  // Возвращаем понедельник, чтобы остальные проверки шли с привычной неделей.
  await open('Настройки')
  const выборъ2 = [...document.querySelectorAll('.view select')].find((с) => (с as HTMLSelectElement).options.length === 7 &&
    [...(с as HTMLSelectElement).options].some((о) => о.textContent === 'среда')) as HTMLSelectElement
  setSelect.call(выборъ2, '1')
  выборъ2.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  await wait(300)
}

/*
 * Пончик: выделенный кусок помещается в рисунок и выделяется по наведению.
 *
 * Раньше радиус считался впритык к краю, выделенный кусок толстел на 6 точек
 * и срезался границей SVG. Раскладку jsdom не мерит, но атрибуты SVG — числа,
 * и геометрию можно проверить честно: наружный край выделенного куска
 * r + ширина/2 не больше половины рисунка.
 */
async function пончикъ() {
  console.log('\n— пончик —')
  const holder = document.createElement('div')
  document.body.appendChild(holder)
  const r = createRoot(holder)
  let наведено: string | undefined = 'ещё не было'
  r.render(
    <Donut
      size={250}
      thickness={34}
      slices={[
        { id: 'а', label: 'Аренда', value: 3500000, color: '#8b0000' },
        { id: 'б', label: 'Продукты', value: 1800000, color: '#e8b83a' },
        { id: 'в', label: 'Досуг', value: 900000, color: '#d4569f' },
      ]}
      onHover={(id) => { наведено = id }}
    />,
  )
  await wait(80)
  const svg = holder.querySelector('svg')!
  const s0 = Number(svg.getAttribute('width'))
  const куски = [...holder.querySelectorAll('circle')].filter((c) => (c.getAttribute('stroke') || '').startsWith('#'))
  check('куски нарисованы', куски.length === 3)

  куски[0].dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }))
  await wait(60)
  const рад = Number(куски[0].getAttribute('r'))
  const шир = Number(куски[0].getAttribute('stroke-width'))
  check('кусок под курсором потолстел', шир > 34, String(шир))
  check('и не вылез за рисунок', рад + шир / 2 <= s0 / 2 + 0.01, `край ${рад + шир / 2} из ${s0 / 2}`)
  check('остальные приглушены', куски.slice(1).every((c) => (c as any).style.opacity === '0.35'))
  check('наведение сообщено наружу', наведено === 'а', String(наведено))

  куски[0].dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true }))
  await wait(60)
  check('увёл курсор — выделение снято', Number(куски[0].getAttribute('stroke-width')) === 34 && наведено === undefined)

  r.unmount()
  holder.remove()
}

/*
 * В выпадающих списках нет служебных имён значков.
 *
 * Было «shopping-basket Продукты» — человек принял это за перевод. Проверяется
 * на живом списке фильтра в «Операциях»: имя значка из каталога не должно
 * стоять ни в одном пункте.
 */
async function значкиВъСпискахъ() {
  console.log('\n— значки в списках —')
  await open('Операции')
  // Фильтр категорий теперь со списком и поиском — открываем его и читаем пункты.
  click(document.querySelector('.view .kat-vybor'))
  await wait(100)
  const пункты = [...document.querySelectorAll('.kat-spisok .schet-opt, .view select option')].map((o) => (o.textContent || '').trim())
  click(document.querySelector('.view .kat-vybor'))
  await wait(50)
  const сЛатиницей = пункты.filter((т) => /^[a-z][a-z0-9-]+ /.test(т))
  check('списки нашлись', пункты.length > 10, `${пункты.length} пунктов`)
  check('ни в одном пункте нет имени значка', сЛатиницей.length === 0, сЛатиницей.slice(0, 3).join(' | '))
}

/*
 * Левая панель: скрыть и вернуть.
 *
 * Прежняя кнопка скрытия жила на самой панели и пропадала вместе с ней —
 * вернуть панель было нечем, кроме Ctrl+B, о котором никто не знает.
 * Раскладку окна (что основная область не съезжает в узкую колонку) jsdom
 * не мерит — это стережёт самопроверка по правилам CSS.
 */
async function leftPanel() {
  console.log('\n— левая панель —')
  await open('Дашборд')
  const тумблеръ = () =>
    [...document.querySelectorAll('.ribbon-btn')].find((b) => /левую панель/.test(b.getAttribute('title') || '')) as any

  check('кнопка левой панели в ленте', !!тумблеръ(), тумблеръ()?.getAttribute('title'))
  check('на самой панели кнопки скрытия нет',
    ![...document.querySelectorAll('.sidebar .sidebar-head button')].some((b) => /Скрыть/.test(b.getAttribute('title') || '')))

  const before = renderErrors.length
  click(тумблеръ())
  await wait(300)
  check('панель скрылась', !!document.querySelector('.sidebar.hidden'))
  check('а кнопка вернуть осталась на виду', !!тумблеръ(), тумблеръ()?.getAttribute('title'))

  click(тумблеръ())
  await wait(300)
  check('панель вернулась', !!document.querySelector('.sidebar:not(.hidden) .nav-item'))
  check('без ошибок отрисовки', renderErrors.length === before)

  // --- группы
  localStorage.removeItem('kashel:свёрнутыеГруппы')
  const заголовокъ = (имя: string) =>
    [...document.querySelectorAll('button.nav-group')].find((b) => (b.textContent || '').includes(имя)) as any
  const блокъ = (имя: string) => заголовокъ(имя)?.closest('.nav-block')

  click(заголовокъ('Анализ'))
  await wait(250)
  check('«Анализ» свернулся', блокъ('Анализ')?.classList.contains('svernuta') === true)
  check('остальные открыты', !блокъ('Учёт')?.classList.contains('svernuta'))
  check('пункты свёрнутой группы недоступны с клавиатуры',
    блокъ('Анализ')?.querySelector('.nav-items > div')?.hasAttribute('inert') === true)
  check('и это запомнено', (localStorage.getItem('kashel:свёрнутыеГруппы') || '').includes('Анализ'))

  const всеКнопка = () => document.querySelector('.sidebar .sidebar-head .icon-btn') as any
  click(всеКнопка())
  await wait(250)
  const всѣ = [...document.querySelectorAll('.nav-block')]
  check('«свернуть все» свернула все', всѣ.length === 5 && всѣ.every((b) => b.classList.contains('svernuta')), String(всѣ.length))
  check('и кнопка теперь разворачивает', /Развернуть/.test(всеКнопка()?.getAttribute('title') || ''))

  click(всеКнопка())
  await wait(250)
  check('«развернуть все» развернула все', [...document.querySelectorAll('.nav-block')].every((b) => !b.classList.contains('svernuta')))
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

  // --- языкъ отвѣта: напоминаніе стоитъ прямо передъ вопросомъ и на его языкѣ
  const сообщенія = (тѣло: string) => (JSON.parse(тѣло).messages as { role: string; content: string }[])
  const передъВопросомъ = (тѣло: string) => сообщенія(тѣло).slice(-2)[0]
  check('русскій вопросъ — напоминаніе отвѣчать по-русски',
    передъВопросомъ(тѣла[0]).role === 'system' && передъВопросомъ(тѣла[0]).content.includes('Отвечай по-русски'), передъВопросомъ(тѣла[0]).content)
  await спросить('How much did I spend on groceries?')
  check('англійскій вопросъ — напоминаніе отвѣчать на языкѣ вопроса',
    передъВопросомъ(тѣла[3]).content.startsWith('Answer in the same language') && сообщенія(тѣла[3]).slice(-1)[0].content === 'How much did I spend on groceries?',
    передъВопросомъ(тѣла[3]).content)
  check('и въ исторіи прежнія напоминанія не копятся',
    сообщенія(тѣла[3]).filter((m) => m.role === 'system' && /Отвечай по-русски|Answer in the same language/.test(m.content)).length === 1)

  g.fetch = былъ
}

/*
 * Кредиты: перенос при открытии, карточка, форма и платёж.
 *
 * В оснастке «Рассрочка на технику» заведена по-старому: остаток 0, а
 * платежи — расходы с пометкой. Открытие хранилища обязано перевести её на
 * новый учёт, карточка — показывать долг без тревожного цвета, а платёж из
 * окна операции — уменьшать долг и попадать в расходы.
 */
async function кредиты() {
  console.log('\n— кредиты —')
  const было = await loadVault()
  const рассрочка = было.accounts.find((a) => a.id === 'acc_credit')!
  check('при открытии кредит переведён на новый учёт',
    рассрочка.credit?.v === 2 && рассрочка.initialBalance === -180_000_00 && рассрочка.credit?.purpose === 'purchase',
    `${рассрочка.initialBalance} ${JSON.stringify(рассрочка.credit)}`)
  const долгъБылъ = creditRemaining(рассрочка, было.transactions)
  check('старые платежи уменьшают долг', долгъБылъ > 0 && долгъБылъ < 180_000_00, String(долгъБылъ))

  await open('Счета')
  const карточка = [...document.querySelectorAll('.view .card')].find((к) => к.querySelector('.strong')?.textContent === 'Рассрочка на технику') as HTMLElement | undefined
  const число = карточка?.querySelector('.num') as HTMLElement | undefined
  check('на карточке — тот же долг', (число?.textContent || '').replace(/\s/g, '').includes(money(долгъБылъ).replace(/\s/g, '')),
    `${число?.textContent} против ${money(долгъБылъ)}`)
  check('и долг не красится тревогой', !!число && !число.getAttribute('style')?.includes('--alert'), число?.getAttribute('style') ?? '')

  // Форма: вместо «Начального остатка» — «Осталось выплатить», есть «На что взят».
  click(карточка?.querySelector('.icon-btn'))
  await wait(400)
  const форма = document.querySelector('.modal')?.textContent || ''
  check('в форме кредита — «Осталось выплатить» и «На что взят»',
    форма.includes('Осталось выплатить') && форма.includes('На что взят') && !форма.includes('Начальный остаток'))
  check('у дат есть пояснения', форма.includes('Когда взят кредит') && форма.includes('Число месяца, когда списывается платёж'))
  click(byText('.modal-foot .btn', 'Отмена'))
  await wait(300)

  // Платёж из окна операции.
  await open('Операции')
  click(byText('.view-head .btn', 'Добавить'))
  await wait(400)
  const вкладка = byText('.modal .seg button', 'Платёж по кредиту')
  check('в окне операции есть «Платёж по кредиту»', !!вкладка)
  click(вкладка)
  await wait(300)
  const окно = document.querySelector('.modal') as HTMLElement
  // Счета выбираются своим списком со значками: откроем его и посмотрим пункты.
  const выборы = [...окно.querySelectorAll('.schet-vybor')] as HTMLElement[]
  click(выборы[0])
  await wait(150)
  const пунктыОткуда = [...document.querySelectorAll('.schet-pop .schet-opt')].map((о) => (о.textContent || '').trim())
  check('в списке счетов — значки, а не служебные имена',
    document.querySelectorAll('.schet-pop .schet-opt .avatar').length === пунктыОткуда.length && !пунктыОткуда.some((п) => /credit-card/.test(п)),
    пунктыОткуда.join(' | '))
  check('платить с самого кредита нельзя', пунктыОткуда.length > 0 && !пунктыОткуда.includes('Рассрочка на технику'), пунктыОткуда.join(' | '))
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await wait(150)
  check('Escape закрыл только список', !document.querySelector('.schet-pop') && !!document.querySelector('.modal'))
  check('кредит выбран', (выборы[1]?.textContent || '').includes('Рассрочка на технику'), выборы[1]?.textContent ?? '')
  check('сумма — платёж по графику', ((окно.querySelector('input[inputmode="decimal"]') as HTMLInputElement)?.value || '').replace(/\s/g, '') === '9150')
  check('видно, сколько уйдёт в расходы', (окно.textContent || '').includes('В расходы попадёт'))
  check('категории для платежа не спрашиваются', !(окно.textContent || '').includes('Категория'))
  const операцийБыло = было.transactions.length
  click(byText('.modal-foot .btn', 'Добавить'))
  await wait(1300)
  check('окно закрылось', !document.querySelector('.modal'))
  const стало = await loadVault()
  const новые = стало.transactions.filter((т) => !было.transactions.some((б) => б.id === т.id))
  const платёжъ = новые[0]
  check('записан один расход с пометкой кредита',
    новые.length === 1 && стало.transactions.length === операцийБыло + 1 && платёжъ.kind === 'expense' && платёжъ.debtId === 'acc_credit' && платёжъ.accountId !== 'acc_credit',
    JSON.stringify(новые))
  check('ставка 19,9%: расход разделён на тело и проценты',
    платёжъ?.splits?.length === 2 && платёжъ.splits.reduce((s, x) => s + x.amount, 0) === 9_150_00
      && платёжъ.splits.some((x) => x.categoryId === 'cat_credit_interest'), JSON.stringify(платёжъ?.splits))
  const рассрочкаСтала = стало.accounts.find((a) => a.id === 'acc_credit')!
  check('долг уменьшился ровно на тело',
    creditRemaining(рассрочкаСтала, стало.transactions) === долгъБылъ - (платёжъ?.debtPrincipal ?? -1),
    `${долгъБылъ} → ${creditRemaining(рассрочкаСтала, стало.transactions)}, тело ${платёжъ?.debtPrincipal}`)
  check('статьи платежей и процентов заведены',
    стало.categories.some((к) => к.id === 'cat_credit_pay') && стало.categories.some((к) => к.id === 'cat_credit_interest'))
}

/** Ввести текст в поле так, чтобы React увидел (см. примечание в besjeda). */
function вписатьВъ(поле: HTMLInputElement, что: string) {
  поле.focus()
  поле.dispatchEvent(new dom.window.Event('focusin', { bubbles: true }))
  поле.value = что
  ;(поле as any)._valueTracker?.setValue('')
  поле.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  поле.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: 'а', bubbles: true }))
}

/*
 * Пункты из видео: операции счёта открываются с его фильтром, новая запись
 * берёт этот счёт, подсказка тега не теряет набранное, теги правятся разом.
 */
async function поВидео() {
  console.log('\n— пункты из видео —')
  await open('Счета')
  const карточка = [...document.querySelectorAll('.view .card')].find((к) => к.querySelector('.strong')?.textContent === 'Наличные')
  click([...(карточка?.querySelectorAll('.btn') ?? [])].find((б) => (б.textContent || '').trim() === 'Операции'))
  await wait(500)
  const фильтръ = document.querySelector('.view .schet-vybor:not(.kat-vybor)')
  check('«Операции» у счёта открываются с его фильтром', (фильтръ?.textContent || '').includes('Наличные'), фильтръ?.textContent ?? '')
  const vault = await loadVault()
  const съ = addMonths(today(), -3)
  const наличныхъ = vault.transactions.filter((т) => (т.accountId === 'acc_cash' || т.toAccountId === 'acc_cash') && т.date >= съ && т.date <= today()).length
  const заголовокъ = (document.querySelector('.view .view-sub')?.textContent || '').trim()
  check('и показывают только его операции', заголовокъ.startsWith(`${наличныхъ} `), `${заголовокъ} против ${наличныхъ}`)

  click(byText('.view-head .btn', 'Добавить'))
  await wait(400)
  const счётЗаписи = document.querySelector('.modal .schet-vybor')
  check('новая запись берёт открытый счёт', (счётЗаписи?.textContent || '').includes('Наличные'), счётЗаписи?.textContent ?? '')

  // Подсказка тега: нажатие мыши не уводит фокус из поля.
  const полеТега = [...document.querySelectorAll('.modal input')].find((и) => (и as HTMLInputElement).placeholder === 'Добавить тег и Enter') as HTMLInputElement
  вписатьВъ(полеТега, 'ра')
  await wait(100)
  const подсказка = byText('.modal .chip', '#работа')
  check('подсказка тега нашлась по началу слова', !!подсказка)
  const нажатие = new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true })
  подсказка?.dispatchEvent(нажатие)
  check('нажатие на подсказку не уводит фокус (недописанное не добавится)', нажатие.defaultPrevented)
  click(подсказка)
  await wait(100)
  const поставлены = [...document.querySelectorAll('.modal .chip.on')].map((ч) => (ч.textContent || '').trim())
  check('добавился весь тег, а не набранный кусок', поставлены.some((т) => т.startsWith('#работа')) && !поставлены.some((т) => т.startsWith('#ра ')), поставлены.join(' | '))
  click(byText('.modal-foot .btn', 'Отмена'))
  await wait(300)

  // Правка тегов разом.
  await open('Операции')
  const сброс = byText('.view .btn', 'Сбросить')
  if (сброс) click(сброс)
  await wait(200)
  click(byText('.view .btn', 'Править теги'))
  await wait(400)
  const строка = [...document.querySelectorAll('.modal .row')].find((р) => ((р.querySelector('input') as HTMLInputElement | null)?.value) === 'закупка')
  check('в окне тегов есть тег из операций', !!строка)
  const поле = строка?.querySelector('input') as HTMLInputElement
  // Поле внутри окна-портала: события ввода до React здесь не доходят,
  // поэтому зовём его обработчик напрямую — так же, как в других проверках.
  const свойства = Object.entries(поле).find(([к]) => к.startsWith('__reactProps$'))?.[1] as { onChange?: (e: unknown) => void } | undefined
  свойства?.onChange?.({ target: { value: 'закупки' } })
  await wait(150)
  const кнопкаПереименовать = [...(строка?.querySelectorAll('.btn') ?? [])].find((б) => (б.textContent || '').includes('Переименовать')) as HTMLButtonElement
  check('кнопка «Переименовать» ожила после правки', !!кнопкаПереименовать && !кнопкаПереименовать.disabled)
  click(кнопкаПереименовать)
  await wait(1300)
  const послѣ = await loadVault()
  check('тег переименован во всех операциях',
    !послѣ.transactions.some((т) => т.tags.includes('закупка')) && послѣ.transactions.some((т) => т.tags.includes('закупки')))
  click(byText('.modal-foot .btn', 'Готово'))
  await wait(300)
}

/*
 * Дашборд кредита и уведомление о платеже. В хранилище заранее лежит одно
 * ждущее уведомление по «Рассрочке на технику» (см. seedStorage).
 */
async function дашбордКредитаИУведомленія() {
  console.log('\n— дашборд кредита и уведомления —')
  await open('Дашборд')
  click(byText('.hero .btn', 'Итого'))
  await wait(200)
  click([...document.querySelectorAll('.hero .cat-row')].find((р) => (р.textContent || '').includes('Рассрочка на технику')))
  await wait(400)
  const панель = document.querySelector('.kredit-dash')
  const vault = await loadVault()
  const долгъ = creditRemaining(vault.accounts.find((a) => a.id === 'acc_credit')!, vault.transactions)
  check('при выборе кредита на главной — его дашборд', !!панель && (панель.textContent || '').includes('Осталось погасить'))
  check('и в нём тот же долг', (панель?.textContent || '').replace(/\s/g, '').includes(money(долгъ).replace(/\s/g, '')), money(долгъ))
  check('есть следующий платёж и кнопка платежа',
    (панель?.textContent || '').includes('Следующий платёж') && !!byText('.kredit-dash .btn', 'Внести платёж'))
  click(byText('.hero .btn', 'Рассрочка на технику'))
  await wait(200)
  click([...document.querySelectorAll('.hero .cat-row')].find((р) => (р.textContent || '').includes('Итого')))
  await wait(300)
  check('на «Итого» панели кредита нет', !document.querySelector('.kredit-dash'))

  const колокольчикъ = [...document.querySelectorAll('.ribbon .ribbon-btn')].find((б) => (б.getAttribute('title') || '').startsWith('Уведомления')) as HTMLElement
  check('на колокольчике — число ждущих', колокольчикъ?.querySelector('.nav-badge')?.textContent === '1', колокольчикъ?.getAttribute('title') ?? '')
  click(колокольчикъ)
  await wait(400)
  check('в окне — платёж по кредиту', (document.querySelector('.modal')?.textContent || '').includes('Платёж по кредиту «Рассрочка на технику»'))
  const былоОпераций = (await loadVault()).transactions.length
  click(byText('.modal .btn', 'Платёж прошёл'))
  await wait(1300)
  const стало = await loadVault()
  const ответъ = стало.notifications?.find((n) => n.id === 'n_test')
  check('ответ сохранён в истории с операцией', ответъ?.status === 'paid' && (ответъ.txIds?.length ?? 0) === 1, JSON.stringify(ответъ))
  check('и платёж записан', стало.transactions.length === былоОпераций + 1
    && стало.transactions.some((т) => т.id === ответъ?.txIds?.[0] && т.debtId === 'acc_credit'))
  check('в окне — история', (document.querySelector('.modal')?.textContent || '').includes('прошёл'))
  check('число на колокольчике ушло', !колокольчикъ.querySelector('.nav-badge'))
  click(byText('.modal-foot .btn', 'Закрыть'))
  await wait(300)
}

/*
 * Виджеты правой панели: карандаш включает правку, виджет убирается,
 * добавляется, переставляется, а «Вернуть как было» возвращает набор.
 */
async function виджеты() {
  console.log('\n— виджеты справа —')
  const панель = () => document.querySelector('.rightbar') as HTMLElement | null
  const карандашъ = () => панель()?.querySelector('.sidebar-head .icon-btn') as HTMLElement | null
  const правимые = () => [...(панель()?.querySelectorAll('.widget-edit') ?? [])].map((в) => в.getAttribute('data-widget'))
  const настройки = async () => (await loadVault()).settings?.rightWidgets
  check('в шапке сводки есть кнопка настройки', !!карандашъ())
  click(карандашъ())
  await wait(250)
  check('в правке — все виджеты по умолчанию, даже пустые', правимые().join(',') === 'month,attention,upcoming,goals,rank,forecast', правимые().join(','))
  const крестикъ = (w: string) => [...(панель()?.querySelector(`.widget-edit[data-widget="${w}"]`)?.querySelectorAll('.icon-btn') ?? [])]
    .find((б) => б.getAttribute('title') === 'Убрать виджет') as HTMLElement
  click(крестикъ('forecast'))
  await wait(1300)
  check('виджет убран и это сохранено', !правимые().includes('forecast') && !(await настройки())?.includes('forecast'), JSON.stringify(await настройки()))
  const добавить = (подпись: string) => [...(панель()?.querySelectorAll('.chip') ?? [])].find((ч) => (ч.textContent || '').includes(подпись)) as HTMLElement
  check('убранный можно вернуть из «Добавить виджет»', !!добавить('Прогноз на год'))
  click(добавить('Счета'))
  await wait(300)
  check('новый виджет «Счета» добавился в конец', правимые().at(-1) === 'accounts', правимые().join(','))
  const выше = [...(панель()?.querySelector('.widget-edit[data-widget="accounts"]')?.querySelectorAll('.icon-btn') ?? [])]
    .find((б) => б.getAttribute('title') === 'Выше') as HTMLElement
  click(выше)
  await wait(1300)
  const порядокъ = правимые()
  check('виджет переставлен выше', порядокъ.indexOf('accounts') === порядокъ.length - 2, порядокъ.join(','))
  check('порядок сохранён', JSON.stringify(await настройки()) === JSON.stringify(порядокъ), JSON.stringify(await настройки()))
  click(карандашъ())
  await wait(250)
  const текстъ = панель()?.textContent || ''
  check('после правки: прогноза нет, счета есть', !текстъ.includes('Прогноз на год') && !!панель()?.querySelector('.avatar'))
  click(карандашъ())
  await wait(250)
  click(byText('.rightbar .btn', 'Вернуть как было'))
  await wait(1300)
  check('«Вернуть как было» — снова набор по умолчанию', правимые().join(',') === 'month,attention,upcoming,goals,rank,forecast' && !(await настройки()), правимые().join(','))
  click(карандашъ())
  await wait(250)
}

/*
 * Быстрый ввод: видно, на какой счёт уйдёт запись, счёт можно сменить,
 * а подтверждение называет счёт. Перевод не записывается без счёта
 * назначения — открывается подробная форма.
 */
async function быстрыйВводСчётъ() {
  console.log('\n— быстрый ввод: счёт записи —')
  await open('Дашборд')
  click(byText('.hero .btn', 'Расход'))
  await wait(400)
  const окно = () => byText('.modal', 'Быстрый ввод') as HTMLElement | null
  const выборъ = окно()?.querySelector('.schet-vybor') as HTMLElement | null
  check('в быстром вводе виден счёт записи', !!выборъ && (выборъ.textContent || '').trim().length > 0, выборъ?.textContent ?? '')
  click(выборъ)
  await wait(150)
  const наличные = [...document.querySelectorAll('.schet-pop .schet-opt')].find((о) => (о.textContent || '').includes('Наличные')) as HTMLElement
  click(наличные)
  await wait(150)
  check('счёт меняется руками', (выборъ?.textContent || '').includes('Наличные'))
  const поле = окно()?.querySelector('input') as HTMLInputElement
  const свойства = Object.entries(поле).find(([к]) => к.startsWith('__reactProps$'))?.[1] as { onChange?: (e: unknown) => void } | undefined
  свойства?.onChange?.({ target: { value: 'проверка 77' } })
  await wait(150)
  const было = (await loadVault()).transactions.length
  click(byText('.modal-foot .btn', 'Записать'))
  await wait(1300)
  const стало = await loadVault()
  const новая = стало.transactions.find((т) => т.note === 'проверка')
  check('запись ушла на выбранный счёт', стало.transactions.length === было + 1 && новая?.accountId === 'acc_cash', JSON.stringify(новая))
  check('подтверждение называет счёт', text().includes('записан на «Наличные»'))

  click(byText('.hero .btn', 'Расход'))
  await wait(400)
  click([...(окно()?.querySelectorAll('.seg button') ?? [])].find((б) => (б.textContent || '').trim() === 'Перевод'))
  await wait(150)
  const поле2 = окно()?.querySelector('input') as HTMLInputElement
  const свойства2 = Object.entries(поле2).find(([к]) => к.startsWith('__reactProps$'))?.[1] as { onChange?: (e: unknown) => void } | undefined
  свойства2?.onChange?.({ target: { value: 'в копилку 500' } })
  await wait(150)
  const было2 = (await loadVault()).transactions.length
  click(byText('.modal-foot .btn', 'Дальше'))
  await wait(500)
  check('перевод без счёта назначения не записывается сразу', (await loadVault()).transactions.length === было2)
  check('а открывает подробную форму с «На счёт»', !!byText('.modal', 'На счёт') && !!byText('.modal', 'Новая операция'))
  click(byText('.modal-foot .btn', 'Отмена'))
  await wait(300)
}

/*
 * Подкатегории: категория создаётся прямо из быстрого ввода, правым щелчком
 * становится подкатегорией, отчёты складывают её в главную и раскрывают.
 */
async function подкатегорииЭкраны() {
  console.log('\n— подкатегории —')
  const ввести = (поле: Element | null | undefined, значение: string) => {
    const с = Object.entries(поле ?? {}).find(([к]) => к.startsWith('__reactProps$'))?.[1] as { onChange?: (e: unknown) => void } | undefined
    с?.onChange?.({ target: { value: значение } })
  }
  const правыйЩелчок = (el: Element | undefined) =>
    el?.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }))
  const окно = () => byText('.modal', 'Быстрый ввод') as HTMLElement | null
  const плитки = () => [...(окно()?.querySelectorAll('.qa-tile-btn') ?? [])]
  const закрытьВвод = () => click(окно()?.querySelector('.icon-btn[title^="Закрыть"]'))
  await open('Дашборд')
  click(byText('.hero .btn', 'Расход'))
  await wait(400)
  ввести(окно()?.querySelector('.qa-poisk'), 'Таня Челяба')
  await wait(150)
  check('поиск в быстром вводе: ничего не нашлось', text().includes('Ничего не нашлось — можно создать категорию.'))
  click(плитки().find((б) => (б.textContent || '').includes('Создать')))
  await wait(300)
  const новаяОкно = byText('.modal', 'Создание категории') as HTMLElement | null
  check('«Создать» открывает окно новой категории с набранным именем',
    !!новаяОкно && [...новаяОкно.querySelectorAll('input')].some((и) => (и as HTMLInputElement).value === 'Таня Челяба'))
  click(byText('.modal-foot .btn.primary', 'Сохранить'))
  await wait(300)
  check('новая категория выбрана в быстром вводе', (окно()?.querySelector('.qa-tile.on')?.textContent || '').includes('Таня Челяба'))
  ввести(окно()?.querySelector('input:not(.qa-poisk)'), 'билеты 1500')
  await wait(150)
  click(byText('.modal-foot .btn', 'Записать'))
  await wait(1300)
  let vault = await loadVault()
  const таня = vault.categories.find((к) => к.name === 'Таня Челяба')
  check('категория и запись сохранены', !!таня && vault.transactions.some((т) => т.categoryId === таня.id && т.amount === 1500_00))

  click(byText('.hero .btn', 'Расход'))
  await wait(400)
  ввести(окно()?.querySelector('.qa-poisk'), 'челяб')
  await wait(150)
  const плитка = плитки().find((б) => (б.textContent || '').includes('Таня Челяба'))
  check('поиск находит категорию', !!плитка)
  правыйЩелчок(плитка)
  await wait(150)
  check('правый щелчок открывает меню категории', !!menuItem('Изменить') && !!menuItem('Удалить') && !!menuItem('Сделать подкатегорией'))
  // Щелчок мимо меню — внутри окна быстрого ввода — закрывает меню.
  окно()?.querySelector('.qa-poisk')?.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }))
  await wait(100)
  check('щелчок мимо закрывает меню категории', !menuItem('Изменить'))
  правыйЩелчок(плитка)
  await wait(150)
  click(menuItem('Сделать подкатегорией'))
  await wait(100)
  click(all('.ctx-sub .ctx-item').find((б) => (б.textContent || '').trim() === 'Продукты'))
  await wait(1300)
  vault = await loadVault()
  check('категория стала подкатегорией «Продуктов»', vault.categories.find((к) => к.id === таня?.id)?.parentId === vault.categories.find((к) => к.name === 'Продукты')?.id)
  check('плитка подписана главной', (плитки().find((б) => (б.textContent || '').includes('Таня Челяба'))?.textContent || '').includes('Продукты'))
  ввести(окно()?.querySelector('.qa-poisk'), 'продук')
  await wait(150)
  check('поиск по главной находит и подкатегорию', плитки().some((б) => (б.textContent || '').includes('Таня Челяба')))
  закрытьВвод()
  await wait(300)

  await open('Дашборд')
  const строки = () => all('.view .cat-row')
  check('на сводке подкатегория сложена в главную', !строки().some((с) => (с.textContent || '').includes('Таня Челяба')))
  click(строки().find((с) => (с.querySelector('.name')?.textContent || '').trim() === 'Продукты'))
  await wait(300)
  check('щелчок по главной раскрывает подкатегории', !!byText('.view .btn', 'Все категории') &&
    строки().some((с) => (с.textContent || '').includes('Таня Челяба')) &&
    строки().some((с) => (с.textContent || '').includes('Продукты — без подкатегории')))
  click(byText('.view .btn', 'Все категории'))
  await wait(300)
  check('«Все категории» возвращает сложенный вид', !строки().some((с) => (с.textContent || '').includes('Таня Челяба')))

  await open('Категории')
  const карточка = all('.view .card').find((к) => [...к.querySelectorAll('.btn')].some((б) => (б.textContent || '').includes('Подкатегории: 1')))
  check('в «Категориях» у главной кнопка подкатегорий', !!карточка && (карточка.textContent || '').includes('Продукты'))
  click([...(карточка?.querySelectorAll('.btn') ?? [])].find((б) => (б.textContent || '').includes('Подкатегории: 1')))
  await wait(200)
  check('кнопка раскрывает подкатегории', (карточка?.querySelector('.kat-deti')?.textContent || '').includes('Таня Челяба'))

  await open('Бюджет')
  check('в «Бюджете» подкатегория под главной', all('.view tr.budget-pod').some((с) => (с.textContent || '').includes('Таня Челяба')))

  await open('Операции')
  click(document.querySelector('.view .kat-vybor'))
  await wait(150)
  ввести(document.querySelector('.kat-pop .kat-poisk'), 'продук')
  await wait(150)
  const пункты = all('.kat-spisok .schet-opt')
  check('поиск в фильтре категорий', пункты.some((п) => (п.textContent || '').includes('Таня Челяба')) &&
    !пункты.some((п) => (п.textContent || '').includes('Транспорт')))
  click(пункты.find((п) => (п.textContent || '').trim() === 'Продукты'))
  await wait(300)
  check('фильтр главной показывает и записи подкатегории', text().includes('билеты'))

  await open('Дашборд')
  click(byText('.hero .btn', 'Расход'))
  await wait(400)
  ввести(окно()?.querySelector('.qa-poisk'), 'челяб')
  await wait(150)
  правыйЩелчок(плитки().find((б) => (б.textContent || '').includes('Таня Челяба')))
  await wait(150)
  click(menuItem('Удалить'))
  await wait(200)
  check('подкатегория удаляется без вопроса', !byText('.modal', 'Удалить «Таня Челяба»?'))
  await wait(1100)
  vault = await loadVault()
  check('удаление из меню убирает категорию', !vault.categories.some((к) => к.id === таня?.id))
  закрытьВвод()
  await wait(300)
}

/*
 * «Отменить» после удаления, «О программе» и «Что нового».
 */
async function отменаИВерсия(root: Root): Promise<Root> {
  console.log('\n— отмена удаления —')
  /** Кнопка «Отменить» в уведомлении с этим текстом. */
  const отменить = (про: string) =>
    all('[data-sonner-toast]').filter((т) => (т.textContent || '').includes(про))
      .map((т) => т.querySelector('[data-button]'))
      .find((б) => (б?.textContent || '').includes('Отменить')) as HTMLElement | undefined

  // операция: из окна, без вопроса
  await open('Дашборд')
  const было = (await loadVault()).transactions.length
  click(document.querySelector('.view .tx-row'))
  await wait(400)
  click(byText('.modal-foot .btn.danger', 'Удалить'))
  await wait(300)
  check('операция удаляется без окна «Удалить?»', !byText('.modal', 'Удалить операцию?'))
  await wait(1100)
  check('операция удалена', (await loadVault()).transactions.length === было - 1)
  const кнопкаОп = отменить('Операция удалена')
  check('в уведомлении есть «Отменить»', !!кнопкаОп)
  click(кнопкаОп)
  await wait(1300)
  check('«Отменить» возвращает операцию', (await loadVault()).transactions.length === было)

  // категория без подкатегорий: сразу, с отменой и на своём месте
  await open('Категории')
  const vault0 = await loadVault()
  const жертва = vault0.categories.find((к) => к.name === 'Кафе')!
  const место = vault0.categories.findIndex((к) => к.id === жертва.id)
  const карточка = all('.view .card').find((к) => (к.textContent || '').includes('Кафе') && к.querySelector('.btn.danger'))
  click(карточка?.querySelector('.btn.danger'))
  await wait(1300)
  check('категория без подкатегорий удаляется без вопроса', !byText('.modal', 'Удалить «Кафе»?') &&
    !(await loadVault()).categories.some((к) => к.id === жертва.id))
  click(отменить('Категория «Кафе» удалена'))
  await wait(1300)
  const vault1 = await loadVault()
  check('категория вернулась на своё место', vault1.categories.findIndex((к) => к.id === жертва.id) === место)

  // цель
  await open('Цели')
  const цели = (await loadVault()).goals
  if (цели.length) {
    click(all('.view .btn.sm.danger')[0])
    await wait(1300)
    check('цель удаляется без вопроса', (await loadVault()).goals.length === цели.length - 1)
    click(отменить('удалена'))
    await wait(1300)
    check('цель вернулась', (await loadVault()).goals.map((г) => г.id).join() === цели.map((г) => г.id).join())
  }

  // заметка: файл уходит и возвращается тем же текстом
  await open('Заметки')
  const ls = dom.window.localStorage
  const заметки = Object.keys(ls).filter((k) => k.startsWith('kashel:notes/'))
  const заголовокЗаметки = document.querySelector('.icon-btn[title="Удалить заметку"]')
  click(заголовокЗаметки)
  await wait(500)
  const осталось = Object.keys(ls).filter((k) => k.startsWith('kashel:notes/'))
  const ушла = заметки.find((k) => !осталось.includes(k))
  check('заметка удаляется без вопроса', !!ушла && осталось.length === заметки.length - 1)
  click(отменить('Заметка'))
  await wait(600)
  check('заметка вернулась', Object.keys(ls).filter((k) => k.startsWith('kashel:notes/')).length === заметки.length)

  console.log('\n— версия —')
  await open('Настройки')
  check('в «О программе» видна версия', text().includes('Кошель, версия 1.0.1'))
  click(byText('.view .btn', 'Что нового'))
  await wait(300)
  check('«Что нового» открывается из настроек', !!byText('.modal', 'Версия 1.0.1'))
  click(byText('.modal-foot .btn', 'Понятно'))
  await wait(300)
  check('в браузере раздел копий объясняет, где они делаются', text().includes('Резервные копии делает программа на компьютере'))

  // после обновления «Что нового» показывается один раз
  const ядро = JSON.parse(ls.getItem('kashel:data.json')!)
  delete ядро.settings.whatsNewSeen
  ls.setItem('kashel:data.json', JSON.stringify(ядро))
  root.unmount()
  await wait(250)
  let next = mount()
  await wait(1800)
  check('после обновления показывается «Что нового»', !!byText('.modal', 'Версия 1.0.1'))
  click(byText('.modal-foot .btn', 'Понятно'))
  await wait(1300)
  check('отметка «видел» сохранена', JSON.parse(ls.getItem('kashel:data.json')!).settings.whatsNewSeen === '1.0.1')
  check('программа отметила свою версию', JSON.parse(ls.getItem('kashel:data.json')!).settings.appVersion === '1.0.1')
  next.unmount()
  await wait(250)
  next = mount()
  await wait(1800)
  check('второй раз окно не показывается', !byText('.modal', 'Что нового'))
  return next
}

async function main() {
  seedStorage()
  let root = mount()
  await wait(1700)

  await sections()
  await updates()
  await besjeda()
  await rightPanel()
  await виджеты()
  await leftPanel()
  await значкиВъСпискахъ()
  await пончикъ()
  await недѣляИКалендарикъ()
  await пополненіеЦѣли()
  await кредиты()
  await поВидео()
  await быстрыйВводСчётъ()
  await подкатегорииЭкраны()
  await дашбордКредитаИУведомленія()
  await конструкторъОформленія()
  await themes()
  await cardGlare()
  await canvasBoard()
  await canvasText()
  await dashboardWipe()
  await transactionsBulk()
  await entryDateFollowsPeriod()
  root = await persistence(root)
  root = await отменаИВерсия(root)
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
