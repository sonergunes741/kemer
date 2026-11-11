/**
 * Mason's marks on a 3 x 3 grid of points (0..8, row by row). Twelve presets in the manner of the
 * Seljuk bankers' marks found on Anatolian bridges and caravanserais, plus the pure geometry the
 * picker and the ledger draw them with.
 */
import type { FamilyMark } from '../core/types';

type Stroke = readonly [number, number];

/** Grid point -> column and row, 0..2 each. */
export function gridPoint(index: number): { col: number; row: number } {
  return { col: index % 3, row: Math.floor(index / 3) };
}

/** Grid point in a square drawing of `size` with `pad` around the grid. */
export function pointXY(index: number, size: number, pad: number): { x: number; y: number } {
  const { col, row } = gridPoint(index);
  const step = (size - pad * 2) / 2;
  return { x: pad + col * step, y: pad + row * step };
}

export function isPoint(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 8;
}

/** Strokes are undirected: [5, 1] and [1, 5] are the same line. */
export function normalizeStroke(a: number, b: number): Stroke {
  return a < b ? [a, b] : [b, a];
}

export function strokeKey(a: number, b: number): string {
  const [x, y] = normalizeStroke(a, b);
  return `${x}-${y}`;
}

/** Clean a mark: valid points only, no zero-length strokes, no duplicates, stable order. */
export function normalizeMark(mark: FamilyMark): FamilyMark {
  const seen = new Set<string>();
  const strokes: Stroke[] = [];
  for (const [a, b] of mark.strokes) {
    if (!isPoint(a) || !isPoint(b) || a === b) continue;
    const key = strokeKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    strokes.push(normalizeStroke(a, b));
  }
  strokes.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  return { strokes };
}

/** Add the stroke, or take it away if it is already there (drawing over a line erases it). */
export function toggleStroke(mark: FamilyMark, a: number, b: number): FamilyMark {
  if (!isPoint(a) || !isPoint(b) || a === b) return mark;
  const key = strokeKey(a, b);
  const has = mark.strokes.some(([x, y]) => strokeKey(x, y) === key);
  const strokes = has ? mark.strokes.filter(([x, y]) => strokeKey(x, y) !== key) : [...mark.strokes, normalizeStroke(a, b)];
  return normalizeMark({ strokes });
}

export function sameMark(a: FamilyMark | null, b: FamilyMark | null): boolean {
  if (!a || !b) return a === b;
  const x = normalizeMark(a).strokes;
  const y = normalizeMark(b).strokes;
  return x.length === y.length && x.every((s, i) => s[0] === y[i]?.[0] && s[1] === y[i]?.[1]);
}

/** One SVG path for the whole mark, in a square of `size`. */
export function markPath(mark: FamilyMark, size: number, pad: number): string {
  const parts: string[] = [];
  for (const [a, b] of normalizeMark(mark).strokes) {
    const p = pointXY(a, size, pad);
    const q = pointXY(b, size, pad);
    parts.push(`M${round(p.x)} ${round(p.y)}L${round(q.x)} ${round(q.y)}`);
  }
  return parts.join('');
}

/** The grid point nearest to a position in the drawing, if within `reach`. */
export function nearestPoint(x: number, y: number, size: number, pad: number, reach: number): number | null {
  let best: number | null = null;
  let bestD = reach * reach;
  for (let i = 0; i < 9; i++) {
    const p = pointXY(i, size, pad);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

const m = (...strokes: Stroke[]): FamilyMark => normalizeMark({ strokes });

/**
 *   0 1 2
 *   3 4 5
 *   6 7 8
 */
export const PRESET_MARKS: readonly FamilyMark[] = [
  m([1, 7], [1, 3], [1, 5]), //                 arrow
  m([0, 8], [2, 6], [0, 2], [6, 8]), //         hourglass
  m([0, 8], [2, 6], [1, 7], [3, 5]), //         star
  m([1, 6], [6, 8], [1, 8]), //                 triangle
  m([0, 4], [2, 4], [4, 7]), //                 fork
  m([1, 3], [3, 7], [5, 7], [1, 5]), //         lozenge
  m([1, 7], [0, 2], [3, 5]), //                 double cross
  m([0, 6], [0, 8], [2, 8]), //                 zigzag
  m([0, 6], [2, 3], [3, 8]), //                 bow
  m([0, 2], [2, 8], [6, 8], [0, 6], [0, 8]), // squared stone
  m([0, 3], [3, 5], [2, 5], [4, 7]), //         anchor
  m([3, 1], [1, 5], [3, 7], [7, 5], [1, 7]), // split lozenge
];
