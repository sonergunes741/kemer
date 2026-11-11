/** What is still wrong with a design as given (SIM-SPEC section 2). Never throws. */
import type { BridgeDesign, DesignIssue, IssueCode, LevelDef, PierDesign } from '../core/types';
import { normalize, rangesOf, riseRange, thicknessRoom } from './design';
import { buildLayout } from './geometry';

const EPS = 1e-9;

function finite(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Issues of the raw design. Range and layout problems are the ones normalize would repair;
 * `deck-too-steep` is about the road over the (normalized) bridge and only a different design fixes it.
 */
export function validate(level: LevelDef, design: BridgeDesign): DesignIssue[] {
  return validateWith(level, design, null);
}

/** validate, given the steepest deck slope of the normalized design when the caller already has it. */
export function validateWith(level: LevelDef, design: BridgeDesign, steepest: number | null): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const add = (code: IssueCode, index: number): void => {
    issues.push({ code, index });
  };
  try {
    const r = rangesOf(level);
    const site = level.site;
    const rawPiers: PierDesign[] = Array.isArray(design?.piers) ? design.piers.filter((p) => p && finite(p.x) && finite(p.width)) : [];
    const piers = rawPiers.slice().sort((a, b) => a.x - b.x);
    if (piers.length > r.maxPiers) add('too-many-piers', -1);
    if (piers.length < r.minPiers) add('too-few-piers', -1);
    for (let i = 0; i < piers.length; i++) {
      const p = piers[i]!;
      if (p.width < r.pierWidth[0] - EPS || p.width > r.pierWidth[1] + EPS) add('pier-width-range', i);
      if (p.x - p.width / 2 < r.zone[0] - EPS || p.x + p.width / 2 > r.zone[1] + EPS) add('pier-outside-zone', i);
      if (i + 1 < piers.length && p.x + p.width / 2 > piers[i + 1]!.x - piers[i + 1]!.width / 2 + EPS) add('piers-overlap', i);
    }
    const spans = Array.isArray(design?.spans) ? design.spans : [];
    for (let i = 0; i <= piers.length; i++) {
      const left = i === 0 ? site.left : piers[i - 1]!.x + piers[i - 1]!.width / 2;
      const right = i === piers.length ? site.right : piers[i]!.x - piers[i]!.width / 2;
      const clear = right - left;
      if (clear < r.minSpan - EPS) add('span-too-small', i);
      const s = spans[i];
      if (!s) continue;
      if (!finite(s.thickness) || s.thickness < r.thickness[0] - EPS || s.thickness > r.thickness[1] + EPS) add('thickness-range', i);
      else if (clear > 0 && finite(s.rise) && finite(s.fullness) && s.thickness > Math.max(r.thickness[0], thicknessRoom(level, piers, i, s.rise, s.fullness)) + EPS) {
        // Too thick for the pier it shares: it would run into the ring next door.
        add('thickness-range', i);
      }
      if (clear > 0 && finite(s.rise)) {
        const range = riseRange(clear);
        if (s.rise < range[0] - EPS) add('rise-too-low', i);
        if (s.rise > range[1] + EPS) add('rise-too-high', i);
      } else if (!finite(s.rise)) {
        add('rise-too-low', i);
      }
    }
    if (!finite(design?.cover) || design.cover < r.cover[0] - EPS || design.cover > r.cover[1] + EPS) add('cover-range', -1);
    if (!finite(design?.foundation) || design.foundation < r.foundation[0] - EPS || design.foundation > r.foundation[1] + EPS) add('foundation-range', -1);

    const slope = steepest ?? buildLayout(level, normalize(level, design)).steepest;
    if (slope > site.maxGrade + EPS) add('deck-too-steep', -1);
  } catch {
    // A design too broken to inspect has, at the least, the wrong number of piers.
    if (issues.length === 0) add('too-few-piers', -1);
  }
  return issues;
}
