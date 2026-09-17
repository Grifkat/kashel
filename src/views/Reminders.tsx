import React, { useMemo, useState } from 'react'
import { useУдаление } from '../components/Udalenie'
import { KategoriyaVybor } from '../components/KategoriyaVybor'
import { DateField } from '../components/DateField'
import { useStore } from '../state/store'
import { Icon } from '../lib/icons'
import { money, toMinor, uid } from '../lib/format'
import { humanDate, today } from '../lib/date'
import { isCatalogIcon } from '../lib/catalog'
import { Confirm, Field, Modal, MoneyInput, Tbl, Toggle, useToast } from '../components/ui'
import { playFile, playTone, SOUNDS } from '../lib/sound'
import { readAttachmentBase64, saveAttachment, bridge } from '../state/vault'
import { describeReminder, dueReminders, EVENT_NAMES, EVENT_THRESHOLD } from '../engine/reminders'
import type { Reminder, ReminderEvent, ReminderRepeat, ReminderSound } from '../lib/types'
import { т } from '../i18n'

const EVENTS: ReminderEvent[] = ['recurring-due', 'task-due', 'no-entries', 'limit-exceeded', 'big-expense', 'low-balance']

const REPEATS: { k: ReminderRepeat; t: string }[] = [
  { k: 'once', t: т('Один раз') },
  { k: 'weekly', t: т('Каждую неделю') },
  { k: 'monthly', t: т('Каждый месяц') },
  { k: 'yearly', t: т('Каждый год') },
]

export default function Reminders() {
  const { data, upsertReminder, deleteReminder } = useStore()
  const toast = useToast()
  const [edit, setEdit] = useState<Reminder | null>(null)
  const удаление = useУдаление()

  // Что сработало бы прямо сейчас — чтобы человек видел, что условие рабочее,
  // а не гадал, почему тишина.
  const сейчас = useMemo(() => new Set(dueReminders(data).map((d) => d.reminder.id)), [data])

  const rows = [...(data.reminders ?? [])].sort(
    (a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title),
  )

  const создать = (kind: Reminder['kind']) =>
    setEdit(
      kind === 'date'
        ? { id: uid('rem'), title: '', active: true, sound: 'soft', kind: 'date', date: today(), repeat: 'once' }
        : {
            id: uid('rem'), title: '', active: true, sound: 'soft', kind: 'event',
            event: 'no-entries', threshold: EVENT_THRESHOLD['no-entries'].def,
          },
    )

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1 className="view-title">{т('Напоминания')}</h1>
          <div className="view-sub">
            {т('Свои напоминания: по дате или по событию в ваших деньгах. Приходят, пока окно открыто — фонового режима у программы нет, в автозапуск она себя не прописывает.')}</div>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => создать('date')}>
            <Icon name="calendar" size={15} /> {т(' По дате')}</button>
          <button className="btn primary" onClick={() => создать('event')}>
            <Icon name="plus" size={15} /> {т(' По событию')}</button>
        </div>
      </div>

      <div className="card">
        <Tbl>
          <thead>
            <tr>
              <th>{т('Напоминание')}</th>
              <th className="col-opt">{т('Когда')}</th>
              <th className="col-opt">{т('Звук')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    <Icon name={r.kind === 'date' ? 'calendar' : 'bulb'} size={15} />
                    <span>{r.title || т('Без названия')}</span>
                    {сейчас.has(r.id) && <span className="badge" title={т('Условие выполнено прямо сейчас')}>{т('сейчас')}</span>}
                    <span className="col-fold small faint">{describeReminder(r, data)}</span>
                  </div>
                </td>
                <td className="faint col-opt">{describeReminder(r, data)}</td>
                <td className="faint col-opt">{SOUNDS.find((s) => s.id === r.sound)?.name ?? '—'}</td>
                <td className="r">
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 2 }}>
                    <button
                      className="icon-btn"
                      title={r.active ? т('Приостановить') : т('Возобновить')}
                      onClick={() => upsertReminder({ ...r, active: !r.active })}
                    >
                      <Icon name={r.active ? 'eye' : 'eyeOff'} size={15} />
                    </button>
                    <button className="icon-btn" title={т('Изменить')} onClick={() => setEdit(r)}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button className="icon-btn" title={т('Удалить')} onClick={() => удаление.напоминание(r.id)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Tbl>
        {!rows.length && <div className="empty">{т('Напоминаний пока нет')}</div>}
      </div>

      <div className="advice-card info" style={{ marginTop: 16 }}>
        <div className="advice-title">{т('Чем «по событию» отличается от «по дате»')}</div>
        <div className="advice-body">
          {т('«По дате» — обычный ежедневник: текст и день. Пропущенное не пропадает: если программу неделю не открывали, напоминание дождётся и покажется при следующем запуске. «По событию» — условие, за которым программа следит сама: остаток упал ниже порога, категория вышла за лимит, давно не вносили траты. Каждое напоминание звонит не чаще раза в день, иначе оно превратилось бы в шум и его выключили бы в первый же вечер.')}</div>
      </div>

      {edit && (
        <ReminderModal
          value={edit}
          onClose={() => setEdit(null)}
          onSave={(r) => {
            if (!r.title.trim()) {
              toast(т('Напишите, о чём напоминать'))
              return
            }
            if (r.kind === 'event' && !r.event) {
              toast(т('Выберите событие'))
              return
            }
            if (r.sound === 'file' && !r.soundFile) {
              toast(т('Выберите звуковой файл или другой звук'))
              return
            }
            upsertReminder(r)
            setEdit(null)
          }}
        />
      )}
    </div>
  )
}

