// Иконка программы и файлов .kashel. Рисуется здесь, а не лежит картинкой:
// готовых иконок в проекте нет, а установщику и связи расширения нужен .ico.
// Linux-сборке нужен PNG — он пишется тем же рисунком, чтобы иконка на двух
// системах не разъехалась.
//
// Мотив тот же, что у дашборда, — бублик: кольцо акцентного цвета на тёмном
// скруглённом квадрате. Внутри .ico лежат обычные несжатые DIB, поэтому
// никаких зависимостей не нужно.
//
// Запуск: npm run icon (пересобирать только если меняется сам рисунок)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'

const SIZES = [16, 24, 32, 48, 64, 128, 256]

/** Фон окна программы — иконка должна выглядеть её продолжением. */
const BG = [0x1e, 0x1e, 0x1e]
const RING = [0x4c, 0xc4, 0x6a]

type RGB = readonly [number, number, number] | number[]

/** Насколько точка внутри скруглённого квадрата: 1 внутри, 0 снаружи. */
function inRoundedSquare(x: number, y: number, size: number, radius: number): number {
  const inset = size * 0.02
  const lo = inset
  const hi = size - inset
  const cx = Math.min(Math.max(x, lo + radius), hi - radius)
  const cy = Math.min(Math.max(y, lo + radius), hi - radius)
  const d = Math.hypot(x - cx, y - cy)
  return d <= radius ? 1 : 0
}

/** Кольцо: между внутренним и внешним радиусом. */
function inRing(x: number, y: number, size: number): number {
  const c = size / 2
  const d = Math.hypot(x - c, y - c)
  const outer = size * 0.34
  const inner = size * 0.19
  return d <= outer && d >= inner ? 1 : 0
}

const mix = (a: RGB, b: RGB, t: number): number[] =>
  [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t))

/**
 * Один слой иконки в виде DIB: BGRA снизу вверх, как того требует формат.
 * Сглаживание — усреднением по сетке 4×4 внутри пикселя.
 */
function renderDib(size: number): Buffer {
  const SS = 4
  const radius = size * 0.22
  const pixels = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0
      let ring = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          bg += inRoundedSquare(px, py, size, radius)
          ring += inRing(px, py, size)
        }
      }
      const total = SS * SS
      const alpha = bg / total
      const ringShare = Math.min(1, (ring / total) / Math.max(alpha, 0.001))
      const color = mix(BG, RING, ringShare)
      // Строки DIB идут снизу вверх.
      const at = ((size - 1 - y) * size + x) * 4
      pixels[at] = color[2]
      pixels[at + 1] = color[1]
      pixels[at + 2] = color[0]
      pixels[at + 3] = Math.round(alpha * 255)
    }
  }

  // BITMAPINFOHEADER: высота удвоена — формат ждёт цвет и маску прозрачности.
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(pixels.length, 20)

  // Маска прозрачности не используется (её заменяет альфа), но место под неё
  // обязано быть: строки по 4 байта.
  const maskRow = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskRow * size)

  return Buffer.concat([header, pixels, mask])
}

function buildIco(sizes: number[]): Buffer {
  const images = sizes.map(renderDib)
  const dir = Buffer.alloc(6 + images.length * 16)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2)
  dir.writeUInt16LE(images.length, 4)

  let offset = dir.length
  images.forEach((img, i) => {
    const at = 6 + i * 16
    const size = sizes[i]
    dir.writeUInt8(size >= 256 ? 0 : size, at)
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1)
    dir.writeUInt8(0, at + 2)
    dir.writeUInt8(0, at + 3)
    dir.writeUInt16LE(1, at + 4)
    dir.writeUInt16LE(32, at + 6)
    dir.writeUInt32LE(img.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += img.length
  })

  return Buffer.concat([dir, ...images])
}

/*
 * PNG для Linux-сборки.
 *
 * Пишется вручную, без библиотек: в проекте нет ни одной сторонней зависимости
 * времени выполнения, и заводить её ради одной картинки — плохой размен. Формат
 * простой: подпись, IHDR, сжатые zlib строки пикселей и IEND, у каждого куска
 * своя контрольная сумма.
 */
