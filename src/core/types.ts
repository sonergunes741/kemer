/**
 * Kemer domain types. Owned by the lead; every module imports from here and nobody else edits it.
 *
 * Frames and units
 * - Elevation frame (simulation, 2D): x runs along the bridge from the left bank to the right bank,
 *   y is up. y = 0 is the river's normal water level at the bridge. Metres.
 * - World frame (rendering, 3D): X = elevation x, Y = elevation y, Z = across the bridge.
 *   +Z is upstream (towards the default camera); the river flows towards -Z. The bridge occupies
 *   -width/2 <= Z <= +width/2.
 * - Forces are per metre of bridge width: kN/m. Unit weights kN/m3, stresses kPa, discharge m3/s.
 * - Years are calendar years (AD); the simulation runs from a level's build year to 2026.
 */

export type Lang = 'tr' | 'en';

/** Authored bilingual text. */
export interface LocalText {
  readonly tr: string;
  readonly en: string;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/* ------------------------------------------------------------------------------------------ */
/* Materials                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export type StoneId = 'tuff' | 'andesite' | 'limestone' | 'basalt' | 'granite';

export interface StoneMaterial {
  readonly id: StoneId;
  readonly name: LocalText;
  /** Unit weight of the masonry, kN/m3. */
  readonly unitWeight: number;
  /** Compressive strength of the masonry (not the intact rock), kPa. */
  readonly strength: number;
  /** Friction coefficient of a joint. */
  readonly friction: number;
  /** Loss of joint contact depth per year in a mild climate, metres/year. */
  readonly weathering: number;
  /** Typical dressed block size (metres): length along the course, course height. */
  readonly blockLength: number;
  readonly blockHeight: number;
}

export type SoilId = 'rock' | 'gravel' | 'sand' | 'clay' | 'marsh';

export interface SoilMaterial {
  readonly id: SoilId;
  readonly name: LocalText;
  /** Ultimate bearing pressure, kPa. */
  readonly bearing: number;
  /** Multiplier on computed scour depth (rock is nearly 0). */
  readonly scour: number;
  /** Long-term horizontal yielding of an abutment: metres per (kN/m of thrust), at infinite time. */
  readonly yielding: number;
  /** Base friction coefficient. */
  readonly friction: number;
}

/* ------------------------------------------------------------------------------------------ */
/* Site and level                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** A stretch of the bridge axis and what the ground is made of there. */
export interface SoilZone {
  readonly from: number;
  readonly to: number;
  readonly soil: SoilId;
}

/** Flood behaviour of the river at the site, as stages of the natural channel (no bridge). */
export interface FloodRegime {
  /** Stage (m above normal water) of the 2-year and the 100-year flood; a Gumbel law is fitted to them. */
  readonly stage2: number;
  readonly stage100: number;
  /** Day of the year (0..364) when the annual flood usually peaks. */
  readonly peakDay: number;
  /** A dam upstream tames floods from this year on (annual peaks multiplied by `regulatedFactor`). */
  readonly regulatedFrom?: number;
  readonly regulatedFactor?: number;
}

export interface SiteDef {
  /**
   * Ground line of the valley cross-section along the bridge axis before building, x ascending,
   * y relative to the normal water level. Must extend at least 1.5 bridge lengths beyond each
   * abutment (the world renders it) and dip below y = 0 where the river runs.
   */
  readonly ground: readonly Vec2[];
  /** Soil along the axis; anything not covered is rock. */
  readonly soils: readonly SoilZone[];
  /** x of the left and right abutment faces: the arches spring from these two points. */
  readonly left: number;
  readonly right: number;
  /** Springing elevation the level starts with, and the range the player may move it in (if allowed). */
  readonly springLevel: number;
  readonly springRange: readonly [number, number];
  /** Road elevation at the left and right ends of the bridge. */
  readonly roadLeft: number;
  readonly roadRight: number;
  /** Steepest deck slope traffic accepts (rise over run). */
  readonly maxGrade: number;
  /** Bridge width across the deck, metres. */
  readonly width: number;
  /** Piers may only stand between these x values. */
  readonly pierZone: readonly [number, number];
  /** River hydraulics: bed slope (m/m) and Manning roughness of the natural channel. */
  readonly slope: number;
  readonly manningN: number;
  readonly flood: FloodRegime;
  /** Seed for the site's deterministic series (annual floods, small variations). */
  readonly seed: number;
  /**
   * Uzunköprü only: this many more arches continue beyond the left and the right abutment, copies
   * of the end spans standing on the flat ground there. They are built and shown with the bridge
   * and counted in the arch total, but the structural check covers only the designed spans.
   */
  readonly arcade?: readonly [number, number];
}

