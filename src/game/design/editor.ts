/**
 * The design rules (DESIGN 2.2): handle drags, key nudges, piers, technique toggles, undo, redo
 * and reset turn into a new BridgeDesign through sim.normalize. Values snap to ten centimetres
 * (one parmak in arşın), fullness to twentieths. The editor answers each change with what the
 * player should hear: a tick whose pitch follows the value, a knock at a limit, the warm note
 * when the bridge crosses into safety.
 */
import type { HandleId, SimApi, ToggleKey } from '../../core/contracts';
import { clamp } from '../../core/math';
import type { BridgeDesign, BridgeGeometry, Capacities, Insight, LevelDef, Vec2 } from '../../core/types';
import { lengthStep } from '../text';
import { FULLNESS_STEP, askedValue, gripAt, haunchFrame, handleKey, readValue, valueRange, writeValue } from './handles';

export type Units = 'metre' | 'arsin';

/** What a change sounds like. `tick` is the value's place in its range (0..1) for the pitch. */
export interface Feedback {
  readonly changed: boolean;
  readonly tick: number | null;
  readonly limit: boolean;
  readonly crossed: 'safe' | 'unsafe' | null;
}

const NONE: Feedback = { changed: false, tick: null, limit: false, crossed: null };
const UNDO_DEPTH = 100;
const TECHNIQUES: readonly Exclude<ToggleKey, 'linked'>[] = ['cutwaters', 'reliefs', 'clamps', 'piles'];

/** Techniques the level has not unlocked are off, whatever the design says (normalize leaves them). */
export function enforceTools(level: LevelDef, design: BridgeDesign): BridgeDesign {
  const d = { ...design };
  for (const k of TECHNIQUES) if (!level.tools.includes(k)) d[k] = false;
  return d;
}

interface Drag {
  readonly id: HandleId;
  readonly before: BridgeDesign;
  readonly start: { value: number; at: Vec2 };
  /** Haunch only: grip bulge (m) for sampled fullness values, to answer a drag exactly. */
  readonly bulges: readonly { f: number; b: number }[] | null;
  lastTick: number;
  atStop: boolean;
}

export class DesignEditor {
  design: BridgeDesign;
  geometry: BridgeGeometry;
  insight: Insight;
  capacities: Capacities | null = null;
  /** Bumped on every change, so models built from the editor can be cached. */
  version = 0;
  /** Handles held against a limit in the last drag: -1 at the low end, +1 at the high end. */
  readonly stops = new Map<string, -1 | 1>();
  private undoStack: BridgeDesign[] = [];
  private redoStack: BridgeDesign[] = [];
  private drag: Drag | null = null;

