/**
 * Content harness: one ledger page per river, to read the words beside the site they belong to.
 * The cross-section shows the hand-written ground, the starter bridge, normal water, the two-year
 * flood and the river's greatest flood; below are the hazards, the starter's fate and every text
 * in both languages. Open /harness/content.html?level=<id> or ?daily=YYYY-MM-DD.
 */
import type { LevelStory } from '../src/core/contracts';
import type { BridgeDesign, HazardDef, LevelDef, LevelId, LocalText, Vec2 } from '../src/core/types';
import { createContent, LEVELS } from '../src/content/index';
import { seasonOf } from '../src/content/kit';
import { fate, trial } from '../src/content/tuning/trial';
import { createSim } from '../src/sim/index';

const sim = createSim();
const content = createContent(sim);
const params = new URLSearchParams(location.search);
const dailyDate = params.get('daily');
const id = (params.get('level') ?? 'koramaz') as LevelId;

function pick(): LevelDef {
  if (dailyDate) return content.daily(dailyDate);
  if (id === 'epilogue') {
    const source = LEVELS[0]!;
    return content.epilogue(source, source.starter);
  }
  return content.level(id) ?? LEVELS[0]!;
}

const level = pick();
const story: LevelStory | null = content.story(dailyDate ? 'daily' : level.id);