export type BiomeId =
  | 'tuff-valley' //      Koramaz: pale volcanic tuff, orchards, poplars
  | 'steppe-river' //     Zamantı, Kızılırmak: dry steppe, red-brown water, willows
  | 'green-valley' //     Yeşilırmak: gardens, plane trees
  | 'basalt-plain' //     Dicle: black basalt, wide brown river, Hevsel gardens
  | 'limestone-gorge' //  Batman Çayı: pale cliffs, turquoise water
  | 'highland' //         Aras: high treeless plateau, long winters
  | 'canyon' //           Arpaçay at Ani: red-black volcanic canyon
  | 'rain-forest' //      Fırtına: steep, lush, mist, milky white water
  | 'alluvial-plain' //   Sakarya: flat fields, reeds, slow green-brown river
  | 'flood-plain' //      Tunca: meadows, oaks, wide shallow river
  | 'marsh'; //           Ergene: reeds, pools, very wide and flat

export type WaterTint = 'green' | 'red' | 'brown' | 'turquoise' | 'milky' | 'clear';

/** How a site looks and what its weather is like. The world module turns this into a landscape. */
export interface EnvDef {
  readonly biome: BiomeId;
  readonly water: WaterTint;
  /** Geographic latitude in degrees (sun path). */
  readonly latitude: number;
  /** 0..1: how hard the winters are (snow cover, ice). */
  readonly winter: number;
  /** 0..1: freeze-thaw severity, multiplies stone weathering. */
  readonly frost: number;
  /** 0..1: rainfall and humidity (moss, vegetation growth, mist). */
  readonly wet: number;
  /** Seed for the landscape. */
  readonly seed: number;
}

export type LevelId =
  | 'koramaz'
  | 'zamanti'
  | 'kizilirmak'
  | 'yesilirmak'
  | 'dicle'
  | 'batman'
  | 'aras'
  | 'arpacay'
  | 'firtina'
  | 'sakarya'
  | 'tunca'
  | 'ergene'
  | 'epilogue'
  | 'daily'
  | 'millennium';

/** Design tools a level unlocks. The UI shows only these. */
export type ToolId =
  | 'rise' //        drag the crown: height of the arch
  | 'thickness' //   drag the back of the ring
  | 'fullness' //    drag the haunch: round, pointed, flat
  | 'piers' //       add, move, remove piers
  | 'pier-width' //  drag a pier's side
  | 'spring' //      raise or lower the springing line
  | 'cover' //       depth of fill over the crown
  | 'cutwaters' //   selyaran: pointed pier noses
  | 'reliefs' //     boşaltma gözleri: openings through the spandrels
  | 'clamps' //      kenet: iron clamps set in lead
  | 'piles' //       kazık: timber piles under soft-ground foundations
  | 'foundation'; // depth of the pier foundations

export interface DesignLimits {
  readonly minPiers: number;
  readonly maxPiers: number;
  readonly thickness: readonly [number, number];
  readonly pierWidth: readonly [number, number];
  readonly cover: readonly [number, number];
  readonly foundation: readonly [number, number];
  /** Smallest clear span between supports, metres. */
  readonly minSpan: number;
}

export type ActorKind =
  | 'villager'
  | 'ox-cart'
  | 'donkey'
  | 'caravan'
  | 'rider'
  | 'army'
  | 'cannon'
  | 'carriage'
  | 'truck'
  | 'cyclist';

/** Everyday traffic in a period: who crosses and the heaviest ordinary axle. */
export interface TrafficEra {
  readonly from: number;
  readonly to: number;
  readonly actors: readonly ActorKind[];
  /** Heaviest ordinary load in the era as a single axle, kN (whole bridge width). */
  readonly axle: number;
}

