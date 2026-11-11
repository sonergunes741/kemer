/**
 * The timber centering under every span: curved ribs, lagging planks, a tie beam on folding
 * wedges, posts down to the bed with braces, and over the main span the hoist that lowers the
 * keystone. It goes up piece by piece, dips a little under every stone, loses its three wedges to
 * the mallet, then drops into the river and floats away downstream. Where each piece goes is
 * worked out in centeringParts.ts; this file only moves them.
 */
import { BoxGeometry, Color, Group, Quaternion, Vector3, type MeshStandardMaterial } from 'three';
import type { Bus } from '../../core/bus';
import type { Vec2, Vec3 } from '../../core/types';
import { clamp01, easeOutCubic } from '../../core/math';
import type { BridgeFrame, SpanFrame } from './frame';
import { centeringParts } from './centeringParts';
import { between, TimberMesh, wedgeGeometry, type TimberKind } from './timber';

const RAISE_SECONDS = 1.6;

interface Fall {
  t: number;
  delay: number;
  y: number;
  vy: number;
  z: number;
  spin: number;
  splashed: boolean;
  started: boolean;
}

interface SpanRig {
  readonly index: number;
  readonly pieces: readonly number[];
  readonly yTie: number;
  readonly crown: Vec2;
  readonly span: number;
  raise: number;
  raising: boolean;
  dip: number;
  dipV: number;
  fall: Fall | null;
  gone: boolean;
}

interface MainWedge {
  readonly piece: number;
  struck: boolean;
  flying: number;
  readonly vel: Vector3;
  spin: number;
  done: boolean;
}

/** Order in which kinds of piece appear while a span's centering goes up (0 first). */
const ORDER: Record<TimberKind, number> = { post: 0, brace: 0.15, wedge: 0.3, tie: 0.35, strut: 0.5, rib: 0.6, lag: 0.75, hoist: 2, rope: 2 };

const _off = new Vector3();
const _v = new Vector3();
const _q = new Quaternion();
const _pivot = new Vector3();
const UP = new Vector3(0, 1, 0);
const ALONG = new Vector3(1, 0, 0);
const _roll = new Quaternion();
const TUMBLE = new Vector3(0.3, 0.2, 1).normalize();

export class Centering {
  readonly group = new Group();
  /** Where the trolley can run along the hoist beam. */
  hoistRange: [number, number] = [0, 0];
  private readonly timber: TimberMesh;
  private readonly glow: TimberMesh;
  private readonly glowMat: MeshStandardMaterial;
  private readonly rigs: SpanRig[];
  private readonly mainWedges: MainWedge[];
  /** The other ribs' wedges at each of the three main stations: they go with the struck one. */
  private readonly companions: readonly number[][];
  private readonly hoistPieces: readonly number[] = [];
  private ropeIndex = -1;
  private blockIndex = -1;
  private hoistOn = false;
  private hoistX = 0;
  private hoistTop = 0;
  private ropeEnd: Vec2 = { x: 0, y: 0 };
  private time = 0;
  private still = false;
  /** The wedges glow only once the work is done and they wait for the mallet. */
  wedgesLit = false;

  constructor(
    spans: readonly SpanFrame[],
    frame: BridgeFrame,
    width: number,
    readonly main: number,
    material: MeshStandardMaterial,
    private readonly bus: Bus,
  ) {
    const parts = centeringParts(spans, frame, width, main);
    // Spans go up one after another, overlapping, so a long bridge is not a long wait.
    const stagger = Math.min(0.35, 1.5 / Math.max(1, spans.length));
    this.rigs = spans.map((sf, i) => {
      const p = parts.spans[i]!;
      return { index: sf.index, pieces: p.pieces, yTie: p.yTie, crown: sf.geo.crown, span: sf.geo.span, raise: -stagger * sf.index, raising: false, dip: 0, dipV: 0, fall: null, gone: false };
    });
    this.mainWedges = parts.glow.map((_, piece) => ({ piece, struck: false, flying: 0, vel: new Vector3(), spin: 0, done: false }));
    this.companions = parts.companions;
    if (parts.hoist) {
      this.hoistPieces = parts.hoist.pieces;
      this.blockIndex = parts.hoist.block;
      this.ropeIndex = parts.hoist.rope;
      this.hoistTop = parts.hoist.top;
      this.hoistX = parts.hoist.x;
      this.hoistRange = parts.hoist.range;
    }
    this.timber = new TimberMesh(parts.pieces, new BoxGeometry(1, 1, 1), material);
    this.glowMat = material.clone();
    this.glowMat.emissive = new Color(0xd9a441);
    this.glowMat.emissiveIntensity = 0;
    this.glow = new TimberMesh(parts.glow, wedgeGeometry(), this.glowMat);
    this.group.add(this.timber.mesh, this.glow.mesh);
    this.group.name = 'kemer-centering';
    for (let i = 0; i < parts.pieces.length; i++) this.timber.hide(i);
    for (let i = 0; i < parts.glow.length; i++) this.glow.hide(i);
    this.timber.commit();
    this.glow.commit();
  }

