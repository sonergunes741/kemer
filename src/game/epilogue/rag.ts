/**
 * Elif's rag on the upstream face (DESIGN 4): a drag wipes moss and lichen off the stone along its
 * path, with a soft scrape and a few flakes of leaf; how clean the family mark now is decides when
 * it is found. A keyboard player presses the moment's key and the rag sweeps towards the mark.
 */
import type { UiIntent } from '../../core/contracts';
import type { Vec2 } from '../../core/types';
import type { GameDeps } from '../types';

/** Rag radius and spacing of its dabs along a stroke, metres. */
const RADIUS = 0.3;
const STEP = 0.1;
/** How clean the mark's centre must be to count as found. */
const FOUND = 0.62;
const SOUND_GAP = 0.085;
const CHIP_GAP = 0.35;
/** The keyboard sweep: rows over the mark, metres across and apart, and its pace in m/s. */
const SWEEP_HALF = 0.7;
const SWEEP_ROWS = 5;
const SWEEP_ROW_GAP = 0.18;
const SWEEP_SPEED = 2.4;

export class Rag {
  /** 0..1: how clean the mark is. */
  clean = 0;
  /** Metres wiped so far (the coach points to the mark once the player has wiped a while). */
  wiped = 0;
  private pointer: number | null = null;
  private last: Vec2 | null = null;
  private soundClock = 0;
  private chipClock = 0;
  private path: Vec2[] = [];

  constructor(
    private readonly deps: GameDeps,
    /** The mark's centre on the face; null when there is no mark to find. */
    readonly probe: Vec2 | null,
    /** The upstream face, for the flakes. */
    private readonly faceZ: number,
  ) {}

  get found(): boolean {
    return this.clean >= FOUND;
  }

  get sweeping(): boolean {
    return this.path.length > 0;
  }

  /** A pointer on the picture; returns true when it wiped. */
  canvas(e: Extract<UiIntent, { type: 'canvas' }>): boolean {
    if (e.phase === 'down') {
      this.pointer = e.id;
      this.last = this.deps.world.fromScreen(e.x, e.y);
      if (this.last) this.dab(this.last);
      return !!this.last;
    }
    if (e.id !== this.pointer) return false;
    if (e.phase === 'up' || e.phase === 'cancel') {
      this.pointer = null;
      this.last = null;
      return false;
    }
    const p = this.deps.world.fromScreen(e.x, e.y);
    if (!p) return false;
    this.stroke(this.last ?? p, p);
    this.last = p;
    return true;
  }

  /** The keyboard's twin of a drag: a few rows back and forth over the mark (or the crown). */
  sweep(around: Vec2): void {
    if (this.sweeping) return;
    const at = this.probe ?? around;
    const rows: Vec2[] = [];
    for (let r = 0; r < SWEEP_ROWS; r++) {
      const y = at.y + (r - (SWEEP_ROWS - 1) / 2) * SWEEP_ROW_GAP;
      const dir = r % 2 === 0 ? 1 : -1;
      rows.push({ x: at.x - dir * SWEEP_HALF, y }, { x: at.x + dir * SWEEP_HALF, y });
    }
    this.path = rows;
    this.last = rows[0] ?? null;
  }

  update(dt: number): void {
    this.soundClock -= dt;
    this.chipClock -= dt;
    let from = this.last;
    if (!this.sweeping || !from) return;
    let budget = SWEEP_SPEED * dt;
    while (budget > 0 && this.path.length > 0) {
      const to = this.path[0]!;
      const d = Math.hypot(to.x - from.x, to.y - from.y);
      const k = d <= budget ? 1 : budget / d;
      const next: Vec2 = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      this.stroke(from, next);
      from = next;
      budget -= d * k;
      if (k >= 1) this.path.shift();
      else budget = 0;
    }
    this.last = this.sweeping ? from : null;
  }

  private stroke(a: Vec2, b: Vec2): void {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(d / STEP));
    for (let i = 1; i <= n; i++) this.dab({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
    this.wiped += d;
    if (d > 0.01) this.hear(b, d);
  }

  private dab(p: Vec2): void {
    const clean = this.deps.bridge.wipe(p, RADIUS, this.probe ?? undefined);
    if (this.probe) this.clean = clean;
  }

  /** A dry scrape, rising a little with the speed of the hand, and now and then a flake of moss. */
  private hear(at: Vec2, d: number): void {
    const { audio, world } = this.deps;
    if (this.soundClock <= 0) {
      this.soundClock = SOUND_GAP;
      audio.play('handle-tick', { gain: 0.12 + Math.min(0.12, d * 0.4), pitch: 0.42 + Math.random() * 0.12 });
    }
    if (this.chipClock <= 0) {
      this.chipClock = CHIP_GAP;
      world.fx.chips({ x: at.x, y: at.y, z: this.faceZ + 0.04 }, 2, 'leaf');
    }
  }
}
