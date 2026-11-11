# Kemer simulation specification

The simulation (`src/sim`) decides the fate of every bridge. It is pure TypeScript: no DOM, no three.js, no `Math.random`, no dates. The same level and design must give bit-identical results on every run and every machine, so use only `+ - * /`, `Math.sqrt`, `Math.abs`, `Math.min/max`, `Math.floor/ceil/round` in anything that feeds a decision, and keep `Math.sin/cos/atan2/exp/log/pow` to geometry construction and smooth laws whose last-bit differences cannot flip an outcome on their own (decisions compare against thresholds with a tolerance, see 12). Types and the public interface are in `src/core/types.ts` and `src/core/contracts.ts` (`SimApi`, `ChronicleRun`). Every tunable number lives in one file, `src/sim/tuning.ts`, with a comment saying what it does and where it comes from.

Units: metres, kN per metre of bridge width, kPa, kN/m3, m3/s. Elevation frame: x along the bridge, y up, y = 0 at normal water level.

## 1. Arch shape

A span has clear span `s` between springing points `(xL, ys)` and `(xR, ys)`, rise `f`, fullness `q` in 0..1 and ring thickness `t`. Each half of the intrados is one circular arc from the springing to the crown `(xc, ys + f)`.

For the left half: chord from springing to crown has length `c = sqrt(s²/4 + f²)` and angle `phi = atan2(f, s/2)`. With `beta` the half central angle of the arc, the tangent is at `phi + beta` at the springing and `phi - beta` at the crown.

- `betaMax = min(phi, 90° - phi)`: at `phi` the crown is smooth (a circular segment, possible when `f <= s/2`); at `90° - phi` the springing tangent is vertical (the classic pointed arch, when `f >= s/2`).
- `betaMin = 4°` (nearly straight sides).
- `beta = betaMin + q (betaMax - betaMin)`.
- Radius `r = c / (2 sin beta)`; centre = chord midpoint + `r cos beta` along the inward normal of the chord (`(sin phi, -cos phi)` for the left half). The right half is the mirror image.

Check: `s = 2, f = 1, q = 1` gives a semicircle of radius 1 centred on the springing line.

The extrados is the same pair of arcs with radius `r + t`. At a pointed crown the two extrados arcs meet above the crown on the centre line.

Voussoirs: `N` courses, `N` odd, `N = clamp(odd(arcLength / courseWidth), 9, 121)` with `courseWidth = clamp(0.35 + 0.15 t, 0.40, 0.80)`. Joints are radial to their own arc. The keystone is the middle course and straddles the crown (for a pointed arch its outline has six corners: two joint ends each side plus the intrados and extrados apexes). `joints[i]` is the left face of `voussoirs[i]`; `joints[N]` is the right springing. Outlines are counter-clockwise polylines with curved edges subdivided so the chord error is under 5 mm.

## 2. The rest of the bridge

- Supports, left to right: left abutment at `site.left`, piers at `design.piers[i].x`, right abutment at `site.right`. Span `i` springs from the right face of support `i` to the left face of support `i+1`, all at `design.springLevel`.
- Piers: rectangles of width `w` from `base = bed - foundation` to `top = springLevel`, where `bed` is the ground elevation at the pier axis. Footing 0.3 m wider each side for bearing checks. `cutwater` copies `design.cutwaters`. Soil from `site.soils` at the pier axis (rock if none).
- Deck: let `top_i` be the highest point of span `i`'s extrados plus `design.cover`. The deck is the upper convex hull of the points `(left - a, roadLeft)`, `(xc_i, top_i)` for every span, `(right + a, roadRight)` with `a = max(2, 0.12 (right - left))`. Any hull segment steeper than `site.maxGrade` raises `deck-too-steep`.
- Fill: everything between the extrados (and pier tops) and the deck. Its effective unit weight per metre of width blends two 0.5 m spandrel walls of stone with rubble fill at 18 kN/m3. Parapets (0.3 m x 0.9 m each side) and 0.2 m of paving are a uniform load on the deck.
- Relief openings (`design.reliefs`): one over each pier where the spandrel is at least 1.5 m tall at the pier axis: width `min(0.6 w + 0.5, 3)`, height up to 1.5 times its width leaving 0.6 m under the deck, sill 0.4 m above the pier top. They remove fill weight, open flow area and reduce the face a flood pushes on.
- Stone count: dressed stone only, by volume over the stone's block volume (`blockLength x blockHeight x 0.5`): the ring (elevation area x width), two spandrel faces (area x 0.5 m), the dressed shell of each pier (perimeter x height x 0.5 m), parapets, and extras: cutwaters, relief rings, abutment walls where the bank is lower than the springing, piles as 8 % of pier stones, clamps as 5 % of ring stones. Rubble fill is free. Round each part to an integer.

