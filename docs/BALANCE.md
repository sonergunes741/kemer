# Kemer: balance

Kept by the content module. The numbers come from `npm run balance` (scripts/balance.ts) run against the real simulation on 11 November 2026, after src/sim had gone quiet. The recorded facts are checked by `src/content/balance.test.ts` (each starter's fate, a passing design, a masterwork design, the careful bridge the par is set from and the par band, for every river), so a change to the simulation that moves them fails a test before it reaches a player. When that happens: rerun the script, retune, and update this file and `src/content/tuning/facts.ts` together.

## How the search works

For each river the script searches the design space the level's tools open (rise, fullness, thickness, cover, springing, number and width of piers, foundation depth, and the four toggles), as a vector with evenly spaced piers whose two end spans can be stretched or shrunk. It samples seeded random designs (1500 on single-arch rivers, 600 where at most five piers fit, 220 on the wide rivers, whose runs take a quarter of a second each), keeps the three cheapest that meet a goal and refines each by greedy descent, one step of one parameter at a time. "Cheapest found" is therefore an upper bound: a player can beat it, more easily on the wide rivers. Every design is run through the centuries with one of three repair policies:

- **none**: left alone from the strike to 2026.
- **after**: repaired only after the river's greatest flood has passed, and then as under **warn**. This keeps the "unrepaired" seal, so it is, with **none**, the policy of a masterwork.
- **warn**: a careful player. Repaired whenever the şakül trembles (the service safety under 1.25, which the warning announces), at most every 20 years. The gauge looks fifteen years ahead (SIM-SPEC section 10), so for anything slow the tremble comes in time: a player who waits for it loses no bridge a more anxious one would keep, except to the sudden causes.

Stones are counted as the game counts them: the build plus every repair. The "standing in 2026" searches allow at most four repairs (a careful player, not one who mends every few decades; see "Repair economy"). Par is 15 % over the dearer of two bridges: the cheapest found standing in 2026 under any policy, and the cheapest found standing with no repair before the greatest flood. So both the lean seal with a few repairs and the masterwork are in reach on every river.

## The table

| # | River | Par | Starter (no repair) | Starter (repairs) | Cheapest pass | Cheapest 2026 (at most 4 repairs): none / after / warn | Cheapest careful | Cheapest unrepaired 2026 | Masterwork at par |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | koramaz | 501 | 1147 strike (195) | 1147 strike (195) | 194 | none / 436 / 270 | 270 | 436 | yes |
| 2 | zamanti | 730 | 1176 strike (624) | 1176 strike (624) | 447 | 843 / 635 / 502 | 502 | 635 | yes |
| 3 | kizilirmak | 1909 | 1451 weathering (1571) | stands (1751) | 1422 | 2101 / 1660 / 1660 | 1660 | 1660 | yes |
| 4 | yesilirmak | 6081 | 1388 flood-scour (4136) | 1388 flood-scour (4136) | 2909 | none / none / 5113 | 5113 | 5288 | yes |
| 5 | dicle | 17597 | 1563 flood-scour (19214) | stands (20239) | 13341 | 18792 / 15467 / 13597 | 13597 | 15302 | yes |
| 6 | batman | 3027 | 1338 flood-wash (4547) | 1338 flood-wash (4547) | 2211 | 2730 / 2632 / 2632 | 2632 | 2361 | yes |
| 7 | aras | 13568 | 1590 flood-wash (11474) | 1983 quake (12455) | 8117 | none / 12785 / 10669 | 10669 | 11798 | yes |
| 8 | arpacay | 4594 | 1513 flood-wash (4485) | 1988 quake (5308) | 2369 | 5939 / 3995 / 3712 | 3712 | 3995 | yes |
| 9 | firtina | 675 | 1401 flood-wash (1165) | 1401 flood-wash (1165) | 524 | 640 / 587 / 587 | 587 | 587 | yes |
| 10 | sakarya | 8026 | 1767 flood-scour (11430) | 1999 quake (11866) | 7252 | 8937 / 7668 / 6979 | 6979 | 6623 | yes |
| 11 | tunca | 13550 | 1621 flood-scour (17471) | 1752 quake (17563) | 10722 | 13905 / 12530 / 11782 | 11782 | 11783 | yes |
| 12 | ergene | 13912 | 1773 flood-wash (9509) | 1773 flood-wash (9793) | 7080 | 13760 / 12097 / 12097 | 12097 | 12097 | yes |
| 0 | millennium | 4997 | 1502 flood-scour (5230) | 1757 quake (5466) | 3268 | 4364 / 4369 / 3307 | 3307 | 4345 | yes |

"Starter (repairs)" is the starter under **warn**. "Cheapest careful" is the cheapest of the three 2026 columns. "Masterwork at par" says whether the cheapest bridge found standing with no repair before the greatest flood fits under par: yes on all twelve rivers and on Bin Yıl, by construction of the par. Bin Yıl's masterwork is new: a 1.15 m ring on one 2 m pier on piles stands from 1026 to 2026 without a repair for 4345 stones (par 4997). Before, a cracked ring could snap through after a small settlement it should have carried, and nothing found stood there unrepaired; the kept hinge sets of SIM-SPEC section 8 fixed that, which also moved Bin Yıl's starter from 1124 to 1502 and Sakarya's from 1512 to 1767.

## Against the goals (docs/LEVELS.md)

- **Each starter is a little wrong in its river's own way.** Koramaz: a ring of 0.20 m under a nearly round arch; the line of thrust leaves the stone and the arch folds when the centering is struck. Zamantı: a fair rise but straight haunches (fullness 0.2): the same 0.5 m ring falls at the strike, and stands once the curve is filled out. Kızılırmak: a small arch's proportions stretched to 27 m, thin and shallow; it passes and weathers away in 1451. Yeşilırmak and Dicle: piers on the bed, founded too shallow and (Dicle) without cutwaters; the named floods of 1388 and 1563 undermine them. Batman: springers 2 m above the water in a gorge that floods 10 m; the snowmelt of 1338 drowns it. Aras: piers and rings sized for floods, not for shaking; left alone a flood takes it in 1590, repaired it lasts until the Horasan earthquake of 1983. Arpaçay: tuff with springers low in the canyon; washed out in 1513, or, repaired, brought down by the Spitak earthquake of 1988. Fırtına: a low granite arch; an autumn flood takes it in 1401. Sakarya and Tunca: piers on sand with no piles. Tunca's great winter flood of 1621 undermines it; Sakarya's of 1512 settles its end spans 11 cm and cracks it (the warning comes that year), and scour and worn joints bring it down in 1767. Ergene: thirteen small arches on piles, too low for the marsh (waterway 17 %); the winter flood of 1773 washes them out.
- **A careful player passes on the first or second attempt.** Rivers 1 and 2 fail at the strike by design (the tutorial thickens the ring; the hint fills out the curve) and the second attempt passes. From river 3 on every starter passes as it is (it outlasts its builder's 30 years by 17 to 346 more), and the cheapest passing designs cost 45 to 90 % of the starter.
- **Standing in 2026 takes thought from river 3 on.** From Kızılırmak the cheapest bridge a careful player stands to 2026 with costs up to 1.8 times the cheapest that passes. Now that a repair costs the work it does, the thought is less in building bigger than in repairing when warned, and, on the rivers that dig, in the foundations, cutwaters and piles the starter lacks.
- **Par is 12 to 18 % above the cheapest bridge found standing in 2026.** Par is 15 % above the dearer of the cheapest careful bridge (at most four repairs) and the cheapest unrepaired one, on every river (tested). On seven rivers the careful bridge is the dearer, so par is 15 % above it. On Koramaz, Zamantı, Yeşilırmak, Dicle, Aras, Arpaçay and Bin Yıl the unrepaired bridge is the dearer, and the careful player gets more room: 19 to 29 % on the wide rivers, 45 % at Zamantı, 51 % at Bin Yıl and 86 % at Koramaz, where tuff must last 536 years unrepaired to the 1683 flood. This departs from LEVELS.md's 12 to 18 % on purpose: a tighter par would put the masterwork out of reach there.
- **The signature hazard brings weak bridges down.** Tuff weathering at Koramaz (and the 1683 flood for low arches); flood-wash at Zamantı, Batman, Fırtına and Ergene; scour at Yeşilırmak, Dicle, Sakarya and Tunca; earthquakes at Aras (1983) and Arpaçay (1988) once the floods are survived. One gap: Sakarya's clay banks yield 2 to 7 cm with piles and about 2 dm without, which cracks a flat arch but brings none down; there the sand bed's scour is what kills, and piles (the river's new tool) cure both.

## Each river

### 1. koramaz

- Greatest flood: 1683, stage 2.25 m.
- Starter: 1147 strike (195) without repairs; 1147 strike (195) repairing when the gauge trembles.
- Cheapest passing: 194 stones (none; 1271 weathering; 0 repairs): rise 0.250, full 1.0, t 0.20, cover 0.4, spring 0.80.
- Cheapest standing in 2026, no repairs: none found.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 436 stones (after; stands; 1 repair): rise 0.250, full 1.0, t 0.90, cover 0.4, spring 0.80.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 270 stones (warn; stands; 4 repairs): rise 0.275, full 1.0, t 0.35, cover 0.4, spring 0.80.
- Cheapest standing with no repair before the greatest flood: 436 stones (after; stands; 1 repair): rise 0.250, full 1.0, t 0.90, cover 0.4, spring 0.80.
- Thin ring: 1271 weathering (194). Low rise: 1223 flood-wash (230). Fewest piers: n/a.

### 2. zamanti

- Greatest flood: 1544, stage 3.90 m.
- Starter: 1176 strike (624) without repairs; 1176 strike (624) repairing when the gauge trembles.
- Cheapest passing: 447 stones (none; 1336 flood-wash; 0 repairs): rise 0.325, full 1.0, t 0.30, cover 0.5, spring 0.60.
- Cheapest standing in 2026, no repairs: 843 stones (none; stands; 0 repairs): rise 0.175, full 1.0, t 1.00, cover 0.5, spring 0.60.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 635 stones (after; stands; 2 repairs): rise 0.200, full 1.0, t 0.50, cover 0.5, spring 0.60.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 502 stones (warn; stands; 4 repairs): rise 0.250, full 1.0, t 0.30, cover 0.5, spring 0.60.
- Cheapest standing with no repair before the greatest flood: 635 stones (after; stands; 2 repairs): rise 0.200, full 1.0, t 0.50, cover 0.5, spring 0.60.
- Thin ring: 1336 flood-wash (447). Low rise: 1245 flood-wash (510). Fewest piers: n/a.

### 3. kizilirmak

- Greatest flood: 1462, stage 6.10 m.
- Starter: 1451 weathering (1571) without repairs; stands (1751) repairing when the gauge trembles.
- Cheapest passing: 1422 stones (none; 1378 weathering; 0 repairs): rise 0.250, full 1.0, t 0.50, cover 0.3, spring 1.00.
- Cheapest standing in 2026, no repairs: 2101 stones (none; stands; 0 repairs): rise 0.250, full 1.0, t 0.95, cover 0.6, spring 1.00.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 1660 stones (after; stands; 2 repairs): rise 0.250, full 1.0, t 0.50, cover 0.9, spring 1.00.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 1660 stones (warn; stands; 2 repairs): rise 0.250, full 1.0, t 0.50, cover 0.9, spring 1.00.
- Cheapest standing with no repair before the greatest flood: 1660 stones (after; stands; 2 repairs): rise 0.250, full 1.0, t 0.50, cover 0.9, spring 1.00.
- Thin ring: 1378 weathering (1422). Low rise: 1308 flood-wash (1731). Fewest piers: n/a.

### 4. yesilirmak

- Greatest flood: 1388, stage 5.60 m.
- Starter: 1388 flood-scour (4136) without repairs; 1388 flood-scour (4136) repairing when the gauge trembles.
- Cheapest passing: 2909 stones (none; 1388 flood-wash; 0 repairs): rise 0.175, full 1.0, t 0.40, cover 0.5, spring 1.00, piers 2x1.50 edge 1.0 fdn 1.50.
- Cheapest standing in 2026, no repairs: none found.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): none found.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 5113 stones (warn; stands; 1 repair): rise 0.225, full 1.0, t 1.10, cover 0.4, spring 1.00, piers 2x3.75 edge 0.8 fdn 1.50.
- Cheapest standing with no repair before the greatest flood: 5288 stones (after; stands; 1 repair): rise 0.300, full 1.0, t 1.25, cover 0.3, spring 1.00, piers 4x1.75 edge 1.0 fdn 1.50.
- Thin ring: 1388 flood-wash (2909). Low rise: 1250 strike (3254). Fewest piers: 1250 strike (2833).

### 5. dicle

- Greatest flood: 1563, stage 6.50 m.
- Starter: 1563 flood-scour (19214) without repairs; stands (20239) repairing when the gauge trembles.
- Cheapest passing: 13341 stones (none; 1389 flood-scour; 0 repairs): rise 0.100, full 0.5, t 0.45, cover 0.4, spring 1.00, piers 5x2.75 edge 0.7 fdn 4.75.
- Cheapest standing in 2026, no repairs: 18792 stones (none; stands; 0 repairs): rise 0.150, full 0.8, t 0.80, cover 0.5, spring 1.00, piers 8x2.00 edge 0.9 fdn 2.75, cutwaters.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 15467 stones (after; stands; 2 repairs): rise 0.125, full 0.7, t 0.55, cover 0.4, spring 1.00, piers 6x3.00 edge 0.8 fdn 4.50.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 13597 stones (warn; stands; 3 repairs): rise 0.150, full 1.0, t 0.40, cover 0.3, spring 1.00, piers 6x3.00 edge 0.9 fdn 4.25.
- Cheapest standing with no repair before the greatest flood: 15302 stones (after; stands; 2 repairs): rise 0.125, full 0.7, t 0.55, cover 0.4, spring 1.00, piers 6x3.00 edge 0.8 fdn 4.25.
- Thin ring: 1321 weathering (12965). Low rise: 1271 crushing (13354). Fewest piers: 1271 crushing (12631).

### 6. batman

- Greatest flood: 1338, stage 10.60 m.
- Starter: 1338 flood-wash (4547) without repairs; 1338 flood-wash (4547) repairing when the gauge trembles.
- Cheapest passing: 2211 stones (none; 1344 weathering; 0 repairs): rise 0.225, full 1.0, t 0.60, cover 0.3, spring 8.00, reliefs.
- Cheapest standing in 2026, no repairs: 2730 stones (none; stands; 0 repairs): rise 0.200, full 1.0, t 0.85, cover 0.5, spring 8.00, reliefs.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 2632 stones (after; stands; 4 repairs): rise 0.200, full 1.0, t 0.75, cover 0.4, spring 8.00, reliefs.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 2632 stones (warn; stands; 4 repairs): rise 0.200, full 1.0, t 0.75, cover 0.4, spring 8.00, reliefs.
- Cheapest standing with no repair before the greatest flood: 2361 stones (after; stands; 35 repairs): rise 0.225, full 1.0, t 0.60, cover 0.5, spring 8.00, reliefs.
- Thin ring: 1344 weathering (2211). Low rise: 1453 weathering (2293). Fewest piers: n/a.

### 7. aras

- Greatest flood: 1611, stage 5.10 m.
- Starter: 1590 flood-wash (11474) without repairs; 1983 quake (12455) repairing when the gauge trembles.
- Cheapest passing: 8117 stones (none; 1344 flood-scour; 0 repairs): rise 0.275, full 1.0, t 0.40, cover 0.4, spring 1.00, piers 4x3.00 edge 1.0 fdn 2.00.
- Cheapest standing in 2026, no repairs: none found.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 12785 stones (after; stands; 1 repair): rise 0.100, full 0.9, t 1.00, cover 0.6, spring 2.50, piers 3x3.75 edge 1.0 fdn 2.50, cutwaters.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 10669 stones (warn; stands; 2 repairs): rise 0.100, full 1.0, t 0.95, cover 0.6, spring 2.50, piers 3x3.75 edge 1.0 fdn 1.00.
- Cheapest standing with no repair before the greatest flood: 11798 stones (after; stands; 1 repair): rise 0.100, full 1.0, t 1.00, cover 0.3, spring 2.30, piers 3x3.25 edge 1.0 fdn 2.00, cutwaters.
- Thin ring: 1344 flood-scour (8117). Low rise: 1303 flood-wash (7875). Fewest piers: n/a.

### 8. arpacay

- Greatest flood: 1603, stage 8.00 m.
- Starter: 1513 flood-wash (4485) without repairs; 1988 quake (5308) repairing when the gauge trembles.
- Cheapest passing: 2369 stones (none; 1405 weathering; 0 repairs): rise 0.300, full 1.0, t 0.60, cover 0.7, spring 8.00.
- Cheapest standing in 2026, no repairs: 5939 stones (none; stands; 0 repairs): rise 0.175, full 0.9, t 2.45, cover 0.9, spring 8.00, reliefs.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 3995 stones (after; stands; 2 repairs): rise 0.275, full 1.0, t 1.05, cover 0.8, spring 8.00, reliefs, clamps.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 3712 stones (warn; stands; 4 repairs): rise 0.275, full 1.0, t 0.90, cover 0.8, spring 8.00, reliefs, clamps.
- Cheapest standing with no repair before the greatest flood: 3995 stones (after; stands; 2 repairs): rise 0.275, full 1.0, t 1.05, cover 0.8, spring 8.00, reliefs, clamps.
- Thin ring: 1405 weathering (2369). Low rise: 1325 crushing (3035). Fewest piers: n/a.

### 9. firtina

- Greatest flood: 1491, stage 8.50 m.
- Starter: 1401 flood-wash (1165) without repairs; 1401 flood-wash (1165) repairing when the gauge trembles.
- Cheapest passing: 524 stones (none; 1440 flood-wash; 0 repairs): rise 0.150, full 1.0, t 0.35, cover 0.3, spring 4.50, reliefs.
- Cheapest standing in 2026, no repairs: 640 stones (none; stands; 0 repairs): rise 0.300, full 0.9, t 0.45, cover 0.4, spring 4.50, reliefs, clamps.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 587 stones (after; stands; 0 repairs): rise 0.300, full 0.9, t 0.40, cover 0.3, spring 4.50, reliefs.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 587 stones (warn; stands; 0 repairs): rise 0.300, full 0.9, t 0.40, cover 0.3, spring 4.50, reliefs.
- Cheapest standing with no repair before the greatest flood: 587 stones (after; stands; 0 repairs): rise 0.300, full 0.9, t 0.40, cover 0.3, spring 4.50, reliefs.
- Thin ring: 1440 flood-wash (524). Low rise: 1440 flood-wash (530). Fewest piers: n/a.

### 10. sakarya

- Greatest flood: 1512, stage 5.80 m.
- Starter: 1767 flood-scour (11430) without repairs; 1999 quake (11866) repairing when the gauge trembles.
- Cheapest passing: 7252 stones (none; 1441 flood-scour; 0 repairs): rise 0.100, full 0.9, t 0.45, cover 0.3, spring 0.75, piers 3x5.00 edge 1.0 fdn 3.50, piles.
- Cheapest standing in 2026, no repairs: 8937 stones (none; stands; 0 repairs): rise 0.100, full 0.9, t 0.75, cover 0.4, spring 2.00, piers 4x3.25 edge 1.0 fdn 1.75, piles.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 7668 stones (after; stands; 3 repairs): rise 0.100, full 0.9, t 0.50, cover 0.3, spring 2.00, piers 4x3.25 edge 0.9 fdn 1.50, piles.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 6979 stones (warn; stands; 4 repairs): rise 0.100, full 1.0, t 0.45, cover 0.3, spring 1.50, piers 4x2.50 edge 0.9 fdn 1.00, piles.
- Cheapest standing with no repair before the greatest flood: 6623 stones (after; stands; 21 repairs): rise 0.100, full 1.0, t 0.40, cover 0.3, spring 1.50, piers 4x2.00 edge 0.9 fdn 1.00, piles.
- Thin ring: 1418 flood-scour (6990). Low rise: 1424 flood-scour (7497). Fewest piers: 1391 crushing (6906).

### 11. tunca

- Greatest flood: 1621, stage 4.50 m.
- Starter: 1621 flood-scour (17471) without repairs; 1752 quake (17563) repairing when the gauge trembles.
- Cheapest passing: 10722 stones (none; 1470 settlement; 0 repairs): rise 0.150, full 0.6, t 0.40, cover 0.4, spring 0.50, piers 9x2.50 edge 0.9 fdn 1.50, piles.
- Cheapest standing in 2026, no repairs: 13905 stones (none; stands; 0 repairs): rise 0.100, full 0.8, t 0.70, cover 0.4, spring 2.00, piers 7x3.25 edge 1.0 fdn 1.75, piles.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 12530 stones (after; stands; 3 repairs): rise 0.125, full 0.7, t 0.50, cover 0.4, spring 0.50, piers 9x2.25 edge 0.9 fdn 1.75, piles.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 11782 stones (warn; stands; 3 repairs): rise 0.125, full 0.7, t 0.50, cover 0.3, spring 0.75, piers 9x2.00 edge 0.9 fdn 1.00, piles.
- Cheapest standing with no repair before the greatest flood: 11783 stones (after; stands; 3 repairs): rise 0.125, full 0.7, t 0.50, cover 0.3, spring 0.75, piers 9x2.00 edge 0.9 fdn 1.00, piles.
- Thin ring: 1470 settlement (10722). Low rise: 1509 quake (10708). Fewest piers: 1420 strike (11279).

### 12. ergene

- Greatest flood: 1773, stage 3.50 m.
- Starter: 1773 flood-wash (9509) without repairs; 1773 flood-wash (9793) repairing when the gauge trembles.
- Cheapest passing: 7080 stones (none; 1563 flood-wash; 0 repairs): rise 0.390, full 1.0, t 0.30, cover 0.5, spring 0.80, piers 12x2.00 edge 1.0 fdn 1.00, piles.
- Cheapest standing in 2026, no repairs: 13760 stones (none; stands; 0 repairs): rise 0.375, full 0.9, t 0.75, cover 0.4, spring 1.05, piers 12x2.25 edge 0.8 fdn 3.00, reliefs, clamps, piles.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 12097 stones (after; stands; 0 repairs): rise 0.375, full 0.9, t 0.75, cover 0.3, spring 0.80, piers 12x2.25 edge 0.9 fdn 1.75, reliefs, clamps, piles.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 12097 stones (warn; stands; 0 repairs): rise 0.375, full 0.9, t 0.75, cover 0.3, spring 0.80, piers 12x2.25 edge 0.9 fdn 1.75, reliefs, clamps, piles.
- Cheapest standing with no repair before the greatest flood: 12097 stones (after; stands; 0 repairs): rise 0.375, full 0.9, t 0.75, cover 0.3, spring 0.80, piers 12x2.25 edge 0.9 fdn 1.75, reliefs, clamps, piles.
- Thin ring: 1563 flood-wash (7080). Low rise: 1474 flood-wash (7227). Fewest piers: 1563 flood-wash (7080).

### 0. millennium

- Greatest flood: 1931, stage 5.60 m.
- Starter: 1502 flood-scour (5230) without repairs; 1757 quake (5466) repairing when the gauge trembles.
- Cheapest passing: 3268 stones (none; 1056 settlement; 0 repairs): rise 0.100, full 0.0, t 0.60, cover 0.5, spring 3.75, piers 1x2.75 edge 0.7 fdn 1.25, piles.
- Cheapest standing in 2026, no repairs: 4364 stones (none; stands; 0 repairs): rise 0.100, full 0.8, t 1.10, cover 0.3, spring 3.50, piers 1x3.25 edge 1.0 fdn 1.50, piles.
- Cheapest standing in 2026, repairs after the greatest flood (at most 4): 4369 stones (after; stands; 0 repairs): rise 0.100, full 1.0, t 1.15, cover 0.3, spring 3.00, piers 1x2.75 edge 1.0 fdn 1.00, piles.
- Cheapest standing in 2026, repairs when the gauge trembles (at most 4): 3307 stones (warn; stands; 1 repair): rise 0.100, full 1.0, t 0.90, cover 0.3, spring 4.00, piles.
- Cheapest standing with no repair before the greatest flood: 4345 stones (after; stands; 0 repairs): rise 0.100, full 1.0, t 1.15, cover 0.3, spring 3.00, piers 1x2.00 edge 1.0 fdn 1.00, piles.
- Thin ring: 1026 strike (2782). Low rise: 1026 crushing (3362). Fewest piers: 1026 strike (2587).

## Changed simulation values

Values only, in `src/sim/materials.ts`; `npx vitest run src/sim` passes after them.

| Value | Old | New | Why |
| --- | --- | --- | --- |
| `STONES.tuff.weathering` | 0.0005 | 0.00045 | At 0.0005 a well-built village arch of tuff (Koramaz, ring 0.45 to 0.5 m) lasted about 240 to 290 years unrepaired; now about 270 to 330, the three to four centuries asked for. 0.0004 would come closer but makes the simulation's own fixture A fall to a flood instead of to weathering (chronicle.test.ts), so the change stops here. |
| `SOILS.sand.bearing` | 300 kPa | 650 kPa | At 300 kPa no basalt pier could stand on sand at all (Dicle's, 3 m wide, was at stability 0.72 when the centering was struck, 5 m wide at 0.84), so Dicle, Sakarya and Tunca could only fail at the strike. 650 kPa is a modest ultimate bearing pressure for medium-dense sand under a footing 2 to 3 m down; narrow piers on sand still fail. No simulation fixture stands on sand. |

And in `src/sim/tuning.ts`, for the repair economy below:

| Value | Old | New | Why |
| --- | --- | --- | --- |
| Repair cost | A flat share of the whole bridge (`REPAIR_BASE_SHARE` 0.04, `REPAIR_LOSS_SHARE` 0.5, `REPAIR_PIER_STONES` 12) | The work done (`REPAIR_JOINT_STONES` 0.1, `REPAIR_RIPRAP_STONES` 10, `REPAIR_MIN_STONES` 4) | A flat share charged a wide bridge thousands of stones for repointing one span, so on the rivers with piers a careful player could not repair and keep the lean seal (Yeşilırmak's starter, repaired when it trembled, cost 9368 stones against 4136 built). |

Checked and left alone: clay abutments yield 2 to 7 cm with piles and about 2 dm without (Sakarya), and sound filled bridges carry far more than a 0.05 g tremor (quake capacities 0.1 to 0.7 against a demand of 0.03).

## Changed level values (content)

- Every river's named great flood is now the greatest it sees; each was below the largest generated flood, which sits near the 500 to 1000-year stage. Zamantı 1544: 3.35 to 3.9 m; Kızılırmak 1462: 5.4 to 6.1; Yeşilırmak 1388: 4.9 to 5.6; Dicle 1563: 5.6 to 6.5; Batman 1338: 10.2 to 10.6; Aras 1611: 4.3 to 5.1; Arpaçay 1603: 6.9 to 8.0; Fırtına 1491: 7.4 to 8.5; Sakarya 1512: 5.1 to 5.8; Tunca 1621: 4.3 to 4.5; Ergene 1773: 3.1 to 3.5. Tested.
- Steepest deck: Koramaz 0.3 to 0.45 (a path for children and donkeys; the round starter needs it), Fırtına 0.3 to 0.45 (the Black Sea footbridges climb like stairs; without it nothing high enough to clear the floods could be built, and no design stood in 2026).
- The 1668 North Anatolian earthquake at Tokat: 0.30 to 0.24 g, still "strong here" (the brief's 0.2 to 0.35). Clamps only come at river 7.
- Starters and pars as above.

## Fair warning

The gauge during the centuries shows the service safety (SIM-SPEC section 10): the smallest margin against what will bring the bridge down next under ordinary conditions, fifteen years ahead. The rings with the joints they will have lost by then, the piers, the everyday axle of the era now or within 25 years, and the scour an ordinary (25-year) flood would dig at the pier feet. The warning names what governs it in plain words, once (`src/game/time/warning.ts`): worn joints, the carts, a pier foot being dug out, or ground that gives.

`src/content/warning.test.ts` runs every river's starter, rings from the thinnest to three quarters of the range, the recorded pass and masterwork designs and (with piers) the shallowest foundation, all left alone, and holds every slow fall (weathering, everyday traffic, settlement, creeping scour) to a warning at least 15 years ahead. Of 98 such runs on the twelve rivers and Bin Yıl, 44 fall slowly. 26 of those are warned 20 to 345 years ahead (median 82), and the other 18 tremble from their first year. A bridge that trembles from its first year (a ring built just past 1 in the design gauge, a foundation the first ordinary flood undermines) is warned in that year, which is as early as it can be. Great floods, earthquakes and exceptional loads may still come unannounced; the director announces those as beats instead.

Two simulation fixes made this possible: a cracked ring keeps the hinges it has open while it can still stand on them (SIM-SPEC section 8; before, a ring at 1.3 could snap through the next year), and the ordinary traffic is checked with the yearly check while the rings or the traffic margin are under 1.6.

In the game the warning also slows the centuries to 1.5 years a second for five seconds, so a player watching at full speed has time to read it and press Repair. At Koramaz the taught starter ring raised a little (310 stones, gauge 1.44) and left alone is warned in 1204 and falls to weathering in 1257; the same bridge repaired whenever it trembles stands in 2026 with the standing and lean seals for 386 stones.

## Repair economy

A repair costs the work it does (SIM-SPEC section 10): repointing restores 90 % of each span's lost joint depth, and of the dressed stones that carry joints (the ring and the two spandrel walls) it takes `0.1 x restored depth / 0.5 m` of them; riprap adds 10 stones per pier for each step of protection it actually adds; no repair takes fewer than 4 stones. Piers, fill and parapets have no joints to repoint, so a wide bridge pays a smaller share.

Because the cost is linear in the depth restored, how often a player repairs hardly changes what the centuries cost (letting plants grow in the joints does: they speed weathering up by 60 %). In the recorded careful bridges, repaired three or four times, a repair costs 2.7 to 4.8 % of a single-arch bridge (Koramaz, Zamantı, Arpaçay) and 1.2 to 2.7 % of a wide one (Batman, Dicle, Sakarya, Tunca). A bridge repaired once or twice after centuries of wear pays more each time (Aras 3.9 %; Koramaz's masterwork 8.5 % for 536 years of joints), and mending every few decades costs the 4-stone minimum each time, about 1 to 2 % of a village bridge.

That makes a thin ring mended every few decades the cheapest bridge on several rivers (at Koramaz a 0.20 m ring stands to 2026 for 235 stones). A par set from it would leave a player who builds to last and repairs three or four times no lean seal, so the par is set from the cheapest bridge found standing in 2026 with at most four repairs (`standsCarefully` in `src/content/tuning/search.ts`), or from the cheapest unrepaired one where that is dearer, so that the masterwork fits too. `src/content/balance.test.ts` replays both bridges on every river and checks the par band against the dearer.

## Known gaps (reported, not fixed here)

- The design gauge reads the dead-load safety only. A ring built just past 1 there carries itself but not the village's carts: at Koramaz a ring of 0.25 m (gauge 1.1) falls to the first year's traffic, warned only in that same year. The time gauge then shows its true margin, but too late to matter.
- Uzunköprü's 161 arcade arches beyond the designed stretch (`site.arcade`) are drawn and counted but carry no water in the hydraulics; the designed stretch sets the waterway alone.
- The search is greedy from a handful of random starts, and it misses things: at Sakarya the careful bridge (6979 stones) is cheaper than the "cheapest passing" one (7252), and at Fırtına and Ergene the "no repairs" search misses designs the "after" search finds with no repair at all. The par uses what the script prints.
- The balance run is slow since the yearly checks under watch: Dicle alone took 38 minutes, Sakarya and Tunca about half an hour each. Run the wide rivers in parallel processes (`npm run balance -- dicle`, and so on).
- Batman's and Sakarya's cheapest unrepaired bridges are thin rings mended 35 and 21 times after their early great floods (1338, 1512). That is a fair masterwork under the rules (the seal asks only for no repair before the greatest flood), but it is not the bridge the par is set from, since a careful one is dearer there.
