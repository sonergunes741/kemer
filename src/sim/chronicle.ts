/**
 * One bridge living through the centuries (SIM-SPEC section 10).
 *
 * Everything happens on whole years: advance() processes each calendar year it crosses exactly
 * once, in a fixed order (traffic era, century, weathering, flood, earthquakes, exceptional loads,
 * the structural check, the service safety and its warning). So a run advanced in one call and in
 * a thousand small ones are identical. The structural check runs every tenth year, and every year
 * while the bridge is under watch.
 */
import type { ChronicleRun, UpcomingEvent } from '../core/contracts';
import type {
  BridgeDesign,
  BridgeGeometry,
  BridgeState,
  CauseId,
  ChronicleEvent,
  CollapseInfo,
  HazardDef,
  LevelDef,
  RepairQuote,
  RunSummary,
  TrafficEra,
} from '../core/types';
import type { Analysis } from './analysis';
import { collapseFrom } from './collapse';
import { Condition } from './condition';
import type { Failure } from './condition';
import { FloodDesk } from './flooding';
import { Service } from './service';
import type { Mechanism } from './transient';
import { axleCapacityAt, deadMechanism, quakeCapacity } from './transient';
import {
  CHECK_EVERY,
  DECISION_TOL,
  FLOOD_DRAMA_T0,
  FLOOD_DRAMA_T1,
  FLOOD_UPCOMING_T,
  GROWTH_YEARS,
  LOAD_DAMAGE_FROM,
  LOAD_SPREAD,
  MOSS_YEARS,
  NAMED_DRAMA,
  PATINA_YEARS,
  QUAKE_DAMAGE_FROM,
  QUAKE_EFFECTIVE,
  QUAKE_JOINT_LOSS,
  QUAKE_SPREAD,
  REPAIR_LOSS_LEFT,
  REPAIR_MIN_LOSS,
  WARNING_SAFETY,
  WEATHER_FROST,
  WEATHER_GROWTH,
  WEATHER_WET,
} from './tuning';
import { floodSeries, returnPeriod } from './water';
import type { FloodSeries } from './water';

type FloodHazard = Extract<HazardDef, { kind: 'flood' }>;
type QuakeHazard = Extract<HazardDef, { kind: 'quake' }>;
type LoadHazard = Extract<HazardDef, { kind: 'load' }>;

/** Drama of a flood from its return period: 0 at FLOOD_DRAMA_T0 years, 1 at FLOOD_DRAMA_T1 (log scale). */
export function floodDrama(period: number, named: boolean): number {
  const t = Math.log(Math.max(1, period) / FLOOD_DRAMA_T0) / Math.log(FLOOD_DRAMA_T1 / FLOOD_DRAMA_T0);
  const drama = Math.min(1, Math.max(0, t));
  return named ? Math.max(NAMED_DRAMA, drama) : drama;
}

export class Run implements ChronicleRun {
  readonly level: LevelDef;
  readonly design: BridgeDesign;
  readonly geometry: BridgeGeometry;
  readonly state: BridgeState;
  ended = false;

  private readonly analysis: Analysis;
  private readonly condition: Condition;
  private readonly series: FloodSeries;
  private readonly floods: FloodDesk;
  private readonly notable: UpcomingEvent[] = [];
  private readonly service: Service;
  /** Weathering rate of the joints this year, metres. */
  private rate = 0;
  /** Next whole year to process. */
  private nextYear: number;
  private warned = false;
  private lastRepair: number;
  private firstRepair: number | null = null;
  private collapse: CollapseInfo | undefined;
  private greatest: { year: number; stage: number } | undefined;
  /** The collapse at the striking of the centering, still to be reported by the first advance(). */
  private struck: ChronicleEvent | null = null;