function ReminderModal({
  value,
  onSave,
  onClose,
}: {
  value: Reminder
  onSave: (r: Reminder) => void
  onClose: () => void
}) {
  const { data } = useStore()
  const toast = useToast()
  const [r, setR] = useState<Reminder>(value)
  const patch = (p: Partial<Reminder>) => setR((x) => ({ ...x, ...p }))
  const th = r.event ? EVENT_THRESHOLD[r.event] : null

  const проиграть = async (id: ReminderSound) => {
    if (id === 'none') return
    if (id !== 'file') {
      playTone(id)
      return
    }
    if (!r.soundFile) return
    const b64 = await readAttachmentBase64(r.soundFile)
    if (b64) playFile('data:audio/mpeg;base64,' + b64)
  }

  const выбратьФайл = async () => {
    const picked = await bridge.openSound()
    if (!picked) return
    const rel = await saveAttachment(picked.name, picked.base64)
    patch({ sound: 'file', soundFile: rel })
    toast(т('Звук сохранён в хранилище — он поедет вместе с архивом'))
  }

  /** Смена вида чистит поля чужого вида: иначе они молча уедут в хранилище. */
  const сменитьВид = (kind: Reminder['kind']) =>
    setR((x) =>
      kind === 'date'
        ? { ...x, kind, date: x.date ?? today(), repeat: x.repeat ?? 'once', event: undefined, threshold: undefined, accountId: undefined, categoryId: undefined }
        : { ...x, kind, event: x.event ?? 'no-entries', threshold: x.threshold ?? EVENT_THRESHOLD[x.event ?? 'no-entries'].def, date: undefined, repeat: undefined },
    )

  return (
    <Modal
      title={value.title ? т('Напоминание') : т('Новое напоминание')}
      icon="bulb"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{т('Отмена')}</button>
          <button className="btn primary" onClick={() => onSave(r)}>{т('Сохранить')}</button>
        </>
      }
    >
      <Field label={т('О чём напомнить')}>
        <input
          type="text"
          autoFocus
          value={r.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={т('Заплатить за квартиру')}
        />
      </Field>

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={r.kind === 'date' ? 'on' : ''} onClick={() => сменитьВид('date')}>{т('По дате')}</button>
        <button className={r.kind === 'event' ? 'on' : ''} onClick={() => сменитьВид('event')}>{т('По событию')}</button>
      </div>

      {r.kind === 'date' ? (
        <div className="grid c2">
          <Field label={т('Когда')}>
            <DateField value={r.date ?? today()} onChange={(v) => patch({ date: v })} />
          </Field>
          <Field label={т('Повторять')}>
            <select value={r.repeat ?? 'once'} onChange={(e) => patch({ repeat: e.target.value as ReminderRepeat })}>
              {REPEATS.map((x) => <option key={x.k} value={x.k}>{x.t}</option>)}
            </select>
          </Field>
        </div>
      ) : (
        <>
          <Field label={т('Событие')}>
            <select
              value={r.event ?? 'no-entries'}
              onChange={(e) => {
                const ev = e.target.value as ReminderEvent
                patch({ event: ev, threshold: EVENT_THRESHOLD[ev].def, accountId: undefined, categoryId: undefined })
              }}
            >
              {EVENTS.map((e) => <option key={e} value={e}>{EVENT_NAMES[e]}</option>)}
            </select>
          </Field>
          {th && (
            <div className="grid c2">
              <Field label={th.label}>
                {th.unit === 'money' ? (
                  <MoneyInput value={r.threshold} onChange={(v) => patch({ threshold: v })} />
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={r.threshold ?? th.def}
                    onChange={(e) => patch({ threshold: Math.max(1, Number(e.target.value) || th.def) })}
                  />
                )}
              </Field>
              {r.event === 'low-balance' && (
                <Field label={т('Счёт')}>
                  <select value={r.accountId ?? ''} onChange={(e) => patch({ accountId: e.target.value || undefined })}>
                    <option value="">{т('Любой счёт')}</option>
                    {data.accounts.filter((a) => !a.archived).map((a) => (
                      <option key={a.id} value={a.id}>
                        {isCatalogIcon(a.icon) ? '' : a.icon + ' '}{a.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {r.event === 'limit-exceeded' && (
                <Field label={т('Категория')}>
                  <KategoriyaVybor
                    value={r.categoryId ?? ''}
                    onChange={(id) => patch({ categoryId: id || undefined })}
                    cats={data.categories.filter((c) => !c.archived && c.plan)}
                    pusto={т('Любая с лимитом')}
                  />
                </Field>
              )}
            </div>
          )}
        </>
      )}

      <div className="card-title" style={{ marginTop: 18 }}>{т('Звук')}</div>
      <div className="row wrap" style={{ gap: 6 }}>
        {SOUNDS.map((s) => (
          <span
            key={s.id}
            className={'chip' + (r.sound === s.id ? ' on' : '')}
            title={s.hint}
            onClick={() => {
              if (s.id === 'file') {
                void выбратьФайл()
                return
              }
              patch({ sound: s.id })
              void проиграть(s.id)
            }}
          >
            {s.name}
          </span>
        ))}
        {r.sound !== 'none' && (
          <button className="btn sm ghost" onClick={() => void проиграть(r.sound)}>
            <Icon name="eye" size={13} /> {т(' Прослушать')}</button>
        )}
      </div>
      {r.sound === 'file' && (
        <div className="faint small" style={{ marginTop: 8 }}>
          {r.soundFile ? т('Свой файл: {0}', r.soundFile.split('_').pop()) : т('Файл не выбран')}
        </div>
      )}

      <div className="row" style={{ marginTop: 18 }}>
        <Toggle checked={r.active} onChange={(v) => patch({ active: v })} />
        <span style={{ flex: 1 }}>{т('Напоминание включено')}</span>
      </div>

      <div className="faint small" style={{ marginTop: 14, lineHeight: 1.6 }}>
        {r.kind === 'date'
          ? т('Пропущенное напоминание не теряется: если программу не открывали, оно покажется при следующем запуске.')
          : т('Сработает, когда условие выполнится, и не чаще раза в день. {0}', r.event === 'low-balance' && r.threshold ? т('Сейчас порог — {0}.', money(r.threshold)) : '')}
      </div>
    </Modal>
  )
}
