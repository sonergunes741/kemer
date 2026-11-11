# Kemer: level and story brief

Working brief for `src/content`. Numbers here are starting points: every level must be tuned against the real simulation (see "Balance" at the end). Facts about real places must agree with `docs/research/notes.md`; where that file marks something unverified, say "about" or leave it out.

## The family

Narrator: **Elif Taşçı**, restoration engineer, 2026, the last of the line, reading the family ledger (*defter*). The surname was taken in 1934: asked for one, her great-grandfather said the only word that fitted, Taşçı.

Twelve builders, one per river, a generation apart. Names shared by all the faiths of medieval Anatolia: 1 Davud, 2 İlyas, 3 Yakub, 4 Süleyman, 5 Yusuf, 6 İshak, 7 Musa, 8 Harun, 9 Meryem (she ran the yard and kept the ledger while the men were away; from her on the entries are longer), 10 İbrahim, 11 İsmail, 12 Yahya. Each is given as "Ağırnaslı Davud Usta" and so on. Voice: plain, dry, exact; a mason's; one image per card; no exclamation, no moralising. Two or three lines on arriving, one or two on the result.

Beats:

1. **1147, Koramaz.** Davud builds a small arch so the village children need not ford the stream. "Taş bekler. İnsan beklemez."
2. **1176, Zamantı.** İlyas learns that the curve matters more than the weight of stone.
3. **1202, Kızılırmak.** Yakub works in the year the Seljuks raise Tekgöz downstream: 27 metres in one leap. Ambition, and fear of it.
4. **1250, Yeşilırmak, Tokat.** Süleyman meets water that digs: the first piers. Hıdırlık rises the same year.
5. **1271, Dicle.** Yusuf in Diyarbakır's black basalt, heavy as iron; the old bridge of 1065 (On Gözlü) is his teacher.
6. **1284, Batman Çayı.** İshak at Silvan, under the shadow of Malabadi (1147): its builders lost their first footing to a flood and began again with great timbers.
7. **1297, Aras.** Musa on the cold plateau the year Emir Çoban's bridge is finished; the ground itself moves here.
8. **1325, Arpaçay.** Harun at Ani, six years after the earthquake of 1319 emptied the city; the caravans still come.
9. **1354, Fırtına.** Meryem's entry: rain that never stops, a stream that rises in an hour, moss on a stone before the mortar is dry.
10. **1391, Sakarya.** İbrahim on clay: banks that walk apart. Nearby Justinian's great bridge stands over almost nothing: the river left it.
11. **1420, Tunca.** İsmail at Edirne, the Ottoman capital: a plain that floods every other spring, and armies that cross with guns.
12. **1427, Ergene.** Yahya gives sixteen years to the long bridge of Murad II under the architect Muslihiddin: 174 arches over a marsh. He does not see the end of it clearly; his eyes go.
13. **Epilogue, 2026.** The last old entry: "Forty-seven years after the long bridge a boy was born in our village. They say he learned to hold a chisel in our yard. His name was Sinan." (Legend, and the ledger says "they say".) Then Elif's hand: she stands on Davud's arch, finds the mark, mends as little as she can.

## The rivers

Common: `endYear` 2026, `passYears` 30. Bridge width 3 m at Koramaz rising to 6 m at Edirne. Latitudes: Kayseri 38.7, Tokat 40.3, Diyarbakır 37.9, Silvan 38.1, Erzurum 40.0, Ani 40.5, Rize 41.0, Sakarya 40.5, Edirne 41.7, Uzunköprü 41.3.

| # | id | Year | Site in short | Soil | Flood stage 2 y / 100 y (m) | Biome, water | winter / frost / wet | Stone | Tools added |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | koramaz | 1147 | 7 m stream, rock ledges 0.8 m above water, banks 3 m, bed -0.6 | rock | 0.5 / 1.6 | tuff-valley, clear | 0.5 / 0.4 / 0.2 | tuff | rise, thickness |
| 2 | zamanti | 1176 | 13 m river, banks 3.5 m, bed -1.2 | rock | 1.2 / 3.0 | steppe-river, green | 0.6 / 0.5 / 0.2 | andesite | fullness |
| 3 | kizilirmak | 1202 | 27 m, rock banks 6 m, bed -2.5 | rock | 2.0 / 4.8 | steppe-river, red | 0.6 / 0.5 / 0.2 | andesite | cover |
| 4 | yesilirmak | 1250 | 60 m, banks 5 m, bed -2 | gravel bed, rock banks | 1.8 / 4.2 | green-valley, green | 0.4 / 0.3 / 0.5 | limestone | piers, pier-width |
| 5 | dicle | 1271 | 150 m, low banks 4.5 m, wide gravel bed -2.5 | gravel, sand in mid-channel | 2.2 / 5.0 | basalt-plain, brown | 0.3 / 0.2 / 0.2 | basalt | cutwaters, foundation |
| 6 | batman | 1284 | 40 m gorge, cliffs 14 m, bed -4 | rock, gravel bed | 3.0 / 8.0 | limestone-gorge, turquoise | 0.3 / 0.2 / 0.3 | limestone | reliefs, spring |
| 7 | aras | 1297 | 110 m, banks 5 m, bed -1.8 | gravel | 1.6 / 3.8 | highland, clear | 1.0 / 1.0 / 0.3 | andesite | clamps |
| 8 | arpacay | 1325 | 31 m canyon, cliffs 16 m, bed -3 | rock | 2.5 / 6.0 | canyon, green | 0.9 / 0.8 / 0.2 | tuff | |
| 9 | firtina | 1354 | 25 m, steep rock banks 7 m, bed -2 | rock, boulders | 2.5 / 6.5 | rain-forest, milky | 0.5 / 0.3 / 1.0 | granite | |
| 10 | sakarya | 1391 | 120 m, low banks 4 m, bed -3 | clay banks, sand bed | 2.0 / 4.5 | alluvial-plain, brown | 0.3 / 0.2 / 0.6 | limestone | piles |
| 11 | tunca | 1420 | 190 m, banks 3.5 m, shallow bed -1.5, plain beyond | sand, clay | 1.8 / 3.6 | flood-plain, green | 0.4 / 0.3 / 0.5 | limestone | |
| 12 | ergene | 1427 | 1 392 m: a 60 m channel (bed -2.5) in a marsh at +0.3 | marsh, sand in the channel | 1.2 / 2.6 | marsh, brown | 0.4 / 0.3 / 0.6 | limestone | |

