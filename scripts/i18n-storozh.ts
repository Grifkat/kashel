/*
 * Сторож перевода.
 *
 * Перевод ломается тихо: забытая строка просто остаётся русской посреди
 * английского окна, и заметить её можно, только открыв нужный угол
 * программы. Поэтому исходник проверяется целиком, на компиляторе:
 *
 * - каждая русская строка, которую видит человек, идёт через т()/тр()/тк();
 * - у каждого ключа есть английский перевод;
 * - места {0}, {1}… в переводе те же, что в ключе;
 * - в словаре нет ключей, которых в программе уже нет.
 *
 * Русские строки, которые остаются русскими нарочно — внутренние признаки
 * вида { в: 'готово' }, слова быстрого ввода, заголовки банковских выписок, —
 * перечислены ниже поимённо. Новая такая строка сторожа не пройдёт, пока её
 * не впишут сюда: так случайный пропуск не спрячется среди нарочных.
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { КИРИЛЛИЦА, СЛУЖЕБНЫЕ_АТРИБУТЫ, служебноеМѣсто } from './i18n-obernut'

/** Файлы, где русский текст — данные, а не надписи. */
const ВНѢ_ПРОВѢРКИ = new Set([
  'i18n/index.ts', 'i18n/en.ts',
  // названия значков переводятся при показе (ui.tsx), ключи собираются отдельно
  'lib/catalog.ts',
])

/**
 * Нарочно русские строки: файл → строки.
 * Внутренние признаки, сравниваемые в коде, и слова, которые программа
 * ищет во вводе человека или в чужих файлах.
 */
export const НАРОЧНО_РУССКІЯ: Record<string, string[]> = {
  // внутренние признаки состояний и режимов и имена ключей localStorage: на экран не идут
  'App.tsx': ['вне-вкладок', 'kashel:свёрнутыеГруппы'],
  'components/Besjeda.tsx': ['kashel:нейросеть:модель', 'ищемъ', 'всё', 'нѣтъOllama', 'нѣтъМоделей', 'готово', 'человѣкъ', 'машина', 'besjeda-строка ', 'свой', 'чужой', 'итоги'],
  'components/DateField.tsx': ['ш'],
  'components/Konstruktor.tsx': ['простой', 'полный', 'новая'],
  'components/Kredity.tsx': ['нет'],
  'components/Obnovlenie.tsx': ['покой', 'есть', 'смотрю', 'свѣжая', 'бѣда', 'качаю', 'готово'],
  'components/Proekty.tsx': ['нет'],
  'components/Vhod.tsx': ['kashel:облако:сеансъ', 'kashel:облако:безъВхода', 'ждёмъ', 'готово', 'отпираемъ', 'выборъ', 'входъ', 'заводимъ'],
  'engine/advice.ts': ['низкое', 'среднее', 'высокое'],
  'lib/svoitemy.ts': ['простой', 'полный'],
  'state/cloud.ts': ['опись'],
  // слова, которые ищутся в чужом тексте: заголовки выписок и быстрый ввод
  'engine/csv.ts': ['дата', 'время', 'сумма', 'оборот', 'приход', 'расход', 'списание', 'описание', 'назначение', 'комментарий', 'категория', 'контрагент', 'место'],
  'engine/parse.ts': ['доход', 'зарплата', 'аванс', 'получил', 'получила', 'приход', 'навар', 'премия', 'вернули', 'возврат', 'перевод', 'переведи', 'перевёл', 'перевел', 'снятие', 'снял', 'в копилку', 'на счёт', 'позавчера', 'вчера', 'сегодня', 'завтра'],
  // язык ответа модели берётся из вопроса, а не из окна
  'engine/svodka.ts': ['Вопрос задан по-русски. Отвечай по-русски, даже если данные выше или прежние ответы на другом языке.', 'Answer in the language of the question. Отвечай на языке вопроса.'],
  // соль ключа: сменить — значит не открыть старые облачные записи
  'lib/crypto.ts': ['Кошель|'],
  // русская ветка там, где английская написана рядом без словаря
  'lib/date.ts': ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря', 'янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек', 'Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  'lib/format.ts': [' млн', ' тыс'],
  // переключатель языка подписан на обоих, чтобы его нашёл тот, кто не читает по-русски
  'views/Settings.tsx': ['Язык · Language', 'Русский'],
}

