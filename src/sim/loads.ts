/**
 * Loads on the courses of a ring (SIM-SPEC section 3): own weight, the fill and deck above,
 * buoyancy in a flood, an axle spread through the fill. Earthquake inertia lives in SpanModel.
 */
import type { ArchShape } from './arch';
import { extradosY } from './arch';
import type { Layout } from './geometry';
import { deckAt } from './geometry';
import { FILL_SAMPLES, SpanModel } from './span';
import { AXLE_LENGTH_BASE, AXLE_WIDTH_BASE, PARAPET_HEIGHT, PAVING_THICKNESS, WATER_UNIT_WEIGHT } from './tuning';

/** Simpson weights for FILL_SAMPLES = 5 points, summing to 12. */
const SIMPSON: readonly number[] = [1, 4, 2, 4, 1];

/**
 * A span model with its dead loads: each course carries its own weight at its centroid and the
 * strip of fill, paving and parapet vertically above its extrados edge at that strip's centroid.
 * The centroid's height is where an earthquake pushes: fill at the middle of its own depth, the
 * paving at the road, the parapets above it. `selfOnly` leaves the fill out (bare rings for the
 * benchmarks).
 */
export function buildSpanModel(layout: Layout, index: number, lengthScale: number, selfOnly = false): SpanModel {
  const shape = layout.shapes[index] as ArchShape;
  const sp = new SpanModel(shape, lengthScale);
  const gamma = layout.stone.unitWeight;
  const paving = PAVING_THICKNESS * gamma;
  const parapet = layout.deckLoad - paving;
  for (let k = 0; k < sp.n; k++) {
    sp.selfW0[k] = gamma * (sp.area[k] as number);
    if (selfOnly) continue;
    const x0 = sp.bx0[k] as number;
    const x1 = sp.bx0[k + 1] as number;
    const dx = x1 - x0;
    sp.fillDx[k] = dx;
    let areaSum = 0;
    let xSum = 0;
    let ySum = 0;
    for (let i = 0; i < FILL_SAMPLES; i++) {
      const x = x0 + (dx * i) / (FILL_SAMPLES - 1);
      const bottom = extradosY(shape, x);
      const top = Math.max(bottom, deckAt(layout.deck, x));
      sp.fillBot[k * FILL_SAMPLES + i] = bottom;
      sp.fillTop[k * FILL_SAMPLES + i] = top;
      // Load per metre along the bridge: fill below the paving plus the uniform deck load.
      const depth = Math.max(0, top - bottom - PAVING_THICKNESS);
      const fill = layout.fillWeight * depth;
      const q = fill + layout.deckLoad;
      const w = SIMPSON[i] as number;
      areaSum += w * q;
      xSum += w * q * x;
      ySum += w * (fill * (bottom + depth / 2) + paving * (top - PAVING_THICKNESS / 2) + parapet * (top + PARAPET_HEIGHT / 2));
    }
    sp.fillW0[k] = (areaSum * dx) / 12;
    if (areaSum > 0) {
      sp.fx0[k] = xSum / areaSum;
      sp.fy0[k] = ySum / areaSum;
    }
  }
  setBuoyancy(sp, -Infinity);
  return sp;
}

/**
 * Effective weights with the water at `level`: submerged stone and fill lose the weight of the
 * water they displace. A course is submerged by the share of its height under water.
 */
export function setBuoyancy(sp: SpanModel, level: number): void {
  const n = sp.n;
  if (level === -Infinity) {
    sp.selfW.set(sp.selfW0);
    sp.fillW.set(sp.fillW0);
    return;
  }
  for (let k = 0; k < n; k++) {
    const lo = Math.min(sp.ay0[k] as number, sp.ay0[k + 1] as number, sp.by0[k] as number, sp.by0[k + 1] as number);
    const hi = Math.max(sp.ay0[k] as number, sp.ay0[k + 1] as number, sp.by0[k] as number, sp.by0[k + 1] as number);
    const share = hi > lo ? Math.min(1, Math.max(0, (level - lo) / (hi - lo))) : level >= hi ? 1 : 0;
    sp.selfW[k] = (sp.selfW0[k] as number) - WATER_UNIT_WEIGHT * (sp.area[k] as number) * share;
    let wet = 0;
    for (let i = 0; i < FILL_SAMPLES; i++) {
      const bottom = sp.fillBot[k * FILL_SAMPLES + i] as number;
      const top = sp.fillTop[k * FILL_SAMPLES + i] as number;
      wet += (SIMPSON[i] as number) * Math.min(top - bottom, Math.max(0, level - bottom));
    }
    const lift = (WATER_UNIT_WEIGHT * wet * (sp.fillDx[k] as number)) / 12;
    // Fill never floats: at worst it weighs nothing.
    sp.fillW[k] = Math.max(0, (sp.fillW0[k] as number) - lift);
  }
}

/** Footprint of an axle standing at x on a span: effective width across and length along the bridge. */
export function axleFootprint(layout: Layout, shape: ArchShape, x: number): { width: number; length: number } {
  const depth = Math.max(0, deckAt(layout.deck, x) - extradosY(shape, x));
  return { width: Math.min(layout.width, AXLE_WIDTH_BASE + depth), length: AXLE_LENGTH_BASE + depth };
}

/**
 * Put an axle at x as the second load set. The set is scaled so lambda = 1 is a line load of W
 * (the model's force scale) per metre of width: the axle in kN is lambda * W * footprint width.
 */
export function setAxle(sp: SpanModel, x: number, length: number): void {
  const a = x - length / 2;
  const b = x + length / 2;
  for (let k = 0; k < sp.n; k++) {
    const lo = Math.max(a, sp.bx0[k] as number);
    const hi = Math.min(b, sp.bx0[k + 1] as number);
    if (hi > lo) {
      const share = (hi - lo) / length;
      sp.lx[k] = 0;
      sp.ly[k] = -share;
      // Moved stones carry their load with them: shift the point by the course's own movement.
      const at = (lo + hi) / 2 + ((sp.fx[k] as number) - (sp.fx0[k] as number));
      sp.lg[k] = (-(at - sp.ox) * share) / sp.L;
    } else {
      sp.lx[k] = 0;
      sp.ly[k] = 0;
      sp.lg[k] = 0;
    }
  }
  sp.applySecond();
}
