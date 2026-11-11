/** Locale-aware formatting of numbers, durations, notes and dates (Turkish and English). */
import { getLang } from './i18n';
import type { Lang } from './types';

const LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-GB' };

const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormat(lang: Lang, digits: number): Intl.NumberFormat {
  const key = `${lang}:${digits}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[lang], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    numberFormats.set(key, f);
  }
  return f;
}

/** 4.2 → "4,2" (tr) / "4.2" (en). Non-finite values render as an em dash. */
export function formatNumber(value: number, digits = 0, lang: Lang = getLang()): string {
  if (!Number.isFinite(value)) return '—';
  return numberFormat(lang, digits).format(value);
}

/** Ring length: "4,2 sn" / "4.2 s". */
export function formatSeconds(seconds: number, digits = 1, lang: Lang = getLang()): string {
  return `${formatNumber(seconds, digits, lang)}${lang === 'tr' ? ' sn' : ' s'}`;
}

/** 0.82 → "%82" (tr) / "82%" (en). */
export function formatPercent(fraction: number, lang: Lang = getLang()): string {
  const n = formatNumber(fraction * 100, 0, lang);
  return lang === 'tr' ? `%${n}` : `${n}%`;
}

export function formatHz(hz: number, lang: Lang = getLang()): string {
  return `${formatNumber(hz, 0, lang)} Hz`;
}

/** Signed cents: "+12 sent" / "+12 cents". */
export function formatCents(c: number, lang: Lang = getLang()): string {
  const r = Math.round(c);
  const sign = r > 0 ? '+' : r < 0 ? '−' : '±';
  return `${sign}${formatNumber(Math.abs(r), 0, lang)} ${lang === 'tr' ? 'sent' : 'cents'}`;
}

const NOTE_NAMES: Record<Lang, readonly string[]> = {
  tr: ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'],
  en: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
};

export interface NoteInfo {
  /** 0 = C/Do … 11 = B/Si */
  index: number;
  octave: number;
  /** Deviation from the equal-tempered note, −50..+50. */
  cents: number;
  midi: number;
}

/** Nearest equal-tempered note (A4 = 440 Hz). */
export function noteOf(frequency: number): NoteInfo | null {
  if (!(frequency > 0) || !Number.isFinite(frequency)) return null;
  const exact = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(exact);
  const index = ((midi % 12) + 12) % 12;
  return { index, octave: Math.floor(midi / 12) - 1, cents: (exact - midi) * 100, midi };
}

/** 1318.5 Hz → "Mi6" (tr) / "E6" (en). */
export function formatNote(frequency: number, lang: Lang = getLang()): string {
  const n = noteOf(frequency);
  if (!n) return '—';
  return `${NOTE_NAMES[lang][n.index] ?? '?'}${n.octave}`;
}

/** Local calendar date as YYYY-MM-DD (used for daily seeds and shelf dates). */
export function isoDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "2026-11-09" or a full ISO timestamp → "9 Kasım 2026" / "9 November 2026". */
export function formatDate(iso: string, lang: Lang = getLang()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  } catch {
    return iso.slice(0, 10);
  }
}
