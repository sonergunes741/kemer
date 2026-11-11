# Credits

Every third-party source used to make the assets in this folder. All are from Poly Haven and are CC0 (public domain); no attribution is legally required, it is given here as thanks. Assets marked "made for KEMER" use no third-party source. The assets were recoloured, flattened for tiling, combined and downscaled in Blender for KEMER (sources and scripts in `art/`).

## Textures (`tex/`)

| Game asset | Poly Haven source (id) | Licence | One tile covers |
| --- | --- | --- | --- |
| stone-tuff | Rock Surface (`rock_surface`), by Amal Kumar | CC0, polyhaven.com | 2.0 m |
| stone-andesite | Rock 01 (`rock_01`), by Rob Tuytel | CC0, polyhaven.com | 1.5 m |
| stone-limestone | Quarry Wall (`quarry_wall`), by Dimitrios Savva | CC0, polyhaven.com | 1.8 m |
| stone-basalt | Granular Concrete (`granular_concrete`), by Dario Barresi and Michael Jenkins; relief from Rock 01 (`rock_01`) | CC0, polyhaven.com | 2.0 m |
| stone-granite | Rock 01 (`rock_01`), by Rob Tuytel; crystal grain made in Blender | CC0, polyhaven.com | 2.0 m |
| timber | Rough Wood (`rough_wood`), by Rob Tuytel | CC0, polyhaven.com | 0.5 m (grain runs along V; stretch up to 3x along the grain) |
| paving | Cobblestone Floor 08 (`cobblestone_floor_08`), by Rob Tuytel | CC0, polyhaven.com | 2.0 m |
| ground-soil | Dry Mud Field 001 (`dry_mud_field_001`), by Rico Cilliers and Rob Tuytel | CC0, polyhaven.com | 3.0 m |
| ground-grass | Grass Ground (`grass_ground`), by Charlotte Baglioni | CC0, polyhaven.com | 2.5 m |
| ground-gravel | Ganges River Pebbles (`ganges_river_pebbles`), by Amal Kumar | CC0, polyhaven.com | 2.2 m |
| ground-sand | Sand 03 (`sand_03`), by Charlotte Baglioni | CC0, polyhaven.com | 2.0 m |
| ground-mud | Brown Mud 03 (`brown_mud_03`), by Rob Tuytel | CC0, polyhaven.com | 1.3 m |
| ground-rock | Rocks Ground 02 (`rocks_ground_02`), by Rob Tuytel | CC0, polyhaven.com | 2.0 m |
| cliff-tuff | Rock Face 03 (`rock_face_03`), by Dario Barresi and Rico Cilliers | CC0, polyhaven.com | 2.7 m |
| cliff-basalt | Dark Rock 02 (`dark_rock_02`), by Amal Kumar | CC0, polyhaven.com | 2.0 m |
| cliff-limestone | Marble Cliff 03 (`marble_cliff_03`), by Amal Kumar | CC0, polyhaven.com | 5.7 m |
| moss | Concrete Moss (`concrete_moss`), by Rob Tuytel (colour only; cushion relief made in Blender) | CC0, polyhaven.com | 2.0 m |
| bark | Bark Brown 02 (`bark_brown_02`), by Rob Tuytel | CC0, polyhaven.com | 1.0 m (furrows run along V) |

## Models (`models/`)

| Game asset | Poly Haven source (id) | Licence | Notes |
| --- | --- | --- | --- |
| rock-a | Boulder 01 (`boulder_01`), by Rico Cilliers | CC0, polyhaven.com | decimated to 480 triangles, colour and normal baked at 512 px, recoloured to a neutral stone |
| rock-b | Namaqualand Boulder 03 (`namaqualand_boulder_03`), by Dario Barresi and Jenelle van Heerden | CC0, polyhaven.com | as above |
| rock-c | Namaqualand Boulder 06 (`namaqualand_boulder_06`), by Greg Zaal and Jenelle van Heerden | CC0, polyhaven.com | as above |
| tree-oak, tree-poplar, tree-plane, tree-willow, tree-spruce, bush | Bark Brown 02 (`bark_brown_02`), by Rob Tuytel, for the bark texture only | CC0, polyhaven.com | geometry modelled in Blender for KEMER (`art/tools/build_trees.py`); leaf and needle textures drawn procedurally |
| reeds | none | made for KEMER | modelled in Blender; blade texture drawn procedurally |
| driftwood | none | made for KEMER | modelled in Blender; weathered grain and normal map generated procedurally |

## Actors (`models/actor-*.glb`)

No third-party source: no Poly Haven asset was used for the actors. Every actor was modelled in Blender for KEMER with `art/tools/actorlib.py` and `art/tools/build_actors.py` (working file `art/kemer_actors.blend`), coloured with vertex colours only, and ships no textures.

| Game asset | Poly Haven source (id) | Licence | Notes |
| --- | --- | --- | --- |
| actor-villager, actor-army, actor-cyclist | none | made for KEMER | people as rigid parts (body, head, arm_l/r, leg_l/r); the cyclist rides a bicycle with wheel_f/wheel_b |
| actor-ox, actor-donkey, actor-horse, actor-camel | none | made for KEMER | animals as rigid parts (body, head, leg_fl/fr/bl/br) |
| actor-rider, actor-caravan | none | made for KEMER | horse with seated rider; three lighter camels roped in line |
| actor-ox-cart, actor-carriage, actor-cannon, actor-truck | none | made for KEMER | vehicles with wheels on their axles; draught animals (actor-ox, actor-horse) are placed at the hitch points by the game |