  constructor(analysis: Analysis) {
    const level = analysis.level;
    this.analysis = analysis;
    this.level = level;
    this.design = analysis.design;
    this.geometry = analysis.geometry();
    this.condition = new Condition(analysis);
    this.series = floodSeries(level);
    this.floods = new FloodDesk(analysis.waterway(), this.condition.model);
    this.nextYear = Math.floor(level.year) + 1;
    this.lastRepair = level.year;
    this.service = new Service(level, analysis);
    this.rate = this.weathering(0);

    this.state = {
      year: level.year,
      spans: analysis.spans.map((s, i) => ({
        alive: true,
        jointLoss: 0,
        gsf: s.gsf,
        spread: 0,
        drop: 0,
        hinges: [],
        shifts: Array.from({ length: analysis.layout.shapes[i]!.n }, () => ({ dx: 0, dy: 0, rot: 0 })),
      })),
      piers: analysis.piers.map(() => ({ alive: true, scour: 0, protection: 0, settlement: 0 })),
      safety: analysis.safety,
      moss: 0,
      patina: 0,
      growth: 0,
      repairs: 0,
      repairStones: 0,
      collapsed: false,
    };

    // What the director may know in advance: named hazards and the great floods, never their outcome.
    for (let i = 0; i < this.series.stage.length; i++) {
      const named = this.series.named[i];
      const period = returnPeriod(level, this.series.stage[i] as number);
      if (named || period >= FLOOD_UPCOMING_T) this.notable.push({ year: this.series.first + i, kind: 'flood', drama: floodDrama(period, !!named) });
    }
    for (const hz of level.hazards) {
      if (hz.kind !== 'flood' && hz.year > level.year && hz.year <= level.endYear) this.notable.push({ year: hz.year, kind: hz.kind, drama: NAMED_DRAMA });
    }
    this.notable.sort((a, b) => a.year - b.year);

    // A bridge that cannot carry itself never starts its chronicle: its only event is that collapse.
    const strike = analysis.strike();
    if (!strike.stands && strike.collapse) {
      this.finish(strike.collapse);
      this.struck = { kind: 'collapse', year: strike.collapse.year, info: strike.collapse };
    } else {
      // The worst axle positions take tens of milliseconds to find on a long bridge: here, once,
      // not inside the advance() call that happens to cross the first ten-year check. The gauge
      // starts from the new bridge as its first years will leave it.
      this.foresee(level.year, true);
    }
  }

  get year(): number {
    return this.state.year;
  }

  upcoming(limit = 8): readonly UpcomingEvent[] {
    const out: UpcomingEvent[] = [];
    for (const e of this.notable) {
      if (e.year > this.state.year && out.length < limit) out.push(e);
    }
    return out;
  }

  advance(year: number): ChronicleEvent[] {
    const events: ChronicleEvent[] = [];
    if (this.struck) {
      // "Stops at a collapse (the last event is then `collapse`)" holds for this run too.
      events.push(this.struck);
      this.struck = null;
      return events;
    }
    if (this.ended || !(year > this.state.year)) return events;
    const target = Math.min(year, this.level.endYear);
    while (!this.ended && this.nextYear <= target) {
      this.stepYear(this.nextYear, events);
      this.nextYear++;
    }
    if (!this.ended) {
      this.state.year = target;
      if (target >= this.level.endYear) {
        this.ended = true;
        events.push({ kind: 'end', year: this.level.endYear });
      }
    }
    return events;
  }

  /* -- one year ----------------------------------------------------------------------------- */

