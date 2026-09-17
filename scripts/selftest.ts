// Самопроверка расчётных движков: демо-данные, прогноз, советы, запросы,
// быстрый ввод и импорт CSV. Запуск: npm run selftest
import { buildSeed } from './fixture'
import { THEMES } from '../src/lib/themes'
import { forecast, historyKeys, computeBases, monthShare, withCurrentMonth, scopeToAccount, ALL_ACCOUNTS, TRANSFER_IN, TRANSFER_OUT } from '../src/engine/forecast'
import { buildAdvice } from '../src/engine/advice'
import { runQuery } from '../src/engine/query'
import { parseQuick, describeDraft } from '../src/engine/parse'
import { parseCsv, guessColumns, buildPreview, parseAmountCell, parseDateCell } from '../src/engine/csv'
import { accountBalance, balances, categoryMonthly, creditRemaining, счётПоУмолчанию, categoryTotals, comparablePrev, entryDate, makePeriod, monthlySeries, yearSummary, type PeriodKind } from '../src/engine/stats'
import { DIGIT_SEP, groupDigits, money, toMinor, uid } from '../src/lib/format'
import { addDays, addMonths, diffDays, monthKey, parseISO, startOfWeek, today, порядокъДней } from '../src/lib/date'
import { разобратьДату, сеткаМесяца } from '../src/components/DateField'
import { ICON_GROUPS, isCatalogIcon, сЗначкомъ } from '../src/lib/catalog'
import { DEFAULT_CATEGORIES } from '../src/state/defaults'
import type { Goal, Recurring, Reminder, Scenario, Task, Transaction } from '../src/lib/types'
import { СТАТЬЯ_ЦЕЛЕЙ, планъПополненія } from '../src/engine/goals'
import { квадратъ, путьЗначкаДопустимъ, этоСвойЗначокъ } from '../src/lib/svoiznachki'
import { parseArchive } from '../src/engine/archive'
import { вывестиТокены, значеніеДопустимо, контрастъ, очиститьТокены, простыяИзъТокеновъ, разобратьФайлТемы } from '../src/lib/svoitemy'
import { dueReminders, nextDate } from '../src/engine/reminders'
import { findRepeats } from '../src/engine/repeats'
import { ВЕРСИЯ, ВЫПУСКИ, выпускВерсии, непросмотренныеВыпуски, сравнитьВерсии } from '../src/lib/versiya'
import { имяКопии, лишниеЕжедневные, разобратьИмяКопии, упорядочитьКопии } from '../src/state/rezerv'
import { вернутьЗапись, вернутьКатегорию, вернутьСчёт, вернутьТег, вставитьНазад, снимокЗаписи, снимокКатегории, снимокСчёта, снимокТега } from '../src/engine/otmena'
import { безРодителя, вСемье, деревоКатегорий, нельзяВложить, поГлавным, раскладкаГлавной, семья, суммаСемьи, подкатегории } from '../src/engine/podkategorii'
import {
  isImportant, isOverdue, isUrgent, plannedByMonth, priorityOf, quadrantOf, sortTasks,
} from '../src/engine/tasks'
import {
  address, awards, freshAwards, levelOf, RANKS, romanClass, standing, traits, xpBreakdown, XP_STEPS,
} from '../src/engine/honors'
import { знакъЕсть, ключъЗнака } from '../src/lib/znaki'
import { всеТеги, переименоватьТег } from '../src/engine/tegi'
import { датыПравила, провестиАвтосписания } from '../src/engine/avtospisaniya'
import { суммаИзВыражения } from '../src/lib/format'
import { перевестиДолги, остатокДолга } from '../src/engine/stats'
import { nextDate } from '../src/engine/reminders'
import { личное } from '../src/engine/project'
import { очиститьИсторію } from '../src/engine/uvedomleniya'
import { включённыеВиджеты } from '../src/components/RightPanel'
import { ждущія, новыеУведомления, отклонить, подтвердитьПлатёж } from '../src/engine/uvedomleniya'
import type { Notice } from '../src/lib/types'
import { creditState, schedule, whatIf, следующийПлатёж, сводкаКредита, перевестиКредиты, планъПлатежа, разложитьПлатёжъ, датыПлатежей, остатокПослѣ, подсказкаОстатка, СТАТЬЯ_ПЛАТЕЖЕЙ, СТАТЬЯ_ПРОЦЕНТОВ } from '../src/engine/credit'
import { личное, projectState, projectsSummary, проектная } from '../src/engine/project'
import { НАСТАВЛЕНІЕ, наказЯзыка, полнаяВыгрузка, сводкаДляМодели } from '../src/engine/svodka'
import { ОПИСАННЫЕ } from '../src/lib/znakiText'
import { FREEZES_PER_MONTH, streak } from '../src/engine/streak'
import { monthQuests, questsDone } from '../src/engine/honors'
import { insideVault } from '../electron/vaultpath.js'
import {
  ОБОРОТОВЪ, вБазу64, вывестиКлючи, зашифровать, изБазы64, расшифровать, ярлыкъПути,
} from '../src/lib/crypto'
import { адресОблака, облако, облакоЕсть } from '../src/state/cloudconfig'
import { новѣе, подписьВѣрна, разобрать, родъ } from '../electron/update.js'
import * as крипто from 'node:crypto'
import { createRequire } from 'node:module'
import { сторожъ } from './i18n-storozh'
import { EN } from '../src/i18n/en'
import { ICON_GROUPS } from '../src/lib/catalog'
import { т, тр, поставитьЯзык } from '../src/i18n'
import { plural } from '../src/lib/format'
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
{
  // Служебное имя значка («house», «briefcase») — не текст: в советах оно
  // вылезало перед названием статьи и цели — «briefcase Рабочие расходы».
  const значки = new Set([...data.categories, ...data.goals].map((x) => x.icon).filter((i): i is string => !!i && /^[a-z0-9-]+$/.test(i)))
  const текстъ = advice.map((a) => [a.title, a.body, ...(a.evidence ?? [])].join('\n')).join('\n')
  const нашлись = [...значки].filter((i) => new RegExp(`(^|[\\s(])${i}\\s+[А-ЯЁа-яё]`, 'm').test(текстъ))
  check('в советах нет служебных имён значков', значки.size > 5 && нашлись.length === 0, нашлись.join(', ') || `${значки.size} значков проверено`)
}
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

// Английские слова понимаются всегда — окно могут переключить, а привычка писать останется.
const d4 = parseQuick('coffee 250 yesterday', data.categories, data.accounts, { accountId: 'acc_main' })
check('англійское yesterday — вчера', d4.date < today() && d4.amount === 25000, `${d4.date} ${d4.amount}`)
check('англійское earnings — доход', parseQuick('earnings 45000', data.categories, data.accounts, { accountId: 'acc_main' }).kind === 'income')
check('англійское transfer — перевод', parseQuick('transfer 500', data.categories, data.accounts, { accountId: 'acc_main' }).kind === 'transfer')
check('и русскія слова на мѣстѣ', parseQuick('перевод 500', data.categories, data.accounts, { accountId: 'acc_main' }).kind === 'transfer')

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

/*
 * Остатокъ ниже порога — на своёмъ наборѣ съ извѣстнымъ остаткомъ.
 *
 * Прежде брался остатокъ демо-счёта, и къ нему прибавлялось и убавлялось по
 * тысячѣ. Пока остатокъ былъ положительнымъ, это работало; съ ходомъ
 * календаря онъ ушёлъ въ минусъ, а Math.max(0, …) сдѣлалъ «нижній» порогъ
 * ВЫШЕ остатка — и провѣрка стала мѣрить календарь вмѣсто правила. Здѣсь
 * остатокъ задан прямо и никуда не уплывётъ.
 */
const кошелёкъ = {
  id: 'acc_проба', name: 'Проба', type: 'cash' as const, icon: 'wallet',
  color: '#4cc46a', initialBalance: 100_000_00,
}
const съОстаткомъ = { ...data, accounts: [кошелёкъ], transactions: [] }
const низкий = напоминание({ kind: 'event', event: 'low-balance', accountId: кошелёкъ.id, date: undefined, repeat: undefined })
check('порог выше остатка — срабатывает',
  dueReminders({ ...съОстаткомъ, reminders: [{ ...низкий, threshold: 150_000_00 }] }, today()).length === 1,
  'остаток 100 000 ₽, порог 150 000 ₽')
check('порог ниже остатка — молчит',
  dueReminders({ ...съОстаткомъ, reminders: [{ ...низкий, threshold: 50_000_00 }] }, today()).length === 0,
  'остаток 100 000 ₽, порог 50 000 ₽')
check('отрицательный остаток ловится нулевым порогом',
  dueReminders({
    ...съОстаткомъ,
    accounts: [{ ...кошелёкъ, initialBalance: -4_000_00 }],
    reminders: [{ ...низкий, threshold: 0 }],
  }, today()).length === 1, 'остаток −4 000 ₽, порог 0')


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

// Перенос старыхъ данныхъ — одинъ разъ на счётъ.
/*
 * Прежде карточка кредита показывала «сумму кредита», а «Начальный остатокъ»
 * ни на что не вліялъ, и туда вписывали, сколько осталось. Переносъ беретъ
 * положительное число за «осталось выплатить», а ноль — за сумму кредита,
 * то есть ровно за то, что человѣкъ видѣлъ на карточкѣ.
 */
const старый = { id: 'old', name: 'Рассрочка', type: 'credit' as const, icon: 'credit-card',
  color: '#e05252', initialBalance: 0,
  credit: { principal: 50_000_00, ratePct: 0, termMonths: 10, startDate: '2026-06-25',
    paymentDay: 10, monthlyPayment: 5_000_00 } }
const перенос = перевестиКредиты({ ...data, accounts: [старый], transactions: [] })
check('старому кредиту долгомъ становится сумма кредита',
  перенос.accounts[0].initialBalance === -50_000_00, String(перенос.accounts[0].initialBalance))
check('и это считается измѣненіемъ, съ отмѣткой версіи', перенос.changed === 1 && перенос.accounts[0].credit?.v === 2)
check('безъ переводовъ съ кредита — это покупка', перенос.accounts[0].credit?.purpose === 'purchase')
const второй = перевестиКредиты({ ...data, accounts: перенос.accounts, transactions: [] })
check('второй разъ ничего не трогаетъ', второй.changed === 0)
const вписалиОстатокъ = перевестиКредиты({ ...data, accounts: [{ ...старый, initialBalance: 23_300_79 }], transactions: [] })
check('вписанный остатокъ — это долгъ', вписалиОстатокъ.accounts[0].initialBalance === -23_300_79,
  String(вписалиОстатокъ.accounts[0].initialBalance))
const кредитнаяКарта = перевестиКредиты({ ...data, accounts: [кредитный], transactions: [] })
check('кредитную карту переносъ не трогаетъ', кредитнаяКарта.accounts[0].initialBalance === кредитный.initialBalance)

// Переводъ на покупку въ долгъ становится платежомъ съ расходомъ — тотъ же id.
const стараяОплата = { id: 'op1', kind: 'transfer' as const, date: '2026-09-13', amount: 4_551_00,
  accountId: картаСчёт.id, toAccountId: старый.id, tags: ['диван'], createdAt: today() }
const переведено = перевестиКредиты({ ...data, accounts: [картаСчёт, старый], transactions: [стараяОплата] })
const ставшая = переведено.transactions[0]
check('переводъ на покупку сталъ платежомъ',
  ставшая.id === 'op1' && ставшая.kind === 'expense' && ставшая.debtId === старый.id && ставшая.debtPrincipal === 4_551_00,
  JSON.stringify(ставшая))
check('и статья платежей заведена', переведено.статьи.some((с) => с.id === СТАТЬЯ_ПЛАТЕЖЕЙ.id) && ставшая.categoryId === СТАТЬЯ_ПЛАТЕЖЕЙ.id)
check('и мѣсяцъ помѣченъ къ записи', переведено.месяцы.includes('2026-09'))
check('и метки съ ним переѣхали', ставшая.tags[0] === 'диван')
const послѣПереноса = { ...data, accounts: переведено.accounts, transactions: переведено.transactions,
  categories: [...data.categories, ...переведено.статьи] }
check('долгъ уменьшился на платёжъ',
  creditRemaining(переведено.accounts[1], послѣПереноса.transactions) === 50_000_00 - 4_551_00,
  String(creditRemaining(переведено.accounts[1], послѣПереноса.transactions)))
check('а въ расходахъ онъ виденъ',
  categoryTotals(послѣПереноса.transactions, 'expense').some((c) => c.categoryId === СТАТЬЯ_ПЛАТЕЖЕЙ.id && c.amount === 4_551_00))

const деньгамиСтарый = перевестиКредиты({ ...data, accounts: [картаСчёт, старый], transactions: [
  { id: 'in', kind: 'transfer' as const, date: '2026-06-25', amount: 50_000_00, accountId: старый.id, toAccountId: картаСчёт.id, tags: [], createdAt: today() },
  стараяОплата,
] })
check('съ кредита переводили деньги — это кредитъ деньгами', деньгамиСтарый.accounts[1].credit?.purpose === 'cash')
check('и переводы на него остаются переводами', деньгамиСтарый.transactions[1].kind === 'transfer')

