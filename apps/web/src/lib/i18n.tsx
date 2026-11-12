// Tiny i18n: t('English text') looks the English string up in the active
// dictionary and falls back to English. Dictionaries live in ./locales.
// {name}-style placeholders are substituted from the second argument.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { kn } from './locales/kn';
import { hi } from './locales/hi';

export type Lang = 'en' | 'kn' | 'hi';
const DICTS: Record<Lang, Record<string, string>> = { en: {}, kn, hi };
const KEY = 'getme.lang';

type T = (s: string, vars?: Record<string, string | number>) => string;
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T }>({ lang: 'en', setLang: () => {}, t: s => s });

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => { try { return (initial ?? (localStorage.getItem(KEY) as Lang) ?? 'en'); } catch { return initial ?? 'en'; } });
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l); } catch { /* ignore */ } document.documentElement.lang = l; }, []);
  const t = useCallback<T>((s, vars) => {
    let out = DICTS[lang][s] ?? s;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
    return out;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx);
/** Plain function for non-React code (uses the saved language). */
export function tStatic(s: string): string { try { const l = (localStorage.getItem(KEY) as Lang) || 'en'; return DICTS[l][s] ?? s; } catch { return s; } }
