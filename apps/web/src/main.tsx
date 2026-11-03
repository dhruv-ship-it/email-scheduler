import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import { AppProviders } from './app/providers'
import { AppRouter } from './app/router'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('The #root element is missing from index.html.')

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
)