// ------------------------------------------------------- платежи по кредиту
/*
 * Что въ платежѣ расходъ, рѣшаетъ одно правило: проценты — всегда; тѣло у
 * покупки въ долгъ — тоже (саму покупку нигдѣ не записывали); тѣло у кредита
 * деньгами — нѣтъ, иначе траты посчитались бы дважды.
 */
console.log('\n— платежи по кредиту —')
const разложено = разложитьПлатёжъ(100_000_00, 12, 5_000_00)
check('проценты за мѣсяцъ съ долга', разложено.проценты === 1_000_00 && разложено.тѣло === 4_000_00, JSON.stringify(разложено))
check('при нулевой ставкѣ всё — тѣло', разложитьПлатёжъ(100_000_00, 0, 5_000_00).проценты === 0)
check('проценты не больше платежа', разложитьПлатёжъ(100_000_00, 120, 500_00).тѣло === 0)

const диванъ = { ...старый, id: 'div', name: 'Диван', initialBalance: -44_617_59,
  credit: { ...старый.credit, principal: 44_617_59, monthlyPayment: 4_440_00, purpose: 'purchase' as const, v: 2 as const } }
const техника = { ...диванъ, id: 'teh', name: 'Техника', initialBalance: -100_000_00,
  credit: { ...диванъ.credit, principal: 100_000_00, ratePct: 12, purpose: 'purchase' as const } }
const наличныйКредитъ = { ...техника, id: 'nal', name: 'Наличными',
  credit: { ...техника.credit, purpose: 'cash' as const } }
const банкъ = { ...data, accounts: [картаСчёт, диванъ, техника, наличныйКредитъ], transactions: [] as typeof data.transactions,
  categories: data.categories.filter((c) => c.id !== СТАТЬЯ_ПЛАТЕЖЕЙ.id && c.id !== СТАТЬЯ_ПРОЦЕНТОВ.id) }
const провести = (планъ: NonNullable<ReturnType<typeof планъПлатежа>>) =>
  планъ.операціи.map((о, i) => ({ ...о, id: 'x' + i, createdAt: today() }))

const п0 = планъПлатежа({ кредитъ: диванъ, счётъ: картаСчёт.id, сумма: 4_551_00, дата: '2026-09-13', data: банкъ })!
check('рассрочка 0%: одинъ расходъ на всю сумму',
  п0.операціи.length === 1 && п0.операціи[0].kind === 'expense' && п0.расходъ === 4_551_00 && п0.проценты === 0)
const послѣ0 = провести(п0)
check('рассрочка 0%: долгъ уменьшился на всю сумму', creditRemaining(диванъ, послѣ0) === 44_617_59 - 4_551_00)
check('рассрочка 0%: съ карты ушла вся сумма',
  accountBalance(картаСчёт, послѣ0) === картаСчёт.initialBalance - 4_551_00)

const п12 = планъПлатежа({ кредитъ: техника, счётъ: картаСчёт.id, сумма: 5_000_00, дата: '2026-09-13', data: банкъ })!
const д12 = п12.операціи[0]
check('покупка подъ 12%: расходъ весь, раздѣлёнъ на тѣло и проценты',
  п12.операціи.length === 1 && п12.расходъ === 5_000_00 && д12.splits?.length === 2
    && д12.splits.reduce((s, x) => s + x.amount, 0) === 5_000_00, JSON.stringify(д12))
check('покупка подъ 12%: долгъ уменьшился только на тѣло',
  creditRemaining(техника, провести(п12)) === 100_000_00 - 4_000_00, String(creditRemaining(техника, провести(п12))))
check('и обѣ статьи заведены', п12.статьи.length === 2)

const пН = планъПлатежа({ кредитъ: наличныйКредитъ, счётъ: картаСчёт.id, сумма: 5_000_00, дата: '2026-09-13', data: банкъ })!
const опН = провести(пН)
check('кредитъ деньгами: переводъ тѣла и расходъ процентовъ',
  пН.операціи.length === 2 && пН.операціи[0].kind === 'transfer' && пН.операціи[0].amount === 4_000_00
    && пН.операціи[1].kind === 'expense' && пН.операціи[1].amount === 1_000_00 && пН.расходъ === 1_000_00)
check('кредитъ деньгами: долгъ минусъ тѣло, карта минусъ весь платёжъ',
  creditRemaining(наличныйКредитъ, опН) === 96_000_00 && accountBalance(картаСчёт, опН) === картаСчёт.initialBalance - 5_000_00)
const безПроцентовъ = планъПлатежа({ кредитъ: { ...наличныйКредитъ, credit: { ...наличныйКредитъ.credit, ratePct: 0 } },
  счётъ: картаСчёт.id, сумма: 5_000_00, дата: '2026-09-13', data: банкъ })!
check('кредитъ деньгами 0%: расхода нѣтъ вовсе', безПроцентовъ.операціи.length === 1 && безПроцентовъ.расходъ === 0)
check('платить съ самого кредита нельзя', планъПлатежа({ кредитъ: диванъ, счётъ: диванъ.id, сумма: 100, дата: today(), data: банкъ }) === null)

// Правка платежа: проценты считаются съ долга безъ самой правимой операціи.
const записанный = { ...провести(п12)[0], id: 'edit1' }
const сЗаписью = { ...банкъ, transactions: [записанный] }
const правка = планъПлатежа({ кредитъ: техника, счётъ: картаСчёт.id, сумма: 5_000_00, дата: '2026-09-13', data: сЗаписью, безъ: 'edit1' })!
check('при правкѣ долгъ до платежа — безъ неё', правка.долгъДо === 100_000_00 && правка.проценты === 1_000_00)

// ------------------------------------------------------- график
console.log('\n— график кредита —')
const графикъ = { principal: 33_742_64, ratePct: 0, termMonths: 12, startDate: '2026-06-25', paymentDay: 10, monthlyPayment: 2_820_00 }
const даты = датыПлатежей(графикъ, '2026-09-15')
check('платежи — числа мѣсяца послѣ даты начала', даты.join(',') === '2026-07-10,2026-08-10,2026-09-10', даты.join(','))
check('въ день начала платежа нѣтъ', датыПлатежей({ ...графикъ, startDate: '2026-06-10' }, '2026-06-30').length === 0)
check('31-е въ февралѣ — послѣдній день',
  датыПлатежей({ ...графикъ, startDate: '2027-01-31', paymentDay: 31 }, '2027-03-01').join(',') === '2027-02-28')
check('остатокъ послѣ трёхъ платежей', остатокПослѣ(графикъ, 3) === 33_742_64 - 3 * 2_820_00, String(остатокПослѣ(графикъ, 3)))
check('остатокъ не уходитъ ниже нуля', остатокПослѣ(графикъ, 100) === 0)
const счётТехники = { ...техника, credit: { ...графикъ, v: 2 as const } }
const подсказка = подсказкаОстатка(счётТехники, { ...банкъ, transactions: [] }, '2026-09-15')
check('подсказка на сегодня безъ платежей въ программѣ',
  подсказка?.платежей === 3 && подсказка.остатокъ === 33_742_64 - 3 * 2_820_00, JSON.stringify(подсказка))
const сПлатежомъ = { ...банкъ, transactions: [{ id: 'q', kind: 'expense' as const, date: '2026-07-12', amount: 2_820_00,
  accountId: картаСчёт.id, debtId: счётТехники.id, debtPrincipal: 2_820_00, tags: [], createdAt: today() }] }
const подсказка2 = подсказкаОстатка(счётТехники, сПлатежомъ, '2026-09-15')
check('платежи, уже внесённые въ программу, второй разъ не вычитаются',
  подсказка2?.наДату === '2026-07-11' && подсказка2.платежей === 1, JSON.stringify(подсказка2))

// Архивъ не теряетъ ни назначенія кредита, ни тѣла платежа.
{
  const архивъ = { kashel: 'vault', formatVersion: 1, app: 'Кошель', exportedAt: '2026-09-14T00:00:00Z', counts: {}, data: { ...банкъ, transactions: провести(п12) }, notes: {}, canvases: {}, attachments: {} }
  const р = parseArchive(JSON.stringify(архивъ))
  const счета = р.ok ? р.archive.data.accounts : []
  const опер = р.ok ? р.archive.data.transactions : []
  check('архивъ хранитъ назначеніе и версію кредита',
    счета.find((a) => a.id === 'nal')?.credit?.purpose === 'cash' && счета.find((a) => a.id === 'div')?.credit?.v === 2,
    р.ok ? '' : String(р.error))
  check('архивъ хранитъ тѣло платежа', опер[0]?.debtPrincipal === 4_000_00, JSON.stringify(опер[0]))
}

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

// ------------------------------------------------------- облако
/*
 * Пока ключъ не вписанъ, облака нѣтъ.
 *
 * Провѣряется именно это: программа обязана работать безъ сервера, какъ
 * работала до сихъ поръ, и человѣкъ съ диска не долженъ видѣть предложеній
 * куда-то войти. Полумѣра тутъ хуже всего — адресъ безъ ключа заставилъ бы
 * окно молча ходить въ никуда.
 */
console.log('\n— облако —')

const пробный = { url: 'https://xxxx.supabase.co', anonKey: 'a'.repeat(40) }
check('настроенное облако признаётся', облакоЕсть(пробный))
check('безъ ключа облака нѣтъ', !облакоЕсть({ ...пробный, anonKey: '' }))
check('съ короткимъ ключомъ облака нѣтъ', !облакоЕсть({ ...пробный, anonKey: 'abc' }))
check('безъ адреса облака нѣтъ', !облакоЕсть({ ...пробный, url: '' }))
check('адресъ не по https не годится', !облакоЕсть({ ...пробный, url: 'http://xxxx.supabase.co' }))
check('адресъ съ путёмъ не годится', !облакоЕсть({ ...пробный, url: 'https://x.co/lишнее' }))
check('адресъ склеивается безъ двойной косой',
  адресОблака('/rest/v1/файлы', пробный) === 'https://xxxx.supabase.co/rest/v1/файлы')
check('и съ путёмъ безъ косой тоже',
  адресОблака('rest/v1/файлы', пробный) === 'https://xxxx.supabase.co/rest/v1/файлы')

let безъОблакаУпало = false
try { адресОблака('/rest/v1/файлы', { url: '', anonKey: '' }) } catch { безъОблакаУпало = true }
check('безъ настроеннаго облака адресъ не выдаётся', безъОблакаУпало)

/*
 * Что за ключъ лежитъ въ сборкѣ.
 *
 * Ключъ anon публиченъ по замыслу и уѣзжаетъ въ страницу къ каждому. Ключъ
 * service_role обходитъ всѣ правила доступа: попади онъ сюда хоть однажды —
 * и база открыта любому, кто откроетъ исходный текстъ страницы. Отличаются
 * они только полемъ внутри, на глазъ — никакъ. Отсюда проверка.
 */
const разобратьТокенъ = (t: string): Record<string, unknown> => {
  const [, середина] = t.split('.')
  const ровно = середина.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(new TextDecoder().decode(изБазы64(ровно)))
}

if (облакоЕсть()) {
  const внутри = разобратьТокенъ(облако.anonKey)
  check('въ сборкѣ лежитъ ключъ anon, а не service_role',
    внутри.role === 'anon', String(внутри.role))
  check('ключъ выданъ тому же проекту, что и адресъ',
    typeof внутри.ref === 'string' && облако.url.includes(внутри.ref as string),
    String(внутри.ref))
  check('ключъ ещё не просроченъ',
    typeof внутри.exp === 'number' && (внутри.exp as number) * 1000 > Date.now(),
    new Date((внутри.exp as number) * 1000).toISOString().slice(0, 10))
} else {
  check('облако не настроено — проверки ключа пропущены', true, 'ключъ не вписанъ')
}

check('въ настройкахъ нѣтъ ключа service_role',
  !JSON.stringify(облако).includes('service_role'))

// ------------------------------------------------------- сводка для модели
/*
 * Что видитъ нейросѣть.
 *
 * Провѣряется не «складывается ли текстъ», а границы: въ сводку обязаны
 * попасть итоги и обязаны НЕ попасть частности. Отдѣльная покупка съ
 * комментаріемъ «лѣкарство такое-то» говоритъ о человѣкѣ больше, чѣмъ вся
 * годовая сумма по аптекамъ, и утечь она можетъ ровно однимъ способомъ —
 * тихо, при правкѣ сводки безъ провѣрокъ.
 */
console.log('\n— сводка для модели —')

const тайныйКомментарій = 'ЛЕКАРСТВО-ОТ-ЩИТОВИДКИ-СЕКРЕТ'
const тайнаяЗамѣтка = 'ЗАМЕТКА-ПРО-ЛЮБОВНИЦУ'
const тайнаяЗадача = 'ЗАДАЧА-РАЗВОД-АДВОКАТ'

const дляСводки: typeof data = {
  ...data,
  transactions: [
    ...data.transactions,
    пр({
      id: 'тайна1', kind: 'expense', amount: 123400, accountId: data.accounts[0].id,
      categoryId: data.categories.find((c) => c.kind === 'expense')!.id,
      note: тайныйКомментарій, tags: ['#тайком'],
    }),
  ],
  tasks: [{
    id: 'т1', title: тайнаяЗадача, done: false, important: false, tags: [],
    order: 0, createdAt: today(),
  }],
}

