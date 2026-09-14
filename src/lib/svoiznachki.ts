/*
 * Свои значки — картинки, загруженные человеком, для категорий, счетов и целей.
 *
 * Картинка обрезается по центру в квадрат, ужимается до 128 точек и кладётся
 * в хранилище как PNG в папку icons/. Через мост, как и всё остальное, —
 * поэтому значок оказывается там же, где данные: в папке на диске, в
 * браузере или в облаке, зашифрованным. И переезжает вместе с архивом.
 *
 * В поле icon пишется «file:icons/имя.png». Приставка отличает загруженный
 * значок и от значка из каталога («shopping-basket»), и от старого эмодзи.
 *
 * SVG тоже растеризуется, а не хранится как есть: SVG — это разметка, и в ней
 * бывают скрипты. Картинка из пикселей ничего выполнить не может.
 */
import { useEffect, useState } from 'react'
import { bridge } from '../state/vault'
import { т } from '../i18n'

export const ПРИСТАВКА = 'file:'
export const ПАПКА_ЗНАЧКОВЪ = 'icons'
/** Сторона готового значка. Аватар в программе не крупнее 54 точек; 128 — с запасом под экраны Retina. */
export const СТОРОНА = 128
/** Больше этого исходник не берём: фотография в 40 МБ ради значка — ошибка, а не значок. */
export const ПРЕДѢЛЪ_БАЙТЪ = 8 * 1024 * 1024

export const этоСвойЗначокъ = (icon: string | undefined): icon is string => !!icon && icon.startsWith(ПРИСТАВКА)
export const путьЗначка = (icon: string): string => icon.slice(ПРИСТАВКА.length)

/**
 * Куда вписать квадрат: обрезка по центру по короткой стороне. Отдельной
 * функцией — чтобы проверить арифметику без холста, которого нет в тестах.
 */
export function квадратъ(w: number, h: number): { sx: number; sy: number; s: number } {
  const s = Math.min(w, h)
  return { sx: Math.round((w - s) / 2), sy: Math.round((h - s) / 2), s }
}

/** Путь в хранилище допустим для значка: одна папка, безопасное имя, PNG. */
export const путьЗначкаДопустимъ = (rel: string): boolean =>
  /^icons\/[\w-]+\.png$/.test(rel) && !rel.includes('..')

/**
 * Файл → PNG 128×128 в base64 (без приставки data:).
 * Бросает понятную ошибку, если файл не картинка или слишком велик.
 */
export async function подготовитьЗначокъ(файлъ: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(файлъ.type)) {
    throw new Error(т('Нужна картинка: PNG, JPG, WebP, GIF или SVG.'))
  }
  if (файлъ.size > ПРЕДѢЛЪ_БАЙТЪ) {
    throw new Error(т('Картинка больше 8 МБ — для значка это слишком. Уменьшите её и попробуйте снова.'))
  }
  const url = await new Promise<string>((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => fail(new Error(т('Файл не прочитался.')))
    r.readAsDataURL(файлъ)
  })
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => fail(new Error(т('Картинка не открылась — возможно, файл повреждён.')))
    i.src = url
  })
  // У SVG без заданных размеров naturalWidth бывает 0 — тогда рисуем квадратом.
  const w = img.naturalWidth || СТОРОНА
  const h = img.naturalHeight || СТОРОНА
  const { sx, sy, s } = квадратъ(w, h)
  const холстъ = document.createElement('canvas')
  холстъ.width = СТОРОНА
  холстъ.height = СТОРОНА
  const ctx = холстъ.getContext('2d')
  if (!ctx) throw new Error(т('Не удалось подготовить картинку.'))
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, s, s, 0, 0, СТОРОНА, СТОРОНА)
  const png = холстъ.toDataURL('image/png')
  return png.slice(png.indexOf('base64,') + 7)
}

/** Кладёт готовый PNG в хранилище и возвращает значение для поля icon. */
export async function сохранитьЗначокъ(base64: string): Promise<string> {
  const имя = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  const rel = `${ПАПКА_ЗНАЧКОВЪ}/${имя}.png`
  await bridge.writeBinary(rel, base64)
  кэшъ.delete(ПРИСТАВКА + rel)
  return ПРИСТАВКА + rel
}

/** Все загруженные значки — чтобы один значок можно было дать нескольким категориям. */
export async function списокЗначковъ(): Promise<string[]> {
  const files = await bridge.list(ПАПКА_ЗНАЧКОВЪ)
  return files
    .filter((f) => f.endsWith('.png'))
    .map((f) => `${ПРИСТАВКА}${ПАПКА_ЗНАЧКОВЪ}/${f}`)
    .sort()
}

/*
 * Картинки читаются из хранилища один раз и держатся в памяти: значок одной
 * категории рисуется в десятке мест разом — список, пончик, окно операции,
 * — и каждый раз ходить за ним на диск или в облако незачем.
 */
const кэшъ = new Map<string, Promise<string | null>>()

export function прочестьЗначокъ(icon: string): Promise<string | null> {
  let п = кэшъ.get(icon)
  if (!п) {
    п = bridge.readBinary(путьЗначка(icon)).catch(() => null)
    кэшъ.set(icon, п)
  }
  return п
}

/** Сбросить память — после смены хранилища или замены всего содержимого. */
export const забытьЗначки = () => кэшъ.clear()

export function useСвойЗначокъ(icon: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!этоСвойЗначокъ(icon)) {
      setUrl(null)
      return
    }
    let живо = true
    void прочестьЗначокъ(icon).then((u) => { if (живо) setUrl(u) })
    return () => { живо = false }
  }, [icon])
  return url
}