const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf: Buffer): number => {
    let c = -1
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

/** Тот же рисунок, что в .ico, но строками сверху вниз и в RGBA. */
function buildPng(size: number): Buffer {
  const dib = renderDib(size)
  const pixels = dib.subarray(40, 40 + size * size * 4)
  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const at = y * (1 + size * 4)
    raw[at] = 0 // фильтр «без фильтра»
    for (let x = 0; x < size; x++) {
      // В DIB строки снизу вверх и порядок BGRA — разворачиваем и то и другое.
      const from = ((size - 1 - y) * size + x) * 4
      const to = at + 1 + x * 4
      raw[to] = pixels[from + 2]
      raw[to + 1] = pixels[from + 1]
      raw[to + 2] = pixels[from]
      raw[to + 3] = pixels[from + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // бит на канал
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Путь считаем от корня проекта: скрипт запускается собранным в кэш, и
// __dirname указывал бы внутрь node_modules.
const out = join(process.cwd(), 'build', 'icon.ico')
mkdirSync(dirname(out), { recursive: true })
const ico = buildIco(SIZES)
writeFileSync(out, ico)
console.log(`${out} — ${SIZES.join(', ')} px, ${(ico.length / 1024).toFixed(0)} КБ`)

/*
 * ICNS для macOS.
 *
 * Внутри — те же PNG, что и для Linux, только сложенные в оболочку Apple:
 * подпись «icns», общая длина, а дальше куски, у каждого четырёхбуквенный
 * тип, длина вместе с заголовком и сами данные. Современная macOS читает
 * PNG-куски напрямую, поэтому ни iconutil, ни сторонних библиотек не нужно —
 * а значит, иконку можно собрать и на Windows, где мака под рукой нет.
 *
 * Размеры перечислены парами: обычный и удвоенный для экранов Retina. Без
 * удвоенных macOS растянет мелкий рисунок, и кольцо поплывёт.
 */
const ICNS: [string, number][] = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32],
  ['ic12', 64],
  ['ic07', 128],
  ['ic13', 256],
  ['ic08', 256],
  ['ic14', 512],
  ['ic09', 512],
  ['ic10', 1024],
]

function buildIcns(): Buffer {
  // Рисунок одного размера считается один раз: 1024 px с четырёхкратным
  // сглаживанием — это шестнадцать миллионов проб, повторять их незачѣмъ.
  const кэшъ = new Map<number, Buffer>()
  const png = (n: number): Buffer => {
    const было = кэшъ.get(n)
    if (было) return было
    const б = buildPng(n)
    кэшъ.set(n, б)
    return б
  }

  const куски = ICNS.map(([тип, размѣръ]) => {
    const тѣло = png(размѣръ)
    const глава = Buffer.alloc(8)
    глава.write(тип, 0, 'ascii')
    глава.writeUInt32BE(8 + тѣло.length, 4)
    return Buffer.concat([глава, тѣло])
  })

  const всего = 8 + куски.reduce((с, к) => с + к.length, 0)
  const глава = Buffer.alloc(8)
  глава.write('icns', 0, 'ascii')
  глава.writeUInt32BE(всего, 4)
  return Buffer.concat([глава, ...куски])
}

const icns = buildIcns()
const icnsOut = join(process.cwd(), 'build', 'icon.icns')
writeFileSync(icnsOut, icns)
console.log(`${icnsOut} — ${[...new Set(ICNS.map(([, n]) => n))].join(', ')} px, ${(icns.length / 1024).toFixed(0)} КБ`)

// electron-builder требует для Linux не меньше 512 px.
const png = buildPng(512)
const pngOut = join(process.cwd(), 'build', 'icon.png')
writeFileSync(pngOut, png)
console.log(`${pngOut} — 512 px, ${(png.length / 1024).toFixed(0)} КБ`)
