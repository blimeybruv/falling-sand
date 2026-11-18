# Falling Sand

A small falling-sand game for the browser. Pour sand, water and oil, grow trees, start fires, and
drop nitroglycerin from a height. In Discovery mode you start with six materials and unlock the rest
by making them happen. It's built with TypeScript, Vite and a plain `<canvas>`, with no
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

## Discovery mode

New players start in Discovery mode with six materials: sand, earth, water, fire, stone and seeds.
Every other material is a locked "?" button with a hint. You unlock a material by making it happen in
the simulation: pour fire onto water and you discover steam; plant a seed near water and the tree
that grows gives you wood. Drawing a material with the brush, or loading a scene, never unlocks
anything. The journal (`J`) lists what you've found and how, and lava is the reward for discovering
ten materials. Progress is saved in your browser.

Switch to Sandbox mode (the Mode menu, under `⋯` on a phone) to have everything at once. Your
Discovery progress is kept for when you switch back.

## Controls

| Input | Action |
|---|---|
| Left-drag, or a finger | Draw the selected material (an outline shows the brush) |
| Right-drag, or two fingers | Erase |
| Number and letter keys | Pick a material (the key is shown on its palette button; a few have none) |
| `E` | Eraser |
| `[` and `]` | Smaller / bigger brush (or the Brush slider) |
| `Space` | Pause / play |
| `.` | Step one frame while paused (or the Step button) |
| `T` | Heat view: colour everything by temperature (or the Heat view button) |
| Speed menu | 0.25× to 3× simulation speed |
| Wind menu | Blow smoke, fire, steam and falling particles left or right |
| Scene menu | Save in this browser, load it again, download or open a scene file, or copy a share link |
| `J` or Journal button | Discovery journal: what you've found, and hints for the rest |
| Mode menu | Discovery or Sandbox |
| Clear button | Empty the whole grid |
| `?` or `H` | Show or hide the controls panel |

The palette has tabs (All, Ground, Liquids & gases, Fire & blasts, Life). Picking a material by its
key jumps to its tab. On a phone, the palette is a single row you can scroll sideways, and the
less-used controls fold away behind the `⋯` button.

A share link holds the whole scene in the part of the URL after `#`, so it works wherever the game is
hosted and nothing is uploaded anywhere. Scenes keep their materials; fires, temperatures and moving
debris start fresh when a scene loads.

## Materials

| Key | Material | Behaviour | In Discovery mode |
|---|---|---|---|
| **Ground** | | | |
| 1 | Sand | Falls, piles up, sinks through water; sprouts grass at the water's edge; melts into glass when very hot | Starter |
| D | Earth | Brown powder; turns to mud when wet, and to loam beside sand and clay | Starter |
| M | Mud | Thick, slow liquid; dries back to earth when heated; settles into clay in water | Earth meets water |
| C | Clay | Sticky powder that stands in steep piles; fired in a kiln it becomes brick | Mud left in water |
| O | Loam | Rich soil: seeds grow tall trees on it without water, and grass spreads over it | Earth with sand and clay around it |
| 3 | Stone | Static, indestructible; conducts heat well | Starter |
| B | Brick | Static; insulates, never burns, and acid can't eat it | Fire clay in a kiln |
| Q | Glass | Static; acid can't eat it | Melt sand with lava or a charcoal fire |
| N | Obsidian | Black volcanic glass; indestructible | Lava meets ice |
| I | Ice | Static and cold; melts near heat, slowly freezes neighbouring water | Steam reaching the top |
| F | Snow | Light, cold powder; melts near warmth | A cloud near ice |
| Z | Salt | Dissolves in water (salt water) and melts ice | Boiling water leaves some behind |
| | Iron ore | Rusty-speckled rock | Lava meets water (rarely) |
| | Iron | Metal; conducts heat fast; rusts in water, much faster in salt water | Burning charcoal against iron ore |
| | Rust | Crumbly orange powder | Iron in water |
| **Liquids & gases** | | | |
| 2 | Water | Falls and spreads sideways; puts out fire, turning it to steam; boils when hot (now and then leaving salt); freezes next to ice | Starter |
| W | Salt water | Sinks under fresh water and never freezes; boiling it gives salt back | Salt meets water |
| 6 | Oil | Liquid, lighter than water (floats on it); burns fast | Bury wood under sand |
| A | Acid | Liquid; dissolves what it touches (but not stone, water, glass, brick or obsidian), using itself up | Rain on smoke (or sulfur in water) |
| L | Lava | Slow, glowing, very hot liquid; sets things alight, boils water and sets to stone where they meet | Reward for 10 discoveries |
| 0 | Smoke | Rises and drifts, then fades | Let a fire burn out |
| - | Steam | Rises; condenses back to water near the top or under a ceiling, sometimes freezing | Fire meets water |
| V | Cloud | Hangs up high, drifts in the wind, rains (or snows near ice) | Steam crowding at the top |
| **Fire & blasts** | | | |
| 7 | Fire | Short-lived; rises and flickers; ignites flammable neighbours | Starter |
| K | Charcoal | Burns slowly and very hot, glowing rather than flaming; hot enough to make glass | Smother a wood fire with sand |
| X | Ash | Light powder left by fires; floats on water and blows in the wind | Wood, leaves or grass burning out |
| U | Sulfur | Yellow powder; burns with choking smoke; slowly turns water acidic | Lava meets water (now and then) |
| P | Saltpetre | White crystals | Leaves buried in earth |
| G | Gunpowder | Powder; burns very fast with small blasts, so a line of it works as a fuse | Charcoal with sulfur and saltpetre |
| 8 | Napalm | Sticky, slow-flowing liquid; burns for a long time, is hard to put out, spreads fire | Oil meets gunpowder |
| 9 | Nitroglycerin | Liquid; explodes on fire, when hot, or when it falls hard onto something | Acid meets oil |
| | Swamp gas | Bubbles up from rotting weeds; flashes into fire | Drowned grass |
| **Life** | | | |
| S | Seed | Falls; on loam, or on damp sand or earth, it grows into a tree (wood trunk, branches, leaves) | Starter |
| 5 | Grass | Weeds and grass: spreads over damp ground and loam, and into water; burns | A sandy shore |
| 4 | Wood | Static; burns slowly; buried under sand it slowly turns to oil | Grow a tree |
| R | Moss | Creeps over damp stone and brick | Grass touching stone |
| Y | Algae | Floats and spreads across water | Weeds reaching the surface |
| | **Tools** | | |
| E | Eraser | Clears cells | Always available |

