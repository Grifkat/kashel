/*
 * Обёртка русских строк в т() / тр() — разовая переделка под перевод.
 *
 * Работает на компиляторе TypeScript, а не регулярками: надо точно знать,
 * где строка — надпись для человека, а где ключ, путь или признак в
 * сравнении. Исходник пересобирается кусками: всё, чего переделка не
 * касается, переносится байт в байт, вместе с примечаниями и отступами.
 *
 * Правила:
 * - текст в разметке JSX — всегда; подряд идущие текст и вставки {…}
 *   собираются в одну фразу с местами {0}, {1}, чтобы переводчик видел
 *   фразу целиком, а не обрывки;
 * - строка в атрибуте JSX — всегда, кроме value/key/className и подобных;
 * - строка в коде — только если это явно текст: с пробелом, знаком
 *   препинания или с большой буквы. Одиночное строчное слово — это почти
 *   всегда внутренний признак ({ вид: 'есть' }), и перевод сломал бы
 *   сравнения с ним. Такие строки попадают в отчёт для ручного просмотра;
 * - не трогаются: импорты, типы, имена свойств, операнды сравнений,
 *   аргументы поисковых и служебных вызовов (includes, test, get, set,
 *   plural, console…).
 *
 * Запуск: node scripts/i18n-obernut.cjs [--dry]
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const КОРЕНЬ = path.join(process.cwd(), 'src')
const СУХО = process.argv.includes('--dry')

/** Файлы, где русские слова работают ключами, — их переводим руками. */
const ИСКЛЮЧЕНЫ = new Set([
  'i18n/index.ts', 'i18n/en.ts',
  'engine/parse.ts', 'state/defaults.ts', 'lib/catalog.ts',
  'lib/date.ts', 'lib/format.ts', 'lib/crypto.ts',
])

export const КИРИЛЛИЦА = /[а-яёѣіъѵА-ЯЁѢІѴ]/

/** Похоже на текст для человека, а не на внутренний признак. */
export function похожеНаТекст(s: string): boolean {
  const t = s.trim()
  if (!КИРИЛЛИЦА.test(t)) return false
  return /\s/.test(t) || /^[А-ЯЁѢІѴ]/.test(t) || /[.,:;!?…«»—–()]/.test(t)
}

const СЛУЖЕБНЫЕ_ВЫЗОВЫ = new Set([
  'includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'test', 'match', 'matchAll',
  'replace', 'replaceAll', 'split', 'search', 'localeCompare', 'get', 'has', 'set', 'delete',
  'getItem', 'setItem', 'removeItem', 'querySelector', 'querySelectorAll', 'closest', 'matches',
  'RegExp', 'require', 'plural', 'т', 'тр', 'тк', 'uid', 'log', 'warn', 'error', 'info', 'debug',
  'getPropertyValue', 'setProperty', 'removeProperty', 'dispatchEvent', 'addEventListener',
])
const СЛУЖЕБНЫЕ_АТРИБУТЫ = new Set(['value', 'key', 'className', 'id', 'name', 'type', 'accept', 'role', 'href', 'src', 'htmlFor', 'inputMode', 'autoComplete'])

const имяВызова = (e: ts.Expression): string =>
  ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ''

/** Строку в этом месте трогать нельзя — это не надпись, а часть логики. */
function служебноеМѣсто(node: ts.Node): boolean {
  const p = node.parent
  if (!p) return true
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true
  if (ts.isLiteralTypeNode(p)) return true
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p)) && p.name === node) return true
  if (ts.isComputedPropertyName(p)) return true
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true
  if (ts.isBinaryExpression(p) && [
    ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
  ].includes(p.operatorToken.kind)) return true
  if (ts.isCaseClause(p)) return true
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(node as ts.Expression)) {
    const имя = имяВызова(p.expression)
    if (СЛУЖЕБНЫЕ_ВЫЗОВЫ.has(имя)) return true
    // console.что-угодно
    if (ts.isPropertyAccessExpression(p.expression) && ts.isIdentifier(p.expression.expression) && p.expression.expression.text === 'console') return true
  }
  if (ts.isTaggedTemplateExpression(p)) return true
  return false
}

