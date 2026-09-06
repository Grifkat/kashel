import React, { useState } from 'react'
import { Icon } from '../lib/icons'
import { useStore } from '../state/store'
import { bridge, isDesktop } from '../state/vault'

/*
 * Рубеж отрисовки. Ошибка в рендере поднимается до ближайшей границы сверху;
 * без границ она доходит до корня, и React снимает ВСЁ дерево — окно остаётся
 * пустым, видны только рамка и меню Electron. Так уже случалось дважды:
 * лишний хук в правой панели и бесконечный пересчёт высоты карточки канваса.
 *
 * Границы стоят ниже StoreProvider (см. main.tsx). Это главное их свойство:
 * данные в памяти, saveNow, отложенная запись через 400 мс, полное
 * автосохранение раз в пять минут и дозапись на beforeunload переживают
 * любое падение интерфейса. Если кто-то передвинет границу выше
 * StoreProvider, текст запасного экрана станет враньём молча.
 *
 * Запасной экран — функция, а не часть класса. Он рисуется в позиции самой
 * границы, то есть остаётся потомком всего, что стоит выше неё, поэтому
 * useStore() в нём законен и работает на любом рубеже.
 *
 * Чего граница не ловит, и обещать обратное нельзя: бросок из обработчика
 * события, отклонённый промис и зацикливание setState в пассивном useEffect —
 * там React не бросает, а только предупреждает.
 */

export type BoundaryLevel = 'window' | 'view' | 'slot'

interface Props {
  children: React.ReactNode
  level: BoundaryLevel
  /** Человеческое имя упавшего места — только для заголовка. */
  where?: string
  /** Готовый className колонки .app: без него сетка окна потеряет колонку. */
  slotClass?: string
  /** Смена значения снимает состояние ошибки: панель открыли заново. */
  resetKey?: string
}

interface State {
  err: string | null
  key?: string
  tries: number
}

export class Boundary extends React.Component<Props, State> {
  state: State = { err: null, key: this.props.resetKey, tries: 0 }

  // В состоянии держим строку, а не Error: объект, попавший в JSX, уронил бы
  // сам запасной экран сообщением «Objects are not valid as a React child»,
  // и ошибка ушла бы на рубеж выше — а у верхнего рубежа «выше» уже нет.
  static getDerivedStateFromError(e: unknown): Partial<State> {
    return { err: e instanceof Error ? e.message : String(e) }
  }

  // Правая панель при Ctrl+I не размонтируется, а отдаёт «.rightbar hidden»,
  // поэтому сама собой граница не сбросится — сбрасываем по ключу.
  static getDerivedStateFromProps(p: Props, s: State): Partial<State> | null {
    if (p.resetKey === s.key) return null
    return { key: p.resetKey, err: null }
  }

  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    // Цвета живут только в блоках [data-theme] (themes.css), в :root их нет.
    // Если App упал раньше, чем проставил тему, экран ошибки остался бы без
    // фона и без цвета текста.
    const root = document.documentElement
    if (!root.dataset.theme) root.dataset.theme = 'obsidian'
    // React сообщает о пойманной ошибке через console.error, а тестовая
    // оснастка этот канал подменяет и никуда не печатает — стек компонентов
    // иначе не увидеть ни в прогоне, ни в инструментах разработчика.
    console.warn('Сбой отрисовки:', this.props.where ?? this.props.level, err, info.componentStack)
  }

  private retry = () => this.setState((s) => ({ err: null, tries: s.tries + 1 }))

  render() {
    if (this.state.err === null) return this.props.children
    return (
      <CrashScreen
        level={this.props.level}
        where={this.props.where}
        slotClass={this.props.slotClass}
        message={this.state.err}
        tries={this.state.tries}
        onRetry={this.retry}
      />
    )
  }
}

/*
 * Запасной экран. Правила, без которых он однажды упадёт сам:
 *  - из хуков можно только useStore() и собственный useState. Ни useApp, ни
 *    useArchive, ни useAnalytics: они живут внутри App, и на верхнем рубеже
 *    их нет — вызов бросит «вне провайдера» прямо на экране ошибки;
 *  - из store звать только saveNow, vaultPath. wipeAll и replaceAll человеку
 *    в панике давать нельзя;
 *  - ничего не считать из data: именно её отрисовка и уронила интерфейс;
 *  - каждый обработчик — в try/catch, результат в текст: бросок из обработчика
 *    летит мимо границы, показать его больше некому;
 *  - не трогать buildArchive (тянет вложения в base64, это десятки мегабайт
 *    и секунды ожидания в упавшем интерфейсе) и navigator.clipboard.
 */
