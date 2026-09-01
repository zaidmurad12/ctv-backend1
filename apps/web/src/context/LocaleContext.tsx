import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { dictionaries, type Locale, type TranslationKey } from '../lib/i18n/strings';

export interface LocaleContextValue {
  readonly locale: Locale;
  readonly dir: 'ltr' | 'rtl';
  readonly t: (key: TranslationKey) => string;
  readonly toggleLocale: () => void;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

const STORAGE_KEY = 'ctv.locale';

export function LocaleProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ar') {
      setLocale(stored);
    }
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const dict = dictionaries[locale];
    return {
      locale,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      t: (key) => dict[key] ?? key,
      toggleLocale: () => {
        setLocale((current) => {
          const next: Locale = current === 'en' ? 'ar' : 'en';
          window.localStorage.setItem(STORAGE_KEY, next);
          return next;
        });
      },
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