/** Строка в кавычках для исходника. */
const вКавычки = (s: string): string =>
  "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t') + "'"

/** Правила пробелов JSX — как у Babel: иначе перевод разошёлся бы с тем, что рисует React. */
export function очиститьJsxТекст(сырой: string): string {
  const lines = сырой.split(/\r\n|\n|\r/)
  let lastNonEmpty = 0
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i])) lastNonEmpty = i
  let str = ''
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t/g, ' ')
    if (i !== 0) line = line.replace(/^[ ]+/, '')
    if (i !== lines.length - 1) line = line.replace(/[ ]+$/, '')
    if (line) {
      if (i !== lastNonEmpty) line += ' '
      str += line
    }
  }
  return str
}

interface Отчётъ { обёрнуто: number; фразъ: number; пропущено: string[] }

export function переделать(текстъ: string, файлъ: string, отчётъ: Отчётъ): string {
  const sf = ts.createSourceFile(файлъ, текстъ, ts.ScriptTarget.Latest, true, файлъ.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

  const сырьё = (n: ts.Node) => текстъ.slice(n.getStart(sf), n.getEnd())

  function выход(node: ts.Node): string {
    // --- строка / шаблон без подстановок
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && КИРИЛЛИЦА.test(node.text)) {
      const p = node.parent
      if (p && ts.isJsxAttribute(p)) {
        const имя = p.name.getText(sf)
        if (СЛУЖЕБНЫЕ_АТРИБУТЫ.has(имя) || имя.startsWith('data-')) return сырьё(node)
        отчётъ.обёрнуто++
        return `{т(${вКавычки(node.text)})}`
      }
      if (служебноеМѣсто(node)) return сырьё(node)
      if (!похожеНаТекст(node.text)) {
        отчётъ.пропущено.push(`${файлъ}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}  ${node.text}`)
        return сырьё(node)
      }
      отчётъ.обёрнуто++
      return `т(${вКавычки(node.text)})`
    }

    // --- шаблон с подстановками
    if (ts.isTemplateExpression(node)) {
      const куски = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)]
      const естьТекстъ = куски.some((k) => КИРИЛЛИЦА.test(k))
      if (естьТекстъ && !служебноеМѣсто(node)) {
        let ключъ = node.head.text
        node.templateSpans.forEach((s, i) => { ключъ += `{${i}}` + s.literal.text })
        if (похожеНаТекст(ключъ.replace(/\{\d+\}/g, ' '))) {
          отчётъ.обёрнуто++
          const args = node.templateSpans.map((s) => выход(s.expression))
          return `т(${вКавычки(ключъ)}, ${args.join(', ')})`
        }
      }
    }

    // --- дети JSX: собираем фразы
    if (node.kind === ts.SyntaxKind.SyntaxList && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      return детиJsx(node as ts.SyntaxList)
    }

    return склеить(node)
  }

  /** Узел как есть, но с переделанными детьми. */
  function склеить(node: ts.Node): string {
    const дети = node.getChildren(sf)
    if (!дети.length) return сырьё(node)
    let итогъ = ''
    let позиція = node.getStart(sf)
    for (const д of дети) {
      const начало = д.getStart(sf)
      итогъ += текстъ.slice(позиція, начало)
      итогъ += выход(д)
      позиція = д.getEnd()
    }
    итогъ += текстъ.slice(позиція, node.getEnd())
    return итогъ
  }

  function детиJsx(список: ts.SyntaxList): string {
    const дети = список.getChildren(sf)
    let итогъ = ''
    let позиція = список.getStart(sf)
    let i = 0
    while (i < дети.length) {
      const д = дети[i]
      if (!ts.isJsxText(д) && !ts.isJsxExpression(д)) {
        итогъ += текстъ.slice(позиція, д.getStart(sf)) + выход(д)
        позиція = д.getEnd()
        i++
        continue
      }
      // собираем подряд идущие текст и вставки
      let j = i
      while (j < дети.length && (ts.isJsxText(дети[j]) || ts.isJsxExpression(дети[j]))) j++
      const кусок = дети.slice(i, j)
      const естьРусскій = кусок.some((к) => ts.isJsxText(к) && КИРИЛЛИЦА.test(к.text))
      const начало = кусок[0].getStart(sf)
      if (!естьРусскій) {
        // Русского текста в куске нет — переносим как есть, переделывая
        // только то, что внутри вставок {…}.
        итогъ += текстъ.slice(позиція, начало)
        let п2 = начало
        for (const к of кусок) {
          итогъ += текстъ.slice(п2, к.getStart(sf)) + выход(к)
          п2 = к.getEnd()
        }
        позиція = п2
        i = j
        continue
      }
      let ключъ = ''
      const args: string[] = []
      const примечанія: string[] = []
      for (const к of кусок) {
        if (ts.isJsxText(к)) {
          ключъ += очиститьJsxТекст(к.text)
        } else if (ts.isJsxExpression(к)) {
          if (!к.expression) {
            примечанія.push(сырьё(к))
            continue
          }
          ключъ += `{${args.length}}`
          args.push(выход(к.expression))
        }
      }
      итогъ += текстъ.slice(позиція, начало)
      const вызовъ = args.length ? `тр(${вКавычки(ключъ)}, ${args.join(', ')})` : `т(${вКавычки(ключъ)})`
      итогъ += примечанія.join('') + `{${вызовъ}}`
      отчётъ.фразъ++
      позиція = кусок[кусок.length - 1].getEnd()
      i = j
    }
    итогъ += текстъ.slice(позиція, список.getEnd())
    return итогъ
  }

  const ведущее = текстъ.slice(0, sf.getStart(sf))
  const тѣло = склеить(sf)
  const хвостъ = текстъ.slice(sf.getEnd())
  return ведущее + тѣло + хвостъ
}

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