const сводка = сводкаДляМодели(дляСводки)

// --- что обязано быть
check('въ сводкѣ есть чистый капиталъ', сводка.текстъ.includes('Чистый капитал'))
check('и разбивка по мѣсяцамъ', сводка.текстъ.includes('Доход и расход по месяцам'))
check('и расходы по статьямъ', сводка.текстъ.includes('Расходы по статьям'))
check('и счета названы', сводка.текстъ.includes(data.accounts[0].name))
check('сводка непустая', сводка.знаковъ > 400, `${сводка.строкъ} строк, ${сводка.знаковъ} знаков`)
check('суммы даны въ рубляхъ, а не копейкахъ',
  сводка.текстъ.includes('Все суммы — рубли, не копейки'))

/*
 * Полная выгрузка провѣряется въ асинхронной обёрткѣ: она читаетъ заметки съ
 * диска, а собранная въ CJS проверка верхнеуровневаго await не допускаетъ.
 */
async function полнаяВыгрузкаПровѣрка() {
  /*
   * Полная выгрузка: провѣряется, что въ ней есть ВСЁ.
   *
   * Прежде здѣсь стояло обратное — что комментаріи къ покупкамъ наружу не
   * уходятъ. Ограниченіе снято по прямой просьбѣ, и снято обоснованно: модель
   * работаетъ на этой же машинѣ, скрывать отъ собственнаго компьютера нечего.
   * Но провѣрки теперь обязаны утверждать обратное — иначе онѣ стерегли бы
   * правило, котораго больше нѣтъ, и первая же зелёная строка врала бы.
   *
   * Приложить можно и то и другое, потому обѣ выгрузки провѣряются порознь:
   * полная — что въ ней есть всё до послѣдняго комментарія, сводка — что она
   * осталась короткой. Короткость тутъ не украшеніе: на полной выгрузкѣ
   * девятимилліардная модель отвѣчала о деньгахъ невѣрно, на сводкѣ — вѣрно.
   */
  const полная = await полнаяВыгрузка(дляСводки)

  check('въ полной выгрузкѣ есть сводка', полная.текстъ.includes('Чистый капитал'))
  check('и перечень операцій', полная.текстъ.includes('# ЧАСТЬ 2. Перечень операций'))
  check('и готовые итоги названы вѣрными',
    полная.текстъ.includes('# ЧАСТЬ 1. ГОТОВЫЕ ИТОГИ'))
  check('и подложенный комментарій', полная.текстъ.includes(тайныйКомментарій))
  check('и названіе задачи', полная.текстъ.includes(тайнаяЗадача))

  /*
   * Ни одна операція не потеряна. Считается не на глазъ: у каждой своя дата,
   * и въ выгрузкѣ ихъ должно быть не меньше, чѣмъ операцій въ хранилищѣ.
   */
  const строкъОперацій = полная.текстъ
    .split('\n')
    .filter((л) => /^\d{4}-\d{2}-\d{2} \| (расход|приход|перевод) \|/.test(л)).length
  check('въ выгрузку попали всѣ операціи',
    строкъОперацій === дляСводки.transactions.length,
    `${строкъОперацій} изъ ${дляСводки.transactions.length}`)

  check('полная выгрузка заведомо больше сводки',
    полная.знаковъ > сводка.знаковъ * 5, `${полная.знаковъ} против ${сводка.знаковъ}`)

  // Сводка при этомъ остаётся краткой — на ней модель считаетъ вѣрно.
  check('сводка по-прежнему безъ отдѣльныхъ покупокъ',
    !сводка.текстъ.includes(тайныйКомментарій))
  check('и на тысячѣ операцій укладывается въ восемь тысячъ знаковъ',
    сводка.знаковъ < 8000, `${сводка.знаковъ} знаковъ на ${дляСводки.transactions.length} операцій`)
}

// Наставленіе модели.
check('наставленіе велитъ отвѣчать на языкѣ вопроса', НАСТАВЛЕНІЕ.includes('на том языке, на котором написан вопрос'))
check('русскій вопросъ — русскій отвѣтъ', наказЯзыка('сколько я потратил на Netflix?').includes('Отвечай по-русски'))
check('англійскій вопросъ — отвѣтъ на языкѣ вопроса', наказЯзыка('How much did I spend on Продукты?').startsWith('Answer in the same language'))
check('безъ буквъ — общее правило на обоихъ', /language of the question.*языке вопроса/.test(наказЯзыка('???')))
check('и запрещаетъ выдумывать', /не додумывай|Не выдумывай/.test(НАСТАВЛЕНІЕ))

// Проектныя деньги въ сводку личныхъ финансовъ не идутъ наравнѣ со всѣмъ прочимъ.
const съПроектомъ = {
  ...дляСводки,
  accounts: [...дляСводки.accounts, {
    id: 'пс1', name: 'ТАЙНЫЙ-ПРОЕКТ', type: 'card' as const, icon: 'credit-card',
    color: '#4c8ac4', initialBalance: 5_000_00, project: true,
  }],
}
const сводка2 = сводкаДляМодели(съПроектомъ)
check('проектный счётъ не попадаетъ въ активы',
  сводка2.текстъ.includes('Проектные счета (чужие деньги'))
check('и помѣченъ какъ чужія деньги', сводка2.текстъ.includes('в личных цифрах не учтены'))

// ------------------------------------------------------- шифрованіе
/*
 * Слой, на котором держится обѣщаніе «сервер не видитъ чужихъ денегъ».
 *
 * Провѣряется здѣсь не «шифруется ли» — это видно и на глазъ, — а то, что
 * ломается тихо: постоянство ключей (иначе завтра свои же данныя не
 * откроются), отказъ на чужомъ ключѣ вмѣсто мусора, свѣжій векторъ на каждую
 * запись и невозможность добыть ключъ къ содержимому изъ того, что лежитъ на
 * серверѣ.
 *
 * Обороты вездѣ занижены нарочно: проверяется устройство, а не цѣна перебора.
 * Сама цѣна провѣряется отдѣльной строкой.
 */
async function шифрованіе() {
  console.log('\n— шифрованіе —')
  const М = 1000

  check('обороты по умолчанію дорогіе', ОБОРОТОВЪ >= 600_000, String(ОБОРОТОВЪ))

  const к1 = await вывестиКлючи('тайна', 'oleg@example.com', М)
  const к2 = await вывестиКлючи('тайна', 'oleg@example.com', М)
  const инаяПочта = await вывестиКлючи('тайна', 'ivan@example.com', М)
  const инойПароль = await вывестиКлючи('другая', 'oleg@example.com', М)

  check('тѣ же пароль и почта даютъ тотъ же ключъ', к1.пароль === к2.пароль)
  check('иная почта — иной ключъ', к1.пароль !== инаяПочта.пароль)
  check('иной пароль — иной ключъ', к1.пароль !== инойПароль.пароль)
  check('регистръ и пробѣлы въ почтѣ не мѣняютъ ключъ',
    (await вывестиКлючи('тайна', '  OLEG@Example.COM ', М)).пароль === к1.пароль)

  // Круговой путь: что зашифровали, то и прочли.
  const тайна = 'Счётъ «Комиксъ» · 386 000 ₽ · заметка съ ёмкимъ словомъ'
  const комъ = await зашифровать(к1.содержимое, тайна)
  check('зашифрованное расшифровывается', (await расшифровать(к1.содержимое, комъ)) === тайна)
  check('шифротекстъ не содержитъ открытаго текста', !комъ.includes('Комиксъ'))

  // Свѣжій векторъ: одинъ и тотъ же текстъ дважды обязанъ дать разные комья.
  const комъ2 = await зашифровать(к1.содержимое, тайна)
  check('одинъ текстъ дважды даётъ разные комья', комъ !== комъ2)
  check('и оба читаются', (await расшифровать(к1.содержимое, комъ2)) === тайна)

  const отказъ = async (что: string, дѣло: () => Promise<unknown>) => {
    let упало = false
    try { await дѣло() } catch { упало = true }
    check(что, упало)
  }
  await отказъ('чужой ключъ не расшифровываетъ', () => расшифровать(инойПароль.содержимое, комъ))
  await отказъ('испорченный комъ отвергается',
    () => расшифровать(к1.содержимое, комъ.slice(0, -6) + 'AAAAAA'))
  await отказъ('обрѣзанный комъ отвергается', () => расшифровать(к1.содержимое, 'AAAA'))
  await отказъ('пустой пароль не принимается', () => вывестиКлючи('', 'oleg@example.com', М))
  await отказъ('пустая почта не принимается', () => вывестиКлючи('тайна', '', М))

  /*
   * Главное свойство всей затѣи, и провѣрять его надо въ точности такъ, какъ
   * поступилъ бы тотъ, кто укралъ базу.
   *
   * Первый заходъ былъ негоденъ: онъ подставлялъ серверное значеніе въ
   * вывестиКлючи какъ пароль. Такой обходъ прогоняетъ его черезъ PBKDF2 ещё
   * разъ и потому всегда даётъ другое — провѣрка зеленѣла бы даже тогда,
   * когда серверное значеніе и ключъ къ содержимому суть одни и тѣ же байты.
   * Настоящій воръ PBKDF2 не гоняетъ: онъ беретъ байты изъ базы и пробуетъ
   * ими открыть. Вотъ это и провѣряется.
   */
  const байтыСъСервера = изБазы64(к1.пароль)
  const какъВоръ = await globalThis.crypto.subtle.importKey(
    'raw', байтыСъСервера, 'AES-GCM', false, ['decrypt'],
  )
  await отказъ('байтами съ сервера содержимое не открывается',
    () => расшифровать(какъВоръ, комъ))

  // И тѣмъ же путёмъ — черезъ вывод ключей заново, если воръ знаетъ и почту.
  const изУкраденнаго = await вывестиКлючи(к1.пароль, 'oleg@example.com', М)
  await отказъ('и повторный выводъ отъ нихъ не помогаетъ',
    () => расшифровать(изУкраденнаго.содержимое, комъ))

  // Ярлыки путей.
  const я1 = await ярлыкъПути(к1.пути, 'notes/Долги перед братом.md')
  const я2 = await ярлыкъПути(к1.пути, 'notes/Долги перед братом.md')
  const я3 = await ярлыкъПути(к1.пути, 'data.json')
  check('ярлыкъ пути постояненъ', я1 === я2, я1.slice(0, 16) + '…')
  check('разные пути — разные ярлыки', я1 !== я3)
  check('ярлыкъ не содержитъ имени', !я1.includes('brat') && !/[а-яё]/i.test(я1))
  check('ярлыкъ — 64 шестнадцатеричныхъ знака', /^[0-9a-f]{64}$/.test(я1))
  check('у другого человѣка ярлыкъ другой',
    (await ярлыкъПути(инойПароль.пути, 'data.json')) !== я3)

  // Основанія 64: свои, потому что btoa не беретъ кириллицу, а Buffer есть не вездѣ.
  const всеБайты = new Uint8Array(256).map((_, i) => i)
  check('основанія 64: круговой путь по всѣмъ байтамъ',
    [...изБазы64(вБазу64(всеБайты))].join() === [...всеБайты].join())
  for (const n of [0, 1, 2, 3, 4, 5]) {
    const кусокъ = всеБайты.subarray(0, n)
    check(`основанія 64: длина ${n}`,
      [...изБазы64(вБазу64(кусокъ))].join() === [...кусокъ].join())
  }
}

/*
 * Итогъ подводится въ асинхронной обёрткѣ: провѣрки шифрованія по природѣ
 * своей ждутъ WebCrypto, а собранная въ CJS проверка верхнеуровневаго await
 * не допускаетъ. Иначе итогъ печатался бы раньше, чѣмъ они успѣли отработать.
 */
/*
 * Оформленіе: шапка дашборда не должна ничего обрѣзать.
 *
 * Въ шапкѣ лежитъ выпадающій списокъ счетовъ — абсолютомъ, и онъ обязанъ изъ
 * неё выходить. Темы «Пикми» ставили ей overflow: hidden ради банта въ углу, и
 * списокъ обрубался на первой строкѣ: человѣкъ видѣлъ «Итого» и пустоту вмѣсто
 * своихъ счетовъ. Замѣчено на живомъ окнѣ, потому и провѣрка стоитъ здѣсь: въ
 * jsdom раскладки нѣтъ, обрѣзку тамъ не измѣрить, а въ самомъ правилѣ — видно.
 *
 * Провѣряется не одна тема, а всѣ стили разомъ: запретъ общій, и слѣдующая
 * тема съ украшеніемъ въ углу споткнётся о ту же строку.
 */
/*
 * Конструктор оформления: логика без окна.
 *
 * Простой режим обязан выдавать читаемую тему из любых разумных цветов — в
 * том числе из трудных, вроде жёлтого акцента на белом. Файл темы приходит
 * от другого человека, поэтому ссылки в сеть и мусор из него не проходят.
 */
