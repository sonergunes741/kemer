/**
 * The Session is the one owner of the game's state: the save, the river being played, the design
 * on the board (kept between attempts), the bridge as built with its fate at the strike, the run
 * through the centuries and where the family mark was cut. Phases read and write it; nothing else
 * holds game state.
 */
import type { ChronicleRun, LevelStory, StoneRef } from '../core/contracts';
import type { BridgeDesign, BridgeGeometry, LevelDef, LevelId, LevelRecord, SaveData, StrikeResult } from '../core/types';
import type { AttemptOutcome } from './progress';
import type { Mode } from './types';

export interface Built {
  readonly design: BridgeDesign;
  readonly geometry: BridgeGeometry;
  /** Decided when the build begins and never shown: the strike only reveals it. */
  readonly strike: StrikeResult;
}

export class Session {
  level: LevelDef | null = null;
  story: LevelStory | null = null;
  mode: Mode = 'story';
  /** The date of the river of the day being played (fixed when it starts, so midnight changes nothing). */
  date: string | null = null;
  /** The mode's own line for the result, written when the attempt closes. */
  modeLine: string | null = null;
  built: Built | null = null;
  run: ChronicleRun | null = null;
  markStone: StoneRef | null = null;
  /** Years (fractional) at which the player mended this run, so a replay lives the same life. */
  repairYears: number[] = [];
  /** The attempt's entry in the ledger, once written (a fall or a result writes it once). */
  closed: AttemptOutcome | null = null;
  /** The landscape the world has loaded, so travelling to the same river does not rebuild it. */
  loaded: LevelDef | null = null;
  private readonly designs = new Map<LevelId, BridgeDesign>();
  /** Levels made at run time (the river of the day, the epilogue), found by id like the rivers. */
  private readonly made = new Map<LevelId, LevelDef>();

  constructor(public save: SaveData) {}

  record(id: LevelId | undefined = this.level?.id): LevelRecord | null {
    return id ? (this.save.levels[id] ?? null) : null;
  }

  setRecord(id: LevelId, record: LevelRecord): void {
    this.save.levels[id] = record;
  }

  /** Keep a level made at run time so the flow can travel to it by id. */
  adopt(level: LevelDef): void {
    this.made.set(level.id, level);
    // A new river of the day (or a new epilogue) must not inherit the board of an old one.
    this.designs.delete(level.id);
  }

  madeLevel(id: LevelId): LevelDef | null {
    return this.made.get(id) ?? null;
  }

  /** The design to put on the board: the one left there, else the best saved one, else the starter. */
  designFor(level: LevelDef): BridgeDesign {
    return this.designs.get(level.id) ?? this.save.levels[level.id]?.design ?? level.starter;
  }

  keepDesign(level: LevelDef, design: BridgeDesign): void {
    this.designs.set(level.id, design);
  }

  /** Forget the attempt in progress (a new river, a retry, the title). */
  clearAttempt(): void {
    this.built = null;
    this.run = null;
    this.markStone = null;
    this.closed = null;
    this.modeLine = null;
    this.repairYears = [];
  }

  /** A fresh save after the player erased theirs. */
  reset(save: SaveData): void {
    this.save = save;
    this.designs.clear();
    this.clearAttempt();
  }
}
