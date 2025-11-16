## BioHax PWA Implementation Notes

### Overview
- Vite + `vite-plugin-pwa` now builds a `generateSW` service worker with precached app shell, offline fallback, and runtime caching tuned for HTML, static assets, media, and `/api/` traffic (network only with background sync queue).
- Manifest metadata (name, shortcuts, icons, theme) is managed inside `vite.config.ts`; update that file if new locales or actions are introduced.
- Icon suite lives in `bh-fe/public/icons`. Assets cover Android (192/512), iOS (180), maskable variants, and monochrome notification artwork.

### Build & Deployment
- PWA is enabled in both `dev` and `build` commands (`devOptions.enabled`). During development, use Chrome Application tab → Service Workers to trigger `skipWaiting`.
- CI/CD must ensure the `public/icons` directory and `offline.html` are deployed; `vite build` outputs the manifest and SW automatically.
- Cache versioning is handled by Workbox; purging caches just requires clients to close/reopen or `self.skipWaiting()` in the Application panel.

### Install UX
- Android / Desktop Chromium: `virtual:pwa-register` bootstrap + custom CTA banner (`PwaInstallBanner`) listens for `beforeinstallprompt` and lets users trigger install after 2+ visits.
- iOS Safari: banner shows manual “Share → Add to Home Screen” instructions since Apple does not emit the install prompt.
- Manifest shortcuts: `/#cta` and `/#pricing` anchor IDs exist on the landing page for jump navigation after install.

### Notifications & Background Work (next iterations)
- Push: configure VAPID keys (Chrome) + APNs web push certificate (Safari 16.4+). Store tokens in backend with HIPAA-compliant scope flags before enabling production pushes.
- Background sync: queue sensitive POSTs (e.g., contact/demo forms) inside `/api/` routes once endpoints are finalized. Current queue placeholder is `biohax-api-queue`.
- Periodic background sync can refresh testimonial/pricing sections; requires origin trial for Chrome until the API fully stabilizes.

### QA Checklist
1. `npm run build && npm run preview` → Lighthouse PWA score ≥ 95 on mobile + desktop.
2. Chrome/Edge (Android + desktop) – verify install prompt, offline fallback, shortcut deep links, and cache update flow.
3. Safari iOS 16.4+ – Add to Home Screen instructions, app launches full screen, theme color + icons render crisply.
4. Regression: ensure service worker excludes authenticated API responses (NetworkOnly) and respects HIPAA caching constraints.

### Operational Follow-ups
- Observe `install` and `appinstalled` events in analytics (e.g., Segment/GA) to track CTA effectiveness.
- Decide whether marketing pages need server-rendered prerender for SEO; Workbox config will need route-level adjustments if SSR is introduced.
- When enabling push, document consent text inside Privacy Center and update `docs/privacy-audit` accordingly.

