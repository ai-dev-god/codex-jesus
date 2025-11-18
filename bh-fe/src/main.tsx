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
          // Check for updates immediately and then every 2 minutes
          if (registration) {
            registration.update()
            setInterval(() => {
              registration.update()
            }, 2 * 60 * 1000)
          }
        },
      })
    )
    .catch((error) => {
      console.warn('BioHax PWA: failed to register service worker', error)
    })
} else if (import.meta.env.DEV) {
  console.info('BioHax PWA: service worker disabled for this environment.')
}

// Force cache clear for old bundles - check if we're using a known old bundle hash
if (typeof window !== 'undefined') {
  const scripts = Array.from(document.querySelectorAll('script[src]'))
  const oldBundleHashes = ['Bw_tlKFb', 'ClBEMkN_', 'XyjXqsre']
  const hasOldBundle = scripts.some(script => {
    const src = script.getAttribute('src') || ''
    return oldBundleHashes.some(hash => src.includes(hash))
  })
  
  if (hasOldBundle) {
    console.warn('[BioHax] Detected old bundle, forcing cache clear and reload...')
    // Clear all caches
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name))
      })
    }
    // Unregister service worker if present
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister())
      })
    }
    // Force reload after a short delay
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }
}
