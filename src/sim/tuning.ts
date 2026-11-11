/**
 * Every tunable number of the simulation, in one place (SIM-SPEC). Units: metres, kN per metre
 * of bridge width, kPa, kN/m3, m3/s. Change values here, never inline.
 */

/* -- LP solver ------------------------------------------------------------------------------ */
/** Hidden bound on every scaled LP variable; reaching it with a positive multiplier means "unbounded". */
export const LP_BOX = 1e6;
/** Feasibility tolerance on scaled rows (SIM-SPEC 12). */
export const LP_FEAS_TOL = 1e-7;
/** A row counts as violated (and is pivoted on) beyond this. */
export const LP_PRICE_TOL = 1e-9;
/** Slack allowed on multipliers in the Harris ratio test and in warm-start checks. */
export const LP_DUAL_TOL = 1e-9;
/** Pivot elements below this fraction of the largest candidate are not used. */
export const LP_PIVOT_TOL = 1e-9;
/** Rebuild the basis inverse from scratch after this many rank-one updates (numerical hygiene). */
export const LP_REFACTOR_EVERY = 40;
/** A decision threshold counts as crossed only beyond this relative margin (SIM-SPEC 12). */
export const DECISION_TOL = 1e-6;

/* -- Arch shape (SIM-SPEC 1) ---------------------------------------------------------------- */
/** Smallest half central angle of an arc, degrees: nearly straight sides at fullness 0. */
export const BETA_MIN_DEG = 4;
/** Course width along the intrados: clamp(COURSE_BASE + COURSE_PER_T * t, COURSE_MIN, COURSE_MAX), metres. */
export const COURSE_BASE = 0.35;
export const COURSE_PER_T = 0.15;
export const COURSE_MIN = 0.4;
export const COURSE_MAX = 0.8;
/** Fewest and most courses in a ring (always odd, so there is a keystone). */
export const COURSES_MIN = 9;
export const COURSES_MAX = 121;
/** Largest chord error of the polylines that stand in for curved edges, metres. */
export const CHORD_ERROR = 0.005;
/** Rise limits as a fraction of the clear span (flattest buildable segment, tallest pointed arch). */
export const RISE_MIN_RATIO = 0.1;
export const RISE_MAX_RATIO = 1.0;
/** Smallest ring thickness and pier width normalize ever lets through, metres (guards bad level data). */
export const MIN_THICKNESS = 0.15;
export const MIN_PIER_WIDTH = 0.5;

/* -- The rest of the bridge (SIM-SPEC 2) ---------------------------------------------------- */
/** The deck runs past each abutment face by max(APPROACH_MIN, APPROACH_RATIO * length), metres. */
export const APPROACH_MIN = 2;
export const APPROACH_RATIO = 0.12;
/** Footing projection beyond each pier face for bearing checks, metres. */
export const FOOTING_EXTRA = 0.3;
/** Unit weight of rubble fill, kN/m3 (compacted earth and rubble, RING-style default). */
export const FILL_UNIT_WEIGHT = 18;
/** Thickness of each dressed spandrel wall, metres. */
export const SPANDREL_THICKNESS = 0.5;
/** Parapet section (each side), metres. */
export const PARAPET_WIDTH = 0.3;
export const PARAPET_HEIGHT = 0.9;
/** Paving thickness, metres; it also keeps the deck this far above every ring stone. */
export const PAVING_THICKNESS = 0.2;
/** Relief openings: only where the spandrel over a pier is at least this tall, metres. */
export const RELIEF_MIN_SPANDREL = 1.5;
/** Relief width = min(RELIEF_W_FACTOR * pier width + RELIEF_W_BASE, RELIEF_W_MAX), metres. */
export const RELIEF_W_FACTOR = 0.6;
export const RELIEF_W_BASE = 0.5;
export const RELIEF_W_MAX = 3;
/** Relief height up to this multiple of its width, leaving RELIEF_TOP_CLEAR under the deck. */
export const RELIEF_ASPECT = 1.5;
export const RELIEF_TOP_CLEAR = 0.6;
/** Relief sill above the pier top, metres. */
export const RELIEF_SILL = 0.4;
/** Depth (into the bridge) of dressed facing stone: block volume = length x height x this. */
export const BLOCK_DEPTH = 0.5;
/** Dressed shell thickness of piers, cutwaters and abutment walls, metres. */
export const SHELL_THICKNESS = 0.5;
/** Cutwater nose length as a multiple of the pier width (a pointed nose at each end). */
export const CUTWATER_LENGTH = 0.8;
/** Relief ring: dressed voussoirs of this radial depth around the opening, metres. */
export const RELIEF_RING_DEPTH = 0.3;
/** Extra dressed stone for piles (share of pier stones) and for clamps (share of ring stones). */
export const PILES_STONE_SHARE = 0.08;
export const CLAMPS_STONE_SHARE = 0.05;

