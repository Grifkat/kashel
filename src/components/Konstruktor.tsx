/*
 * Конструктор оформления.
 *
 * Слева — настройки, справа — живой предпросмотр. Предпросмотр не картинка,
 * а настоящие карточки, кнопки и суммы программы с темой, наложенной только
 * на этот кусок: атрибут data-theme срабатывает на любом элементе, не только
 * на корне. Поэтому видно ровно то, что получится, и само окно при этом не
 * перекрашивается, пока не нажато «Сохранить».
 *
 * Под предпросмотром — контраст ключевых пар по WCAG. Красивая тема, в
 * которой не видно букв, — не красивая тема.
 */
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { bridge } from '../state/vault'
import { Icon } from '../lib/icons'
import { uid } from '../lib/format'
import { THEMES } from '../lib/themes'
import type { ThemeId } from '../lib/types'
import {
  ТОКЕНЫ, вывестиТокены, контрастъ, очиститьТокены, простыяИзъТокеновъ, разобратьHex, разобратьФайлТемы,
  файлТемы, значеніеДопустимо, РАСШИРЕНІЕ_ТЕМЫ, вHex,
  type ПростыяНастройки, type СвояТема,
} from '../lib/svoitemy'
import { Confirm, Modal, useToast } from './ui'
import { ThemeThumb } from './ThemePicker'

/** Переменные встроенной темы — читаются с невидимого элемента с её атрибутом. */
export function токеныОсновы(base: ThemeId): Record<string, string> {
  const el = document.createElement('div')
  el.dataset.theme = base
  el.style.display = 'none'
  document.body.appendChild(el)
  const cs = window.getComputedStyle(el)
  const итогъ: Record<string, string> = {}
  for (const т of ТОКЕНЫ) {
    const v = cs.getPropertyValue('--' + т.id).trim()
    if (v) итогъ[т.id] = v
  }
  el.remove()
  return итогъ
}

/**
 * Цвет из getComputedStyle → #rrggbb.
 * Браузер отдаёт его по-разному: rgb(1, 2, 3), а смешанные через color-mix —
 * color(srgb 0.1 0.2 0.3) с долями единицы. Второй вид сначала не
 * разбирался, и расход на карточке показывался в читаемости прочерком.
 */
export function вHexИзъCss(v: string): string | null {
  if (разобратьHex(v)) return v
  const rgb = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (rgb) return вHex([Number(rgb[1]), Number(rgb[2]), Number(rgb[3])])
  const srgb = v.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  if (srgb) return вHex([Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255])
  return null
}

