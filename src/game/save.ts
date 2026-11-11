/**
 * Saves: one versioned JSON document under SAVE_KEY. Loading never throws and never loses a
 * player's progress to one bad field: every field is checked on its own and falls back to its
 * default. Unreadable or future-version data is kept aside under a second key, not overwritten.
 */
import type { KeyValueStorage, SaveStore } from '../core/contracts';
import { SAVE_KEY, defaultSettings, emptySave } from '../core/config';
import { log } from '../core/log';
import type { BridgeDesign, FamilyMark, Lang, LevelId, LevelRecord, SaveData, Settings } from '../core/types';

type Obj = Record<string, unknown>;

const LEVEL_IDS: readonly LevelId[] = ['koramaz', 'zamanti', 'kizilirmak', 'yesilirmak', 'dicle', 'batman', 'aras', 'arpacay', 'firtina', 'sakarya', 'tunca', 'ergene', 'epilogue', 'daily', 'millennium'];

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const int = (v: unknown, d: number, lo = 0): number => Math.max(lo, Math.round(num(v, d)));

function sanitizeMark(v: unknown): FamilyMark | null {
  if (!isObj(v) || !Array.isArray(v.strokes)) return null;
  const strokes: [number, number][] = [];
  for (const s of v.strokes) {
    if (!Array.isArray(s) || s.length !== 2) continue;
    const a = s[0];
    const b = s[1];
    if (typeof a === 'number' && typeof b === 'number' && a >= 0 && a <= 8 && b >= 0 && b <= 8 && a !== b) strokes.push([a, b]);
  }
  return strokes.length > 0 ? { strokes } : null;
}

/** A design is only shape-checked here; the simulation's normalize makes it consistent on use. */
function sanitizeDesign(v: unknown): BridgeDesign | null {
  if (!isObj(v) || !Array.isArray(v.spans) || !Array.isArray(v.piers) || v.spans.length === 0) return null;
  return v as unknown as BridgeDesign;
}

function sanitizeRecord(v: unknown): LevelRecord | null {
  if (!isObj(v)) return null;
  const seals = isObj(v.seals) ? v.seals : {};
  const mark = isObj(v.markStone) ? { span: int(v.markStone.span, 0), stone: int(v.markStone.stone, 0) } : null;
  const witnessed = Array.isArray(v.witnessed) ? v.witnessed.filter((y): y is number => typeof y === 'number' && Number.isFinite(y)) : [];
  const stones = v.bestStones;
  return {
    bestYears: Math.max(0, num(v.bestYears, 0)),
    bestStones: typeof stones === 'number' && Number.isFinite(stones) ? stones : null,
    seals: { standing: bool(seals.standing, false), lean: bool(seals.lean, false), unrepaired: bool(seals.unrepaired, false) },
    masterwork: bool(v.masterwork, false),
    passed: bool(v.passed, false),
    attempts: int(v.attempts, 0),
    design: sanitizeDesign(v.design),
    markStone: mark,
    witnessed: [...new Set(witnessed)].sort((a, b) => a - b),
  };
}

function sanitizeSettings(v: unknown, lang: Lang): Settings {
  const d = defaultSettings(lang);
  if (!isObj(v)) return d;
  const q = v.quality;
  return {
    lang: v.lang === 'tr' || v.lang === 'en' ? v.lang : d.lang,
    master: Math.min(1, Math.max(0, num(v.master, d.master))),
    music: Math.min(1, Math.max(0, num(v.music, d.music))),
    effects: Math.min(1, Math.max(0, num(v.effects, d.effects))),
    quality: q === 'low' || q === 'medium' || q === 'high' || q === 'auto' ? q : d.quality,
    units: v.units === 'arsin' ? 'arsin' : 'metre',
    reducedMotion: bool(v.reducedMotion, d.reducedMotion),
    ambientLife: bool(v.ambientLife, d.ambientLife),
    textScale: Math.min(1.6, Math.max(0.8, num(v.textScale, d.textScale))),
    highContrast: bool(v.highContrast, d.highContrast),
  };
}

/** Whatever came out of storage, as a valid SaveData. */
export function sanitizeSave(raw: unknown, lang: Lang): SaveData {
  const out = emptySave(lang);
  if (!isObj(raw)) return out;
  out.mark = sanitizeMark(raw.mark);
  if (isObj(raw.levels)) {
    for (const id of LEVEL_IDS) {
      const r = sanitizeRecord(raw.levels[id]);
      if (r) out.levels[id] = r;
    }
  }
  if (Array.isArray(raw.taught)) out.taught = [...new Set(raw.taught.filter((s): s is string => typeof s === 'string'))];
  out.epilogueDone = bool(raw.epilogueDone, false);
  if (isObj(raw.daily)) {
    const best: Record<string, number> = {};
    if (isObj(raw.daily.best)) for (const [k, n] of Object.entries(raw.daily.best)) if (typeof n === 'number' && Number.isFinite(n)) best[k] = n;
    out.daily = { last: typeof raw.daily.last === 'string' ? raw.daily.last : '', streak: int(raw.daily.streak, 0), best };
  }
  if (isObj(raw.millennium)) {
    const s = raw.millennium.bestStones;
    out.millennium = { bestStones: typeof s === 'number' && Number.isFinite(s) ? s : null, bestYears: Math.max(0, num(raw.millennium.bestYears, 0)) };
  }
  out.settings = sanitizeSettings(raw.settings, lang);
  return out;
}

export function createSaveStore(storage: KeyValueStorage, lang: Lang, key: string = SAVE_KEY): SaveStore {
  /** Keep what we could not read, once, so a later version (or a person) can still recover it. */
  const setAside = (raw: string, why: string): void => {
    const aside = `${key}.${why}`;
    if (storage.get(aside) === null) storage.set(aside, raw);
  };
  return {
    load(): SaveData {
      const raw = storage.get(key);
      if (raw === null || raw === '') return emptySave(lang);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        log.warn('save', 'save data unreadable; starting fresh and keeping a copy', err);
        setAside(raw, 'damaged');
        return emptySave(lang);
      }
      const v = isObj(parsed) ? parsed.v : undefined;
      if (typeof v === 'number' && v > 1) {
        log.warn('save', `save from a newer version (${v}); starting fresh and keeping it aside`);
        setAside(raw, `v${v}`);
        return emptySave(lang);
      }
      return sanitizeSave(parsed, lang);
    },
    save(data: SaveData): void {
      try {
        storage.set(key, JSON.stringify(data));
      } catch (err) {
        log.once('save:write', 'save', 'could not write the save', err);
      }
    },
    erase(): void {
      storage.remove(key);
    },
  };
}

/** A storage that only lives in memory (tests, harness runs that must not touch the real save). */
export function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

/** Prefix every key, so a harness can keep its own save beside the player's. */
export function prefixedStorage(inner: KeyValueStorage, prefix: string): KeyValueStorage {
  return {
    get: (k) => inner.get(prefix + k),
    set: (k, v) => inner.set(prefix + k, v),
    remove: (k) => inner.remove(prefix + k),
  };
}