/* -- Statics (SIM-SPEC 3, 5) ---------------------------------------------------------------- */
/**
 * Tangent points of the linearised crushing limit, as N / (sigma d). The spec lists the first
 * three; they only cover the rising branch of the parabola, so a ring could carry any load as long
 * as its line stayed central. The last two close it. At most 7 tangents (see the row codes in rows.ts).
 */
export const CRUSH_TANGENTS: readonly number[] = [0.05, 0.15, 0.3, 0.6, 1];
/** Iron clamps under transient loads: factor on the no-tension shrink and on joint friction. */
export const CLAMP_ALPHA = 1.35;
export const CLAMP_FRICTION = 1.5;
/** The search for the ring shrink factor alpha starts at ALPHA_MAX and stops at ALPHA_MIN (gsf is capped at 1 / ALPHA_MIN). */
export const ALPHA_MIN = 0.02;
export const ALPHA_MAX = 4;
/**
 * The reported gsf saturates here, like pier stability at PIER_STABILITY_CAP: the safety gauge has
 * one top. Far above 1 the ratio is ill-conditioned (a line that fits in a band of a few
 * centimetres) and it stops rising with thickness: a thicker ring is heavier and lifts the road,
 * the loads change, and the best line needs a wider band. Uncapped, the gauge fell by a third when
 * an already deep ring was thickened. The search itself still runs down to ALPHA_MIN. So gsf is
 * not monotonic in thickness on a filled bridge: it saturates at this cap, and above about 2 it may
 * dip as the ring thickens; below 2, and from standing to falling, it never does (SIM-SPEC 11).
 */
export const GSF_CAP = 5;
/** Most rounds of the fractional-programming iteration that finds alpha_min, and its tolerance. */
export const GSF_MAX_ROUNDS = 24;
export const GSF_TOL = 1e-7;
/** Largest horizontal thrust considered when looking for the central line, in span weights. */
export const THRUST_CAP = 100;
/** A weathered joint always keeps at least this share of its depth in contact. */
export const JOINT_MIN_DEPTH = 0.08;
/** The thrust line counts as touching the ring edge within this fraction of the half depth. */
export const HINGE_TOUCH = 2e-4;
/** Axle footprint: effective width = min(width, AXLE_WIDTH_BASE + fill), length = AXLE_LENGTH_BASE + fill. */
export const AXLE_WIDTH_BASE = 2.5;
export const AXLE_LENGTH_BASE = 0.3;
/** Axle positions tried across each span. */
export const AXLE_POSITIONS = 9;
/** Unit weight of water, kN/m3. */
export const WATER_UNIT_WEIGHT = 9.81;
/** Gravity, m/s2. */
export const GRAVITY = 9.81;
/** Display cap of SpanInsight.crushing. */
export const CRUSHING_CAP = 2;
/** Pier stability is capped here (SIM-SPEC 6). */
export const PIER_STABILITY_CAP = 5;
/** Bearing pressure multiplier of timber piles (SIM-SPEC 6). */
export const PILES_BEARING = 2.5;
/** Seconds between successive spans letting go in a progressive collapse. */
export const COLLAPSE_STEP_DELAY = 0.6;

