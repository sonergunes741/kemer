/**
 * Minimal localisation. UI chrome strings live in dictionaries registered by the UI module
 * (src/i18n/tr.ts, src/i18n/en.ts). Game content (orders, notes, hints) is authored as
 * LocalText objects and resolved with `lt()`.
 */
import type { Lang, LocalText } from './types';

export type Dictionary = Readonly<Record<string, string>>;

const dictionaries: Record<Lang, Record<string, string>> = { tr: {}, en: {} };
const listeners = new Set<(lang: Lang) => void>();
let current: Lang = 'tr';

export function registerStrings(lang: Lang, dict: Dictionary): void {
  Object.assign(dictionaries[lang], dict);
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang !== 'tr' && lang !== 'en') return;
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

/** Subscribe to language changes. Returns an unsubscribe function. */
export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Preferred language from the browser: Turkish for any tr-* locale, otherwise English. */
export function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'tr';
  const langs = navigator.languages && navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const l of langs) {
    if (typeof l === 'string' && l.toLowerCase().startsWith('tr')) return 'tr';
  }
  return 'en';
}

/**
 * Look up a UI string. `{name}` placeholders are replaced from `vars` (callers format numbers
 * with core/format first). Falls back to English, then Turkish, then the key itself.
 */
export function t(key: string, vars?: Readonly<Record<string, string | number>>): string {
  const raw = dictionaries[current][key] ?? dictionaries.en[key] ?? dictionaries.tr[key] ?? key;
  return vars ? interpolate(raw, vars) : raw;
}

/** True when a key exists in the given language's dictionary. */
export function hasString(lang: Lang, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(dictionaries[lang], key);
}

/** Resolve authored bilingual content for the current language. */
export function lt(text: LocalText, vars?: Readonly<Record<string, string | number>>): string {
  const raw = text[current] || text.en || text.tr;
  return vars ? interpolate(raw, vars) : raw;
}

export function interpolate(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    return v === undefined ? match : String(v);
  });
}

/** Turkish-aware upper case (i → İ, ı → I) for headings. */
export function upper(text: string, lang: Lang = current): string {
  return text.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-GB');
}
