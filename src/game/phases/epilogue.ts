/**
 * The epilogue (DESIGN 4): 2026, Elif Taşçı at the player's earliest bridge still standing, as the
 * centuries have left it. She wipes the moss off the upstream face until the family mark shows,
 * reads the drawing (the worn joints, the hinges, the line of thrust) and makes the smallest repair
 * that brings the gauge back above 1.5. Children cycle across; the ledger closes.
 */
import type { ChronicleRun, RestoreCard, UiIntent } from '../../core/contracts';
import { formatNumber } from '../../core/format';
import { lt } from '../../core/i18n';
import type { StoneRef } from '../../core/contracts';
import type { BridgeDesign, BridgeGeometry, BridgeState, FamilyMark, LevelDef } from '../../core/types';
import { mainSpan } from '../design/handles';
import { ageBridge, mendedState, restoreChoices, smallestEnough, TARGET, wornModel, type RestoreChoice } from '../epilogue/restore';
import { Rag } from '../epilogue/rag';
import { epilogueSource } from '../progress';
import { say, smallLength } from '../text';
import { PhaseBase } from './base';

type Stage = 'loading' | 'arrive' | 'wipe' | 'read' | 'children' | 'closing';

/** Seconds of wiping before the coach's hand moves to where the mark is. */
const HINT_AFTER = 22;
const LINE_GAP = 1.1;

export class EpiloguePhase extends PhaseBase {
  readonly id = 'epilogue' as const;
  private stage: Stage = 'loading';
  private clock = 0;
  private skipping = false;
  private level: LevelDef | null = null;
  private shown: LevelDef | null = null;
  private source: LevelDef | null = null;
  private design: BridgeDesign | null = null;
  private geometry: BridgeGeometry | null = null;
  private mark: { stone: StoneRef; mark: FamilyMark } | null = null;
  private rag: Rag | null = null;
  private state: BridgeState | null = null;
  private safety = 0;
  private choices: RestoreChoice[] = [];
  private least = 0;
  private selected = -1;
  private readonly spent = new Set<number>();
  private stones = 0;
  private mending = false;
  private mended = false;
  private wipeStart = 0;
  private hinted = false;

  protected override async run(): Promise<void> {
    const { deps, session, scene, cam } = this.g;
    const { ui, sim, audio, bridge, content } = deps;
    const src = epilogueSource(content.levels, session.save);
    if (!src) return this.g.go({ to: 'title' });
    const level = content.epilogue(src.level, src.record.design);
    session.adopt(level);
    session.level = level;
    session.story = content.story('epilogue');
    session.mode = 'epilogue';
    session.clearAttempt();
    audio.setRegion(src.level.index);
    this.level = level;
    // The screens' corner says 2026: Elif's year, not the builder's. One object, so the interface
    // sees the same screen when only the card changes.
    this.shown = { ...level, year: level.endYear };
    this.source = src.level;
    deps.curtain(1, 0.5);
    ui.setScreen({ id: 'none' });
    ui.setDesign(null);
    ui.setBuild(null);
    ui.setTime(null);
    ui.caption(null);
    ui.setVisible(true);
    audio.setMood('survey', 4);
    scene.setLevel(level);
    scene.time = { year: level.endYear + 0.3, season: 0.3, hour: 9.6, lapse: 0 };
    scene.birds = 1;
    await this.wait(0.5);
    await this.keep(this.g.ensureWorld(level));

    // The centuries, lived as a careful family would have kept the bridge, then left alone.
    const design = level.starter;
    const geometry = sim.geometry(level, design);
    const worn = ageBridge(sim, level, design) ?? this.untouched(level, design);
    const twin = ageBridge(sim, level, design);
    this.design = design;
    this.geometry = geometry;
    this.choices = restoreChoices(sim, level, design, worn, twin);
    this.least = smallestEnough(this.choices);
    this.safety = worn.state.safety;
    const mark = session.save.mark;
    const stone = src.record.markStone ?? this.suggested(geometry);
    this.mark = mark && stone ? { stone, mark } : null;
    session.markStone = stone;
    await this.keep(bridge.showBuilt(level, geometry, this.mark));
    // Left alone for decades: the face is green and the growth has taken the joints.
    this.show({ ...worn.state, moss: Math.max(0.9, worn.state.moss), growth: Math.max(0.7, worn.state.growth) });
    bridge.overgrow(1);
    const probe = stone ? (geometry.spans[stone.span]?.voussoirs[stone.stone]?.centroid ?? null) : null;
    this.rag = new Rag(deps, this.mark ? probe : null, geometry.width / 2);

    this.stage = 'arrive';
    cam.set(cam.arrival(geometry));
    await this.wait(0.6);
    ui.setScreen({ id: 'survey', level: this.shown });
    deps.curtain(0, 2.4);
    void cam.to(cam.working(geometry), 8, 'in-out');
    await this.hold(3.8);
    const story = session.story;
    if (story && !this.skipping) {
      const lines = story.intro.lines.map((l) => lt(l));
      ui.setScreen({ id: 'vignette', heading: lt(story.intro.heading), lines, year: level.endYear });
      await this.hold(0.6 + lines.length * LINE_GAP + 3.4);
    }
    this.beginWipe();
    await this.until(() => !!this.rag?.found || this.stage !== 'wipe');
    await this.found();
    this.beginRead();
    await this.until(() => this.mended);
    await this.children();
    await this.closing();
  }