export interface Находка { файлъ: string; строка: number; текстъ: string }

export interface ИтогъСторожа {
  ключи: Map<string, Находка>
  непереведённыя: Находка[]
  безПеревода: string[]
  лишнія: string[]
  мѣстаНеСходятся: string[]
  пробѣлыНеСходятся: string[]
  неиспользованныяНарочныя: string[]
}

const ПЕРЕВОДЫ = new Set(['т', 'тр', 'тк'])

function обойти(дир: string, отн = ''): string[] {
  const итогъ: string[] = []
  for (const е of fs.readdirSync(дир, { withFileTypes: true })) {
    const п = path.join(дир, е.name)
    const о = отн ? `${отн}/${е.name}` : е.name
    if (е.isDirectory()) итогъ.push(...обойти(п, о))
    else if (/\.(ts|tsx)$/.test(е.name) && !е.name.endsWith('.d.ts')) итогъ.push(о)
  }
  return итогъ
}

const мѣста = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',')

export function сторожъ(корень: string, EN: Record<string, string>, названияКаталога: string[]): ИтогъСторожа {
  const ключи = new Map<string, Находка>()
  const непереведённыя: Находка[] = []
  const нарочныхъВстрѣчено = new Set<string>()

  const добавитьКлючъ = (к: string, н: Находка) => { if (!ключи.has(к)) ключи.set(к, н) }

  for (const отн of обойти(корень)) {
    if (ВНѢ_ПРОВѢРКИ.has(отн)) continue
    const текстъ = fs.readFileSync(path.join(корень, отн), 'utf8')
    if (!КИРИЛЛИЦА.test(текстъ)) continue
    const sf = ts.createSourceFile(отн, текстъ, ts.ScriptTarget.Latest, true, отн.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const гдѣ = (n: ts.Node): Находка => ({ файлъ: отн, строка: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, текстъ: '' })
    const нарочныя = new Set(НАРОЧНО_РУССКІЯ[отн] ?? [])

    const пропускъ = (n: ts.Node, т: string) => {
      if (нарочныя.has(т)) {
        нарочныхъВстрѣчено.add(отн + '\u0000' + т)
        return
      }
      непереведённыя.push({ ...гдѣ(n), текстъ: т })
    }

    /** Первый аргумент т()/тр()/тк() — ключ; прочие аргументы проверяются как обычно. */
    const ключъВызова = (n: ts.Node): boolean => {
      const p = n.parent
      return !!p && ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ПЕРЕВОДЫ.has(p.expression.text) && p.arguments[0] === n
    }

    const пройти = (n: ts.Node) => {
      // ключи
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const имя = n.expression.text
        const а0 = n.arguments[0]
        if (ПЕРЕВОДЫ.has(имя) && а0 && (ts.isStringLiteral(а0) || ts.isNoSubstitutionTemplateLiteral(а0))) {
          добавитьКлючъ(а0.text, { ...гдѣ(а0), текстъ: а0.text })
        }
        if (имя === 'plural' && n.arguments.length === 4) {
          const формы = n.arguments.slice(1)
          if (формы.every((ф) => ts.isStringLiteral(ф)) && формы.some((ф) => КИРИЛЛИЦА.test((ф as ts.StringLiteral).text))) {
            const к = формы.map((ф) => (ф as ts.StringLiteral).text).join('|')
            добавитьКлючъ(к, { ...гдѣ(n), текстъ: к })
          }
        }
      }

      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && КИРИЛЛИЦА.test(n.text)) {
        const p = n.parent
        const вызовъPlural = p && ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'plural'
        if (ключъВызова(n) || вызовъPlural) {
          // ключ, уже учтён
        } else if (p && ts.isJsxAttribute(p)) {
          const имя = p.name.getText(sf)
          if (!(СЛУЖЕБНЫЕ_АТРИБУТЫ.has(имя) || имя.startsWith('data-'))) пропускъ(n, n.text)
        } else if (!служебноеМѣсто(n) || (p && ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ПЕРЕВОДЫ.has(p.expression.text))) {
          пропускъ(n, n.text)
        }
      }

      if (ts.isTemplateExpression(n)) {
        const куски = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)]
        if (куски.some((k) => КИРИЛЛИЦА.test(k)) && !служебноеМѣсто(n)) {
          let к = n.head.text
          n.templateSpans.forEach((s, i) => { к += `{${i}}` + s.literal.text })
          пропускъ(n, к)
        }
      }

      if (ts.isJsxText(n) && КИРИЛЛИЦА.test(n.text)) пропускъ(n, n.text.trim())

      ts.forEachChild(n, пройти)
    }
    пройти(sf)
  }

  for (const н of названияКаталога) добавитьКлючъ(н, { файлъ: 'lib/catalog.ts', строка: 0, текстъ: н })

  const безПеревода = [...ключи.keys()].filter((к) => !EN[к])
  const лишнія = Object.keys(EN).filter((к) => !ключи.has(к))
  const мѣстаНеСходятся = Object.entries(EN).filter(([к, v]) => ключи.has(к) && мѣста(к) !== мѣста(v)).map(([к]) => к)
  // Ведущий и хвостовой пробел — часть склейки с соседним текстом.
  const пробѣлыНеСходятся = Object.entries(EN)
    .filter(([к, v]) => ключи.has(к) && (/^\s/.test(к) !== /^\s/.test(v) || /\s$/.test(к) !== /\s$/.test(v)))
    .map(([к]) => к)
  // Множественное: «одна|две|пять» → «one|many», ровно две формы.
  for (const [к, v] of Object.entries(EN)) {
    if (к.split('|').length === 3 && v.split('|').length !== 2) мѣстаНеСходятся.push(к)
  }
  const неиспользованныяНарочныя = Object.entries(НАРОЧНО_РУССКІЯ)
    .flatMap(([ф, сп]) => сп.map((с) => [ф, с] as const))
    .filter(([ф, с]) => !нарочныхъВстрѣчено.has(ф + '\u0000' + с))
    .map(([ф, с]) => `${ф}: ${с}`)

  return { ключи, непереведённыя, безПеревода, лишнія, мѣстаНеСходятся, пробѣлыНеСходятся, неиспользованныяНарочныя }
}