function CrashScreen({
  level,
  where,
  slotClass,
  message,
  tries,
  onRetry,
}: {
  level: BoundaryLevel
  where?: string
  slotClass?: string
  message: string
  tries: number
  onRetry(): void
}) {
  const store = useStore()
  const [note, setNote] = useState('')

  const save = async () => {
    setNote('Записываю…')
    try {
      await store.saveNow()
      setNote('Записано в хранилище.')
    } catch (e) {
      setNote('Не удалось записать: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const canRetry = tries < 2
  const mono = { fontFamily: 'var(--mono)' } as React.CSSProperties

  // ------------------------------------------------------------ слот
  if (level === 'slot') {
    // Класс колонки обязателен: .app — это сетка из четырёх колонок по порядку
    // детей, и узел без класса потеряет свои 300 px, а скрытая панель вылезет
    // на экран.
    return (
      <div className={slotClass}>
        <div className="sidebar-head">
          <span>{where}</span>
        </div>
        <div className="empty" style={{ padding: 16, textAlign: 'left' }}>
          <div className="strong">{where ?? 'Панель'} не собралась</div>
          <div className="small faint" style={{ marginTop: 4 }}>
            На остальную программу это не повлияло.
          </div>
          <div style={{ ...mono, fontSize: 12, color: 'var(--faint)', marginTop: 8, wordBreak: 'break-word' }}>
            {message.slice(0, 160)}
          </div>
          {canRetry ? (
            <button className="btn sm" style={{ marginTop: 10 }} onClick={onRetry}>
              Попробовать снова
            </button>
          ) : (
            <div className="small faint" style={{ marginTop: 10 }}>
              Причина не ушла — панель можно скрыть по Ctrl+I.
            </div>
          )}
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------ раздел
  if (level === 'view') {
    return (
      <div className="view">
        <div className="advice-card alert">
          <div className="advice-title">Раздел «{where ?? 'без названия'}» не отрисовался</div>
          <div className="advice-body">
            Остальная программа работает: вкладки, другие разделы и сохранение не затронуты.
            Записать данные можно кнопкой в строке состояния внизу или сочетанием Ctrl+S.
            Вкладку можно закрыть крестиком или переключиться на соседнюю — при возврате
            раздел откроется заново.
          </div>
          <div className="advice-ev" style={mono}>
            <div>{message.slice(0, 300)}</div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {canRetry ? (
              <button className="btn sm" onClick={onRetry}>
                <Icon name="repeat" size={13} /> Попробовать снова
              </button>
            ) : (
              <span className="small faint">Причина не ушла — раздел падает снова. Закройте вкладку.</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------ окно
  return (
    <div className="splash">
      <div className="card" style={{ maxWidth: 560, width: 'min(560px, 90vw)' }}>
        <div className="card-title">
          <Icon name="warn" size={14} /> Интерфейс не отрисовался
        </div>
        <div className="muted" style={{ lineHeight: 1.6 }}>
          Хранилище не пострадало: данные в памяти целы, автосохранение продолжает работать.
          Запишите их на диск, прежде чем перезагружать окно.
        </div>
        <div style={{ ...mono, fontSize: 13, color: 'var(--faint)', marginTop: 10, wordBreak: 'break-word' }}>
          {message.slice(0, 300)}
        </div>
        <div className="faint small" style={{ ...mono, marginTop: 6, wordBreak: 'break-all' }}>
          {store.vaultPath}
        </div>

        <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
          {/* Запись строго до перезагрузки: перезагрузка поднимет хранилище
              с диска и потеряет всё, что не успело записаться. */}
          <button className="btn primary" onClick={() => void save()}>
            <Icon name="save" size={14} /> Сохранить в хранилище
          </button>
          {canRetry && (
            <button className="btn" onClick={onRetry}>
              <Icon name="repeat" size={14} /> Продолжить работу
            </button>
          )}
          {isDesktop && (
            <button className="btn ghost" onClick={() => void bridge.revealVault()}>
              <Icon name="folder" size={14} /> Открыть папку хранилища
            </button>
          )}
          <button className="btn ghost" onClick={() => window.location.reload()}>
            <Icon name="repeat" size={14} /> Перезагрузить окно
          </button>
        </div>

        {note && (
          <div className="small faint" style={{ marginTop: 10 }}>
            {note}
          </div>
        )}
        {!canRetry && (
          <div className="faint small" style={{ marginTop: 10, lineHeight: 1.55 }}>
            Причина не ушла, падение повторяется — скорее всего дело в самих данных.
            Загляните в папку хранилища: чаще всего виновата запись, где не хватает поля,
            например операция без даты.
          </div>
        )}
      </div>
    </div>
  )
}
