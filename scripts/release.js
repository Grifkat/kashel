// Выпуск версии: собирает объявление об обновлении и подписывает его.
// Запуск: npm run release
//
// Что делает. Берёт версию из package.json, находит в release/ собранные
// установщики под Windows и Linux, считает их размер и контрольную сумму,
// складывает объявление update.json, подписывает его закрытым ключом и
// кладёт всё готовое в release/upload — этот каталог целиком выгружается
// на хостинг.
//
// Почему подпись отдельным файлом, а не полем внутри JSON. Подписывать надо
// ровно те байты, которые потом проверяются. Поле внутри пришлось бы перед
// проверкой вырезать и собирать JSON заново, а пересборка меняет порядок
// полей и пробелы — подпись перестала бы сходиться на ровном месте.
//
// Описание к версии берётся из первого довода или из RELEASE.md, если он есть:
//   npm run release -- "Проектные счета и кнопка обновления"

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const RELEASE = path.join(ROOT, 'release')
const UPLOAD = path.join(RELEASE, 'upload')
const ЗАКРЫТЫЙ = path.join(os.homedir(), '.kashel-release-key.pem')

const { version } = require(path.join(ROOT, 'package.json'))
const { АДРЕСЪ_ПО_УМОЛЧАНІЮ } = require(path.join(ROOT, 'electron', 'updatekey.js'))

const умереть = (что) => { console.error(что); process.exit(1) }

if (!fs.existsSync(ЗАКРЫТЫЙ)) умереть(`Нет закрытого ключа: ${ЗАКРЫТЫЙ}\nЗаведите его: npm run keygen -- https://ваш-сайт/обновления`)
if (/example\.invalid/.test(АДРЕСЪ_ПО_УМОЛЧАНІЮ)) умереть('Адрес обновлений не задан: npm run keygen -- https://ваш-сайт/обновления')

const база = АДРЕСЪ_ПО_УМОЛЧАНІЮ.replace(/\/+$/, '')

/*
 * Что собрано и под каким именем это выкладывать.
 *
 * Слева — имя, которое даёт electron-builder: русское, с пробелом, удобное
 * человѣку, когда файл лежит в «Загрузках». Справа — имя для сети, только
 * латиница и дефисы.
 *
 * Разница не придирка. Пробел в ссылке превращается в %20, кириллица — в
 * длинную кашу из процентов, а GitHub Releases вдобавок сам переименовывает
 * вложения, заменяя пробелы точками: ссылка в объявлении перестала бы
 * совпадать с тем, что лежит на сервере, и обновление ломалось бы молча.
 */
const ЦѢЛИ = [
  { родъ: 'win', файлъ: `Кошель ${version} установщик.exe`, имя: `Koshel-${version}-setup.exe` },
  { родъ: 'linux', файлъ: `Koshel-${version}-x86_64.AppImage`, имя: `Koshel-${version}-x86_64.AppImage` },
]

const files = {}
fs.rmSync(UPLOAD, { recursive: true, force: true })
fs.mkdirSync(UPLOAD, { recursive: true })

for (const ц of ЦѢЛИ) {
  const путь = path.join(RELEASE, ц.файлъ)
  if (!fs.existsSync(путь)) {
    console.warn(`  пропускаю ${ц.родъ}: нет ${ц.файлъ}`)
    continue
  }
  const данныя = fs.readFileSync(путь)
  files[ц.родъ] = {
    url: `${база}/${ц.имя}`,
    size: данныя.length,
    sha256: crypto.createHash('sha256').update(данныя).digest('hex'),
  }
  fs.copyFileSync(путь, path.join(UPLOAD, ц.имя))
  console.log(`  ${ц.родъ}: ${ц.имя} · ${(данныя.length / 1024 / 1024).toFixed(1)} МБ`)
}

if (!Object.keys(files).length) умереть('Не найдено ни одного установщика. Соберите их: npm run dist и npm run dist:appimage')

const notes = process.argv[2] || читатьЗамѣтки()

const объявленіе = JSON.stringify({
  version,
  date: new Date().toISOString().slice(0, 10),
  notes,
  files,
}, null, 2)

// Подписываются именно эти байты — тот же буфер уходит в файл.
const байты = Buffer.from(объявленіе, 'utf8')
const ключ = crypto.createPrivateKey(fs.readFileSync(ЗАКРЫТЫЙ))
const подпись = crypto.sign(null, байты, ключ).toString('base64')

fs.writeFileSync(path.join(UPLOAD, 'update.json'), байты)
fs.writeFileSync(path.join(UPLOAD, 'update.json.sig'), подпись + '\n', 'utf8')

// Себя же и проверяем: подписать и не суметь проверить — обычная беда,
// и обнаружиться она должна здесь, а не на машине приятеля.
const открытый = crypto.createPublicKey(ключ).export({ format: 'der', type: 'spki' }).toString('base64')
const { подписьВѣрна } = require(path.join(ROOT, 'electron', 'update.js'))
if (!подписьВѣрна(байты, подпись, открытый)) умереть('Подпись не проверяется собственным ключом — выпуск отменён')

console.log('')
console.log(`Версия ${version} готова к выкладке.`)
console.log(`Выложите содержимое ${UPLOAD}`)
console.log(`по адресу ${база}/`)
console.log('')
console.log('Проверить, что выложилось верно:')
console.log(`  ${база}/update.json`)
console.log(`  ${база}/update.json.sig`)

function читатьЗамѣтки() {
  const p = path.join(ROOT, 'RELEASE.md')
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim().slice(0, 2000) : ''
}
