import { адресОблака, облако, облакоЕсть, type Облако } from './cloudconfig'

/*
 * Тонкий клиент к Supabase на обычном fetch.
 *
 * Своими руками, а не готовой библиотекой, по трём причинам, и все три
 * стоят того. Программа не тащит чужой код внутрь себя — это правило здѣсь
 * с самого начала. Сообщения об ошибках выходят русскими, а не «Failed to
 * fetch». И видно, что именно уходит на сервер: для затеи, где сервер не
 * должен знать содержимого, это не мелочь.
 *
 * Пользуемся двумя частями Supabase. Auth заводит и пускает; REST хранит
 * строки. Обе — обычный HTTP, никакой особой обвязки им не нужно.
 *
 * Отдельно стоит помнить: ключ anon уходит в каждый запрос и публичен. Всё,
 * что защищает данные, живёт в правилах доступа самой базы — см. schema.sql.
 */

export interface Сеансъ {
  токенъ: string
  обновленіе: string
  /** Когда истекает, в миллисекундах эпохи. */
  доКогда: number
  id: string
  почта: string
}

const ОКНО = 60_000

/** Сеансъ пора обновлять: истёк или истечёт в ближайшую минуту. */
export const сеансъСвѣжъ = (с: Сеансъ | null): boolean =>
  !!с && с.доКогда - ОКНО > Date.now()

async function запросъ(
  путь: string,
  настройки: RequestInit & { токенъ?: string } = {},
  о: Облако = облако,
): Promise<Response> {
  const { токенъ, headers, ...прочее } = настройки
  const шапка: Record<string, string> = {
    apikey: о.anonKey,
    Authorization: 'Bearer ' + (токенъ || о.anonKey),
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  }
  try {
    return await fetch(адресОблака(путь, о), { ...прочее, headers: шапка })
  } catch (e) {
    throw new Error('сервер недоступен: ' + (e as Error).message)
  }
}

/**
 * Разбор ответа с внятной причиной.
 *
 * Supabase кладёт причину то в error_description, то в msg, то в message —
 * перебираем все, иначе человѣку достаётся голый номер ошибки.
 */
async function ответъ(r: Response): Promise<unknown> {
  const текстъ = await r.text()
  let тѣло: unknown = null
  try { тѣло = текстъ ? JSON.parse(текстъ) : null } catch { тѣло = текстъ }
  if (r.ok) return тѣло
  const т = тѣло as Record<string, unknown> | null
  const причина =
    (т?.error_description as string) ||
    (т?.msg as string) ||
    (т?.message as string) ||
    (typeof тѣло === 'string' && тѣло) ||
    `сервер ответил ${r.status}`
  throw new Error(попонятнѣе(String(причина), r.status))
}

/**
 * Английские отговорки Supabase — по-русски.
 *
 * Не украшение: «Invalid login credentials» человѣкъ прочтёт как «что-то
 * сломалось», а не как «пароль не тот», и полезет чинить не то.
 */
function попонятнѣе(причина: string, кодъ: number): string {
  const п = причина.toLowerCase()
  if (п.includes('invalid login credentials')) return 'не подходит почта или пароль'
  if (п.includes('already registered') || п.includes('already been registered')) {
    return 'на эту почту уже заведена запись — войдите'
  }
  if (п.includes('email not confirmed')) return 'почта не подтверждена — проверьте письмо'
  if (п.includes('password should be')) return 'пароль слишком короткий'
  if (п.includes('rate limit') || кодъ === 429) return 'слишком часто — подождите минуту'
  if (п.includes('row-level security')) return 'сервер не дал записать: нет приглашения'
  return причина
}

const собрать = (д: Record<string, unknown>, почта: string): Сеансъ => ({
  токенъ: String(д.access_token ?? ''),
  обновленіе: String(д.refresh_token ?? ''),
  доКогда: Date.now() + Number(д.expires_in ?? 3600) * 1000,
  id: String((д.user as Record<string, unknown> | undefined)?.id ?? ''),
  почта,
})