export type HazardDef =
  | {
      readonly kind: 'flood';
      readonly year: number;
      /** Stage the natural channel would reach, m above normal water. */
      readonly stage: number;
      /** 0..1: how much driftwood the flood carries. */
      readonly debris: number;
      readonly name?: LocalText;
    }
  | {
      readonly kind: 'quake';
      readonly year: number;
      /** Peak ground acceleration at the site as a fraction of g. */
      readonly pga: number;
      readonly name?: LocalText;
    }
  | {
      readonly kind: 'load';
      readonly year: number;
      /** A single exceptional crossing: one axle of this many kN. */
      readonly axle: number;
      readonly actor: ActorKind;
      readonly name?: LocalText;
    };

export interface LevelDef {
  readonly id: LevelId;
  /** 1..12 for the rivers, 13 for the epilogue, 0 for generated levels. */
  readonly index: number;
  readonly year: number;
  readonly endYear: number;
  /** The bridge must outlast its builder: years it has to stand for the level to count as passed. */
  readonly passYears: number;
  readonly river: LocalText;
  readonly place: LocalText;
  /** The builder of this generation. */
  readonly builder: LocalText;
  readonly site: SiteDef;
  readonly env: EnvDef;
  readonly stone: StoneId;
  readonly tools: readonly ToolId[];
  readonly limits: DesignLimits;
  /** Named hazards. Ordinary annual floods are generated from the site's flood regime. */
  readonly hazards: readonly HazardDef[];
  readonly traffic: readonly TrafficEra[];
  /** Stone count at or under which the "lean" seal is earned. */
  readonly parStones: number;
  /** A sensible first design for the level (the tutorial starts from it). */
  readonly starter: BridgeDesign;
}

/* ------------------------------------------------------------------------------------------ */
/* The player's design                                                                         */
/* ------------------------------------------------------------------------------------------ */

export interface SpanDesign {
  /** Height of the crown of the intrados above the springing line, metres. */
  rise: number;
  /**
   * Shape of each half of the arch between springing and crown, 0..1. 1 is the fullest curve the
   * rise allows (a circular segment when rise <= span/2, a pointed arch with vertical springings
   * above that); smaller values flatten the haunches towards a pointed, straight-sided arch.
   */
  fullness: number;
  /** Radial thickness of the arch ring, metres. */
  thickness: number;
}

export interface PierDesign {
  /** x of the pier's centre line. */
  x: number;
  /** Width along the bridge axis, metres. */
  width: number;
}

export interface BridgeDesign {
  v: 1;
  springLevel: number;
  /** Sorted by x. spans.length === piers.length + 1. */
  piers: PierDesign[];
  spans: SpanDesign[];
  /** When true the UI edits every span together (they all hold the same values). */
  linked: boolean;
  /** Depth of fill between the crown of the highest arch and the road surface, metres. */
  cover: number;
  /** Depth of the pier foundations below the river bed, metres. */
  foundation: number;
  cutwaters: boolean;
  reliefs: boolean;
  clamps: boolean;
  piles: boolean;
}

export type IssueCode =
  | 'span-too-small'
  | 'pier-outside-zone'
  | 'piers-overlap'
  | 'rise-too-low'
  | 'rise-too-high'
  | 'thickness-range'
  | 'pier-width-range'
  | 'deck-too-steep'
  | 'deck-below-road'
  | 'cover-range'
  | 'foundation-range'
  | 'too-many-piers'
  | 'too-few-piers';

export interface DesignIssue {
  readonly code: IssueCode;
  /** Index of the span or pier the issue is about, or -1 for the whole bridge. */
  readonly index: number;
}

/* ------------------------------------------------------------------------------------------ */
/* Geometry derived from a design                                                              */
/* ------------------------------------------------------------------------------------------ */

/** A joint between two voussoirs (or a voussoir and its support): intrados end and extrados end. */
export interface Joint {
  readonly a: Vec2;
  readonly b: Vec2;
}

