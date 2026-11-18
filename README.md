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
| Left-drag, or a finger | Draw the selected material (an outline shows the brush) |
| Right-drag, or two fingers | Erase |
| `1`–`9`, `0`, `-`, `A`, `L`, `I`, `G` | Pick a material (the key is shown on each palette button) |
| `E` | Eraser |
| `[` and `]` | Smaller / bigger brush (or the Brush slider) |
| `Space` | Pause / play |
| `.` | Step one frame while paused (or the Step button) |
| `T` | Heat view: colour everything by temperature (or the Heat view button) |
| Speed menu | 0.25× to 3× simulation speed |
| Wind menu | Blow smoke, fire, steam and falling particles left or right |
| Scene menu | Save in this browser, load it again, download or open a scene file, or copy a share link |
| Clear button | Empty the whole grid |
| `?` or `H` | Show or hide the controls panel |

On a phone, the palette is a single row you can scroll sideways, and the less-used controls fold away
behind the `⋯` button.

A share link holds the whole scene in the part of the URL after `#`, so it works wherever the game is
hosted and nothing is uploaded anywhere. Scenes keep their materials; fires, temperatures and moving
debris start fresh when a scene loads.

## Materials

| Key | Material | Behaviour |
|---|---|---|
| 1 | Sand | Falls, piles up, sinks through water |
| 2 | Water | Falls and spreads sideways; puts out fire, turning it to steam; boils when hot; freezes next to ice |
| 3 | Stone | Static, indestructible; conducts heat well |
| 4 | Wood | Static; burns slowly |
| 5 | Plant | Static; slowly grows into neighbouring water; burns |
| 6 | Oil | Liquid, lighter than water (floats on it); burns fast |
| 7 | Fire | Short-lived; rises and flickers; ignites flammable neighbours |
| 8 | Napalm | Sticky, slow-flowing liquid; burns for a long time, is hard to put out, spreads fire |
| 9 | Nitroglycerin | Liquid; explodes on fire, when hot, or when it falls hard onto something. The blast clears a radius, throws nearby particles and leaves fire |
| 0 | Smoke | Rises and drifts, then fades |
| - | Steam | Rises; may condense back to water near the top or under a ceiling |
| A | Acid | Liquid; dissolves what it touches (but not stone or water), using itself up |
| L | Lava | Slow, glowing, very hot liquid; sets things alight, boils water and sets to stone where they meet, melts ice |
| I | Ice | Static and cold; melts near heat, slowly freezes neighbouring water |
| G | Gunpowder | Powder; burns very fast with small blasts, so a line of it works as a fuse |
| E | Eraser | A tool rather than a material: clears cells |

Burning works per cell: wood, plant, oil, napalm and gunpowder keep their material while they burn
(they flicker with fire colours), throw off flames, set their neighbours alight, and finally burn out.
Water can put burning cells out, but how easily depends on the material (napalm hardly at all).

Every cell also has a temperature. Heat spreads between neighbours (quickly through stone, slowly
through air and wood) and fades back to room temperature. Fire, lava and burning cells are hot, and
ice is cold. Water boils above 100°, ice melts above freezing, and flammable materials catch fire once
they're hot enough, even without touching a flame. Turn on heat view (`T`) to see it.

## How it works

```
src/
  sim/       the simulation: grid, rules, material table. No DOM. Unit-tested.
    ids.ts         material ids
    materials.ts   the material table (density, flammability, heat, colours, ...)
    behaviours.ts  small per-material functions (fire, steam, plant, acid, lava, ice)
    world.ts       grid storage, the update loop, temperature, explosions
    scene.ts       compact scene format for saving and sharing
    rng.ts         seedable random numbers, so tests are deterministic
  render/    draws the grid (or its temperatures) into one ImageData buffer
  ui/        palette, toolbar, keyboard, pointer/touch input, scene saving and links
  main.ts    wires it together and runs the frame loop
```

The grid is stored in typed arrays, one value per cell for each of: material, colour shade,
lifetime, burn timer, fall speed, temperature and flight velocity. Each frame, temperature spreads
first. Then the grid updates bottom-up, alternating left-to-right and right-to-left, and no particle
moves more than once a frame. The grid is sized to the window when the page loads, to roughly 80,000
cells at most, and the simulation runs at a fixed 60 steps a second whatever the display's refresh
rate. Explosions are capped at a fixed radius (`MAX_BLAST_RADIUS`) and a fixed number per frame, so a
chain of nitroglycerin spreads over several frames instead of freezing the page. Debris thrown by a
blast flies in an arc under gravity, then lands and behaves normally.

## Next steps

Ideas for contributors. Each one should fit in a small pull request; `CLAUDE.md` explains how to add a
material.

- [ ] **Glass**: sand that gets hot enough (next to lava) turns into glass, a static solid that acid can't dissolve. The temperature system already does the work: it's a table entry with `above`.
- [ ] **Metal and electricity**: a conductive solid, plus a spark that travels through connected metal and ignites or explodes what it reaches.
- [ ] **Undo**: keep the last few scenes in memory (the scene format is small) and restore one with `Ctrl+Z`.
- [ ] **Example scenes**: a handful of built-in scenes (a volcano, a fuse and charges, a pond with plants) in a menu, stored as share-link text.
- [ ] **Brush shapes and tools**: a line tool, a filled rectangle, and a "replace" brush that swaps one material for another.
- [ ] **Pan and zoom on touch**: pinch to zoom into part of the grid, and drag with two fingers to pan (two fingers erase today).
- [ ] **Run the simulation in a Web Worker**: move `World.step()` off the main thread and pass the arrays across, so bigger grids stay smooth.
- [ ] **Sound**: quiet, procedurally generated crackles, hisses and booms with the Web Audio API (no audio files, no external requests).
- [ ] **Smarter liquids**: pressure, so water rises to the same level in connected containers (a U-bend).
- [ ] **Heat view legend**: a small temperature scale in the corner while heat view is on.
- [ ] **Accessibility**: a high-contrast palette option, and keyboard control of the brush position.

## Licence

MIT. See [LICENSE](LICENSE).
