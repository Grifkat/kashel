/*
 * Выбор акцентного цвета — один на настройки и окно «Оформление».
 *
 * «Как в оформлении» — акцент меняется вместе с темой. Любой выбранный цвет
 * делает акцент своим: он переживает смену оформления и действует и на свои
 * темы. Свой цвет из панели виден сразу, пока его подбирают, а сохраняется
 * кнопкой.
 */
import { useStore } from '../state/store'
import { ColorPicker } from './ui'
import { акцентОформления, вернутьОформление, применитьАкцент, режимАкцента } from '../lib/akcent'
import { т } from '../i18n'

export function ВыборАкцента() {
  const { data, patchSettings } = useStore()
  const s = data.settings
  const свой = режимАкцента(s) === 'own'
  const родной = акцентОформления(s)
  return (
    <div className="vybor-akcenta">
      <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          className={'chip' + (!свой ? ' on' : '')}
          title={т('Акцент меняется вместе с оформлением')}
          onClick={() => patchSettings({ accentMode: 'theme' })}
        >
          <span className="akcent-kruzhok" style={{ background: родной }} />
          {т('Как в оформлении')}
        </button>
        {свой && (
          <span className="faint small">
            {т('Свой цвет {0} — остаётся при смене оформления', s.accent)}
          </span>
        )}
      </div>
      <ColorPicker
        value={свой ? s.accent : null}
        onChange={(accent) => patchSettings({ accent, accentMode: 'own' })}
        onPreview={(c) => {
          const root = document.documentElement
          if (c) применитьАкцент(root, c, true)
          else вернутьОформление(root, s)
        }}
      />
    </div>
  )
}
