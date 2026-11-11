/**
 * The epilogue's engineering (DESIGN 4, last paragraph), kept apart from its staging so it can be
 * tested: the player's bridge lived through the centuries as a careful family would have kept it,
 * then left alone for the last stretch; the ways Elif could mend it, smallest first, each judged by
 * the simulation; and the drawing of the worn ring for the drawing board.
 */
import type { ChronicleRun, DesignModel, SimApi, SpanModel } from '../../core/contracts';
import type { BridgeDesign, BridgeGeometry, BridgeState, LevelDef, Vec2 } from '../../core/types';

/** Safety the repair must bring the bridge back above. */
export const TARGET = 1.5;
/** The family mends when the gauge drops under this, and no more often than every GAP years. */
const CARE = 1.6;
const GAP = 15;
/** Years left alone before 2026, tried from the longest neglect to none. */
const NEGLECT = [110, 80, 60, 45, 30, 20, 12, 6, 0];
/** Extra ring thickness tried, metres, and the margin the thickened ring aims for over TARGET. */
const THICKEN_STEP = 0.05;
const THICKEN_AIM = 0.08;
/** A worn joint never loses more than this share of its depth in the drawing. */
const WORN_CAP = 0.85;

export type RestoreKind = 'clean' | 'point' | 'relay' | 'thicken';

export interface RestoreChoice {
  readonly kind: RestoreKind;
  readonly stones: number;
  /** The gauge after this repair alone, from the original worn state. */
  readonly safety: number;
  /** The design after the repair (a new ring), or null when the stones stay as they are. */
  readonly design: BridgeDesign | null;
  /** Extra thickness of a thickened ring, metres. */
  readonly added: number;
}

/**
 * Live the bridge's centuries: mended when it trembles, then left alone for the last stretch. The
 * longest neglect it survives wins, so Elif finds it worn but standing. Stops just short of the
 * end year, where the chronicle still accepts a repair. Null if it cannot stand even when kept.
 */
export function ageBridge(sim: SimApi, level: LevelDef, design: BridgeDesign): ChronicleRun | null {
  const end = level.endYear - 0.02;
  for (const quiet of NEGLECT) {
    const run = sim.run(level, design);
    if (live(run, level, level.endYear - quiet, end)) return run;
  }
  return null;
}

function live(run: ChronicleRun, level: LevelDef, lastCare: number, end: number): boolean {
  let mended = -Infinity;
  for (let y = Math.floor(level.year) + 1; y < end; y++) {
    run.advance(y);
    if (run.state.collapsed) return false;
    if (y < lastCare && y - mended >= GAP && run.state.safety < CARE && run.quote().possible && run.repair()) mended = y;
  }
  run.advance(end);
  return !run.state.collapsed;
}

function withThickness(design: BridgeDesign, thickness: number): BridgeDesign {
  return { ...design, spans: design.spans.map((s) => ({ ...s, thickness })) };
}

/**
 * The ways to mend, sorted by stones: leave the stone and clear the growth; point the joints (the
 * chronicle's own repair, on a twin of the worn run); re-lay the ring as built; a thicker ring,
 * just thick enough to clear the target. Options that would not help more than a cheaper one are
 * left out.
 */
export function restoreChoices(sim: SimApi, level: LevelDef, design: BridgeDesign, worn: ChronicleRun, twin: ChronicleRun | null): RestoreChoice[] {
  const out: RestoreChoice[] = [{ kind: 'clean', stones: 0, safety: worn.state.safety, design: null, added: 0 }];
  let best = worn.state.safety;
  if (twin) {
    const quote = twin.quote();
    if (quote.possible && twin.repair()) {
      out.push({ kind: 'point', stones: quote.stones, safety: twin.state.safety, design: null, added: 0 });
      best = Math.max(best, twin.state.safety);
    }
  }
  const fresh = sim.insight(level, design);
  const ring = (d: BridgeDesign): number => sim.geometry(level, d).stones.ring;
  if (fresh.safety > best + 0.02) {
    out.push({ kind: 'relay', stones: ring(design), safety: fresh.safety, design, added: 0 });
    best = fresh.safety;
  }
  const base = design.spans.reduce((t, s) => Math.max(t, s.thickness), 0);
  const top = level.limits.thickness[1];
  let thick: RestoreChoice | null = null;
  for (let t = base + THICKEN_STEP; t <= top + 1e-9; t += THICKEN_STEP) {
    const next = sim.normalize(level, withThickness(design, t));
    const safety = sim.insight(level, next).safety;
    thick = { kind: 'thicken', stones: ring(next), safety, design: next, added: t - base };
    if (safety >= TARGET + THICKEN_AIM) break;
  }
  if (thick && thick.safety > best + 0.02) out.push(thick);
  return out.sort((a, b) => a.stones - b.stones);
}