  private stepYear(year: number, events: ChronicleEvent[]): void {
    const { level, state } = this;
    state.year = year;
    for (const era of level.traffic) if (era.from === year) events.push({ kind: 'era', year, era });
    if (year % 100 === 0) events.push({ kind: 'century', year });

    // A bridge already trembling when time begins is told so before anything happens to it.
    this.warn(year, events);

    // Weathering and the visual clocks.
    const age = year - level.year;
    const env = level.env;
    state.growth = Math.min(1, (year - this.lastRepair) / GROWTH_YEARS);
    state.moss = Math.min(1, (age * (0.25 + 0.75 * env.wet)) / MOSS_YEARS);
    state.patina = Math.min(1, age / PATINA_YEARS);
    this.rate = this.weathering(state.growth);
    for (const s of state.spans) if (s.alive) s.jointLoss += this.rate;

    const index = year - this.series.first;
    if (index >= 0 && index < this.series.stage.length) {
      this.flood(year, this.series.stage[index] as number, this.series.named[index] ?? null, events);
      if (this.ended) return;
    }
    for (const hz of level.hazards) {
      if (hz.year !== year || hz.kind === 'flood') continue;
      if (hz.kind === 'quake') this.quake(year, hz, events);
      else this.load(year, hz.axle, hz, events);
      if (this.ended) return;
    }
    // Every tenth year, and every year while the rings or the traffic margin are under watch: the
    // heaviest ordinary traffic of the era, on the bridge as it now is. Its wear on a bridge too
    // weak for it is reckoned per decade, as it always was.
    const decade = age % CHECK_EVERY === 0;
    if (decade || this.service.watched(this.condition, year)) {
      const era = this.eraOf(year);
      if (era) this.load(year, era.axle, null, events, decade);
      else this.check(year, events);
      if (this.ended) return;
    }
    this.service.serve(state, this.condition, year);
    this.warn(year, events);
  }

  /** Weathering of the joints in a year with this much plant growth, metres. */
  private weathering(growth: number): number {
    const env = this.level.env;
    return this.analysis.layout.stone.weathering * (1 + WEATHER_FROST * env.frost) * (1 + WEATHER_WET * env.wet) * (1 + WEATHER_GROWTH * growth);
  }

  /** The first time since the last repair that the service safety is under WARNING_SAFETY. */
  private warn(year: number, events: ChronicleEvent[]): void {
    if (this.warned || !(this.state.safety < WARNING_SAFETY)) return;
    this.warned = true;
    events.push({ kind: 'warning', year, safety: this.state.safety });
  }

  /**
   * The margins as they will be FORESIGHT years on, then the service safety. `traffic` measures
   * the axle capacity too (the ordinary traffic check, a repair, the start).
   */
  private foresee(year: number, traffic: boolean): void {
    const gain = this.service.ahead(year, this.rate, this.state);
    this.condition.foresee(this.state, gain, traffic ? this.analysis.spots() : null);
    this.service.serve(this.state, this.condition, year);
  }

  private eraOf(year: number): TrafficEra | null {
    let last: TrafficEra | null = null;
    for (const era of this.level.traffic) {
      if (year >= era.from && year < era.to) return era;
      if (era.from <= year) last = era;
    }
    return last;
  }

  /**
   * Run the structural check; when something fails the bridge falls (returns false). Standing, it
   * looks FORESIGHT years ahead; `traffic` measures the axle capacity there too.
   */
  private check(year: number, events: ChronicleEvent[], hazard?: HazardDef, traffic = false): boolean {
    const failure: Failure | null = this.condition.check(year, this.state, events);
    if (!failure) {
      this.foresee(year, traffic);
      return true;
    }
    // Damage a hazard has just done is the hazard's doing.
    const cause: CauseId = hazard?.kind === 'quake' ? 'quake' : hazard?.kind === 'load' ? 'load' : failure.cause;
    this.fall(year, cause, failure.mechanism, events, hazard);
    return false;
  }

  /* -- hazards ------------------------------------------------------------------------------ */

  /** The year's flood: scour, washed mortar, the push on the rings; a settled pier is checked at once. */
  private flood(year: number, stage: number, named: FloodHazard | null, events: ChronicleEvent[]): void {
    const { state, level } = this;
    const period = returnPeriod(level, stage);
    if (!this.greatest || stage > this.greatest.stage) this.greatest = { year, stage };
    const outcome = this.floods.process(stage, named ? named.debris : 0, period, !!named, state, this.design);
    if (!outcome) return;
    const before = events.length;
    // The scour it dug counts against the pier feet from now on.
    this.service.serve(state, this.condition, year);
    let safety = Math.min(state.safety, outcome.safety);
    let stands = true;
    if (outcome.mechanism) {
      state.safety = Math.min(safety, 1 - 2 * DECISION_TOL);
      safety = state.safety;
      stands = false;
    } else if (outcome.settled) {
      // Scour let a pier settle: its spans must follow.
      stands = this.check(year, events);
      safety = Math.min(safety, state.safety);
    }
    if (outcome.report || !stands) {
      // The flood is reported before the cracks and the collapse it caused.
      events.splice(before, 0, {
        kind: 'flood',
        year,
        level: outcome.level,
        stage,
        velocity: outcome.velocity,
        debris: named ? named.debris : 0,
        overtopped: outcome.overtopped,
        scour: state.piers.map((p) => p.scour),
        safety,
        drama: floodDrama(period, !!named),
        ...(named ? { hazard: named } : {}),
      });
    }
    if (outcome.mechanism) this.fall(year, outcome.cause, outcome.mechanism, events, named ?? undefined);
  }

