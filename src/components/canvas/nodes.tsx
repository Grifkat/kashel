import React, { useLayoutEffect, useRef } from 'react'
import { money, moneyShort } from '../../lib/format'
import { accountBalance, balances, categoryTotals, creditRemaining } from '../../engine/stats'
import { renderMarkdown } from '../../lib/markdown'
import { CatalogGlyph } from '../../lib/icons'
import { isCatalogIcon } from '../../lib/catalog'
import { QueryBlock } from '../QueryBlock'
import { Spark } from '../charts'
import type { CanvasNode, CardStyle, Money, TextFit, VaultData } from '../../lib/types'

/** Ширина текстовой карточки по умолчанию — точка отсчёта для режима «тянуть». */
const BASE_WIDTH = 280
export const DEFAULT_FONT_SIZE = 13

/**
 * Текст, подстраивающийся под карточку.
 * scale  — кегль пропорционален ширине карточки;
 * shrink — уменьшается, пока содержимое не поместится по высоте;
 * grow   — кегль постоянный, а нужную высоту сообщаем наружу.
 * Замеры идут через DOM в layout-эффекте: держать подобранный размер в
 * состоянии React означало бы бесконечный цикл перерисовок.
 */
function FittedText({
  node,
  fit,
  fontSize,
  onGrow,
  children,
}: {
  node: CanvasNode
  fit: TextFit
  fontSize: number
  onGrow?(height: number): void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    if (fit === 'scale') {
      el.style.fontSize = `${Math.max(8, (fontSize * node.width) / BASE_WIDTH).toFixed(2)}px`
      return
    }
    el.style.fontSize = `${fontSize}px`

    if (fit === 'shrink') {
      let size = fontSize
      let guard = 0
      while (el.scrollHeight > el.clientHeight + 1 && size > 8 && guard++ < 48) {
        size -= 0.5
        el.style.fontSize = `${size}px`
      }
      return
    }

    if (fit === 'grow' && onGrow) {
      // Замерять надо текст, а не контейнер: он растянут на всю карточку
      // (flex: 1), и его scrollHeight никогда не меньше нынешней высоты.
      // Мерить его напрямую значило бы каждый раз просить чуть больше, чем
      // есть, — карточка росла бы бесконечно, пока React не снимет всё дерево.
      // Поэтому на время замера отпускаем растяжку и берём естественную высоту.
      const flex = el.style.flex
      const height = el.style.height
      el.style.flex = '0 0 auto'
      el.style.height = 'auto'
      const content = el.scrollHeight
      const inner = el.clientHeight
      el.style.flex = flex
      el.style.height = height

      // Сколько карточки занимает не текст: шапка, рамки, отступы. Считаем
      // от текущего состояния, чтобы не зависеть от устройства карточки.
      const chrome = node.height - el.clientHeight
      // Схлопнутый контейнер мерить нечем — подождём следующей раскладки.
      if (el.clientHeight > 0 && inner > 0) {
        const next = Math.max(80, Math.ceil((content + chrome) / 10) * 10)
        if (Math.abs(next - node.height) > 4) onGrow(next)
      }
    }
  }, [fit, fontSize, node.width, node.height, node.text, onGrow])

  return (
    <div ref={ref} className={'cnode-scroll cnode-md' + (fit === 'fixed' ? '' : ' no-scroll')}>
      {children}
    </div>
  )
}

export const CARD_STYLES: { id: CardStyle; name: string; about: string }[] = [
  { id: 'rich', name: 'Полные', about: 'Цветная шапка с иконкой, крупная сумма, полоса выполнения' },
  { id: 'minimal', name: 'Как в Obsidian', about: 'Скруглённый прямоугольник, тонкая цветная рамка' },
  { id: 'flat', name: 'Плашки', about: 'Заливка цветом, крупная типографика, без рамки' },
]

/**
 * Всё, что нужно карточкам, считается один раз на доску.
 * Иначе каждая карточка пробегала бы всю историю операций заново — и делала бы
 * это на каждом кадре перетаскивания.
 */
export interface CardContext {
  balance: Map<string, Money>
  creditLeft: Map<string, Money>
  expense: Map<string, Money>
  income: Map<string, Money>
  noteBody: Map<string, string>
  periodLabel: string
}

