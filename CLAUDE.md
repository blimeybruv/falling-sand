# CLAUDE.md

Notes for AI coding sessions (and humans) working on this repo. Read this before changing code.

## What this is

A browser falling-sand game written in strict TypeScript and built with Vite. It draws to a plain
`<canvas>` and uses no game engine and **no runtime dependencies**. Dev dependencies only: TypeScript,
Vite, Vitest and ESLint. Don't add runtime packages, CDNs, web fonts or any external request. The
build must stay a fully static `dist/` with relative paths (`base: './'` in `vite.config.ts`).

## Architecture

```
src/sim/     simulation: pure logic, no DOM, unit-tested with Vitest (incl. scene.ts, the save format)
src/render/  turns the sim's arrays into pixels (one ImageData buffer)
src/ui/      palette, toolbar, keyboard, pointer/touch input, game state, scene storage and links,
             sound (synthesised live with Web Audio: no sound files)
src/main.ts  creates World + Renderer + UI and runs the requestAnimationFrame loop
```

- **`src/sim/` must never import from `src/render/` or `src/ui/`**, and must not touch `window` or
  `document`. ESLint enforces this (`no-restricted-imports` / `no-restricted-globals` in
  `eslint.config.js`). render and ui may import from sim, through `src/sim/index.ts`.
- `World` (`src/sim/world.ts`) holds the grid as parallel typed arrays indexed by `i = y * width + x`:
  `mat` (material id), `shade` (colour variation), `life` (lifetime), `burn` (burn timer or fuse),
  `vel` (frames spent falling), `temp` (temperature), `vx`/`vy` (flight velocity in 1/8 cells per
  frame), `charge` (electricity). `swap()` moves all of them together; use it for every move. If you add a per-cell array,
  add it to `swap()`, `setCell()` and `clear()`.
- `temp` is double-buffered and the array object is replaced every frame, so read `world.temp`
  fresh each time instead of keeping a reference.
- Each `step()` first spreads heat (`updateTemperature`), then moves electricity
  (`updateElectricity`: a conductor's charge is `CHARGE_ACTIVE` for one frame, when it passes to idle
  conducting neighbours, then cools down, so pulses travel one cell a frame and never flow back),
  then, if `world.sun` isn't 0, shines sunlight (`updateSunlight`: straight down every 4th column in
  turn, warming the first cell that isn't `transparent` and applying its `sunlit` change; when
  `sun` is below 0 it's a clear night, which instead chills that cell and applies its `night`
  change), then updates cells. With `dayLength` set, `sun` follows the time of day (`sunAt`); with
  `gusty` set, `wind` follows `gustAt`. Start a pulse with `world.electrify(i)`. Use `transform(i, m)`
  instead of `setCell` for phase changes (melting, boiling), so the cell keeps its temperature (unless
  the new material has a `startTemp`, which it takes instead). Burning cells don't melt until they stop.
- `step()` updates bottom-up, alternating the row direction each frame. A `stamp` array makes sure
  each cell moves at most once a frame. Anything created with `setCell`/`set` also waits until the
  next frame.
- Randomness in the sim goes through `world.rng` (seeded), never `Math.random`, so tests are
  deterministic.
- Outside the grid counts as a solid wall (`world.get` returns Stone there). With `world.openEdges`
  (the Edges button), `step()` first drains whatever has reached an edge it can leave by
  (`drainEdges`), and particles flying off the grid vanish; `get` still returns Stone outside.
- The sim makes no sound. It counts audible one-off events in `world.noise` (explosions and their
  radius, lightning strikes and the charge building before them, acid eating, fireworks bursting), which `src/ui/sound.ts` reads and
  zeroes; everything else it hears by sampling the grid. A new noisy event is a counter there plus a
  sound in `sound.ts`.

## Adding a material

1. Append an id to `M` in `src/sim/ids.ts`. Never renumber existing ids: saved scenes and share links
   store them.
2. Add an entry to `defs` in `src/sim/materials.ts`: name, shortcut key, `kind`
   (`static` / `powder` / `liquid` / `gas`), density, colour, and whichever of flammability,
   burn time, residue, burnTemp, flames, fumes, lifetime, decay, dispersion, viscosity, rise, explosive,
   acidProof, extinguishes, conducts, shattersInto, conductivity, heat, startTemp, above (phase change,
   optionally `sometimes` leaving something else), below (setting solid again when cold), ignitesAt,
   transparent and sunlit (what sunshine does), wind and drifts (powders blown along the ground) and
   emits (a vent, with the shared `vent` behaviour) apply, plus its palette
   `category` (the tab it appears under). `key` may be '' for no shortcut. The comments on `MaterialDef` explain each field. The
   "has sane values" test checks the ranges.
3. Add the id to `PALETTE` at the bottom of `materials.ts` so it can be drawn. For ideas, see
   `docs/elements.md`, and tick it off there once it's built.
4. For "A touches B, something turns into something", add a `Reaction` to the entry's `reactions`
   (optionally only while burning, only from one side, or only above a temperature). That's data, no code. For three-way
   mixes (earth + sand + clay → loam), see `mixThree` in `behaviours.ts`.
5. If the generic rules aren't enough (growth, condensing and so on), write one small
   function in `src/sim/behaviours.ts` with the `UpdateFn` signature and set it as `update`. Return
   `true` if it handled the cell (so generic movement is skipped). Use `World` methods (`get`,
   `defAt`, `set`, `setCell`, `transform`, `isSolid`, `ignite`, `igniteNeighbours`, `explode`,
   `launch`, `temp`, `rng`) and only `import type` from `world.ts`, which keeps imports free of cycles.