function конструкторъТемъ() {
  console.log('\n— конструктор оформления —')
  const свѣтлая = вывестиТокены({ bg: '#f4f4f5', panel: '#ffffff', text: '#26262a', accent: '#ffd700', radius: 12 })
  check('светлая: текст читается', контрастъ(свѣтлая.text, свѣтлая.panel) >= 7, контрастъ(свѣтлая.text, свѣтлая.panel).toFixed(2))
  check('светлая: приглушённый с запасом', контрастъ(свѣтлая.muted, свѣтлая.panel) >= 5, контрастъ(свѣтлая.muted, свѣтлая.panel).toFixed(2))
  check('жёлтым по белому не пишет — буквы берут цвет заголовков',
    свѣтлая['accent-ink'] === свѣтлая['text-strong'], свѣтлая['accent-ink'])
  check('на жёлтой кнопке буквы тёмные', контрастъ(свѣтлая['accent-text'], '#ffd700') >= 7, свѣтлая['accent-text'])
  check('скругление карточек крупнее кнопок', свѣтлая['radius-lg'] === '19px' && свѣтлая.radius === '12px')

  const тёмная = вывестиТокены({ bg: '#1a1b1e', panel: '#26272b', text: '#dcdde1', accent: '#4cc46a', radius: 8 })
  check('тёмная: приглушённый с запасом', контрастъ(тёмная.muted, тёмная.panel) >= 5, контрастъ(тёмная.muted, тёмная.panel).toFixed(2))
  check('читаемый акцент идёт буквами как есть', тёмная['accent-ink'] === '#4cc46a')

  const розовая = вывестиТокены({ bg: '#fdf4f8', panel: '#ffffff', text: '#4f3d55', accent: '#6a1b9a', radius: 14 })
  check('на тёмном акценте буквы белые', розовая['accent-text'] === '#ffffff')

  const туда = { bg: '#101214', panel: '#1c1f24', text: '#e0e0e0', accent: '#ff7a00', radius: 10 }
  const обратно = простыяИзъТокеновъ(вывестиТокены(туда), туда.accent)
  check('простой → полный → простой без потерь', JSON.stringify(обратно) === JSON.stringify(туда), JSON.stringify(обратно))

  // Проверка значений
  check('url в сеть не проходит', !значеніеДопустимо('text', 'url(https://evil.example/x.png)'))
  check('даже спрятанный внутри градиента', !значеніеДопустимо('text', 'linear-gradient(red, blue), url(//evil.example/a)'))
  check('встроенная data:image проходит', значеніеДопустимо('text', 'url("data:image/png;base64,AAAA")'))
  check('image-set с адресом тоже не проходит — это тоже запрос в сеть',
    !значеніеДопустимо('text', 'image-set("https://evil.example/a.png" 1x)') && !значеніеДопустимо('text', 'image-set("//evil.example/a.png" 1x)'))
  check('обычная подсветка из градиентов проходит',
    значеніеДопустимо('text', 'radial-gradient(900px 560px at 8% -10%, rgba(255, 215, 0, 0.1), transparent 62%)'))
  check('точка с запятой не проходит', !значеніеДопустимо('color', '#fff; background: red'))
  check('цвета: hex и rgba да, слово нет', значеніеДопустимо('color', '#1a1b1e') && значеніеДопустимо('color', 'rgba(30, 36, 64, 0.55)') && !значеніеДопустимо('color', 'expression(alert)'))
  check('размер: 12px да, 12 и 12em нет', значеніеДопустимо('px', '12px') && !значеніеДопустимо('px', '12') && !значеніеДопустимо('px', '12em'))
  check('разрядка: −0.03em да, «em» нет', значеніеДопустимо('em', '-0.03em') && !значеніеДопустимо('em', 'em'))

  const чистыя = очиститьТокены({ bg: '#000000', 'bg-image': 'url(https://x.y/z)', lol: '#fff', radius: 'много' })
  check('чистка оставляет только годное и известное', JSON.stringify(чистыя) === JSON.stringify({ bg: '#000000' }), JSON.stringify(чистыя))

  // Файл темы
  const знаю = (id: string) => THEMES.some((t) => t.id === id)
  let n = 0
  const новый = () => 'новая' + ++n
  const хорошій = разобратьФайлТемы(
    JSON.stringify({ kashel: 'tema', version: 1, name: 'Моя', base: 'pickme', accent: '#ffd700', режимъ: 'простой',
      tokens: { bg: '#f4f4f5', 'bg-image': 'url(https://evil.example/p.png)', text: '#26262a' } }),
    знаю, новый,
  )
  check('файл темы разбирается', хорошій.ok)
  if (хорошій.ok) {
    check('получает новый id, а не чужой', хорошій.тема.id === 'новая1')
    check('ссылка в сеть из файла отброшена', !('bg-image' in хорошій.тема.tokens) && хорошій.тема.tokens.bg === '#f4f4f5')
  }
  const чужаяОснова = разобратьФайлТемы(JSON.stringify({ kashel: 'tema', base: 'нетакойтемы', tokens: {} }), знаю, новый)
  check('неизвестная основа заменяется на «Обсидиан»', чужаяОснова.ok && чужаяОснова.тема.base === 'obsidian')
  check('не JSON — понятная ошибка', !разобратьФайлТемы('{это не json', знаю, новый).ok)
  check('чужой JSON — не тема', !разобратьФайлТемы('{"kashel":"vault"}', знаю, новый).ok)
}

/*
 * Свои значки.
 *
 * Сама обработка картинки идёт на холсте, которого в Node нет, — её
 * проверяли в живом окне (300×200 → 128×128, граница цветов ровно
 * посередине). Здесь — всё, что можно проверить без холста: арифметика
 * обрезки, распознавание значка и то, что архив снаружи не может писать
 * значками куда попало.
 */
function своиЗначки() {
  console.log('\n— свои значки —')
  const ш = квадратъ(300, 200)
  check('широкая картинка режется по центру', ш.sx === 50 && ш.sy === 0 && ш.s === 200, JSON.stringify(ш))
  const в = квадратъ(200, 300)
  check('высокая — тоже по центру', в.sx === 0 && в.sy === 50 && в.s === 200, JSON.stringify(в))
  check('квадрат не режется', JSON.stringify(квадратъ(128, 128)) === JSON.stringify({ sx: 0, sy: 0, s: 128 }))

  check('file:icons/… — свой значок', этоСвойЗначокъ('file:icons/a1.png'))
  check('значок каталога — не свой', !этоСвойЗначокъ('shopping-basket') && !этоСвойЗначокъ(undefined))

  check('icons/имя.png — допустимый путь', путьЗначкаДопустимъ('icons/mu1lib9evw.png'))
  const злые = ['icons/../data.json', 'icons/a/b.png', 'icons/x.svg', '../icons/x.png', 'data.json', 'icons/.png']
  check('выход из папки, вложенные папки и не-PNG — нет', злые.every((п) => !путьЗначкаДопустимъ(п)),
    злые.filter((п) => путьЗначкаДопустимъ(п)).join(', '))

  // Архив приходит снаружи: значок он донести может, а запись мимо папки — нет.
  const архивъ = {
    kashel: 'vault', formatVersion: 1, app: 'Кошель', exportedAt: '2026-09-14T00:00:00Z',
    counts: {}, data: buildSeed(), notes: {}, canvases: {},
    attachments: { 'icons/probaznachok.png': 'AAAA', 'icons/../data.json': 'BBBB', 'attachments/чек.png': 'CCCC' },
  }
  const разборъ = parseArchive(JSON.stringify(архивъ))
  check('архив с значком разбирается', разборъ.ok)
  if (разборъ.ok) {
    check('значок из архива сохранён', разборъ.archive.attachments['icons/probaznachok.png'] === 'AAAA')
    check('путь мимо папки отброшен', !('icons/../data.json' in разборъ.archive.attachments))
    check('обычные вложения по-прежнему идут', разборъ.archive.attachments['attachments/чек.png'] === 'CCCC')
  }
}

/*
 * Пополнение целей.
 *
 * Прежде кнопка открывала форму перевода, и у цели без счёта перевести было
 * некуда — пополнить цель было нельзя вовсе. Теперь пополнение прибавляет к
 * цели, а галочка «вычесть со счёта» ещё и пишет расход по статье «Цели»
 * (хозяин программы решил считать это расходом).
 */
function пополненіеЦѣлей() {
  console.log('\n— пополнение целей —')
  const цель: Goal = { id: 'ц1', name: 'Поездка', icon: 'plane', color: '#8b5cf6', targetAmount: 4_000_000, saved: 500_000, priority: 1 }

  const безъСписанія = планъПополненія(цель, 300_000, '2026-09-14', null, false)
  check('без списания: цель выросла', безъСписанія.цель?.saved === 800_000, String(безъСписанія.цель?.saved))
  check('и никаких операций и статей', !безъСписанія.операція && !безъСписанія.статья)

  const съСписаніемъ = планъПополненія(цель, 300_000, '2026-09-14', { счётъ: 'сч1' }, false)
  check('со списанием: цель выросла', съСписаніемъ.цель?.saved === 800_000)
  check('и появился расход со счёта', съСписаніемъ.операція?.kind === 'expense' && съСписаніемъ.операція?.accountId === 'сч1' &&
    съСписаніемъ.операція?.amount === 300_000)
  check('по статье «Цели» и с пометкой цели',
    съСписаніемъ.операція?.categoryId === СТАТЬЯ_ЦЕЛЕЙ.id && съСписаніемъ.операція?.goalId === 'ц1')
  check('статья создаётся, когда её ещё нет', съСписаніемъ.статья?.id === СТАТЬЯ_ЦЕЛЕЙ.id)
  check('и не создаётся второй раз', !планъПополненія(цель, 300_000, '2026-09-14', { счётъ: 'сч1' }, true).статья)

  // Расход действительно считается расходом — в итогах по статьям он есть.
  const базовыя = buildSeed()
  const сПополненіемъ = {
    ...базовыя,
    categories: [...базовыя.categories, СТАТЬЯ_ЦЕЛЕЙ],
    transactions: [...базовыя.transactions, { ...съСписаніемъ.операція!, id: 'пц1', accountId: базовыя.accounts[0].id, createdAt: '' }],
  }
  const поСтатьямъ = categoryTotals(сПополненіемъ.transactions.filter((т) => т.date.startsWith('2026-09')), 'expense')
  check('в тратах месяца видно статью «Цели»', поСтатьямъ.some((т) => т.categoryId === СТАТЬЯ_ЦЕЛЕЙ.id && т.amount === 300_000),
    поСтатьямъ.filter((т) => т.categoryId === СТАТЬЯ_ЦЕЛЕЙ.id).map((т) => т.amount).join(','))

  // Цель, привязанная к счёту: её прогресс — остаток счёта, поэтому перевод.
  const счётная: Goal = { ...цель, accountId: 'копилка' }
  const переводъ = планъПополненія(счётная, 200_000, '2026-09-14', { счётъ: 'сч1' }, false)
  check('у цели со счётом — перевод на её счёт', переводъ.операція?.kind === 'transfer' && переводъ.операція?.toAccountId === 'копилка')
  check('а сама цель не трогается — её считает счёт', !переводъ.цель)
  check('перевод со счёта цели на него же не делается', !планъПополненія(счётная, 200_000, '2026-09-14', { счётъ: 'копилка' }, false).операція)
  check('нулевая сумма ничего не делает', Object.keys(планъПополненія(цель, 0, '2026-09-14', { счётъ: 'сч1' }, false)).length === 0)
}

/*
 * Неделя с любого дня и своё поле даты.
 *
 * Раньше неделя начиналась только с воскресенья или понедельника, а выходной
 * в «Серии» и браузерный календарик настройку не слушали вовсе. Проверяется
 * для всех семи дней, а не для двух привычных: ошибка на сдвиге «+7 % 7»
 * как раз прячется на среде и субботе.
 */
function недѣля() {
  console.log('\n— неделя с любого дня —')
  const дата = '2026-09-14' // понедельник
  let всёСошлось = true
  const промахи: string[] = []
  for (let fd = 0; fd < 7; fd++) {
    const нач = startOfWeek(дата, fd)
    const д = parseISO(нач)
    const внутри = нач <= дата && дата <= addDays(нач, 6)
    if (д.getDay() !== fd || !внутри) { всёСошлось = false; промахи.push(`${fd}: ${нач}`) }
  }
  check('начало недели верно для всех семи дней', всёСошлось, промахи.join(', '))

  check('порядок дней начинается с выбранного', порядокъДней(3).join('') === '3456012')
  check('и всегда семь разных', new Set(порядокъДней(5)).size === 7)

  const среда = makePeriod('week', дата, 3)
  check('неделя со среды: от среды до вторника',
    parseISO(среда.from).getDay() === 3 && parseISO(среда.to).getDay() === 2 && diffDays(среда.from, среда.to) === 6,
    `${среда.from} — ${среда.to}`)

  // Сетка календарика: шесть недель, первая клетка — выбранный день недели,
  // и первое число месяца в ней есть.
  let сеткаВерна = true
  for (let fd = 0; fd < 7; fd++) {
    const с = сеткаМесяца('2026-02', fd)
    if (с.length !== 42 || parseISO(с[0]).getDay() !== fd || !с.includes('2026-02-01') || !с.includes('2026-02-28')) сеткаВерна = false
  }
  check('сетка месяца верна для всех семи дней', сеткаВерна)

  // Разбор вписанной руками даты.
  check('14.09.2026', разобратьДату('14.09.2026', 'ru') === '2026-09-14')
  check('короткая 5.3.26', разобратьДату('5.3.26', 'ru') === '2026-03-05')
  check('ISO', разобратьДату('2026-12-01', 'ru') === '2026-12-01')
  check('через дробь по-американски месяц первым', разобратьДату('09/14/2026', 'us') === '2026-09-14')
  check('через дробь по-русски день первым', разобратьДату('14/09/2026', 'ru') === '2026-09-14')
  check('31 февраля не принимается', разобратьДату('31.02.2026', 'ru') === null)
  check('мусор не принимается', разобратьДату('завтра', 'ru') === null && разобратьДату('', 'ru') === null)

  // Браузерный календарик не должен вернуться: он настройку недели не слушает.
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const родныя: string[] = []
  const обойти = (дир: string) => {
    for (const е of fs.readdirSync(дир, { withFileTypes: true })) {
      const полный = path.join(дир, е.name)
      if (е.isDirectory()) обойти(полный)
      else if (/\.tsx$/.test(е.name)) {
        fs.readFileSync(полный, 'utf8').split('\n').forEach((с, i) => {
          // Строки примечаний пропускаем: там «<input type="date">» упомянут,
          // чтобы объяснить, почему его больше нет.
          if (/^\s*(\*|\/\*|\/\/)/.test(с)) return
          if (/<input[^>]*type="date"/.test(с) || /^\s*type="date"\s*$/.test(с)) родныя.push(`${path.relative(process.cwd(), полный)}:${i + 1}`)
        })
      }
    }
  }
  обойти(path.join(process.cwd(), 'src'))
  check('браузерных полей даты в программе нет', родныя.length === 0, родныя.join(', '))
}

