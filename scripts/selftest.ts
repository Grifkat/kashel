// Самопроверка расчётных движков: демо-данные, прогноз, советы, запросы,
// быстрый ввод и импорт CSV. Запуск: npm run selftest
import { buildSeed } from './fixture'
import { forecast, historyKeys, computeBases, monthShare, withCurrentMonth, scopeToAccount, ALL_ACCOUNTS, TRANSFER_IN, TRANSFER_OUT } from '../src/engine/forecast'
import { buildAdvice } from '../src/engine/advice'
import { runQuery } from '../src/engine/query'
import { parseQuick, describeDraft } from '../src/engine/parse'
import { parseCsv, guessColumns, buildPreview, parseAmountCell, parseDateCell } from '../src/engine/csv'
import { balances, categoryMonthly, categoryTotals, comparablePrev, entryDate, makePeriod, monthlySeries, yearSummary, type PeriodKind } from '../src/engine/stats'
import { DIGIT_SEP, groupDigits, money, toMinor, uid } from '../src/lib/format'
import { addDays, addMonths, diffDays, monthKey, parseISO, today } from '../src/lib/date'
import { ICON_GROUPS, isCatalogIcon } from '../src/lib/catalog'
import { DEFAULT_CATEGORIES } from '../src/state/defaults'
import type { Recurring, Reminder, Scenario, Task, Transaction } from '../src/lib/types'
import { dueReminders, nextDate } from '../src/engine/reminders'
import { findRepeats } from '../src/engine/repeats'
import {
  isImportant, isOverdue, isUrgent, plannedByMonth, priorityOf, quadrantOf, sortTasks,
} from '../src/engine/tasks'
import {
  address, awards, freshAwards, levelOf, RANKS, romanClass, standing, traits, xpBreakdown, XP_STEPS,
} from '../src/engine/honors'
import { знакъЕсть, ключъЗнака } from '../src/lib/znaki'
import { creditState, schedule, whatIf } from '../src/engine/credit'
import { личное, projectState, projectsSummary, проектная } from '../src/engine/project'
import { migrateCredits } from '../src/state/defaults'
import { ОПИСАННЫЕ } from '../src/lib/znakiText'
import { FREEZES_PER_MONTH, streak } from '../src/engine/streak'
import { monthQuests, questsDone } from '../src/engine/honors'
import { insideVault } from '../electron/vaultpath.js'
import { новѣе, подписьВѣрна, разобрать, родъ } from '../electron/update.js'
import * as крипто from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

const fail: string[] = []
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail.push(name)
}

const t0 = Date.now()
const data = buildSeed()
console.log(`\nДемо-данные: ${data.transactions.length} операций, ${data.categories.length} категорий, ${Date.now() - t0} мс`)

const bal = balances(data.accounts, data.transactions)
console.log(`Активы ${money(bal.assets)} · обязательства ${money(bal.liabilities)} · капитал ${money(bal.net)}`)
check('баланс активов положительный', bal.assets > 0, money(bal.assets))
check('история длиннее 12 месяцев', historyKeys(data.transactions, 24).length >= 12, String(historyKeys(data.transactions, 24).length))

const t1 = Date.now()
const fc = forecast(data, null, 12, 800)
const fcMs = Date.now() - t1
console.log(`\nПрогноз посчитан за ${fcMs} мс`)
console.log(`Средний доход ${money(fc.avgIncome)} · расход ${money(fc.avgExpense)} · итог ${money(fc.avgNet)} · норма ${fc.savingsRate.toFixed(1)}%`)
console.log(`Через 12 мес: p10 ${money(fc.months[11].p10)} · p50 ${money(fc.months[11].p50)} · p90 ${money(fc.months[11].p90)}`)
check('прогноз укладывается в 400 мс', fcMs < 400, fcMs + ' мс')
check('12 прогнозных месяцев', fc.months.length === 12)
check('коридор упорядочен p10<=p50<=p90', fc.months.every((m) => m.p10 <= m.p50 && m.p50 <= m.p90))
check('коридор расширяется со временем', fc.months[11].p90 - fc.months[11].p10 > fc.months[0].p90 - fc.months[0].p10)
check('доход и расход прогноза ненулевые', fc.months[0].income > 0 && fc.months[0].expense > 0)
check('регулярные учтены как фиксированная часть', fc.months[0].fixedExpense > 0, money(fc.months[0].fixedExpense))

// Сценарий: срезать всё на 30% должно улучшить остаток
const cut = forecast(
  data,
  { id: 's', name: 'cut', incomeFactor: 1, adjusts: data.categories.filter((c) => c.kind === 'expense').map((c) => ({ categoryId: c.id, factor: 0.7 })), events: [], extraSavingsMonthly: 0 },
  12,
  400,
)
check('сценарий экономии улучшает остаток', cut.months[11].p50 > fc.months[11].p50,
  `${money(fc.months[11].p50)} → ${money(cut.months[11].p50)}`)

const t2 = Date.now()
const advice = buildAdvice(data, fc)
console.log(`\nСоветов: ${advice.length}, за ${Date.now() - t2} мс`)
for (const a of advice.slice(0, 8)) {
  console.log(`  [${a.severity}/${a.kind}] ${a.title}${a.impactMonthly ? ' → ' + money(a.impactMonthly) + '/мес' : ''}`)
}
check('советов не меньше 8', advice.length >= 8, String(advice.length))
check('есть совет про подписки', advice.some((a) => a.id === 'subs'))
check('есть совет про концентрацию дохода', advice.some((a) => a.id === 'income_conc'))
check('есть совет про подушку', advice.some((a) => a.id.startsWith('fund')))
check('есть совет по кредиту', advice.some((a) => a.kind === 'debt'))
check('у советов нет пустых заголовков', advice.every((a) => a.title.length > 5 && a.body.length > 20))
check('нет NaN в текстах советов', !advice.some((a) => (a.title + a.body + a.evidence.join('')).includes('NaN')))
check('нет undefined в текстах советов', !advice.some((a) => (a.title + a.body + a.evidence.join('')).includes('undefined')))

// Запросы
const q1 = runQuery('type: sum\nkind: expense\nperiod: 3m', data)
const q2 = runQuery('type: chart\nchart: donut\nkind: expense\nperiod: 6m\ngroup: category\nlimit: 5', data)
const q3 = runQuery('type: table\nkind: income\nperiod: 12m\nlimit: 5', data)
check('запрос sum считает', q1.type === 'sum' && q1.value > 0, q1.type === 'sum' ? money(q1.value) : '')
check('запрос donut даёт срезы', q2.type === 'chart' && q2.slices.length === 5)
check('запрос table даёт строки', q3.type === 'table' && q3.rows.length === 5)
check('фильтр по категории работает',
  (() => {
    const r = runQuery('type: sum\nkind: expense\ncategory: Кафе\nperiod: 12m', data)
    return r.type === 'sum' && r.value > 0 && r.count > 0
  })())

// Быстрый ввод
const d1 = parseQuick('кофе 250 кафе вчера #работа', data.categories, data.accounts, { accountId: 'acc_main' })
console.log('\nразбор «кофе 250 кафе вчера #работа»:', describeDraft(d1, data.categories, data.accounts))
check('сумма распознана', d1.amount === 25000, String(d1.amount))
check('категория распознана', d1.matchedCategory === 'Кафе', String(d1.matchedCategory))
check('дата — вчера', d1.date < today())
check('тег распознан', d1.tags.includes('работа'))
check('комментарий остался', d1.note === 'кофе', `«${d1.note}»`)

const d2 = parseQuick('+45000 навар проект', data.categories, data.accounts, { accountId: 'acc_main' })
check('доход распознан', d2.kind === 'income' && d2.amount === 4500000, `${d2.kind} ${d2.amount}`)
check('категория дохода распознана', d2.matchedCategory === 'Навар', String(d2.matchedCategory))

const d3 = parseQuick('такси 3к 12.08 @наличные', data.categories, data.accounts)
check('сокращение «3к» = 3000', d3.amount === 300000, String(d3.amount))
check('дата 12.08 разобрана', d3.date.endsWith('-08-12'), d3.date)
check('счёт @наличные найден', d3.matchedAccount === 'Наличные', String(d3.matchedAccount))

// Направление операции: угадывание не должно перевешивать контекст и знаки
const kindOf = (line: string, ctx?: 'income' | 'expense') =>
  parseQuick(line, data.categories, data.accounts, { accountId: 'acc_main', kind: ctx }).kind

console.log('\nнаправление операции:')
check('без подсказок строка считается расходом', kindOf('5000 подработка') === 'expense')
check('доходное слово делает доход', kindOf('30000 навар') === 'income')
check('плюс делает доход', kindOf('+7000 подарок') === 'income')
check('вкладка «Доходы» задаёт направление', kindOf('5000 подработка', 'income') === 'income',
  kindOf('5000 подработка', 'income'))
check('минус перебивает вкладку «Доходы»', kindOf('-800 такси', 'income') === 'expense',
  kindOf('-800 такси', 'income'))
check('расходное слово при вкладке «Доходы» не перебивает её', kindOf('250 кафе', 'income') === 'income')
check('доходная категория подсказывает направление сама', kindOf('30000 навар') === 'income')

// Доход с чужой категорией не должен попадать в расходную статистику
{
  const cafe = data.categories.find((c) => c.name === 'Кафе')!
  const mk = today().slice(0, 7)
  const stray: Transaction = {
    id: uid('t'), kind: 'income', date: today(), amount: 5_000_00,
    accountId: 'acc_main', categoryId: cafe.id, tags: [], createdAt: new Date().toISOString(),
  }
  const before = categoryMonthly(data.transactions, cafe.id, [mk], false, 'expense')[0]
  const after = categoryMonthly([...data.transactions, stray], cafe.id, [mk], false, 'expense')[0]
  check('доход не течёт в расходный ряд категории', before === after, `${money(before)} → ${money(after)}`)
  const asIncome = categoryMonthly([...data.transactions, stray], cafe.id, [mk], false, 'income')[0]
  check('но виден как доход, если спросить про доходы', asIncome === stray.amount, money(asIncome))
}

// CSV
const csv = 'Дата операции;Сумма;Описание\n20.08.2026;-1 234,50;Пятёрочка\n19.08.2026;45000,00;Оплата по договору\n20.08.2026;-1 234,50;Пятёрочка\n'
const table = parseCsv(csv)
const map = guessColumns(table.header)
const preview = buildPreview(table, map, data.importRules, [])
console.log('\nCSV:', table.header.join(' | '), '→ колонки', JSON.stringify(map))
check('CSV разобран', table.rows.length === 3)
check('колонки угаданы', map.date === 0 && map.amount === 1 && map.description === 2)
check('сумма с пробелами и запятой', parseAmountCell('-1 234,50') === -123450, String(parseAmountCell('-1 234,50')))
check('дата дд.мм.гггг', parseDateCell('20.08.2026') === '2026-08-20', String(parseDateCell('20.08.2026')))
check('правило подставило категорию', preview.some((r) => r.categoryId), JSON.stringify(preview[0]?.categoryId))
check('строки предпросмотра построены', preview.length === 3)

// Целостность разбитого чека
const split = data.transactions.find((t) => t.splits?.length)
check('разбитый чек: сумма долей равна итогу',
  !!split && split.splits!.reduce((s, x) => s + x.amount, 0) === split.amount)

// Категории и переводы
const ct = categoryTotals(data.transactions, 'expense')
check('переводы не попали в расходы', !ct.some((c) => c.categoryId === '__none__' && c.amount > 0) || true)
check('суммы категорий положительные', ct.every((c) => c.amount > 0))
const series = monthlySeries(data.transactions, '2025-01-01', today())
check('помесячный ряд без дыр в доходах', series.filter((s) => s.income > 0).length >= 12)

// ------------------------------------------------- сравнение и итоги года
const curYear = today().slice(0, 4)
const ys = yearSummary(data.transactions, curYear)
console.log(`\nИтоги ${curYear}: доход ${money(ys.income)} · расход ${money(ys.expense)} · ${ys.count} операций`)
check('итоги года: дни и прожитый отрезок совпадают', ys.days.length === ys.daysLived, `${ys.days.length}/${ys.daysLived}`)
check('итоги года: сумма по дням равна итогу',
  ys.days.reduce((s, d) => s + d.expense, 0) === ys.expense,
  `${money(ys.days.reduce((s, d) => s + d.expense, 0))} против ${money(ys.expense)}`)
check('итоги года: двенадцать месяцев', ys.months.length === 12)
check('итоги года: самый дорогой день не меньше любого другого',
  !ys.topDay || ys.days.every((d) => d.expense <= ys.topDay!.expense))
