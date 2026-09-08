/*
 * Разговор с моделью, которая работает на этой же машине.
 *
 * Ollama слушает localhost:11434 и говорит обычным HTTP. Своей библиотеки ей
 * не нужно — здѣсь один fetch, как и у облака.
 *
 * Наружу не уходит ничего. Это не оговорка ради красного словца: обещание
 * «данные никуда не отправляются» написано на странице скачивания и в
 * настройках, и удалённый разбор трат его отменял бы. Поэтому адрес прибит к
 * localhost и полем в настройках не делается — чтобы его нельзя было
 * незаметно переставить на чужой сервер.
 */

const АДРЕСЪ = 'http://127.0.0.1:11434'
const ЖДАТЬ_СПИСОКЪ = 4000

export interface Модель {
  имя: string
  /** Размер на диске в байтах — по нему видно, влезет ли она в видеопамять. */
  размѣръ: number
}

export interface Реплика {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Ollama запущена и отвечает. */
export async function ollamaЖива(): Promise<boolean> {
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), ЖДАТЬ_СПИСОКЪ)
    const r = await fetch(`${АДРЕСЪ}/api/tags`, { signal: c.signal })
    clearTimeout(t)
    return r.ok
  } catch {
    return false
  }
}

/** Какие модели скачаны. Пустой список — Ollama есть, а моделей нет. */
export async function модели(): Promise<Модель[]> {
  const r = await fetch(`${АДРЕСЪ}/api/tags`)
  if (!r.ok) throw new Error('Ollama не отвечает')
  const д = (await r.json()) as { models?: { name: string; size: number }[] }
  return (д.models ?? []).map((м) => ({ имя: м.name, размѣръ: м.size }))
}

/**
 * Спросить модель, получая ответ по мере того, как он пишется.
 *
 * Потоком, а не целиком, потому что маленькая модель на своей машине думает
 * секундами: ждать молча полминуты — значит выглядеть сломанной. Отменяется
 * тем же сигналом, каким отменяется всё в браузере.
 */
export async function спросить(
  модель: string,
  реплики: Реплика[],
  наКусокъ: (кусокъ: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const r = await fetch(`${АДРЕСЪ}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: модель, messages: реплики, stream: true }),
    signal,
  })
  if (!r.ok || !r.body) {
    throw new Error(`Ollama ответила ${r.status}. Модель «${модель}» скачана?`)
  }

  const чтецъ = r.body.getReader()
  const буквы = new TextDecoder()
  let хвостъ = ''

  for (;;) {
    const { done, value } = await чтецъ.read()
    if (done) break
    хвостъ += буквы.decode(value, { stream: true })
    /*
     * Ollama шлёт по одному JSON на строку, но кусок из сети может оборваться
     * посередине строки. Поэтому дожидаемся перевода строки, а недописанное
     * оставляем в хвосте до следующего куска — иначе на длинных ответах
     * половина текста терялась бы на разборе.
     */
    const строки = хвостъ.split('\n')
    хвостъ = строки.pop() ?? ''
    for (const с of строки) {
      if (!с.trim()) continue
      try {
        const д = JSON.parse(с) as { message?: { content?: string }; error?: string }
        if (д.error) throw new Error(д.error)
        if (д.message?.content) наКусокъ(д.message.content)
      } catch (e) {
        if (e instanceof SyntaxError) continue
        throw e
      }
    }
  }
}
