/**
 * Debug page for the simulation: a fixture drawn in elevation with its line of thrust, and four
 * sliders. A tool for the lead, not a product. Open /harness/sim.html?fixture=a|b|c|d.
 */
import type { BridgeDesign, Capacities, Insight, LevelDef, Vec2 } from '../src/core/types';
import { createSim } from '../src/sim/index';
import { FIXTURES } from '../src/sim/testing/fixtures';

const sim = createSim();
const key = new URLSearchParams(location.search).get('fixture') ?? 'a';
const level: LevelDef = FIXTURES[key as keyof typeof FIXTURES] ?? FIXTURES.a;
let design: BridgeDesign = sim.normalize(level, level.starter);
let capacities: Capacities | null = null;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const out = document.getElementById('out') as HTMLPreElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
(document.getElementById('title') as HTMLElement).textContent = `${key}: ${level.river.en}, ${level.stone}`;

interface Slider {
  readonly input: HTMLInputElement;
  readonly label: HTMLElement;
  readonly get: (d: BridgeDesign) => number;
  readonly set: (d: BridgeDesign, value: number) => void;
}

function slider(id: string, min: number, max: number, get: Slider['get'], set: Slider['set']): Slider {
  const input = document.getElementById(id) as HTMLInputElement;
  input.min = String(min);
  input.max = String(max);
  input.step = String((max - min) / 400);
  const s: Slider = { input, label: document.getElementById(`${id}Value`) as HTMLElement, get, set };
  input.addEventListener('input', () => {
    const next = structuredClone(design);
    set(next, Number(input.value));
    design = sim.normalize(level, next);
    capacities = null;
    refresh();
  });
  // Capacities are the slow answer: only when the handle is let go.
  input.addEventListener('change', () => {
    capacities = sim.capacities(level, design);
    refresh();
  });
  return s;
}

const length = level.site.right - level.site.left;
const everySpan = (d: BridgeDesign, change: (s: BridgeDesign['spans'][number]) => void): void => (d.linked ? d.spans : d.spans.slice(0, 1)).forEach(change);
const sliders: Slider[] = [
  slider('rise', 0.5, length, (d) => d.spans[0]!.rise, (d, v) => everySpan(d, (s) => (s.rise = v))),
  slider('fullness', 0, 1, (d) => d.spans[0]!.fullness, (d, v) => everySpan(d, (s) => (s.fullness = v))),
  slider('thickness', level.limits.thickness[0], level.limits.thickness[1], (d) => d.spans[0]!.thickness, (d, v) => everySpan(d, (s) => (s.thickness = v))),
  slider('pier', level.site.pierZone[0], level.site.pierZone[1], (d) => d.piers[0]?.x ?? 0, (d, v) => {
    if (d.piers[0]) d.piers[0].x = v;
  }),
];
sliders[3]!.input.disabled = design.piers.length === 0;

