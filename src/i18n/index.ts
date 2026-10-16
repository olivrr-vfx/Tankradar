import { useCallback } from 'react';
import { useSettings, type Lang } from '../store/settings';
import { de, type Dict } from './de';
import { en } from './en';

export type TKey = keyof Dict;
const dicts: Record<Lang, Dict> = { de, en };

export function translate(lang: Lang, key: TKey | string, vars?: Record<string, string | number>): string {
  const d = dicts[lang] ?? de;
  let s = (d as Record<string, string>)[key] ?? (de as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const lang = useSettings((s) => s.lang);
  return useCallback((key: TKey | string, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
}

export const useLang = () => useSettings((s) => s.lang);
