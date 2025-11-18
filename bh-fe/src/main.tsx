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
          console.info('BioHax PWA: new content available, reloading to update.')
          // Force reload to get latest bundle with CORS fixes
          window.location.reload()
        },
        onOfflineReady() {
          console.info('BioHax PWA: offline cache is ready.')
        },
        onRegistered(registration) {
          // Check for updates every 5 minutes
          setInterval(() => {
            registration?.update()
          }, 5 * 60 * 1000)
        },
      })
    )
    .catch((error) => {
      console.warn('BioHax PWA: failed to register service worker', error)
    })
} else if (import.meta.env.DEV) {
  console.info('BioHax PWA: service worker disabled for this environment.')
}
