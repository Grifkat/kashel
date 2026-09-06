// Сборка сайта: страница скачивания и браузерная версия рядом с ней.
// Запуск: npm run site -- имя/репозиторій
//
// Получается каталог _site:
//   _site/index.html   — страница скачивания
//   _site/app/         — сама программа, собранная для браузера
//
// Тем же скриптом пользуется рабочий процесс GitHub Pages. Это нарочно:
// повтори он ту же сборку у себя в yml, и две копии разошлись бы при первой
// правке, а обнаружилось бы это уже на опубликованном сайте.
//
// Имя репозитория подставляется вместо __REPO__. На GitHub оно приходит само
// через GITHUB_REPOSITORY, у себя — первым доводом.

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SITE = path.join(ROOT, 'site')
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(ROOT, '_site')

const умереть = (что) => { console.error(что); process.exit(1) }

const репо = process.argv[2] || process.env.GITHUB_REPOSITORY || ''
if (!репо) умереть('Не задано имя репозитория: npm run site -- имя/репозиторій')
if (!/^[\w.-]+\/[\w.-]+$/.test(репо)) умереть(`Имя репозитория не похоже на «имя/репозиторій»: ${репо}`)

if (!fs.existsSync(SITE)) умереть(`Нет каталога ${SITE}`)
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  умереть('Нет собранной браузерной версии. Соберите её: npm run build')
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
fs.cpSync(SITE, OUT, { recursive: true })
fs.cpSync(DIST, path.join(OUT, 'app'), { recursive: true })

// Подстановка идёт по всем html: страниц может стать больше одной.
let правлено = 0
for (const файлъ of найтиHtml(OUT)) {
  const было = fs.readFileSync(файлъ, 'utf8')
  const стало = было.split('__REPO__').join(репо)
  if (было !== стало) {
    fs.writeFileSync(файлъ, стало, 'utf8')
    правлено++
  }
}

// Jekyll на Pages выбрасывает каталоги с подчёркиванием — у сборщика такие бывают.
fs.writeFileSync(path.join(OUT, '.nojekyll'), '')

// Проверяем себя же: незамеченная подстановка означала бы битые ссылки на
// живом сайте, и увидел бы это первым не автор, а тот, кому дали ссылку.
const остатки = найтиHtml(OUT).filter((ф) => fs.readFileSync(ф, 'utf8').includes('__REPO__'))
if (остатки.length) умереть(`Осталось __REPO__ в: ${остатки.join(', ')}`)
if (!fs.existsSync(path.join(OUT, 'app', 'index.html'))) умереть('Браузерная версия не легла в _site/app')

console.log(`Сайт собран в ${OUT}`)
console.log(`  репозиторий: ${репо} (подставлен в ${правлено} стр.)`)
console.log(`  страница:    _site/index.html`)
console.log(`  программа:   _site/app/index.html`)

function найтиHtml(корень) {
  const итогъ = []
  for (const вход of fs.readdirSync(корень, { withFileTypes: true })) {
    const п = path.join(корень, вход.name)
    if (вход.isDirectory()) итогъ.push(...найтиHtml(п))
    else if (вход.name.endsWith('.html')) итогъ.push(п)
  }
  return итогъ
}
