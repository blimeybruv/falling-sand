# Falling Sand

A small falling-sand game for the browser. Pour sand, water and oil, grow plants, start fires, and
drop nitroglycerin from a height. It's built with TypeScript, Vite and a plain `<canvas>`, with no
game engine and no runtime dependencies.

It is open for collaboration: the code is small and the material rules are data in one file, so
adding a material is mostly a table entry. See [Next steps](#next-steps) for things to pick up.

## Run it

You need Node.js 22.12 or newer.

```bash
npm install
```

```bash
npm run dev      # dev server with hot reload
```

```bash
npm run build    # static build in dist/
```

```bash
npm run check    # typecheck, lint and tests; run before committing
```

`npm run build` produces a fully static `dist/` folder with relative asset paths. It works served
from the root of any domain or from any sub-folder, and makes no external requests (no CDNs, no
web fonts, no service worker). Like any ES-module site it needs to be served over HTTP, so opening
`dist/index.html` straight from disk (`file://`) won't work. `npm run preview` serves the build
locally.

## Controls

| Input | Action |
|---|---|
| Left-drag, or a finger | Draw the selected material |
| Right-drag | Erase |
| `1`–`9`, `0`, `-` | Pick a material (the key is shown on each palette button) |
| `E` | Eraser |
| `[` and `]` | Smaller / bigger brush (or the Brush slider) |
| `Space` | Pause / play |
| `.` | Step one frame while paused (or the Step button) |
| Speed menu | 0.25× to 3× simulation speed |
| Clear button | Empty the whole grid |
| `?` or `H` | Show or hide the controls panel |

On a phone, the palette is a single row you can scroll sideways.

## Materials

| Key | Material | Behaviour |
|---|---|---|
| 1 | Sand | Falls, piles up, sinks through water |
| 2 | Water | Falls and spreads sideways; puts out fire, turning it to steam |
| 3 | Stone | Static, indestructible |
| 4 | Wood | Static; burns slowly |
| 5 | Plant | Static; slowly grows into neighbouring water; burns |
| 6 | Oil | Liquid, lighter than water (floats on it); burns fast |
| 7 | Fire | Short-lived; rises and flickers; ignites flammable neighbours |
| 8 | Napalm | Sticky, slow-flowing liquid; burns for a long time, is hard to put out, spreads fire |
| 9 | Nitroglycerin | Liquid; explodes on fire or when it falls hard onto something. The blast clears a radius, throws nearby particles and leaves fire |
| 0 | Smoke | Rises and drifts, then fades |
| - | Steam | Rises; may condense back to water near the top or under a ceiling |
| E | Eraser | A tool rather than a material: clears cells |

Burning works per cell: wood, plant, oil and napalm keep their material while they burn (they flicker
with fire colours), throw off flames, set their neighbours alight, and finally burn out. Water can put
burning cells out, but how easily depends on the material (napalm hardly at all).

## How it works

```
src/
  sim/       the simulation: grid, rules, material table. No DOM. Unit-tested.
    ids.ts         material ids
    materials.ts   the material table (density, flammability, burn time, colours, ...)
    behaviours.ts  small per-material functions (fire, steam, plant)
    world.ts       grid storage and the update loop
    rng.ts         seedable random numbers, so tests are deterministic
  render/    draws the grid into one ImageData buffer
  ui/        palette, toolbar, keyboard, pointer/touch input
  main.ts    wires it together and runs the frame loop
```

The grid is stored in typed arrays: material, colour shade, lifetime, burn timer and fall speed per
cell. Each frame it updates bottom-up, alternating left-to-right and right-to-left, and no particle
moves more than once a frame. The grid is sized to the window when the page loads, to roughly 80,000
cells at most, and the simulation runs at a fixed 60 steps a second whatever the display's refresh
rate. Explosions are capped at a fixed radius (`MAX_BLAST_RADIUS`) and a fixed number per frame,
so a chain of nitroglycerin spreads over several frames instead of freezing the page.

## Next steps

Ideas for contributors. Each one should fit in a small pull request; `CLAUDE.md` explains how to add a
material.

- [ ] **Acid**: a liquid that dissolves the cells it touches (but not stone or glass), using itself up as it goes.
- [ ] **Lava**: a slow, glowing liquid that sets flammable things alight, turns water into steam and itself into stone where they meet.
- [ ] **Ice**: a static solid that melts into water near fire or lava, and slowly freezes neighbouring water.
- [ ] **Gunpowder**: a powder that burns very fast and explodes in small blasts, so it can be laid as a fuse.
- [ ] **Save and load scenes**: store the grid in `localStorage` or a downloadable file (the typed arrays compress well with run-length encoding).
- [ ] **Share scenes as a link**: encode a compressed scene into the URL hash so a link reopens it.
- [ ] **Temperature system**: a per-cell temperature array that heat sources raise and that spreads between neighbours, so melting, boiling and ignition come from heat rather than direct contact.
- [ ] **Wind**: a global or brush-applied wind that pushes gases, fire and light powders sideways.
- [ ] **Better mobile controls**: a two-finger gesture to erase or pan, a larger brush preview, and a collapsible toolbar.
- [ ] **Ballistic particles**: give thrown particles a real velocity so explosion debris flies in an arc instead of landing at once.
- [ ] **Brush preview**: show the brush outline under the cursor.

## Licence

MIT. See [LICENSE](LICENSE).
