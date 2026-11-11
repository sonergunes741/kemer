/**
 * The bridge view (see docs/ARCHITECTURE.md, "Rendering decisions"): the draft massing model, the
 * stone field, timber centering, ageing, the collapse and the traffic, behind BridgeViewApi.
 */
import { Group, Vector3 } from 'three';
import type { Bus } from '../../core/bus';
import type { BridgeViewApi, BuildProgress, StoneRef, WorldApi, WorldTime } from '../../core/contracts';
import { QUALITY } from '../../core/config';
import { clamp01, smoothstep } from '../../core/math';
import { mulberry32 } from '../../core/rng';
import type { ActorKind, BridgeGeometry, BridgeState, CollapseInfo, FamilyMark, LevelDef, QualityId, TrafficEra, Vec2, Vec3 } from '../../core/types';
import { ActorLibrary } from './actors';
import { Ageing } from './ageing';
import { Build } from './build';
import { Centering } from './centering';
import { CollapseScene } from './collapse';
import { Draft } from './draft';
import { faceStone, Mark } from './mark';
import { BridgeModel, DETAIL } from './model';
import { loadRapier } from './physics';
import { pickStone, setHover } from './pick';
import { TextureCache } from './textures';
import { setTimberTexture, timberMaterial } from './timber';
import { Traffic } from './traffic';
import { WipeMask } from './wipe';

/** BridgeViewApi plus what the game and the harness may also use. */
export interface KemerBridgeView extends BridgeViewApi {
  /** Calendar, season and time-lapse, for snow on the stones (the world does not expose its own). */
  setTime(time: WorldTime): void;
  /** Load the physics engine ahead of a collapse (call during the time-lapse). */
  warmPhysics(): Promise<void>;
  /** Stones and buffers of the current bridge, for the harness. */
  stats(): { stones: number; vertices: number; triangles: number };
  /**
   * Wipe moss and lichen off the upstream face around an elevation point (the epilogue). Returns
   * how clean the stone now is at `probe` (0..1), so the caller can tell when a place is found.
   */
  wipe(at: Vec2, radius: number, probe?: Vec2): number;
  /** A thick coat of moss and lichen over the upstream face (0..1), left by decades untended; wiping cuts through it. */
  overgrow(amount: number): void;
}

const NO_PROGRESS: BuildProgress = { laid: 0, total: 0, awaitingKeystone: false, complete: false };

interface Waiter {
  until: (dt: number) => boolean;
  done: () => void;
}