  get beamHeight(): number {
    return this.hoistTop;
  }

  /** Start raising, span after span. */
  startRaise(): void {
    for (const r of this.rigs) r.raising = true;
    this.still = false;
  }

  get raised(): boolean {
    return this.rigs.every((r) => r.raise >= 1);
  }

  /** Raise everything at once (a bridge shown mid-build). */
  raiseNow(): void {
    for (const r of this.rigs) {
      r.raising = true;
      r.raise = 1;
    }
    this.still = false;
  }

  /** A small dip of the timber under a landing stone of `mass` tonnes. */
  dip(span: number, mass: number): void {
    const r = this.rigs.find((x) => x.index === span);
    if (!r) return;
    r.dipV -= 0.12 * Math.min(1.5, mass);
    this.still = false;
  }

  /** A point on the centering of a span, for creaks. */
  pointOn(span: number): Vec3 {
    const r = this.rigs.find((x) => x.index === span) ?? this.rigs[0];
    return r ? { x: r.crown.x, y: r.yTie, z: 0 } : { x: 0, y: 0, z: 0 };
  }

  /** World positions of the wedges still in place under the main span. */
  wedgePositions(): Vec3[] {
    return this.mainWedges
      .filter((w) => !w.struck)
      .map((w) => {
        const p = this.glow.pieces[w.piece]!.pos;
        return { x: p.x, y: p.y, z: p.z };
      });
  }

  /** Knock out wedge `index` of those left. */
  strike(index: number): { at: Vec3; left: number } | null {
    const remaining = this.mainWedges.filter((w) => !w.struck);
    const w = remaining[Math.max(0, Math.min(remaining.length - 1, index))];
    if (!w) return null;
    w.struck = true;
    w.flying = 0;
    // Out towards the camera (upstream) and a little up, tumbling.
    w.vel.set((Math.random() - 0.5) * 1.5, 2.2, 3.2 + Math.random());
    w.spin = 9 + Math.random() * 5;
    for (const i of this.companions[this.mainWedges.indexOf(w)] ?? []) this.timber.hide(i);
    const p = this.glow.pieces[w.piece]!.pos;
    this.still = false;
    return { at: { x: p.x, y: p.y, z: p.z }, left: remaining.length - 1 };
  }

  /** Every span's centering lets go: the main span first, the others outward from it. */
  drop(): void {
    for (const r of this.rigs) {
      r.fall = { t: 0, delay: 0.15 + Math.abs(r.index - this.main) * 0.25, y: 0, vy: 0, z: 0, spin: 0, splashed: false, started: false };
    }
    this.still = false;
  }

  get fallen(): boolean {
    return this.rigs.every((r) => r.gone);
  }

  /** Has the main span's centering reached the water? */
  get mainDown(): boolean {
    const r = this.rigs.find((x) => x.index === this.main);
    return !r || r.gone || (r.fall?.splashed ?? false);
  }

  /** Show the hoist with its trolley at x and the rope down to `end` (the top of the keystone). */
  setHoist(on: boolean, x = this.hoistX, end: Vec2 = this.ropeEnd): void {
    this.hoistOn = on;
    this.hoistX = x;
    this.ropeEnd = end;
    this.still = false;
  }

  update(dt: number, water: number): void {
    this.time += dt;
    if (this.still) {
      // Nothing in the timber moves: only the glowing (or flying) wedges need a frame.
      this.updateWedges(dt, water);
      this.glow.commit();
      return;
    }
    let moving = this.hoistOn;
    for (const r of this.rigs) {
      if (r.gone) continue;
      if (r.raising && r.raise < 1) {
        const before = r.raise;
        r.raise = Math.min(1, r.raise + dt / RAISE_SECONDS);
        if (before <= 0 && r.raise > 0) this.bus.emit('centering:raise', { at: { x: r.crown.x, y: r.yTie, z: 0 }, span: r.index });
        moving = true;
      }
      // The timber dips under a stone and springs back (a lightly damped spring).
      r.dipV += (-r.dip * 260 - r.dipV * 16) * dt;
      r.dip = Math.max(-0.03, r.dip + r.dipV * dt);
      if (Math.abs(r.dip) > 1e-4 || Math.abs(r.dipV) > 1e-3) moving = true;
      _off.set(0, r.dip, 0);
      let rot: Quaternion | null = null;
      let sink = 1;
      if (r.fall) {
        rot = this.fallStep(r, dt, water);
        sink = 1 - clamp01((r.fall.t - r.fall.delay - 8) / 1.5);
        if (sink <= 0) r.gone = true;
        moving = true;
      }
      for (const i of r.pieces) {
        const piece = this.timber.pieces[i]!;
        const local = r.raising ? clamp01((r.raise - ORDER[piece.kind] * 0.55) / 0.45) : 0;
        if (local <= 0 || sink <= 0) {
          this.timber.hide(i);
          continue;
        }
        const k = easeOutCubic(local);
        _v.copy(_off).y += (k - 1) * 0.8;
        this.timber.place(i, _v, rot, rot ? _pivot : null, (0.7 + 0.3 * k) * sink);
      }
    }
    this.updateHoist();
    this.updateWedges(dt, water);
    this.timber.commit();
    this.glow.commit();
    this.still = !moving;
  }