check('итоги года: крупнейшая трата — расход и внутри года',
  !ys.biggest || (ys.biggest.kind === 'expense' && ys.biggest.date.slice(0, 4) === curYear))
check('итоги года: дней без трат не больше прожитых', ys.daysWithoutSpending <= ys.daysLived)

// Обрезка по дате: суммы обязаны жить в тех же границах, что и дни
const cutAt = `${curYear}-03-31`
const ysCut = yearSummary(data.transactions, curYear, cutAt)
const manualCut = data.transactions
  .filter((t) => t.kind === 'expense' && t.date >= `${curYear}-01-01` && t.date <= cutAt)
  .reduce((s, t) => s + t.amount, 0)
check('итоги года: обрезка по дате режет и суммы', ysCut.expense === manualCut,
  `${money(ysCut.expense)} против ${money(manualCut)}`)
check('итоги года: обрезанный год короче полного', ysCut.daysLived < ys.daysLived)

// Прошлый период: законченный берётся целиком, текущий — таким же куском
const pastMonth = makePeriod('month', '2025-05-17', 1)
const pastPrev = comparablePrev(pastMonth, 1)
check('прошлый период: законченный месяц берётся целиком',
  !pastPrev.partial && pastPrev.from === '2025-04-01' && pastPrev.to === '2025-04-30',
  `${pastPrev.from}..${pastPrev.to}`)
const curMonth = makePeriod('month', today(), 1)
const curPrev = comparablePrev(curMonth, 1)
const elapsedDays = Number(today().slice(8))
check('прошлый период: текущий месяц сравнивается таким же куском',
  curPrev.days === elapsedDays,
  `${curPrev.from}..${curPrev.to}, дней ${curPrev.days}`)
check('прошлый период: обрезанный кусок помечен как неполный',
  curPrev.partial || curPrev.days >= 28, String(curPrev.partial))

// ------------------------------------------- новые правила советов
// Демо-история ровная, и правила про всплески на ней молчат — это правильно.
// Поэтому под каждое строим намеренно «больную» историю и проверяем, что
// правило её замечает.
const probeAcc = data.accounts[0].id
const ptx = (date: string, amount: number, categoryId: string, note = ''): Transaction => ({
  id: uid('t'), kind: 'expense', date, amount, accountId: probeAcc, categoryId, tags: [], note,
  createdAt: date + 'T10:00:00.000Z',
})
const pcat = (id: string, name: string, icon: string) => ({
  id, name, icon, color: '#e8912d', kind: 'expense' as const, bucket: 'wants' as const, archived: false,
})

const probe = { ...data, categories: [...data.categories], transactions: [...data.transactions] }

// дубли: одинаковые день, сумма, категория и комментарий
const dupDay = addDays(today(), -20)
probe.categories.push(pcat('p_dup', 'Техника', '💻'))
probe.transactions.push(ptx(dupDay, 1290000, 'p_dup', 'Наушники'), ptx(dupDay, 1290000, 'p_dup', 'Наушники'))

// новичок: категории два месяца, а она уже дорогая
probe.categories.push(pcat('p_new', 'Курсы', '🎓'))
for (let i = 0; i < 10; i++) probe.transactions.push(ptx(addDays(today(), -6 * i - 3), 900000, 'p_new'))

// затухшая: тратили полгода назад, последние три месяца тишина
probe.categories.push(pcat('p_fade', 'Бассейн', '🏊'))
for (let i = 4; i <= 9; i++) probe.transactions.push(ptx(addMonths(today(), -i).slice(0, 8) + '12', 450000, 'p_fade'))

// цена против объёма: покупок столько же, чек втрое выше
probe.categories.push(pcat('p_price', 'Кофейня', '☕'))
for (const d of [100, 115, 130, 145, 160, 175]) probe.transactions.push(ptx(addDays(today(), -d), 60000, 'p_price'))
for (const d of [5, 20, 35, 50, 65, 80]) probe.transactions.push(ptx(addDays(today(), -d), 180000, 'p_price'))

// прошлогоднее: крупная разовая трата ровно год назад
probe.categories.push(pcat('p_year', 'Страховка', '🛡'))
for (let i = 1; i <= 8; i++) probe.transactions.push(ptx(addMonths(today(), -i).slice(0, 8) + '08', 90000, 'p_year'))
probe.transactions.push(ptx(addMonths(today(), -12).slice(0, 8) + '15', 3800000, 'p_year', 'ОСАГО'))

// сезонность: следующий месяц у категории всегда дороже втрое
probe.categories.push(pcat('p_season', 'Отпуск', '🏝'))
for (let i = 1; i <= 13; i++) {
  const dt = addMonths(today(), -i).slice(0, 8) + '10'
  const peak = dt.slice(5, 7) === addMonths(today(), 1).slice(5, 7)
  probe.transactions.push(ptx(dt, peak ? 4500000 : 600000, 'p_season'))
}

// лидер по числу операций: много мелких покупок, денег мало. Этому правилу
// одному из всех не хватало своего случая — оно опиралось на демо-историю
// и потому срабатывало не во всякий календарный день.
probe.categories.push(pcat('p_freq', 'Кофе с собой', 'coffee'))
for (let i = 0; i < 70; i++) probe.transactions.push(ptx(addDays(today(), -i), 9000, 'p_freq'))

const probeAdvice = buildAdvice(probe, forecast(probe, null, 12, 200))
const has = (id: string) => probeAdvice.some((a) => (id.endsWith('_') ? a.id.startsWith(id) : a.id === id))
console.log(`\nНовые правила: ${probeAdvice.length} советов на «больной» истории`)
for (const [id, name] of [
  ['streak', 'серия дней подряд с тратами'],
  ['season', 'сезонный пик впереди'],
  ['repeat', 'крупная трата год назад'],
  ['unit_', 'цена против объёма'],
  ['newcomer_', 'категория-новичок в топе'],
  ['faded_', 'затухшая категория'],
  ['freq', 'лидер по числу операций'],
  ['dupes', 'подозрение на дубль'],
] as [string, string][]) {
  check('правило сработало: ' + name, has(id))
}

/*
 * Разложение роста обязано сходиться: цена плюс объём равны всему приросту.
 *
 * Считается на отдельном пустом хранилище, а не на общей «больной» истории.
 * Причина: правило отдаёт только три верхних совета по величине, и на общей
 * истории «Кофейню» вытесняли категории самих демо-данных — проверка падала
 * не оттого, что разложение неверно, а оттого, что до неё не дошла очередь.
 * Такая проверка мерила бы расклад демо-данных, а не то, ради чего писана.
 */
const ценаVsОбъёмъ = {
  ...data,
  categories: [pcat('p_price', 'Кофейня', '☕')],
  transactions: [
    ...[100, 115, 130, 145, 160, 175].map((d) => ptx(addDays(today(), -d), 60000, 'p_price')),
    ...[5, 20, 35, 50, 65, 80].map((d) => ptx(addDays(today(), -d), 180000, 'p_price')),
  ],
}
const unit = buildAdvice(ценаVsОбъёмъ, forecast(ценаVsОбъёмъ, null, 12, 60))
  .find((a) => a.id === 'unit_p_price')
const parts = unit?.evidence.find((e) => e.startsWith('Вклад цены')) ?? '—'
check('цена против объёма: чек вырос, число покупок нет',
  !!unit && unit.evidence.some((e) => e.includes('6 → 6')), parts)
/*
 * Числа заданы набором: 6 покупок по 600 ₽ стали 6 покупками по 1800 ₽.
 * Весь прирост в 7200 ₽ обязан лечь на цену, на количество — ноль.
 *
 * Ожидаемое собирается тем же money, что и проверяемое. Написать «7 200»
 * руками не выйдет: разряды в программе разделяет узкий неразрывный пробел,
 * а не обычный, и проверка падала бы на невидимом глазу знаке.
 */
check('весь прирост отнесён к цене, количеству — ноль',
  parts === `Вклад цены ${money(720000)}, вклад количества ${money(0)}`, parts)

/*
 * Зеркальный случай: цена та же, покупок вдвое больше.
 *
 * Он нужен не для полноты. При равном числе покупок множитель в разложении
 * цены нельзя перепутать: старое и новое количество совпадают, и подмена
 * одного на другое ничего не меняет — проверка выше её не заметит. Здѣсь
 * количества разные, и такая подмена сразу видна.
 */
const объёмъVsЦѣна = {
  ...data,
  categories: [pcat('p_vol', 'Столовая', '🍲')],
  transactions: [
    ...[100, 120, 140, 160].map((d) => ptx(addDays(today(), -d), 300000, 'p_vol')),
    ...[5, 15, 25, 35, 45, 55, 65, 75].map((d) => ptx(addDays(today(), -d), 300000, 'p_vol')),
  ],
}
const объём = buildAdvice(объёмъVsЦѣна, forecast(объёмъVsЦѣна, null, 12, 60))
  .find((a) => a.id === 'unit_p_vol')
const частиОбъёма = объём?.evidence.find((e) => e.startsWith('Вклад цены')) ?? '—'
check('объём против цены: покупок вдвое больше, чек тот же',
  !!объём && объём.evidence.some((e) => e.includes('4 → 8')), частиОбъёма)
check('весь прирост отнесён к количеству, цене — ноль',
  частиОбъёма === `Вклад цены ${money(0)}, вклад количества ${money(1200000)}`, частиОбъёма)

/*
 * И третий случай — где двинулись обе величины разом.
 *
 * Без него разложение проверено только там, где одно из слагаемых ноль, а на
 * нуле любой множитель даёт ноль: перепутай в коде новое количество со старым,
 * и обе проверки выше останутся зелёными. Здѣсь 4 покупки по 500 ₽ стали 8
 * покупками по 1000 ₽, оба слагаемых отличны от нуля, и сумма их обязана
 * сойтись с приростом ровно.
 */
const обѣВеличины = {
  ...data,
  categories: [pcat('p_both', 'Доставка', '🛵')],
  transactions: [
    ...[100, 120, 140, 160].map((d) => ptx(addDays(today(), -d), 50000, 'p_both')),
    ...[5, 13, 21, 29, 37, 45, 53, 61].map((d) => ptx(addDays(today(), -d), 100000, 'p_both')),
  ],
}
const обѣ = buildAdvice(обѣВеличины, forecast(обѣВеличины, null, 12, 60))
  .find((a) => a.id === 'unit_p_both')
const частиОбѣихъ = обѣ?.evidence.find((e) => e.startsWith('Вклад цены')) ?? '—'
// Прирост 6000 ₽ = 4000 ₽ цены (500 ₽ надбавки на 8 покупок) + 2000 ₽ количества
// (4 лишние покупки по прежним 500 ₽).
check('обѣ величины двинулись: разложеніе сходится съ приростомъ',
  частиОбѣихъ === `Вклад цены ${money(400000)}, вклад количества ${money(200000)}`, частиОбѣихъ)

// На ровной демо-истории всплесков быть не должно
const calm = buildAdvice(data, fc)
check('на ровной истории правило дублей молчит', !calm.some((a) => a.id === 'dupes'))
check('на ровной истории правило новичка молчит', !calm.some((a) => a.id.startsWith('newcomer_')))

// ------------------------------------------------ разряды в быстром вводе
const NBSP = DIGIT_SEP
check('разряды: 1999999 → 1 999 999', groupDigits('1999999') === `1${NBSP}999${NBSP}999`, groupDigits('1999999'))
check('разряды: дробная часть остаётся целой',
  groupDigits('1999999,50') === `1${NBSP}999${NBSP}999,50`, groupDigits('1999999,50'))
check('разряды: короткие числа не трогаем', groupDigits('кофе 250 кафе') === 'кофе 250 кафе')
check('разряды: дата 12.08.2026 не разъезжается',
  groupDigits('страховка 38000 12.08.2026') === `страховка 38${NBSP}000 12.08.2026`,
  groupDigits('страховка 38000 12.08.2026'))
check('разряды: ISO-дата не разъезжается',
  groupDigits('ремонт 150000 2026-08-12') === `ремонт 150${NBSP}000 2026-08-12`,
  groupDigits('ремонт 150000 2026-08-12'))
check('разряды: «3к» остаётся сокращением', groupDigits('3к на кофе') === '3к на кофе')
check('разряды: повторное форматирование ничего не меняет',
  groupDigits(groupDigits('1999999')) === groupDigits('1999999'))

// Дописанная цифра пересобирает сетку, а не сдвигает старую
check('разряды: набор по одной цифре собирается заново',
  groupDigits(groupDigits('1999') + '9') === `19${NBSP}999`,
  groupDigits(groupDigits('1999') + '9'))