The Discovery column gives the answers away, so skip it if you'd rather find them yourself.

Burning works per cell: wood, grass, leaves, oil, napalm and gunpowder keep their material while they burn
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
    behaviours.ts  small per-material functions (fire, steam, grass, trees, acid, lava, ice, mixing)
    discovery.ts   Discovery mode: starters, recipes and hints, the reward, progress
    world.ts       grid storage, the update loop, temperature, explosions
    scene.ts       compact scene format for saving and sharing
    rng.ts         seedable random numbers, so tests are deterministic
  render/    draws the grid (or its temperatures) into one ImageData buffer
  ui/        palette, journal, toolbar, keyboard, pointer/touch input, saving progress and scenes
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
material. For new materials, [`docs/elements.md`](docs/elements.md) has a menu of ideas grouped into
chains (coal, tar, cement, lightning, mushrooms, soap, thermite, fireworks...), with recipes and effort
estimates.

- [ ] **More materials**: pick one from [`docs/elements.md`](docs/elements.md). Each is a table entry, usually a `Reaction`, and a line in `RECIPES`; the tests check every one can be discovered.
- [ ] **Discovery goals**: small challenges once everything is unlocked ("grow a forest of 5 trees", "boil a whole pond").
- [ ] **Metal and electricity**: a conductive solid, plus a spark that travels through connected metal and ignites or explodes what it reaches.
- [ ] **Undo**: keep the last few scenes in memory (the scene format is small) and restore one with `Ctrl+Z`.
- [ ] **Example scenes**: a handful of built-in scenes (a volcano, a fuse and charges, a pond with plants) in a menu, stored as share-link text.
- [ ] **Line and shape tools**: drag to draw a straight line, a rectangle or a circle (outline or filled) in the selected material, with a preview outline while dragging, plus a "replace" brush that swaps one material for another. Tool buttons beside the brush slider, with keyboard shortcuts. Ideal for building containers and kilns. The sim already has `paintLine`; shapes are a few more `World` helpers plus input handling in `src/ui/input.ts`.
- [ ] **Pan and zoom on touch**: pinch to zoom into part of the grid, and drag with two fingers to pan (two fingers erase today).
- [ ] **Run the simulation in a Web Worker**: move `World.step()` off the main thread and pass the arrays across, so bigger grids stay smooth.
- [ ] **Sound**: quiet, procedurally generated crackles, hisses and booms with the Web Audio API (no audio files, no external requests).
- [ ] **Smarter liquids**: pressure, so water rises to the same level in connected containers (a U-bend).
- [ ] **Heat view legend**: a small temperature scale in the corner while heat view is on.
- [ ] **Accessibility**: a high-contrast palette option, and keyboard control of the brush position.

## Licence

MIT. See [LICENSE](LICENSE).
