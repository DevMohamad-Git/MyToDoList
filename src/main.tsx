import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { initI18n } from '@/i18n'
import { initAppearance } from '@/stores/appearance'
import 'vazirmatn/Vazirmatn-font-face.css'
import '@/index.css'

/**
 * Entry point.
 *
 * Appearance and language are applied before React mounts so the first paint
 * already has the right theme, accent, density *and* text direction — the
 * inline script in `index.html` covers the pre-JS window, and these calls take
 * over once the stores hydrate.
 */
initAppearance()
initI18n()

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