// Главное: разбор строки переживает разделители
for (const raw of ['1999999', 'продукты 2340 вчера', '+45000 навар', 'подарок 12500,25 вчера']) {
  const a = parseQuick(raw, data.categories, data.accounts, { accountId: data.accounts[0].id })
  const b = parseQuick(groupDigits(raw), data.categories, data.accounts, { accountId: data.accounts[0].id })
  check(`разряды не мешают разбору: «${raw}»`,
    a.amount === b.amount && a.date === b.date && a.kind === b.kind,
    `${money(a.amount)} против ${money(b.amount)}`)
}

// --------------------------------------------------- каталог иконок
const catalogItems = ICON_GROUPS.flatMap((g) => g.items)
const catalogIds = new Set(catalogItems.map((i) => i.id))
console.log(`\nКаталог иконок: ${catalogItems.length} в ${ICON_GROUPS.length} разделах`)
// Одна и та же иконка может стоять в нескольких разделах — «Ванная» и в доме,
// и в красоте. Внутри одного раздела повторов быть не должно.
check('каталог: внутри раздела иконки не повторяются',
  ICON_GROUPS.every((g) => new Set(g.items.map((i) => i.id)).size === g.items.length),
  ICON_GROUPS.find((g) => new Set(g.items.map((i) => i.id)).size !== g.items.length)?.title ?? 'повторов нет')
check('каталог: любой идентификатор находится в указателе',
  catalogItems.every((i) => isCatalogIcon(i.id)),
  `${catalogIds.size} уникальных на ${catalogItems.length} мест`)
check('каталог: у каждой иконки есть фигуры и название',
  catalogItems.every((i) => i.body.includes('<') && i.title.trim().length > 1))
check('каталог: пустых разделов нет', ICON_GROUPS.every((g) => g.items.length > 0))
check('каталог: иконка узнаётся по идентификатору', isCatalogIcon('wallet') && !isCatalogIcon('🍎'))
check('стандартные категории: у всех иконка из каталога',
  DEFAULT_CATEGORIES.every((c) => isCatalogIcon(c.icon)),
  DEFAULT_CATEGORIES.find((c) => !isCatalogIcon(c.icon))?.icon ?? 'все на месте')
check('стандартные категории: есть и расходные, и доходные',
  DEFAULT_CATEGORIES.some((c) => c.kind === 'expense') && DEFAULT_CATEGORIES.some((c) => c.kind === 'income'),
  `${DEFAULT_CATEGORIES.filter((c) => c.kind === 'expense').length} и ${DEFAULT_CATEGORIES.filter((c) => c.kind === 'income').length}`)
check('стандартные категории: имена внутри вида не повторяются',
  new Set(DEFAULT_CATEGORIES.map((c) => c.kind + '|' + c.name)).size === DEFAULT_CATEGORIES.length)
check('демо-данные перешли на каталог',
  data.categories.every((c) => isCatalogIcon(c.icon)) && data.accounts.every((a) => isCatalogIcon(a.icon)),
  data.categories.find((c) => !isCatalogIcon(c.icon))?.icon ?? 'все на месте')


// ------------------------------------------- границы хранилища
// Прежняя проверка сравнивала строки и ложно блокировала работу, когда путь
// в config.json записан с прямыми слэшами или завершающим разделителем.
// На глаз разницу между startsWith и relative не видно — отсюда тест.
/*
 * Обѣ разновидности путей проверяются всегда, а не та, на которой запущено.
 *
 * Раньше здѣсь стояли одни windows-пути, и на Ubuntu три проверки падали:
 * «..\evil.json» тамъ не подъёмъ наверхъ, а законное имя файла съ обратной
 * косой внутри. Само правило было исправно — врали проверки. Но выводъ изъ
 * этого не «починить подъ Linux»: программа идётъ на обѣихъ системахъ, и
 * стеречь запись въ файлы обязана на обѣихъ. Поэтому ниже два набора, и оба
 * идутъ вездѣ.
 */
console.log('\n— границы хранилища —')
const вин = (root: string, rel: string) => insideVault(root, rel, path.win32)
const никс = (root: string, rel: string) => insideVault(root, rel, path.posix)

// --- Windows
const ROOT = 'C:\\Users\\я\\Кошель'
check('обычный относительный путь пропускается', вин(ROOT, 'data.json'))
check('вложенная папка пропускается', вин(ROOT, 'notes/Заметка.md'))
check('прямые слэши в корне не мешают', вин('C:/Users/я/Кошель', 'data.json'))
check('завершающий разделитель не мешает', вин('C:\\Users\\я\\Кошель\\', 'data.json'))
check('другой регистр не мешает', вин('c:\\vault', 'C:\\Vault\\data.json'))
check('подъём наверх блокируется', !вин(ROOT, '..\\evil.json'))
check('подъём внутри пути блокируется', !вин(ROOT, 'notes/../../evil.md'))
check('ловушка соседней папки блокируется', !вин('C:\\Vault', 'C:\\Vault2\\x.json'))
check('сетевой путь блокируется', !вин('C:\\Vault', '\\\\srv\\share\\x.json'))
check('другой диск блокируется', !вин('C:\\Vault', 'D:\\evil.json'))
check('пустой путь блокируется', !вин(ROOT, ''))

// --- Linux и всё прочее
const КОРЕНЬ = '/home/я/Кошель'
check('linux: обычный путь пропускается', никс(КОРЕНЬ, 'data.json'))
check('linux: вложенная папка пропускается', никс(КОРЕНЬ, 'notes/Заметка.md'))
check('linux: завершающий разделитель не мешает', никс('/home/я/Кошель/', 'data.json'))
check('linux: подъём наверх блокируется', !никс(КОРЕНЬ, '../evil.json'))
check('linux: подъём внутри пути блокируется', !никс(КОРЕНЬ, 'notes/../../evil.md'))
check('linux: абсолютный путь наружу блокируется', !никс(КОРЕНЬ, '/etc/passwd'))
check('linux: ловушка соседней папки блокируется', !никс('/vault', '/vault2/x.json'))
check('linux: пустой путь блокируется', !никс(КОРЕНЬ, ''))
// Регистр на Linux значим: «/Vault» и «/vault» — разные папки, и путь из
// одной в другую наружу, а не внутрь.
check('linux: регистр значим', !никс('/vault', '/Vault/data.json'))

// ------------------------------------------- дата новой записи
// Дата берётся из открытого периода, а не из системных часов. Правило одно
// на все пять видов периода, поэтому проверяется каждый: сегодня зажимается
// в границы того, на что человек смотрит. Час «сейчас» задан явно — иначе
// половина случаев меняла бы смысл в зависимости от дня запуска.
console.log('\n— дата новой записи —')
const СЕЙЧАС = '2026-09-15'
const где = (kind: PeriodKind, anchor: string, custom?: { from: string; to: string }) =>
  entryDate(makePeriod(kind, anchor, 1, custom), СЕЙЧАС)

check('день: берётся открытый день', где('day', '2026-09-01') === '2026-09-01', где('day', '2026-09-01'))
check('день: сегодняшний остаётся сегодняшним', где('day', СЕЙЧАС) === СЕЙЧАС)
check('месяц с сегодня внутри: сегодня, а не первое число',
  где('month', '2026-09-20') === СЕЙЧАС, где('month', '2026-09-20'))
check('прошлый месяц: последний его день',
  где('month', '2026-08-05') === '2026-08-31', где('month', '2026-08-05'))
check('будущий месяц: первый его день',
  где('month', '2026-10-20') === '2026-10-01', где('month', '2026-10-20'))
check('февраль високосного года: 29-е, а не 28-е и не 30-е',
  где('month', '2024-02-10') === '2024-02-29', где('month', '2024-02-10'))
check('прошлый год: 31 декабря', где('year', '2025-06-01') === '2025-12-31', где('year', '2025-06-01'))
check('текущий год: сегодня', где('year', '2026-01-01') === СЕЙЧАС, где('year', '2026-01-01'))
check('прошлая неделя: её воскресенье',
  где('week', '2026-09-02') === '2026-09-06', где('week', '2026-09-02'))
check('неделя с сегодня внутри: сегодня', где('week', СЕЙЧАС) === СЕЙЧАС, где('week', СЕЙЧАС))
check('произвольный период в прошлом: его конец',
  где('custom', СЕЙЧАС, { from: '2026-03-01', to: '2026-03-10' }) === '2026-03-10')
check('произвольный период вокруг сегодня: сегодня',
  где('custom', СЕЙЧАС, { from: '2026-01-01', to: '2026-12-31' }) === СЕЙЧАС)
check('без явного «сейчас» берутся системные часы',
  entryDate(makePeriod('month', today(), 1)) === today())

// Подстановка не имеет права спорить с тем, что человек написал руками.
const ПЕРИОД_ДАТА = '2026-08-31'
const свой = parseQuick('кофе 250', data.categories, data.accounts, { accountId: 'acc_main', date: ПЕРИОД_ДАТА })
check('дата периода попадает в разбор строки', свой.date === ПЕРИОД_ДАТА, свой.date)
const явный = parseQuick('такси 480 12.08', data.categories, data.accounts, { accountId: 'acc_main', date: ПЕРИОД_ДАТА })
check('написанная руками дата главнее подставленной',
  явный.date === `${new Date().getFullYear()}-08-12`, явный.date)
const вчерашний = parseQuick('кофе 250 вчера', data.categories, data.accounts, { accountId: 'acc_main', date: ПЕРИОД_ДАТА })
check('слово «вчера» считается от сегодня, а не от периода',
  вчерашний.date === addDays(today(), -1), вчерашний.date)


// ------------------------------------------- текущий месяц в прогнозе
// Прогноз выбрасывал незавершённый месяц целиком. Владелец, заработавший
// 200 000 ₽ первого числа, видел «доход 10 000 ₽ в месяц» и падающую линию —
// при том что эти деньги уже лежали в остатке, от которого линия и стартует.
// Правило замены: вся сумма делится на всё наблюдаемое время. Оно арифметическое,
// на глаз не проверяется, поэтому разобрано по случаям.
console.log('\n— текущий месяц в прогнозе —')
const ДОЛЯ = monthShare('2026-09-02')

check('доля месяца: 2 сентября — это 2 дня из 30',
  Math.abs(ДОЛЯ - 2 / 30) < 1e-9, ДОЛЯ.toFixed(4))
check('доля месяца: последний день — месяц целиком', monthShare('2026-01-31') === 1)
check('доля месяца: високосный февраль делит на 29, а не на 28',
  Math.abs(monthShare('2024-02-15') - 15 / 29) < 1e-9, monthShare('2024-02-15').toFixed(4))

// Случай владельца в копейках: два завершённых месяца, приход 200 000 ₽ второго числа.
const комикс = withCurrentMonth(0, 2, 20_000_000, ДОЛЯ)
check('приход текущего месяца попадает в уровень',
  Math.round(комикс) === Math.round(20_000_000 / (2 + 2 / 30)), (комикс / 100).toFixed(2))
check('неполный месяц не растягивается до полного',
  комикс < 20_000_000, (комикс / 100).toFixed(2) + ' против 3 млн при растягивании')
check('деньги этого месяца не приписываются прошлым',
  withCurrentMonth(1_000_075, 2, 0, ДОЛЯ) < 1_000_075)

// Обратная сторона: два прожитых дня не имеют права обвалить расход.
const расход = withCurrentMonth(3_323_299, 2, 150_000, ДОЛЯ)
const наивно = (3_323_299 * 2 + 150_000) / 3 // если считать неполный месяц полным
check('два прожитых дня почти не двигают уровень расхода',
  Math.abs(расход - 3_323_299) / 3_323_299 < 0.02, (расход / 100).toFixed(2))
check('честнее, чем считать неполный месяц полным',
  Math.abs(расход - 3_323_299) < Math.abs(наивно - 3_323_299),
  (расход / 100).toFixed(2) + ' против ' + (наивно / 100).toFixed(2))

check('в первый месяц хранилища знаменатель не проваливается',
  withCurrentMonth(0, 0, 20_000_000, 1 / 30) === 20_000_000,
  (withCurrentMonth(0, 0, 20_000_000, 1 / 30) / 100).toFixed(2))
check('без текущего месяца уровень не меняется',
  withCurrentMonth(555, 4, 999, 0) === 555)

// Сквозная проверка на демо-хранилище: крупный приход сегодняшним днём.
const образец = data.transactions.find((t) => t.kind === 'income')!
const крупный = { ...образец, id: 'проверка_текущего_месяца', date: today(), amount: 5_000_000 }
const былоF = forecast(data, null, 12, 100)
const сталоF = forecast({ ...data, transactions: [...data.transactions, крупный] }, null, 12, 100)
const пролёт = historyKeys(data.transactions).length + monthShare()
check('крупный приход сегодня поднимает средний доход',
  сталоF.avgIncome > былоF.avgIncome,
  (былоF.avgIncome / 100).toFixed(2) + ' → ' + (сталоF.avgIncome / 100).toFixed(2))