function path(points: readonly Vec2[], to: (p: Vec2) => [number, number], close = false): void {
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = to(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (close) ctx.closePath();
}

function draw(insight: Insight): void {
  const g = sim.geometry(level, design);
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Fit the bridge and a little of the banks.
  const x0 = g.deck[0]!.x - 2;
  const x1 = g.deck[g.deck.length - 1]!.x + 2;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of level.site.ground) if (p.x >= x0 && p.x <= x1) y0 = Math.min(y0, p.y);
  for (const p of g.piers) y0 = Math.min(y0, p.base);
  for (const p of g.deck) y1 = Math.max(y1, p.y + g.parapetHeight);
  const scale = Math.min((w - 40) / (x1 - x0), (h - 40) / (y1 - y0 + 2));
  const to = (p: Vec2): [number, number] => [20 + (p.x - x0) * scale, h - 20 - (p.y - (y0 - 1)) * scale];

  // Water at its normal level, then the ground.
  ctx.fillStyle = '#27404a';
  const [, waterY] = to({ x: 0, y: 0 });
  ctx.fillRect(0, waterY, w, h - waterY);
  path([...level.site.ground, { x: 1e4, y: -1e3 }, { x: -1e4, y: -1e3 }], to, true);
  ctx.fillStyle = '#4a4034';
  ctx.fill();

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#8c7f6d';
  for (const p of g.piers) {
    path([{ x: p.x - p.width / 2, y: p.base }, { x: p.x + p.width / 2, y: p.base }, { x: p.x + p.width / 2, y: p.top }, { x: p.x - p.width / 2, y: p.top }], to, true);
    ctx.fillStyle = '#6b5f50';
    ctx.fill();
    ctx.stroke();
  }
  for (const r of g.reliefs) {
    path([{ x: r.x - r.width / 2, y: r.sill }, { x: r.x + r.width / 2, y: r.sill }, { x: r.x + r.width / 2, y: r.sill + r.height }, { x: r.x - r.width / 2, y: r.sill + r.height }], to, true);
    ctx.stroke();
  }
  path(g.deck, to);
  ctx.strokeStyle = '#c9bca6';
  ctx.stroke();
  path(g.deck.map((p) => ({ x: p.x, y: p.y + g.parapetHeight })), to);
  ctx.strokeStyle = '#6f6557';
  ctx.stroke();

  g.spans.forEach((span, i) => {
    // Voussoirs: every outline, so the joints show.
    ctx.strokeStyle = '#a89a84';
    ctx.fillStyle = '#7d705f';
    for (const v of span.voussoirs) {
      path(v.outline, to, true);
      ctx.fill();
      ctx.stroke();
    }
    const s = insight.spans[i]!;
    path(s.thrustLine, to);
    ctx.strokeStyle = s.gsf >= 1.5 ? '#7fd08a' : s.gsf >= 1 ? '#e6c35c' : '#e0624f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const hinge of s.hinges) {
      const [x, y] = to(hinge.at);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = hinge.side === 'intrados' ? '#ff8a5c' : '#6cc3ff';
      ctx.fill();
    }
  });
}

function refresh(): void {
  const t0 = performance.now();
  const insight = sim.insight(level, design);
  const ms = performance.now() - t0;
  for (const s of sliders) {
    s.input.value = String(s.get(design));
    s.label.textContent = s.get(design).toFixed(2);
  }
  const lines = [
    `safety ${insight.safety.toFixed(2)}   stones ${insight.stones.total} (par ${level.parStones})   insight ${ms.toFixed(2)} ms`,
    `stones: ring ${insight.stones.ring}, spandrels ${insight.stones.spandrels}, piers ${insight.stones.piers}, parapets ${insight.stones.parapets}, extras ${insight.stones.extras}`,
    ...insight.spans.map((s, i) => `span ${i}: gsf ${s.gsf.toFixed(2)}  thrust ${s.thrust.toFixed(0)} kN/m  crushing ${s.crushing.toFixed(2)}  hinges ${s.hinges.map((x) => `${x.joint}${x.side[0]}`).join(' ')}`),
    ...insight.piers.map((p, i) => `pier ${i}: stability ${p.stability.toFixed(2)}`),
    `issues: ${insight.issues.map((i) => `${i.code}[${i.index}]`).join(', ') || 'none'}`,
    capacities
      ? `capacities:\n  axle ${capacities.axle.toFixed(0)} kN\n  quake ${capacities.quake.toFixed(3)} g\n  flood-free stage ${capacities.floodFree.toFixed(2)} m\n  waterway ${(capacities.waterway * 100).toFixed(0)} %\n  scour ${capacities.scour.toFixed(2)}\n  spread ${capacities.spread.toFixed(2)} m`
      : 'capacities: release a slider',
    `floods: 2-year ${sim.floodStage(level, 2).toFixed(2)} m, 100-year ${sim.floodStage(level, 100).toFixed(2)} m, greatest ${sim.greatestFlood(level).stage.toFixed(2)} m in ${sim.greatestFlood(level).year}`,
  ];
  out.textContent = lines.join('\n');
  draw(insight);
}

window.addEventListener('resize', refresh);
capacities = sim.capacities(level, design);
refresh();
