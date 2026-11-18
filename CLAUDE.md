# CLAUDE.md

Notes for AI coding sessions (and humans) working on this repo. Read this before changing code.

## What this is

A browser falling-sand game written in strict TypeScript and built with Vite. It draws to a plain
`<canvas>` and uses no game engine and **no runtime dependencies**. Dev dependencies only: TypeScript,
Vite, Vitest and ESLint. Don't add runtime packages, CDNs, web fonts or any external request. The
build must stay a fully static `dist/` with relative paths (`base: './'` in `vite.config.ts`).

## Architecture

```
src/sim/     simulation: pure logic, no DOM, unit-tested with Vitest
src/render/  turns the sim's arrays into pixels (one ImageData buffer)
src/ui/      palette, toolbar, keyboard, pointer/touch input, game state
src/main.ts  creates World + Renderer + UI and runs the requestAnimationFrame loop
```

- **`src/sim/` must never import from `src/render/` or `src/ui/`**, and must not touch `window` or
  `document`. ESLint enforces this (`no-restricted-imports` / `no-restricted-globals` in
  `eslint.config.js`). render and ui may import from sim, through `src/sim/index.ts`.
- `World` (`src/sim/world.ts`) holds the grid as parallel typed arrays indexed by `i = y * width + x`:
  `mat` (material id), `shade` (colour variation), `life` (lifetime), `burn` (burn timer or fuse),
  `vel` (frames spent falling). `swap()` moves all of them together; use it for every move.
- `step()` updates bottom-up, alternating the row direction each frame. A `stamp` array makes sure
  each cell moves at most once a frame. Anything created with `setCell`/`set` also waits until the
  next frame.
- Randomness in the sim goes through `world.rng` (seeded), never `Math.random`, so tests are
  deterministic.
- Outside the grid counts as a solid wall (`world.get` returns Stone there).

## Adding a material

1. Append an id to `M` in `src/sim/ids.ts`. Never renumber existing ids.
2. Add an entry to `defs` in `src/sim/materials.ts`: name, shortcut key, `kind`
   (`static` / `powder` / `liquid` / `gas`), density, colour, and whichever of flammability,
   burn time, lifetime, decay, dispersion, viscosity, rise or explosive apply. The comments on
   `MaterialDef` explain each field.
3. Add the id to `PALETTE` at the bottom of `materials.ts` so it can be drawn.
4. If the generic rules aren't enough (reactions, growth, condensing and so on), write one small
   function in `src/sim/behaviours.ts` with the `UpdateFn` signature and set it as `update`. Return
   `true` if it handled the cell (so generic movement is skipped). Use `World` methods (`get`, `set`,
   `setCell`, `isSolid`, `ignite`, `igniteNeighbours`, `explode`, `rng`) and only `import type` from
   `world.ts`, which keeps imports free of cycles.
5. Add a Vitest test in `src/sim/world.test.ts` for its key behaviour, and a row to the README's
   materials table.

The palette button, swatch, keyboard shortcut and renderer colours all come from the table entry.

Movement is density-based: a mover can swap with an empty, liquid or gas cell that is lighter
(moving down or sideways) or heavier (gases moving up). Air is density 1.

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
- The main loop runs at most `MAX_STEPS_PER_FRAME` sim steps per animation frame.

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
- Materials only: no people, creatures or stick figures.