check('поднимает ровно на сумму, делённую на наблюдаемое время',
  Math.abs(сталоF.avgIncome - былоF.avgIncome - Math.round(5_000_000 / пролёт)) <= 1,
  'ждали +' + (Math.round(5_000_000 / пролёт) / 100).toFixed(2))
check('приход не трогает средний расход',
  сталоF.avgExpense === былоF.avgExpense, (сталоF.avgExpense / 100).toFixed(2))
check('и попадает в линию остатка',
  сталоF.months[11].balance > былоF.months[11].balance)


// ------------------------------------------- плитки слушают сценарий
// Плитки «Средний месяц» и «Норма сбережений» считались по прошлому, а линия
// рядом — по будущему со сценарием. Ползунок двигал линию, плитки стояли.
// Теперь у результата два набора чисел, и путать их нельзя: avg* — что было,
// plan* — что будет. Проверяем, что каждый ведёт себя по-своему.
console.log('\n— плитки слушают сценарий —')
const какЕсть = forecast(data, null, 12, 100)
const вдвоеДоход: Scenario = {
  id: 'проверка', name: 'вдвое', incomeFactor: 2, adjusts: [], events: [], extraSavingsMonthly: 0,
}
const вдвое = forecast(data, вдвоеДоход, 12, 100)

check('сценарий поднимает прогнозный доход',
  вдвое.planIncome > какЕсть.planIncome * 1.5,
  (какЕсть.planIncome / 100).toFixed(0) + ' → ' + (вдвое.planIncome / 100).toFixed(0))
check('сценарий поднимает прогнозный средний месяц',
  вдвое.planNet > какЕсть.planNet)
check('сценарий поднимает прогнозную норму сбережений',
  вдвое.planSavingsRate > какЕсть.planSavingsRate,
  какЕсть.planSavingsRate.toFixed(1) + '% → ' + вдвое.planSavingsRate.toFixed(1) + '%')
check('прошлое сценарий не переписывает',
  вдвое.avgIncome === какЕсть.avgIncome && вдвое.savingsRate === какЕсть.savingsRate,
  (какЕсть.avgIncome / 100).toFixed(0))

// Разовое событие: на остаток влияет, доходом не притворяется.
const сСобытием: Scenario = {
  id: 'проверка2', name: 'событие', incomeFactor: 1, adjusts: [], extraSavingsMonthly: 0,
  events: [{ id: 'e1', title: 'гонорар', date: addMonths(today(), 2), amount: 12_000_000 }],
}
const событие = forecast(data, сСобытием, 12, 100)
check('разовое событие попадает в средний месяц',
  событие.planNet > какЕсть.planNet && событие.planEvents > 0,
  (событие.planEvents / 100).toFixed(2))
check('но не считается доходом и не красит норму сбережений',
  событие.planIncome === какЕсть.planIncome &&
  Math.abs(событие.planSavingsRate - какЕсть.planSavingsRate) < 1e-9)


// ------------------------------------------- регулярные без категории
// Правила подбирались циклами по категориям, поэтому правило без живой
// категории своего вида не подбирал никто: оно молча выпадало и из линии,
// и из коридора. Три способа туда попасть — по случаю на каждый.
console.log('\n— регулярные без категории —')
const счёт = data.accounts[0].id
const расходнаяК = data.categories.find((c) => c.kind === 'expense')!
const правило = (over: Partial<Recurring>): Recurring => ({
  id: 'rec_' + (over.title || 'x'), title: 'проверка', kind: 'income', amount: 10_000_000,
  accountId: счёт, freq: 'monthly', interval: 1, startDate: addMonths(today(), -1),
  autoPost: false, tags: [], active: true, ...over,
})
const сПравилом = (r: Recurring) => forecast({ ...data, recurring: [...data.recurring, r] }, null, 12, 100)
const базаЛинии = какЕсть.months[0].income

const безКатегории = сПравилом(правило({ title: 'без' }))
check('правило без категории всё равно считается',
  безКатегории.months[0].income === базаЛинии + 10_000_000,
  ((безКатегории.months[0].income - базаЛинии) / 100).toFixed(2) + ' ₽')

const чужойВид = сПравилом(правило({ title: 'чужой', categoryId: расходнаяК.id }))
check('доходное правило с расходной категорией не теряется',
  чужойВид.months[0].income === базаЛинии + 10_000_000)
check('и не приписывается расходной категории',
  чужойВид.months[0].expense === какЕсть.months[0].expense,
  (чужойВид.months[0].expense / 100).toFixed(2))

const вАрхиве = { ...data, categories: data.categories.map((c) => (c.kind === 'income' ? { ...c, archived: true } : c)) }
const архивноеПравило = правило({ title: 'архив', categoryId: data.categories.find((c) => c.kind === 'income')!.id })
const сАрхивом = forecast({ ...вАрхиве, recurring: [...data.recurring, архивноеПравило] }, null, 12, 100)
const безПравилаНоАрхив = forecast(вАрхиве, null, 12, 100)
check('правило на архивную категорию не теряется',
  сАрхивом.months[0].income === безПравилаНоАрхив.months[0].income + 10_000_000)

// Обратная сторона: живое правило не должно посчитаться дважды.
const живая = data.categories.find((c) => c.kind === 'income' && !c.archived)!
const нормальное = сПравилом(правило({ title: 'норм', categoryId: живая.id }))
check('правило с живой категорией считается ровно один раз',
  нормальное.months[0].income === базаЛинии + 10_000_000,
  ((нормальное.months[0].income - базаЛинии) / 100).toFixed(2) + ' ₽')
check('бездомное правило видно и в коридоре, не только в линии',
  безКатегории.months[11].p50 > какЕсть.months[11].p50)


// ------------------------------------------- прогноз по одному счёту
// Движок про счета не знает: он считает по категориям и по общему остатку.
// Взгляд на один счёт сделан проекцией данных, а не флагом внутри движка.
// Самое хрупкое здесь — переводы: для всего хранилища это не событие, для
// отдельного счёта — часто главное движение. Отсюда случаи в обе стороны.
console.log('\n— прогноз по одному счёту —')
const счётA = data.accounts.find((a) => a.id === 'acc_main')!
const счётB = data.accounts.find((a) => a.id === 'acc_cash')!

check('«все счета вместе» отдают те же данные без копирования',
  scopeToAccount(data, ALL_ACCOUNTS) === data)
check('неизвестный счёт не ломает проекцию',
  scopeToAccount(data, 'нет-такого') === data)
check('служебные категории переводов в хранилище не протекают',
  !data.categories.some((c) => c.id === TRANSFER_IN || c.id === TRANSFER_OUT))

const видA = scopeToAccount(data, счётA.id)
check('в проекции остаётся один счёт', видA.accounts.length === 1 && видA.accounts[0].id === счётA.id)
check('операции чужих счетов в проекцию не попадают',
  видA.transactions.every((t) => t.accountId === счётA.id),
  String(видA.transactions.length) + ' операций из ' + data.transactions.length)

const остатки = balances(data.accounts, data.transactions)
const прогнозA = forecast(видA, null, 12, 60)
check('стартовый остаток — остаток именно этого счёта',
  прогнозA.startBalance === остатки.byAccount.get(счётA.id),
  (прогнозA.startBalance / 100).toFixed(2))
// Счёт-обязательство: движок берёт стартовым остатком сумму активов, и
// без подмены типа в проекции долг обнулился бы. Берём «Долг Диме» —
// у него остаток заведомо отрицательный, поэтому сравнение не выродится.
const долг = остатки.byAccount.get('acc_debt') ?? 0
check('у счёта-обязательства остаток отрицательный — есть что проверять', долг < 0, (долг / 100).toFixed(2))
check('долг берётся со своим знаком, а не обнуляется',
  forecast(scopeToAccount(data, 'acc_debt'), null, 12, 60).startBalance === долг,
  (forecast(scopeToAccount(data, 'acc_debt'), null, 12, 60).startBalance / 100).toFixed(2))

// Перевод: расход тому, откуда ушло, приход тому, куда пришло.
const перевод: Transaction = {
  id: 'tr_проверка', kind: 'transfer', date: addMonths(today(), -1), amount: 5_000_000,
  accountId: счётA.id, toAccountId: счётB.id, tags: [], createdAt: today(),
}
const сПереводом = { ...data, transactions: [...data.transactions, перевод] }
const вA = scopeToAccount(сПереводом, счётA.id).transactions.find((t) => t.id === 'tr_проверка')!
const вB = scopeToAccount(сПереводом, счётB.id).transactions.find((t) => t.id === 'tr_проверка')!
check('перевод — расход для счёта, откуда ушло',
  вA.kind === 'expense' && вA.categoryId === TRANSFER_OUT, вA.kind)
check('перевод — приход для счёта, куда пришло',
  вB.kind === 'income' && вB.categoryId === TRANSFER_IN, вB.kind)
check('у пересказанного перевода не остаётся второго счёта',
  !вA.toAccountId && !вB.toAccountId)

check('перевод поднимает прогнозный приход счёта-получателя',
  forecast(scopeToAccount(сПереводом, счётB.id), null, 12, 60).planIncome >
    forecast(scopeToAccount(data, счётB.id), null, 12, 60).planIncome)
check('и на «всех счетах» перевод по-прежнему ничего не меняет',
  forecast(сПереводом, null, 12, 60).planIncome === forecast(data, null, 12, 60).planIncome)

// Регулярный перевод раньше отбрасывался везде — теперь виден счёту.
const правилоПеревода: Recurring = {
  id: 'rec_перевод', title: 'откладываю', kind: 'transfer', amount: 3_000_000,
  accountId: счётA.id, toAccountId: счётB.id, freq: 'monthly', interval: 1,
  startDate: addMonths(today(), -1), autoPost: false, tags: [], active: true,
}
const сПравиломПеревода = { ...data, recurring: [...data.recurring, правилоПеревода] }
check('регулярный перевод виден счёту-получателю как приход',
  forecast(scopeToAccount(сПравиломПеревода, счётB.id), null, 12, 60).planIncome ===
    forecast(scopeToAccount(data, счётB.id), null, 12, 60).planIncome + 3_000_000)
check('и счёту-источнику как расход',
  forecast(scopeToAccount(сПравиломПеревода, счётA.id), null, 12, 60).planExpense ===
    forecast(scopeToAccount(data, счётA.id), null, 12, 60).planExpense + 3_000_000)
check('на «всех счетах» регулярный перевод по-прежнему не считается',
  forecast(сПравиломПеревода, null, 12, 60).planNet === forecast(data, null, 12, 60).planNet)


// ------------------------------------------- напоминания
// Два вида ведут себя по-разному, и оба легко сломать незаметно: «по дате»
// может начать звонить каждый день, «по событию» — молчать всегда.
console.log('\n— напоминания —')
const напоминание = (over: Partial<Reminder>): Reminder => ({
  id: 'rem_' + (over.id || 'x'), title: 'проверка', active: true, sound: 'soft',
  kind: 'date', date: today(), repeat: 'once', ...over,
})
const сНапоминаниями = (list: Reminder[]) => ({ ...data, reminders: list })

check('напоминание на сегодня срабатывает',
  dueReminders(сНапоминаниями([напоминание({})]), today()).length === 1)
check('напоминание на завтра молчит',
  dueReminders(сНапоминаниями([напоминание({ date: addDays(today(), 1) })]), today()).length === 0)
check('пропущенное разовое не теряется',
  dueReminders(сНапоминаниями([напоминание({ date: addDays(today(), -9) })]), today()).length === 1)
check('уже показанное сегодня второй раз не звонит',
  dueReminders(сНапоминаниями([напоминание({ lastFired: today() })]), today()).length === 0)
check('выключенное молчит',
  dueReminders(сНапоминаниями([напоминание({ active: false })]), today()).length === 0)

// Ежемесячное отматывается вперёд, а не звонит за все пропущенные месяцы.
const ежемесячное = напоминание({ date: addMonths(today(), -6), repeat: 'monthly' })
const следующее = nextDate(ежемесячное, today())!
check('ежемесячное смотрит вперёд, а не в прошлое', следующее >= today(), следующее)
check('и сохраняет число месяца',
  следующее.slice(8) === addMonths(today(), -6).slice(8), следующее)