`normalize` clamps every value to `level.limits` and the site, sorts piers, enforces `minSpan`, keeps `spans.length === piers.length + 1` (new spans copy their neighbour), and copies span 0 over the others when `linked`. `validate` reports what is still wrong.

## 3. Statics of one span

Blocks `1..N` left to right, joints `0..N`. Unknowns: the force `(Rx, Ry)` the left support puts on block 1 and its moment `m0` about the origin. With `F_j` the sum of all loads on blocks `1..j` and `G_j` the sum of their moments about the origin, the force the left part puts on the right part across joint `j` is

    Q_j = (Rx, Ry) + F_j        with moment about the origin   mu_j = m0 + G_j.

At joint `j` with intrados end `A`, extrados end `B`, depth `d = |B - A|`, `e = (B - A)/d`, `n = (e.y, -e.x)` (pointing from the left part to the right part) and centre `C`:

    N = Q·n (compression positive)     V = Q·e     M = mu - (C.x Q.y - C.y Q.x)

The thrust crosses the joint at `C + eps e` with `eps = -M/N`. Everything is affine in `(Rx, Ry, m0)` and in any load multiplier.

Constraints per joint (all linear):

- No tension, with a shrink factor `alpha`: `|M| <= alpha (d/2) N`.
- Friction: `|V| <= mu N`.
- Crushing with masonry strength `sigma`: `|M| <= (d/2) (alpha N - N²/(sigma d))`, linearised by tangents at `N = u sigma d` for `u = 0.05, 0.15, 0.30`: `|M| <= (d/2) ((alpha - 2u) N + u² sigma d)`.

Weathered joints lose contact depth from the intrados side: move `A` towards `B` by the span's `jointLoss` before forming the constraints. Iron clamps (`design.clamps`) apply to transient loads only (live load, earthquake): multiply `alpha` by 1.35 and `mu` by 1.5.

Loads on a block:

- Its own weight at its centroid.
- The fill, parapet and paving vertically above its extrados edge, at that strip's centroid.
- Live load: an axle `P` (kN, whole width) acts on `B_eff = min(width, 2.5 + fill depth)` and spreads along the bridge over `0.3 + fill depth`; share it between the voussoirs under that length by overlap.
- Earthquake: a horizontal force `a` times every weight above, at the same points, in the direction being checked (check both).
- Flood: parts below the water lose 9.81 kN/m3 (buoyancy).

## 4. The small LP solver

Every question is `maximise c·x subject to A x <= b` with `x` free and at most about 40 variables (3 per span plus a multiplier) and a few thousand rows. Solve its dual (`min b·y, Aᵀy = c, y >= 0`) with a dense two-phase simplex using Bland's rule, or any method you can make robust: the problems are highly degenerate. Scale forces by the bridge's total weight and lengths by the span so coefficients are O(1). Return status (`optimal`, `infeasible`, `unbounded`), `x`, and the indices of the active rows. Property-test it against brute-force vertex enumeration on random small problems, including degenerate and infeasible ones.

## 5. Questions asked of a span (supports fixed)

- **Geometric factor of safety.** Bisect on `alpha` (range 0.02..4, 22 steps) for the smallest value at which the dead-load problem is feasible. `gsf = 1/alpha_min`. The thrust line reported to the player is the solution at `alpha_min` (one point per joint, `C + eps e`); the hinges are the joints whose no-tension row is active there, on the side the line touches. When `gsf < 1` the line leaves the stone at those joints.
- **Thrust.** Minimise and maximise `Rx` at `alpha = 1`: the arch pushes with the minimum on supports that give way.
- **Crushing use.** At the minimum-thrust solution, `max_j N_j / (sigma d_j (1 - 2|eps_j|/d_j))`, capped for display.
- **Axle capacity.** For 9 positions across each span, maximise the multiplier on a unit axle with dead load fixed; the capacity is the smallest. Keep the active rows of the worst case: they are the four hinges of the collapse mechanism.
- **Earthquake capacity.** Maximise the multiplier on horizontal inertia, both directions.

