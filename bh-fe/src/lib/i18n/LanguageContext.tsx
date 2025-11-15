import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import type { Language, Translations } from './translations';
import { translations } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  // Initialize language from localStorage after mount
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('language');
      if (saved === 'ro' || saved === 'en') {
        setLanguageState(saved);
      }
    } catch (error) {
      console.error('Failed to load language preference:', error);
    }
  }, []);

  useEffect(() => {
    // Save language preference to localStorage
    if (mounted) {
      try {
        localStorage.setItem('language', language);
      } catch (error) {
        console.error('Failed to save language preference:', error);
      }
    }
  }, [language, mounted]);

  const value = useMemo<LanguageContextType>(() => ({
    language,
    setLanguage: setLanguageState,
    t: translations[language],
  }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

// Convenience hook for just getting translations
export function useTranslation(): Translations {
  const { t } = useLanguage();
  return t;
}
