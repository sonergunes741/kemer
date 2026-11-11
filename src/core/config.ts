/** Shared configuration: storage keys, default settings and the quality presets. Owned by the lead. */
import type { QualityId, SaveData, Settings } from './types';

export const SAVE_KEY = 'kemer.save.v1';
export const END_YEAR = 2026;
/** The Ottoman architect's cubit (mimar arşını), metres. */
export const ARSIN = 0.758;
/** One parmak is a twenty-fourth of an arşın. */
export const PARMAK = ARSIN / 24;

export function defaultSettings(lang: Settings['lang']): Settings {
  return {
    lang,
    master: 0.9,
    music: 0.6,
    effects: 0.9,
    quality: 'auto',
    units: 'metre',
    reducedMotion: false,
    ambientLife: true,
    textScale: 1,
    highContrast: false,
  };
}

export function emptySave(lang: Settings['lang']): SaveData {
  return {
    v: 1,
    mark: null,
    levels: {},
    taught: [],
    epilogueDone: false,
    daily: { last: '', streak: 0, best: {} },
    millennium: { bestStones: null, bestYears: 0 },
    settings: defaultSettings(lang),
  };
}

export interface QualityPreset {
  /** Upper bound on device pixel ratio and a scale on top of it. */
  readonly maxPixelRatio: number;
  readonly renderScale: number;
  /** Shadow map size; 0 turns shadows off. */
  readonly shadowMap: number;
  /** Planar water reflection resolution as a fraction of the frame; 0 = sky only. */
  readonly reflection: number;
  readonly bloom: boolean;
  readonly smaa: boolean;
  /** 0..1 multipliers. */
  readonly plants: number;
  readonly particles: number;
  /** Largest texture edge to upload. */
  readonly textureSize: number;
  /** Stones across the bridge width are merged on low to cut triangles. */
  readonly stoneDetail: 0 | 1 | 2;
}

export const QUALITY: Readonly<Record<QualityId, QualityPreset>> = {
  low: {
    maxPixelRatio: 1,
    renderScale: 0.75,
    shadowMap: 1024,
    reflection: 0,
    bloom: false,
    smaa: false,
    plants: 0.4,
    particles: 0.4,
    textureSize: 512,
    stoneDetail: 0,
  },
  medium: {
    maxPixelRatio: 1.5,
    renderScale: 1,
    shadowMap: 2048,
    reflection: 0.5,
    bloom: true,
    smaa: false,
    plants: 0.75,
    particles: 0.75,
    textureSize: 1024,
    stoneDetail: 1,
  },
  high: {
    maxPixelRatio: 2,
    renderScale: 1,
    shadowMap: 4096,
    reflection: 0.5,
    bloom: true,
    smaa: true,
    plants: 1,
    particles: 1,
    textureSize: 1024,
    stoneDetail: 2,
  },
};

/** Frame time (ms) the automatic quality tries to stay under. */
export const FRAME_BUDGET_MS = 18;
