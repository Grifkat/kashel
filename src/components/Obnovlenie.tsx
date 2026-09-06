import React, { useEffect, useState } from 'react'
import { Icon } from '../lib/icons'
import { bridge, type Находка } from '../state/vault'
import { useToast } from './ui'

/*
 * Обновление программы.
 *
 * Раздали установщик один раз — дальше человѣкъ берёт новые версии сам.
 * Всё, что здесь делается, делается только по нажатию: проверка ходит в сеть,
 * установка скачивает файл. Ни то ни другое не начинается само.
 *
 * Отдельно показано, чем проверена подлинность. Обновлятель по своей природе
 * скачивает чужой файл и запускает его — человѣку стоит знать, что за этим
 * стоит подпись, а не «доверьтесь».
 */

type Состояніе =
  | { вид: 'покой' }
  | { вид: 'смотрю' }
  | { вид: 'свѣжая' }
  | { вид: 'есть'; н: Находка }
  | { вид: 'качаю'; н: Находка; было: number; всего: number }
  | { вид: 'готово'; текстъ: string }
  | { вид: 'бѣда'; текстъ: string }

const мегабайты = (b: number) => (b / 1024 / 1024).toFixed(1) + ' МБ'

export function Obnovlenie() {
  const toast = useToast()
  const [версія, setВерсія] = useState('')
  const [с, setС] = useState<Состояніе>({ вид: 'покой' })

  // Что нашла тихая проверка, пока человѣкъ не открывал настройки.
  useEffect(() => {
    if (!bridge.updatePending) return
    void bridge.updatePending().then((о) => {
      setВерсія(о.версія)
      if (о.находка) setС({ вид: 'есть', н: о.находка })
    })
  }, [])

  // Ход скачивания и находки приходят из главного процесса.
  useEffect(() => {
    if (!bridge.onUpdate) return
    return bridge.onUpdate((e) => {
      if (e.kind === 'progress') {
        setС((п) => (п.вид === 'качаю' ? { ...п, было: e.было, всего: e.всего } : п))
      } else {
        setС((п) => (п.вид === 'качаю' ? п : { вид: 'есть', н: e.находка }))
      }
    })
  }, [])

  // На вебе обновлять нечего: программа и так открыта в браузере.
  if (!bridge.updateCheck) return null

  const проверить = async () => {
    setС({ вид: 'смотрю' })
    try {
      const н = await bridge.updateCheck!()
      setВерсія(н.текущая)
      setС(н.есть ? { вид: 'есть', н } : { вид: 'свѣжая' })
    } catch (e) {
      setС({ вид: 'бѣда', текстъ: (e as Error).message })
    }
  }

  const поставить = async (н: Находка) => {
    setС({ вид: 'качаю', н, было: 0, всего: н.size })
    try {
      const итогъ = await bridge.updateInstall!(н)
      setС({ вид: 'готово', текстъ: итогъ.действіе })
      toast('Обновление скачано')
    } catch (e) {
      setС({ вид: 'бѣда', текстъ: (e as Error).message })
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Icon name="download" size={14} /> Обновление
        </div>
        <span className="spacer" />
        {версія && <span className="faint small">у вас версия {версія}</span>}
        <button
          className="btn sm"
          style={{ marginLeft: 10 }}
          onClick={() => void проверить()}
          disabled={с.вид === 'смотрю' || с.вид === 'качаю'}
        >
          {с.вид === 'смотрю' ? 'Смотрю…' : 'Проверить обновление'}
        </button>
      </div>

      {с.вид === 'свѣжая' && (
        <div className="small pos">У вас последняя версия.</div>
      )}

      {с.вид === 'есть' && (
        <div>
          <div className="strong">Есть версия {с.н.version}{с.н.date && <span className="faint small"> · от {с.н.date}</span>}</div>
          {с.н.notes && (
            <div className="faint small" style={{ marginTop: 6, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{с.н.notes}</div>
          )}
          <div className="row wrap" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button className="btn sm primary" onClick={() => void поставить(с.н)}>
              <Icon name="download" size={13} /> Скачать и установить
            </button>
            <span className="faint small">{мегабайты(с.н.size)}</span>
          </div>
        </div>
      )}

      {с.вид === 'качаю' && (
        <div>
          <div className="small">Скачиваю версию {с.н.version}…</div>
          <div className="kredit-bar" title="Ход скачивания">
            <span style={{ width: `${Math.round((с.было / Math.max(1, с.всего)) * 100)}%` }} />
          </div>
          <div className="faint small">{мегабайты(с.было)} из {мегабайты(с.всего)}</div>
        </div>
      )}

      {с.вид === 'готово' && <div className="small pos">{с.текстъ}</div>}

      {с.вид === 'бѣда' && (
        <div className="small neg">Не вышло: {с.текстъ}</div>
      )}

      <div className="faint small" style={{ marginTop: 12, lineHeight: 1.6 }}>
        Программа раз в сутки тихо смотрит, нет ли новой версии, и ничего не скачивает
        без вашего согласия. Объявление об обновлении подписано ключом, который есть
        только у автора программы: подменённый файл не установится, даже если взломают
        сам сайт. Скачанное дополнительно сверяется по размеру и контрольной сумме.
      </div>
    </div>
  )
}

/**
 * Есть ли непросмотренная находка — для пометки у «Настроек».
 *
 * Пометка, а не окно с вопросом: человѣкъ садился считать деньги, а не
 * обновляться, и прерывать его ради этого незачем. Увидит, когда захочет.
 */
export function useЕстьОбновленіе(): boolean {
  const [есть, setЕсть] = useState(false)
  useEffect(() => {
    if (!bridge.updatePending) return
    void bridge.updatePending().then((о) => setЕсть(!!о.находка))
    return bridge.onUpdate?.((e) => {
      if (e.kind === 'found') setЕсть(true)
    })
  }, [])
  return есть
}