/* -- Striking the centering (SIM-SPEC 7) ---------------------------------------------------- */
/** Closing of one joint at the reference stress, metres (tuned: a 7 m village arch settles about 1 cm). */
export const JOINT_CLOSE = 0.0006;
/** Reference mean joint stress of the settlement law, kPa. */
export const SETTLE_SIGMA_REF = 100;

/* -- Moving supports (SIM-SPEC 8) ----------------------------------------------------------- */
/** Most rounds of the hinge-set iteration. */
export const MOVE_ROUNDS = 6;
/** Bisection steps for the spread capacity, and its upper limit as a share of the span. */
export const SPREAD_STEPS = 14;
export const SPREAD_MAX_RATIO = 0.3;
/** Support movement smaller than this is ignored, metres. */
export const MOVE_EPS = 1e-5;
/** A hinge is reported as an open crack once the support movement passes this, metres. */
export const CRACK_MOVE = 0.01;

/* -- Water (SIM-SPEC 9) --------------------------------------------------------------------- */
/** Gumbel reduced variates: y(100) - y(2) and y(2). */
export const GUMBEL_SPAN = 4.2336;
export const GUMBEL_Y2 = 0.3665;
/** The annual uniform variate is mapped into (U_MIN, U_MAX). */
export const FLOOD_U_MIN = 0.001;
export const FLOOD_U_MAX = 0.999;
/** Afflux loss coefficient of blunt piers, with cutwaters, and added per unit of debris. */
export const AFFLUX_K = 1.4;
export const AFFLUX_K_CUTWATER = 1.2;
export const AFFLUX_K_DEBRIS = 0.3;
/** Broad-crested weir coefficient for flow over the deck (SI). */
export const WEIR_COEFF = 1.7;
/** HEC-18 (CSU) pier scour factors: nose shape blunt / with cutwaters / round, bed condition, cap in pier widths. */
export const SCOUR_K1_BLUNT = 1.1;
export const SCOUR_K1_CUTWATER = 0.9;
export const SCOUR_K1_ROUND = 1.0;
export const SCOUR_K3 = 1.1;
export const SCOUR_CAP = 2.4;
/** Debris widens the pier the flow sees: a = w (1 + this * debris). */
export const SCOUR_DEBRIS_WIDTH = 0.5;
/** Timber piles add this much effective foundation depth against undermining, metres. */
export const PILES_DEPTH = 3;
/** Undermining ratio above which a pier settles, and the settlement at ratio 1 as a share of its width. */
export const UNDERMINE_SETTLE_FROM = 0.6;
export const UNDERMINE_SETTLE_SHARE = 0.05;
/** Drag coefficient of the masonry face in a flood (square-ended, AASHTO-style). */
export const WASH_CD = 1.4;
/** Mortar bond of the springing joints against being swept off, kPa. */
export const WASH_BOND = 20;
/** Joint loss at which that bond has faded to nothing, as a share of the ring thickness. */
export const WASH_BOND_FADE = 0.5;
/** Joint depth a flood washes out of every joint it wets, metres per flood (times the wetted share). */
export const FLOOD_MORTAR_LOSS = 0.0015;
/** Floods below this return period are not processed for scour (years). */
export const FLOOD_PROCESS_T = 2;
/** Floods at or above this return period are reported as events (years). */
export const FLOOD_REPORT_T = 10;
/** Flood drama: 0 at this return period, 1 at DRAMA_T1 (log scale). */
export const FLOOD_DRAMA_T0 = 5;
export const FLOOD_DRAMA_T1 = 100;
/** Floods at or above this return period are listed by upcoming() (years). */
export const FLOOD_UPCOMING_T = 25;
/** Buoyant gsf is rechecked for floods at or above this return period (years). */
export const FLOOD_CHECK_T = 5;
/** Samples of the stage tables (natural channel and bridge rating). */
export const STAGE_SAMPLES = 160;
/** Samples per span opening when integrating open area. */
export const OPENING_SAMPLES = 24;