class BridgeView implements KemerBridgeView {
  readonly object = new Group();
  private quality: QualityId;
  private readonly textures = new TextureCache();
  private readonly library = new ActorLibrary();
  private readonly timberMat = timberMaterial();
  private draft: Draft | null = null;
  private model: BridgeModel | null = null;
  private centering: Centering | null = null;
  private build: Build | null = null;
  private ageing: Ageing | null = null;
  private mark: Mark | null = null;
  private wiped: WipeMask | null = null;
  private markDef: { stone: StoneRef; mark: FamilyMark } | null = null;
  private taps: { n: number; next: number; done: () => void } | null = null;
  private fall: CollapseScene | null = null;
  private traffic: Traffic | null = null;
  private trafficSetting: { era: TrafficEra | null; density: number } = { era: null, density: 0 };
  private readonly waiters: Waiter[] = [];
  private lastState: BridgeState | null = null;
  private drops: readonly number[] = [];
  private flood = 0;
  private time: WorldTime | null = null;
  private keystoneSlow = 0;
  private readonly sun = new Vector3(0.3, 0.8, 0.5);
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    private readonly world: WorldApi,
    private readonly bus: Bus,
    quality: QualityId,
  ) {
    this.quality = quality;
    this.object.name = 'kemer-bridge';
    // The flood level is announced on the bus; the stones darken below it.
    this.unsubscribe.push(this.bus.on('flood', (e) => (this.flood = e.phase === 'end' ? 0 : e.level)));
    void this.textures.get('timber').then((set) => setTimberTexture(this.timberMat, set));
  }

  /* ---------------------------------------------------------------- design */

  preview(level: LevelDef, geometry: BridgeGeometry): void {
    if (this.model) this.dropModel();
    if (!this.draft) {
      this.draft = new Draft();
      this.object.add(this.draft.mesh);
    }
    this.draft.show(level, geometry);
  }

  clear(): void {
    this.draft?.hide();
    this.dropModel();
  }

  private dropModel(): void {
    for (const w of this.waiters.splice(0)) w.done();
    this.taps?.done();
    this.taps = null;
    this.fall?.dispose();
    this.fall = null;
    this.build?.dispose();
    this.build = null;
    this.wiped?.dispose();
    this.wiped = null;
    for (const part of [this.centering, this.ageing, this.mark, this.traffic]) {
      if (!part) continue;
      this.object.remove('group' in part ? part.group : part.mesh);
      part.dispose();
    }
    this.centering = null;
    this.ageing = null;
    this.mark = null;
    this.traffic = null;
    if (this.model) {
      this.object.remove(this.model.group);
      this.model.dispose();
      this.model = null;
    }
  }

  private makeModel(level: LevelDef, geometry: BridgeGeometry): BridgeModel {
    this.dropModel();
    this.draft?.hide();
    this.lastState = null;
    this.drops = [];
    this.markDef = null;
    const preset = QUALITY[this.quality];
    const m = new BridgeModel(level, geometry, DETAIL[preset.stoneDetail], this.textures);
    this.model = m;
    this.object.add(m.group);
    this.ageing = new Ageing(m, this.bus, this.world.fx, preset.particles);
    this.object.add(this.ageing.group);
    this.traffic = new Traffic(this.library, m.layout.frame, geometry.width, this.bus, mulberry32(level.site.seed >>> 0));
    this.traffic.setTraffic(this.trafficSetting.era, this.trafficSetting.density);
    this.object.add(this.traffic.group);
    return m;
  }

  /** Resolve `done` once `until` holds (checked every frame). */
  private when(until: (dt: number) => boolean): Promise<void> {
    return new Promise((done) => this.waiters.push({ until, done }));
  }

  /* ---------------------------------------------------------------- building */

  async beginBuild(level: LevelDef, geometry: BridgeGeometry): Promise<void> {
    const m = this.makeModel(level, geometry);
    const f = m.layout.frame;
    this.centering = new Centering(f.spans, f, geometry.width, m.layout.mainSpan, this.timberMat, this.bus);
    this.object.add(this.centering.group);
    this.build = new Build(m, this.centering, this.bus, mulberry32((level.site.seed * 31 + 7) >>> 0));
    this.build.seatListener = () => (this.keystoneSlow = 0.5);
  }

  raiseCentering(): Promise<void> {
    return this.build?.raise() ?? Promise.resolve();
  }

  lay(dt: number, holding: boolean): BuildProgress {
    return this.build?.lay(dt, holding) ?? this.progress;
  }

  get progress(): BuildProgress {
    if (this.build) return this.build.progress;
    const n = this.model?.count ?? 0;
    return n > 0 ? { laid: n, total: n, awaitingKeystone: false, complete: true } : NO_PROGRESS;
  }

  hangKeystone(): { span: number; seat: Vec3 } {
    return this.build?.hangKeystone() ?? { span: 0, seat: { x: 0, y: 0, z: 0 } };
  }

  moveKeystone(x: number, y: number): void {
    this.build?.moveKeystone(x, y);
  }

  dropKeystone(): Promise<boolean> {
    return this.build?.dropKeystone() ?? Promise.resolve(false);
  }

  finish(): Promise<void> {
    const c = this.centering;
    return (this.build?.finish() ?? Promise.resolve()).then(() => {
      if (c) c.wedgesLit = true;
    });
  }

  pick(x: number, y: number): StoneRef | null {
    return this.model ? pickStone(this.world, this.model, x, y) : null;
  }

  hover(stone: StoneRef | null): void {
    if (this.model) setHover(this.model, stone);
  }

  carve(stone: StoneRef, mark: FamilyMark): Promise<void> {
    const made = this.cut(stone, mark);
    if (!made) return Promise.resolve();
    made.reveal(0);
    this.taps?.done();
    return new Promise((done) => {
      this.taps = { n: 0, next: 0.15, done };
    });
  }

  private cut(stone: StoneRef, mark: FamilyMark): Mark | null {
    const m = this.model;
    if (!m) return null;
    const i = faceStone(m, stone);
    if (i < 0) return null;
    if (this.mark) {
      this.object.remove(this.mark.mesh);
      this.mark.dispose();
    }
    this.mark = new Mark(m, i, mark);
    this.object.add(this.mark.mesh);
    this.markDef = { stone, mark };
    return this.mark;
  }

  wedges(): readonly Vec3[] {
    return this.centering?.wedgePositions() ?? [];
  }

  strikeWedge(index: number): Promise<void> {
    const c = this.centering;
    const hit = c?.strike(index);
    if (!c || !hit) return Promise.resolve();
    this.bus.emit('wedge:strike', { at: hit.at, left: hit.left });
    // Each blow loads the timber more: the groan grows.
    this.bus.emit('timber:creak', { at: c.pointOn(c.main), strain: 0.5 + 0.5 * (1 - hit.left / 3) });
    if (hit.left > 0) {
      let t = 0;
      return this.when((dt) => (t += dt) > 0.35);
    }
    c.drop();
    return this.when(() => c.mainDown);
  }

  settle(drops: readonly number[]): Promise<void> {
    this.drops = drops;
    return this.ageing?.settle(drops) ?? Promise.resolve();
  }

  /* ---------------------------------------------------------------- the centuries */

  async showBuilt(level: LevelDef, geometry: BridgeGeometry, mark: { stone: StoneRef; mark: FamilyMark } | null): Promise<void> {
    const m = this.makeModel(level, geometry);
    m.layAll();
    if (mark) this.cut(mark.stone, mark.mark)?.reveal(1);
  }

  apply(state: BridgeState): void {
    this.lastState = state;
    this.ageing?.apply(state);
  }

  tremor(strength: number): void {
    this.ageing?.tremor(strength);
  }

  wipe(at: Vec2, radius: number, probe?: Vec2): number {
    const m = this.model;
    if (!m) return 0;
    this.wiped ??= new WipeMask(m.geometry, m.uniforms);
    this.wiped.paint(at, radius);
    return probe ? this.wiped.at(probe) : 0;
  }

  overgrow(amount: number): void {
    const m = this.model;
    if (!m) return;
    // The coat only exists where a hand could wipe it, so the mask (and its box) comes first.
    this.wiped ??= new WipeMask(m.geometry, m.uniforms);
    m.uniforms.uOvergrowth.value = Math.max(0, Math.min(1, amount));
  }

  collapse(info: CollapseInfo): Promise<void> {
    const m = this.model;
    if (!m) return Promise.resolve();
    this.traffic?.clear();
    this.fall?.dispose();
    // Rigid bodies for the biggest stones, as many as the preset can afford.
    const budget = Math.round(250 + 650 * QUALITY[this.quality].particles);
    this.fall = new CollapseScene(m, info, this.bus, () => this.flood, budget);
    return this.fall.play();
  }

  get slowMotion(): number {
    if (this.fall) return this.fall.slowMotion;
    return this.keystoneSlow > 0 ? 0.4 : 1;
  }

  /* ---------------------------------------------------------------- traffic */

  setTraffic(era: TrafficEra | null, density: number): void {
    this.trafficSetting = { era, density };
    this.traffic?.setTraffic(era, density);
  }

  cross(actor: ActorKind, count: number, seconds: number): Promise<void> {
    return this.traffic?.cross(actor, count, seconds) ?? Promise.resolve();
  }

  /* ---------------------------------------------------------------- frame */

  setTime(time: WorldTime): void {
    this.time = time;
  }

  warmPhysics(): Promise<void> {
    return loadRapier().then(() => undefined);
  }

  setQuality(quality: QualityId): void {
    if (quality === this.quality) return;
    const before = QUALITY[this.quality].stoneDetail;
    this.quality = quality;
    const m = this.model;
    // A finished, standing bridge is rebuilt at the new detail with everything it has been through.
    if (!m || before === QUALITY[quality].stoneDetail || this.fall || (this.build && this.build.state !== 'done')) return;
    const { level, geometry } = m;
    const state = this.lastState;
    const drops = this.drops;
    const mark = this.markDef;
    void this.showBuilt(level, geometry, mark).then(() => {
      if (drops.length > 0) void this.ageing?.settle(drops, 0);
      if (state) this.apply(state);
    });
  }

  update(dt: number): void {
    const m = this.model;
    this.keystoneSlow = Math.max(0, this.keystoneSlow - dt / 0.4);
    if (m) {
      this.findSun();
      const u = m.uniforms;
      u.uSunDir.value.copy(this.sun);
      u.uWater.value = this.flood;
      u.uSnow.value = this.snow(m.level);
    }
    const water = this.flood;
    this.build?.update(dt);
    this.centering?.update(dt, water);
    this.ageing?.update(dt);
    this.fall?.update(dt);
    this.traffic?.update(dt);
    this.updateTaps(dt);
    this.wiped?.flush();
    for (let k = this.waiters.length - 1; k >= 0; k--) {
      const w = this.waiters[k]!;
      if (w.until(dt)) {
        this.waiters.splice(k, 1);
        w.done();
      }
    }
    m?.field.flush();
  }

  /** Three chisel taps, a third of the mark each. */
  private updateTaps(dt: number): void {
    const t = this.taps;
    if (!t || !this.mark) return;
    t.next -= dt;
    if (t.next > 0) return;
    if (t.n >= 3) {
      this.taps = null;
      t.done();
      return;
    }
    t.n++;
    this.bus.emit('mark:tap', { at: this.mark.at, n: t.n });
    this.mark.reveal(t.n / 3);
    t.next = t.n < 3 ? 0.38 : 0.25;
  }

  /** Snow lies on the stones in the depth of winter, as much as the site's winters allow. */
  private snow(level: LevelDef): number {
    const t = this.time;
    if (!t) return 0;
    const winter = Math.cos((t.season - 0.04) * Math.PI * 2);
    return clamp01(level.env.winter * 1.4) * smoothstep(0.55, 0.9, winter);
  }

  /** The world's sun, read from the scene so moss can favour the shaded faces. */
  private findSun(): void {
    for (const child of this.world.scene.children) {
      const light = child as { isDirectionalLight?: boolean; position?: Vector3; target?: { position: Vector3 } };
      if (light.isDirectionalLight && light.position && light.target) {
        this.sun.copy(light.position).sub(light.target.position).normalize();
        return;
      }
    }
  }

  stats(): { stones: number; vertices: number; triangles: number } {
    const m = this.model;
    if (!m) return { stones: 0, vertices: 0, triangles: 0 };
    let v = 0;
    let t = 0;
    for (const g of m.field.geometries) {
      v += g.getAttribute('position').count;
      t += (g.getIndex()?.count ?? 0) / 3;
    }
    return { stones: m.count, vertices: v, triangles: t };
  }

  dispose(): void {
    this.dropModel();
    if (this.draft) {
      this.object.remove(this.draft.mesh);
      this.draft.dispose();
      this.draft = null;
    }
    for (const off of this.unsubscribe.splice(0)) off();
    this.timberMat.dispose();
    this.library.dispose();
    this.textures.dispose();
  }
}

export function createBridgeView(world: WorldApi, bus: Bus, options: { quality: QualityId }): KemerBridgeView {
  return new BridgeView(world, bus, options.quality);
}