  /** A bridge the careful centuries could not keep: Elif finds it as it was built. */
  private untouched(level: LevelDef, design: BridgeDesign): ChronicleRun {
    return this.g.deps.sim.run(level, design);
  }

  /** The stone a mason would have marked when the ledger did not say: down from the main crown. */
  private suggested(g: BridgeGeometry): StoneRef | null {
    const span = mainSpan(g);
    const n = g.spans[span]?.voussoirs.length ?? 0;
    return n > 0 ? { span, stone: Math.max(0, Math.floor(n / 2) - 2) } : null;
  }

  private show(state: BridgeState): void {
    const { bridge, world } = this.g.deps;
    this.state = state;
    bridge.apply(state);
    if (this.geometry) world.setBridge(this.geometry, state.piers.map((p) => p.scour));
  }

  /** A game-time pause that a skip cuts short. */
  private hold(seconds: number): Promise<void> {
    const until = this.clock + seconds;
    return this.until(() => this.skipping || this.clock >= until);
  }

  /* -- the moss --------------------------------------------------------------------------- */

  private beginWipe(): void {
    const { deps, cam, coach } = this.g;
    const level = this.shown;
    const g = this.geometry;
    if (!level || !g) return;
    this.stage = 'wipe';
    this.skipping = false;
    this.wipeStart = this.clock;
    deps.curtain(0, 0.4);
    deps.audio.setMood('design', 3);
    deps.ui.setScreen({ id: 'build', level, step: 'mark' });
    deps.ui.setBuild({ laid: 0, total: 0, action: say('wipeLine'), hold: false });
    const sp = g.spans[mainSpan(g)];
    const at = this.rag?.probe ?? sp?.crown ?? { x: 0, y: 2 };
    const span = sp?.span ?? 8;
    cam.recentre();
    void cam.to({ target: { x: at.x, y: at.y + 0.3, z: g.width / 2 }, distance: Math.min(14, Math.max(5.5, span * 0.75)), yaw: 0.12, pitch: 0.05, fov: 32 }, 2.2, 'in-out');
    // The hand first shows the gesture on the crown, not on the mark: finding it is hers to do.
    const crown = sp ? { x: sp.crown.x + span * 0.12, y: sp.crown.y - 0.25 } : at;
    coach.offer('ep.wipe', 'wipe', { kind: 'elevation', at: crown }, 'drag-side');
  }

  private async found(): Promise<void> {
    const { deps, coach } = this.g;
    const source = this.source;
    coach.clear();
    coach.done('ep.wipe');
    // The later hint is drawn straight onto the interface, not through the coach.
    deps.ui.coach(null);
    deps.ui.setBuild(null);
    deps.ui.setScreen({ id: 'none' });
    if (!source) return;
    this.g.sfx('safe', { gain: 0.55, pitch: 0.9 });
    deps.ui.caption(`${source.year} · ${lt(source.builder)}`, say('found'));
    this.g.cam.push(0.08, 1.2);
    await this.wait(3.4);
    deps.ui.caption(null);
    await this.wait(0.5);
  }

  /* -- the repair -------------------------------------------------------------------------- */

