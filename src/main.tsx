import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './state/store'
import { ToastProvider } from './components/ui'
import { Boundary } from './components/Boundary'
import { Vhod } from './components/Vhod'
import { DEFAULT_SETTINGS } from './state/defaults'
import './styles/app.css'
import './styles/themes.css'
import './styles/effects.css'
import './styles/canvas.css'

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
