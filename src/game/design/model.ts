/**
 * The DesignModel the interface draws: rings with their lines of thrust and hinges, the handles,
 * deck and piers, the gauge, stones against par, the flood marks on the banks and, once a handle
 * is let go, the capacities that matter.
 */
import type { DesignModel, SimApi, SpanModel } from '../../core/contracts';
import type { BridgeDesign, CollapseInfo, LevelDef, LevelRecord, LocalText, Vec2 } from '../../core/types';
import { TEXT } from '../text';
import type { DesignEditor } from './editor';
import { handleModels } from './handles';

export type FloodMark = { readonly stage: number; readonly label: LocalText };

/**
 * The faint lines on the banks: the flood the old people remember (the 25-year stage) and each
 * flood this family has already seen here, with its year. Built once per visit so the interface
 * keeps its drawn marks.
 */
export function floodMarks(sim: SimApi, level: LevelDef, record: LevelRecord | null | undefined): FloodMark[] {
  const marks: FloodMark[] = [{ stage: sim.floodStage(level, 25), label: TEXT.remembered }];
  const seen = new Set(record?.witnessed ?? []);
  if (seen.size === 0) return marks;
  const greatest = sim.greatestFlood(level);
  for (const year of [...seen].sort((a, b) => a - b)) {
    const named = level.hazards.find((h) => h.kind === 'flood' && h.year === year);
    const stage = named && named.kind === 'flood' ? named.stage : greatest.year === year ? greatest.stage : null;
    if (stage === null) continue;
    const label = { tr: String(year), en: String(year) };
    if (!marks.some((m) => Math.abs(m.stage - stage) < 0.05)) marks.push({ stage, label });
  }
  return marks;
}

function spanModels(editor: DesignEditor): SpanModel[] {
  const g = editor.geometry;
  return g.spans.map((sp, i) => {
    const ins = editor.insight.spans[i];
    const joints: (readonly [Vec2, Vec2])[] = sp.joints.map((j) => [j.a, j.b] as const);
    return {
      intrados: sp.intrados,
      extrados: sp.extrados,
      thrustLine: ins?.thrustLine ?? [],
      hinges: ins?.hinges ?? [],
      gsf: ins?.gsf ?? 0,
      joints,
    };
  });
}

/**
 * The drawing of a bridge as built, for the collapse screen's "Neden?": its rings, the line of
 * thrust and, where the collapse names them, the hinges it actually opened at.
 */
export function fallenModel(sim: SimApi, level: LevelDef, design: BridgeDesign, info: CollapseInfo, marks: readonly FloodMark[]): DesignModel {
  const geometry = sim.geometry(level, design);
  const insight = sim.insight(level, design);
  const spans: SpanModel[] = geometry.spans.map((sp, i) => {
    const ins = insight.spans[i];
    const fell = info.spans.find((s) => s.span === i);
    return {
      intrados: sp.intrados,
      extrados: sp.extrados,
      thrustLine: ins?.thrustLine ?? [],
      hinges: fell && fell.hinges.length > 0 ? fell.hinges : (ins?.hinges ?? []),
      gsf: ins?.gsf ?? 0,
      joints: sp.joints.map((j) => [j.a, j.b] as const),
    };
  });
  return {
    spans,
    handles: [],
    deck: geometry.deck,
    piers: geometry.piers.map((p) => ({ x: p.x, width: p.width, base: p.base, top: p.top })),
    safety: insight.safety,
    stones: insight.stones.total,
    parStones: level.parStones,
    issues: [],
    tools: [],
    toggles: { cutwaters: design.cutwaters, reliefs: design.reliefs, clamps: design.clamps, piles: design.piles, linked: design.linked },
    floodMarks: marks,
    capacities: null,
    canUndo: false,
    canRedo: false,
    canBuild: false,
    piersLeft: 0,
  };
}

export function buildDesignModel(editor: DesignEditor, marks: readonly FloodMark[]): DesignModel {
  const { level, design, geometry, insight } = editor;
  const tools = level.tools;
  const maxPiers = tools.includes('piers') ? level.limits.maxPiers : design.piers.length;
  return {
    spans: spanModels(editor),
    handles: handleModels(level, design, geometry, editor.stops),
    deck: geometry.deck,
    piers: geometry.piers.map((p) => ({ x: p.x, width: p.width, base: p.base, top: p.top })),
    safety: insight.safety,
    stones: insight.stones.total,
    parStones: level.parStones,
    issues: insight.issues,
    tools,
    toggles: { cutwaters: design.cutwaters, reliefs: design.reliefs, clamps: design.clamps, piles: design.piles, linked: design.linked },
    floodMarks: marks,
    capacities: editor.capacities,
    canUndo: editor.canUndo,
    canRedo: editor.canRedo,
    canBuild: insight.issues.length === 0,
    piersLeft: Math.max(0, maxPiers - design.piers.length),
  };
}
