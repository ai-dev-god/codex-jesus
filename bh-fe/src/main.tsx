import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

const pwaEnabled = import.meta.env.VITE_ENABLE_PWA !== 'false'

if (pwaEnabled) {
  import('virtual:pwa-register')
    .then(({ registerSW }) =>
      registerSW({
        immediate: true,
        onNeedRefresh() {
          console.info('BioHax PWA: new content available, reload to update.')
        },
        onOfflineReady() {
          console.info('BioHax PWA: offline cache is ready.')
        },
      })
    )
    .catch((error) => {
      console.warn('BioHax PWA: failed to register service worker', error)
    })
} else if (import.meta.env.DEV) {
  console.info('BioHax PWA: service worker disabled for this environment.')
}