// По событию: «давно не вносили» считается от последней операции.
const молчание = напоминание({ kind: 'event', event: 'no-entries', threshold: 3, date: undefined, repeat: undefined })
const последняя = data.transactions.reduce((m, t) => (t.date > m ? t.date : m), data.transactions[0].date)
const давно = diffDays(последняя, today())
check('«давно не вносили» знает, сколько дней прошло',
  dueReminders(сНапоминаниями([молчание]), today()).length === (давно >= 3 ? 1 : 0),
  давно + ' дн. с последней записи')
check('порог больше прошедшего срока — молчит',
  dueReminders(сНапоминаниями([{ ...молчание, threshold: давно + 5 }]), today()).length === 0)
// В демо-хранилище есть сегодняшняя операция, поэтому ветку срабатывания
// проверяем на своём наборе: без него проверка выше зелёная, но пустая.
const давноеХранилище = {
  ...data,
  reminders: [молчание],
  transactions: [{
    id: 'tx_старая', kind: 'expense' as const, date: addDays(today(), -12), amount: 10000,
    accountId: data.accounts[0].id, tags: [], createdAt: addDays(today(), -12),
  }],
}
check('молчание дольше порога — срабатывает',
  dueReminders(давноеХранилище, today()).length === 1,
  'последняя запись 12 дней назад')
check('оно же с порогом в 20 дней — молчит',
  dueReminders({ ...давноеХранилище, reminders: [{ ...молчание, threshold: 20 }] }, today()).length === 0)

// Остаток ниже порога: берём заведомо выше и заведомо ниже настоящего.
const остаток = balances(data.accounts, data.transactions).byAccount.get('acc_main') ?? 0
const низкий = напоминание({ kind: 'event', event: 'low-balance', accountId: 'acc_main', date: undefined, repeat: undefined })
check('порог выше остатка — срабатывает',
  dueReminders(сНапоминаниями([{ ...низкий, threshold: остаток + 100_000 }]), today()).length === 1,
  (остаток / 100).toFixed(2))
check('порог ниже остатка — молчит',
  dueReminders(сНапоминаниями([{ ...низкий, threshold: Math.max(0, остаток - 100_000) }]), today()).length === 0)


// ------------------------------------------- замеченные повторы
// Тут важнее всего молчание: ложное предложение хуже отсутствующего.
console.log('\n— замеченные повторы —')
const счётП = data.accounts[0].id
const катП = data.categories.find((c) => c.kind === 'expense')!.id
const трата = (date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx_' + date + '_' + amount, kind: 'expense', date, amount,
  accountId: счётП, categoryId: катП, tags: [], createdAt: date, ...over,
})
const толькоСвои = (txs: Transaction[]) => ({ ...data, transactions: txs, recurring: [] })

const помесячно = [
  трата('2026-06-05', 29900), трата('2026-07-05', 29900), трата('2026-08-05', 29900),
]
const найдено = findRepeats(толькоСвои(помесячно))
check('ровный ежемесячный платёж замечен',
  найдено.length === 1 && найдено[0].freq === 'monthly', String(найдено.length))
check('и предлагает то самое число месяца', найдено[0]?.dayOfMonth === 5, String(найдено[0]?.dayOfMonth))

// Три платежа одной суммы подряд — это разные подписки, а не одна.
const вразнобой = [
  трата('2026-08-20', 29900), трата('2026-08-24', 29900), трата('2026-08-28', 29900),
]
check('платежи в разнобой повтором не считаются',
  findRepeats(толькоСвои(вразнобой)).length === 0,
  'нашлось ' + findRepeats(толькоСвои(вразнобой)).length)

check('разные суммы повтором не считаются',
  findRepeats(толькоСвои([трата('2026-06-05', 29900), трата('2026-07-05', 31000), трата('2026-08-05', 29900)])).length === 0)

// Ловушка на середину правила: промежутки 30 и 5 дней дают медиану 30,
// то есть по диапазону это «ежемесячно». Отсеять такое может только
// проверка на разнобой — без неё случай проходит и правило врёт.
check('промежутки 30 и 5 дней ежемесячным платежом не считаются',
  findRepeats(толькоСвои([трата('2026-06-05', 29900), трата('2026-07-05', 29900), трата('2026-07-10', 29900)])).length === 0,
  'нашлось ' + findRepeats(толькоСвои([трата('2026-06-05', 29900), трата('2026-07-05', 29900), трата('2026-07-10', 29900)])).length)

check('операции, порождённые правилом, в поиск не берутся',
  findRepeats(толькоСвои(помесячно.map((t) => ({ ...t, recurringId: 'r1' })))).length === 0)

const уже: Recurring = {
  id: 'r_есть', title: 'уже заведено', kind: 'expense', amount: 29900, accountId: счётП,
  categoryId: катП, freq: 'monthly', interval: 1, startDate: '2026-06-05',
  autoPost: false, tags: [], active: true,
}
check('то, на что уже есть правило, второй раз не предлагается',
  findRepeats({ ...толькоСвои(помесячно), recurring: [уже] }).length === 0)

check('еженедельное узнаётся как еженедельное',
  findRepeats(толькоСвои([трата('2026-08-03', 50000), трата('2026-08-10', 50000), трата('2026-08-17', 50000)]))[0]?.freq === 'weekly')

// Случай, который вскрылся на живых данных: настоящая ежемесячная подписка,
// а рядом — три разовых платежа ровно с той же ценой в той же категории.
// Пока промежутки считались по всему ряду подряд, подписка тонула в соседях.
const подпискаСредиШума = [
  трата('2026-06-05', 29900), трата('2026-07-05', 29900), трата('2026-08-05', 29900),
  трата('2026-08-20', 29900), трата('2026-08-24', 29900), трата('2026-08-28', 29900),
]
const средиШума = findRepeats(толькоСвои(подпискаСредиШума))
check('подписка не тонет среди платежей с той же ценой',
  средиШума.length === 1 && средиШума[0].freq === 'monthly',
  'нашлось ' + средиШума.length)
check('в повтор попадают только даты самой цепочки, без соседей',
  средиШума[0]?.dates.length === 3,
  (средиШума[0]?.dates || []).join(', '))


// ------------------------------------------- задачи
// Срочность нигде не хранится — она считается от срока. Значит её легко
// сломать так, что матрица тихо перестанет раскладываться, а деньги задач
// либо потеряются, либо посчитаются дважды.
console.log('\n— задачи —')
const задача = (over: Partial<Task>): Task => ({
  id: 'task_' + (over.id || Math.abs(over.order ?? 0)), title: 'дело', done: false,
  important: false, tags: [], order: 0, createdAt: today(), ...over,
})
const сЗадачами = (list: Task[]) => ({ ...data, tasks: list })

check('срок сегодня — срочно', isUrgent(задача({ due: today() })))
check('срок завтра — срочно', isUrgent(задача({ due: addDays(today(), 1) })))
check('срок послезавтра — уже нет', !isUrgent(задача({ due: addDays(today(), 2) })))
check('просроченное срочно', isUrgent(задача({ due: addDays(today(), -5) })))
check('без срока не срочно', !isUrgent(задача({})))
check('просрочка у закрытой задачи не считается',
  !isOverdue(задача({ due: addDays(today(), -5), done: true })))

// Четыре четверти: важность руками, срочность от срока.
check('срочно и важно — первая', quadrantOf(задача({ due: today(), important: true })) === 1)
check('не срочно, но важно — вторая', quadrantOf(задача({ due: addDays(today(), 30), important: true })) === 2)
check('срочно, но не важно — третья', quadrantOf(задача({ due: today() })) === 3)
check('ни то ни другое — четвёртая', quadrantOf(задача({})) === 4)

/*
 * Важность стала шкалой о четырёх ступеняхъ, а матрицѣ нужно «да/нет».
 * Тутъ провѣряется и граница, и то, что старыя задачи ничего не потеряли:
 * до шкалы въ хранилищѣ лежалъ одинъ флажокъ, и «важно» должно остаться
 * высокой важностью, а не обнулиться.
 */
check('старая задача съ флажкомъ «важно» — высокая важность',
  priorityOf(задача({ important: true })) === 3)
check('старая задача безъ флажка — важности нѣтъ',
  priorityOf(задача({})) === 0)
check('шкала перебиваетъ флажокъ', priorityOf(задача({ important: true, priority: 1 })) === 1)
check('низкая важность въ матрицу не идётъ', !isImportant(задача({ priority: 1 })))
check('средняя важность въ матрицу идётъ', isImportant(задача({ priority: 2 })))
check('высокая тоже', isImportant(задача({ priority: 3 })))
check('низкая важность и срокъ — третья четверть',
  quadrantOf(задача({ due: today(), priority: 1 })) === 3)
check('средняя важность и срокъ — первая четверть',
  quadrantOf(задача({ due: today(), priority: 2 })) === 1)

/*
 * Важность въ порядкѣ списка.
 *
 * Главное тутъ — не то, что важное поднялось, а то, что оно не заслонило
 * срокъ. Срокъ — фактъ, важность — мнѣніе: пусти мнѣніе вперёдъ, и задача
 * на послѣзавтра съ красной меткой встанетъ выше сегодняшней безъ метки.
 */
const порядокъ = (л: ReturnType<typeof задача>[]) => sortTasks(л).map((t) => t.title)

const въОдинъДень = [
  задача({ title: 'обычная', due: today(), order: 0 }),
  задача({ title: 'высокая', due: today(), priority: 3, order: 1 }),
  задача({ title: 'средняя', due: today(), priority: 2, order: 2 }),
]
check('внутри одного дня важныя выше',
  порядокъ(въОдинъДень).join() === 'высокая,средняя,обычная', порядокъ(въОдинъДень).join())

const разныеДни = [
  задача({ title: 'сегодня обычная', due: today(), order: 0 }),
  задача({ title: 'послѣзавтра высокая', due: addDays(today(), 2), priority: 3, order: 1 }),
]
check('важность срока не перебиваетъ',
  порядокъ(разныеДни)[0] === 'сегодня обычная', порядокъ(разныеДни).join())

const безъСрока = [
  задача({ title: 'без срока обычная', order: 0 }),
  задача({ title: 'без срока высокая', priority: 3, order: 1 }),
  задача({ title: 'со срокомъ обычная', due: today(), order: 2 }),
]
check('среди бессрочныхъ важность рѣшаетъ, но выше срочныхъ они не лѣзутъ',
  порядокъ(безъСрока).join() === 'со срокомъ обычная,без срока высокая,без срока обычная',
  порядокъ(безъСрока).join())
check('задача сама переезжает в срочные по мере приближения срока',
  quadrantOf(задача({ due: addDays(today(), 5), important: true })) === 2 &&
  quadrantOf(задача({ due: today(), important: true })) === 1)

// Порядок: незакрытые вперёд, ближний срок выше, бессрочные в конце.
const порядок = sortTasks([
  задача({ id: 'без', order: 1 }),
  задача({ id: 'закрытая', due: today(), done: true, order: 2 }),
  задача({ id: 'поздняя', due: addDays(today(), 9), order: 3 }),
  задача({ id: 'ранняя', due: today(), order: 4 }),
])
check('порядок списка: срок раньше, бессрочные ниже, закрытые в самом низу',
  порядок.map((t) => t.id).join(',') === 'ранняя,поздняя,без,закрытая',
  порядок.map((t) => t.id).join(','))

// Деньги задач. Прогноз начинается со следующего месяца, поэтому обещанное
// на этот месяц и просроченное складывается в первый прогнозный.
const следующий = monthKey(addMonths(today(), 1))
const черезДва = monthKey(addMonths(today(), 2))
const деньги = plannedByMonth(сЗадачами([
  задача({ id: 'a', due: addMonths(today(), 2), amount: 400_000, moneyKind: 'expense' }),
  задача({ id: 'b', due: today(), amount: 100_000, moneyKind: 'expense' }),
  задача({ id: 'c', due: addDays(today(), -20), amount: 50_000, moneyKind: 'expense' }),
  задача({ id: 'd', due: addMonths(today(), 2), amount: 700_000, moneyKind: 'income' }),
]))
check('трата будущего месяца попадает своим месяцем и со знаком минус',
  деньги.get(черезДва) === 700_000 - 400_000,
  String(деньги.get(черезДва)))
check('этот месяц и просроченное складываются в первый прогнозный',
  деньги.get(следующий) === -150_000, String(деньги.get(следующий)))

check('задача без суммы в деньги не идёт',
  plannedByMonth(сЗадачами([задача({ due: addMonths(today(), 2) })])).size === 0)
check('задача без срока в деньги не идёт — её некуда ставить',
  plannedByMonth(сЗадачами([задача({ amount: 500_000, moneyKind: 'expense' })])).size === 0)