/** The smallest repair that clears the target; failing all, the strongest one. */
export function smallestEnough(choices: readonly RestoreChoice[]): number {
  const i = choices.findIndex((c) => c.safety >= TARGET);
  if (i >= 0) return i;
  let best = 0;
  choices.forEach((c, k) => {
    if (c.safety > (choices[best]?.safety ?? 0)) best = k;
  });
  return best;
}

/** The intrados as weathering has left it: each joint shorter by the lost depth, from below. */
function wornIntrados(geometry: BridgeGeometry, span: number, loss: number): Vec2[] {
  const sp = geometry.spans[span];
  if (!sp) return [];
  if (loss <= 1e-4) return [...sp.intrados];
  return sp.joints.map((j) => {
    const dx = j.b.x - j.a.x;
    const dy = j.b.y - j.a.y;
    const d = Math.hypot(dx, dy);
    const cut = d > 0 ? Math.min(loss, WORN_CAP * d) / d : 0;
    return { x: j.a.x + dx * cut, y: j.a.y + dy * cut };
  });
}

/**
 * The drawing board in the epilogue: the ring as it is now (worn joints drawn short), the line of
 * thrust, the hinges the ground and the years have opened (or where the line comes closest), and
 * the gauge at the bridge's present safety. No handles: Elif does not redesign, she mends.
 */
export function wornModel(sim: SimApi, level: LevelDef, design: BridgeDesign, state: BridgeState, safety: number): DesignModel {
  const geometry = sim.geometry(level, design);
  const insight = sim.insight(level, design);
  const spans: SpanModel[] = geometry.spans.map((sp, i) => {
    const ins = insight.spans[i];
    const s = state.spans[i];
    const open = s && s.hinges.length > 0 ? s.hinges : (ins?.hinges ?? []);
    return {
      intrados: wornIntrados(geometry, i, s?.jointLoss ?? 0),
      extrados: sp.extrados,
      thrustLine: ins?.thrustLine ?? [],
      hinges: open,
      gsf: s?.gsf ?? ins?.gsf ?? 0,
      joints: sp.joints.map((j) => [j.a, j.b] as const),
    };
  });
  return {
    spans,
    handles: [],
    deck: geometry.deck,
    piers: geometry.piers.map((p) => ({ x: p.x, width: p.width, base: p.base, top: p.top })),
    safety,
    stones: 0,
    parStones: 0,
    issues: [],
    tools: [],
    toggles: { cutwaters: design.cutwaters, reliefs: design.reliefs, clamps: design.clamps, piles: design.piles, linked: design.linked },
    floodMarks: [],
    capacities: null,
    canUndo: false,
    canRedo: false,
    canBuild: true,
    piersLeft: 0,
  };
}

/** A state for the stones after a repair: joints refilled (all, or to the share left), growth gone. */
export function mendedState(state: BridgeState, lossLeft: number, fresh: boolean): BridgeState {
  return {
    ...state,
    spans: state.spans.map((s) => ({ ...s, jointLoss: s.jointLoss * lossLeft, hinges: fresh ? [] : s.hinges })),
    moss: fresh ? state.moss * 0.25 : state.moss * 0.6,
    patina: fresh ? state.patina * 0.4 : state.patina,
    growth: 0,
    repairs: state.repairs + 1,
  };
}
