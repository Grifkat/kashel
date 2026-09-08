import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { НАСТАВЛЕНІЕ, сводкаДляМодели } from '../engine/svodka'
import { модели, ollamaЖива, спросить, type Модель, type Реплика } from '../state/ollama'

/*
 * Разговор с нейросетью, которая работает на этой же машине.
 *
 * Главное правило записано в одном месте и здѣсь: без нажатия наружу не
 * уходит ничего. Не «почти ничего» и не «только обезличенное» — ничего. При
 * открытии вкладки программа спрашивает у Ollama лишь одно: какие модели
 * скачаны. Это разговор с собственным компьютером, ваших денег в нём нет.
 *
 * Сводка прикладывается к вопросу только когда галочка стоит, и галочка снята
 * по умолчанию. Рядом — «посмотреть, что уйдёт»: человѣкъ вправе прочесть это
 * до отправки, а не верить на слово. Что именно туда попадает, решает
 * engine/svodka, и там же написано, чего не попадает никогда.
 *
 * Модель выбирается на устройстве и запоминается в localStorage, а не в
 * хранилище: она стоит на этой машине, и на другой её может не быть вовсе.
 */

const ГДѢ_МОДЕЛЬ = 'kashel:нейросеть:модель'

type Состоянье =
  | { в: 'ищемъ' }
  | { в: 'нѣтъOllama' }
  | { в: 'нѣтъМоделей' }
  | { в: 'готово' }

interface Строка {
  кто: 'человѣкъ' | 'машина'
  текстъ: string
  /** К этому вопросу прикладывалась сводка. */
  сданныя?: boolean
}

const гигабайты = (b: number) => (b / 1024 / 1024 / 1024).toFixed(1) + ' ГБ'