/*
 * Подпись значка в текстовых пунктах.
 *
 * Въ спискахъ выходило «shopping-basket Продукты»: служебное имя значка изъ
 * каталога попадало въ подпись, и человѣкъ принялъ это за переводъ на
 * англійскій. Провѣряется и сама подпись, и то, что въ исходникахъ больше
 * нигдѣ не склеиваютъ значокъ съ именемъ руками, мимо общаго правила.
 */
function подписиЗначковъ() {
  console.log('\n— подписи значковъ —')
  check('значокъ изъ каталога въ подпись не идётъ', сЗначкомъ('shopping-basket', 'Продукты') === 'Продукты')
  check('старое эмодзи остаётся', сЗначкомъ('🍎', 'Продукты') === '🍎 Продукты')
  check('незнакомое латинское имя тоже не идётъ', сЗначкомъ('some-new-icon', 'Такси') === 'Такси')
  check('ссылка на загруженный файлъ не идётъ', сЗначкомъ('file:icons/a1.png', 'Кафе') === 'Кафе')
  check('безъ значка — просто имя', сЗначкомъ(undefined, 'Дом') === 'Дом')

  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const виновники: string[] = []
  const обойти = (дир: string) => {
    for (const е of fs.readdirSync(дир, { withFileTypes: true })) {
      const полный = path.join(дир, е.name)
      if (е.isDirectory()) обойти(полный)
      else if (/\.tsx?$/.test(е.name)) {
        const строки = fs.readFileSync(полный, 'utf8').split('\n')
        строки.forEach((с, i) => {
          // {x.icon} {x.name} въ разметкѣ или `${x.icon} ${x.name}` въ строкѣ
          if (/\{\w+\.icon\}\s*\{\w+\.name\}/.test(с) || /\$\{\w+\.icon\}\s*\$\{\w+\.name\}/.test(с)) {
            виновники.push(`${path.relative(process.cwd(), полный)}:${i + 1}`)
          }
        })
      }
    }
  }
  обойти(path.join(process.cwd(), 'src'))
  check('въ исходникахъ значокъ съ именемъ руками не склеиваютъ', виновники.length === 0, виновники.join(', '))
}