  private fallStep(r: SpanRig, dt: number, water: number): Quaternion {
    const f = r.fall!;
    f.t += dt;
    let roll = 0;
    if (f.t >= f.delay) {
      if (!f.started) {
        f.started = true;
        this.bus.emit('centering:fall', { at: { x: r.crown.x, y: r.yTie, z: 0 }, span: r.index });
      }
      const floor = water - r.yTie - 0.05;
      if (!f.splashed) {
        f.vy -= 9.81 * dt;
        f.y += f.vy * dt;
        if (f.y <= floor) {
          f.y = floor;
          f.splashed = true;
          this.bus.emit('splash', { at: { x: r.crown.x, y: water, z: 0 }, size: Math.min(6, 1 + r.span * 0.3) });
        }
      } else {
        // Afloat: it heels over onto its side, settles lower as it soaks, drifts downstream (-z)
        // and turns slowly.
        const age = f.t - f.delay;
        f.y = floor - 0.12 + Math.sin(age * 1.7) * 0.03 - Math.min(0.5, age * 0.05);
        f.z -= dt * Math.min(1.2, 0.3 + age * 0.15);
        f.spin += dt * 0.05;
        roll = 1.25 * (1 - Math.exp(-age * 1.4));
      }
    }
    _off.y += f.y;
    _off.z = f.z;
    _pivot.set(r.crown.x, r.yTie, 0);
    return _q.setFromAxisAngle(UP, f.spin).multiply(_roll.setFromAxisAngle(ALONG, -roll));
  }

  private updateHoist(): void {
    const ident = new Quaternion();
    for (const i of this.hoistPieces) {
      if (!this.hoistOn) {
        this.timber.hide(i);
      } else if (i === this.blockIndex) {
        this.timber.set(i, new Vector3(this.hoistX, this.hoistTop - 0.25, 0), ident, this.timber.pieces[i]!.size);
      } else if (i === this.ropeIndex) {
        const top = new Vector3(this.hoistX, this.hoistTop - 0.4, 0);
        const end = new Vector3(this.ropeEnd.x, Math.min(this.ropeEnd.y, top.y - 0.05), 0);
        const rope = between(end, top, 0.035, 0.035);
        this.timber.set(i, rope.pos, rope.quat, rope.size);
      } else {
        this.timber.place(i, _v.set(0, 0, 0), null, null);
      }
    }
  }

  private updateWedges(dt: number, water: number): void {
    const ready = this.rigs.every((r) => r.raise >= 1);
    const waiting = this.mainWedges.some((w) => !w.struck);
    this.glowMat.emissiveIntensity = ready && waiting && this.wedgesLit ? 0.25 + 0.2 * Math.sin(this.time * 3.2) : 0;
    for (const w of this.mainWedges) {
      const p = this.glow.pieces[w.piece]!;
      if (!ready || w.done) {
        this.glow.hide(w.piece);
        continue;
      }
      if (!w.struck) {
        this.glow.place(w.piece, _v.set(0, 0, 0), null, null);
        continue;
      }
      w.flying += dt;
      const t = w.flying;
      _v.set(w.vel.x * t, w.vel.y * t - 4.9 * t * t, w.vel.z * t);
      _q.setFromAxisAngle(TUMBLE, w.spin * t);
      this.glow.place(w.piece, _v, _q, p.pos);
      if (p.pos.y + _v.y < water && t > 0.2) {
        w.done = true;
        this.bus.emit('splash', { at: { x: p.pos.x + _v.x, y: water, z: p.pos.z + _v.z }, size: 0.4 });
      }
    }
  }

  dispose(): void {
    this.timber.dispose();
    this.glow.dispose();
    this.glowMat.dispose();
  }
}
