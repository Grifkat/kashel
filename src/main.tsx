import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './state/store'
import { ToastProvider } from './components/ui'
import { Boundary } from './components/Boundary'
import './styles/app.css'
import './styles/themes.css'
import './styles/effects.css'
import './styles/canvas.css'

createRoot(document.getElementById('root')!).render(
  <StoreProvider>
    <ToastProvider>
      {/* Ниже StoreProvider намеренно: данные в памяти и всё автосохранение
          обязаны пережить падение интерфейса. Выше поднимать нельзя. */}
      <Boundary level="window">
        <App />
      </Boundary>
    </ToastProvider>
  </StoreProvider>,
)