export function buildCardContext(
  data: VaultData,
  from: string,
  periodLabel: string,
  noteBody: Map<string, string>,
): CardContext {
  const bal = balances(data.accounts, data.transactions)
  const creditLeft = new Map<string, Money>()
  for (const a of data.accounts) {
    if (a.type === 'credit') creditLeft.set(a.id, creditRemaining(a, data.transactions))
  }
  const scoped = data.transactions.filter((t) => t.date >= from)
  const expense = new Map(categoryTotals(scoped, 'expense').map((t) => [t.categoryId, t.amount]))
  const income = new Map(categoryTotals(scoped, 'income').map((t) => [t.categoryId, t.amount]))
  return { balance: bal.byAccount, creditLeft, expense, income, noteBody, periodLabel }
}

export interface NodeData {
  title: string
  icon?: string
  value?: number
  sub?: string
  progress?: number
  spark?: number[]
  negative?: boolean
  missing?: boolean
  body?: string
}

export function nodeData(node: CanvasNode, data: VaultData, ctx: CardContext): NodeData | null {
  switch (node.type) {
    case 'account': {
      const a = data.accounts.find((x) => x.id === node.ref)
      if (!a) return { title: 'Счёт удалён', missing: true }
      const value = a.type === 'credit' ? -(ctx.creditLeft.get(a.id) ?? 0) : ctx.balance.get(a.id) ?? 0
      return {
        title: a.name,
        icon: a.icon,
        value,
        sub:
          a.type === 'card' ? 'карта'
          : a.type === 'cash' ? 'наличные'
          : a.type === 'savings' ? 'копилка'
          : a.type === 'credit' ? 'кредит'
          : 'долг',
        negative: value < 0,
      }
    }
    case 'category': {
      const c = data.categories.find((x) => x.id === node.ref)
      if (!c) return { title: 'Категория удалена', missing: true }
      const amount = (c.kind === 'income' ? ctx.income : ctx.expense).get(c.id) ?? 0
      return {
        title: c.name,
        icon: c.icon,
        value: amount,
        sub: `${c.kind === 'income' ? 'доход' : 'расход'} · ${ctx.periodLabel}`,
        progress: c.plan ? Math.min(1, amount / c.plan) : undefined,
      }
    }
    case 'goal': {
      const g = data.goals.find((x) => x.id === node.ref)
      if (!g) return { title: 'Цель удалена', missing: true }
      const saved = g.accountId ? ctx.balance.get(g.accountId) ?? 0 : g.saved
      return {
        title: g.name,
        icon: g.icon,
        value: saved,
        sub: `цель ${moneyShort(g.targetAmount)}`,
        progress: g.targetAmount ? Math.min(1, saved / g.targetAmount) : 0,
      }
    }
    case 'scenario': {
      const s = data.scenarios.find((x) => x.id === node.ref)
      if (!s) return { title: 'Сценарий удалён', missing: true }
      const parts = [
        s.incomeFactor !== 1 ? `доход ×${s.incomeFactor.toFixed(2)}` : '',
        s.adjusts.length ? `правок: ${s.adjusts.length}` : '',
        s.events.length ? `событий: ${s.events.length}` : '',
      ].filter(Boolean)
      return { title: s.name, icon: '📊', sub: parts.join(' · ') || 'без правок' }
    }
    case 'note': {
      const body = node.file ? ctx.noteBody.get(node.file) : undefined
      return {
        title: node.file || 'Заметка',
        icon: '📝',
        body: body ?? '',
        sub: body == null ? 'заметка не найдена' : undefined,
      }
    }
    default:
      return null
  }
}

