// Английское окно в jsdom: разделы и окна открываются без ошибок, и на экране
// нет русских слов, кроме тех, что лежат в самих данных человека.
// Запуск: npm run uitest:en
//
// Сторож в самопроверке ловит русскую строку в исходнике. Здесь ловится то,
// чего по исходнику не видно: строка, собранная из кусков, названия дней и
// месяцев из date.ts, ответы движков, которые рисуются уже готовым текстом.
import { поставитьЯзык, ГДѢ_ЯЗЫКЪ } from '../src/i18n'
import { JSDOM } from 'jsdom'
import React from 'react'
import type { VaultData } from '../src/lib/types'

// Язык ставится до загрузки программы — как в main.tsx: константы модулей
// вычисляются при загрузке. Потому всё прочее ниже грузится через import() —
// в том числе оснастка: она тянет за собой date.ts с названиями месяцев.
поставитьЯзык('en')

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
g.Element = dom.window.Element
g.Event = dom.window.Event
g.MouseEvent = dom.window.MouseEvent
g.KeyboardEvent = dom.window.KeyboardEvent
g.MutationObserver = dom.window.MutationObserver
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
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
;(dom.window as any).ResizeObserver = ResizeObserverStub
dom.window.Element.prototype.scrollIntoView = function () {}
;(dom.window as any).matchMedia = (query: string) => ({
  media: query, matches: false, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})
// Ollama в тесте нет: модель «не найдена», и раздел рисует подсказку.
g.fetch = async () => { throw new Error('нет сети в тесте') }

const renderErrors: string[] = []
const ENV_NOISE = /Not implemented:|getContext|attachEvent|detachEvent|InputEventPolyfill/
console.error = (...a: any[]) => {
  const line = a.map((x) => (x instanceof Error ? x.stack : String(x))).join(' ')
  if (!ENV_NOISE.test(line)) renderErrors.push(line)
}
process.on('uncaughtException', (e) => renderErrors.push('НЕПОЙМАННОЕ: ' + (e as Error).message))

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const text = () => (document.body.textContent || '').replace(/\s+/g, ' ')
const click = (el: any) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
const key = (k: string, opts: Record<string, unknown> = {}) =>
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
const byText = (sel: string, needle: string) =>
  [...document.querySelectorAll(sel)].find((e) => (e.textContent || '').includes(needle)) as any

const fails: string[] = []
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fails.push(name)
}

/*
 * Русские слова, которым на экране быть можно: всё, что лежит в данных
 * оснастки, — названия статей, счетов, заметок, комментарии. Их программа
 * не переводит и не должна.
 */
let data: VaultData
let notes: Record<string, string>
let canvas: unknown
const СЛОВО = /[а-яёѣіА-ЯЁѢІ][а-яёѣіА-ЯЁѢІ-]*/g
let изДанныхъ = new Set<string>()
/**
 * Русские слова на экране, которых нет в данных, — с текстом узла для поиска.
 * Идём по текстовым узлам, а не по textContent целиком: соседние подписи
 * слипаются в одно слово («ДомПродукты»), и его нет в данных.
 */
function чужія(): string[] {
  const итогъ = new Map<string, string>()
  const обходъ = document.createTreeWalker(document.body, 4 /* NodeFilter.SHOW_TEXT */)
  for (let n = обходъ.nextNode(); n; n = обходъ.nextNode()) {
    const т = n.textContent || ''
    for (const м of т.matchAll(СЛОВО)) {
      const w = м[0].toLowerCase()
      if (изДанныхъ.has(w) || итогъ.has(w)) continue
      // выдержка из заметки обрезана посреди слова: «Смо…» — начало слова из данных
      if (м.index! + м[0].length === т.length && [...изДанныхъ].some((д) => д.startsWith(w))) continue
      итогъ.set(w, т.trim().slice(0, 90))
    }
  }
  return [...итогъ.values()]
}

function seedStorage() {
  const { transactions, ...core } = data
  const ls = dom.window.localStorage
  ls.clear()
  ls.setItem(ГДѢ_ЯЗЫКЪ, 'en')
  ls.setItem('kashel:data.json', JSON.stringify({ ...core, settings: { ...core.settings, language: 'en', whatsNewSeen: '99.0.0' } }))
  const byMonth = new Map<string, typeof transactions>()
  for (const t of transactions) {
    const mk = t.date.slice(0, 7)
    byMonth.set(mk, [...(byMonth.get(mk) || []), t])
  }
  for (const [mk, list] of byMonth) ls.setItem(`kashel:transactions/${mk}.json`, JSON.stringify(list))
  for (const [title, body] of Object.entries(notes)) ls.setItem(`kashel:notes/${title}.md`, body)
  ls.setItem('kashel:canvas/Схема финансов.canvas', JSON.stringify(canvas))
}