## 6. The whole bridge (piers)

One LP over all spans. A pier receives `Q_N` and `mu_N` of the span on its left, minus `(Rx, Ry, m0)` of the span on its right, plus its own weight (buoyant under water), the fill and deck over it, and inertia in an earthquake. At its base joint (horizontal, footing width `wb`): `N >= 0`, sliding `|V| <= mu_soil N`, and bearing with the soil's ultimate pressure `q` (piles: 2.5 q): `|M| <= (N/2)(wb - N/q)`, linearised like crushing. Abutments are rigid in the LP; their slow yielding is a support movement (section 8).

- `Insight.piers[i].stability`: the largest factor by which the pier's base width could shrink with the dead-load problem still feasible (bisect), capped at 5.
- If the whole-bridge problem is infeasible but each ring alone is fine, a pier is the weak part.
- Progressive collapse: when a span falls, remove it and re-solve. A pier left with thrust from one side only usually overturns and takes the next span with it; continue until the remainder stands. Report every span with a delay (0.6 s per step outward) and the piers that went.

`Insight.safety` is the minimum of all span `gsf` and pier `stability` values.

## 7. Striking the centering

`strike` runs the dead-load checks. If anything is below 1, the bridge falls now (cause `strike`, or `crushing` when only the crushing rows fail) with the mechanism from the failing LP. Otherwise each crown settles as the joints close:

    settle_i = jointClose * N_joints * (sigma_mean / sigmaRef)^0.5 * (s / (4 f))

with `sigma_mean` the mean normal stress on the joints at minimum thrust, tuned so a 7 m village arch settles about one centimetre and a large flat arch several.

## 8. Arches on moving supports

Supports move: abutments on soft ground yield outward under thrust, scoured piers settle, earthquakes and overloads leave permanent openings. A span sees the movement of its right support relative to its left: `u` apart, `v` down. The whole span also translates with its left support.

For given `(u, v)` and a hinge set `H = (j1, side1), (j2, side2), (j3, side3)` (joints left to right, each hinging about its intrados or extrados end), the deformed shape is exact rigid-body kinematics from the as-built shape: stones left of `j1` stay with the left support; stones right of `j3` move with the right support; the two groups between rotate about the hinge points so the three hinge points stay shared. Find the middle hinge point by intersecting two circles (centres at the outer hinge points, radii their as-built distances to the middle one), taking the solution continuous with the as-built position. No intersection means snap-through: collapse.

The hinge set must be consistent: solve `minimise Q_N · (du, dv)` (the work the arch does on the moving support, for the direction of the latest movement) on the deformed geometry; the three active no-tension rows are the hinges the arch wants. Iterate: start from the as-built minimum-thrust hinges, deform, solve, and if the active set differs, adopt it and deform again from the as-built shape (at most 6 rounds; keep the last). If the LP is infeasible at any round the span collapses (cause from whatever moved it).

Over a run a cracked ring keeps its cracks: each check starts the iteration from the hinge set the span had open at the last one. If the iteration would carry the ring onto hinges it cannot stand on while the present set still gives a shape with a thrust line inside it (`gsf >= 1`), the present set is kept (the safe theorem). Only when neither works does it start again from the as-built hinges. Otherwise the set could jump between two checks a year apart, and a ring at 1.3 snapped through with nothing in between.

Outputs per span: `shifts` for every voussoir, the open `hinges`, and `gsf` measured on the deformed geometry. `Capacities.spread` is the outward movement at which the weakest span collapses (bisect on `u` with `v = 0`).

## 9. Water

