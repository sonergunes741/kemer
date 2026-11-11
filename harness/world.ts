/**
 * World harness: the landscape of a fixture level with URL parameters for every state worth
 * judging. Open /harness/world.html?biome=green-valley&season=0.6&hour=16&bridge=1
 *
 *   biome     one of the eleven BiomeId values (default green-valley)
 *   site      stream | river | wide | gorge (default: by biome)
 *   season    0..1 (0 = 1 January)        hour   0..24        year   calendar year
 *   lapse     0..1 time-lapse; sweep=1 runs the seasons, run=1 runs the clock (rate hours/s)
 *   water     level above normal (m)      turbidity 0..1    heap  m   speed m/s   rough 0..1
 *   flood=1   brown flood at the springings with driftwood and rain
 *   quality   low | medium | high         yaw, pitch (rad)  dist (zoom factor)  fov (deg)
 *   tx, ty, tz  shift of the look-at point in metres (ty > 0 looks up into the sky)
 *   bridge=1  plain slab bridge with piers        rain, snow 0..1 forced weather
 *   fx=1      splashes and dust every few seconds   stats=1 draw calls, triangles, frame time
 * window.world is the WorldApi; window.harness has the fixture and helpers.
 */
import { DoubleSide, ExtrudeGeometry, Mesh, MeshStandardMaterial, Path, Shape } from 'three';
import { Bus } from '../src/core/bus';
import type { WaterState, WorldTime } from '../src/core/contracts';
import type { BiomeId, BridgeGeometry, QualityId } from '../src/core/types';
import { loadManifest } from '../src/core/assets';
import { createWorld } from '../src/render/world';
import { BIOMES } from '../src/render/world/biomes';
import { fixtureBridge, fixtureLevel, fixtureSite, type SiteKey } from './worldFixtures';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = q.get(k);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const biome = (q.get('biome') ?? 'green-valley') as BiomeId;
const siteKey = (q.get('site') ?? undefined) as SiteKey | undefined;
const quality = (q.get('quality') ?? 'medium') as QualityId;

document.documentElement.style.background = '#14110e';
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';
const canvas = document.getElementById('scene') as HTMLCanvasElement;
canvas.style.display = 'block';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
const statsEl = document.getElementById('stats') as HTMLDivElement;
Object.assign(statsEl.style, {
  position: 'fixed',
  left: '12px',
  bottom: '10px',
  font: '12px/1.4 ui-monospace, monospace',
  color: '#f2ece0',
  textShadow: '0 1px 2px #000',
  whiteSpace: 'pre',
  display: q.get('stats') === '1' ? 'block' : 'none',
});