function ПолеЦвета({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  const hex = вHexИзъCss(value)
  const годно = значеніеДопустимо('color', value)
  return (
    <div className="row" style={{ gap: 6 }}>
      <input
        type="color"
        value={hex ?? '#000000'}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        style={{ width: 34, height: 28, padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'none' }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={годно ? '' : 'invalid'}
        spellCheck={false}
        style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
      />
    </div>
  )
}

export function КонструкторТемы({ исходная, onClose }: { исходная?: СвояТема; onClose: () => void }) {
  const { data, patchSettings } = useStore()
  const toast = useToast()
  const текущаяОснова: ThemeId = (исходная?.base ??
    data.settings.customThemes?.find((т) => т.id === data.settings.customTheme)?.base ??
    data.settings.theme) as ThemeId

  const [имя, setИмя] = useState(исходная?.name ?? 'Моя тема')
  const [base, setBase] = useState<ThemeId>(текущаяОснова)
  const [режимъ, setРежимъ] = useState<'простой' | 'полный'>(исходная?.режимъ ?? 'простой')
  const [accent, setAccent] = useState(исходная?.accent ?? data.settings.accent)
  const [полныя, setПолныя] = useState<Record<string, string>>(() => исходная?.tokens ?? токеныОсновы(текущаяОснова))
  const [простыя, setПростыя] = useState<ПростыяНастройки>(() =>
    простыяИзъТокеновъ(исходная?.tokens ?? токеныОсновы(текущаяОснова), исходная?.accent ?? data.settings.accent),
  )
  const [удалить, setУдалить] = useState(false)
  const поле = useRef<HTMLInputElement>(null)

  // Что уйдёт в тему: в простом режиме — основа плюс выведенное, в полном —
  // всё как задано. Непроходящие проверку значения отбрасываются.
  const итогъ = useMemo(() => {
    const основа = токеныОсновы(base)
    const сырое = режимъ === 'простой' ? { ...основа, ...вывестиТокены({ ...простыя, accent }) } : { ...основа, ...полныя }
    return очиститьТокены(сырое)
  }, [base, режимъ, простыя, полныя, accent])

  const смѣнитьОснову = (b: ThemeId) => {
    setBase(b)
    const т = токеныОсновы(b)
    setПолныя(т)
    setПростыя(простыяИзъТокеновъ(т, accent))
  }
  const смѣнитьРежимъ = (р: 'простой' | 'полный') => {
    if (р === режимъ) return
    // Переход не теряет сделанного: простое раскладывается в полное и обратно.
    if (р === 'полный') setПолныя(итогъ)
    else setПростыя(простыяИзъТокеновъ(полныя, accent))
    setРежимъ(р)
  }

  // --- контраст по тому, что реально нарисовано в предпросмотре
  const предпросмотръ = useRef<HTMLDivElement>(null)
  const [пары, setПары] = useState<{ что: string; k: number | null; надо: number }[]>([])
  useLayoutEffect(() => {
    const root = предпросмотръ.current
    if (!root) return
    const цвѣтъ = (sel: string, prop: 'color' | 'backgroundColor') => {
      const el = root.querySelector(sel) as HTMLElement | null
      return el ? вHexИзъCss(window.getComputedStyle(el)[prop]) : null
    }
    const фонКарточки = цвѣтъ('.card', 'backgroundColor')
    const k = (a: string | null, b: string | null) => (a && b ? контрастъ(a, b) : null)
    setПары([
      { что: 'Текст на карточке', k: k(цвѣтъ('.kp-text', 'color'), фонКарточки), надо: 4.5 },
      { что: 'Приглушённый текст', k: k(цвѣтъ('.kp-muted', 'color'), фонКарточки), надо: 4.4 },
      { что: 'Акцентные буквы', k: k(цвѣтъ('.kp-ink', 'color'), фонКарточки), надо: 3 },
      { что: 'Буквы на главной кнопке', k: k(цвѣтъ('.btn.primary', 'color'), цвѣтъ('.btn.primary', 'backgroundColor')), надо: 4.5 },
      { что: 'Расход на карточке', k: k(цвѣтъ('.kp-out', 'color'), фонКарточки), надо: 3 },
    ])
  }, [итогъ, accent, base])

  const тема = (): СвояТема => ({
    id: исходная?.id ?? uid('tema'),
    name: имя.trim() || 'Своя тема',
    base, accent, режимъ, tokens: итогъ,
  })

  const сохранить = () => {
    const т = тема()
    const список = data.settings.customThemes ?? []
    patchSettings({ customThemes: [...список.filter((x) => x.id !== т.id), т], customTheme: т.id })
    toast(`Оформление «${т.name}» сохранено и включено`)
    onClose()
  }

  const выгрузить = async () => {
    const т = тема()
    const путь = await bridge.saveText(`${т.name}.${РАСШИРЕНІЕ_ТЕМЫ}`, файлТемы(т))
    if (путь !== null) toast('Файл темы сохранён')
  }

  const загрузить = async (файлъ: File | undefined) => {
    if (!файлъ) return
    const р = разобратьФайлТемы(await файлъ.text(), (id) => THEMES.some((t) => t.id === id), () => uid('tema'))
    if (!р.ok) {
      toast(р.error)
      return
    }
    setИмя(р.тема.name)
    setBase(р.тема.base)
    setAccent(р.тема.accent)
    setПолныя({ ...токеныОсновы(р.тема.base), ...р.тема.tokens })
    setПростыя(простыяИзъТокеновъ({ ...токеныОсновы(р.тема.base), ...р.тема.tokens }, р.тема.accent))
    setРежимъ(р.тема.режимъ)
    if (поле.current) поле.current.value = ''
  }

  const стиль = useMemo(() => {
    const s: Record<string, string> = { '--accent': accent }
    for (const [k, v] of Object.entries(итогъ)) s['--' + k] = v
    return s as React.CSSProperties
  }, [итогъ, accent])

  const группы = [...new Set(ТОКЕНЫ.map((т) => т.group))]

  return (
    <Modal
      title={исходная ? `Оформление «${исходная.name}»` : 'Своё оформление'}
      icon="palette"
      wide
      onClose={onClose}
      footer={
        <>
          {исходная && <button className="btn danger" onClick={() => setУдалить(true)}>Удалить</button>}
          <button className="btn ghost" onClick={() => void выгрузить()} title="Сохранить тему файлом, чтобы отдать другому">
            <Icon name="download" size={14} /> Файлом
          </button>
          <button className="btn ghost" onClick={() => поле.current?.click()} title="Открыть файл темы">
            <Icon name="upload" size={14} /> Из файла
          </button>
          <input ref={поле} type="file" accept=".json,application/json" style={{ display: 'none' }}
            onChange={(e) => void загрузить(e.target.files?.[0])} />
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn primary" onClick={сохранить}>Сохранить и включить</button>
        </>
      }
    >
      <div className="konstruktor">
        <div className="konstruktor-controls">
          <div className="grid c2" style={{ gap: 10, marginBottom: 12 }}>
            <label className="field">
              <span className="field-label">Название</span>
              <input type="text" value={имя} maxLength={40} onChange={(e) => setИмя(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Основа</span>
              <select value={base} onChange={(e) => смѣнитьОснову(e.target.value as ThemeId)}>
                {THEMES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>

          <div className="seg" style={{ marginBottom: 14 }}>
            {(['простой', 'полный'] as const).map((р) => (
              <button key={р} className={режимъ === р ? 'on' : ''} onClick={() => смѣнитьРежимъ(р)}>
                {р === 'простой' ? 'Простой' : 'Полный'}
              </button>
            ))}
          </div>

          {режимъ === 'простой' ? (
            <div className="konstruktor-list">
              {([
                ['bg', 'Фон окна'],
                ['panel', 'Карточки'],
                ['text', 'Текст'],
              ] as const).map(([k, n]) => (
                <label key={k} className="field">
                  <span className="field-label">{n}</span>
                  <ПолеЦвета value={простыя[k]} onChange={(v) => setПростыя((п) => ({ ...п, [k]: v }))} />
                </label>
              ))}
              <label className="field">
                <span className="field-label">Акцент</span>
                <ПолеЦвета value={accent} onChange={setAccent} />
              </label>
              <label className="field">
                <span className="field-label">Скругление · {Math.round(простыя.radius)} px</span>
                <input type="range" min={0} max={24} step={1} value={простыя.radius}
                  onChange={(e) => setПростыя((п) => ({ ...п, radius: Number(e.target.value) }))} />
              </label>
              <div className="faint small" style={{ lineHeight: 1.5 }}>
                Рамки, наведение, приглушённый текст и остальное выводятся из этих цветов.
                Если акцентом нельзя писать по карточке — например, жёлтым по белому, — буквы
                возьмут цвет заголовков, а акцент останется заливкой.
              </div>
            </div>
          ) : (
            <div className="konstruktor-list">
              <label className="field">
                <span className="field-label">Акцент</span>
                <ПолеЦвета value={accent} onChange={setAccent} />
              </label>
              {группы.map((г) => (
                <div key={г}>
                  <div className="card-title" style={{ margin: '12px 0 6px' }}>{г}</div>
                  {ТОКЕНЫ.filter((т) => т.group === г).map((т) => {
                    const v = полныя[т.id] ?? ''
                    const set = (nv: string) => setПолныя((п) => ({ ...п, [т.id]: nv }))
                    const годно = !v || значеніеДопустимо(т.вид, v)
                    return (
                      <label key={т.id} className="field" style={{ marginBottom: 8 }}>
                        <span className="field-label">{т.name} <code className="faint">--{т.id}</code></span>
                        {т.вид === 'color' ? (
                          <ПолеЦвета value={v} onChange={set} />
                        ) : т.вид === 'weight' ? (
                          <input type="range" min={300} max={800} step={50} value={parseInt(v, 10) || 500}
                            onChange={(e) => set(String(e.target.value))} />
                        ) : (
                          <input type="text" value={v} onChange={(e) => set(e.target.value)} spellCheck={false}
                            className={годно ? '' : 'invalid'} style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }} />
                        )}
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="konstruktor-side">
          <div
            ref={предпросмотръ}
            className="konstruktor-preview"
            data-theme={base}
            {...(итогъ['accent-text'] ? { 'data-accent-text': '' } : {})}
            style={стиль}
          >
            <div className="hero" style={{ marginBottom: 10 }}>
              <div className="row">
                <span className="faint small">Итого</span>
                <span className="spacer" />
                <button className="btn sm tone-out">+ Расход</button>
                <button className="btn sm tone-in">+ Доход</button>
              </div>
              <div className="hero-total num">124 500 ₽</div>
            </div>
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="card-title">Этот месяц</div>
              <div className="kp-text">Текст карточки читается так.</div>
              <div className="kp-muted small" style={{ color: 'var(--muted)' }}>Приглушённый — подписи и пояснения.</div>
              <div className="row" style={{ gap: 14, margin: '8px 0' }}>
                <span className="amount in num">+48 000 ₽</span>
                <span className="amount out num kp-out">−12 350 ₽</span>
              </div>
              <div className="bar-track"><div className="bar-fill" style={{ width: '62%', background: 'var(--accent)' }} /></div>
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <span className="chip on">Месяц</span>
                <span className="chip">Год</span>
                <span className="kp-ink small" style={{ color: 'var(--accent-ink, var(--accent))', marginLeft: 'auto' }}>Все операции →</span>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn">Отмена</button>
              <button className="btn primary">Сохранить</button>
            </div>
          </div>

          <div className="konstruktor-contrast">
            <div className="card-title" style={{ marginBottom: 6 }}>Читаемость</div>
            {пары.map((п) => (
              <div key={п.что} className="row small" style={{ gap: 8 }}>
                <span className={'badge ' + (п.k == null ? '' : п.k >= п.надо ? 'good' : 'alert')}>
                  {п.k == null ? '—' : п.k.toFixed(1)}
                </span>
                <span style={{ flex: 1 }}>{п.что}</span>
                <span className="faint">нужно {п.надо}</span>
              </div>
            ))}
            {пары.some((п) => п.k != null && п.k < п.надо) && (
              <div className="neg small" style={{ marginTop: 6, lineHeight: 1.5 }}>
                Где число красное — текст будет трудно прочесть. Сохранить можно, но лучше поправить цвета.
              </div>
            )}
          </div>
        </div>
      </div>

      {удалить && исходная && (
        <Confirm
          title={`Удалить оформление «${исходная.name}»?`}
          text="Тема исчезнет из галереи. Если она сейчас включена, программа вернётся к её основе."
          onConfirm={() => {
            const список = data.settings.customThemes ?? []
            patchSettings({
              customThemes: список.filter((x) => x.id !== исходная.id),
              customTheme: data.settings.customTheme === исходная.id ? undefined : data.settings.customTheme,
              theme: исходная.base,
            })
            onClose()
          }}
          onClose={() => setУдалить(false)}
        />
      )}
    </Modal>
  )
}

/**
 * Свои оформления в галерее: карточки собранных тем и карточка «Своё
 * оформление». Одна на обе галереи — в окне «Оформление» и в настройках, —
 * чтобы своя тема выбиралась и правилась одинаково отовсюду.
 */
export function СвоиОформленія({ size = 1 }: { size?: number }) {
  const { data, patchSettings } = useStore()
  const [открыта, setОткрыта] = useState<СвояТема | 'новая' | null>(null)
  const свои = data.settings.customThemes ?? []
  const карточка: React.CSSProperties = {
    textAlign: 'left',
    background: 'transparent',
    borderRadius: 'var(--radius-lg)',
    padding: 8 * size,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    position: 'relative',
  }
  return (
    <>
      {свои.map((т) => {
        const основа = THEMES.find((x) => x.id === т.base) ?? THEMES[0]
        const вкл = data.settings.customTheme === т.id
        const превью = {
          ...основа,
          name: т.name,
          accent: т.accent,
          swatch: [т.tokens.bg ?? основа.swatch[0], т.tokens.panel ?? основа.swatch[1], т.accent] as [string, string, string],
        }
        return (
          <div
            key={т.id}
            role="button"
            tabIndex={0}
            className="svoya-tema"
            title={`Своё оформление на основе «${основа.name}»`}
            onClick={() => patchSettings({ customTheme: т.id })}
            onKeyDown={(e) => { if (e.key === 'Enter') patchSettings({ customTheme: т.id }) }}
            style={{ ...карточка, border: '2px solid ' + (вкл ? 'var(--accent)' : 'var(--border-soft)') }}
          >
            <ThemeThumb theme={превью} size={0.85 * size} />
            <div className="row" style={{ gap: 6 }}>
              <span className="small strong" style={{ flex: 1, minWidth: 0 }}>{т.name}</span>
              <button
                className="icon-btn"
                title="Править в конструкторе"
                onClick={(e) => { e.stopPropagation(); setОткрыта(т) }}
              >
                <Icon name="edit" size={13} />
              </button>
            </div>
          </div>
        )
      })}
      <button
        className="svoya-tema-new"
        onClick={() => setОткрыта('новая')}
        style={{ ...карточка, border: '2px dashed var(--border)', alignItems: 'center', justifyContent: 'center', minHeight: 110 * size }}
      >
        <Icon name="plus" size={20} />
        <span className="small strong">Своё оформление</span>
        <span className="faint small" style={{ textAlign: 'center' }}>конструктор</span>
      </button>
      {открыта && <КонструкторТемы исходная={открыта === 'новая' ? undefined : открыта} onClose={() => setОткрыта(null)} />}
    </>
  )
}