/** One course of the arch ring in elevation. Stones are numbered left to right within a span. */
export interface Voussoir {
  /** Index within the span, 0-based from the left springing. */
  readonly index: number;
  /** Outline, counter-clockwise, starting at the left joint's intrados end. Curved edges are polylines. */
  readonly outline: readonly Vec2[];
  readonly centroid: Vec2;
  /** Elevation area, m2. */
  readonly area: number;
  readonly keystone: boolean;
}

export interface SpanGeometry {
  readonly index: number;
  /** Springing points on the intrados. */
  readonly left: Vec2;
  readonly right: Vec2;
  readonly crown: Vec2;
  /** Clear span between the springing points. */
  readonly span: number;
  /** joints.length === voussoirs.length + 1; joints[i] is the left face of voussoirs[i]. */
  readonly joints: readonly Joint[];
  readonly voussoirs: readonly Voussoir[];
  /** Dense polylines for drawing, left to right. */
  readonly intrados: readonly Vec2[];
  readonly extrados: readonly Vec2[];
}

export interface PierGeometry {
  readonly index: number;
  readonly x: number;
  readonly width: number;
  /** Elevation of the river bed at the pier, of the foundation's underside and of the pier top (springing). */
  readonly bed: number;
  readonly base: number;
  readonly top: number;
  readonly cutwater: boolean;
  readonly soil: SoilId;
}

export interface AbutmentGeometry {
  readonly side: 'left' | 'right';
  /** Springing point. */
  readonly spring: Vec2;
  readonly soil: SoilId;
}

/** A relief opening through a spandrel: a small arched void above a pier or a haunch. */
export interface ReliefGeometry {
  readonly x: number;
  readonly sill: number;
  readonly width: number;
  readonly height: number;
}

export interface StoneCount {
  readonly ring: number;
  readonly spandrels: number;
  readonly piers: number;
  readonly parapets: number;
  readonly extras: number;
  readonly total: number;
}

export interface BridgeGeometry {
  readonly width: number;
  readonly spans: readonly SpanGeometry[];
  readonly piers: readonly PierGeometry[];
  readonly abutments: readonly [AbutmentGeometry, AbutmentGeometry];
  /** Road surface, left to right, from the left road end to the right road end. */
  readonly deck: readonly Vec2[];
  readonly parapetHeight: number;
  readonly reliefs: readonly ReliefGeometry[];
  readonly stones: StoneCount;
}

/* ------------------------------------------------------------------------------------------ */
/* Structural assessment                                                                       */
/* ------------------------------------------------------------------------------------------ */

export type HingeSide = 'intrados' | 'extrados';

export interface Hinge {
  /** Joint index within the span. */
  readonly joint: number;
  readonly side: HingeSide;
  readonly at: Vec2;
}

/** The quick answer shown while the player drags a handle. */
export interface SpanInsight {
  /**
   * Geometric factor of safety under the bridge's own weight: how many times thinner the ring
   * could be before no line of thrust fits inside it. Below 1 the arch falls when the centering
   * is struck.
   */
  readonly gsf: number;
  /** The most central line of thrust, one point per joint, left to right. */
  readonly thrustLine: readonly Vec2[];
  /** Where that line comes closest to (or leaves) the stone. */
  readonly hinges: readonly Hinge[];
  /** Horizontal thrust on the supports, kN per metre of width. */
  readonly thrust: number;
  /** Highest compressive stress over the stone's strength, 0..1 (above 1 the stone crushes). */
  readonly crushing: number;
}

export interface PierInsight {
  /** Margin against overturning, sliding and bearing failure under dead load; below 1 the pier fails. */
  readonly stability: number;
}

export interface Insight {
  readonly issues: readonly DesignIssue[];
  readonly spans: readonly SpanInsight[];
  readonly piers: readonly PierInsight[];
  /** The smallest of the span and pier margins: the number the safety gauge shows. */
  readonly safety: number;
  readonly stones: StoneCount;
}