  private card(): RestoreCard {
    const units = this.g.settings.current.units;
    const options = this.choices.map((c, i) => {
      const label =
        c.kind === 'clean' ? say('repairClean') : c.kind === 'point' ? say('repairPoint') : c.kind === 'relay' ? say('repairRelay') : say('repairThicken', { cm: smallLength(c.added, units) });
      return { label, detail: say('stonesN', { n: formatNumber(c.stones, 0) }), spent: this.spent.has(i) };
    });
    const pick = this.choices[this.selected];
    return { options, selected: this.selected, action: pick ? say('mendN', { n: formatNumber(pick.stones, 0) }) : say('mend') };
  }

  private drawBoard(): void {
    const { deps } = this.g;
    const level = this.level;
    const design = this.design;
    if (!level || !this.shown || !design || !this.state) return;
    deps.ui.setScreen({ id: 'design', level: this.shown, restore: this.card() });
    deps.ui.setDesign(wornModel(deps.sim, level, design, this.state, this.safety));
  }

  private beginRead(): void {
    const g = this.geometry;
    if (!g) return;
    this.stage = 'read';
    this.drawBoard();
    void this.g.cam.to(this.g.cam.design(g), 1.8, 'in-out');
    this.g.coach.offer('ep.read', 'read', { kind: 'none' });
  }

  private async mend(): Promise<void> {
    const c = this.choices[this.selected];
    const level = this.level;
    const state = this.state;
    if (!c || !level || !state || this.mending || this.spent.has(this.selected)) return;
    const { deps } = this.g;
    this.mending = true;
    this.spent.add(this.selected);
    this.selected = -1;
    this.stones += c.stones;
    this.g.coach.clear();
    if (c.design) {
      // A new ring: the stones are cut and set again; the marked one goes back where it was.
      this.design = c.design;
      const before = this.geometry;
      this.geometry = deps.sim.geometry(level, c.design);
      if (this.mark && before) this.mark = { ...this.mark, stone: this.remap(before, this.geometry, this.mark.stone) };
      await this.keep(deps.bridge.showBuilt(level, this.geometry, this.mark));
      this.show(mendedState(state, 0, true));
    } else {
      this.show(mendedState(state, c.kind === 'point' ? 0.1 : 1, false));
    }
    // The masons clear the face as they work; only cleaning clears it all.
    deps.bridge.overgrow(c.kind === 'clean' ? 0.12 : 0.35);
    this.safety = Math.max(this.safety, c.safety);
    if (c.stones > 0) this.thud(c.stones);
    this.drawBoard();
    await this.wait(0.9);
    this.mending = false;
    if (this.safety >= TARGET) {
      this.g.sfx('safe');
      deps.ui.toast(say('mended'), 'good');
      this.g.coach.done('ep.read');
      await this.wait(2.2);
      this.mended = true;
    } else if (this.spent.size >= this.choices.length) {
      this.mended = true;
    } else {
      this.g.sfx('unsafe', { gain: 0.5 });
      deps.ui.toast(say('notEnough'), 'warn');
      this.drawBoard();
    }
  }

  /** The masons' thuds and a breath of mortar dust at the crown, as a repair in the centuries. */
  private thud(stones: number): void {
    const { bus, world } = this.g.deps;
    const g = this.geometry;
    const sp = g?.spans[mainSpan(g)];
    if (!g || !sp) return;
    const at = { x: sp.crown.x, y: sp.crown.y - 0.4, z: g.width / 2 };
    bus.emit('stone:land', { at, mass: 0.4, part: 'voussoir', count: Math.min(12, Math.max(3, Math.round(stones / 20))) });
    world.fx.dust('puff', at, 1.2);
  }

  /** The stone of the new ring nearest the one that carried the mark. */
  private remap(before: BridgeGeometry, after: BridgeGeometry, stone: StoneRef): StoneRef {
    const c = before.spans[stone.span]?.voussoirs[stone.stone]?.centroid;
    const vs = after.spans[stone.span]?.voussoirs ?? [];
    if (!c || vs.length === 0) return stone;
    let best = 0;
    vs.forEach((v, i) => {
      const b = vs[best]!.centroid;
      if (Math.hypot(v.centroid.x - c.x, v.centroid.y - c.y) < Math.hypot(b.x - c.x, b.y - c.y)) best = i;
    });
    return { span: stone.span, stone: best };
  }

  /* -- the afternoon and the ledger --------------------------------------------------------- */