- **Natural stage and discharge.** For stage `h`, flow area `A(h)` and wetted perimeter `P(h)` come from `site.ground`; Manning gives `Q = A (A/P)^(2/3) sqrt(slope) / n` and `Vn = Q/A`.
- **Annual floods.** A Gumbel law for the annual peak stage fitted to `stage2` and `stage100`: `beta = (stage100 - stage2)/4.2336`, `mu = stage2 - 0.3665 beta`, `stage(year) = mu - beta ln(-ln U)` with `U` a hash of `(site.seed, year)` mapped into (0.001, 0.999). A named flood in `level.hazards` replaces that year's stage. From `regulatedFrom` on, the excess over `stage2` is multiplied by `regulatedFactor`. `floodStage(T) = mu - beta ln(-ln(1 - 1/T))`.
- **At the bridge.** Open area `Aopen(h)`: between the abutment faces only, under the intrados, above the bed, minus piers, plus relief openings the water reaches. `Vb = Q / Aopen(hn)`. Afflux `dh = max(0, kL Vb²/(2g) - Vn²/(2g))` with `kL = 1.4`, 1.2 with cutwaters, plus 0.3 x debris. Upstream level `hu = hn + dh`. If `hu` passes the parapet top, part of the flow goes over the bridge as a weir (`1.7 L (hu - deck)^1.5`): bisect on `hu` so orifice plus weir flow equals `Q`.
- **Pier scour** (HEC-18, CSU): `ys = 2.0 K1 K3 (a/y1)^0.65 Fr^0.43 y1`, `Fr = Vb / sqrt(g y1)`, `y1 = hn - bed`, `a = w (1 + 0.5 debris)`, `K1 = 1.1` blunt or 0.9 with cutwaters, `K3 = 1.1`, capped at `2.4 a`, times the soil's scour factor. Check: `V = 3, y = 3, a = 3`, round nose (`K1 = 1`) gives 5.1 m. A pier's `scour` is the deepest so far. Undermining `ratio = (scour - protection) / (foundation + 3 if piles)`: above 1 the pier goes (cause `flood-scour`); above 0.6 it settles by `0.05 w (ratio - 0.6)/0.4`, which moves the supports of the spans beside it.
- **Wash-out.** For each span, the masonry face under water `Aface` (between intrados and parapet top, below `hu`, minus reliefs). Push `F = (0.5 Cd Vb² + 9.81 dh) Aface` with `Cd = 1.4`; hold `R = mu x buoyant weight of the span + bond x springing contact area` (bond 20 kPa, fading with joint loss, doubled by clamps). `R/F < 1`: the span is swept away (cause `flood-wash`).
- **Buoyant check.** Recompute `gsf` with submerged parts at buoyant weight; below 1 it falls (cause `flood-wash`).
- A flood also washes a little mortar out of every joint it wets.

## 10. Time

State advances year by year from `level.year`; structural checks run at every notable event, every tenth year, and every year while the rings or the traffic margin of the service safety (below) are under 1.6.

- **Weathering.** `jointLoss += stone.weathering (1 + 2 frost) (1 + 0.5 wet) (1 + 0.6 growth)` per year. `growth` (plants in the joints) rises from 0 to 1 over 150 unrepaired years; `moss` and `patina` are slower visual clocks driven by `wet` and age.
- **Abutment yielding** on soil: target `uInf = soil.yielding x minimum thrust` (x 0.3 with piles), approached as `1 - exp(-age/60)`.
- **Floods** every year (section 9); only those with a return period of 2 years or more are processed for scour, and only notable ones are reported.
- **Earthquakes** (named hazards): effective demand `0.6 pga` against the current capacity. Demand at or above capacity: collapse (cause `quake`). Above half: permanent opening `spread += 0.004 s (r - 0.5)/0.5` and some joint loss, `r = demand/capacity`.
- **Exceptional loads** (named hazards) and the era's ordinary axle (with every structural check): at or above capacity: collapse (cause `load`; `weathering`, `settlement` or `flood-scour` for an everyday axle the new bridge carried easily, since then the bridge failed, not the cart). Above 0.6 of it: `spread += 0.002 s (r - 0.6)/0.4`, for the ordinary axle once a decade.
- **Checks.** After any change run section 8 for affected spans and section 6 for the bridge. `gsf < 1` from wasted joints alone is cause `weathering`; from support movement `settlement` (or `flood-scour` when scour caused it).
- **Service safety.** During a run `safety` is the smallest margin against whatever will bring the bridge down next under ordinary conditions, looked at 15 years ahead, capped at 5:
  - every ring's `gsf` on its present (moved) shape with the joint loss it will have by then, at this year's weathering rate or the rate it has really lost since the last repair, whichever is faster (floods and earthquakes loosen joints too);
  - every pier's stability as it is;
  - the axle capacity with those joints against the heaviest ordinary axle of the eras running now or beginning within 25 years;
  - every pier foot's foundation depth (plus 3 with piles) over its open scour, the scour being the deepest so far or what a 25-year flood digs, whichever is deeper, less protection.

  `weakness` names the part that governs while `safety < 1.6`: `joints` (a ring on its own wasted joints), `traffic`, `scour` (a scoured foundation, or a span on a pier that sank), `ground` (banks that yielded, a pier that gives); `none` above. Sudden causes are not foreseen: floods of 25-year return period or more, earthquakes, exceptional loads.
