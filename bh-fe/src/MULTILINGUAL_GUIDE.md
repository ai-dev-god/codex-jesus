# Multilingual System Guide

## Overview

The BioHax Human Performance OS platform now supports multiple languages (English and Romanian) with a comprehensive internationalization (i18n) system.

## Features

- **Two Languages**: English (en) and Romanian (ro)
- **Persistent Language Selection**: User's language choice is saved in localStorage
- **Easy Language Switching**: Visual language switcher component in header
- **Type-Safe Translations**: Full TypeScript support for all translation keys
- **Comprehensive Coverage**: Translations for all major UI elements

## Architecture

### File Structure

```
lib/i18n/
├── translations.ts          # Translation definitions and content
└── LanguageContext.tsx      # React context and hooks
```

### Key Components

1. **LanguageProvider** (`lib/i18n/LanguageContext.tsx`)
   - Wraps the entire application
   - Manages current language state
   - Persists language choice to localStorage

2. **Translation Files** (`lib/i18n/translations.ts`)
   - Contains all translation strings
   - Organized by feature area
   - Type-safe structure

3. **LanguageSwitcher** (`components/layout/LanguageSwitcher.tsx`)
   - Dropdown UI component
   - Shows current language
   - Allows switching between languages

## Usage

### In Components

```tsx
import { useTranslation } from '../../lib/i18n/LanguageContext';

function MyComponent() {
  const t = useTranslation();
  
  return (
    <div>
      <h1>{t.landing.mainHeading}</h1>
      <button>{t.common.save}</button>
    </div>
  );
}
```

### Available Translation Sections

- **common**: Loading, save, cancel, delete, etc.
- **nav**: Dashboard, biomarkers, protocols, etc.
- **landing**: Main landing page content
- **pricing**: Pricing tier information
- **dashboard**: Dashboard-specific labels
- **biomarkers**: Biomarker tracking labels
- **protocols**: Protocol management labels
- **settings**: Settings page labels
- **auth**: Authentication labels
- **onboarding**: Onboarding flow labels

## Adding New Translations

### 1. Update Type Definition

In `lib/i18n/translations.ts`, add to the `Translations` interface:

```tsx
export interface Translations {
  // ... existing sections
  myNewSection: {
    myKey: string;
    anotherKey: string;
  };
}
```

### 2. Add English Translations

```tsx
export const translations: Record<Language, Translations> = {
  en: {
    // ... existing sections
    myNewSection: {
      myKey: 'My English Text',
      anotherKey: 'Another Text',
    },
  },
  // ...
}
```

### 3. Add Romanian Translations

```tsx
export const translations: Record<Language, Translations> = {
  // ...
  ro: {
    // ... existing sections
    myNewSection: {
      myKey: 'Textul meu în română',
      anotherKey: 'Alt text',
    },
  },
}
```

## Adding More Languages

To add a new language (e.g., Spanish):

### 1. Update Language Type

```tsx
export type Language = 'en' | 'ro' | 'es';
```

### 2. Add Translation Object

```tsx
export const translations: Record<Language, Translations> = {
  en: { /* ... */ },
  ro: { /* ... */ },
  es: {
    common: {
      loading: 'Cargando...',
      save: 'Guardar',
      // ... all other keys
    },
    // ... all other sections
  },
}
```

### 3. Update LanguageSwitcher

In `components/layout/LanguageSwitcher.tsx`:

```tsx
<DropdownMenuItem
  onClick={() => setLanguage('es')}
  className={language === 'es' ? 'bg-electric/10' : ''}
>
  <span className="mr-2">🇪🇸</span>
  Español
</DropdownMenuItem>
```

## Current Implementation Status

### ✅ Fully Translated

- Landing Page (hero, features, pricing)
- Navigation Menu
- Header Components
- Auth Screens
- Common UI Elements

### 🚧 Partially Translated

- Dashboard
- Settings Page
- Protocols View

### ⏳ Not Yet Translated

- Community Feed
- Practitioner Workspace
- Integrations Page
- Gym Workout Creator
- Nutrition View

## Best Practices

1. **Always use translation keys** - Never hardcode user-facing strings
2. **Keep keys organized** - Group related translations logically
3. **Use descriptive names** - Make translation keys self-documenting
4. **Test both languages** - Verify layouts work with different text lengths
5. **Update both languages** - When adding new keys, translate to all languages

## Language Switcher Locations

The LanguageSwitcher component is currently available in:

1. **Landing Page Header** (desktop view)
2. **Landing Page Mobile Menu**
3. **Dashboard Header** (authenticated view)

## Technical Details

### LocalStorage Key

Language preference is stored as: `language` with values `'en'` or `'ro'`

### Default Language

If no preference is set, the system defaults to English (`'en'`)

### Context Provider

The `LanguageProvider` is set up in `main.tsx` and wraps the entire application, ensuring all components have access to translations.

## Troubleshooting

### "useLanguage must be used within a LanguageProvider" Error

This error occurs when:
- A component uses `useTranslation()` outside the LanguageProvider
- The LanguageProvider is not properly set up in the component tree

**Solution**: Ensure `LanguageProvider` wraps your app in `main.tsx`

### Translations Not Updating

If translations don't update after changing language:
- Check browser console for errors
- Verify localStorage contains the correct language
- Ensure component is re-rendering after language change

## Future Enhancements

Potential improvements to consider:

1. **Browser Language Detection**: Auto-detect user's preferred language
2. **Date/Time Formatting**: Locale-specific date and time displays
3. **Number Formatting**: Locale-specific number and currency formatting
4. **RTL Support**: Right-to-left language support
5. **Dynamic Loading**: Load translation files on-demand
6. **Translation Management**: External translation management service
7. **Pluralization**: Smart handling of singular/plural forms
8. **Interpolation**: Variable substitution in translation strings

## Support

For issues or questions about the multilingual system, please refer to the main project documentation or contact the development team.