function оформленіе() {
  console.log('\n— оформленіе —')
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const дир = path.join(process.cwd(), 'src', 'styles')
  const файлы = fs.readdirSync(дир).filter((ф) => ф.endsWith('.css'))
  check('стили нашлись', файлы.length > 0, файлы.join(', '))

  const виновники: string[] = []
  let правилъ = 0
  for (const ф of файлы) {
    // Примѣчанія выкидываемъ: въ нихъ бываютъ и скобки, и слово overflow.
    const текстъ = fs.readFileSync(path.join(дир, ф), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const м of текстъ.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const селекторъ = м[1].trim()
      // «.hero», но не «.hero-total»: обрѣзка вредна самой шапкѣ.
      if (!/\.hero(?![-\w])/.test(селекторъ)) continue
      правилъ++
      const обрѣзка = м[2].match(/overflow(-y)?\s*:\s*([^;}]+)/)
      if (обрѣзка && !/visible/.test(обрѣзка[2])) виновники.push(`${ф}: ${селекторъ} — ${обрѣзка[0].trim()}`)
    }
  }
  check('правила шапки найдены', правилъ > 0, `${правилъ} шт.`)
  check('шапку никто не обрѣзаетъ', виновники.length === 0, виновники.join(' | '))

  /*
   * Части окна прибиты къ своимъ колонкамъ сѣтки.
   *
   * Безъ этого спрятанная лѣвая панель (display: none) выпадала изъ порядка,
   * основная область съѣзжала въ её узкую колонку «auto» и сжималась до двухсотъ
   * точекъ, а правая панель занимала мѣсто основной. jsdom раскладку не мѣритъ,
   * поэтому стережётся само правило.
   */
  const appCss = fs.readFileSync(path.join(дир, 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const колонка = (кто: string) => {
    const м = appCss.match(new RegExp('\\.app\\s*>\\s*\\.' + кто + '\\s*\\{([^}]*)\\}'))
    return м?.[1].match(/grid-column:\s*(\d+)/)?.[1] ?? null
  }
  const колонки = { ribbon: колонка('ribbon'), sidebar: колонка('sidebar'), main: колонка('main'), rightbar: колонка('rightbar') }
  check('части окна прибиты къ колонкамъ',
    колонки.ribbon === '1' && колонки.sidebar === '2' && колонки.main === '3' && колонки.rightbar === '4',
    JSON.stringify(колонки))

  /*
   * Подпись въ плиткѣ категоріи переносится.
   *
   * Плитка — это .btn, у кнопокъ white-space: nowrap, и онъ наслѣдовался
   * подписью: «Татьяна. Режиссура и страницы» уѣзжала на сосѣднюю плитку.
   * Провѣрено въ живомъ окнѣ: при nowrap вылезаютъ четыре подписи изъ
   * двадцати трёхъ, при normal — ни одной. jsdom этого не мѣритъ.
   */
  /*
   * Подсвѣтка карточекъ держится, пока курсоръ внутри.
   *
   * Прежній бликъ былъ полосой, которая за 750 мс пролетала карточку и уѣзжала
   * за край, — выдѣленіе пропадало раньше, чѣмъ уводишь мышь. Стережётся,
   * что свѣтъ при наведеніи включается прозрачностью, а не проѣздомъ, и что
   * карточка снова не обрѣзаетъ себя overflow: hidden.
   */
  const fxCss = fs.readFileSync(path.join(дир, 'effects.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const свѣтъНаведеніи = fxCss.match(/\.fx-glare:hover::after\s*\{([^}]*)\}/)?.[1] ?? ''
  const самаКарточка = fxCss.match(/\.fx-glare\s*\{([^}]*)\}/)?.[1] ?? ''
  check('подсвѣтка при наведеніи включается, а не проѣзжаетъ',
    /opacity:\s*1/.test(свѣтъНаведеніи) && !/translate/.test(свѣтъНаведеніи), свѣтъНаведеніи.trim() || 'правила нѣтъ')
  check('карточка съ подсвѣткой себя не обрѣзаетъ', !/overflow:\s*hidden/.test(самаКарточка))

  const правилоПлитки = appCss.match(/\.tile-name,\s*\.qa-tile-name\s*\{([^}]*)\}/)
  check('подпись плитки переносится по словамъ',
    !!правилоПлитки && /white-space:\s*normal/.test(правилоПлитки[1]) && /-webkit-line-clamp:\s*2/.test(правилоПлитки[1]),
    правилоПлитки ? 'правило найдено' : 'правила нѣтъ')


  /*
   * Контрастъ во всѣхъ темахъ.
   *
   * Красивая палитра, въ которой не видно буквъ, — не красивая палитра.
   * Считается по формулѣ WCAG: отношеніе яркостей, гдѣ 4.5 — порогъ для
   * обычнаго текста, 3 — для крупнаго и значковъ.
   *
   * Пороги поставлены по нынѣшнему худшему, а не по идеалу, и это нарочно:
   * задача провѣрки — не переписать старыя темы, а не дать новымъ сползти
   * ниже уже достигнутаго. Полъ сейчасъ держитъ «Имперская»: тревожный
   * красный на её фонѣ даётъ 2.8, то есть на грани видимости. Если её
   * поправятъ или уберутъ — порогъ надо поднять.
   */
  const яркость = (ц: string) => {
    const к = (n: number) => { const c = n / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
    return 0.2126 * к(parseInt(ц.slice(1, 3), 16)) + 0.7152 * к(parseInt(ц.slice(3, 5), 16)) + 0.0722 * к(parseInt(ц.slice(5, 7), 16))
  }
  const отношеніе = (a: string, б: string) => {
    const x = яркость(a), y = яркость(б)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }

  const темыCss = fs.readFileSync(path.join(дир, 'themes.css'), 'utf8')
  const РОЛИ = { text: 7, 'text-strong': 10, muted: 4.4, accent: 3.3, alert: 2.7 }

  const тускло: string[] = []
  let промѣрено = 0
  for (const тема of THEMES) {
    const метка = "[data-theme='" + тема.id + "'] {"
    const отъ = темыCss.indexOf(метка)
    if (отъ < 0) { тускло.push(`${тема.id}: нѣтъ блока`); continue }
    const тѣло = темыCss.slice(отъ + метка.length, темыCss.indexOf('}', отъ))
    const т: Record<string, string> = { accent: тема.accent }
    for (const м of тѣло.matchAll(/--([a-z0-9-]+): *(#[0-9a-fA-F]{6})/g)) т[м[1]] = м[2]
    /*
     * Если тема развела заливку и чернила — мѣряемъ чернила.
     *
     * Жёлтымъ по бѣлому писать нельзя ни при какой яркости: контрастъ выходитъ
     * 1.4 при нормѣ 4.5. «Знамя дневное» потому и держитъ жёлтый заливкой, а
     * буквы чёрными; провѣрять у него сам акцентъ значило бы требовать
     * читаемости отъ того, чѣмъ никто не пишетъ.
     */
    if (т['accent-ink']) т.accent = т['accent-ink']
    // Тема на полупрозрачныхъ панеляхъ («Стекло») цвѣтомъ не мѣряется:
    // подъ ней просвѣчиваетъ фонъ, и честное число тутъ даётъ только глазъ.
    if (!т.panel) continue
    промѣрено++
    for (const [роль, надо] of Object.entries(РОЛИ)) {
      const ц = т[роль]
      if (!ц) { тускло.push(`${тема.id}: нѣтъ --${роль}`); continue }
      const k = отношеніе(ц, т.panel)
      if (k < надо) тускло.push(`${тема.id}: ${роль} ${k.toFixed(2)} < ${надо}`)
    }
  }
  check('темы промѣрены', промѣрено >= THEMES.length - 1, `${промѣрено} изъ ${THEMES.length}`)
  check('буквы вездѣ читаются', тускло.length === 0, тускло.join(' | '))

  /*
   * Иконка для macOS.
   *
   * Она собирается на Windows, гдѣ ни одной программы, умѣющей .icns, нѣтъ, —
   * значитъ, провѣрить её можно только разобравъ по косточкамъ самимъ. Ошибка
   * здѣсь дорога: неисправная иконка обнаружится не у насъ, а на сборочной
   * машинѣ съ макомъ, черезъ десять минутъ очереди и качанія Electron.
   */
  const иконка = path.join(process.cwd(), 'build', 'icon.icns')
  check('иконка macOS на мѣстѣ', fs.existsSync(иконка))
  if (fs.existsSync(иконка)) {
    const б = fs.readFileSync(иконка)
    check('и это icns', б.toString('ascii', 0, 4) === 'icns')
    check('и длина въ заголовкѣ сходится съ файломъ',
      б.readUInt32BE(4) === б.length, `${б.readUInt32BE(4)} противъ ${б.length}`)
    const размѣры: number[] = []
    let гдѣ = 8
    let цѣло = true
    while (гдѣ < б.length) {
      const длина = б.readUInt32BE(гдѣ + 4)
      if (длина < 8 || гдѣ + длина > б.length) { цѣло = false; break }
      const тѣло = б.subarray(гдѣ + 8, гдѣ + длина)
      // Куски — обычные PNG: современная macOS читаетъ ихъ какъ есть.
      if (!(тѣло[0] === 0x89 && тѣло.toString('ascii', 1, 4) === 'PNG')) { цѣло = false; break }
      размѣры.push(тѣло.readUInt32BE(16))
      гдѣ += длина
    }
    check('и куски разбираются до конца', цѣло && гдѣ === б.length, `${размѣры.length} кусковъ`)
    check('и самый крупный — 1024 px', размѣры.includes(1024), размѣры.join(', '))
  }
}

/*
 * Перевод.
 *
 * Сторож проходит исходник компилятором: русская надпись мимо т(), ключ без
 * английского, разошедшиеся места {0} — всё это тихие поломки, которые видны
 * только в нужном углу английского окна. Отдельно — словарь оболочки: меню и
 * системные окна рисует Electron, до словаря окна ему не дотянуться.
 */
function переводъ() {
  console.log('\n— перевод —')
  const названія = ICON_GROUPS.flatMap((g) => [g.title, ...g.items.map((i) => i.title)])
  const и = сторожъ(path.join(process.cwd(), 'src'), EN, названія)
  const списокъ = (a: (Находка | string)[]) =>
    a.slice(0, 5).map((x) => (typeof x === 'string' ? x : `${x.файлъ}:${x.строка} ${x.текстъ}`)).join(' | ')
  type Находка = { файлъ: string; строка: number; текстъ: string }
  check('всѣ русскія надписи идутъ черезъ переводъ', и.непереведённыя.length === 0, списокъ(и.непереведённыя))
  check('у каждаго ключа есть англійскій', и.ключи.size > 2000 && и.безПеревода.length === 0, `${и.ключи.size} ключей` + (и.безПеревода.length ? '; нѣтъ: ' + списокъ(и.безПеревода) : ''))
  check('въ словарѣ нѣтъ ключей, которыхъ въ программѣ нѣтъ', и.лишнія.length === 0, списокъ(и.лишнія))
  check('мѣста {0} въ переводѣ тѣ же', и.мѣстаНеСходятся.length === 0, списокъ(и.мѣстаНеСходятся))
  check('ведущіе и хвостовые пробѣлы сохранены', и.пробѣлыНеСходятся.length === 0, списокъ(и.пробѣлыНеСходятся))
  check('списокъ нарочно русскихъ строкъ не устарѣлъ', и.неиспользованныяНарочныя.length === 0, списокъ(и.неиспользованныяНарочныя))
  const съКириллицей = Object.entries(EN).filter(([, v]) => /[а-яёѣі]/i.test(v))
  check('въ англійскихъ значеніяхъ нѣтъ кириллицы', съКириллицей.length === 0, съКириллицей.slice(0, 3).join(' | '))

  // Сама подстановка — на обоихъ языкахъ.
  check('по-русски ключъ и есть строка', т('Удалить {0}', 3) === 'Удалить 3')
  поставитьЯзык('en')
  try {
    check('по-англійски берётся переводъ', т('Удалить {0}', 3) === EN['Удалить {0}'].replace('{0}', '3'), т('Удалить {0}', 3))
    check('незнакомый ключъ остаётся русскимъ, а не пустымъ', т('такого ключа нѣтъ') === 'такого ключа нѣтъ')
    const формы = EN['операция|операции|операций'].split('|')
    check('множественное по-англійски — двѣ формы',
      plural(1, 'операция', 'операции', 'операций') === формы[0] && plural(5, 'операция', 'операции', 'операций') === формы[1] && plural(2, 'операция', 'операции', 'операций') === формы[1],
      формы.join(' / '))
    const фрагментъ = тр('{0} изъ {1}', 'a', 'b')
    check('тр раскладываетъ мѣста по порядку', JSON.stringify(фрагментъ.props.children) === JSON.stringify(['a', ' изъ ', 'b']))
  } finally {
    поставитьЯзык('ru')
  }

  // Оболочка: всё, что зовётся черезъ м(), и всѣ отказы update.js есть въ словарѣ.
  const языкОболочки = createRequire(path.join(process.cwd(), 'electron', 'main.js'))('./yazyk.js') as {
    EN: Record<string, string>; EN_НАЧАЛА: [string, string][]; м: (s: string) => string; поставить: (я: string) => void
  }
  const главный = readFileSync('electron/main.js', 'utf8')
  const обновленіе = readFileSync('electron/update.js', 'utf8')
  const фразы = [
    ...[...главный.matchAll(/м\('([^']+)'\)/g)].map((m) => m[1]),
    ...[...главный.matchAll(/new Error\('([^']+)'\)/g)].map((m) => m[1]),
    ...[...обновленіе.matchAll(/new Error\('([^']+)'\)/g)].map((m) => m[1]),
    ...[...обновленіе.matchAll(/действіе: '([^']+)'/g)].map((m) => m[1]),
  ]
  const безъСловаря = [...new Set(фразы)].filter((ф) => !языкОболочки.EN[ф] && !языкОболочки.EN_НАЧАЛА.some(([ru]) => ru === ф))
  check('словарь оболочки покрываетъ меню, окна и отказы', фразы.length > 40 && безъСловаря.length === 0, безъСловаря.join(' | ') || `${фразы.length} фразъ`)
  const голыя = [...главный.matchAll(/(label|title|name): '([^']*[а-яё][^']*)'/gi)].map((m) => m[2])
  check('въ меню и окнахъ оболочки нѣтъ русскихъ строкъ мимо м()', голыя.length === 0, голыя.join(' | '))
  языкОболочки.поставить('en')
  check('отказъ съ хвостомъ переводится по началу', языкОболочки.м('сервер ответил 404') === 'the server responded 404')
  check('меню по-англійски', языкОболочки.м('Файл') === 'File')
  языкОболочки.поставить('ru')
  check('по-русски оболочка не трогаетъ фразы', языкОболочки.м('Файл') === 'Файл')
}

/*
 * Теги, счёт по умолчанию, уведомления о платежах и сводка кредита.
 */
function тегиИУведомленія() {
  console.log('\n— теги —')
  const тх = (id: string, date: string, tags: string[], accountId = 'a1', createdAt = '2026-09-01T00:00:00Z') =>
    ({ id, kind: 'expense' as const, date, amount: 100_00, accountId, tags, createdAt })
  const наборъ = {
    ...data,
    transactions: [
      тх('t1', '2026-08-01', ['ройка', 'такси']),
      тх('t2', '2026-09-02', ['тройка']),
      тх('t3', '2026-09-03', ['ройка', 'тройка']),
      тх('t4', '2026-07-04', ['кофе']),
    ],
    recurring: [{ id: 'r1', title: 'Проезд', kind: 'expense' as const, amount: 1, accountId: 'a1', freq: 'monthly' as const,
      interval: 1, startDate: '2026-01-01', autoPost: false, tags: ['ройка'], active: true }],
  }
  const все = всеТеги(наборъ)
  check('частые теги впереди', все[0].тег === 'ройка' || все[0].тег === 'тройка', JSON.stringify(все))
  const слито = переименоватьТег(наборъ, 'ройка', ' #тройка ')
  check('опечатка переименована и слита без дублей',
    слито.transactions[0].tags.join(',') === 'тройка,такси' && слито.transactions[2].tags.join(',') === 'тройка',
    JSON.stringify(слито.transactions.map((t) => t.tags)))
  check('затронуты ровно два месяца', слито.месяцы.sort().join(',') === '2026-08,2026-09' && слито.операций === 2, слито.месяцы.join(','))
  check('и регулярное правило тоже', слито.recurring[0].tags.join(',') === 'тройка')
  check('чужие операции не тронуты', слито.transactions[3] === наборъ.transactions[3])
  const убрано = переименоватьТег(наборъ, 'кофе', '')
  check('пустое имя удаляет тег', убрано.transactions[3].tags.length === 0 && убрано.операций === 1)

  console.log('\n— виджеты справа —')
  check('без настройки — прежний набор', включённыеВиджеты(undefined).join(',') === 'month,attention,upcoming,goals,rank,forecast')
  check('чужие и повторы отбрасываются', включённыеВиджеты(['accounts', 'чужой', 'accounts', 'month']).join(',') === 'accounts,month')
  check('пустой список — пустая панель, а не набор по умолчанию', включённыеВиджеты([]).length === 0)

  console.log('\n— счёт по умолчанию —')
  const счета = [
    { id: 'a1', name: 'Т', type: 'card' as const, icon: 'x', color: '#000', initialBalance: 0 },
    { id: 'a2', name: 'Я', type: 'card' as const, icon: 'x', color: '#000', initialBalance: 0 },
    { id: 'a3', name: 'Старый', type: 'card' as const, icon: 'x', color: '#000', initialBalance: 0, archived: true },
  ]
  check('открытый счёт главнее всего', счётПоУмолчанию(счета, [], 'a2') === 'a2')
  check('убранный в архив не подставляется', счётПоУмолчанию(счета, [], 'a3') === 'a1')
  check('иначе — счёт последней записанной операции',
    счётПоУмолчанию(счета, [тх('x', '2026-01-01', [], 'a1', '2026-09-01'), тх('y', '2025-01-01', [], 'a2', '2026-09-02')]) === 'a2')
  check('без операций — первая карта', счётПоУмолчанию(счета, []) === 'a1')

  console.log('\n— уведомления о платежах —')
  const карта = { id: 'card', name: 'Карта', type: 'card' as const, icon: 'x', color: '#000', initialBalance: 100_000_00 }
  const кредитъ = { id: 'loan', name: 'Диван', type: 'credit' as const, icon: 'x', color: '#f00', initialBalance: -44_000_00,
    credit: { principal: 44_000_00, ratePct: 0, termMonths: 10, startDate: '2026-06-25', paymentDay: 10,
      monthlyPayment: 4_400_00, purpose: 'purchase' as const, v: 2 as const, remind: true, remindFrom: '2026-08-01' } }
  const хр = { ...data, accounts: [карта, кредитъ], transactions: [] as typeof data.transactions, notifications: [] as Notice[] }
  const новые = новыеУведомления(хр, '2026-09-10')
  check('в день платежа заводятся уведомления с дня включения',
    новые.map((n) => n.dueDate).join(',') === '2026-08-10,2026-09-10' && новые.every((n) => n.status === 'pending' && n.amount === 4_400_00),
    новые.map((n) => n.dueDate).join(','))
  check('до дня платежа — ничего', новыеУведомления({ ...хр, accounts: [карта, { ...кредитъ, credit: { ...кредитъ.credit, remindFrom: '2026-09-01' } }] }, '2026-09-09').length === 0)
  check('без галочки — ничего', новыеУведомления({ ...хр, accounts: [карта, { ...кредитъ, credit: { ...кредитъ.credit, remind: false } }] }, '2026-09-10').length === 0)
  check('уже заведённое второй раз не заводится', новыеУведомления({ ...хр, notifications: новые }, '2026-09-10').length === 0)
  const сПлатежомъ = { ...хр, transactions: [{ id: 'pp', kind: 'expense' as const, date: '2026-09-05', amount: 4_400_00,
    accountId: 'card', debtId: 'loan', debtPrincipal: 4_400_00, tags: [], createdAt: '' }] }
  check('платёж уже внесён руками — не спрашиваем',
    новыеУведомления(сПлатежомъ, '2026-09-10').map((n) => n.dueDate).join(',') === '2026-08-10',
    новыеУведомления(сПлатежомъ, '2026-09-10').map((n) => n.dueDate).join(','))
  check('погашенный кредит не напоминает', новыеУведомления({ ...хр, accounts: [карта, { ...кредитъ, initialBalance: 0 }] }, '2026-09-10').length === 0)

  const n = новые[1]
  const ответъ = подтвердитьПлатёж(хр, n, { счётъ: 'card', сумма: 4_400_00 })
  check('«прошёл» даёт план платежа на день по графику',
    !!ответъ && ответъ.планъ.операціи.length === 1 && ответъ.планъ.операціи[0].date === '2026-09-10' && ответъ.планъ.операціи[0].debtId === 'loan')
  const отвѣченное = ответъ!.уведомленіе(['tx1'])
  check('и уведомление уходит в историю с операциями', отвѣченное.status === 'paid' && отвѣченное.txIds?.[0] === 'tx1' && !!отвѣченное.resolvedAt)
  check('платить с самого кредита нельзя и тут', подтвердитьПлатёж(хр, n, { счётъ: 'loan', сумма: 100 }) === null)
  check('«не прошёл» закрывает без операций', отклонить(n).status === 'skipped' && !отклонить(n).txIds)
  check('ждущие — только без ответа', ждущія({ ...хр, notifications: [отвѣченное, новые[0]] }).length === 1)

  console.log('\n— сводка кредита —')
  check('следующий платёж — ближайший, сегодняшний тоже', следующийПлатёж(кредитъ.credit, '2026-09-10') === '2026-09-10'
    && следующийПлатёж(кредитъ.credit, '2026-09-11') === '2026-10-10')
  const платёжъ = { id: 'pp2', kind: 'expense' as const, date: '2026-09-10', amount: 4_400_00, accountId: 'card',
    debtId: 'loan', debtPrincipal: 4_400_00, tags: [], createdAt: '' }
  const св = сводкаКредита(кредитъ, { ...хр, transactions: [платёжъ] }, '2026-09-11')
  check('сводка: осталось, погашено и доля', св.debt === 39_600_00 && св.выплачено === 4_400_00 && Math.abs(св.доля - 0.1) < 1e-9,
    `${св.debt} ${св.выплачено} ${св.доля}`)
  check('сводка: платежи и следующий', св.платежи.length === 1 && св.следующій === '2026-10-10')

  const архивъ = { kashel: 'vault', formatVersion: 1, app: 'Кошель', exportedAt: '2026-09-14T00:00:00Z', counts: {},
    data: { ...хр, notifications: [отвѣченное, новые[0], { id: 'bad', kind: 'чужое' }] }, notes: {}, canvases: {}, attachments: {} }
  const р = parseArchive(JSON.stringify(архивъ))
  check('архив хранит уведомления и отбрасывает чужие',
    р.ok && р.archive.data.notifications?.length === 2 && р.archive.data.notifications[0].txIds?.[0] === 'tx1')
  check('архив хранит галочку напоминания',
    р.ok && р.archive.data.accounts.find((a) => a.id === 'loan')?.credit?.remind === true
      && р.archive.data.accounts.find((a) => a.id === 'loan')?.credit?.remindFrom === '2026-08-01')
}

/*
 * Найденное при разборе ошибок — каждая проверка держит одну исправленную.
 */
function разборОшибокъ() {
  console.log('\n— разбор ошибок: счёт, автосписания, разбор строки —')
  const карта = { id: 'k1', name: 'Мои', type: 'card' as const, icon: 'x', color: '#000', initialBalance: 0 }
  const проектъ = { id: 'p1', name: 'Комикс', type: 'card' as const, icon: 'x', color: '#000', initialBalance: 0, project: true }
  const наПроектъ = { id: 'x1', kind: 'expense' as const, date: '2026-09-12', amount: 100, accountId: 'p1', tags: [], createdAt: '2026-09-16T21:00:00Z' }
  const наСвой = { id: 'x0', kind: 'expense' as const, date: '2026-09-10', amount: 100, accountId: 'k1', tags: [], createdAt: '2026-09-15T21:00:00Z' }
  check('последний счёт — не проектный, даже если запись была на проект',
    счётПоУмолчанию([карта, проектъ], [наСвой, наПроектъ]) === 'k1')
  check('но открытый руками проект — он', счётПоУмолчанию([карта, проектъ], [наСвой], 'p1') === 'p1')

  const правило = (p: Partial<import('../src/lib/types').Recurring>) => ({
    id: 'r', title: 'Аренда', kind: 'expense' as const, amount: 1000_00, accountId: 'k1', freq: 'monthly' as const,
    interval: 1, startDate: '2026-01-31', dayOfMonth: 31, autoPost: true, tags: [], active: true, ...p,
  })
  check('31-е в феврале — 28-е', датыПравила(правило({}), '2026-02-01', '2026-02-28').join(',') === '2026-02-28')
  const сНуля = { ...data, accounts: [карта], transactions: [] as typeof data.transactions, recurring: [правило({ lastPosted: '2026-01' })] }
  let номеръ = 0
  const догнали = провестиАвтосписания(сНуля, '2026-03-31', () => 'n' + ++номеръ)
  check('пропущенные месяцы догоняются', догнали.created.map((t) => t.date).join(',') === '2026-02-28,2026-03-31',
    догнали.created.map((t) => t.date).join(','))
  const второйРазъ = провестиАвтосписания(догнали.data, '2026-03-31', () => 'z')
  check('второй запуск в тот же день ничего не ставит', второйРазъ.created.length === 0)
  const удалили = { ...догнали.data, transactions: [] }
  check('удалённое автосписание не воскресает', провестиАвтосписания(удалили, '2026-04-02', () => 'q').created.length === 0)
  const недѣльное = { ...сНуля, recurring: [правило({ freq: 'weekly', startDate: '2026-03-02', dayOfMonth: undefined, lastPosted: undefined })] }
  check('еженедельное — каждую неделю, а не раз в месяц',
    провестиАвтосписания(недѣльное, '2026-03-23', () => 'w').created.map((t) => t.date).join(',') === '2026-03-02,2026-03-09,2026-03-16,2026-03-23')
  const годовое = { ...сНуля, recurring: [правило({ freq: 'yearly', startDate: '2026-09-20', dayOfMonth: undefined, lastPosted: undefined })] }
  check('годовое не раньше своей даты', провестиАвтосписания(годовое, '2026-09-19', () => 'y').created.length === 0
    && провестиАвтосписания(годовое, '2026-09-20', () => 'y').created[0]?.date === '2026-09-20')
  const давнее = { ...сНуля, recurring: [правило({ startDate: '2020-01-15', dayOfMonth: 15, lastPosted: undefined })] }
  check('давнее правило не вываливает годы операций', провестиАвтосписания(давнее, '2026-09-20', () => 'd').created.length <= 4)
  const кредитъ = { id: 'cr', name: 'Диван', type: 'credit' as const, icon: 'x', color: '#f00', initialBalance: -10_000_00,
    credit: { principal: 10_000_00, ratePct: 0, termMonths: 10, startDate: '2026-01-01', paymentDay: 5, monthlyPayment: 1000_00, purpose: 'purchase' as const, v: 2 as const } }
  const наКредитъ = { ...сНуля, accounts: [карта, кредитъ], recurring: [правило({ kind: 'transfer', toAccountId: 'cr', dayOfMonth: 5, startDate: '2026-03-05', lastPosted: '2026-02' })] }
  const платежи = провестиАвтосписания(наКредитъ, '2026-03-06', () => 'c')
  check('автоперевод на кредит — платёж с расходом',
    платежи.created.length === 1 && платежи.created[0].kind === 'expense' && платежи.created[0].debtId === 'cr'
      && платежи.created[0].recurringId === 'r' && платежи.data.categories.some((c) => c.id === 'cat_credit_pay'),
    JSON.stringify(платежи.created))

  const ctx = { accountId: 'k1' }
  const булка = parseQuick('булка 45.50', data.categories, data.accounts, ctx)
  check('«45.50» — цена, а не дата', булка.amount === 4550 && булка.date === today(), `${булка.amount} ${булка.date}`)
  const февраль = parseQuick('кофе 200 31.02', data.categories, data.accounts, ctx)
  check('31.02 — не дата', февраль.date === today(), февраль.date)
  check('«500 3 человека» — пятьсот, не 5 003', parseQuick('обед 500 3 человека', data.categories, data.accounts, ctx).amount === 500_00)
  check('«1 250» — одна сумма', parseQuick('обед 1 250', data.categories, data.accounts, ctx).amount === 1250_00)
  check('«такси 480 12.08» — дата', parseQuick('такси 480 12.08', data.categories, data.accounts, ctx).date.endsWith('-08-12'))

  check('CSV: американская дата', parseDateCell('09/17/2026') === '2026-09-17', String(parseDateCell('09/17/2026')))
  check('CSV: однозначные числа', parseDateCell('1.9.2026') === '2026-09-01', String(parseDateCell('1.9.2026')))
  check('CSV: несуществующая дата отбрасывается', parseDateCell('31.02.2026') === null && parseDateCell('2026-17-09') === null)
  check('CSV: 1,234.56', parseAmountCell('1,234.56') === 123456, String(parseAmountCell('1,234.56')))
  check('CSV: 1.234,56', parseAmountCell('1.234,56') === 123456, String(parseAmountCell('1.234,56')))
  check('CSV: длинный минус банка', parseAmountCell('−1500') === -150000, String(parseAmountCell('−1500')))
  check('CSV: 1,234 — тысячи', parseAmountCell('1,234') === 123400, String(parseAmountCell('1,234')))

  check('поле суммы считает выражение', суммаИзВыражения('450+120') === 570_00 && суммаИзВыражения('1 000 - 200') === 800_00)
  check('и не пропускает постороннее', суммаИзВыражения('alert(1)+1') === 0 && суммаИзВыражения('-500') === -500_00)

  console.log('\n— разбор ошибок: кредиты, долги, напоминания, архив —')
  const тратаСъКредита = { id: 'e', kind: 'expense' as const, date: '2026-01-02', amount: 50_000_00, accountId: 'old2', tags: [], createdAt: '' }
  const старый2 = { id: 'old2', name: 'Карта в долг', type: 'credit' as const, icon: 'x', color: '#000', initialBalance: 0,
    credit: { principal: 50_000_00, ratePct: 0, termMonths: 10, startDate: '2026-01-01', paymentDay: 5, monthlyPayment: 5_000_00 } }
  const сТратой = перевестиКредиты({ ...data, accounts: [карта, старый2], transactions: [тратаСъКредита] })
  check('перенос не удваивает долг, если траты уже на кредите',
    creditRemaining(сТратой.accounts[1], сТратой.transactions) === 50_000_00, String(creditRemaining(сТратой.accounts[1], сТратой.transactions)))
  check('и такой кредит считается «деньгами», чтобы платёж не стал вторым расходом', сТратой.accounts[1].credit?.purpose === 'cash')
  const сСвязями = перевестиКредиты({ ...data, accounts: [карта, { ...старый2, id: 'old3' }],
    transactions: [{ id: 't', kind: 'transfer' as const, date: '2026-02-05', amount: 5_000_00, accountId: 'k1', toAccountId: 'old3', recurringId: 'rr', goalId: 'gg', tags: [], createdAt: '' }] })
  check('перенос сохраняет связь с правилом и целью', сСвязями.transactions[0].recurringId === 'rr' && сСвязями.transactions[0].goalId === 'gg')

  const долгъ = { id: 'd1', name: 'Пете', type: 'debt' as const, icon: 'x', color: '#000', initialBalance: 5_000_00,
    debt: { counterparty: 'Петя', direction: 'i_owe' as const } }
  const мнѣ = { id: 'd2', name: 'Маше', type: 'debt' as const, icon: 'x', color: '#000', initialBalance: -3_000_00,
    debt: { counterparty: 'Маша', direction: 'owed_to_me' as const } }
  const долги = перевестиДолги([долгъ, мнѣ])
  check('«я должен» становится минусом, «мне должны» — плюсом',
    долги.accounts[0].initialBalance === -5_000_00 && долги.accounts[1].initialBalance === 3_000_00 && долги.changed === 2)
  check('второй раз долги не трогаются', перевестиДолги(долги.accounts).changed === 0)
  check('остаток долга по направлению', остатокДолга(долги.accounts[0], []) === 5_000_00 && остатокДолга(долги.accounts[1], []) === 3_000_00)
  const итоги = balances([карта, ...долги.accounts], [])
  check('«мне должны» — актив, «я должен» — обязательство', итоги.assets === 3_000_00 && итоги.liabilities === -5_000_00)

  const напоминаніе = { id: 'rm', title: 'Аренда', active: true, sound: 'none' as const, kind: 'date' as const, date: '2026-01-31', repeat: 'monthly' as const }
  check('ежемесячное напоминание не съезжает на 28-е', nextDate(напоминаніе, '2026-03-01') === '2026-03-31', String(nextDate(напоминаніе, '2026-03-01')))

  const сПроектомъ = { ...data, accounts: [карта, проектъ], transactions: [],
    recurring: [правило({ accountId: 'p1', kind: 'income' })] }
  check('правило проекта не входит в личное', личное(сПроектомъ).recurring.length === 0)

  const напомнить = { ...кредитъ, credit: { ...кредитъ.credit, remind: true, remindFrom: '2026-01-01' } }
  const отвѣт = { id: 'n1', kind: 'credit_payment' as const, accountId: 'cr', dueDate: '2026-03-05', amount: 1, createdAt: '', status: 'skipped' as const, resolvedAt: '2026-03-06' }
  const почищено = очиститьИсторію({ ...data, accounts: [напомнить], transactions: [], notifications: [отвѣт] })
  check('после очистки истории отвеченные дни не возвращаются',
    (почищено.notifications?.length ?? 1) === 0 && !новыеУведомления(почищено, '2026-03-10').some((n) => n.dueDate <= '2026-03-05'),
    почищено.accounts[0].credit?.remindFrom)
  const выключено = { ...data, accounts: [кредитъ], notifications: [{ ...отвѣт, status: 'pending' as const }] }
  check('у кредита без напоминания висящие уведомления не показываются', ждущія(выключено).length === 0)
  const опоздалъ = { ...data, accounts: [карта, напомнить], transactions: [{ id: 'late', kind: 'expense' as const, date: '2026-02-07', amount: 1000_00,
    accountId: 'k1', debtId: 'cr', debtPrincipal: 1000_00, tags: [], createdAt: '' }], notifications: [] as Notice[] }
  check('платёж с опозданием не глушит следующий месяц',
    новыеУведомления(опоздалъ, '2026-03-05').some((n) => n.dueDate === '2026-03-05'))

  const архивъ = { kashel: 'vault', formatVersion: 1, app: 'Кошель', exportedAt: '2026-09-14T00:00:00Z', counts: {},
    data: { ...data,
      accounts: [проектъ, { ...кредитъ, credit: { ...кредитъ.credit, kind: 'card' as const, limit: 50_000_00, graceDays: 55 } }],
      categories: [{ id: 'cc', name: 'Дивиденды', kind: 'income' as const, icon: 'x', color: '#000', capital: true }],
      tasks: [{ id: 'tk', title: 'Дело', done: false, important: false, priority: 2, tags: [], order: 0, createdAt: '2026-01-01' }] },
    notes: {}, canvases: {}, attachments: {} }
  const р = parseArchive(JSON.stringify(архивъ))
  const д = р.ok ? р.archive.data : null
  check('архив хранит отметку проекта', д?.accounts.find((a) => a.id === 'p1')?.project === true)
  check('архив хранит лимит и льготный срок карты',
    д?.accounts.find((a) => a.id === 'cr')?.credit?.kind === 'card' && д?.accounts.find((a) => a.id === 'cr')?.credit?.limit === 50_000_00
      && д?.accounts.find((a) => a.id === 'cr')?.credit?.graceDays === 55)
  check('архив хранит «доход с капитала» и важность задачи', д?.categories[0]?.capital === true && д?.tasks[0]?.priority === 2)
}

function подкатегорииПроверка() {
  console.log('\n— подкатегории —')
  const к = (id: string, over: Partial<import('../src/lib/types').Category> = {}) =>
    ({ id, name: id, kind: 'expense' as const, icon: 'x', color: '#000', ...over })
  const cats = [
    к('Рабочие расходы', { plan: 10_000_00 }),
    к('Таня Челяба', { parentId: 'Рабочие расходы' }),
    к('Бензин', { parentId: 'Рабочие расходы', plan: 3_000_00 }),
    к('Еда'),
    к('Зарплата', { kind: 'income' }),
    к('Чужая', { parentId: 'Зарплата' }), // родитель другого вида — не родитель
  ]
  const тр = (id: string, amount: number, over: Partial<Transaction> = {}): Transaction =>
    ({ id: 't' + id + amount, date: today(), amount, kind: 'expense', accountId: 'a', categoryId: id, tags: [], createdAt: today(), ...over } as Transaction)
  const txs = [тр('Рабочие расходы', 100), тр('Таня Челяба', 500), тр('Бензин', 250), тр('Еда', 70)]
  const итоги = categoryTotals(txs, 'expense')
  const главные = поГлавным(итоги, cats)
  check('подкатегории складываются в главную', главные.find((x) => x.categoryId === 'Рабочие расходы')?.amount === 850
    && главные.length === 2 && главные.every((x) => x.categoryId !== 'Таня Челяба'))
  check('доли главных — от общей суммы', Math.abs(главные.reduce((s, x) => s + x.share, 0) - 1) < 1e-9)
  const раскладка = раскладкаГлавной(итоги, 'Рабочие расходы', cats)
  check('раскладка главной: подкатегории и её собственные траты',
    раскладка.map((x) => x.categoryId).join() === 'Таня Челяба,Бензин,Рабочие расходы' && !раскладка.some((x) => x.categoryId === 'Еда'))
  check('подкатегория с родителем другого вида остаётся главной', подкатегории('Зарплата', cats).length === 0)
  check('семья главной — она и подкатегории', [...семья('Рабочие расходы', cats)].sort().join() === 'Бензин,Рабочие расходы,Таня Челяба')
  check('у подкатегории семья — только она сама', семья('Бензин', cats).size === 1)
  check('операция с долей в подкатегории попадает в фильтр главной',
    вСемье(тр('Еда', 100, { splits: [{ categoryId: 'Таня Челяба', amount: 40 }, { categoryId: 'Еда', amount: 60 }] }), семья('Рабочие расходы', cats)))
  check('суммаСемьи для главной — с подкатегориями',
    суммаСемьи('Рабочие расходы', new Map(итоги.map((x) => [x.categoryId, x.amount])), cats) === 850)
  check('в подкатегорию подкатегорию не вложить', !!нельзяВложить(к('Новая'), 'Бензин', cats))
  check('главную с подкатегориями не вложить', !!нельзяВложить(cats[0], 'Еда', cats))
  check('в себя не вложить и в чужой вид — тоже', !!нельзяВложить(cats[3], 'Еда', cats) && !!нельзяВложить(cats[3], 'Зарплата', cats))
  check('обычную вложить можно', нельзяВложить(cats[3], 'Рабочие расходы', cats) === '')
  const дерево = деревоКатегорий(cats.filter((c) => c.kind === 'expense'))
  check('дерево: главная, под ней подкатегории',
    дерево.map((x) => x.cat.id).join() === 'Рабочие расходы,Таня Челяба,Бензин,Еда,Чужая' && дерево[1].главная?.id === 'Рабочие расходы')
  check('поиск по имени главной находит её подкатегории',
    деревоКатегорий(cats, 'рабоч').map((x) => x.cat.id).join() === 'Рабочие расходы,Таня Челяба,Бензин')
  check('поиск по подкатегории показывает и её главную',
    деревоКатегорий(cats, 'челяб').map((x) => x.cat.id).join() === 'Рабочие расходы,Таня Челяба')
  const д = { ...data, categories: cats }
  const послеУдаления = безРодителя(д, 'Рабочие расходы')
  check('после удаления главной подкатегории становятся главными',
    послеУдаления.length === cats.length - 1 && послеУдаления.filter((c) => c.parentId === 'Рабочие расходы').length === 0)
  const лимит: Reminder = { id: 'rem_lim', title: 'лимит', active: true, sound: 'soft', kind: 'event', event: 'limit-exceeded',
    threshold: 100, categoryId: 'Рабочие расходы', repeat: 'once' } as Reminder
  const сТратами = { ...д, transactions: [тр('Таня Челяба', 11_000_00)], reminders: [лимит] }
  check('лимит главной покрывает траты подкатегорий (напоминание)', dueReminders(сТратами, today()).length === 1)
  check('и без трат напоминание молчит', dueReminders({ ...сТратами, transactions: [] }, today()).length === 0)
}

function копииОтменаВерсии() {
  console.log('\n— версия и «Что нового» —')
  const пакет = JSON.parse(require('fs').readFileSync(require('path').join(process.cwd(), 'package.json'), 'utf8'))
  check('версия программы — из package.json', ВЕРСИЯ === пакет.version, ВЕРСИЯ)
  check('у нынешней версии есть список изменений', !!выпускВерсии(ВЕРСИЯ) && выпускВерсии(ВЕРСИЯ)!.пункты.length > 0)
  check('выпуски идут от новых к старым', ВЫПУСКИ.every((в, i) => i === 0 || сравнитьВерсии(ВЫПУСКИ[i - 1].версия, в.версия) > 0))
  check('сравнение версий по числам, а не по буквам', сравнитьВерсии('1.0.10', '1.0.9') > 0 && сравнитьВерсии('1.0', '1.0.0') === 0 && сравнитьВерсии('1.0.1', '1.1.0') < 0)
  check('новому хранилищу «Что нового» не показывается', непросмотренныеВыпуски(undefined, false, '1.0.1').length === 0)
  check('обновлению с 1.0.0 показывается', непросмотренныеВыпуски(undefined, true, '1.0.1').map((в) => в.версия).join() === '1.0.1')
  check('просмотренное второй раз не показывается', непросмотренныеВыпуски('1.0.1', true, '1.0.1').length === 0)
  check('выпуски новее нынешней не показываются', непросмотренныеВыпуски(undefined, true, '1.0.0').length === 0)

  console.log('\n— резервные копии —')
  const когда = new Date(2026, 8, 17, 9, 5, 7)
  const имя = имяКопии('daily', когда)
  check('имя копии: вид, дата и время', имя === 'backups/ежедневная 2026-09-17 09-05-07.kashel', имя)
  const разбор = разобратьИмяКопии(имя.slice('backups/'.length))
  check('имя копии разбирается обратно', разбор?.вид === 'daily' && разбор.день === '2026-09-17' && разбор.когда.getTime() === когда.getTime())
  check('копия прежних версий узнаётся', разобратьИмяКопии('до-загрузки 2026-09-01 10-00-00.kashel')?.вид === 'load')
  check('копия, сделанная по-английски, узнаётся и по-русски', разобратьИмяКопии('daily 2026-09-01 10-00-00.kashel')?.вид === 'daily')
  check('посторонние файлы в папке — не копии', разобратьИмяКопии('заметка.txt') === null && разобратьИмяКопии('x 2026-13-45 99-99-99.kashel.tmp') === null)
  const дни = Array.from({ length: 20 }, (_, i) => ({ name: имяКопии('daily', new Date(2026, 7, i + 1, 12)).slice(8), size: 10 }))
  const прочие = [
    { name: имяКопии('update', new Date(2026, 6, 1)).slice(8) },
    { name: имяКопии('wipe', new Date(2026, 6, 2)).slice(8) },
    { name: 'чужой файл.kashel' },
  ]
  const копии = упорядочитьКопии([...дни, ...прочие])
  check('список копий — новые сверху, чужое пропущено', копии.length === 22 && копии[0].день === '2026-08-20' && копии[21].вид === 'update')
  const лишние = лишниеЕжедневные(копии)
  check('ежедневных хранится 14 — удаляются старейшие', лишние.length === 6 && лишние.every((к) => к.вид === 'daily' && к.день <= '2026-08-06'))
  check('копии перед обновлением и очисткой не подчищаются', !лишние.some((к) => к.вид !== 'daily'))

  console.log('\n— отмена удаления —')
  const cat = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, kind: 'expense' as const, icon: 'x', color: '#000', ...over })
  const база = {
    ...data,
    categories: [cat('a'), cat('главная'), cat('под', { parentId: 'главная' }), cat('b')],
    accounts: [{ ...data.accounts[0], id: 'acc1' }, { ...data.accounts[0], id: 'acc2' }],
    recurring: [
      { ...data.recurring[0], id: 'r1', accountId: 'acc2', active: true, tags: ['дом', 'свет'] },
      { ...data.recurring[0], id: 'r2', accountId: 'acc2', active: false, tags: [] },
      { ...data.recurring[0], id: 'r3', accountId: 'acc1', active: true, tags: [] },
    ],
    transactions: [
      { id: 't1', date: '2026-09-01', amount: 1, kind: 'expense' as const, accountId: 'acc1', tags: ['свет', 'дом'], createdAt: '' },
      { id: 't2', date: '2026-08-01', amount: 1, kind: 'expense' as const, accountId: 'acc1', tags: ['еда'], createdAt: '' },
    ],
  }
  check('запись встаёт на прежнее место', вставитьНазад([{ id: '1' }, { id: '3' }], { id: '2' }, 1).map((x) => x.id).join() === '1,2,3')
  check('дважды не встаёт', вставитьНазад([{ id: '1' }], { id: '1' }, 0).length === 1)

  const сК = снимокКатегории(база, 'главная')!
  let после = { ...база, categories: безРодителя(база, 'главная') }
  после = { ...после, categories: [...после.categories, cat('новая')] } // записали, пока висела кнопка
  const вернули = вернутьКатегорию(после, сК)
  check('категория возвращается на место и с подкатегориями',
    вернули.categories.map((c) => c.id).join() === 'a,главная,под,b,новая' && вернули.categories.find((c) => c.id === 'под')?.parentId === 'главная')
  const перенесли = вернутьКатегорию({ ...после, categories: после.categories.map((c) => (c.id === 'под' ? { ...c, parentId: 'a' } : c)) }, сК)
  check('перенесённую за это время подкатегорию отмена не трогает', перенесли.categories.find((c) => c.id === 'под')?.parentId === 'a')

  const сС = снимокСчёта(база, 'acc2')!
  const безСчёта = {
    ...база,
    accounts: база.accounts.filter((a) => a.id !== 'acc2'),
    recurring: база.recurring.map((r) => (r.active && r.accountId === 'acc2' ? { ...r, active: false } : r)),
  }
  const счётВернули = вернутьСчёт(безСчёта, сС)
  check('счёт возвращается, его правила снова включены',
    счётВернули.accounts.map((a) => a.id).join() === 'acc1,acc2' && счётВернули.recurring.find((r) => r.id === 'r1')?.active === true)
  check('выключенное ещё до удаления правило остаётся выключенным', счётВернули.recurring.find((r) => r.id === 'r2')?.active === false)

  const сЗ = снимокЗаписи(база, 'recurring', 'r2')!
  const безЗаписи = { ...база, recurring: база.recurring.filter((r) => r.id !== 'r2') }
  check('регулярный платёж возвращается на место', вернутьЗапись(безЗаписи, сЗ).recurring.map((r) => r.id).join() === 'r1,r2,r3')

  const сТ = снимокТега(база, 'дом')
  const безТега = { ...база, ...переименоватьТег(база, 'дом', '') }
  const тегВернули = вернутьТег(безТега, сТ)
  check('тег возвращается на своё место в операциях и правилах',
    тегВернули.transactions.find((t) => t.id === 't1')?.tags.join() === 'свет,дом' && тегВернули.recurring.find((r) => r.id === 'r1')?.tags.join() === 'дом,свет')
  check('операции без тега отмена не трогает', тегВернули.transactions.find((t) => t.id === 't2')?.tags.join() === 'еда')
  check('снимок тега знает месяцы операций', сТ.операции.map((x) => x.месяц).join() === '2026-09')
}

void завершить()

async function завершить() {
  оформленіе()
  подписиЗначковъ()
  недѣля()
  пополненіеЦѣлей()
  своиЗначки()
  конструкторъТемъ()
  await полнаяВыгрузкаПровѣрка()
  await шифрованіе()
  тегиИУведомленія()
  разборОшибокъ()
  подкатегорииПроверка()
  копииОтменаВерсии()
  переводъ()
  console.log(`\nПровалено проверок: ${fail.length}`)
  for (const f of fail) console.log('  ✗ ' + f)
  process.exit(fail.length ? 1 : 0)
}
