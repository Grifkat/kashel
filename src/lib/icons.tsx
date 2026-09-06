import React from 'react'
import { ICON_BY_ID } from './catalog'

// Единый контурный набор для интерфейса. Категории пользователя используют
// эмодзи-каталог (см. emoji.ts) — там нужна широта, а не единый стиль.
const P: Record<string, React.ReactNode> = {
  home: <path d="M3 11.5 12 3l9 8.5M5.5 9.8V21h13V9.8M9.5 21v-6h5v6" />,
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  wallet: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H17a2 2 0 0 1 2 2v1" />
      <path d="M3 7.5V17a2.5 2.5 0 0 0 2.5 2.5H19a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5.5" />
      <circle cx="16.5" cy="13.5" r="1.2" />
    </>
  ),
  donut: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v5M20.5 12h-5" />
    </>
  ),
  chart: <path d="M3.5 3.5v17h17M7 15.5l3.5-4.5 3 3 4.5-6.5" />,
  bars: <path d="M4 20V11M10 20V5M16 20v-6M22 20H2" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  canvas: (
    <>
      <rect x="3" y="4.5" width="7" height="6" rx="1.5" />
      <rect x="14" y="4.5" width="7" height="6" rx="1.5" />
      <rect x="7.5" y="14.5" width="9" height="5.5" rx="1.5" />
      <path d="M6.5 10.5v2a2 2 0 0 0 2 2h.5M17.5 10.5v2a2 2 0 0 1-2 2H15" />
    </>
  ),
  note: (
    <>
      <path d="M6 2.5h8l4.5 4.5V21.5H6z" />
      <path d="M14 2.5V7h4.5M9 12.5h6M9 16.5h4" />
    </>
  ),
  graph: (
    <>
      <circle cx="5" cy="7" r="2.2" />
      <circle cx="19" cy="6" r="2.2" />
      <circle cx="12" cy="17.5" r="2.6" />
      <circle cx="19.5" cy="16" r="1.6" />
      <path d="m6.9 8.3 3.6 7M17.6 7.7l-4 7.6M14.5 17l3.4-.7" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.3 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.5V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.4a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1.2z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9L17.5 7M10 11v6M14 11v6" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.4 0-.9.7-1.6 1.6-1.6h1.6A5.2 5.2 0 0 0 21 9.6C21 5.9 16.9 3 12 3z" />
      <circle cx="7.5" cy="11.5" r="1" />
      <circle cx="10" cy="7.5" r="1" />
      <circle cx="15" cy="8" r="1" />
    </>
  ),
  edit: <path d="M4 20.5h4.5L20 9l-4.5-4.5L4 16zM14.5 6l4.5 4.5" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  left: <path d="m14.5 5-7 7 7 7" />,
  right: <path d="m9.5 5 7 7-7 7" />,
  up: <path d="m5 14.5 7-7 7 7" />,
  down: <path d="m5 9.5 7 7 7-7" />,
  calendar: <path d="M4 6.5h16V21H4zM4 11h16M8.5 3v4M15.5 3v4" />,
  filter: <path d="M3.5 5h17l-6.5 7.5v6.5l-4 2v-8.5z" />,
  download: <path d="M12 3.5v12M7.5 11l4.5 4.5 4.5-4.5M4 20.5h16" />,
  upload: <path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 20.5h16" />,
  warn: <path d="M12 3.5 22 20H2zM12 10v4.5M12 17.5h.01" />,
  bulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />
      <path d="M9.5 19h5M10.5 21.5h3" />
    </>
  ),
  arrowUp: <path d="M12 20V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 4v15M6 13l6 6 6-6" />,
  arrowRight: <path d="M4 12h15M13 6l6 6-6 6" />,
  link: (
    <>
      <path d="M10.5 13.5a4.5 4.5 0 0 0 6.4 0l2.2-2.2a4.5 4.5 0 1 0-6.4-6.4l-1.2 1.2" />
      <path d="M13.5 10.5a4.5 4.5 0 0 0-6.4 0l-2.2 2.2a4.5 4.5 0 1 0 6.4 6.4l1.2-1.2" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.5 12 4h7.5v7.5L11 20z" />
      <circle cx="16" cy="8" r="1.3" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  // Пустой кружок. Его не было вовсе, и незакрытая задача рисовалась
  // запасным значком — тремя точками.
  circle: <circle cx="12" cy="12" r="8.5" />,
  check: <path d="m5 12.5 5 5 9-11" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  repeat: <path d="M4 9.5h12.5l-3.5-3.5M20 14.5H7.5l3.5 3.5" />,
  sparkle: <path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5L4.5 11 10 9zM19 4.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  flow: (
    <>
      <path d="M3 6.5h5a4 4 0 0 1 4 4v3a4 4 0 0 0 4 4h5" />
      <path d="m17 14.5 4 3-4 3" />
      <circle cx="4" cy="17.5" r="1.2" />
    </>
  ),
  scale: <path d="M12 4v16M6 8h12M8 8l-3 6h6zM16 8l-3 6h6z" />,
  shield: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />,
  credit: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19M6 14.5h3" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  safe: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 9.5v5M9.5 12h5" />
    </>
  ),
  handshake: <path d="M3 9.5 7 6l3 2.5 2-1 2 1L17 6l4 3.5-3.5 4-2-1.5-3 2.5-3-2.5-2 1.5z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.5l3.5 2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: <path d="M4 4 20 20M10 6.3A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.3 3.9M6.6 8.2A16.6 16.6 0 0 0 2.5 12s3.5 6 9.5 6a9.5 9.5 0 0 0 3.6-.7M9.4 9.6a2.8 2.8 0 0 0 3.9 3.9" />,
  split: <path d="M4 6h4l5 6 5-6h2M4 18h4l3.5-4.2M20 18h-2" />,
  folder: <path d="M3 6.5h6l2 2.5h10v10.5H3z" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  panel: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  play: <path d="M7 4.5 19 12 7 19.5z" />,
  save: <path d="M4.5 4.5h11L19.5 8.5v11h-15zM8 4.5v5h7v-5M8 19.5v-6h8v6" />,
}

export type IconName = keyof typeof P

export function Icon({
  name,
  size = 18,
  className,
  style,
}: {
  name: IconName | string
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  const body = P[name] ?? P.dots
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      {body}
    </svg>
  )
}

/**
 * Иконка из каталога категорий (см. catalog.ts). Рисуется той же линией, что
 * и остальной интерфейс, и красится currentColor — цвет задаёт кружок вокруг.
 */
export function CatalogGlyph({ id, size = 18 }: { id: string; size?: number }) {
  const icon = ICON_BY_ID.get(id)
  if (!icon) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  )
}