/** The slower, fuller picture, computed when the player lets go of a handle. */
export interface Capacities {
  /** Heaviest single axle (kN) the bridge carries at the worst position. */
  readonly axle: number;
  /** Horizontal ground acceleration (fraction of g) that turns an arch or a pier into a mechanism. */
  readonly quake: number;
  /** Natural flood stage (m above normal water) that first submerges a crown soffit. */
  readonly floodFree: number;
  /** Share of the natural waterway left open at the 100-year stage, 0..1. */
  readonly waterway: number;
  /** Scour depth over foundation depth at the 100-year flood, worst pier (above 1 undermines it). */
  readonly scour: number;
  /** Outward movement of a support (m) the weakest arch tolerates before it snaps through. */
  readonly spread: number;
}

/** What striking the centering does. */
export interface StrikeResult {
  readonly stands: boolean;
  /** How far the crown of each span settles as the joints close, metres. */
  readonly settle: readonly number[];
  /** Present when the bridge falls. */
  readonly collapse?: CollapseInfo;
}

/* ------------------------------------------------------------------------------------------ */
/* The chronicle: a bridge through the centuries                                               */
/* ------------------------------------------------------------------------------------------ */

export type CauseId =
  | 'strike' //      fell when the centering was struck: the ring was too thin or the wrong shape
  | 'weathering' //  joints wasted away until no line of thrust fitted
  | 'flood-scour' // a pier was undermined
  | 'flood-wash' //  the flood swept the superstructure away
  | 'quake'
  | 'load'
  | 'settlement' //  soft ground let the supports move too far
  | 'crushing';

export interface SpanCollapse {
  readonly span: number;
  /** Seconds after the start of the collapse when this span lets go (progressive failures). */
  readonly delay: number;
  /** The hinges of the mechanism, left to right; rotation alternates. Empty for a wash-out. */
  readonly hinges: readonly Hinge[];
  /** +1: the part between the first two hinges rotates clockwise; -1: anticlockwise. */
  readonly sense: 1 | -1;
}

export interface CollapseInfo {
  readonly year: number;
  readonly cause: CauseId;
  readonly spans: readonly SpanCollapse[];
  /** Piers that go down with the spans. */
  readonly piers: readonly number[];
  /** The hazard that triggered it, if any. */
  readonly hazard?: HazardDef;
}

/** Rigid movement of one voussoir from its as-built position: translation and rotation about its centroid. */
export interface StoneShift {
  dx: number;
  dy: number;
  rot: number;
}

export interface SpanState {
  alive: boolean;
  /** Joint contact depth lost to weathering, metres. */
  jointLoss: number;
  /** Current factor of safety with the wasted joints and moved supports. */
  gsf: number;
  /** How far the right support has moved relative to the left since building: +u apart, +v down. */
  spread: number;
  drop: number;
  /** Open hinges (cracks) the support movement has produced. */
  hinges: Hinge[];
  /** One entry per voussoir. */
  shifts: StoneShift[];
}

export interface PierState {
  alive: boolean;
  /** Deepest scour so far below the bed, metres, and the protection (riprap) added by repairs. */
  scour: number;
  protection: number;
  /** Settlement of the pier, metres. */
  settlement: number;
}

export interface BridgeState {
  year: number;
  spans: SpanState[];
  piers: PierState[];
  /**
   * Service safety: the smallest margin against what will bring the bridge down next under
   * ordinary conditions (the rings and piers under their own weight, the era's ordinary axle, scour
   * at the pier feet). Drives the HUD gauge during the time-lapse.
   */
  safety: number;
  /**
   * Which of those governs while the bridge is under watch (safety below 1.6): wasted joints, the
   * ordinary traffic, scour at a pier foot, or ground that moved the supports; 'none' when sound.
   */
  weakness?: 'joints' | 'traffic' | 'scour' | 'ground' | 'none';
  /** 0..1 visual ageing drivers. */
  moss: number;
  patina: number;
  growth: number;
  repairs: number;
  /** Stones added by repairs. */
  repairStones: number;
  collapsed: boolean;
}