/** The harness bridge: one extruded slab with the arch openings cut out; piers are what is left. */
function slab(g: BridgeGeometry): Mesh {
  const deck = g.deck;
  const outer = new Shape();
  outer.moveTo(deck[0]!.x, -6);
  for (const p of deck) outer.lineTo(p.x, p.y);
  outer.lineTo(deck[deck.length - 1]!.x, -6);
  outer.closePath();
  for (const s of g.spans) {
    const hole = new Path();
    hole.moveTo(s.intrados[0]!.x, -5.5);
    for (const p of s.intrados) hole.lineTo(p.x, p.y);
    hole.lineTo(s.intrados[s.intrados.length - 1]!.x, -5.5);
    hole.closePath();
    outer.holes.push(hole);
  }
  const geo = new ExtrudeGeometry(outer, { depth: g.width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -g.width / 2);
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, new MeshStandardMaterial({ color: 0xb9ad97, roughness: 0.88, side: DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'harness-bridge';
  return mesh;
}

async function main(): Promise<void> {
  await loadManifest();
  const bus = new Bus();
  const world = createWorld(canvas, bus, { quality });
  const level = fixtureLevel(biome, siteKey);
  const fixture = fixtureSite(biome, siteKey);
  const flood = q.get('flood') === '1';
  const time: WorldTime = { year: num('year', 1500), season: num('season', 0.58), hour: num('hour', 16.2), lapse: num('lapse', 0) };
  const water: WaterState = {
    level: num('water', flood ? fixture.site.springLevel : 0),
    speed: num('speed', flood ? 2.6 : BIOMES[biome].flow),
    turbidity: num('turbidity', flood ? 1 : 0.08),
    rough: num('rough', flood ? 0.75 : 0.08),
    heap: num('heap', flood ? 0.35 : 0),
  };
  const resize = (): void => world.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  resize();
  window.addEventListener('resize', resize);
  await world.load(level);
  world.setTime(time);
  world.setWater(water);
  let geometry: BridgeGeometry | null = null;
  if (q.get('bridge') === '1') {
    geometry = fixtureBridge(biome, siteKey);
    world.scene.add(slab(geometry));
    world.setBridge(geometry, geometry.piers.map(() => 0.4));
  }
  if (flood) {
    world.fx.driftwood(0.7);
    world.fx.weather(0.55, 0);
  }
  world.fx.weather(num('rain', flood ? 0.55 : 0), num('snow', 0));
  world.fx.birds(num('birds', 1));

  // Camera: frame the bridge (or the site), then apply the URL's angles and zoom.
  const yaw = num('yaw', 0.42);
  const pitch = num('pitch', 0.14);
  const fov = num('fov', 38);
  const frameGeo = geometry ?? fixtureBridge(biome, siteKey);
  const pose = world.rig.frame(frameGeo, yaw, pitch, fov, 0.35);
  pose.distance *= num('dist', 1);
  // Shift the look-at point (metres): ty > 0 tilts the view up into the sky.
  pose.target.x += num('tx', 0);
  pose.target.y += num('ty', 0);
  pose.target.z += num('tz', 0);
  world.rig.set(pose);
  await world.warmUp();

  const run = q.get('run') === '1';
  const sweep = q.get('sweep') === '1';
  const rate = num('rate', 2);
  const fxDemo = q.get('fx') === '1';
  let last = performance.now();
  let fxClock = 0;
  let frames = 0;
  let acc = 0;
  let shown = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (run) time.hour = (time.hour + dt * rate) % 24;
    if (sweep) {
      time.season = (time.season + dt * 0.9) % 1;
      time.year += dt * 0.9;
    }
    world.setTime(time);
    if (fxDemo) {
      fxClock += dt;
      if (fxClock > 2.5) {
        fxClock = 0;
        const x = (Math.random() - 0.5) * (fixture.site.right - fixture.site.left) * 0.6;
        bus.emit('splash', { at: { x, y: 0, z: fixture.site.width / 2 + 2 }, size: 1.2 });
        bus.emit('stone:land', { at: { x: -x, y: fixture.site.springLevel + 1, z: 0 }, mass: 0.8, part: 'voussoir', count: 1 });
      }
    }
    world.update(dt);
    world.render();
    frames++;
    acc += dt;
    if (now - shown > 500) {
      const s = world.stats();
      statsEl.textContent = `${biome} · ${quality}\ncalls ${s.calls}  tris ${(s.triangles / 1000).toFixed(0)}k\ncpu ${s.cpuMs.toFixed(1)} ms  frame ${((acc / frames) * 1000).toFixed(1)} ms`;
      shown = now;
      frames = 0;
      acc = 0;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const w = window as unknown as Record<string, unknown>;
  w['world'] = world;
  w['harness'] = {
    level,
    geometry,
    bus,
    time,
    water,
    setTime(patch: Partial<WorldTime>) {
      Object.assign(time, patch);
    },
    setWater(patch: Partial<WaterState>) {
      Object.assign(water, patch);
      world.setWater(water);
    },
  };
  w['harnessReady'] = true;
}

main().catch((err: unknown) => {
  console.error('[world harness]', err);
});
