/**
 * Bridge harness: a fixture's bridge in the real world, at any stage of its life.
 *
 *   /harness/bridge.html?fixture=a|b|c|d|ten&quality=low|medium|high&stage=...
 *
 * Stages: draft · build (&hold=seconds held, &keystone=1 to hang it, &kx=&ky= offset from the
 * seat) · built (&mark=1) · aged (&year=) · hinges (&year=) · collapse (&cause=chronicle|strike|
 * flood-wash|flood-scour|quake, &after=ms) · traffic (&actor=, &count=, &seconds=, or &era=1).
 * Camera: &view=frame|crown, &yaw=, &pitch=, &dist=, &fov=, &tx=, &ty=, &tz=. &stats=1 shows numbers.
 * Everything is also on window.hx for scripted runs (scripts/shot.mjs --steps).
 */
import { Bus } from '../src/core/bus';
import { loadManifest } from '../src/core/assets';
import type { ActorKind, BridgeState, CauseId, CollapseInfo, FamilyMark, QualityId, SpanCollapse } from '../src/core/types';
import { createWorld } from '../src/render/world';
import { createBridgeView } from '../src/render/bridge';
import { mainSpanOf } from '../src/render/bridge/layout';
import { createSim } from '../src/sim';
import { FIXTURES, longBridge } from '../src/sim/testing/fixtures';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = q.get(k);
  const n = v === null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const quality = (q.get('quality') ?? 'high') as QualityId;
const fx = q.get('fixture') ?? 'a';
const stage = q.get('stage') ?? 'built';
const level = fx === 'ten' ? longBridge(10) : (FIXTURES[fx as 'a'] ?? FIXTURES.a);
const design = { ...level.starter, reliefs: q.get('reliefs') === '1' || level.starter.reliefs };
/** A sample family mark: a mason's arrow over a bar. */
const MARK: FamilyMark = { strokes: [[1, 7], [3, 1], [1, 5], [6, 8]] };

document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
const canvas = document.getElementById('scene') as HTMLCanvasElement;
canvas.style.display = 'block';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
const statsBox = document.getElementById('stats') as HTMLDivElement;
Object.assign(statsBox.style, { position: 'fixed', left: '8px', top: '8px', font: '12px/1.4 monospace', color: '#fff', background: 'rgba(0,0,0,.45)', padding: '4px 8px', whiteSpace: 'pre', display: q.get('stats') === '1' ? 'block' : 'none' });

