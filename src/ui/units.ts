/**
 * Pure formatting of the numbers the interface shows: lengths in metres or in the architect's
 * arşın, the safety gauge's number and word, and the capacities line. No DOM here, so it is
 * unit-tested directly.
 */
import { ARSIN, PARMAK } from '../core/config';
import type { Capacities, Lang, LevelDef } from '../core/types';
import { formatNumber, formatPercent } from '../core/format';
import { getLang } from '../core/i18n';
import { t, type UiKey } from '../i18n';

export type Units = 'metre' | 'arsin';

const G = 9.81;

/**
 * A length as the player reads it beside a handle. Metres: two decimals under a metre, one
 * under a hundred. Arşın: whole arşın and parmak (the tick of the handle in those units).
 */
export function formatLength(m: number, units: Units, lang: Lang = getLang()): string {
  if (!Number.isFinite(m)) return '—';
  if (units === 'arsin') {
    const sign = m < 0 ? '−' : '';
    const total = Math.round(Math.abs(m) / PARMAK);
    const a = Math.floor(total / 24);
    const p = total % 24;
    // Beyond twenty arşın the parmak is noise.
    if (a >= 20) return sign + t('unit.arsin', { n: formatNumber(Math.round(Math.abs(m) / ARSIN), 0, lang) });
    if (a === 0) return sign + t('unit.parmak', { n: formatNumber(p, 0, lang) });
    if (p === 0) return sign + t('unit.arsin', { n: formatNumber(a, 0, lang) });
    return sign + t('unit.arsinParmak', { a: formatNumber(a, 0, lang), p: formatNumber(p, 0, lang) });
  }
  const abs = Math.abs(m);
  const digits = abs < 1 ? 2 : abs < 100 ? 1 : 0;
  return t('unit.m', { n: formatNumber(m, digits, lang) });
}

/** A compact length for lines of text: one decimal in either unit. */
export function formatLengthShort(m: number, units: Units, lang: Lang = getLang()): string {
  if (!Number.isFinite(m)) return '—';
  if (units === 'arsin') return t('unit.arsin', { n: formatNumber(m / ARSIN, 1, lang) });
  return t('unit.m', { n: formatNumber(m, Math.abs(m) < 10 ? 1 : 0, lang) });
}

/** Settlement of the crown and other small movements: centimetres or parmak. */
export function formatSmallLength(m: number, units: Units, lang: Lang = getLang()): string {
  if (units === 'arsin') return t('unit.parmak', { n: formatNumber(m / PARMAK, 1, lang) });
  return t('unit.cm', { n: formatNumber(m * 100, 1, lang) });
}

export type SafetyLevel = 'falls' | 'narrow' | 'sound' | 'heavy';

/** Below 1 the arch falls; up to 1.25 it barely holds (the şakül trembles); from 3 it wastes stone. */
export const SAFETY_NARROW = 1.25;
export const SAFETY_HEAVY = 3;

export function safetyLevel(safety: number): SafetyLevel {
  if (!(safety >= 1)) return 'falls';
  if (safety < SAFETY_NARROW) return 'narrow';
  if (safety < SAFETY_HEAVY) return 'sound';
  return 'heavy';
}

/**
 * The gauge's number, truncated rather than rounded to one decimal so 0,97 never reads as
 * "1,0" beside the word "yıkılır".
 */
export function formatSafety(safety: number, lang: Lang = getLang()): string {
  if (!Number.isFinite(safety)) return '—';
  const v = Math.floor(Math.max(0, Math.min(safety, 99.9)) * 10 + 1e-9) / 10;
  return formatNumber(v, 1, lang);
}

export function safetyWord(safety: number): string {
  return t(`safety.${safetyLevel(safety)}` as UiKey);
}

export interface CapacityItem {
  readonly key: 'load' | 'quake' | 'flood' | 'scour' | 'waterway';
  readonly label: string;
  readonly value: string;
  /** True when the river asks more than the bridge can give. */
  readonly short: boolean;
}

/** What this river will throw at the bridge, from the level data alone (never from the future run). */
export function riverDemands(level: LevelDef): { axle: number; pga: number } {
  let axle = 0;
  let pga = 0;
  for (const era of level.traffic) axle = Math.max(axle, era.axle);
  for (const hz of level.hazards) {
    if (hz.kind === 'load') axle = Math.max(axle, hz.axle);
    else if (hz.kind === 'quake') pga = Math.max(pga, hz.pga);
  }
  return { axle, pga };
}

/**
 * The three capacities that matter on this river, in plain units. Load and flood always; the
 * third is the earthquake where the river has one, else scour where piers stand in the water.
 */
export function capacityItems(
  caps: Capacities,
  level: LevelDef | null,
  floodStages: readonly number[],
  hasPiers: boolean,
  units: Units,
  lang: Lang = getLang(),
): CapacityItem[] {
  const demand = level ? riverDemands(level) : { axle: 0, pga: 0 };
  const items: CapacityItem[] = [];
  items.push({
    key: 'load',
    label: t('cap.load'),
    value: t('unit.ton', { n: formatNumber(caps.axle / G, caps.axle / G < 10 ? 1 : 0, lang) }),
    short: demand.axle > 0 && caps.axle < demand.axle,
  });
  if (demand.pga > 0) {
    items.push({
      key: 'quake',
      label: t('cap.quake'),
      value: t('unit.g', { n: formatNumber(caps.quake, 2, lang) }),
      short: caps.quake < demand.pga,
    });
  } else if (hasPiers) {
    items.push({ key: 'scour', label: t('cap.scour'), value: formatPercent(caps.scour, lang), short: caps.scour >= 1 });
  }
  const highest = floodStages.length > 0 ? Math.max(...floodStages) : null;
  if (highest !== null) {
    const margin = caps.floodFree - highest;
    items.push({ key: 'flood', label: t('cap.flood'), value: formatLengthShort(margin, units, lang), short: margin < 0 });
  } else {
    items.push({ key: 'flood', label: t('cap.floodFree'), value: formatLengthShort(caps.floodFree, units, lang), short: false });
  }
  return items.slice(0, 3);
}

/** "{n} yıl" with the number grouped the local way. */
export function formatYears(n: number, lang: Lang = getLang()): string {
  return t('unit.years', { n: formatNumber(Math.max(0, Math.round(n)), 0, lang) });
}

export function formatStones(n: number, lang: Lang = getLang()): string {
  return t('unit.stones', { n: formatNumber(n, 0, lang) });
}

/** Calendar years are never grouped ("1683", not "1.683"). */
export function formatYear(year: number): string {
  return String(Math.floor(year));
}