/** Завести запись. Пароль сюда идёт уже выведенный, настоящего сервер не видит. */
export async function завести(почта: string, пароль: string, о: Облако = облако): Promise<Сеансъ | null> {
  const д = (await ответъ(
    await запросъ('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: почта, password: пароль }) }, о),
  )) as Record<string, unknown>
  // Без сеанса — значит включено подтверждение почты: запись создана, войти
  // можно будет после письма. Молчать об этом нельзя, отсюда null.
  return д.access_token ? собрать(д, почта) : null
}

export async function войти(почта: string, пароль: string, о: Облако = облако): Promise<Сеансъ> {
  const д = (await ответъ(
    await запросъ('/auth/v1/token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email: почта, password: пароль }),
    }, о),
  )) as Record<string, unknown>
  return собрать(д, почта)
}

export async function обновить(с: Сеансъ, о: Облако = облако): Promise<Сеансъ> {
  const д = (await ответъ(
    await запросъ('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: с.обновленіе }),
    }, о),
  )) as Record<string, unknown>
  return собрать(д, с.почта)
}

export async function выйти(с: Сеансъ, о: Облако = облако): Promise<void> {
  try {
    await запросъ('/auth/v1/logout', { method: 'POST', токенъ: с.токенъ }, о)
  } catch {
    // Сеть могла отвалиться. Местный выход всё равно состоится: держать
    // человѣка внутри из-за недоступного сервера — худшее, что можно сделать.
  }
}

/**
 * Занять приглашение. false — код не подошёл или уже занят.
 *
 * Списка кодов клиент не видит и видеть не может: таблица закрыта наглухо,
 * а эта функция на сервере отвечает только «да» или «нет».
 */
export async function занятьПриглашеніе(с: Сеансъ, кодъ: string, о: Облако = облако): Promise<boolean> {
  const д = await ответъ(
    await запросъ('/rest/v1/rpc/claim_invite', {
      method: 'POST', токенъ: с.токенъ, body: JSON.stringify({ invite_code: кодъ.trim().toUpperCase() }),
    }, о),
  )
  return д === true
}

// ------------------------------------------------------------ строки файлов

export interface Строка {
  path_id: string
  blob: string
  version: number
  updated_at: string
}

export async function всеСтроки(с: Сеансъ, о: Облако = облако): Promise<Строка[]> {
  return (await ответъ(
    await запросъ('/rest/v1/files?select=path_id,blob,version,updated_at', { токенъ: с.токенъ }, о),
  )) as Строка[]
}

export async function однаСтрока(с: Сеансъ, ярлыкъ: string, о: Облако = облако): Promise<Строка | null> {
  const д = (await ответъ(
    await запросъ(
      `/rest/v1/files?select=path_id,blob,version,updated_at&path_id=eq.${ярлыкъ}`,
      { токенъ: с.токенъ }, о,
    ),
  )) as Строка[]
  return д[0] ?? null
}

/**
 * Записать строку.
 *
 * Слияние по ключу (user_id, path_id): вторая запись того же файла не создаёт
 * дубля, а заменяет прежнюю. Счётчик правок растит сервер... вернее, растим
 * мы, но от того значения, что прочли, — расхождения разбираются выше, в
 * слое синхронизации.
 */
export async function записатьСтроку(
  с: Сеансъ, ярлыкъ: string, комъ: string, версія: number, о: Облако = облако,
): Promise<void> {
  await ответъ(
    await запросъ('/rest/v1/files', {
      method: 'POST',
      токенъ: с.токенъ,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: с.id, path_id: ярлыкъ, blob: комъ, version: версія, updated_at: new Date().toISOString(),
      }),
    }, о),
  )
}

export async function удалитьСтроку(с: Сеансъ, ярлыкъ: string, о: Облако = облако): Promise<void> {
  await ответъ(
    await запросъ(`/rest/v1/files?path_id=eq.${ярлыкъ}`, { method: 'DELETE', токенъ: с.токенъ }, о),
  )
}

export { облакоЕсть }