if (process.argv[1] && /i18n-storozh/.test(process.argv[1])) {
  const { EN } = require('../src/i18n/en') as { EN: Record<string, string> }
  const { ICON_GROUPS } = require('../src/lib/catalog') as typeof import('../src/lib/catalog')
  const названія = ICON_GROUPS.flatMap((g) => [g.title, ...g.items.map((i) => i.title)])
  const и = сторожъ(path.join(process.cwd(), 'src'), EN, названія)
  const кэш = path.join(process.cwd(), 'node_modules/.cache')
  fs.writeFileSync(path.join(кэш, 'i18n-klyuchi.json'), JSON.stringify([...и.ключи.entries()].map(([к, н]) => ({ к, ф: н.файлъ, с: н.строка })), null, 1))
  fs.writeFileSync(path.join(кэш, 'i18n-neperevedeno.txt'), и.непереведённыя.map((н) => `${н.файлъ}:${н.строка}\t${н.текстъ}`).join('\n'))
  console.log(`ключей ${и.ключи.size}, без перевода ${и.безПеревода.length}, лишних ${и.лишнія.length}`)
  console.log(`не обёрнуто ${и.непереведённыя.length}, места не сходятся ${и.мѣстаНеСходятся.length}, пробелы ${и.пробѣлыНеСходятся.length}, устаревших нарочных ${и.неиспользованныяНарочныя.length}`)
}