  private quake(year: number, hazard: QuakeHazard, events: ChronicleEvent[]): void {
    if (!this.check(year, events)) return;
    const { state } = this;
    const model = this.condition.model;
    const mechanism: Mechanism = { spans: new Map(), piers: [] };
    const capacity = quakeCapacity(model, mechanism);
    const demand = QUAKE_EFFECTIVE * hazard.pga;
    const ratio = capacity > 0 ? demand / capacity : Infinity;
    events.push({ kind: 'quake', year, hazard, pga: hazard.pga, capacity: Math.min(capacity, 5), drama: Math.max(NAMED_DRAMA, Math.min(1, ratio)) });
    if (ratio >= 1 - DECISION_TOL) {
      if (mechanism.spans.size === 0 && mechanism.piers.length === 0) {
        for (let i = 0; i < model.count; i++) mechanism.spans.set(i, deadMechanism(model, i));
      }
      this.fall(year, 'quake', mechanism, events, hazard);
      return;
    }
    if (ratio > QUAKE_DAMAGE_FROM) {
      // Short of collapse the shaking leaves every span a little wider and its joints looser.
      const share = (ratio - QUAKE_DAMAGE_FROM) / (1 - QUAKE_DAMAGE_FROM);
      for (let i = 0; i < model.count; i++) {
        this.condition.open(i, QUAKE_SPREAD * model.spans[i]!.shape.span * share);
        state.spans[i]!.jointLoss += QUAKE_JOINT_LOSS * share;
      }
      this.check(year, events, hazard);
    }
  }

  /**
   * An axle crosses: an exceptional one (`hazard`) or the heaviest ordinary one of the era. An
   * ordinary axle leaves its damage only when `wear` (once a decade): it is the decade's traffic.
   */
  private load(year: number, axle: number, hazard: LoadHazard | null, events: ChronicleEvent[], wear = true): void {
    if (!this.check(year, events, undefined, true)) return;
    // The capacity foreseen is the least the bridge has now: an ordinary axle well within it can
    // neither break nor wear the bridge, and the capacity as it stands need not be measured.
    if (!hazard && axle <= LOAD_DAMAGE_FROM * this.condition.axleAhead) return;
    const model = this.condition.model;
    const spots = this.analysis.spots();
    const { capacity, weakest } = this.condition.traffic(spots);
    const ratio = capacity > 0 ? axle / capacity : Infinity;
    if (hazard) events.push({ kind: 'load', year, hazard, axle, capacity: Math.min(capacity, 1e5), drama: Math.max(NAMED_DRAMA, Math.min(1, ratio)) });
    if (ratio >= 1 - DECISION_TOL) {
      // Only now is the mechanism worth working out: the weakest span once more, with its hinges.
      const worst: Mechanism = { spans: new Map(), piers: [] };
      const spot = spots[weakest]!;
      axleCapacityAt(model, weakest, spot.x, spot.length, spot.width, worst);
      if (worst.spans.size === 0 && worst.piers.length === 0) worst.spans.set(weakest, deadMechanism(model, weakest));
      // Everyday traffic the bridge carried easily when new: what failed is the bridge, not the cart.
      const worn = !hazard && axle <= LOAD_DAMAGE_FROM * this.analysis.capacities().axle;
      this.fall(year, worn ? this.condition.wearCause(this.state) : 'load', worst, events, hazard ?? undefined);
      return;
    }
    if (ratio > LOAD_DAMAGE_FROM && (wear || hazard)) {
      const share = (ratio - LOAD_DAMAGE_FROM) / (1 - LOAD_DAMAGE_FROM);
      // Everyday traffic too heavy for the bridge even when new is the load's doing, decade after decade.
      const everyday = !hazard && axle > LOAD_DAMAGE_FROM * this.analysis.capacities().axle;
      this.condition.open(weakest, LOAD_SPREAD * model.spans[weakest]!.shape.span * share, everyday);
      this.check(year, events, hazard ?? undefined);
    }
  }

