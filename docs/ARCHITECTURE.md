# Kemer: architecture

TypeScript (strict), Vite, Vitest, three.js (WebGL 2) with `postprocessing`, Rapier (lazy, collapse only). No framework: the interface is plain DOM and SVG. Everything ships as static files; there is no server and no network use at run time.

Read with: `docs/DESIGN.md` (what the game is), `docs/SIM-SPEC.md` (the engineering), `src/core/types.ts` and `src/core/contracts.ts` (the shared types and module interfaces), `src/core/bus.ts` (scene events).

## Modules and ownership

Each module owns one directory and talks to the others only through `src/core`. Nobody but the lead edits `src/core`, `src/app`, `src/main.ts`, `src/styles/base.css`, configs, `scripts/` or `docs/`. If a contract is wrong or missing something, work around it inside your module and report it; do not edit the contract.

| Module | Directory | Implements | Exports |
| --- | --- | --- | --- |
| sim | `src/sim` | `SimApi`, `ChronicleRun` | `createSim()` |
| world | `src/render/world` | `WorldApi` (renderer, sky, terrain, water, plants, particles, camera rig) | `createWorld(canvas, bus, options)` |
| bridge | `src/render/bridge` | `BridgeViewApi` (stones, centering, ageing, collapse, traffic) | `createBridgeView(world, bus, options)` |
| audio | `src/audio` | `AudioApi` | `createAudio(bus)` |
| ui | `src/ui`, `src/i18n` | `UiApi` | `createUi(root, projector, options)` |
| content | `src/content` | `ContentApi` | `createContent(sim)` |
| game | `src/game` | flow, phases, tutorial, camera direction, saves, modes | `createGame(deps)` |
| app | `src/app`, `src/main.ts` | boot, frame loop, wiring | lead |

`src/sim` and `src/content` never import three.js or touch the DOM. `src/render/*` never imports `src/ui` or `src/game`. `src/ui` never imports three.js: it draws over the scene through the `Projector` it is given.

## Frames, units, time

- Elevation frame (sim, UI overlay): x along the bridge, y up, y = 0 at normal water. World frame (three.js): X = x, Y = y, +Z upstream, towards the default camera; the river flows to -Z; the bridge spans -width/2..+width/2 in Z. One unit is one metre.
- Camera yaw 0 looks straight downstream at the upstream face (the design view). Positive yaw moves the camera towards +X.
- The frame loop (in `src/app`) runs: `game.update(dt)`, `bridge.update(dt)`, `world.update(dt)`, `audio.update(dt)`, `world.render()`, `ui.frame(dt)`. `dt` is clamped to 1/20 s. The game owns the clock: it scales `dt` for slow motion and pause before passing it on.
- All gameplay randomness comes from `core/rng` with explicit seeds. `Math.random` is allowed only for cosmetic variation in render and audio.

## The bus

`core/bus.ts` lists physical events (`stone:land`, `keystone:seat`, `wedge:strike`, `splash`, `impact`, `flood`, `quake`, ...). The emitter is whoever makes the thing happen (mostly the bridge view); listeners add their own layer: audio the sound, world the dust and ripples, UI the caption. Positions are world coordinates. Never call another module to make a sound or a particle; emit.

## Rendering decisions