/** Нужен ли файлу импорт т/тр — дописываем по факту употребления. */
function добавитьИмпорт(текстъ: string, отн: string): string {
  const нужны = ['т', 'тр'].filter((f) => new RegExp(`(^|[^\\wа-яё])${f}\\(`).test(текстъ))
  if (!нужны.length) return текстъ
  if (/from '(\.\.\/|\.\/)+i18n'/.test(текстъ)) return текстъ
  const глубина = отн.split('/').length - 1
  const путь = глубина === 0 ? './i18n' : '../'.repeat(глубина) + 'i18n'
  const строка = `import { ${нужны.join(', ')} } from '${путь}'\n`
  // после последнего импорта в начале файла
  const sf = ts.createSourceFile(отн, текстъ, ts.ScriptTarget.Latest, true)
  const импорты = sf.statements.filter((s) => ts.isImportDeclaration(s))
  if (!импорты.length) return строка + текстъ
  const послѣ = импорты[импорты.length - 1].getEnd()
  return текстъ.slice(0, послѣ) + '\n' + строка.trimEnd() + текстъ.slice(послѣ)
}

if (process.argv[1] && /i18n-obernut/.test(process.argv[1])) {
  const отчётъ: Отчётъ = { обёрнуто: 0, фразъ: 0, пропущено: [] }
  let файловъ = 0
  for (const отн of обойти(КОРЕНЬ)) {
    if (ИСКЛЮЧЕНЫ.has(отн)) continue
    const п = path.join(КОРЕНЬ, отн)
    const было = fs.readFileSync(п, 'utf8')
    if (!КИРИЛЛИЦА.test(было)) continue
    const доОбёртки = отчётъ.обёрнуто + отчётъ.фразъ
    let стало = переделать(было, отн, отчётъ)
    if (отчётъ.обёрнуто + отчётъ.фразъ === доОбёртки) continue
    стало = добавитьИмпорт(стало, отн)
    файловъ++
    if (!СУХО) fs.writeFileSync(п, стало)
  }
  console.log(`файлов ${файловъ}, строк обёрнуто ${отчётъ.обёрнуто}, фраз JSX ${отчётъ.фразъ}`)
  fs.writeFileSync(path.join(process.cwd(), 'node_modules/.cache/i18n-propuski.txt'), отчётъ.пропущено.join('\n'))
  console.log(`пропущено одиночных слов: ${отчётъ.пропущено.length} (список в node_modules/.cache/i18n-propuski.txt)`)
}
