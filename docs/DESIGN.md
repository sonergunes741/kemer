# Kemer: game design

*Kemer: Seni Aşan Köprüler.* Design a stone arch bridge on a real Anatolian river, lay its stones on timber centering, strike the centering, then let time run from the build year to 2026 while floods, earthquakes, weather and traffic test it. Twelve rivers, twelve generations of one stonemason family from Ağırnas (Mimar Sinan's village), an epilogue in which the last of the family repairs the player's own surviving bridge, and two endless modes.

Web, desktop first, touch supported. Turkish and English. One sitting per river: about ten minutes the first time, three on a replay.

## 1. Pillars

1. **Honest stone.** The verdict comes from real masonry limit analysis (`docs/SIM-SPEC.md`). Nothing is random: the same bridge always meets the same fate, and when it falls the game shows exactly why.
2. **The hand remembers.** Every action has weight: stones land with a thud, the keystone booms, wedges fly, the arch settles a centimetre. The player does these things, the game does not do them for the player.
3. **Time is the examiner.** The reward for building is watching centuries pass over the work. Suspense, not twitch skill.
4. **Quiet elegance.** Realistic materials and light, very little interface, no ornament. When in doubt, remove.
5. **Your mark.** The family mark the player chooses is cut into every bridge, the ledger keeps every bridge, and the story ends at the player's own stonework.

## 2. The loop on one river

| Phase | What the player does | Length |
| --- | --- | --- |
| Arrive | Watches the river; reads two or three lines from the family ledger | 15 s, skippable |
| Design | Drags a few handles on the side view; watches the gold line of thrust | free |
| Build | Holds to lay stones; lowers the keystone; cuts the family mark | 40 s |
| Strike | Knocks out three wedges; the centering falls; the arch settles | 15 s |
| Time | Starts time by dragging the sun; watches; may pause, speed up, repair | 60 to 150 s |
| Result | Years stood, three seals, a line of story; or the fall and its reason | 20 s |

### 2.1 Arrive

Black screen, river sound first. The year and place set in large type (`1147 · Koramaz Deresi, Ağırnas`). The camera glides in from high upstream to the working view. Ledger lines appear one at a time. A faint line on the bank shows the highest flood the old people remember (the 25-year stage); floods the player has already witnessed on this river in earlier attempts are marked too, with their years.

### 2.2 Design

The camera flattens into a true side view (long lens). The bridge is shown as a pale draft: a clean massing model with drawn joints, clearly a proposal and not yet stone.

Handles (only those the level has unlocked, see section 4):

- **Crown** (drag up and down): the rise. Below half the span the arch is a circular segment; at half, a semicircle; above, a pointed arch.
- **Haunch** (drag in and out): fullness, from a full round curve to straight pointed sides.
- **Back of the ring** (drag out): thickness.
- **Pier** (drag sideways; tap the riverbed to add; drag off to remove) and **pier side** (width).
- **Springing line**, **cover**, **foundation** on the levels that unlock them.
- Technique toggles as small chips: selyaran, boşaltma gözleri, kenet, kazık. "Eş gözler" links all spans.

Live feedback on every pointer move:

- **The line of thrust**, gold, drawn inside each ring, with a slow shimmer running from crown to supports. It turns amber where it comes within 15 % of an edge and rust-red and dashed where it leaves the stone; small open circles mark the hinges.
- **The şakül** (plumb bob) in the corner is the safety gauge: it hangs still when the bridge is sound, trembles as safety nears 1, and swings wide below it. Beside it a number and one word: `1,8 sağlam`, `1,1 kılpayı`, `0,8 yıkılır`, `3,4 fazla taş`.
- **Stone count** with the par for the lean seal.
- After a handle is released: the three capacities that matter on this river, in plain units (`Yük 14 ton`, `Deprem 0,21 g`, `Sel payı 1,2 m`).

Feel: handles ease in with a small overshoot when they appear; a grabbed handle grows and casts a guide line along its axis; values tick softly every 10 cm (or every parmak in arşın units) with a slightly rising pitch; limits answer with a dull knock and a rubber-band stop; crossing from unsafe to safe plays one warm note and the line blooms gold. Undo and redo (Z, Y). The primary button reads `Kur`; with safety under 1 it reads `Yine de kur` in rust: the player may build a bridge that will fall, and learn from it.

### 2.3 Build

1. `Kur`: piers rise from the bed and the timber centering goes up under each span (creaks, a few seconds, automatic).
2. **Lay the stones**: the player holds the primary control (space, mouse button on the control, or a finger). Stones swing in and land one by one from both springings towards the crown, each with its own thud (pitch by stone size, position panned), a breath of dust and a tiny dip of the timber. The pace quickens the longer the control is held, so a great bridge takes little longer than a small one; releasing pauses the work. The first ten stones are always single and distinct.
3. **The keystone**: everything stops but the river. The main span's keystone hangs from the hoist and follows the pointer. Held over the gap and released, it slides home: a deep boom, a flat ring of dust, a short push of the camera, half a second of slow motion. Released elsewhere it swings back, with no penalty.
4. Spandrels, fill, parapets and paving complete by themselves in a quick flourish.
5. **The mark**: the first time, the player chooses the family mark (twelve mason's marks, or their own drawn on a 3 x 3 grid of points). Then they tap any stone: three chisel taps and the mark is cut there for good.

### 2.4 Strike

Low camera near the water, looking up at the arch. Music gone. Three wedges under the centering glow faintly. Each tap is one mallet blow: the wedge flies, the timber groans, the next blow is heavier. On the third the centering drops into the river (splashes, drifting timber), and the arch takes its own weight: it sinks by the computed amount, shown as a small figure (`1,2 cm`).

Then nothing for a second and a half. If it stands: the river returns first, then one bird, then the rest, then a single warm chord. If the design cannot stand, it falls here, and the game goes to the collapse screen (section 2.6).

### 2.5 Time

The sun sits low over the left bank. The first time, the coach says to take hold of it and draw it across the sky: the shadows sweep, the player lets go, and the sun runs on by itself, faster and faster, until it is a bright streak whose height swings with the seasons. The year in the corner starts to turn.

- Base pace about 14 years a second (8 for the first century). `1x 2x 4x`, pause, and `Onar` (repair, with its cost in stones) are the only controls.
- Seasons wash over the valley, trees grow, moss creeps up from the waterline, the stone darkens. Traffic of the era crosses whenever the pace drops.
- Before every notable event (a great flood, an earthquake, an exceptional load, a change of era) time eases down to near real time; the camera moves in; the event plays for three to six seconds; time eases back up. The caption names it (`1683 · bahar seli`). The outcome is never known in advance, and the şakül trembles while it plays.
- If safety drops under 1.25 the şakül starts to tremble and `Onar` lights. Repairing costs stones (they count towards the lean seal) and forfeits the unrepaired seal if the greatest flood is still to come.
- The last eras: horse carts, a few lorries, then the bridge closes to motor traffic. In 2026 time slows to a real spring afternoon and children cycle across.

### 2.6 The fall

Slow motion. The arch opens at its hinges, the pieces turn, stones drop into the foam, and real time returns as the last ones sink. Silence, then the river. One line in large type: `1683 bahar selinde yıkıldı.` and under it `536 yıl dayandı.`

Then `Neden?`: a drawing of the player's own bridge with the hinges marked and the line of thrust leaving the stone (or the scoured pier, or the flood level), one sentence saying what happened, one sentence of advice in the family's voice. `Yeniden kur` returns to the design with the same bridge loaded and the weak part highlighted; the flood or earthquake that did it is now written in the ledger for this river.

### 2.7 Result

`879 yıl` in large type, `1147 · 2026` beneath. The three seals are stamped one after another, each with a thump and a puff of dust:

- **Ayakta**: standing in 2026.
- **Az taşla**: standing in 2026 with no more stones (repairs included) than the master's count.
- **Onarımsız**: came through the river's greatest flood without a repair before it.

All three in one run is **usta işi** (masterwork) and gilds the row in the ledger. A river counts as **passed**, and the next one opens, as soon as a bridge outlasts its builder (stands for the level's `passYears`, about one generation): *the bridge must outlast you*. Buttons: `Sonraki nehir`, `Yeniden kur`, `Paylaş`.

## 3. Progression and keeping the player

- **Three seals per river**, 36 in all, plus 12 masterworks. Rank grows with seals: Çırak, Kalfa, Usta, Başusta, Mimar.
- **The ledger (Defter)** is the level select: one row per river with the builder's name and year, a line drawing of the player's best bridge there, years stood, seals, and the hazards witnessed. A header shows the family mark, the rank and the total years all bridges have stood.
- **Knowledge carries over.** Each attempt reveals this river's floods and earthquakes; the ledger records them, so the next design is an informed bet. Each generation unlocks one technique (section 4).
- **Fast retry.** A fallen bridge is two clicks from a corrected one. Design is kept between attempts.
- **Near misses are shown**: `Emniyet 1,04'e düştü, dayandı.` A flood that almost took the bridge is the story the player tells.
- **Günün Nehri**: one generated river a day, the same for everyone; days played in a row are counted.
- **Bin Yıl Meydan Okuması**: built in 1026, a thousand years of hazards; fewest stones wins; personal best kept.
- **Sharing**: a twelve-second time-lapse video of the player's bridge with the year turning, an image, or a line of text: `Benimki 879 yıl dayandı. Seninki?`

## 4. The twelve rivers

Each river is a real one; the player's bridge is a new crossing beside the famous bridge that stands there, which the ledger names with its true facts. Years run in order, one generation apart.

| # | Year | River, place | Real bridge nearby | Crossing | Stone | New tool | What tests it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1147 | Koramaz Deresi, Ağırnas | (the village; Sinan is born here about 1490) | 7 m stream | tuff | rise, thickness | soft tuff weathers; the spring flood of 1683 |
| 2 | 1176 | Zamantı Irmağı, Kayseri | (none famous) | 13 m | andesite | fullness | spring floods reach the springings |
| 3 | 1202 | Kızılırmak, Kayseri | Tekgöz (1202, 27 m pointed arch) | 27 m | andesite | cover | a great span: thrust and crushing |
| 4 | 1250 | Yeşilırmak, Tokat | Hıdırlık (1250, five pointed arches) | 60 m | limestone | piers, pier width | scour on a gravel bed |
| 5 | 1271 | Dicle, Diyarbakır | On Gözlü (1065, ten arches, black basalt) | 150 m | basalt | cutwaters, foundation | a wide flood river, driftwood |
| 6 | 1284 | Batman Çayı, Silvan | Malabadi (1147, 38.6 m span) | 40 m gorge | limestone | reliefs, springing line | one giant arch; the flood that drowned the first footing |
| 7 | 1297 | Aras, Köprüköy | Çobandede (1297) | 110 m | andesite | clamps | earthquakes (1784, 1859, 1983), hard frost |
| 8 | 1325 | Arpaçay, Ani | the Silk Road bridge (about 31 m) | 31 m canyon | tuff | (all so far) | heavy caravans, an earthquake, weak stone |
| 9 | 1354 | Fırtına Deresi, Çamlıhemşin | Şenyuva (1696) and its kin | 25 m | granite | (all so far) | flash floods, moss and roots |
| 10 | 1391 | Sakarya, Geyve | Justinianus (562) | 120 m | limestone | piles | clay banks that spread, a soft bed |
| 11 | 1420 | Tunca, Edirne | Gazi Mihal (1420) and the Edirne bridges | 190 m | limestone | (all) | flood plain, the armies' guns, 1509 |
| 12 | 1427 | Ergene, Uzunköprü | Uzunköprü (1427 to 1443, 174 arches, 1 392 m) | 1 392 m | limestone | (all) | everything, across a marsh |
| E | 2026 | Koramaz Deresi | the player's own bridge | | | repair | |

Difficulty rises one idea at a time: river 1 cannot really be failed once the line is gold; river 2 teaches that shape matters as much as thickness; river 3 that size changes everything; rivers 4 to 6 are about water; 7 and 8 about shaking and weight; 9 about slenderness; 10 about ground; 11 and 12 ask for all of it at once.

**Uzunköprü** is laid out as the real one: 174 arches. The player designs three repeating units (the river arches, the marsh arches, the dry-meadow arches) and the camera pulls back along all 1 392 metres.

**The epilogue** opens when at least one of the player's bridges stands in 2026 (the earliest such bridge is used, Koramaz if possible). Elif, a restoration engineer and the last of the family, comes to it in 2026: the player wipes moss from the stones to find the family mark where they cut it, reads the hinges and the wasted joints, and makes the smallest repair that brings safety back above 1.5. No new mark is cut. Children cycle across.

## 5. Story

Told only through the ledger: two or three short lines on arriving at each river, one or two on the result. Never a cutscene, never more than a breath of text. The voice is plain and dry, a mason's, with one image per card. The narrator is Elif in 2026, reading the family's ledger; each river is one ancestor.

Arc: a village mason builds a small arch so the children need not ford the stream (1147). His line follows the work: the Seljuk roads, the black basalt of Diyarbakır, the gorge at Silvan, the cold of the Aras, the caravans at Ani, the rain of the Black Sea, the clay of the Sakarya, the court at Edirne, and at last the long bridge over the Ergene marsh, which takes one of them sixteen years and most of a life. The ledger's last old entry notes that forty-seven years later a boy was born in the village and learned to cut stone in the family's yard: Sinan. Then the hand changes: Elif, 2026, standing on the first bridge.

Themes: what outlasts you; the anonymous hand; knowledge passed on as a debt. Facts about real bridges, people and dates must match `docs/research/notes.md`; anything invented stays generic (a spring flood, an emir) and is never attributed to a named historical person.

## 6. Look

- **The scene**: realistic materials and light. Stone with real texture, water with depth, flow and reflection, soft long shadows, air between the layers of hills. Restraint in everything else: a few well-shaped trees, no clutter.
- **Camera**: always directed. Side view for design (long lens, flat). Three-quarter views for building, low for the strike, wide with a great deal of sky for time. The player may look around a little by dragging the background; the view drifts back.
- **Time-lapse**: the sun as a streak that rises and falls with the seasons; snow comes and goes in bands; the river breathes; trees thicken; moss and patina grow on the stone.
- **Interface**: type set straight on the picture with a soft veil behind it where needed; hairlines, small capitals with open tracking for labels, large Cormorant numerals for years and counts, Inter for everything else. No panels along the sides; anything that needs a setting opens a small card beside the thing it sets. One primary control, bottom centre.
- **Colour**: paper `#F2ECE0`, ink `#1B1815`, stone grey `#A69E90`, river sage `#6E8F7A`, thrust gold `#D9A441`, rust `#B5482E`. Gold is reserved for the line of thrust and for seals.
- **Motion**: 180 to 320 ms, ease-out; nothing bounces except the handles' first appearance. Reduced-motion setting removes camera shake and the push-ins.

## 7. Sound

All synthesized (see `src/audio`). The river is the bed of everything and follows the water: a murmur at low flow, a roar in flood. Birds by day in the warm months, wind in winter, crickets on summer nights. Stones thud with a pitch and weight that follow their size; the keystone is a low boom with a long tail; wedges are sharp mallet cracks, each lower than the last; timber creaks under load and slaps the water. After the centering falls there is real silence, then the river, then one bird.

Music is sparse and modal: a plucked string (ud, kanun) and a breathy reed over a drone, a few notes at a time, in makam colours that change with the region. It leaves the strike and the fall alone.

## 8. Teaching

Nothing is explained in a menu. Each new thing is taught once, in place, by one short line at the bottom of the screen and a ghost hand showing the gesture on the real control, and the step completes when the player has done it. River 1 teaches, in order: raise the crown; the gold line is the path of the load; thicken the ring until the line is inside (the starting ring is deliberately too thin); build; hold to lay; lower the keystone; choose and cut the mark; knock out the wedges; draw the sun across the sky; repair when the şakül trembles. Every later river teaches exactly one new tool. The `Tuşlar` card in the pause menu is only a reminder.

## 9. Settings and access

Language; master, music and effects volume; quality (auto, low, medium, high); metres or arşın; reduced motion; ambient life (traffic, birds, clouds) on or off; text size; a high-contrast thrust line that also changes dash pattern, not only colour. Everything reachable by keyboard: handles take focus and move with the arrow keys. Progress saves automatically after every phase.

## 10. Performance targets

60 frames a second on an integrated laptop GPU at the medium preset and 1080p (render scale adapts), first interaction within four seconds on broadband, under 12 MB downloaded for the first river, and the whole game installable for offline play.