  constructor(
    private readonly sim: SimApi,
    readonly level: LevelDef,
    design: BridgeDesign,
    private readonly units: () => Units,
  ) {
    this.design = this.clean(design);
    this.geometry = sim.geometry(level, this.design);
    this.insight = sim.insight(level, this.design);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get dragging(): HandleId | null {
    return this.drag?.id ?? null;
  }

  private clean(design: BridgeDesign): BridgeDesign {
    return this.sim.normalize(this.level, enforceTools(this.level, design));
  }

  /** Make `next` current; returns the safety crossing, if any. */
  private set(next: BridgeDesign): 'safe' | 'unsafe' | null {
    const before = this.insight.safety;
    this.design = next;
    this.geometry = this.sim.geometry(this.level, next);
    this.insight = this.sim.insight(this.level, next);
    this.capacities = null;
    this.version++;
    const after = this.insight.safety;
    if (before < 1 && after >= 1) return 'safe';
    if (before >= 1 && after < 1) return 'unsafe';
    return null;
  }

  private remember(before: BridgeDesign): void {
    this.undoStack.push(before);
    if (this.undoStack.length > UNDO_DEPTH) this.undoStack.shift();
    this.redoStack = [];
  }

  /** The slower numbers, once a change is complete. */
  settle(): void {
    if (!this.capacities) this.capacities = this.sim.capacities(this.level, this.design);
    this.version++;
  }

  private step(id: HandleId): number {
    return id.kind === 'haunch' ? FULLNESS_STEP : lengthStep(this.units());
  }

  private snap(id: HandleId, v: number): number {
    const s = this.step(id);
    return Math.round(v / s) * s;
  }

  /** Put a handle's value to `wanted` (snapped, clamped); report the tick, the stop and the crossing. */
  private apply(id: HandleId, wanted: number, lastTick: number): Feedback & { value: number; stop: -1 | 0 | 1 } {
    const [lo, hi] = valueRange(this.level, this.design, this.geometry, id);
    const snapped = this.snap(id, wanted);
    const target = clamp(snapped, lo, hi);
    let stop: -1 | 0 | 1 = snapped < lo - 1e-9 ? -1 : snapped > hi + 1e-9 ? 1 : 0;
    const next = this.clean(writeValue(this.design, id, target));
    const got = readValue(next, id);
    // normalize may hold a value back further (a ring cannot outgrow its pier): that is a stop too.
    if (stop === 0 && Math.abs(got - target) > 1e-6) stop = got < target ? 1 : -1;
    const moved = Math.abs(got - readValue(this.design, id)) > 1e-9;
    const crossed = moved ? this.set(next) : null;
    const span = hi - lo;
    const tick = moved && Math.abs(got - lastTick) > 1e-9 ? (span > 0 ? (got - lo) / span : 0.5) : null;
    return { changed: moved, tick, limit: stop !== 0, crossed, value: got, stop };
  }

  grab(id: HandleId): void {
    const at = gripAt(this.design, this.geometry, id);
    if (!at) return;
    const value = readValue(this.design, id);
    this.drag = { id, before: this.design, start: { value, at }, bulges: id.kind === 'haunch' ? this.sampleHaunch(id) : null, lastTick: value, atStop: false };
  }

  dragTo(id: HandleId, to: Vec2): Feedback {
    const d = this.drag;
    if (!d || handleKey(d.id) !== handleKey(id)) return NONE;
    const wanted = id.kind === 'haunch' ? this.fullnessFor(id, to, d) : askedValue(this.geometry, this.design, id, to, d.start);
    const r = this.apply(id, wanted, d.lastTick);
    if (r.tick !== null) d.lastTick = r.value;
    // The knock sounds once as the grip meets its stop, not on every move against it.
    const knock = r.limit && !d.atStop;
    d.atStop = r.limit;
    this.setStop(id, r.stop);
    return { changed: r.changed, tick: r.tick, limit: knock, crossed: r.crossed };
  }

  release(id: HandleId, to: Vec2): Feedback {
    const fb = this.dragTo(id, to);
    const d = this.drag;
    this.drag = null;
    this.stops.clear();
    if (d && d.before !== this.design) {
      this.remember(d.before);
      this.settle();
    }
    return fb;
  }

  nudge(id: HandleId, steps: number): Feedback {
    const before = this.design;
    const now = readValue(this.design, id);
    const r = this.apply(id, now + steps * this.step(id), now);
    if (r.changed) {
      this.remember(before);
      this.settle();
    }
    return { changed: r.changed, tick: r.tick, limit: r.limit, crossed: r.crossed };
  }

  private setStop(id: HandleId, stop: -1 | 0 | 1): void {
    if (stop === 0) this.stops.delete(handleKey(id));
    else this.stops.set(handleKey(id), stop);
  }

  /** Commit a whole-design change (piers, toggles, reset) as one undo step. */
  private commit(next: BridgeDesign): Feedback {
    const before = this.design;
    const clean = this.clean(next);
    if (JSON.stringify(clean) === JSON.stringify(before)) return NONE;
    const crossed = this.set(clean);
    this.remember(before);
    this.settle();
    return { changed: true, tick: null, limit: false, crossed };
  }

  addPier(x: number): Feedback {
    const lim = this.level.limits;
    if (!this.level.tools.includes('piers') || this.design.piers.length >= lim.maxPiers) return NONE;
    const width = this.design.piers[0]?.width ?? this.level.starter.piers[0]?.width ?? lim.pierWidth[0];
    const piers = [...this.design.piers.map((p) => ({ ...p })), { x: this.snap({ kind: 'pier', index: 0 }, x), width }].sort((a, b) => a.x - b.x);
    // A new span copies its neighbour; normalize does that when the spans list is one short.
    return this.commit({ ...this.design, piers });
  }

  removePier(index: number): Feedback {
    if (!this.level.tools.includes('piers') || this.design.piers.length <= this.level.limits.minPiers) return NONE;
    const piers = this.design.piers.filter((_, i) => i !== index);
    const spans = this.design.spans.filter((_, i) => i !== index + 1);
    return this.commit({ ...this.design, piers, spans });
  }

  toggle(key: ToggleKey, value: boolean): Feedback {
    if (key === 'linked') {
      if (this.design.spans.length < 2) return NONE;
      // Linking gives every span the middle one's shape (normalize then copies span 0 to all).
      const main = this.design.spans[Math.floor(this.design.spans.length / 2)]!;
      const spans = this.design.spans.map((s) => ({ ...(value ? main : s) }));
      return this.commit({ ...this.design, linked: value, spans });
    }
    if (!this.level.tools.includes(key)) return NONE;
    return this.commit({ ...this.design, [key]: value });
  }

  undo(): Feedback {
    const prev = this.undoStack.pop();
    if (!prev) return NONE;
    this.redoStack.push(this.design);
    const crossed = this.set(prev);
    this.settle();
    return { changed: true, tick: null, limit: false, crossed };
  }

  redo(): Feedback {
    const next = this.redoStack.pop();
    if (!next) return NONE;
    this.undoStack.push(this.design);
    const crossed = this.set(next);
    this.settle();
    return { changed: true, tick: null, limit: false, crossed };
  }

  reset(): Feedback {
    return this.commit(this.level.starter);
  }

  /** Replace the whole design (harness, retry with a kept design). */
  load(design: BridgeDesign): void {
    this.set(this.clean(design));
    this.settle();
  }

  /** Grip bulge for fullness 0..1, so a drag of the haunch lands where the pointer is. */
  private sampleHaunch(id: HandleId): { f: number; b: number }[] {
    const out: { f: number; b: number }[] = [];
    for (let k = 0; k <= 8; k++) {
      const f = k / 8;
      const g = this.sim.geometry(this.level, this.clean(writeValue(this.design, id, f)));
      const sp = g.spans[id.index];
      if (sp) out.push({ f, b: haunchFrame(sp).bulge });
    }
    return out;
  }

  private fullnessFor(id: HandleId, to: Vec2, d: Drag): number {
    const sp = this.geometry.spans[id.index];
    const table = d.bulges;
    if (!sp || !table || table.length < 2) return d.start.value;
    const f = haunchFrame(sp);
    const b = (to.x - f.mid.x) * f.normal.x + (to.y - f.mid.y) * f.normal.y;
    // The table rises with fullness; walk it and interpolate (outside it, extrapolate a little so the stop is felt).
    for (let i = 1; i < table.length; i++) {
      const a = table[i - 1]!;
      const c = table[i]!;
      if ((b >= a.b && b <= c.b) || (b <= a.b && b >= c.b)) return c.b === a.b ? c.f : a.f + ((c.f - a.f) * (b - a.b)) / (c.b - a.b);
    }
    const first = table[0]!;
    const last = table[table.length - 1]!;
    const rising = last.b >= first.b;
    return (rising ? b < first.b : b > first.b) ? -FULLNESS_STEP : 1 + FULLNESS_STEP;
  }
}