/** Содержимое карточки. Оформление задаёт style, данные — nodeData. */
export function NodeBody({
  node,
  info,
  style,
  editing,
  areaRef,
  onChange,
  onEndEdit,
  onLink,
  onGrow,
}: {
  node: CanvasNode
  info: NodeData | null
  style: CardStyle
  editing: boolean
  areaRef?: React.RefObject<HTMLTextAreaElement>
  onChange(patch: Partial<CanvasNode>): void
  onEndEdit(): void
  onLink(name: string): void
  onGrow?(height: number): void
}) {
  const fit: TextFit = node.fit ?? 'fixed'
  const fontSize = node.fontSize ?? DEFAULT_FONT_SIZE
  const markdown = (text: string) =>
    renderMarkdown(text, {
      onLink,
      onTag: () => {},
      linkExists: () => true,
      renderQuery: (source, key) => <QueryBlock key={key} source={source} />,
    })

  if (node.type === 'query') {
    if (editing) {
      return (
        <textarea
          className="cnode-edit"
          autoFocus
          value={node.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={onEndEdit}
          spellCheck={false}
        />
      )
    }
    return (
      <div className="cnode-scroll">
        <QueryBlock source={node.text || ''} />
      </div>
    )
  }

  if (node.type === 'text') {
    if (editing) {
      return (
        <textarea
          ref={areaRef}
          className="cnode-edit"
          autoFocus
          style={{ fontSize }}
          value={node.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
          onBlur={onEndEdit}
          placeholder={'Текст, **жирный**, [[ссылка]], #тег\n\n```kashel\ntype: sum\nkind: expense\nperiod: 1m\n```'}
        />
      )
    }
    if (!node.text?.trim()) {
      return <div className="cnode-scroll faint small">Двойной клик — редактировать</div>
    }
    return (
      <FittedText node={node} fit={fit} fontSize={fontSize} onGrow={onGrow}>
        {markdown(node.text)}
      </FittedText>
    )
  }

  if (!info) return <div className="faint small">Пустой узел</div>
  if (info.missing) return <div className="cnode-scroll faint small">{info.title}</div>

  // Заметка показывает своё содержимое, как в Obsidian.
  if (node.type === 'note') {
    return (
      <>
        <div className="cnode-note-head">
          <span>📝</span>
          <span className="cnode-name">{info.title}</span>
        </div>
        <div className="cnode-scroll cnode-md">
          {info.body?.trim() ? markdown(info.body) : <span className="faint small">{info.sub ?? 'пустая заметка'}</span>}
        </div>
      </>
    )
  }

  const col = node.color || 'var(--accent)'

  if (style === 'rich') {
    return (
      <>
        <div className="cnode-head" style={{ background: `color-mix(in srgb, ${col} 22%, transparent)` }}>
          <span className="cnode-avatar" style={{ background: `color-mix(in srgb, ${col} 40%, transparent)` }}>
            {isCatalogIcon(info.icon) ? <CatalogGlyph id={info.icon!} size={15} /> : info.icon ?? '•'}
          </span>
          <span className="cnode-name">{info.title}</span>
        </div>
        <div className="cnode-main">
          {info.value != null && (
            <div className={'cnode-value num' + (info.negative ? ' neg' : '')}>{money(info.value)}</div>
          )}
          {info.progress != null && (
            <div className="bar-track" style={{ marginTop: 10 }}>
              <div className="bar-fill" style={{ width: `${info.progress * 100}%`, background: col }} />
            </div>
          )}
          {info.spark && info.spark.length > 1 && <Spark values={info.spark} color={col} width={110} height={26} />}
        </div>
        {info.sub && <div className="cnode-sub">{info.sub}</div>}
      </>
    )
  }

  if (style === 'flat') {
    return (
      <>
        <div className="cnode-flat-title">
          {info.icon && <span>{info.icon}</span>} {info.title}
        </div>
        {info.value != null && (
          <div className={'cnode-value num big' + (info.negative ? ' neg' : '')}>{money(info.value)}</div>
        )}
        {info.progress != null && (
          <div className="bar-track" style={{ marginTop: 10, background: 'rgba(0,0,0,0.18)' }}>
            <div className="bar-fill" style={{ width: `${info.progress * 100}%`, background: 'var(--text-strong)' }} />
          </div>
        )}
        {info.sub && <div className="cnode-sub">{info.sub}</div>}
      </>
    )
  }

  return (
    <>
      <div className="cnode-title">
        {info.icon && <span>{info.icon}</span>} {info.title}
      </div>
      {info.value != null && (
        <div className={'cnode-value num' + (info.negative ? ' neg' : '')}>{money(info.value)}</div>
      )}
      {info.progress != null && (
        <div className="bar-track" style={{ margin: '8px 14px 0' }}>
          <div className="bar-fill" style={{ width: `${info.progress * 100}%`, background: col }} />
        </div>
      )}
      {info.sub && <div className="cnode-sub">{info.sub}</div>}
    </>
  )
}
