import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { en, es, type StringKey } from '@/i18n/strings';

export type Language = 'es' | 'en';
export type LanguagePreference = Language | 'system';

const KEY = 'exalto.language.v1';
const TABLES: Record<Language, Record<StringKey, string>> = { en, es };

/** The phone's language, via Intl (no native module needed). Anything not English uses Spanish. */
function deviceLanguage(): Language {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? 'es';
    return tag.toLowerCase().startsWith('en') ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

type Vars = Record<string, string | number>;

type LocaleState = {
  language: Language;
  preference: LanguagePreference;
  setPreference: (p: LanguagePreference) => void;
  t: (key: StringKey, vars?: Vars) => string;
  /** Picks `<key>.one` or `<key>.other` for the count. */
  plural: (key: 'library.count', count: number) => string;
};

const LocaleContext = createContext<LocaleState | null>(null);

function format(template: string, vars?: Vars) {
  return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : template;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPref] = useState<LanguagePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'es' || v === 'en' || v === 'system') setPref(v);
      })
      .catch(() => {});
  }, []);

  const setPreference = useCallback((p: LanguagePreference) => {
    setPref(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  }, []);

  const language: Language = preference === 'system' ? deviceLanguage() : preference;

  const value = useMemo<LocaleState>(() => {
    const table = TABLES[language];
    const t = (key: StringKey, vars?: Vars) => format(table[key] ?? en[key], vars);
    return {
      language,
      preference,
      setPreference,
      t,
      plural: (key, count) => t(`${key}.${count === 1 ? 'one' : 'other'}` as StringKey, { count }),
    };
  }, [language, preference, setPreference]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside LocaleProvider');
  return ctx;
}

/** "Verse 1" / "Estrofa 1", "Chorus" / "Coro"… for a lyric section. */
export function useSectionLabel() {
  const { t } = useLocale();
  return (s: { type: 'verse' | 'chorus' | 'bridge'; number?: number }) =>
    s.type === 'chorus' ? t('lyrics.chorus') : s.type === 'bridge' ? t('lyrics.bridge') : t('lyrics.verse', { number: s.number ?? '' }).trim();
}
