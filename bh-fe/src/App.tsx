import { LanguageProvider } from './lib/i18n/LanguageContext';
import AppContent from './components/app/AppContent';

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