  /* -- collapse, repair, summary ---------------------------------------------------------------- */

  private fall(year: number, cause: CauseId, first: Mechanism, events: ChronicleEvent[], hazard?: HazardDef): void {
    const fall = collapseFrom(this.condition.model, first);
    const info: CollapseInfo = { year, cause, spans: fall.spans, piers: fall.piers, ...(hazard ? { hazard } : {}) };
    this.finish(info);
    events.push({ kind: 'collapse', year, info });
  }

  private finish(info: CollapseInfo): void {
    const below = 1 - 2 * DECISION_TOL;
    this.collapse = info;
    this.ended = true;
    this.state.collapsed = true;
    this.state.year = info.year;
    for (const s of info.spans) {
      const span = this.state.spans[s.span];
      if (span) {
        span.alive = false;
        span.gsf = Math.min(span.gsf, below);
      }
    }
    for (const q of info.piers) {
      const pier = this.state.piers[q];
      if (pier) pier.alive = false;
    }
    this.state.safety = Math.min(this.state.safety, below);
  }

  quote(): RepairQuote {
    const { state } = this;
    let loss = 0;
    for (const s of state.spans) loss += s.jointLoss;
    const meanLoss = loss / Math.max(1, state.spans.length);
    let unprotected = false;
    for (let q = 0; q < state.piers.length; q++) if (this.service.bill.protectionAdded(state, q) > 1e-9) unprotected = true;
    const possible = !this.ended && (meanLoss >= REPAIR_MIN_LOSS || state.growth > 0.05 || unprotected);
    return { possible, stones: this.service.bill.stones(state) };
  }

  repair(): boolean {
    const quote = this.quote();
    if (!quote.possible) return false;
    const { state } = this;
    for (const s of state.spans) s.jointLoss *= REPAIR_LOSS_LEFT;
    for (let q = 0; q < state.piers.length; q++) state.piers[q]!.protection += this.service.bill.protectionAdded(state, q);
    const year = Math.floor(state.year);
    state.growth = 0;
    state.repairs++;
    state.repairStones += quote.stones;
    this.lastRepair = year;
    this.firstRepair ??= year;
    this.warned = false;
    // Repair never makes anything worse, so nothing can fall here: only the margins change.
    this.service.repaired(year, state);
    this.condition.refresh(state);
    this.foresee(year, true);
    return true;
  }

  summary(): RunSummary {
    const { level, state } = this;
    const lastYear = this.collapse ? this.collapse.year : Math.min(level.endYear, Math.floor(state.year));
    const standing = !this.collapse && this.ended && lastYear >= level.endYear;
    const stones = this.geometry.stones.total + state.repairStones;
    // "Unrepaired": alive after the site's greatest flood with no repair before it.
    const greatestOfSite = this.series.greatest;
    const metGreatest = this.series.stage.length > 0 && (this.collapse ? this.collapse.year > greatestOfSite.year : state.year >= greatestOfSite.year);
    const unrepaired = metGreatest && (this.firstRepair === null || this.firstRepair > greatestOfSite.year);
    const lean = standing && stones <= level.parStones;
    return {
      level: level.id,
      builtYear: level.year,
      lastYear,
      years: lastYear - level.year,
      passed: lastYear - level.year >= level.passYears,
      seals: { standing, lean, unrepaired },
      masterwork: standing && lean && unrepaired,
      stones,
      repairs: state.repairs,
      ...(this.collapse ? { collapse: this.collapse } : {}),
      ...(this.greatest ? { greatestFlood: this.greatest } : {}),
    };
  }
}
