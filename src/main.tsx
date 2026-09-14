/*
 * Точка входа.
 *
 * Язык ставится раньше, чем загружается остальная программа, — поэтому
 * здесь статически подключены только перевод и стили, а всё прочее
 * подгружается уже после. Константы модулей (названия разделов, тем,
 * режимов) вычисляются при загрузке, и к этому мигу они обязаны знать язык.
 * Смена языка перезапускает окно; зеркало в localStorage читается до того,
 * как прочитано хранилище, а App сверяет его с настройками.
 */
import { поставитьЯзык, т, языкИзъЗеркала } from './i18n'
import './styles/app.css'
import './styles/themes.css'
import './styles/effects.css'
import './styles/canvas.css'

поставитьЯзык(языкИзъЗеркала())
document.documentElement.lang = языкИзъЗеркала()
// Заголовок окна берётся из страницы и перекрыл бы тот, что ставит оболочка.
document.title = т('Кошель')

void (async () => {
  const [{ createRoot }, { default: App }, { StoreProvider }, { ToastProvider }, { Boundary }, { Vhod }, { DEFAULT_SETTINGS }] =
    await Promise.all([
      import('react-dom/client'),
      import('./App'),
      import('./state/store'),
      import('./components/ui'),
      import('./components/Boundary'),
      import('./components/Vhod'),
      import('./state/defaults'),
    ])

  /*
   * Оформление ставится до первой отрисовки.
   *
   * Раньше это делало только приложение, когда хранилище уже загрузилось. Но
   * ворота входа встают прежде него, и цвета темы им попросту неоткуда взять:
   * человѣка встречала бы страница без единого цвета. Здѣсь ставится тема по
   * умолчанию, а приложение потом заменит её на выбранную.
   */
  if (!document.documentElement.dataset.theme) {
    document.documentElement.dataset.theme = DEFAULT_SETTINGS.theme
    document.documentElement.style.setProperty('--accent', DEFAULT_SETTINGS.accent)
  }

  /*
   * Ворота выше StoreProvider намеренно.
   *
   * Хранилище начинает грузиться сразу, как только провайдер встал, и мост под
   * ним обязан быть выбран до того. Поставь ворота ниже — и первые чтения ушли
   * бы в браузер, а следующие в облако, то есть данные разъехались бы молча.
   *
   * Настольной программе и ненастроенному облаку ворота ничего не показывают и
   * пропускают дальше сразу.
   */
  createRoot(document.getElementById('root')!).render(
    <Vhod>
      <StoreProvider>
        <ToastProvider>
          {/* Ниже StoreProvider намеренно: данные в памяти и всё автосохранение
              обязаны пережить падение интерфейса. Выше поднимать нельзя. */}
          <Boundary level="window">
            <App />
          </Boundary>
        </ToastProvider>
      </StoreProvider>
    </Vhod>,
  )
})()
