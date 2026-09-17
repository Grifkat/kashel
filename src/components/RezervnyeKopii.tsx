import React, { useCallback, useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useArchive, fileSize } from './ArchiveHost'
import { useToast } from './ui'
import { Icon } from '../lib/icons'
import { bridge } from '../state/vault'
import {
  ЕЖЕДНЕВНЫХ_ХРАНИТЬ, копииДоступны, подписьВида, сделатьКопию, списокКопий, type Копия,
} from '../state/rezerv'
import { текущійЯзык, т } from '../i18n'

const когдаСтрокой = (d: Date) =>
  d.toLocaleString(текущійЯзык() === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

/**
 * «Настройки» → «Резервные копии»: что лежит в backups/ и кнопка вернуть.
 * Возврат идёт через то же окно, что и загрузка архива, — с тем же
 * перечнем «что внутри» и копией нынешнего состояния перед заменой.
 */
export function RezervnyeKopii() {
  const store = useStore()
  const archive = useArchive()
  const toast = useToast()
  const [копии, setКопии] = useState<Копия[] | null>(null)
  const [делаю, setДелаю] = useState(false)
  const [всё, setВсё] = useState(false)
  const можно = копииДоступны()

  const обновить = useCallback(async () => {
    if (!можно) return
    try {
      setКопии(await списокКопий())
    } catch (e) {
      setКопии([])
      toast(т('Не удалось прочитать папку копий: ') + (e instanceof Error ? e.message : String(e)))
    }
  }, [можно, toast])

  // Список обновляется и после возврата копии: при нём появляется копия «перед возвратом».
  useEffect(() => {
    void обновить()
  }, [обновить, store.lastSaved, archive.busy])

  const сейчас = async () => {
    setДелаю(true)
    try {
      const путь = await сделатьКопию(store.data, 'manual')
      toast(т('Копия сделана: {0}', путь))
      await обновить()
    } catch (e) {
      toast(т('Копия не сделалась: ') + (e instanceof Error ? e.message : String(e)))
    } finally {
      setДелаю(false)
    }
  }

  const видно = всё ? копии ?? [] : (копии ?? []).slice(0, 8)

  return (
    <div className="card rezerv" style={{ marginTop: 16 }}>
      <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
        <div className="card-title" style={{ margin: 0 }}>
          <Icon name="shield" size={14} /> {т(' Резервные копии')}</div>
        <span className="spacer" />
        {можно && (
          <>
            <button className="btn sm" onClick={() => void сейчас()} disabled={делаю || !!archive.busy}>
              <Icon name="save" size={13} /> {делаю ? т(' Делаю копию…') : т(' Сделать копию сейчас')}</button>
            <button className="btn sm ghost" onClick={() => void bridge.revealVault()}>
              <Icon name="folder" size={13} /> {т(' Открыть папку')}</button>
          </>
        )}
      </div>
      {!можно ? (
        <div className="faint small" style={{ lineHeight: 1.6 }}>
          {т('Резервные копии делает программа на компьютере — в папку хранилища. Здесь сохраните данные кнопкой «Сохранить всё в файл».')}</div>
      ) : (
        <>
          <div className="faint small" style={{ lineHeight: 1.6, marginBottom: 10 }}>
            {т('Программа сама делает копию раз в день, перед обновлением и перед полной очисткой. Ежедневных хранится {0}, остальные — пока не удалите их из папки ', ЕЖЕДНЕВНЫХ_ХРАНИТЬ)}<code>backups/</code>.</div>
          {копии === null ? (
            <div className="faint small">{т('Смотрю папку…')}</div>
          ) : !копии.length ? (
            <div className="faint small">{т('Копий пока нет — первая появится сразу, как хранилище откроется.')}</div>
          ) : (
            <div className="rezerv-spisok">
              {видно.map((к) => (
                <div key={к.путь} className="rezerv-kopiya row" style={{ gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small strong">{когдаСтрокой(к.когда)}</div>
                    <div className="faint small">
                      {к.вид ? подписьВида(к.вид) : к.подпись}
                      {к.размер != null ? ` · ${fileSize(к.размер)}` : ''}
                    </div>
                  </div>
                  <button
                    className="btn sm"
                    disabled={!!archive.busy}
                    onClick={() => void archive.вернутьКопию(к.путь)}
                  >
                    {т('Вернуть')}</button>
                </div>
              ))}
              {копии.length > 8 && (
                <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setВсё((v) => !v)}>
                  {всё ? т('Свернуть') : т('Показать все ({0})', копии.length)}</button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