/* -- Time (SIM-SPEC 10) --------------------------------------------------------------------- */
/** Weathering multipliers: frost, wetness, plant growth. */
export const WEATHER_FROST = 2;
export const WEATHER_WET = 0.5;
export const WEATHER_GROWTH = 0.6;
/** Years for plants to take full hold of unrepaired joints. */
export const GROWTH_YEARS = 150;
/** Years for moss (in a fully wet climate) and patina to reach 1. */
export const MOSS_YEARS = 120;
export const PATINA_YEARS = 400;
/** Time constant of abutment yielding, years, and the factor piles apply to it. */
export const YIELD_TAU = 60;
export const YIELD_PILES = 0.3;
/** Share of the peak ground acceleration that acts as a sustained demand. */
export const QUAKE_EFFECTIVE = 0.6;
/** Earthquake damage: starts at this demand/capacity, opens the span by QUAKE_SPREAD * s at ratio 1. */
export const QUAKE_DAMAGE_FROM = 0.5;
export const QUAKE_SPREAD = 0.004;
/** Joint depth shaken loose at demand = capacity, metres. */
export const QUAKE_JOINT_LOSS = 0.02;
/** Overload damage: starts at this load/capacity, opens the span by LOAD_SPREAD * s at ratio 1. */
export const LOAD_DAMAGE_FROM = 0.6;
export const LOAD_SPREAD = 0.002;
/** Yielding ground counts as what wore a bridge down once it has parted a span by this share of its length. */
export const WEAR_SPREAD = 0.002;
/** Structural checks run every this many years while the bridge is sound... */
export const CHECK_EVERY = 10;
/**
 * ...and every year once the part of the service safety that wears by the year (the rings, the
 * traffic margin) is under this: near the end a worn ring loses its margin fast.
 */
export const WATCH_SAFETY = 1.6;
/**
 * The service safety looks this many years ahead: the rings and the axle capacity are measured
 * with the joint loss they will have by then at the rate they are losing it. A worn ring's axle
 * capacity can fall from 1.25 to 1 times the cart in under a decade, so a gauge that read the
 * present alone could not keep the warning's promise of fifteen years.
 */
export const FORESIGHT = 15;
/**
 * The ordinary traffic the service safety measures against: the heaviest axle of the eras that
 * begin within this many years. With checks ten years apart it warns of a heavier era at least
 * fifteen years before it comes.
 */
export const TRAFFIC_LOOKAHEAD = 25;
/** The warning event fires when safety first drops under this since the last repair. */
export const WARNING_SAFETY = 1.25;
/** Named hazards have at least this much drama. */
export const NAMED_DRAMA = 0.7;
/** Repair: joint loss left, protection added per repair and its cap (in pier widths). */
export const REPAIR_LOSS_LEFT = 0.1;
export const REPAIR_PROTECTION = 0.5;
export const REPAIR_PROTECTION_CAP = 2;
/**
 * Repair cost follows the work done. Repointing a face to depth r disturbs the share r /
 * BLOCK_DEPTH of every dressed stone in it (the ring and the spandrel walls of each span); of
 * those, this share is cut new. Tuned so that repairing three or four times in nine centuries
 * costs 2 to 5 % of a small bridge a time and 1 to 3 % of a wide one, whose piers and fill carry
 * no joints to repoint (docs/BALANCE.md). Cost is linear in the depth restored, so how often a
 * player repairs hardly changes what the centuries cost; letting plants grow in does.
 */
export const REPAIR_JOINT_STONES = 0.1;
/** Riprap at a pier foot, stones for a full step of protection (REPAIR_PROTECTION pier widths). */
export const REPAIR_RIPRAP_STONES = 10;
/** No repair, however small, takes fewer stones than this. */
export const REPAIR_MIN_STONES = 4;
/** A repair is worth offering once the joints have lost this much, metres. */
export const REPAIR_MIN_LOSS = 0.002;