async function main() {
  const { buildSeed, seedCanvas, seedNotes } = await import('./fixture')
  data = buildSeed()
  notes = seedNotes()
  canvas = seedCanvas(data)
  изДанныхъ = new Set(
    (JSON.stringify(data) + JSON.stringify(notes) + Object.keys(notes).join(' ') + JSON.stringify(canvas))
      .match(СЛОВО)!.map((w) => w.toLowerCase()),
  )
  // переключатель языка подписан на обоих языках нарочно
  for (const w of ['язык', 'русский', 'схема', 'финансов']) изДанныхъ.add(w)
  seedStorage()
  const [{ createRoot }, { default: App }, { StoreProvider }, { ToastProvider }, { EN }, { MONTHS }] = await Promise.all([
    import('react-dom/client'),
    import('../src/App'),
    import('../src/state/store'),
    import('../src/components/ui'),
    import('../src/i18n/en'),
    import('../src/lib/date'),
  ])
  // Перезапуск окна при расхождении языка — поломка: здесь язык уже совпадает.
  let перезапускъ = false
  try {
    Object.defineProperty(dom.window.location, 'reload', { value: () => { перезапускъ = true }, configurable: true })
  } catch { /* jsdom не дал подменить — тогда проверка ниже просто не сработает */ }

  createRoot(document.getElementById('root')!).render(
    React.createElement(StoreProvider, null, React.createElement(ToastProvider, null, React.createElement(App))),
  )
  await wait(1700)

  console.log('\n— английское окно —')
  check('окно не перезапускается, когда язык уже тот', !перезапускъ)
  check('в меню разделов английские названия', !!byText('.nav-item', 'Dashboard') && !!byText('.nav-item', 'Transactions'))
  check('месяцы по-английски', MONTHS[8] === 'September')

  console.log('\n— разделы —')
  const разделы = [...document.querySelectorAll('.sidebar .nav-item')] as HTMLElement[]
  check('разделов в меню не меньше двадцати', разделы.length >= 20, String(разделы.length))
  const всѣЧужія = new Map<string, string[]>()
  for (const кнопка of разделы) {
    const имя = (кнопка.textContent || '').trim()
    const было = renderErrors.length
    click(кнопка)
    await wait(450)
    const ч = чужія()
    if (ч.length) всѣЧужія.set(имя, ч)
    check(имя, renderErrors.length === было && text().length > 400 && ч.length === 0, ч.slice(0, 4).join(' ‖ '))
  }

  console.log('\n— окна —')
  // Палитра команд
  key('p', { ctrlKey: true })
  await wait(300)
  let ч = чужія()
  check('палитра команд', !!document.querySelector('.palette, .cmdk, [class*="palette"]') && ч.length === 0, ч.slice(0, 4).join(' ‖ '))
  key('Escape')
  await wait(250)

  // Новая операция
  const новая = byText('button', EN['Операция'] ?? 'Transaction')
  if (новая) {
    click(новая)
    await wait(400)
    ч = чужія()
    check('карточка новой операции', !!document.querySelector('.modal') && ч.length === 0, ч.slice(0, 4).join(' ‖ '))
    key('Escape')
    await wait(300)
  } else {
    check('кнопка новой операции нашлась', false)
  }

  // Настройки: переключатель языка стоит на английском
  const настройки = разделы.find((b) => (b.textContent || '').includes('Settings'))
  if (настройки) click(настройки)
  await wait(450)
  const выборъ = [...document.querySelectorAll('select')].find((s) => [...(s as HTMLSelectElement).options].some((o) => o.value === 'en')) as HTMLSelectElement | undefined
  check('в настройках выбран английский', выборъ?.value === 'en', выборъ?.value)

  console.log(`\nошибок рендера: ${renderErrors.length}`)
  for (const e of renderErrors.slice(0, 5)) console.log('  • ' + e.slice(0, 1200))
  console.log(`провалено проверок: ${fails.length}`)
  for (const f of fails) console.log('  ✗ ' + f)
  process.exit(fails.length || renderErrors.length ? 1 : 0)
}

main().catch((e) => {
  console.log('ФАТАЛЬНО:', e)
  process.exit(2)
})