6. Make it discoverable: add it to `RECIPES` in `src/sim/discovery.ts` with a hint and a recipe
   (or to `STARTERS`), and a case in `discovery.test.ts` showing the recipe really makes it. The
   "every palette material can be discovered" test fails until you do.
7. Add a Vitest test for its key behaviour, and a row to the README's materials table.

The palette button, swatch, keyboard shortcut and renderer colours all come from the table entry.

Movement is density-based: a mover can swap with an empty, liquid or gas cell that is lighter
(moving down or sideways) or heavier (gases moving up). Air is density 1.

## Discovery mode

- `World.created[id]` counts cells the simulation itself created (only inside `step()`; brush and
  scene loading don't count). `Discovery.update(world.created)` unlocks recipes whose material has
  been created, plus the reward once enough are found. The UI saves progress in localStorage.
- Recipes should follow from the physics where possible, and hints should nudge rather than give the
  answer. Avoid reactions that fire constantly in ordinary sandbox play.
- Internal-only materials (Leaf, Spark, Molten wax, Water vapour, Dried paint, Thin ice) stay out of `PALETTE` and need no recipe.
- Weather conserves water: rain is the cloud itself coming down (a cloud cell turns into the drop),
  never water from nowhere, or the sun's water cycle would slowly flood a scene.
- Clouds come in three kinds (see "Clouds, redesigned" in `docs/elements.md`):
  - Cloud: persistent fair-weather cumulus. Each cloud sits on a level base and gathers into a
    rounded heap (`heapTargets`, `heapUp`, `roundCloud` in `behaviours.ts`, from a per-column tally
    cached once a frame).
  - Storm cloud: the base of a deep cloud, which pours and strikes.
  - Cirrus: high and fading, never rains.

  Cloud and Storm cloud have no lifetime, so they set `fadeFrames: 0`. Any gas without a
  lifetime needs that, or it renders invisible.

## Calibrating temperatures

Heat thresholds (`above`, `ignitesAt`) must be reachable by the heat sources you expect. Measure, don't
guess: sand under a lava pool levels off near 680°, clay beside a burning wood fire peaks near 275°,
burning wood holds 500°, burning charcoal 950°, fire cells 700°, a brick layer over lava about 520°,
lightning bolts 1200° (cooler than real ones, which last microseconds, so a copper lightning rod
survives). Strong sun warms a
surface to 33–48° (weak sun about half that above ambient): it thaws snow, frost and permafrost but
shouldn't cook fish (50°) or melt wax (60°). The clearest night chills open earth to about −8°
within 10 s (bare stone stays above freezing: it holds more heat), and a pond's surface to −1° (thin ice)
within a few seconds where fog doesn't cover it. Add a test that the recipe works and,
where it matters, one that an ordinary situation does *not* trigger it (see "an ordinary wood fire
does not melt sand into glass").

## Performance budget

- 60 fps on a mid-range laptop at the default grid size. The grid is sized to the window, up to about
  80,000 cells (`TARGET_CELLS` in `main.ts`). One `step()` plus one `render()` should stay well under
  16 ms. Today a full grid of churning liquid takes about 6–7 ms per step, and typical scenes much less.
- Rendering writes one `Uint32` per cell into an `ImageData` and calls `putImageData` once. Never
  draw cells with `fillRect`.
- No allocation in per-cell hot paths: no new arrays or objects, no closures created per cell,
  no `Math.random` in the renderer loop.
- Explosions are bounded: `MAX_BLAST_RADIUS` and `MAX_EXPLOSIONS_PER_FRAME` in `materials.ts`. Chains
  must go through fuses (the `burn` timer), never recursion.
- Vents are bounded too: each holds a finite reservoir (counted down in `life`) and releases only into
  open air, and all of them together at most `MAX_VENT_CELLS_PER_FRAME` cells a frame.
- The main loop runs at most `MAX_STEPS_PER_FRAME` sim steps per animation frame.
- `step()` skips cells of inert materials (static with no behaviour, reactions, phase changes,
  lifetime or flammability, e.g. stone) unless they're burning: see `INERT` in `world.ts`. Giving a
  material any of those makes it active again automatically.
- The temperature pass touches every cell every frame (about 0.5 ms at 80,000 cells). Keep it
  branch-light, and keep its fast path for idle cells at room temperature.
- In hot loops, use module-local copies of imported constants (see the top of `world.ts`). Under
  Vitest's module transform, every read of an imported binding is a property lookup, which once made
  the temperature pass look six times slower in benchmarks than it really is in the browser build.

## Scene format

`src/sim/scene.ts` defines the save format used by browser saves, files and share links. People will
have saved scenes and posted links, so keep old ones loading: if you change the format, bump
`VERSION` and keep decoding the old version. Scenes store only material ids.

## Before committing

Run:

```bash
npm run check
```

That runs the typecheck (`tsc --noEmit`), lint (`eslint .`) and the sim tests (`vitest run`). It must
pass. If you changed the build or UI, also run `npm run build` and try `dist/` served from a
sub-folder.

## Conventions

- British spelling in user-facing text (colour, behaviour), to match the existing UI.
- Keep `LICENSE` as the unmodified MIT text. Notes about scope or licensing go in the README.
- Materials and single-cell creatures only. A creature is one cell with a small behaviour (a worm
  that turns earth to loam, a fish, a bee): a material with an `update` function, like any other.
  No people, stick figures or multi-cell entities. Creatures should need a habitat and food, breed
  slowly, and die into something (so they can't overrun a scene).
