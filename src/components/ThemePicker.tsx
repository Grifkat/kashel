import React from 'react'
import { useStore } from '../state/store'
import { THEMES, type ThemeInfo } from '../lib/themes'
import { Modal } from './ui'
import { СвоиОформленія } from './Konstruktor'
import { Icon } from '../lib/icons'
import { usePrefersReducedMotion } from './anim'
import type { AnimLevel } from '../lib/types'
import { т, тр } from '../i18n'

const ANIM: { id: AnimLevel; name: string; about: string }[] = [
  { id: 'system', name: т('Как в системе'), about: т('Следовать настройке Windows «Эффекты анимации»: включена — полные, выключена — никаких.') },
  { id: 'off', name: т('Выключены'), about: т('Ничего не движется: цифры меняются мгновенно, списки перерисовываются сразу.') },
  { id: 'subtle', name: т('Умеренные'), about: т('Короткие переходы, которые не отвлекают при вводе операций. Без украшений.') },
  { id: 'full', name: т('Полные'), about: т('Перекат цифр, пружины, плавная перестановка списков и декоративные эффекты.') },
]

/** Миниатюра оформления: три цвета темы, разложенные как в самом окне. */
/** Миниатюра оформления: три цвета темы, разложенные как в самом окне. */
export function ThemeThumb({ theme, size = 1 }: { theme: ThemeInfo; size?: number }) {
  const [bg, panel, accent] = theme.swatch
  const r = theme.id === 'neon' ? 2 : theme.id === 'graphite' ? 4 : theme.id === 'warm' ? 9 : 6
  return (
    <div
      style={{
        background: bg,
        borderRadius: r + 2,
        padding: 7 * size,
        display: 'flex',
        gap: 5 * size,
        height: 74 * size,
        border: '1px solid rgba(128,128,128,0.25)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width: 16 * size, background: panel, borderRadius: r, opacity: 0.9 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 * size }}>
        <div
          style={{
            height: 18 * size,
            borderRadius: r,
            background: `linear-gradient(135deg, ${accent}44, ${panel})`,
            border: `1px solid ${accent}55`,
          }}
        />
        <div style={{ flex: 1, display: 'flex', gap: 4 * size }}>
          <div style={{ flex: 1, background: panel, borderRadius: r, display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 16 * size, height: 16 * size, borderRadius: '50%', border: `3px solid ${accent}` }} />
          </div>
          <div style={{ flex: 1.3, background: panel, borderRadius: r, padding: 4 * size, display: 'flex', flexDirection: 'column', gap: 3 * size }}>
            {[1, 0.75, 0.5].map((w, i) => (
              <div key={i} style={{ height: 3 * size, width: `${w * 100}%`, background: accent, opacity: 0.55 - i * 0.13, borderRadius: 2 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ThemePicker({ onClose }: { onClose: () => void }) {
  const { data, patchSettings } = useStore()
  // Пока включена своя тема, ни одна встроенная не отмечается выбранной.
  const cur = data.settings.customTheme ? null : data.settings.theme
  const systemReduced = usePrefersReducedMotion()
  const level = data.settings.animations

  return (
    <Modal title={т('Оформление')} icon="palette" onClose={onClose} wide>
      <div className="grid c3" style={{ marginBottom: 22 }}>
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => patchSettings({ theme: t.id, accent: t.accent, customTheme: undefined })}
            style={{
              textAlign: 'left',
              background: 'transparent',
              border: '2px solid ' + (cur === t.id ? 'var(--accent)' : 'var(--border-soft)'),
              borderRadius: 'var(--radius-lg)',
              padding: 10,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <ThemeThumb theme={t} />
            <div className="row" style={{ gap: 7 }}>
              <span className="strong">{t.name}</span>
              <span className="badge">{t.mode === 'dark' ? 'тёмная' : 'светлая'}</span>
              {cur === t.id && <Icon name="check" size={15} style={{ color: 'var(--accent)', marginLeft: 'auto' }} />}
            </div>
            <div className="faint small" style={{ lineHeight: 1.45 }}>{t.about}</div>
          </button>
        ))}
        <СвоиОформленія />
      </div>

      <div className="card-title">{т('Анимации')}</div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
        {ANIM.map((a) => (
          <span
            key={a.id}
            className={'chip' + (data.settings.animations === a.id ? ' on' : '')}
            onClick={() => patchSettings({ animations: a.id })}
          >
            {a.name}
          </span>
        ))}
      </div>
      <div className="faint small" style={{ lineHeight: 1.5 }}>
        {ANIM.find((a) => a.id === level)?.about}
      </div>
      {systemReduced && (
        <div className="advice-card warn" style={{ marginTop: 10, padding: '10px 12px' }}>
          {тр('Windows сейчас просит уменьшить движение — у вас выключены «Эффекты анимации» (Параметры → Специальные возможности → Визуальные эффекты).{0}', level === 'system'
            ? т(' При режиме «как в системе» это значит, что анимаций не будет. Выберите «Полные», если хотите их видеть в программе несмотря на системную настройку.')
            : т(' Явный выбор выше это перебивает, так что в программе анимации работают.'))}</div>
      )}

      <div className="card-title" style={{ marginTop: 20 }}>{т('Акцентный цвет')}</div>
      <div className="faint small" style={{ marginBottom: 8 }}>
        {т('При смене оформления подставляется цвет, с которым тема задумана. Можно поменять — в настройках.')}</div>
      <div className="row" style={{ gap: 8 }}>
        <span
          style={{
            width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)',
            border: '2px solid var(--border)',
          }}
        />
        <span className="faint small">{data.settings.accent}</span>
      </div>
    </Modal>
  )
}