- **Events.** Emit `flood`, `quake`, `load` with a `drama` 0..1 (named hazards at least 0.7; floods by return period: 0 at 5 years, 1 at 100), `crack` when a hinge first opens, `era` when traffic changes, `century` at each round century, `warning` the first time `safety` is under 1.25 since the last repair (looked at when a year begins and when it ends), `collapse`, `end`. For the slow causes (weathering, everyday traffic on worn joints, settlement, creeping scour) the warning comes at least 15 years before the fall, or in the bridge's first year if it trembles from the start; `src/content/warning.test.ts` holds every river to it.
- **Repair.** Joint loss x 0.1, growth to 0, each pier's `protection += 0.5 w` (up to `2 w`). It cannot undo movement. Cost follows the work done: `max(4, ceil(0.1 sum_i J_i min(1, 0.9 loss_i / 0.5) + 10 sum_q added_q / (0.5 w_q)))`, with `J_i` the dressed stones of span `i` that carry joints (its ring and its two spandrel walls, blocks of length x height x 0.5 m) and `added_q` the protection the repair adds at pier `q`.
- **Summary.** `passed` when the bridge stood `level.passYears`. Seals: `standing` (alive at the end year), `lean` (standing and build stones + repair stones <= `parStones`), `unrepaired` (alive after the greatest flood with no repair before it). `masterwork` is all three.

`upcoming()` lists named hazards and floods of 25-year return period or more, never their outcome. `advance()` may be called with tiny steps every frame: keep per-call work proportional to the years actually crossed and cache whatever does not change.

## 11. Benchmarks the tests must hit

All for circular rings of constant thickness under their own weight only, `R` the centre-line radius, about 80 radial-jointed courses:

| Case | Expected | Tolerance |
| --- | --- | --- |
| Semicircle, minimum `t/R` | 0.1075, intrados hinges 54.5° from the crown | ±0.003, ±3° |
| Half-angle 60°, 70°, 80°, minimum `t/R` | 0.0228, 0.0413, 0.0687 | ±5 % |
| Tilt, half-angle 65°, `t/R = 0.09` | collapse at 0.38 g | ±0.04 g |
| Tilt, half-angle 72.5°, `t/R = 0.108` (table 6.1 read as half-angle = alphaMax - gamma) | about 0.32 g | ±0.05 g |
| Spreading supports, half-angle 60°, `t/R = 0.10` | falls at a span increase of about 8 % | 5..11 % |
| HEC-18 example above | 5.1 m | ±0.1 m |

Sources: Milankovitch 1907; Ochsendorf, *Collapse of Masonry Structures* (Cambridge PhD, 2002), tables 5.2 and 6.1; FHWA HEC-18. See `docs/research/notes.md`.

Also test: determinism (two runs deep-equal, any call order); a thicker ring never lowers `gsf` for a ring under its own weight, and on a filled bridge never where the gauge decides anything (below 2, or from standing to falling), while far above 1 `gsf` may dip with thickness, never more than a tenth under the best it has shown (a thicker ring is heavier and lifts the road, so the loads change), and saturates at 5 (`GSF_CAP`); more joint loss never raises it; a higher flood never lowers level, velocity or scour; `normalize` is idempotent and its output validates clean; a run's `advance` in one step equals the same run advanced in a thousand small steps.

## 12. Robustness

- Never throw from the public API. Bad numbers (NaN, negative sizes) are clamped by `normalize`; an LP that fails to converge counts as infeasible and is logged once.
- Compare with tolerances: feasibility `1e-7` on scaled rows; a decision threshold counts as crossed only beyond `1e-6` relative.
- `insight` runs on every pointer move: no allocation-heavy work per joint, reuse typed arrays, and cache geometry by design value.
