/*
 * «Звуки и уведомления»: общий выключатель, громкость, звук у каждого
 * события и системные уведомления. Во вкладке «Таймер» — та же настройка,
 * только события помидора, чтобы не ходить за ними в «Настройки».
 */
import { useStore } from '../state/store'
import { bridge, saveAttachment } from '../state/vault'
import { Icon } from '../lib/icons'
import { Toggle, useToast } from './ui'
import { ЗВУКИ, СОБЫТИЯ, звукСобытия, звукиВключены, громкость, проиграть, type ЗвукСобытие } from '../lib/zvuki'
import { оповестить } from './Opoveshchenie'
import { т } from '../i18n'

export function ЗвукиНастройки({ только, кратко }: { только?: ЗвукСобытие[]; кратко?: boolean }) {
  const { data, patchSettings } = useStore()
  const toast = useToast()
  const s = data.settings
  const зв = s.sounds ?? {}
  const задать = (p: Partial<NonNullable<typeof s.sounds>>) => patchSettings({ sounds: { ...зв, ...p } })
  const события = только ? СОБЫТИЯ.filter((e) => только.includes(e.id)) : СОБЫТИЯ
  const включены = звукиВключены(s)

  const выбрать = async (e: ЗвукСобытие, v: string) => {
    if (v !== 'file') {
      задать({ events: { ...(зв.events ?? {}), [e]: v } })
      проиграть(v, s)
      return
    }
    const picked = await bridge.openSound()
    if (!picked) return
    const rel = await saveAttachment(picked.name, picked.base64)
    задать({ events: { ...(зв.events ?? {}), [e]: 'file' }, files: { ...(зв.files ?? {}), [e]: rel } })
    toast(т('Звук сохранён в хранилище — он поедет вместе с архивом'))
  }

  return (
    <div className="zvuki">
      {!кратко && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <span style={{ flex: 1 }}>{т('Звуки')}</span>
            <Toggle checked={включены} onChange={(v) => задать({ enabled: v })} />
          </div>
          <div className="row" style={{ marginBottom: 14, gap: 10 }}>
            <span style={{ width: 90 }} className="faint small">{т('Громкость')}</span>
            <input
              type="range"
              className="zvuki-vol"
              min={0}
              max={100}
              step={5}
              disabled={!включены}
              value={Math.round(громкость(s) * 100)}
              onChange={(e) => задать({ volume: Number(e.target.value) / 100 })}
              onMouseUp={() => проиграть('bell', s)}
              style={{ flex: 1 }}
            />
            <span className="num small" style={{ width: 38, textAlign: 'right' }}>{Math.round(громкость(s) * 100)}%</span>
          </div>
        </>
      )}
      <div className={'zvuki-list' + (включены ? '' : ' off')}>
        {события.map((e) => {
          const v = звукСобытия(s, e.id)
          const файл = зв.files?.[e.id]
          return (
            <div key={e.id} className="zvuki-row">
              <span className="zvuki-name">{e.name}</span>
              <select
                className={'zvuki-sel zvuki-' + e.id}
                value={v}
                disabled={!включены}
                onChange={(ev) => void выбрать(e.id, ev.target.value)}
              >
                {ЗВУКИ.filter((z) => z.id !== 'auto' || e.id === 'save').map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.id === 'file' && v === 'file' && файл ? т('Свой: {0}', файл.split('/').pop() ?? '') : z.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn"
                title={т('Прослушать')}
                disabled={!включены || v === 'none'}
                onClick={() => проиграть(v, s, файл)}
              >
                <Icon name="play" size={14} />
              </button>
            </div>
          )
        })}
      </div>
      {!кратко && (
        <>
          <div className="faint small" style={{ margin: '8px 0 14px', lineHeight: 1.5 }}>
            {т('Звук напоминания выбирается у каждого напоминания; выключатель и громкость действуют и на него.')}</div>
          <div className="row" style={{ marginBottom: 8 }}>
            <span style={{ flex: 1 }} title={т('Когда окно свёрнуто, спрятано в трей или под другими окнами')}>
              {т('Уведомления Windows, когда окно не на виду')}</span>
            <Toggle
              checked={s.notices?.system !== false}
              onChange={(v) => patchSettings({ notices: { ...(s.notices ?? {}), system: v } })}
            />
          </div>
          <button
            type="button"
            className="btn sm"
            onClick={() => оповестить({ title: т('Так выглядит оповещение'), body: т('Конец отрезка помидора, напоминание, платёж по кредиту — вот так, сверху и крупно.'), icon: 'bell', звук: 'notice' })}
          >
            <Icon name="bell" size={14} /> {т(' Показать пример')}</button>
        </>
      )}
    </div>
  )
}