Ground lines must extend 1.5 bridge lengths past each abutment and look like the place: Koramaz a small V in soft rock with terraces; the gorges nearly vertical; the plains almost flat with a low levee.

Uzunköprü: fixed layout of 174 arches (the real count). The player's design has three linked groups (river, marsh, meadow); the simulation analyses one representative unit of each plus the ends. If the contracts cannot express this, build it as a 13-span stretch across the channel that the world repeats visually, and report the gap.

### Hazards

Every level also gets its generated annual floods. Named hazards, with what is real:

- **koramaz**: flood 1683 "bahar seli" (invented; the largest, stage about 2.2). A light earthquake in 1835 if the Kayseri earthquake of 1835 can be confirmed with one search; otherwise unnamed.
- **zamanti, kizilirmak**: invented great floods in different centuries; the same Kayseri earthquake rule.
- **yesilirmak**: earthquakes 1668 (the great North Anatolian earthquake, real, strong here), 1939 (Erzincan, real, felt), 1942 Niksar-Erbaa (confirm). Invented floods.
- **dicle**: flood 2006 (real, autumn). Earthquakes 1975 Lice (real, moderate here), 2023 (real, moderate here). Driftwood high.
- **batman**: floods 1969, 1972, 1991, 1995, 2006 (real years); `regulatedFrom` 1999 (Batman Dam). One medieval invented flood as the greatest.
- **aras**: earthquakes 1859 Erzurum (real), 1983 Erzurum-Kars at Horasan (real, very near: the strong one), 1784 (real, distant, light).
- **arpacay**: earthquake 1988 Spitak (real, near); a heavy caravan load in the 14th century (invented, generic); the real bridge's arch fell in 1807 (mention in the note, not as a hazard).
- **firtina**: flood 1946 (real: it carried off the Şenyuva inscription). Many sharp floods.
- **sakarya**: earthquakes 1967 Mudurnu (confirm), 1999 İzmit (real, strong here). Clay yielding is the main test.
- **tunca**: floods frequent; February 2026 flood (real, small drama, the last event before the end); earthquakes 1509 (real, felt in Edirne), 1752 Edirne (confirm). Loads: an army's siege guns leaving for the west in 1526 and 1683 (the campaigns are real; the crossing is generic: caption "sefer topları", axle about 60 kN and 80 kN).
- **ergene**: flood 1956 (real); earthquakes 1509, 1912 Mürefte-Şarköy (confirm); heavy lorries until 2013 when they were banned (real); closed for restoration from 2021 (real: traffic stops).

PGA at the site is your estimate from magnitude and distance; keep felt-only events at 0.03 to 0.08 g, strong nearby ones at 0.2 to 0.35 g.

### Traffic eras (all rivers, trimmed to each level's start)

| From | To | Actors | Ordinary axle (kN) |
| --- | --- | --- | --- |
| build | 1299 | villager, donkey, ox-cart | 12 |
| 1300 | 1599 | villager, ox-cart, caravan, rider | 15 |
| 1600 | 1849 | villager, ox-cart, caravan, rider, army | 20 |
| 1850 | 1919 | villager, ox-cart, carriage, rider | 25 |
| 1920 | 1979 | villager, ox-cart, truck, cyclist | 80 |
| 1980 | 2026 | villager, cyclist | 5 |

Village bridges (koramaz, firtina) never see lorries: cap their 1920 to 1979 axle at 25. Caravan routes (arpacay, kizilirmak, tunca) get the caravan from the start.

## Generated rivers

- **Günün Nehri** (`daily(date)`): seed from the date; choose a biome, a width between 8 and 90 m, banks, soil, stone, a build year between 1100 and 1700, two to four named-less great floods, zero to two earthquakes, tools by width; par from a quick search over designs.
- **Bin Yıl** (`millennium()`): built in 1026 on a 45 m river with gravel bed and one clay bank, andesite, all tools, a flood, an earthquake and a load in every second century, growing.

## Balance

Write `scripts/balance.ts` (run with `npm run balance`, Node 24 strips types) that, for every level, searches the design space (coarse grid plus local refinement) with the real simulation and prints: the starter design's fate; the cheapest design that passes; the cheapest that stands in 2026; whether all three seals are reachable in one run; and how first-instinct designs fail (thin ring, low rise, too few piers). Then tune sites, hazards and `parStones` until, for each level:

- the starter design is deliberately a little wrong in the way the level teaches (too thin at Koramaz; too flat at Zamantı; and so on) and its failure is instructive;
- a careful player passes on the first or second attempt;
- standing in 2026 takes real thought from river 3 on;
- `parStones` is 12 to 18 percent above the cheapest design found that stands in 2026;
- the level's signature hazard is what usually brings a weak bridge down.

Keep the table the script prints in `docs/BALANCE.md`.
