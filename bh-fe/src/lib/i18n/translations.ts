export type Language = 'en' | 'ro';

export interface Translations {
  // Common
  common: {
    loading: string;
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    close: string;
    back: string;
    next: string;
    submit: string;
    search: string;
    filter: string;
    export: string;
    import: string;
  };

  // Navigation
  nav: {
    dashboard: string;
    biomarkers: string;
    protocols: string;
    nutrition: string;
    gym: string;
    integrations: string;
    community: string;
    practitioner: string;
    settings: string;
    logout: string;
  };

  // Landing Page
  landing: {
    tagline: string;
    mainHeading: string;
    subHeading: string;
    ctaPrimary: string;
    ctaSecondary: string;
    featuresTitle: string;
    pricingTitle: string;
    pricingSubtitle: string;
    monthly: string;
    annual: string;
    savePercent: string;
    startFree: string;
    startTrial: string;
    contactSales: string;
  };

  // Pricing Tiers
  pricing: {
    explorer: {
      name: string;
      price: string;
      description: string;
      features: string[];
    };
    biohacker: {
      name: string;
      price: string;
      period: string;
      description: string;
      features: string[];
    };
    longevityPro: {
      name: string;
      price: string;
      period: string;
      description: string;
      features: string[];
    };
  };

  // Dashboard
  dashboard: {
    welcome: string;
    longevityScore: string;
    biomarkers: string;
    protocols: string;
    insights: string;
    quickStats: string;
    viewAll: string;
  };

  // Biomarkers
  biomarkers: {
    title: string;
    addNew: string;
    track: string;
    trends: string;
    optimal: string;
    suboptimal: string;
    critical: string;
  };

  // Protocols
  protocols: {
    title: string;
    daily: string;
    weekly: string;
    custom: string;
    createNew: string;
    adherence: string;
  };

  // Settings
  settings: {
    title: string;
    profile: string;
    privacy: string;
    notifications: string;
    billing: string;
    language: string;
    theme: string;
    darkMode: string;
    lightMode: string;
  };

  // Auth
  auth: {
    signIn: string;
    signUp: string;
    email: string;
    password: string;
    forgotPassword: string;
    createAccount: string;
    welcomeBack: string;
    newUser: string;
  };

  // Onboarding
  onboarding: {
    welcome: string;
    healthQuestionnaire: string;
    labUpload: string;
    wearableConnection: string;
    geneticUpload: string;
    complete: string;
  };
}