/* -- helpers -------------------------------------------------------------------------------- */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function el(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

function pair(t: LocalText): string {
  return `<p class="tr">${esc(t.tr)}</p><p class="en">${esc(t.en)}</p>`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* -- navigation ----------------------------------------------------------------------------- */

function nav(): void {
  const links = LEVELS.map((l) => `<a href="?level=${l.id}" class="${!dailyDate && l.id === level.id ? 'on' : ''}">${l.index}. ${esc(l.river.tr)}</a>`);
  links.push('<hr>');
  links.push(`<a href="?level=epilogue" class="${level.id === 'epilogue' ? 'on' : ''}">13. Elif, 2026</a>`);
  links.push(`<a href="?level=millennium" class="${level.id === 'millennium' ? 'on' : ''}">Bin Yıl</a>`);
  links.push(`<a href="?daily=${today()}" class="${dailyDate ? 'on' : ''}">Günün Nehri</a>`);
  el('rivers').innerHTML = links.join('');
}

/* -- cross-section -------------------------------------------------------------------------- */

function section(design: BridgeDesign): void {
  const svg = el('section') as unknown as SVGSVGElement;
  const g = sim.geometry(level, design);
  const site = level.site;
  const length = site.right - site.left;
  // Frame the bridge and a little more than half its length of bank on each side.
  const x0 = site.left - Math.max(6, 0.6 * length);
  const x1 = site.right + Math.max(6, 0.6 * length);
  const ground = site.ground.filter((p, i, all) => {
    const next = all[i + 1];
    const prev = all[i - 1];
    return (p.x >= x0 && p.x <= x1) || (next !== undefined && next.x > x0 && p.x < x0) || (prev !== undefined && prev.x < x1 && p.x > x1);
  });
  const greatest = sim.greatestFlood(level);
  const two = sim.floodStage(level, 2);
  let yLow = Infinity;
  let yHigh = -Infinity;
  for (const p of ground) yLow = Math.min(yLow, p.y);
  for (const p of g.piers) yLow = Math.min(yLow, p.base);
  for (const p of g.deck) yHigh = Math.max(yHigh, p.y + g.parapetHeight);
  yHigh = Math.max(yHigh, greatest.stage) + 1;
  yLow -= 1;
  const w = x1 - x0;
  const h = yHigh - yLow;
  // Equal scale in x and y would make a long bridge a hairline; exaggerate height up to 4x.
  const box = svg.getBoundingClientRect();
  const aspect = box.width / Math.max(1, box.height);
  const exaggeration = Math.min(4, Math.max(1, w / aspect / h));
  const H = h * exaggeration;
  const X = (x: number): number => x - x0;
  const Y = (y: number): number => (yHigh - y) * exaggeration;
  const pts = (ps: readonly Vec2[]): string => ps.map((p) => `${X(p.x).toFixed(3)},${Y(p.y).toFixed(3)}`).join(' ');
  const stroke = (k: number): number => (w / box.width) * k;

  const parts: string[] = [];
  parts.push(`<rect x="0" y="${Y(0)}" width="${w}" height="${H - Y(0)}" fill="var(--water)" opacity="0.55"/>`);
  const groundPoly = [...ground, { x: x1 + 50, y: yLow - 50 }, { x: x0 - 50, y: yLow - 50 }];
  parts.push(`<polygon points="${pts(groundPoly)}" fill="var(--ground)" stroke="var(--stone)" stroke-width="${stroke(1)}"/>`);
  for (const p of g.piers) {
    const outline = [
      { x: p.x - p.width / 2, y: p.base },
      { x: p.x + p.width / 2, y: p.base },
      { x: p.x + p.width / 2, y: p.top },
      { x: p.x - p.width / 2, y: p.top },
    ];
    parts.push(`<polygon points="${pts(outline)}" fill="#9a8f7c" stroke="var(--stone)" stroke-width="${stroke(0.8)}"/>`);
  }
  for (const span of g.spans) {
    for (const v of span.voussoirs) parts.push(`<polygon points="${pts(v.outline)}" fill="#b3a68f" stroke="var(--stone)" stroke-width="${stroke(0.5)}"/>`);
  }
  parts.push(`<polyline points="${pts(g.deck)}" fill="none" stroke="var(--ink)" stroke-width="${stroke(1.4)}"/>`);
  const line = (y: number, color: string, dash: string, label: string): void => {
    parts.push(`<line x1="0" x2="${w}" y1="${Y(y)}" y2="${Y(y)}" stroke="${color}" stroke-width="${stroke(1)}" stroke-dasharray="${dash}"/>`);
    parts.push(`<text x="${stroke(6)}" y="${Y(y) - stroke(4)}" font-size="${stroke(11)}" fill="${color}">${esc(label)}</text>`);
  };
  line(two, '#4d6f78', `${stroke(4)} ${stroke(4)}`, `2 yıl ${two.toFixed(1)} m`);
  line(greatest.stage, 'var(--flood)', `${stroke(6)} ${stroke(3)}`, `${greatest.year} ${greatest.stage.toFixed(1)} m`);
  // Keep the drawing's own proportions (text stays round); spare height goes above the deck.
  const VH = Math.max(H, w / aspect);
  svg.setAttribute('viewBox', `0 ${H - VH} ${w} ${VH}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  svg.innerHTML = parts.join('');
}

/* -- tables --------------------------------------------------------------------------------- */

const SEASON_TR = { winter: 'kış', spring: 'bahar', summer: 'yaz', autumn: 'güz' } as const;

function hazardRow(h: HazardDef): string {
  const size = h.kind === 'flood' ? `${h.stage.toFixed(2)} m` : h.kind === 'quake' ? `${h.pga.toFixed(2)} g` : `${h.axle} kN`;
  const season = seasonOf(h);
  return `<tr><td class="num">${h.year}</td><td>${h.kind}</td><td class="num">${size}</td><td>${season ? SEASON_TR[season] : ''}</td><td>${esc(h.name?.tr ?? '')}</td><td class="en">${esc(h.name?.en ?? '')}</td></tr>`;
}

function facts(design: BridgeDesign): void {
  const insight = sim.insight(level, design);
  const issues = sim.validate(level, design);
  const outcome = trial(sim, level, design, 'none');
  const collapse = outcome.summary.collapse;
  const eras = level.traffic
    .map((e) => `<tr><td class="num">${e.from}–${e.to}</td><td class="num">${e.axle} kN</td><td>${e.actors.join(', ')}</td></tr>`)
    .join('');
  const fallen = collapse
    ? `<p class="fate">${esc(content.epitaph(collapse).tr)}<br>${esc(content.epitaph(collapse).en)}</p><div class="cols">${pair(content.explain(collapse))}</div>`
    : '<p class="fate">2026’da ayakta. Standing in 2026.</p>';
  const soils = level.site.soils.map((z) => `${z.soil} ${z.from}–${z.to} m`).join(', ') || 'rock';
  el('facts').innerHTML = `
    <p class="sub">zemin / soil: ${soils} · par ${level.parStones}</p>
    <h2>Başlangıç köprüsü / starter</h2>
    <p>${design.spans.length} kemer, ${design.piers.length} ayak · güvenlik ${insight.safety.toFixed(2)} · ${insight.stones.total} taş (par ${level.parStones}) · ${fate(outcome)}${issues.length ? ` · issues: ${issues.map((i) => i.code).join(', ')}` : ''}</p>
    ${fallen}
    <h2>Afetler / hazards</h2>
    <table>${level.hazards.map(hazardRow).join('')}</table>
    <h2>Yol / traffic</h2>
    <table>${eras}</table>`;
}

function texts(): void {
  if (!story) {
    el('story').innerHTML = '<p>No story.</p>';
    return;
  }
  const hints = Object.entries(story.hints)
    .map(([cause, t]) => (t ? `<p class="tr"><b>${cause}</b> ${esc(t.tr)}</p><p class="en">${esc(t.en)}</p>` : ''))
    .join('');
  el('story').innerHTML = `
    <h2>${esc(story.intro.heading.tr)} / ${esc(story.intro.heading.en)}</h2>
    <div class="cols">${story.intro.lines.map(pair).join('')}</div>
    <h2>Geçti / passed</h2><div class="cols">${story.passed.map(pair).join('')}</div>
    <h2>Yıkıldı / failed</h2><div class="cols">${story.failed.map(pair).join('')}</div>
    <h2>Gerçek köprü / the real bridge</h2><div class="cols">${pair(story.realBridge)}</div>
    <h2>Öğütler / hints</h2><div class="cols">${hints}</div>`;
}

function head(): void {
  el('head').innerHTML = `<h1>${esc(level.river.tr)} <span class="sub">${esc(level.river.en)}</span></h1>
    <p class="sub">${esc(level.place.tr)} · ${level.year} · ${esc(level.builder.tr)} · ${level.stone} · ${level.site.right - level.site.left} m · ölçek dikeyde abartılı</p>`;
}

const starter = sim.normalize(level, level.starter);
nav();
head();
section(starter);
facts(starter);
texts();
window.addEventListener('resize', () => section(starter));