- One `WebGLRenderer`, owned by world. `postprocessing` composer with half-float buffers: render, bloom (subtle, high threshold), tone mapping (AgX), vignette, SMAA on high. Call `compileAsync` with the composer's render target bound (program variants differ otherwise).
- Light: one directional sun with a shadow map fitted to the bridge, hemisphere and image-based ambient generated from the sky (PMREM of the sky scene, refreshed only when the sun has moved enough). No baked lighting.
- Sky: physical sky shader with a sun disc; in time-lapse (`WorldTime.lapse` towards 1) the disc stretches into the streak of its daily path, whose height follows the season, and light becomes the day's average. A thin procedural cloud layer.
- Water: a mesh along the channel. Flow-mapped normals, Fresnel blend of a planar reflection (half resolution; off on low) with depth-tinted body colour, foam at banks and piers, a turbidity control for floods, and a raised upstream side (`WaterState.heap`).
- Terrain: a height field swept from `site.ground` along Z with meander and noise; it must equal `site.ground` exactly for |Z| under the bridge so piers and abutments meet the ground. Slope and height blend three or four ground textures; season tint and snow are uniforms.
- Plants: instanced GLB models placed by a seeded scatter per biome; wind in the vertex shader; season colour; slow life cycles so the valley changes over centuries.
- The bridge is a **stone field**: every stone is real geometry, merged into a few buffers, with a per-stone index attribute and a float texture holding each stone's transform (offset, rotation). Laying stones, settling, open hinges, tremors and the collapse are all writes to that texture: one draw call per material however many stones move. The depth and shadow materials read the same texture. Stone materials are `MeshStandardMaterial` extended through `onBeforeCompile` (per-stone tint, moss from below, wet band at the waterline, snow on top faces, patina with age).
- The draft shown in design mode is a separate, cheap massing model rebuilt on every drag.
- Collapse: the first half second follows the hinge mechanism from `CollapseInfo` kinematically; then each stone becomes a Rapier rigid body (the module is imported on demand and warmed during the time-lapse). Stones that reach the water emit `splash` and sink.
- Quality presets (`core/config.ts`): low, medium, high set render scale, shadow size, reflection, bloom, plant density and particle counts. `auto` starts from a device guess and steps down if the frame time stays over budget.

## Interface decisions

- DOM for screens and HUD, one SVG layer for the design overlay (handles, thrust line, dimensions), positioned every frame through `Projector.toScreen`.
- The UI is passive: it renders the models the game gives it (`UiScreen`, `DesignModel`, `BuildHud`, `TimeHud`, `CoachStep`) and reports what the player does as `UiIntent`s. Design rules (limits, snapping, what a drag means) live in `src/game`, not in the UI.
- Strings: interface text in `src/i18n/tr.ts` and `en.ts` (keys through `t()`), authored content as `LocalText`. Numbers through `core/format`.
- Shipped under a strict Content Security Policy (`default-src 'self'`): no inline scripts or `<style>` tags, no `innerHTML` with markup, no `style="..."` attributes in strings. Build with DOM APIs, toggle classes, and set dynamic values through `element.style` or CSS custom properties.
- Pointer events for mouse and touch alike; every control at least 44 px; keyboard focus visible; `prefers-reduced-motion` respected.

## Assets

Produced by the lead with Blender into `public/assets` and listed in `public/assets/manifest.json`; `core/assets.ts` names every asset the code may ask for. Textures are WebP (colour, normal, and one packed AO/roughness/metal map), 1024 px or smaller; models are GLB. **Every loader must fall back gracefully** (flat colour, simple proxy shape) when an asset is missing from the manifest, so no module waits for art.

## Working in this repository

- Commands: `npm run typecheck` (or `typecheck:<module>`), `npx vitest run <dir>`, `npm run build`. Vitest does not typecheck; run both.
- The lead keeps one dev server running at `http://127.0.0.1:5173`. Do not start another. Each module has a harness page under `harness/` (served at `/harness/<name>.html`) that shows the module alone with fake neighbours and URL parameters for states.
- To look at a page: `node scripts/shot.mjs "<url>" --out=shots/<name>.png --size=1280x720 --wait=4000` drives headless Chrome on the real GPU, prints the page's console and saves a PNG you can open. `--steps=file.json` scripts clicks, drags, keys and several shots (see the header of the script). Headless frame timing is unreliable: judge pictures there, not frame rates.
- Tests sit beside the code as `*.test.ts`. Pure logic gets unit tests; rendering gets harness screenshots.
- Style: strict TypeScript, no `any`, no new dependencies, files under about 400 lines, comments say why. English identifiers and comments; all player-facing text in both Turkish and English.
- Hot paths never throw: catch, `log.once`, degrade.
