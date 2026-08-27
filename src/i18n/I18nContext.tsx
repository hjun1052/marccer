import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ko } from './dictionary.ts';

export type Lang = 'en' | 'ko';

const STORAGE_KEY = 'marccer:lang';

interface I18nContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  // Looks up `text` (the English UI string, used as the dictionary key) in the
  // active language's dictionary. Falls back to the English text itself when
  // there's no translation yet, so untranslated strings never render blank.
  t: (text: string) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'ko' ? saved : 'ko';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);

  const t = useCallback(
    (text: string) => (lang === 'ko' ? ko[text] ?? text : text),
    [lang]
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