export const translations: Record<Language, Translations> = {
  en: {
    common: {
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      back: 'Back',
      next: 'Next',
      submit: 'Submit',
      search: 'Search',
      filter: 'Filter',
      export: 'Export',
      import: 'Import',
    },
    nav: {
      dashboard: 'Dashboard',
      biomarkers: 'Biomarkers',
      protocols: 'Protocols',
      nutrition: 'Nutrition',
      gym: 'Gym',
      integrations: 'Integrations',
      community: 'Community',
      practitioner: 'Practitioner',
      settings: 'Settings',
      logout: 'Logout',
    },
    landing: {
      tagline: 'Dual-Engine AI Biohacker Platform',
      mainHeading: 'Reimagine Your Healthspan—Optimize Longevity with AI-powered Insights',
      subHeading: 'Track 150+ biomarkers, get personalized protocols powered and collaborate with top health practitioners — all in one intelligent platform.',
      ctaPrimary: 'Start Free Trial',
      ctaSecondary: 'Watch Demo',
      featuresTitle: 'Everything you need to optimize',
      pricingTitle: 'Choose your performance level',
      pricingSubtitle: 'PRICING TIERS',
      monthly: 'Monthly',
      annual: 'Annual',
      savePercent: 'SAVE 20%',
      startFree: 'Start Free',
      startTrial: 'Start Trial',
      contactSales: 'Contact Sales',
    },
    pricing: {
      explorer: {
        name: 'Explorer',
        price: 'Free',
        description: 'Perfect for getting started with longevity tracking',
        features: [
          'Up to 20 biomarkers',
          'Basic wearable integrations',
          'Weekly dual-engine insights (OpenBioLLM + Gemini)',
          'Community access',
          'Manual data entry',
        ],
      },
      biohacker: {
        name: 'Biohacker',
        price: '$20',
        period: '/month',
        description: 'For serious optimizers who want it all',
        features: [
          'Up to 150 biomarkers',
          'All wearable integrations',
          'Daily dual-engine insights (OpenBioLLM + Gemini)',
          'Advanced protocols with cross-checked recommendations',
          'Practitioner collaboration',
          'Lab result parsing with dual AI verification',
          'Priority support',
        ],
      },
      longevityPro: {
        name: 'Longevity Pro',
        price: '$50',
        period: '/month',
        description: 'Enterprise-grade for coaches & practitioners',
        features: [
          'Unlimited biomarkers',
          'White-label options',
          'Client management suite',
          'API access',
          'Custom protocols',
          'Dedicated account manager',
          '24/7 priority support',
        ],
      },
    },
    dashboard: {
      welcome: 'Welcome back',
      longevityScore: 'Longevity Score',
      biomarkers: 'Biomarkers',
      protocols: 'Protocols',
      insights: 'Insights',
      quickStats: 'Quick Stats',
      viewAll: 'View All',
    },
    biomarkers: {
      title: 'Biomarkers',
      addNew: 'Add New',
      track: 'Track',
      trends: 'Trends',
      optimal: 'Optimal',
      suboptimal: 'Suboptimal',
      critical: 'Critical',
    },
    protocols: {
      title: 'Protocols',
      daily: 'Daily',
      weekly: 'Weekly',
      custom: 'Custom',
      createNew: 'Create New',
      adherence: 'Adherence',
    },
    settings: {
      title: 'Settings',
      profile: 'Profile',
      privacy: 'Privacy',
      notifications: 'Notifications',
      billing: 'Billing',
      language: 'Language',
      theme: 'Theme',
      darkMode: 'Dark Mode',
      lightMode: 'Light Mode',
    },
    auth: {
      signIn: 'Sign In',
      signUp: 'Sign Up',
      email: 'Email',
      password: 'Password',
      forgotPassword: 'Forgot Password?',
      createAccount: 'Create Account',
      welcomeBack: 'Welcome Back',
      newUser: 'New User',
    },
    onboarding: {
      welcome: 'Welcome to BioHax',
      healthQuestionnaire: 'Health Questionnaire',
      labUpload: 'Lab Results Upload',
      wearableConnection: 'Connect Wearables',
      geneticUpload: 'Genetic Data Upload',
      complete: 'Complete Setup',
    },
  },
  ro: {
    common: {
      loading: 'Se încarcă...',
      save: 'Salvează',
      cancel: 'Anulează',
      delete: 'Șterge',
      edit: 'Editează',
      close: 'Închide',
      back: 'Înapoi',
      next: 'Următorul',
      submit: 'Trimite',
      search: 'Caută',
      filter: 'Filtrează',
      export: 'Exportă',
      import: 'Importă',
    },
    nav: {
      dashboard: 'Tablou de bord',
      biomarkers: 'Biomarkeri',
      protocols: 'Protocoale',
      nutrition: 'Nutriție',
      gym: 'Antrenament',
      integrations: 'Integrări',
      community: 'Comunitate',
      practitioner: 'Practician',
      settings: 'Setări',
      logout: 'Deconectare',
    },
    landing: {
      tagline: 'Platformă Biohacker cu Dual-Engine AI',
      mainHeading: 'Reimaginează Durata Ta de Viață Sănătoasă—Optimizează Longevitatea cu Insights AI',
      subHeading: 'Urmărește 150+ biomarkeri, primește protocoale personalizate și colaborează cu specialiști de top — totul într-o singură platformă inteligentă.',
      ctaPrimary: 'Începe perioada gratuită',
      ctaSecondary: 'Vizionează Demo',
      featuresTitle: 'Tot ce ai nevoie pentru a optimiza',
      pricingTitle: 'Alege-ți nivelul de performanță',
      pricingSubtitle: 'PLANURI DE PREȚ',
      monthly: 'Lunar',
      annual: 'Anual',
      savePercent: 'ECONOMISEȘTE 20%',
      startFree: 'Începe Gratuit',
      startTrial: 'Începe Perioada de Probă',
      contactSales: 'Contactează Vânzările',
    },
    pricing: {
      explorer: {
        name: 'Explorer',
        price: 'Gratuit',
        description: 'Perfect pentru a începe urmărirea longevității',
        features: [
          'Până la 20 biomarkeri',
          'Integrări de bază cu dispozitive',
          'Insights săptămânale dual-engine (OpenBioLLM + Gemini)',
          'Acces la comunitate',
          'Introducere manuală a datelor',
        ],
      },
      biohacker: {
        name: 'Biohacker',
        price: '$20',
        period: '/lună',
        description: 'Pentru optimizatori serioși care vor totul',
        features: [
          'Până la 150 biomarkeri',
          'Toate integrările cu dispozitive',
          'Insights zilnice dual-engine (OpenBioLLM + Gemini)',
          'Protocoale avansate cu recomandări verificate încrucișat',
          'Colaborare cu practicieni',
          'Parsare rezultate laborator cu verificare dual AI',
          'Suport prioritar',
        ],
      },
      longevityPro: {
        name: 'Longevity Pro',
        price: '$50',
        period: '/lună',
        description: 'Nivel enterprise pentru antrenori și practicieni',
        features: [
          'Biomarkeri nelimitați',
          'Opțiuni white-label',
          'Suite management clienți',
          'Acces API',
          'Protocoale personalizate',
          'Manager de cont dedicat',
          'Suport prioritar 24/7',
        ],
      },
    },
    dashboard: {
      welcome: 'Bun venit înapoi',
      longevityScore: 'Scor Longevitate',
      biomarkers: 'Biomarkeri',
      protocols: 'Protocoale',
      insights: 'Insights',
      quickStats: 'Statistici Rapide',
      viewAll: 'Vezi Tot',
    },
    biomarkers: {
      title: 'Biomarkeri',
      addNew: 'Adaugă Nou',
      track: 'Urmărește',
      trends: 'Tendințe',
      optimal: 'Optimal',
      suboptimal: 'Suboptimal',
      critical: 'Critic',
    },
    protocols: {
      title: 'Protocoale',
      daily: 'Zilnic',
      weekly: 'Săptămânal',
      custom: 'Personalizat',
      createNew: 'Creează Nou',
      adherence: 'Aderență',
    },
    settings: {
      title: 'Setări',
      profile: 'Profil',
      privacy: 'Confidențialitate',
      notifications: 'Notificări',
      billing: 'Facturare',
      language: 'Limbă',
      theme: 'Temă',
      darkMode: 'Mod Întunecat',
      lightMode: 'Mod Luminos',
    },
    auth: {
      signIn: 'Autentificare',
      signUp: 'Înregistrare',
      email: 'Email',
      password: 'Parolă',
      forgotPassword: 'Ai uitat parola?',
      createAccount: 'Crează Cont',
      welcomeBack: 'Bun Venit Înapoi',
      newUser: 'Utilizator Nou',
    },
    onboarding: {
      welcome: 'Bine ai venit la BioHax',
      healthQuestionnaire: 'Chestionar de Sănătate',
      labUpload: 'Încărcare Rezultate Laborator',
      wearableConnection: 'Conectare Dispozitive',
      geneticUpload: 'Încărcare Date Genetice',
      complete: 'Finalizare Configurare',
    },
  },
};
