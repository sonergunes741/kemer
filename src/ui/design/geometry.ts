/** Pure helpers for the design overlay: bank crossings, pier slots, handle reach, key steps. */
import type { DesignModel, HandleId } from '../../core/contracts';
import type { LevelDef, Vec2 } from '../../core/types';

/**
 * Where a water stage meets the two banks: walk out from the deepest point of the ground line
 * until the ground rises above the stage. Null on a side the stage never reaches the ground.
 */
export function bankCrossings(ground: readonly Vec2[], stage: number): { left: number | null; right: number | null } {
  if (ground.length < 2) return { left: null, right: null };
  let low = 0;
  for (let i = 1; i < ground.length; i++) if (ground[i]!.y < ground[low]!.y) low = i;
  const cross = (i: number, j: number): number => {
    const a = ground[i]!;
    const b = ground[j]!;
    const t = b.y === a.y ? 0 : (stage - a.y) / (b.y - a.y);
    return a.x + (b.x - a.x) * Math.max(0, Math.min(1, t));
  };
  let left: number | null = null;
  for (let i = low; i > 0; i--) {
    if (ground[i - 1]!.y >= stage && ground[i]!.y < stage) {
      left = cross(i, i - 1);
      break;
    }
  }
  let right: number | null = null;
  for (let i = low; i < ground.length - 1; i++) {
    if (ground[i + 1]!.y >= stage && ground[i]!.y < stage) {
      right = cross(i, i + 1);
      break;
    }
  }
  return { left, right };
}

/** Springing points of the model, left and right of each span (from the intrados ends). */
export function spanEnds(model: DesignModel): { left: number; right: number }[] {
  return model.spans
    .filter((sp) => sp.intrados.length > 1)
    .map((sp) => ({ left: sp.intrados[0]!.x, right: sp.intrados[sp.intrados.length - 1]!.x }));
}

/**
 * Where a new pier could go with one tap: the middle of each span wide enough for a pier and
 * two minimum spans, inside the zone the river allows piers in.
 */
export function pierSlots(model: DesignModel, level: LevelDef | null): number[] {
  if (!model.tools.includes('piers') || model.piersLeft <= 0) return [];
  const zone = level?.site.pierZone ?? [-Infinity, Infinity];
  const minSpan = level?.limits.minSpan ?? 0;
  const minWidth = level?.limits.pierWidth[0] ?? 0;
  const out: number[] = [];
  for (const { left, right } of spanEnds(model)) {
    const mid = (left + right) / 2;
    if (mid < zone[0] || mid > zone[1]) continue;
    if ((right - left - minWidth) / 2 < minSpan) continue;
    out.push(mid);
  }
  return out;
}

/** Piers the player may take away (only while above the level's minimum). */
export function removablePiers(model: DesignModel, level: LevelDef | null): number[] {
  if (!model.tools.includes('piers')) return [];
  const min = level?.limits.minPiers ?? 0;
  if (model.piers.length <= min) return [];
  return model.piers.map((_, i) => i);
}

/** Whether a tap on the elevation lands where a pier may be added (inside the zone, under the arches). */
export function canAddPierAt(p: Vec2, model: DesignModel, level: LevelDef | null): boolean {
  if (!model.tools.includes('piers') || model.piersLeft <= 0) return false;
  const zone = level?.site.pierZone ?? null;
  if (zone && (p.x < zone[0] || p.x > zone[1])) return false;
  const ends = spanEnds(model);
  const span = ends.find((e) => p.x > e.left && p.x < e.right);
  if (!span) return false;
  const spring = level?.site.springLevel ?? 0;
  return p.y < spring + 0.25 * (span.right - span.left);
}

/** Pointer reach of each grip: as generous as 22 px, but never overlapping a neighbour's. */
export function gripReach(points: readonly { x: number; y: number }[], max = 22, min = 12): number[] {
  return points.map((p, i) => {
    let d = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      d = Math.min(d, Math.hypot(points[j]!.x - p.x, points[j]!.y - p.y));
    }
    return Math.max(min, Math.min(max, d / 2));
  });
}

/**
 * Arrow key to steps along a handle's axis. The key's direction is compared with the axis; a key
 * across the axis still moves it (up and right forward, down and left back), so every arrow works.
 */
export function keySteps(key: string, axis: Vec2, shift: boolean): number {
  const dir: Record<string, Vec2> = {
    ArrowUp: { x: 0, y: 1 },
    ArrowDown: { x: 0, y: -1 },
    ArrowRight: { x: 1, y: 0 },
    ArrowLeft: { x: -1, y: 0 },
  };
  const d = dir[key];
  if (!d) return 0;
  const dot = d.x * axis.x + d.y * axis.y;
  const sign = Math.abs(dot) > 0.3 ? Math.sign(dot) : key === 'ArrowUp' || key === 'ArrowRight' ? 1 : -1;
  return sign * (shift ? 5 : 1);
}

export function handleKey(id: HandleId): string {
  return `${id.kind}:${id.index}`;
}