async function main(): Promise<void> {
  await loadManifest();
  const bus = new Bus();
  const world = createWorld(canvas, bus, { quality });
  const sim = createSim();
  const geometry = sim.geometry(level, design);
  const insight = sim.insight(level, design);
  world.resize(window.innerWidth, window.innerHeight, 1);
  await world.load(level);
  const time = { year: num('year', level.year), season: num('season', 0.55), hour: num('hour', 15.5), lapse: 0 };
  world.setTime(time);
  const water = { level: 0, speed: 0.6, turbidity: 0.1, rough: 0.08, heap: 0 };
  world.setWater(water);
  world.setBridge(geometry);
  const bridge = createBridgeView(world, bus, { quality });
  bridge.setTime(time);
  world.scene.add(bridge.object);
  const events: string[] = [];
  for (const type of ['stone:land', 'keystone:seat', 'mark:tap', 'centering:raise', 'wedge:strike', 'centering:fall', 'timber:creak', 'arch:settle', 'splash', 'impact', 'crack', 'collapse:start', 'collapse:end', 'traffic:pass', 'traffic:step'] as const) {
    bus.on(type, () => events.push(type));
  }

  const main = mainSpanOf(geometry);
  const crown = geometry.spans[main]!.crown;
  const camera = (): void => {
    const view = q.get('view') ?? (fx === 'c' || fx === 'ten' ? 'frame' : 'crown');
    if (view === 'frame') {
      const pose = world.rig.frame(geometry, num('yaw', 0.35), num('pitch', 0.1), num('fov', 35), num('margin', 1.1));
      world.rig.set({ ...pose, target: { x: pose.target.x + num('tx', 0), y: pose.target.y + num('ty', 0), z: pose.target.z + num('tz', 0) } });
    } else {
      world.rig.set({ target: { x: crown.x + num('tx', 0), y: crown.y * 0.7 + num('ty', 0), z: num('tz', 0) }, distance: num('dist', 14), yaw: num('yaw', 0.5), pitch: num('pitch', 0.12), fov: num('fov', 35) });
    }
  };
  camera();

  let holding = false;
  /** Fast-forward the bridge (not the world) in fixed steps. */
  const run = (seconds: number, hold = false): void => {
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      bridge.lay(dt, hold);
      bridge.update(dt * bridge.slowMotion);
    }
  };
  const chronicle = (until: number): { state: BridgeState; collapse: CollapseInfo | null; flood: number } => {
    const r = sim.run(level, design);
    let collapse: CollapseInfo | null = null;
    let flood = 0;
    for (const e of r.advance(until)) {
      if (e.kind === 'collapse') collapse = e.info;
      if (e.kind === 'flood') flood = e.level;
    }
    return { state: structuredClone(r.state), collapse, flood };
  };
  const synthetic = (cause: CauseId): CollapseInfo => {
    const hinges = (s: number): SpanCollapse => ({ span: s, delay: 0, hinges: insight.spans[s]?.hinges ?? [], sense: 1 });
    const spans: SpanCollapse[] = [];
    let piers: number[] = [];
    if (cause === 'flood-wash') spans.push({ span: main, delay: 0, hinges: [], sense: 1 });
    else if (cause === 'quake') geometry.spans.forEach((_, s) => spans.push({ ...hinges(s), delay: Math.abs(s - main) * 0.25, sense: s % 2 === 0 ? 1 : -1 }));
    else if (cause === 'flood-scour' && geometry.piers.length > 0) {
      const p = Math.min(main, geometry.piers.length - 1);
      piers = [p];
      spans.push(hinges(p), { ...hinges(p + 1), delay: 0.3, sense: -1 });
    } else spans.push(hinges(main));
    return { year: time.year, cause, spans, piers };
  };
  const setFlood = (level: number): void => {
    water.level = level;
    water.turbidity = level > 0.5 ? 0.9 : 0.1;
    water.speed = level > 0.5 ? 2.5 : 0.6;
    world.setWater(water);
    bus.emit('flood', { phase: level > 0 ? 'peak' : 'end', level, drama: 1 });
  };

  const hx = {
    world,
    bridge,
    sim,
    level,
    geometry,
    events,
    run,
    hold: (on: boolean) => (holding = on),
    camera,
    stats: () => {
      const b = bridge.stats();
      const w = (world as unknown as { stats(): { calls: number; triangles: number } }).stats();
      return { stones: b.stones, vertices: b.vertices, bridgeTriangles: b.triangles, calls: w.calls, triangles: w.triangles };
    },
    /** Mean milliseconds of one draft rebuild. */
    timePreview: (n = 60): number => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) bridge.preview(level, geometry);
      return (performance.now() - t0) / n;
    },
    build: async (): Promise<void> => {
      await bridge.beginBuild(level, geometry);
      const raised = bridge.raiseCentering();
      run(6);
      await raised;
    },
    lay: (seconds: number) => run(seconds, true),
    layAll: () => {
      for (let k = 0; k < 120 && !bridge.progress.awaitingKeystone; k++) run(0.5, true);
      return bridge.progress;
    },
    hang: () => bridge.hangKeystone(),
    moveKey: (x: number, y: number) => bridge.moveKeystone(x, y),
    drop: () => bridge.dropKeystone(),
    finish: () => bridge.finish(),
    strike: (i = 0) => bridge.strikeWedge(i),
    settle: () => bridge.settle(sim.strike(level, design).settle),
    carve: (span = main, stone = Math.floor(geometry.spans[main]!.voussoirs.length / 2) - 2) => bridge.carve({ span, stone }, MARK),
    age: (year: number) => {
      const c = chronicle(year);
      time.year = year;
      world.setTime(time);
      bridge.apply(c.state);
      return c.state;
    },
    collapse: (cause = q.get('cause') ?? 'chronicle'): Promise<void> => {
      let info: CollapseInfo;
      if (cause === 'chronicle') {
        const end = chronicle(level.endYear);
        if (!end.collapse) return Promise.resolve();
        info = end.collapse;
        const before = chronicle(info.year - 0.01);
        bridge.apply(before.state);
        if (info.cause.startsWith('flood')) setFlood(Math.max(1.5, before.flood));
      } else {
        info = synthetic(cause as CauseId);
        if (cause.startsWith('flood')) setFlood(2.5);
      }
      return bridge.collapse(info);
    },
    flood: setFlood,
    cross: (actor: ActorKind, count = 1, seconds = 20) => bridge.cross(actor, count, seconds),
  };
  (window as unknown as Record<string, unknown>)['hx'] = hx;

  switch (stage) {
    case 'draft':
      bridge.preview(level, geometry);
      break;
    case 'build': {
      await hx.build();
      if (q.get('keystone') === '1') {
        hx.layAll();
        const { seat } = bridge.hangKeystone();
        bridge.moveKeystone(seat.x + num('kx', -0.9), seat.y + num('ky', 1.1));
        run(1.2);
      } else run(num('hold', 6), true);
      break;
    }
    case 'aged':
    case 'hinges':
      await bridge.showBuilt(level, geometry, null);
      hx.age(num('year', level.year + 400));
      break;
    case 'collapse':
      await bridge.showBuilt(level, geometry, null);
      void bridge.warmPhysics();
      setTimeout(() => void hx.collapse(), num('after', 1500));
      break;
    case 'traffic': {
      await bridge.showBuilt(level, geometry, null);
      const actor = (q.get('actor') ?? 'caravan') as ActorKind;
      if (q.get('era') === '1') bridge.setTraffic({ from: 0, to: 3000, actors: ['villager', 'donkey', 'ox-cart', 'rider'], axle: 40 }, num('density', 0.8));
      else void bridge.cross(actor, num('count', 1), num('seconds', 18));
      break;
    }
    default:
      await bridge.showBuilt(level, geometry, q.get('mark') === '1' ? { stone: { span: main, stone: Math.floor(geometry.spans[main]!.voussoirs.length / 2) - 2 }, mark: MARK } : null);
  }
  await world.warmUp();

  let last = performance.now();
  let shown = 0;
  const loop = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const slow = bridge.slowMotion;
    if (holding) bridge.lay(dt, true);
    bridge.update(dt * slow);
    world.update(dt * slow);
    world.render();
    shown += dt;
    if (shown > 0.5) {
      shown = 0;
      const s = hx.stats();
      const p = bridge.progress;
      statsBox.textContent = `${fx} · ${quality} · ${stage}\nstones ${s.stones}  verts ${s.vertices}  tris(bridge) ${s.bridgeTriangles}\ncalls ${s.calls}  tris(frame) ${s.triangles}\nlaid ${p.laid}/${p.total}  slow ${slow.toFixed(2)}`;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
main().catch((e: unknown) => console.error('[bridge harness]', e));