export function Besjeda() {
  const { data } = useStore()
  const [сост, setСост] = useState<Состоянье>({ в: 'ищемъ' })
  const [списокъ, setСписокъ] = useState<Модель[]>([])
  const [модель, setМодель] = useState('')
  const [строки, setСтроки] = useState<Строка[]>([])
  const [вопросъ, setВопросъ] = useState('')
  const [сДанными, setСДанными] = useState(false)
  const [видноСводку, setВидноСводку] = useState(false)
  const [идётъ, setИдётъ] = useState(false)
  const [бѣда, setБѣда] = useState('')
  const отмѣна = useRef<AbortController | null>(null)
  const низъ = useRef<HTMLDivElement>(null)

  // Сводка считается на месте и никуда не уходит, пока её не приложат.
  const сводка = useMemo(() => сводкаДляМодели(data), [data])

  const оглядѣться = useCallback(async () => {
    setСост({ в: 'ищемъ' })
    if (!(await ollamaЖива())) return setСост({ в: 'нѣтъOllama' })
    try {
      const м = await модели()
      setСписокъ(м)
      if (!м.length) return setСост({ в: 'нѣтъМоделей' })
      const запомненная = localStorage.getItem(ГДѢ_МОДЕЛЬ)
      setМодель(м.some((x) => x.имя === запомненная) ? запомненная! : м[0].имя)
      setСост({ в: 'готово' })
    } catch {
      setСост({ в: 'нѣтъOllama' })
    }
  }, [])

  useEffect(() => { void оглядѣться() }, [оглядѣться])

  useEffect(() => {
    низъ.current?.scrollIntoView({ block: 'end' })
  }, [строки])

  const выбрать = (имя: string) => {
    setМодель(имя)
    try { localStorage.setItem(ГДѢ_МОДЕЛЬ, имя) } catch { /* приватное окно */ }
  }

  const спроситьМодель = async () => {
    const текстъ = вопросъ.trim()
    if (!текстъ || идётъ) return
    setБѣда('')
    setВопросъ('')

    const приложили = сДанными
    const исторія: Реплика[] = [{ role: 'system', content: НАСТАВЛЕНІЕ }]
    /*
     * Сводка кладётся один раз, прямо перед вопросом, а не в наставление:
     * так видно, к какому именно вопросу её приложили, и прежние ответы не
     * начинают опираться на цифры, которых при них не было.
     */
    if (приложили) {
      исторія.push({ role: 'system', content: 'Данные пользователя:\n\n' + сводка.текстъ })
    }
    for (const с of строки) {
      исторія.push({ role: с.кто === 'человѣкъ' ? 'user' : 'assistant', content: с.текстъ })
    }
    исторія.push({ role: 'user', content: текстъ })

    setСтроки((с) => [...с, { кто: 'человѣкъ', текстъ, сданныя: приложили }, { кто: 'машина', текстъ: '' }])
    setИдётъ(true)
    отмѣна.current = new AbortController()

    try {
      await спросить(модель, исторія, (кусокъ) => {
        setСтроки((с) => {
          const копія = [...с]
          const послѣдняя = копія[копія.length - 1]
          if (послѣдняя?.кто === 'машина') копія[копія.length - 1] = { ...послѣдняя, текстъ: послѣдняя.текстъ + кусокъ }
          return копія
        })
      }, отмѣна.current.signal)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setБѣда((e as Error).message)
    } finally {
      setИдётъ(false)
      отмѣна.current = null
      // Пустой ответ убираем: висящий пузырь без текста выглядит поломкой.
      setСтроки((с) => (с[с.length - 1]?.кто === 'машина' && !с[с.length - 1].текстъ ? с.slice(0, -1) : с))
    }
  }

  if (сост.в === 'ищемъ') {
    return (
      <div className="card besjeda">
        <div className="card-title"><Icon name="bulb" size={14} /> Разбор нейросетью</div>
        <div className="faint small">Смотрю, запущена ли Ollama…</div>
      </div>
    )
  }

  if (сост.в === 'нѣтъOllama' || сост.в === 'нѣтъМоделей') {
    return (
      <div className="card besjeda">
        <div className="card-title"><Icon name="bulb" size={14} /> Разбор нейросетью</div>
        <div className="faint small" style={{ lineHeight: 1.65 }}>
          {сост.в === 'нѣтъOllama' ? (
            <>
              Ollama не отвечает. Она держит модель на вашей машине и должна быть запущена —
              найдите её значок в трее или запустите из меню «Пуск». Если она не установлена,
              возьмите с <code>ollama.com</code>.
            </>
          ) : (
            <>
              Ollama работает, но ни одной модели не скачано. Выполните в терминале{' '}
              <code>ollama pull qwen3.5:9b</code> — около шести гигабайт.
            </>
          )}
        </div>
        <button className="btn sm" style={{ marginTop: 12 }} onClick={() => void оглядѣться()}>
          Проверить снова
        </button>
      </div>
    )
  }

  return (
    <div className="card besjeda">
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Icon name="bulb" size={14} /> Разбор нейросетью
        </div>
        <span className="spacer" />
        <select value={модель} onChange={(e) => выбрать(e.target.value)} disabled={идётъ}>
          {списокъ.map((м) => (
            <option key={м.имя} value={м.имя}>{м.имя} · {гигабайты(м.размѣръ)}</option>
          ))}
        </select>
      </div>

      <div className="faint small" style={{ marginBottom: 12, lineHeight: 1.6 }}>
        Модель работает на вашем компьютере, в сеть ничего не уходит. Ваши цифры она
        видит только когда вы приложите их галочкой ниже — сама по себе она их не берёт.
      </div>

      {строки.length > 0 && (
        <div className="besjeda-лента">
          {строки.map((с, i) => (
            <div key={i} className={'besjeda-строка ' + (с.кто === 'человѣкъ' ? 'свой' : 'чужой')}>
              {с.кто === 'человѣкъ' && с.сданныя && (
                <div className="besjeda-помѣта"><Icon name="check" size={11} /> с вашими данными</div>
              )}
              <div className="besjeda-текстъ">{с.текстъ || '…'}</div>
            </div>
          ))}
          <div ref={низъ} />
        </div>
      )}

      {бѣда && <div className="besjeda-бѣда">{бѣда}</div>}

      <div className="besjeda-вводъ">
        <textarea
          rows={2}
          value={вопросъ}
          placeholder="Спросите о своих деньгах: куда уходит больше всего, что урезать, хватит ли на цель"
          onChange={(e) => setВопросъ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void спроситьМодель() }
          }}
        />
        <div className="row wrap" style={{ gap: 10, marginTop: 8, alignItems: 'center' }}>
          <label className="besjeda-галка">
            <input type="checkbox" checked={сДанными} onChange={(e) => setСДанными(e.target.checked)} />
            <span>Приложить мои данные</span>
          </label>
          <button className="btn sm ghost" onClick={() => setВидноСводку((v) => !v)}>
            {видноСводку ? 'Скрыть' : 'Посмотреть, что уйдёт'}
          </button>
          <span className="spacer" />
          {идётъ ? (
            <button className="btn sm" onClick={() => отмѣна.current?.abort()}>Остановить</button>
          ) : (
            <button className="btn sm primary" onClick={() => void спроситьМодель()} disabled={!вопросъ.trim()}>
              Спросить
            </button>
          )}
        </div>

        {видноСводку && (
          <>
            <div className="faint small" style={{ marginTop: 10 }}>
              Ровно это уйдёт к модели, если галочка стоит: {сводка.строкъ} строк, {сводка.знаковъ} знаков.
              Отдельных покупок, комментариев и заметок здесь нет.
            </div>
            <pre className="besjeda-сводка">{сводка.текстъ}</pre>
          </>
        )}
      </div>
    </div>
  )
}
