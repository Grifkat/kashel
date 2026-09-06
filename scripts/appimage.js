// Сборка AppImage на Windows.
//
// Почему вручную. AppImage — это не «формат установщика», а два склеенных
// куска: ELF-заголовок (runtime) и образ squashfs с приложением внутри.
// electron-builder собрать его на Windows не может — ему нужен mksquashfs,
// которого он под Windows не поставляет. Но оба куска добываются и здесь:
// runtime берётся готовым из репозитория AppImage, squashfs делает
// gensquashfs.exe из squashfs-tools-ng. Дальше — простая склейка файлов.
//
// Отдельная выгода этого пути: права внутри образа задаются списком, а не
// берутся с диска. На Windows бита «исполняемый» нет вовсе, и tar.gz-сборка
// теряла его на всех файлах; здесь он проставляется явно и наверняка.
//
// Запуск: npm run dist:appimage

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'appimage')
const GEN = path.join(CACHE, 'tools', 'squashfs-tools-ng-1.3.2-mingw64', 'bin', 'gensquashfs.exe')
const RDS = path.join(CACHE, 'tools', 'squashfs-tools-ng-1.3.2-mingw64', 'bin', 'rdsquashfs.exe')
const RUNTIME = path.join(CACHE, 'runtime-x86_64')
const SRC = path.join(ROOT, 'release', 'linux-unpacked')
const APPDIR = path.join(CACHE, 'Koshel.AppDir')
const SQFS = path.join(CACHE, 'koshel.squashfs')

const APP_ID = 'koshel'
const APP_NAME = 'Кошель'
const version = require(path.join(ROOT, 'package.json')).version
const OUT = path.join(ROOT, 'release', `Koshel-${version}-x86_64.AppImage`)

const нужен = (p, что) => {
  if (!fs.existsSync(p)) { console.error(`Нет ${что}: ${p}`); process.exit(1) }
}
нужен(GEN, 'gensquashfs.exe')
нужен(RUNTIME, 'runtime-x86_64')
нужен(SRC, 'сборки linux-unpacked (соберите её: npm run dist:linux)')

// ------------------------------------------------------------------ AppDir
console.log('== собираю AppDir ==')
fs.rmSync(APPDIR, { recursive: true, force: true })
fs.mkdirSync(APPDIR, { recursive: true })
fs.cpSync(SRC, APPDIR, { recursive: true })

/*
 * AppRun — точка входа. Именно его запускает runtime после того, как
 * примонтирует образ.
 *
 * --no-sandbox здесь обязателен: песочнице Chromium нужен setuid-root, а
 * внутри AppImage файлы монтируются без него в принципе. Без этого ключа
 * программа не откроется на большинстве систем.
 *
 * Перевод строки только \n: с \r\n ядро не найдёт интерпретатор и выдаст
 * «bad interpreter».
 */
const APPRUN = [
  '#!/bin/sh',
  'HERE=$(dirname "$(readlink -f "$0")")',
  'export LD_LIBRARY_PATH="$HERE:$LD_LIBRARY_PATH"',
  `exec "$HERE/${APP_ID}" --no-sandbox "$@"`,
  '',
].join('\n')
fs.writeFileSync(path.join(APPDIR, 'AppRun'), APPRUN, { encoding: 'utf8' })

// Ярлык обязан лежать в корне AppDir — по нему система читает имя и значок.
const DESKTOP = [
  '[Desktop Entry]',
  'Type=Application',
  `Name=${APP_NAME}`,
  'Comment=Учёт денег: счета, бюджет, прогноз, задачи и заметки',
  `Exec=${APP_ID} %f`,
  `Icon=${APP_ID}`,
  'Terminal=false',
  'Categories=Office;Finance;',
  'MimeType=application/x-kashel;',
  `StartupWMClass=${APP_NAME}`,
  '',
].join('\n')
fs.writeFileSync(path.join(APPDIR, `${APP_ID}.desktop`), DESKTOP, { encoding: 'utf8' })

