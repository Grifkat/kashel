import type { Ключи } from '../lib/crypto'
import { облачноеХранилище } from './cloud'
import type { Сеансъ } from './supabase'
import { browserBridge, type Bridge } from './vault'

/*
 * Облачный мост: то же лицо, что у папки на диске и у браузера.
 *
 * Хранение уходит в сеть, всё остальное остаётся браузерным. Разделение
 * простое и держится на одном вопросе: относится ли действие к хранилищу.
 * Чтение, запись, список, переименование — да, туда. Выгрузка файла на диск,
 * выбор картинки — нет, это разговор с самим браузером, серверу там делать
 * нечего.
 *
 * Двоичные вложения (фото чеков) идут тем же путём, что и текст: они и так
 * лежат основаниями 64, а шифруются как всё прочее.
 */

export interface ОблачныйМостъ extends Bridge {
  /** Почта вошедшего — её показывают в настройках. */
  почта: string
}

export function облачныйМостъ(сеансъ: Сеансъ, ключи: Ключи): ОблачныйМостъ {
  const х = облачноеХранилище(сеансъ, ключи)

  return {
    ...browserBridge,

    vaultPath: async () => `облако · ${сеансъ.почта}`,
    почта: сеансъ.почта,

    read: (rel: string) => х.read(rel),
    write: (rel: string, data: string) => х.write(rel, data),
    remove: (rel: string) => х.remove(rel),
    list: (rel: string, ext?: string) => х.list(rel, ext),

    async rename(from: string, to: string) {
      const было = await х.read(from)
      if (было == null) return false
      await х.write(to, было)
      await х.remove(from)
      return true
    },

    // Вложения: тот же ком, только помечаем при чтении, чтобы картинка
    // показалась. Разбирать настоящий вид файла ради этого незачем — все
    // вложения в программе и так изображения.
    async writeBinary(rel: string, base64: string) {
      await х.write(rel, base64)
      return rel
    },
    async readBinary(rel: string) {
      const в = await х.read(rel)
      return в ? `data:image/png;base64,${в}` : null
    },
  }
}