  private async children(): Promise<void> {
    const { deps, scene, cam } = this.g;
    const g = this.geometry;
    const level = this.level;
    if (!g || !level) return;
    this.stage = 'children';
    this.skipping = false;
    deps.ui.setScreen({ id: 'none' });
    deps.ui.setDesign(null);
    deps.curtain(1, 0.9);
    await this.wait(1);
    scene.time = { year: level.endYear + 0.35, season: 0.35, hour: 16.4, lapse: 0 };
    deps.bridge.setTraffic(null, 0);
    cam.set(cam.event(g));
    deps.curtain(0, 1.8);
    deps.audio.setMood('legacy', 4);
    deps.ui.caption(`${level.endYear} · ${say('ending')}`);
    if (this.g.settings.current.ambientLife) void deps.bridge.cross('cyclist', 3, 11);
    void cam.to(cam.title(g), 12, 'in-out');
    await this.hold(9);
    deps.ui.caption(null);
  }

  private async closing(): Promise<void> {
    const { deps, session } = this.g;
    this.stage = 'closing';
    this.skipping = false;
    session.save.epilogueDone = true;
    this.g.persist();
    const story = session.story;
    const kept = this.safety >= TARGET;
    const least = this.choices[this.least]?.stones ?? this.stones;
    const n = formatNumber(this.stones, 0);
    const reckoning = this.stones <= least ? say('leastLine', { n }) : say('moreLine', { n, extra: formatNumber(this.stones - least, 0) });
    const pointed = this.choices.some((c, i) => this.spent.has(i) && c.kind === 'point');
    const told = kept ? (pointed ? story?.passed : []) : story?.failed;
    const lines = [...(told ?? []).map((l) => lt(l)), reckoning, ...(story?.realBridge ? [lt(story.realBridge)] : [])];
    deps.ui.setScreen({ id: 'vignette', heading: say('ledgerClosing'), lines, year: this.level?.endYear ?? 2026 });
    await this.hold(0.8 + lines.length * LINE_GAP + 6);
    deps.curtain(1, 1.4);
    await this.wait(1.5);
    this.g.go({ to: 'title' });
  }

  /* -- the player --------------------------------------------------------------------------- */

  protected override tick(dt: number): void {
    this.clock += dt;
    const rag = this.rag;
    if (this.stage !== 'wipe' || !rag) return;
    rag.update(dt);
    // Long wiping and still nothing: the hand shows where the mark is.
    if (!this.hinted && rag.probe && (this.clock - this.wipeStart > HINT_AFTER || rag.wiped > 40)) {
      this.hinted = true;
      this.g.coach.clear();
      this.g.deps.ui.coach({ text: say('wipe'), target: { kind: 'elevation', at: rag.probe }, gesture: 'drag-side' });
    }
  }

  override intent(intent: UiIntent): boolean {
    switch (intent.type) {
      case 'skip':
        if (this.stage === 'arrive' || this.stage === 'children' || this.stage === 'closing') this.skipping = true;
        return true;
      case 'canvas':
        if (this.stage === 'wipe' && this.rag?.canvas(intent) && this.g.coach.active === 'ep.wipe') this.g.coach.clear();
        return true;
      case 'look':
        // The rag takes the pointer while wiping; the drawing board is a still elevation.
        return this.stage === 'wipe' || this.stage === 'read';
      case 'primary': {
        if (intent.phase !== 'down') return true;
        const g = this.geometry;
        const sp = g?.spans[g ? mainSpan(g) : 0];
        if (this.stage === 'wipe' && sp) this.rag?.sweep({ x: sp.crown.x, y: sp.crown.y - 0.3 });
        else if (this.stage === 'read') this.script(() => this.mend());
        return true;
      }
      case 'choose':
        if (this.stage === 'read' && !this.mending && !this.spent.has(intent.index) && this.choices[intent.index]) {
          this.selected = intent.index;
          this.drawBoard();
        }
        return true;
      default:
        return false;
    }
  }

  override exit(): void {
    super.exit();
    const { deps } = this.g;
    deps.ui.caption(null);
    deps.ui.coach(null);
    deps.ui.setBuild(null);
    deps.ui.setDesign(null);
  }

  override describe(): Record<string, unknown> {
    const rag = this.rag;
    return {
      stage: this.stage,
      clean: rag?.clean ?? 0,
      found: !!rag?.found,
      probe: rag?.probe ?? null,
      safety: this.safety,
      selected: this.selected,
      least: this.least,
      stones: this.stones,
      choices: this.choices.map((c) => ({ kind: c.kind, stones: c.stones, safety: Math.round(c.safety * 100) / 100 })),
    };
  }
}