const icon = path.join(ROOT, 'build', 'icon.png')
нужен(icon, 'иконки build/icon.png (сделайте её: npm run icon)')
fs.copyFileSync(icon, path.join(APPDIR, `${APP_ID}.png`))
// .DirIcon — то же изображение под именем, которое ищут файловые менеджеры.
fs.copyFileSync(icon, path.join(APPDIR, '.DirIcon'))

// ------------------------------------------------------- список с правами
/*
 * Права задаём перечислением, а не берём с диска: на Windows их попросту нет.
 * Исполняемыми делаем ровно то, что должно запускаться и подгружаться, —
 * остальное лежит доступным на чтение.
 */
const ИСПОЛНЯЕМЫЕ = new Set(['AppRun', APP_ID, 'chrome_crashpad_handler', 'chrome-sandbox'])
const исполняемый = (rel) =>
  ИСПОЛНЯЕМЫЕ.has(rel) || /\.so(\.\d+)*$/.test(rel) || rel.endsWith('.bin')

const строки = []
const обход = (dir, prefix) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) {
      строки.push(`dir /${rel} 0755 0 0`)
      обход(path.join(dir, e.name), rel)
    } else if (e.isFile()) {
      строки.push(`file /${rel} ${исполняемый(rel) ? '0755' : '0644'} 0 0 ${rel}`)
    }
  }
}
обход(APPDIR, '')

const PACK = path.join(CACHE, 'pack.txt')
// Перевод строки \n: список читает линуксовая логика разбора.
fs.writeFileSync(PACK, строки.join('\n') + '\n', { encoding: 'utf8' })
const испол = строки.filter((s) => s.startsWith('file') && s.includes(' 0755 ')).length
console.log(`   записей: ${строки.length}, из них исполняемых файлов: ${испол}`)

// ---------------------------------------------------------------- squashfs
/*
 * gzip и блок в 128 КиБ — то же, что кладёт официальный appimagetool.
 * Отступать тут незачем: другие упаковщики поддержаны не везде, а AppImage
 * должен открываться на любой машине, а не на подготовленной.
 */
console.log('== пакую squashfs ==')
fs.rmSync(SQFS, { force: true })
execFileSync(GEN, [
  '--pack-dir', APPDIR,
  '--pack-file', PACK,
  '--compressor', 'gzip',
  '--block-size', '131072',
  '--all-root',
  '--force',
  SQFS,
], { stdio: 'inherit' })

// ----------------------------------------------------------------- склейка
console.log('== склеиваю ==')
fs.rmSync(OUT, { force: true })
fs.writeFileSync(OUT, Buffer.concat([fs.readFileSync(RUNTIME), fs.readFileSync(SQFS)]))

// ---------------------------------------------------------------- проверка
console.log('== проверяю ==')
const head = Buffer.alloc(12)
const fd = fs.openSync(OUT, 'r')
fs.readSync(fd, head, 0, 12, 0)
fs.closeSync(fd)
const elf = head[0] === 0x7f && head.subarray(1, 4).toString() === 'ELF'
const ai2 = head[8] === 0x41 && head[9] === 0x49 && head[10] === 0x02
console.log(`   ELF: ${elf ? 'да' : 'НЕТ'} · метка AppImage type 2: ${ai2 ? 'да' : 'НЕТ'}`)

// Читаем образ обратно и смотрим, какие права легли на самом деле.
const список = execFileSync(RDS, ['--list', '/', SQFS], { encoding: 'utf8' })
const проверить = (имя) => {
  const строка = список.split(/\r?\n/).find((l) => l.includes(имя) && !l.includes('/' + имя + '/'))
  console.log(`   ${имя}: ${строка ? строка.trim() : 'НЕ НАЙДЕН'}`)
}
проверить('AppRun')
проверить(APP_ID + '.desktop')
проверить(APP_ID + '.png')

console.log()
console.log('готово: ' + OUT)
console.log('размер: ' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + ' МБ')