/** Something worth showing as the years run. */
export type ChronicleEvent =
  | {
      readonly kind: 'flood';
      readonly year: number;
      readonly hazard?: HazardDef;
      /** Water level upstream of the bridge at the peak, m above normal, and the natural stage. */
      readonly level: number;
      readonly stage: number;
      /** Mean velocity through the openings, m/s. */
      readonly velocity: number;
      readonly debris: number;
      /** True when the water reached the deck. */
      readonly overtopped: boolean;
      /** Scour depth reached at each pier, metres. */
      readonly scour: readonly number[];
      /** Safety margin at the peak. */
      readonly safety: number;
      /** 0..1 how notable: the director slows down for big ones. */
      readonly drama: number;
    }
  | {
      readonly kind: 'quake';
      readonly year: number;
      readonly hazard: HazardDef;
      readonly pga: number;
      /** Acceleration the bridge could take, fraction of g. */
      readonly capacity: number;
      readonly drama: number;
    }
  | {
      readonly kind: 'load';
      readonly year: number;
      readonly hazard: HazardDef;
      readonly axle: number;
      readonly capacity: number;
      readonly drama: number;
    }
  | { readonly kind: 'crack'; readonly year: number; readonly span: number; readonly hinge: Hinge }
  | { readonly kind: 'era'; readonly year: number; readonly era: TrafficEra }
  | { readonly kind: 'century'; readonly year: number }
  | { readonly kind: 'warning'; readonly year: number; readonly safety: number }
  | { readonly kind: 'collapse'; readonly year: number; readonly info: CollapseInfo }
  | { readonly kind: 'end'; readonly year: number };

export interface RepairQuote {
  readonly possible: boolean;
  /** Stones the repair would use. */
  readonly stones: number;
}

export interface Seals {
  /** Still standing in 2026. */
  readonly standing: boolean;
  /** Standing in 2026 with no more stones (repairs included) than the level's par. */
  readonly lean: boolean;
  /** Came through the site's greatest flood with no repair before it. */
  readonly unrepaired: boolean;
}

export interface RunSummary {
  readonly level: LevelId;
  readonly builtYear: number;
  /** Last year the bridge stood (2026 if it never fell). */
  readonly lastYear: number;
  readonly years: number;
  readonly passed: boolean;
  readonly seals: Seals;
  /** All three seals in one run. */
  readonly masterwork: boolean;
  readonly stones: number;
  readonly repairs: number;
  readonly collapse?: CollapseInfo;
  /** Year and stage of the greatest flood the bridge met. */
  readonly greatestFlood?: { readonly year: number; readonly stage: number };
}

/* ------------------------------------------------------------------------------------------ */
/* Progress                                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** The family mark: strokes between the nine points of a 3 x 3 grid (0..8, row by row). */
export interface FamilyMark {
  readonly strokes: readonly (readonly [number, number])[];
}

export interface LevelRecord {
  /** Best results so far. */
  bestYears: number;
  bestStones: number | null;
  seals: { standing: boolean; lean: boolean; unrepaired: boolean };
  masterwork: boolean;
  passed: boolean;
  attempts: number;
  /** The design of the best-standing bridge (for the ledger sketch and the epilogue). */
  design: BridgeDesign | null;
  /** Where the family mark was cut on it: span index and voussoir index. */
  markStone: { span: number; stone: number } | null;
  /** Hazards the family has witnessed here; the ledger lists them so later attempts can plan for them. */
  witnessed: number[];
}

export type QualityId = 'low' | 'medium' | 'high';

export interface Settings {
  lang: Lang;
  master: number;
  music: number;
  effects: number;
  quality: QualityId | 'auto';
  /** Show lengths in metres or in the Ottoman architect's cubit (mimar arşını, 0.758 m). */
  units: 'metre' | 'arsin';
  reducedMotion: boolean;
  /** Decorative extras (traffic on the bridge, birds, drifting clouds). */
  ambientLife: boolean;
  textScale: number;
  /** A second way to read the thrust line besides colour (dashes when it leaves the stone). */
  highContrast: boolean;
}

export interface SaveData {
  v: 1;
  mark: FamilyMark | null;
  levels: Partial<Record<LevelId, LevelRecord>>;
  /** Tutorial steps already taught (ids), so nothing is explained twice. */
  taught: string[];
  epilogueDone: boolean;
  daily: { last: string; streak: number; best: Record<string, number> };
  millennium: { bestStones: number | null; bestYears: number };
  settings: Settings;
}
