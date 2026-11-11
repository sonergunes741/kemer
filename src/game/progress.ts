/**
 * Progress rules, pure: what a finished attempt writes into the ledger, which rivers are open,
 * where "continue" goes, the rank and the ledger rows. Unit-tested in progress.test.ts.
 */
import type { LedgerEntry } from '../core/contracts';
import type { BridgeDesign, BridgeGeometry, LevelDef, LevelRecord, RunSummary, SaveData } from '../core/types';

export type SealName = 'standing' | 'lean' | 'unrepaired' | 'masterwork';

export function emptyRecord(): LevelRecord {
  return {
    bestYears: 0,
    bestStones: null,
    seals: { standing: false, lean: false, unrepaired: false },
    masterwork: false,
    passed: false,
    attempts: 0,
    design: null,
    markStone: null,
    witnessed: [],
  };
}

/** Rivers open in order: the first always, each next one once the one before is passed. */
export function isUnlocked(levels: readonly LevelDef[], save: SaveData, index: number): boolean {
  if (index <= 0) return true;
  const prev = levels[index - 1];
  return !!prev && !!save.levels[prev.id]?.passed;
}

export function nextLevel(levels: readonly LevelDef[], level: LevelDef): LevelDef | null {
  const i = levels.findIndex((l) => l.id === level.id);
  return i >= 0 && i + 1 < levels.length ? levels[i + 1]! : null;
}

/** Where "continue" takes the player: the first open river not yet passed, else the last open one. */
export function continueLevel(levels: readonly LevelDef[], save: SaveData): LevelDef {
  let last = levels[0]!;
  for (let i = 0; i < levels.length; i++) {
    if (!isUnlocked(levels, save, i)) break;
    last = levels[i]!;
    if (!save.levels[last.id]?.passed) return last;
  }
  return last;
}

export function isFirstRun(save: SaveData): boolean {
  return save.mark === null && Object.values(save.levels).every((r) => !r || r.attempts === 0);
}

/** Records kept beside the family's rivers: they never count towards the rank. */
const BESIDE: ReadonlySet<string> = new Set(['daily', 'millennium', 'epilogue']);

export function totalSeals(save: SaveData): number {
  let n = 0;
  for (const [id, r] of Object.entries(save.levels)) {
    if (!r || BESIDE.has(id)) continue;
    n += (r.seals.standing ? 1 : 0) + (r.seals.lean ? 1 : 0) + (r.seals.unrepaired ? 1 : 0);
  }
  return n;
}

/** Hazards of this river the family has now seen: named ones met and the greatest flood, if reached. */
export function witnessedIn(level: LevelDef, lastYear: number, greatest: { year: number } | null): number[] {
  const out: number[] = [];
  for (const h of level.hazards) if (h.year > level.year && h.year <= lastYear) out.push(h.year);
  if (greatest && greatest.year > level.year && greatest.year <= lastYear) out.push(greatest.year);
  return out;
}

/** Is `a` a better bridge to keep in the ledger than `b`? Standing first, then fewer stones, then more years. */
function better(a: RunSummary, best: LevelRecord): boolean {
  if (!best.design) return true;
  if (a.seals.standing !== best.seals.standing) return a.seals.standing;
  if (a.seals.standing) return best.bestStones === null || a.stones <= best.bestStones;
  return a.years >= best.bestYears;
}

export interface AttemptOutcome {
  readonly record: LevelRecord;
  readonly newSeals: SealName[];
  /** True when this attempt passed the river for the first time. */
  readonly newlyPassed: boolean;
}

/** Write one finished attempt (stood to 2026, fell in time, or fell at the strike) into the record. */
export function recordAttempt(
  previous: LevelRecord | null | undefined,
  summary: RunSummary,
  design: BridgeDesign,
  markStone: { span: number; stone: number } | null,
  witnessed: readonly number[],
): AttemptOutcome {
  const before = previous ?? emptyRecord();
  const keep = better(summary, before);
  const seals = {
    standing: before.seals.standing || summary.seals.standing,
    lean: before.seals.lean || summary.seals.lean,
    unrepaired: before.seals.unrepaired || summary.seals.unrepaired,
  };
  const record: LevelRecord = {
    bestYears: Math.max(before.bestYears, summary.years),
    bestStones: summary.seals.standing ? Math.min(before.bestStones ?? Infinity, summary.stones) : before.bestStones,
    seals,
    masterwork: before.masterwork || summary.masterwork,
    passed: before.passed || summary.passed,
    attempts: before.attempts + 1,
    design: keep ? design : before.design,
    markStone: keep ? markStone : before.markStone,
    witnessed: [...new Set([...before.witnessed, ...witnessed])].sort((a, b) => a - b),
  };
  const newSeals: SealName[] = [];
  for (const k of ['standing', 'lean', 'unrepaired'] as const) if (summary.seals[k] && !before.seals[k]) newSeals.push(k);
  if (summary.masterwork && !before.masterwork) newSeals.push('masterwork');
  return { record, newSeals, newlyPassed: summary.passed && !before.passed };
}

export function epilogueState(save: SaveData): 'locked' | 'open' | 'done' {
  if (save.epilogueDone) return 'done';
  return Object.entries(save.levels).some(([id, r]) => !BESIDE.has(id) && r?.seals.standing && r.design) ? 'open' : 'locked';
}

/** The bridge Elif comes to: the player's earliest one still standing in 2026 (Koramaz if it can be). */
export function epilogueSource(levels: readonly LevelDef[], save: SaveData): { level: LevelDef; record: LevelRecord & { design: BridgeDesign } } | null {
  for (const level of levels) {
    const record = save.levels[level.id];
    if (record?.seals.standing && record.design) return { level, record: { ...record, design: record.design } };
  }
  return null;
}

/** The river of the day and the thousand years open once the story's first river is passed. */
export function modesOpen(levels: readonly LevelDef[], save: SaveData): boolean {
  const first = levels[0];
  return !!first && !!save.levels[first.id]?.passed;
}

/** One ledger row per river, with the best bridge drawn from its saved design. */
export function ledgerEntries(levels: readonly LevelDef[], save: SaveData, sketch: (level: LevelDef, design: BridgeDesign) => BridgeGeometry | null): LedgerEntry[] {
  return levels.map((level, i) => {
    const record = save.levels[level.id] ?? null;
    const unlocked = isUnlocked(levels, save, i);
    return { level, record, unlocked, sketch: record?.design ? sketch(level, record.design) : null };
  });
}