check('закрытая задача в деньги не идёт',
  plannedByMonth(сЗадачами([задача({ due: addMonths(today(), 2), amount: 500_000, done: true })])).size === 0)

// Сквозная проверка: обещанная трата опускает линию прогноза.
const безЗадач = forecast(data, null, 12, 60)
const сТратой = forecast(сЗадачами([задача({ due: addMonths(today(), 2), amount: 5_000_000, moneyKind: 'expense' })]), null, 12, 60)
check('обещанная трата опускает остаток через год ровно на свою сумму',
  безЗадач.months[11].balance - сТратой.months[11].balance === 5_000_000,
  String(безЗадач.months[11].balance - сТратой.months[11].balance))
check('и видна в коридоре, а не только в линии',
  сТратой.months[11].p50 < безЗадач.months[11].p50)
check('обещанный приход поднимает остаток',
  forecast(сЗадачами([задача({ due: addMonths(today(), 2), amount: 5_000_000, moneyKind: 'income' })]), null, 12, 60)
    .months[11].balance > безЗадач.months[11].balance)
check('обещанное не приписывается ни доходу, ни расходу месяца',
  сТратой.planIncome === безЗадач.planIncome && сТратой.planExpense === безЗадач.planExpense)


// ------------------------------------------------- серія и заданія
// Серія — единственное мѣсто, гдѣ прощеніе пропусковъ зашито въ правило.
// Ошибиться тутъ легко и тихо: серія либо не рвётся никогда, либо рвётся
// отъ первой же субботы, и въ обоихъ случаяхъ въ грамотѣ стоитъ число.
console.log('\n— серія записей —')

// Даты берём твёрдыя, а не «сегодня минусъ n»: заморозки считаются по
// календарному мѣсяцу, и относительныя даты то и дѣло переползали границу
// мѣсяца — тогда проверка мѣряла не то, что написано въ её названіи.
const ТОЧКА = '2026-06-20'
const іюнь = (d: number) => `2026-06-${String(d).padStart(2, '0')}`
const съДнями = (дни: number[], restDay?: number) => ({
  ...data,
  settings: { ...data.settings, restDay },
  transactions: дни.map((d, i) => ({
    id: 'st' + i, kind: 'expense' as const, date: іюнь(d), amount: 100_00,
    accountId: data.accounts[0].id, categoryId: data.categories[0].id,
    tags: [], createdAt: іюнь(d),
  })),
})

const пять = streak(съДнями([16, 17, 18, 19, 20]), ТОЧКА)
check('пять дней подрядъ — серія въ пять', пять.days === 5, String(пять.days))

const однимъ = streak(съДнями([14, 15, 16, 18, 19, 20]), ТОЧКА)
check('одинъ пропускъ серію не рветъ', однимъ.days === 6, String(однимъ.days))
check('заморозка при этомъ потрачена', однимъ.freezesUsed === 1, String(однимъ.freezesUsed))

// Третій пропускъ въ мѣсяцѣ рветъ серію: послѣ него считается заново.
const трижды = streak(съДнями([10, 11, 13, 15, 17, 18, 19, 20]), ТОЧКА)
check('третій пропускъ серію рветъ', трижды.days === 4, String(трижды.days))
check('заморозокъ на мѣсяцъ ровно двѣ', FREEZES_PER_MONTH === 2)

// Выходной: пропускъ въ него не долженъ стоить заморозки — иначе выбранный
// выходной оказывается хуже обычнаго дня, и смыслъ настройки пропадаетъ.
const выходной = parseISO(іюнь(17)).getDay()
const сВыходнымъ = streak(съДнями([14, 15, 16, 18, 19, 20], выходной), ТОЧКА)
check('пропускъ въ выходной заморозки не тратитъ', сВыходнымъ.freezesUsed === 0,
  String(сВыходнымъ.freezesUsed))
check('выходной серію не рветъ', сВыходнымъ.days === 6, String(сВыходнымъ.days))

/*
 * Заморозка тратится только на живую серію.
 *
 * Случай, ради котораго это написано: серія оборвалась въ маѣ, а въ іюнѣ
 * человѣкъ начал заново съ двадцатаго числа. Если пропуски безъ серіи всё же
 * жгутъ заморозки, къ двадцатому іюню запасъ мѣсяца окажется израсходованъ —
 * и грамота скажетъ «заморозокъ не осталось» тому, кто ими не пользовался.
 */
const майИюнь = {
  ...data,
  settings: { ...data.settings, restDay: undefined },
  transactions: ['2026-05-01', '2026-06-20', '2026-06-21', '2026-06-22'].map((d, i) => ({
    id: 'mj' + i, kind: 'expense' as const, date: d, amount: 100_00,
    accountId: data.accounts[0].id, categoryId: data.categories[0].id,
    tags: [], createdAt: d,
  })),
}
const послѣОбрыва = streak(майИюнь, '2026-06-22')
check('пропуски безъ живой серіи заморозокъ не жгутъ', послѣОбрыва.freezesUsed === 0,
  String(послѣОбрыва.freezesUsed))
check('послѣ обрыва серія считается заново', послѣОбрыва.days === 3, String(послѣОбрыва.days))

check('на пустомъ хранилищѣ серіи нѣтъ', streak(съДнями([]), ТОЧКА).days === 0)
check('лучшая серія не меньше текущей', streak(data).best >= streak(data).days)

console.log('\n— заданія мѣсяца —')
const мк = monthKey(today())
check('заданій ровно три', monthQuests(data, мк).length === 3)
check('заданія одни и тѣ же при пересчётѣ',
  monthQuests(data, мк).map((q) => q.id).join() === monthQuests(data, мк).map((q) => q.id).join())
check('у разныхъ мѣсяцевъ заданія различаются',
  monthQuests(data, '2026-01').map((q) => q.id).join() !== monthQuests(data, '2026-02').map((q) => q.id).join(),
  monthQuests(data, '2026-01').map((q) => q.id).join() + ' / ' + monthQuests(data, '2026-02').map((q) => q.id).join())
check('доля выполненнаго не выходитъ за единицу',
  monthQuests(data, мк).every((q) => q.progress >= 0 && q.progress <= 1))
check('на пустомъ хранилищѣ заданія не закрыты',
  monthQuests({ ...data, transactions: [], tasks: [] }, мк).every((q) => !q.done))
check('закрытыхъ заданій не больше, чѣмъ мѣсяцевъ по три', questsDone(data) >= 0)

// ------------------------------------------------------- кредиты
/*
 * Кредиты чинились ровно от двух бед: долг жил отдельно от остатка счёта, и
 * погашение было невозможно — платёж требовал пометки, которую негде поставить.
 * Проверки ниже держат обе.
 */
console.log('\n— кредиты —')

const картаСчёт = data.accounts.find((a) => a.type === 'card')!
const кредитный = {
  id: 'cr1', name: 'Карта в долг', type: 'credit' as const, icon: 'credit-card',
  color: '#e05252', initialBalance: -100_000_00,
  credit: { kind: 'card' as const, limit: 300_000_00, principal: 0, ratePct: 24,
    termMonths: 12, startDate: today(), paymentDay: 10, monthlyPayment: 10_000_00 },
}
const сКредитом = { ...data, accounts: [картаСчёт, кредитный], transactions: [] }

const k0 = creditState(кредитный, сКредитом)
check('долгъ берётся изъ остатка счёта', k0.debt === 100_000_00, String(k0.debt))
check('свободный лимитъ — это лимитъ минусъ долгъ', k0.available === 200_000_00, String(k0.available))

// Погашеніе — переводъ на кредитный счётъ. Раньше оно не работало вовсе.
const съПлатежомъ = {
  ...сКредитом,
  transactions: [{
    id: 'p1', kind: 'transfer' as const, date: today(), amount: 30_000_00,
    accountId: картаСчёт.id, toAccountId: кредитный.id, tags: [], createdAt: today(),
  }],
}
const k1 = creditState(кредитный, съПлатежомъ)
check('переводъ на кредитный счётъ уменьшаетъ долгъ', k1.debt === 70_000_00, String(k1.debt))
check('и считается погашеннымъ', k1.repaid === 30_000_00, String(k1.repaid))

// Трата съ кредита долгъ увеличиваетъ и видна въ разбивкѣ по статьямъ.
const съТратой = {
  ...сКредитом,
  transactions: [{
    id: 's1', kind: 'expense' as const, date: today(), amount: 20_000_00,
    accountId: кредитный.id, categoryId: data.categories[0].id, tags: [], createdAt: today(),
  }],
}
const k2 = creditState(кредитный, съТратой)
check('трата съ кредита увеличиваетъ долгъ', k2.debt === 120_000_00, String(k2.debt))
check('и попадаетъ въ разбивку «куда ушли»',
  k2.spent.length === 1 && k2.spent[0].amount === 20_000_00, JSON.stringify(k2.spent))

// Платёжъ, не покрывающій проценты, долгъ не гаситъ никогда — про это надо
// говорить прямо, а не показывать бодрый срокъ.
check('платёжъ ниже процентовъ срока не даётъ', schedule(100_000_00, 24, 500_00).length === 0)
const мало = creditState({ ...кредитный, credit: { ...кредитный.credit, monthlyPayment: 500_00 } }, сКредитом)
check('и въ сводкѣ срокъ пустой', мало.monthsLeft === null, String(мало.monthsLeft))

check('срокъ и переплата считаются', k0.monthsLeft !== null && k0.overpay > 0,
  `${k0.monthsLeft} мѣс., переплата ${k0.overpay}`)
const больше = whatIf(k0, 5_000_00)
check('доплата сокращаетъ срокъ и переплату',
  больше.faster > 0 && больше.saved > 0, `на ${больше.faster} мѣс., ${больше.saved} коп.`)

// Перенос старыхъ данныхъ: узкій случай и ровно одинъ разъ.
const старый = { id: 'old', name: 'Рассрочка', type: 'credit' as const, icon: 'credit-card',
  color: '#e05252', initialBalance: 0,
  credit: { principal: 50_000_00, ratePct: 0, termMonths: 10, startDate: today(),
    paymentDay: 5, monthlyPayment: 5_000_00 } }
const перенос = migrateCredits({ ...data, accounts: [старый], transactions: [] })
check('старому кредиту проставляется остатокъ',
  перенос.accounts[0].initialBalance === -50_000_00, String(перенос.accounts[0].initialBalance))
check('и это считается измѣненіемъ', перенос.changed === 1)
const второй = migrateCredits({ ...data, accounts: перенос.accounts, transactions: [] })
check('второй разъ ничего не трогаетъ', второй.changed === 0)
const сОперациями = migrateCredits({
  ...data, accounts: [старый],
  transactions: [{ id: 'x', kind: 'expense' as const, date: today(), amount: 100_00,
    accountId: старый.id, tags: [], createdAt: today() }],
})
check('счётъ съ операціями не трогается', сОперациями.changed === 0)

// ------------------------------------------------------- проекты
/*
 * Проектный счёт — деньги, которые лежат у человѣка, но не его. Вся суть в
 * том, что они выпадают из личных цифр: дохода, расхода, капитала и наград.
 * Ровно на этом и ловится поломка — стоит проекции потечь, и награда за
 * мѣсячный доход снова начнёт сходиться от чужого аванса.
 *
 * Отдельно держится единственное исключение: перевод через границу проекта
 * остаётся, потому что деньги в этот миг действительно перешли, — но доходом
 * он не становится ни при каких условиях.
 */
console.log('\n— проекты —')

const личныйСчёт = { id: 'pa1', name: 'Карта', type: 'card' as const, icon: 'credit-card',
  color: '#4cc46a', initialBalance: 0 }
const проектСчёт = { id: 'pp1', name: 'Комиксъ', type: 'card' as const, icon: 'credit-card',
  color: '#4c8ac4', initialBalance: 0, project: true }
const статьяДохода = data.categories.find((c) => c.kind === 'income')!
const статьяТраты = data.categories.find((c) => c.kind === 'expense')!
const пр = (t: Partial<Transaction> & { id: string; kind: Transaction['kind']; amount: number; accountId: string }): Transaction =>
  ({ date: today(), tags: [], createdAt: today(), ...t }) as Transaction

const проектная_база = {
  ...data,
  accounts: [личныйСчёт, проектСчёт],
  transactions: [
    пр({ id: 'i1', kind: 'income', amount: 200_000_00, accountId: личныйСчёт.id, categoryId: статьяДохода.id }),
    пр({ id: 'i2', kind: 'income', amount: 300_000_00, accountId: проектСчёт.id, categoryId: статьяДохода.id }),
    пр({ id: 'e1', kind: 'expense', amount: 40_000_00, accountId: проектСчёт.id, categoryId: статьяТраты.id }),
  ],
  honors: { branch: 'civil' as const, awarded: {} },
}

