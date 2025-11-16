import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerSW({
  immediate: true,
  onNeedRefresh() {
    console.info('BioHax PWA: new content available, reload to update.');
  },
  onOfflineReady() {
    console.info('BioHax PWA: offline cache is ready.');
  },
});