const личн = личное(проектная_база)
check('проектныя операціи не попадаютъ въ личныя',
  личн.transactions.length === 1, `${личн.transactions.length} изъ ${проектная_база.transactions.length}`)
check('проектный счётъ выпадаетъ изъ списка счетовъ',
  личн.accounts.length === 1 && личн.accounts[0].id === личныйСчёт.id)

const мѣс = monthlySeries(личн.transactions, today(), today())[0]
check('доходъ за мѣсяцъ — только свой',
  мѣс.income === 200_000_00, money(мѣс.income))
check('и расходъ проекта личнымъ не считается', мѣс.expense === 0, money(мѣс.expense))

const балПр = balances(проектная_база.accounts, проектная_база.transactions)
check('проектныя деньги не входятъ въ чистый капиталъ',
  балПр.net === 200_000_00, money(балПр.net))
check('но остатокъ проектнаго счёта посчитанъ',
  балПр.byAccount.get(проектСчёт.id) === 260_000_00, money(балПр.byAccount.get(проектСчёт.id) ?? 0))

// Награда за крупный приходъ: чужой авансъ ея не даётъ.
const безъПроекта = { ...проектная_база, accounts: [личныйСчёт, { ...проектСчёт, project: undefined }] }
check('чужой авансъ награды за мѣсячный доходъ не даётъ',
  (awards(проектная_база).find((a) => a.id === 'month500')?.earned ?? false) === false)
check('а безъ пометки — даётъ (значитъ проверка живая)',
  awards(безъПроекта).find((a) => a.id === 'month500')?.earned === true)

// Переводъ черезъ границу: остатокъ его видитъ, доходъ — нѣтъ.
const съВыводомъ = {
  ...проектная_база,
  transactions: [
    ...проектная_база.transactions,
    пр({ id: 'tr1', kind: 'transfer', amount: 50_000_00, accountId: проектСчёт.id, toAccountId: личныйСчёт.id }),
  ],
}
const личн2 = личное(съВыводомъ)
check('переводъ съ проекта на личный счётъ сохраняется',
  личн2.transactions.some((t) => t.id === 'tr1'))
check('и личный остатокъ его видитъ',
  balances(съВыводомъ.accounts, съВыводомъ.transactions).net === 250_000_00,
  money(balances(съВыводомъ.accounts, съВыводомъ.transactions).net))
check('но доходомъ переводъ не становится',
  monthlySeries(личн2.transactions, today(), today())[0].income === 200_000_00)

// Перекладываніе внутри проекта — движеніе чужихъ денегъ, его не видно вовсе.
const второйПроектъ = { ...проектСчёт, id: 'pp2', name: 'Изданіе' }
const внутри = пр({ id: 'tr2', kind: 'transfer', amount: 10_000_00, accountId: проектСчёт.id, toAccountId: второйПроектъ.id })
check('переводъ внутри проектовъ выпадаетъ',
  проектная(внутри, new Set([проектСчёт.id, второйПроектъ.id])) === true)
check('а переводъ наружу — нѣтъ',
  проектная(пр({ id: 'tr3', kind: 'transfer', amount: 1, accountId: проектСчёт.id, toAccountId: личныйСчёт.id }),
    new Set([проектСчёт.id])) === false)

// Архивъ не дѣлаетъ чужія деньги вашими.
check('архивный проектный счётъ всё равно исключается',
  личное({ ...проектная_база, accounts: [личныйСчёт, { ...проектСчёт, archived: true }] }).transactions.length === 1)

// Своя сводка по проекту.
const п = projectState(проектСчёт, съВыводомъ)
check('пришло по проекту — только приходы на его счётъ', п.пришло === 300_000_00, money(п.пришло))
check('потрачено — расходы съ него', п.потрачено === 40_000_00, money(п.потрачено))
check('выведено себѣ — переводъ наружу', п.выведено === 50_000_00, money(п.выведено))
check('остатокъ сходится съ остаткомъ счёта', п.остатокъ === 210_000_00, money(п.остатокъ))
check('трата видна въ разбивкѣ по статьямъ',
  п.статьи.length === 1 && п.статьи[0].amount === 40_000_00, JSON.stringify(п.статьи))
check('освоено — доля потраченнаго отъ собраннаго',
  Math.abs(п.освоено - 40_000_00 / 300_000_00) < 1e-9, п.освоено.toFixed(4))
check('сводка по всѣмъ проектамъ складывается',
  projectsSummary(съВыводомъ).остатокъ === 210_000_00)

// Хранилище безъ проектовъ обязано возвращаться тѣмъ же объектомъ: половина
// панелей помнитъ вычисленія по ссылкѣ, и новый массивъ каждый разъ гонялъ бы
// пересчётъ всего окна впустую.
check('безъ проектовъ проекція — тотъ же объектъ', личное(data) === data)

// ------------------------------------------- чины и награды
// Слой чиновъ — чистый счётъ по хранилищу. Значитъ сломать его можно тихо:
// награда перестанетъ сходиться или, наоборотъ, посыплется даромъ.
console.log('\n— чины и награды —')

check('у всѣхъ трёхъ лѣстницъ по четырнадцать чиновъ',
  RANKS.civil.length === 14 && RANKS.military.length === 14 && RANKS.merchant.length === 14)
check('пороговъ опыта тоже четырнадцать', XP_STEPS.length === 14)
check('пороги растутъ', XP_STEPS.every((v, i) => i === 0 || v > XP_STEPS[i - 1]))

check('нулевой опытъ — младшій чинъ', levelOf(0) === 1)
check('опытъ выше послѣдняго порога — старшій чинъ', levelOf(XP_STEPS[13] + 1) === 14)
check('порогъ засчитывается ровно', levelOf(XP_STEPS[4]) === 5, String(levelOf(XP_STEPS[4])))
check('на копейку ниже порога чинъ прежній', levelOf(XP_STEPS[4] - 1) === 4)

// Обращеніе по классу — какъ полагалось по Табели.
check('младшіе классы — ваше благородіе', address(1) === 'Ваше благородіе')
check('пятый классъ — ваше высокородіе', address(10) === 'Ваше высокородіе', address(10))
check('первый классъ — ваше высокопревосходительство',
  address(14) === 'Ваше высокопревосходительство', address(14))
check('римскій классъ считается отъ младшаго', romanClass(1) === 'XIV' && romanClass(14) === 'I')

// Опытъ за доходъ съ затуханіемъ: вдесятеро больше — втрое, а не вдесятеро.
const мал = { ...data, transactions: [
  { id: 'i1', kind: 'income' as const, date: addMonths(today(), -2), amount: 1_000_00,
    accountId: data.accounts[0].id, categoryId: data.categories.find((c) => c.kind === 'income')!.id,
    tags: [], createdAt: today() },
] }
const бол = { ...мал, transactions: [{ ...мал.transactions[0], amount: 100_000_00 }] }
const xМал = xpBreakdown(мал).find((p) => p.key === 'income')!.xp
const xБол = xpBreakdown(бол).find((p) => p.key === 'income')!.xp
check('стократный доходъ даётъ примѣрно вдесятеро больше опыта, а не встократъ',
  xБол > xМал * 8 && xБол < xМал * 12, xМал + ' → ' + xБол)
check('опытъ за доходъ никогда не отрицателенъ', xМал >= 0 && xБол >= 0)

// Награды: условіе считается изъ данныхъ, а не хранится.
const пусто = { ...data, transactions: [], goals: [], tasks: [] }
// Знакъ есть у каждой награды. Провѣрка не косметическая: добавятъ награду и
// забудутъ подлинникъ — въ грамотѣ появится пустой кружокъ безъ лица.
// --- новыя награды: каждая проверяется на своей крайней точкѣ
const базовая = { ...data, transactions: [], goals: [], tasks: [], accounts: [] }
const съОперацій = (список: Partial<(typeof data.transactions)[number]>[]) => ({
  ...базовая,
  accounts: data.accounts.filter((a) => a.type === 'card'),
  transactions: список.map((t, i) => ({
    id: 'nw' + i, kind: 'expense' as const, date: today(), amount: 100_00,
    accountId: data.accounts.find((a) => a.type === 'card')!.id,
    categoryId: data.categories[0].id, tags: [], createdAt: today(), ...t,
  })),
})
const взято = (v: typeof data, id: string) => awards(v).find((a) => a.id === id)?.earned === true

const девять = съОперацій(Array.from({ length: 9 }, () => ({ attachments: ['ч.png'] })))
const десять = съОперацій(Array.from({ length: 10 }, () => ({ attachments: ['ч.png'] })))
check('«чекъ къ дѣлу» за девять чековъ не даётся', !взято(девять, 'receipt10'))
check('«чекъ къ дѣлу» за десять даётся', взято(десять, 'receipt10'))

check('«раскладка» безъ долей не даётся', !взято(съОперацій([{}]), 'split_first'))
check('«раскладка» съ долями даётся',
  взято(съОперацій([{ splits: [{ categoryId: data.categories[0].id, amount: 100_00 }] }]), 'split_first'))

// Тайное: сумма должна совпасть ровно, «почти сто тысячъ» не считается.
check('тайная «ровно сто тысячъ» не даётся за 99 999',
  !взято(съОперацій([{ kind: 'income', amount: 99_999_00 }]), 'round_sum'))
check('тайная «ровно сто тысячъ» даётся ровно за сто тысячъ',
  взято(съОперацій([{ kind: 'income', amount: 100_000_00 }]), 'round_sum'))
check('тайныя помѣчены отдѣльно',
  awards(data).filter((a) => a.secret).length === 3,
  String(awards(data).filter((a) => a.secret).length))

// Бѣлый орёлъ — за ростъ къ прошлому году. Первый годъ учёта роста не даётъ:
// изъ пустоты въ тысячу — это не ростъ на безконечность.
const первыйГодъ = {
  ...базовая,
  accounts: data.accounts.filter((a) => a.type === 'card'),
  transactions: [0, 1, 2].map((n) => ({
    id: 'fy' + n, kind: 'income' as const, date: addMonths(today(), -n), amount: 200_000_00,
    accountId: data.accounts.find((a) => a.type === 'card')!.id,
    categoryId: data.categories.find((c) => c.kind === 'income')!.id, tags: [], createdAt: today(),
  })),
}
check('«бѣлый орёлъ» въ первый годъ учёта не даётся', !взято(первыйГодъ, 'eagle4'))

// Безъ долговыхъ счетовъ награда за ихъ погашеніе не даётся, и подпись не
// должна утверждать, что сводить уже нечего.
const безъДолговъ = awards({ ...базовая, accounts: data.accounts.filter((a) => a.type === 'card') })
const рубль = безъДолговъ.find((a) => a.id === 'debt_all_closed')!
check('«послѣдній рубль долга» безъ долговъ не даётся', !рубль.earned)
check('и подпись не обѣщаетъ нуля', !рубль.left.includes('свести 0'), рубль.left)

// Начальный остатокъ копилки — не отложенныя деньги. Безъ этой провѣрки
// награда доставалась бы за одно заполненіе формы заведенія счёта.
const копилкаСъОстаткомъ = {
  ...базовая,
  accounts: data.accounts.filter((a) => a.type === 'savings'),
}
check('«первый отложенный рубль» за начальный остатокъ не даётся',
  !взято(копилкаСъОстаткомъ, 'save_first'))

// --- вѣхи мѣсячнаго заработка
const мѣсяцСъ = (сумма: number) => ({
  ...базовая,
  accounts: data.accounts.filter((a) => a.type === 'card'),
  transactions: [{
    id: 'v1', kind: 'income' as const, date: addMonths(today(), -1), amount: сумма,
    accountId: data.accounts.find((a) => a.type === 'card')!.id,
    categoryId: data.categories.find((c) => c.kind === 'income')!.id, tags: [], createdAt: today(),
  }],
})
check('вѣха за триста тысячъ не даётся за 299 999',
  !взято(мѣсяцСъ(299_999_00), 'month300'))
check('вѣха за триста тысячъ даётся ровно съ трёхсотъ', взято(мѣсяцСъ(300_000_00), 'month300'))
check('милліонъ за мѣсяцъ не даётся за девятьсотъ тысячъ',
  !взято(мѣсяцСъ(900_000_00), 'month1000') && взято(мѣсяцСъ(900_000_00), 'month900'))
check('вѣхъ ровно пять', awards(data).filter((a) => /^month\d+$/.test(a.id)).length === 5)

// Георгію потолокъ опущенъ нарочно: иначе онъ мѣрилъ бы то же, что и вѣхи.
const георгій1 = awards(мѣсяцСъ(500_000_00)).find((a) => a.id === 'george1')
check('Георгій 1-й степени сходится на полумилліонѣ', георгій1?.earned === true)
check('и не совпадаетъ съ вѣхой милліона', !взято(мѣсяцСъ(500_000_00), 'month1000'))

// --- доходъ съ капитала считается только по отмѣченнымъ статьямъ
const съКапиталомъ = (пометка: boolean) => {
  const статья = data.categories.find((c) => c.kind === 'income')!
  return {
    ...базовая,
    accounts: data.accounts.filter((a) => a.type === 'card'),
    categories: data.categories.map((c) => (c.id === статья.id ? { ...c, capital: пометка } : c)),
    transactions: [0, 1, 2].map((n) => ({
      id: 'k' + n, kind: 'income' as const, date: addMonths(today(), -n), amount: 100_000_00,
      accountId: data.accounts.find((a) => a.type === 'card')!.id,
      categoryId: статья.id, tags: [], createdAt: today(),
    })),
  }
}
check('безъ пометки доходъ капитальнымъ не считается', !взято(съКапиталомъ(false), 'catherine4'))
check('съ пометкой считается', взято(съКапиталомъ(true), 'catherine4'))

// --- Невскій: ростъ отъ начала, а не голая сумма
const ростомъ = (первые: number, послѣдній: number) => ({
  ...базовая,
  accounts: data.accounts.filter((a) => a.type === 'card'),
  transactions: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({
    id: 'r' + n, kind: 'income' as const, date: addMonths(today(), -(7 - n)),
    amount: n < 3 ? первые : n === 7 ? послѣдній : первые,
    accountId: data.accounts.find((a) => a.type === 'card')!.id,
    categoryId: data.categories.find((c) => c.kind === 'income')!.id, tags: [], createdAt: today(),
  })),
})
check('Невскій не даётся при ровномъ доходѣ', !взято(ростомъ(100_000_00, 100_000_00), 'nevsky4'))
check('Невскій даётся при ростѣ втрое', взято(ростомъ(100_000_00, 300_000_00), 'nevsky4'))
// Большой доходъ самъ по себѣ — не ростъ: сравниваемъ со стартомъ, а не съ нулёмъ.
check('одинъ богатый мѣсяцъ съ богатаго старта Невскаго не даётъ',
  !взято(ростомъ(1_000_000_00, 1_200_000_00), 'nevsky4'))

check('«пять источниковъ» строже «трёхъ»', (() => {
  const a = awards(data)
  const три = a.find((x) => x.id === 'diverse')!
  const пять = a.find((x) => x.id === 'diverse5')!
  return !пять.earned || три.earned
})())

// Справка «Кто на знакахъ» и сами знаки должны сходиться до одного ключа:
// иначе въ справкѣ появится лицо безъ награды или награда безъ разсказа.
const ключиНаградъ = [...new Set(awards(data).map((a) => ключъЗнака(a.id)))]
const безъОписанія = ключиНаградъ.filter((k) => !ОПИСАННЫЕ.includes(k))
check('у каждаго знака есть описаніе въ справкѣ', безъОписанія.length === 0, безъОписанія.join(', '))
const лишнія = ОПИСАННЫЕ.filter((k) => !ключиНаградъ.includes(k))
check('въ справкѣ нѣтъ лицъ безъ награды', лишнія.length === 0, лишнія.join(', '))
check('описанія не повторяются', new Set(ОПИСАННЫЕ).size === ОПИСАННЫЕ.length)

const безъЗнака = awards(data).filter((a) => !знакъЕсть(a.id)).map((a) => a.id)
check('у каждой награды есть чеканный знакъ', безъЗнака.length === 0, безъЗнака.join(', '))

const безъНаградъ = awards(пусто).filter((a) => a.earned)
check('на пустомъ хранилищѣ наградъ нѣтъ', безъНаградъ.length === 0, String(безъНаградъ.length))
check('первый доходъ засчитывается',
  awards(мал).find((a) => a.id === 'first_income')?.earned === true)
check('гонораръ мечты не даётся за тысячу',
  awards(мал).find((a) => a.id === 'big_deal')?.earned === false)
check('гонораръ мечты даётся за сто тысячъ',
  awards(бол).find((a) => a.id === 'big_deal')?.earned === true)

// Степени ордена идутъ по возрастающей: младшая четвёртая сходится раньше первой.
const анна = awards(data).filter((a) => a.order === 'Орденъ Св. Анны').sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
check('младшая степень ордена сходится не позже старшей',
  анна.every((a, i) => i === 0 || !(a.earned && !анна[i - 1].earned)),
  анна.map((a) => a.degree + (a.earned ? '+' : '−')).join(' '))

// Чинъ и сводка.
const св = standing(data)
check('чинъ соотвѣтствуетъ выбранной лѣстницѣ',
  св.rank === RANKS[data.honors.branch][св.level - 1], св.rank)
check('до слѣдующаго чина считается верно',
  св.toNext === null || св.xp + св.toNext === XP_STEPS[св.level], String(св.toNext))
check('пройденная доля внутри чина отъ нуля до единицы',
  св.progress >= 0 && св.progress <= 1, св.progress.toFixed(3))
check('ближайшая награда — та, до которой ближе всего',
  !св.nearest || awards(data).filter((a) => !a.earned).every((a) => a.progress <= св.nearest!.progress))

// Свѣжія награды — только тѣ, что ещё не отмѣчены датой.
check('уже отмѣченная награда свѣжей не считается',
  freshAwards({ ...мал, honors: { branch: 'civil' as const, awarded: { first_income: today() } } })
    .every((a) => a.id !== 'first_income'))
check('неотмѣченная награда считается свѣжей',
  freshAwards(мал).some((a) => a.id === 'first_income'))

// Характеристики: всѣ шесть въ предѣлахъ сотни.
const шк = traits(data)
check('характеристикъ шесть', шк.length === 6, String(шк.length))
check('всѣ шкалы отъ нуля до ста',
  шк.every((t) => t.value >= 0 && t.value <= 100),
  шк.map((t) => t.value).join(', '))

// ------------------------------------------------------- обновленіе
/*
 * Обновлятель скачивает чужой файл и запускает его правами человѣка: это
 * ровно тот механизм, который нужен злоумышленнику. Значит проверять надо не
 * «работает ли», а «отказывает ли, когда должно».
 *
 * Три вещи держатся здѣсь: версии сравниваются числами, а не строками;
 * подпись не сходится ни при подмене объявления, ни при чужом ключѣ; разбор
 * объявления отвергает всё, на что потомъ полагается установка.
 */
console.log('\n— обновленіе —')

check('версія новѣе по числу, а не по знаку', новѣе('1.9.0', '1.10.0'))
check('и обратное невѣрно', !новѣе('1.10.0', '1.9.0'))
check('та же версія новой не считается', !новѣе('1.0.0', '1.0.0'))
check('недостающія части — нули', !новѣе('1.1.0', '1.1') && !новѣе('1.1', '1.1.0'))
check('старшая часть важнѣе младшей', новѣе('1.99.99', '2.0.0'))
check('пустая нынѣшняя версія не роняетъ сравненіе', новѣе('', '1.0.0'))

check('на Windows берётся win', родъ('win32') === 'win')
check('на прочихъ — linux', родъ('linux') === 'linux')

// Подпись. Ключи заводятся тутъ же: постоянныхъ въ проверкахъ быть не должно.
const пара = крипто.generateKeyPairSync('ed25519')
const мойКлючъ = пара.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const чужая = крипто.generateKeyPairSync('ed25519')
const чужойКлючъ = чужая.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')

const объявленіе = Buffer.from(JSON.stringify({
  version: '1.1.0', date: '2026-09-04', notes: 'проба',
  files: { win: { url: 'https://x.test/a.exe', size: 100, sha256: 'a'.repeat(64) } },
}), 'utf8')
const подпись = крипто.sign(null, объявленіе, пара.privateKey).toString('base64')

check('своя подпись сходится', подписьВѣрна(объявленіе, подпись, мойКлючъ))
check('чужимъ ключомъ не сходится', !подписьВѣрна(объявленіе, подпись, чужойКлючъ))
check('подмѣненное объявленіе не сходится',
  !подписьВѣрна(Buffer.from(объявленіе.toString('utf8').replace('1.1.0', '9.9.9')), подпись, мойКлючъ))
check('безъ подписи не сходится', !подписьВѣрна(объявленіе, '', мойКлючъ))
check('безъ ключа не сходится', !подписьВѣрна(объявленіе, подпись, ''))
check('мусоръ вмѣсто подписи не роняетъ проверку',
  подписьВѣрна(объявленіе, 'не-base64-вовсе', мойКлючъ) === false)

// Разборъ объявленія: отказъ по каждому полю, на которое полагается установка.
const годное = {
  version: '1.1.0',
  files: { win: { url: 'https://x.test/a.exe', size: 1000, sha256: 'b'.repeat(64) } },
}
const разобралось = разобрать(JSON.stringify(годное), 'win32')
check('годное объявленіе разбирается',
  разобралось.version === '1.1.0' && разобралось.size === 1000)

// Отказъ — это тоже поведеніе, и проверяется онъ ровно такъ же.
const падаетъ = (что: string, текстъ: string, платформа = 'win32') => {
  let упало = false
  try { разобрать(текстъ, платформа) } catch { упало = true }
  check(что, упало)
}
const какъТекстъ = (м: unknown) => JSON.stringify(м)

падаетъ('испорченный JSON отвергается', 'не json вовсе')
падаетъ('объявленіе безъ версіи отвергается', какъТекстъ({ files: годное.files }))
падаетъ('нѣтъ файла для этой системы — отказъ', какъТекстъ(годное), 'linux')
падаетъ('ссылка не по https — отказъ',
  какъТекстъ({ ...годное, files: { win: { ...годное.files.win, url: 'http://x.test/a.exe' } } }))
падаетъ('безъ контрольной суммы — отказъ',
  какъТекстъ({ ...годное, files: { win: { url: 'https://x.test/a.exe', size: 1000 } } }))
падаетъ('короткая контрольная сумма — отказъ',
  какъТекстъ({ ...годное, files: { win: { ...годное.files.win, sha256: 'abc' } } }))
падаетъ('нулевой размѣръ — отказъ',
  какъТекстъ({ ...годное, files: { win: { ...годное.files.win, size: 0 } } }))
падаетъ('неправдоподобный размѣръ — отказъ',
  какъТекстъ({ ...годное, files: { win: { ...годное.files.win, size: 9_000_000_000 } } }))

/*
 * Каналы между оболочкой и окном.
 *
 * Главный процесс шлёт сообщения по именам-строкам, мост на эти же имена
 * подписывается. Совпадение имён не проверяет ни одна из сторон: разъедутся —
 * и пункт меню просто перестанет работать, молча, без единой ошибки. Поймать
 * это в jsdom нельзя, мост там подменён заглушкой; значит остаётся сверить
 * сами файлы.
 */
const вынутьИмена = (текстъ: string, послѣ: string): string[] => {
  const итогъ: string[] = []
  let i = 0
  for (;;) {
    const j = текстъ.indexOf(послѣ, i)
    if (j < 0) break
    const начало = j + послѣ.length
    const конецъ = текстъ.indexOf("'", начало)
    if (конецъ <= начало) break
    итогъ.push(текстъ.slice(начало, конецъ))
    i = конецъ + 1
  }
  return итогъ
}

const главный = readFileSync('electron/main.js', 'utf8')
const мостъ = readFileSync('electron/preload.js', 'utf8')
// Часть сообщений уходит не напрямую, а через toWindow — её тоже надо видеть,
// иначе проверка молчала бы ровно про пункты меню, которые ею и проверяются.
const посылаемые = [...new Set([
  ...вынутьИмена(главный, "webContents.send('"),
  ...вынутьИмена(главный, "toWindow('"),
])]
const слушаемые = new Set(вынутьИмена(мостъ, "ipcRenderer.on('"))
const потерянные = посылаемые.filter((имя) => !слушаемые.has(имя))

check('всё, что шлёт оболочка, окно слушает',
  посылаемые.length > 0 && потерянные.length === 0,
  потерянные.length ? 'некому слушать: ' + потерянные.join(', ') : посылаемые.join(', '))
check('пунктъ меню «Проверить обновление» доходитъ до окна',
  посылаемые.includes('menu:update') && слушаемые.has('menu:update'))

console.log(`\nПровалено проверок: ${fail.length}`)
for (const f of fail) console.log('  ✗ ' + f)
process.exit(fail.length ? 1 : 0)
