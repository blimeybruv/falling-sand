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

Switch to Sandbox mode (the Mode menu, behind the downward arrow on a phone) to have everything at once. Your
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
| Wind menu | Blow smoke, fire, steam and falling particles left or right. Clouds sail along; in a strong wind, dunes creep and snow piles into drifts, fire races downwind, and flowers send seeds off on the breeze |
| Speaker button | Sound on or off. Wind (following the Wind setting, gusting), crackling fire, booming explosions, thunder after lightning (with a corona sizzle as the charge builds before a near strike), hissing steam and acid, rain and pouring sand, bubbling lava, humming electricity, fireworks, buzzing bees, and a chime for each discovery. All made live with the Web Audio API, no sound files |
| Sun menu | Sunlight from above warms whatever it reaches first: it evaporates water (which rises and makes clouds), dries mud and salt water, burns off clouds and melts snow, but not in the shade. Glass lets it through. Plants grow faster in sunlight and slower in shade (moss the other way round) |
| Scene menu | Save in this browser, load it again, download or open a scene file, or copy a share link |
| `J` or Journal button | Discovery journal: what you've found, and hints for the rest |
| Mode menu | Discovery or Sandbox |
| Clear button | Empty the whole grid |
| `?` or `H` | Show or hide the controls panel |

The palette has tabs (All, Ground, Liquids & gases, Fire & blasts, Life). Picking a material by its
key jumps to its tab. On a phone, the palette is a single row you can scroll sideways, and the
less-used controls fold away: the downward arrow in the top bar opens them, and the upward
arrow along the bottom of the open bar folds them away again.

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
| | Fertiliser | Seeds on it sprout without water, grass beside it spreads faster; enriches earth into loam | Ash meets saltpetre |
| | Compost | Rots down into loam | Mushroom in grass or leaves |
| 3 | Stone | Static and indestructible (only burning thermite melts it); conducts heat well | Starter |
| B | Brick | Static; insulates, never burns, and acid can't eat it | Fire clay in a kiln |
| Q | Glass | Static; acid can't eat it | Melt sand with lava or a charcoal fire |
| N | Obsidian | Black volcanic glass; indestructible | Lava meets ice |
| I | Ice | Static and cold; melts near heat, slowly freezes neighbouring water | Steam reaching the top |
| | Icicle | Grows downward where water drips past ice; melts when warm | Water dripping past ice |
| F | Snow | Light, cold powder; melts near warmth | A cloud near ice |
| Z | Salt | Dissolves in water (salt water) and melts ice | Boiling water leaves some behind |
| | Iron ore | Rusty-speckled rock | Lava meets water (rarely) |
| | Iron | Metal; conducts heat fast; rusts in water, much faster in salt water; carrying a pulse, it's an electromagnet that pulls iron filings | Burning charcoal against iron ore |
| | Rust | Crumbly orange powder | Iron in water |
| | Copper ore | Green-speckled rock | Lava meets salt water (rarely) |
| | Copper | Conducts electricity and heat; never rusts | Burning charcoal against copper ore |
| | Verdigris | Green crust on copper; doesn't conduct | Copper meets salt water or vinegar |
| | Gold | Heavy shining flecks; conducts, never tarnishes | Mercury pans sand |
| | Stalactite | Mineral points growing down from stone ceilings | Salt water under a stone ceiling |
| | Rubber | Never conducts; acid-proof; burns smokily | Sap meets sulfur |
| | Iron filings | Powder that conducts and rusts; magnets pull it | Explosions shatter iron |
| | Magnet | Pulls iron filings and rust towards it | Lightning on iron |
| | Steel | Conducts, never rusts | Molten iron meets charcoal |
| | Wax | Melts when warm, sets when cool; burns like a candle | Tar meets steam |
| | Glaze | Shiny, waterproof, acid-proof tiles | Salt on hot brick |
| | Tin | Soft silvery metal; conducts | Lava meets mud |
| | Bronze | Conducts; never rusts or greens | Molten copper meets tin |
| | Slag | Glassy waste powder | Molten iron meets sand |
| | Basalt | Dark volcanic rock | Lava cooling in open air |
| | Coral rock | Reef rock built by coral polyps; fizzes in acid, shatters into sand | Coral polyps build it |
| | Geyser rock | When hot, now and then blasts water and steam upward | Basalt meets water |
| | Spring | A vent: trickles water up through the rock (and through its own pond) until the aquifer runs dry, then turns to stone | Water in gravel under stone |
| | Brine spring | A vent of salt water | Salt water in gravel under stone |
| | Gas vent | A vent of swamp gas; light it for a long-burning flame | Swamp gas trapped under stone |
| | Gusher | A vent that blows oil high into the air in bursts | Oil reaching a gas vent |
| | Fumarole | A hot vent breathing steam and now and then sulfur | Steam on hot basalt |
| | Mud pot | A warm vent blooping up mud | Mud over a fumarole |
| | Volcanic vent | Erupts lava in bursts, then cools to basalt when spent | Lava sealed under stone |
| | Sinkhole | Liquids that reach it drain away underground | Acid eating through chalk |
| | Salt crystal | Clear pink shards that keep growing | Salt water touching ice |
| | Glass fibre | Light strands that hardly let heat through | Molten glass in the wind |
| | Quartz | Clear crystal; melts into glass at 900° | Sand buried deep under heat |
| | Tar sand | Sticky black sand; heated, gives back oil | Tar meets sand |
| | Gravel | Coarse stony powder | Blasting basalt, brick, terracotta or slag |
| | Concrete | Indestructible, acid-proof | Cement meets gravel |
| | Terracotta | Porous tiles: water seeps through | Clay fired gently (120–250°) |
| | Porcelain | White, hard, acid-proof | Ash on brick past 450° |
| | Adobe | Earthy blocks; crumble in water | Mud meets grass |
| | Quicklime | Gets fiercely hot when wet | Stalactite past 800° |
| | Slaked lime | Thick white paste | Quicklime meets water |
| | Mortar | Sets into stone | Slaked lime meets sand |
| | Frost | Thin white coat; melts when warm | Steam meets dry ice |
| | Permafrost | Frozen ground; thaws into mud | Earth touching ice |
| | Graphite | Conducts electricity | Lightning through charcoal |
| | Fulgurite | Glassy tubes of fused sand where lightning struck | Lightning striking sand |
| | Diamond | Sparkling, indestructible | Graphite past 1600° |
| | Chalk | Snail shells: fizzes in acid, burns to quicklime | What a snail leaves |
| | Cement | Pours like a thick liquid, then sets into stone | Ash, sand and water stirred together |
| | Pumice | Light, holey rock that floats on water | Lava meets carbon dioxide |
| | Quicksand | Looks like wet sand, but powders sink slowly into it | Sand meets salt water |
| | Hail | Ice pellets that fall from clouds near ice, then melt | A cloud near ice (sometimes) |
| | Dry ice | Very cold; freezes water and slowly turns back into gas | Carbon dioxide meets ice or snow |
| | Stained glass | Coloured glass; acid can't eat it | Glass meets rust |
| **Liquids & gases** | | | |
| 2 | Water | Falls and spreads sideways; puts out fire, turning it to steam; boils when hot (now and then leaving salt); freezes next to ice | Starter |
| W | Salt water | Sinks under fresh water and never freezes; boiling it gives salt back | Salt meets water |
| 6 | Oil | Liquid, lighter than water (floats on it); burns fast | Bury wood under sand |
| | Tar | Thick, black and very slow; floats on water; burns smokily | Oil heated gently, before it catches |
| | Lye | Slippery liquid; neutralises acid into salt water | Ash meets water |
| | Foam | Light soap foam: floats on everything, smothers fires, then pops | Lye meets oil |
| | Fizz | Bubbling froth that gives off carbon dioxide | Ash meets acid |
| A | Acid | Liquid; dissolves what it touches (but not stone, water, glass, brick or obsidian), using itself up | Rain on smoke (or sulfur in water) |
| L | Lava | Slow, glowing, very hot liquid; sets things alight, boils water and sets to stone where they meet, and slowly crusts into basalt in open air | Reward for 10 discoveries |
| 0 | Smoke | Rises and drifts, then fades | Let a fire burn out |
| - | Steam | Rises; condenses back to water near the top or under a ceiling, sometimes freezing | Fire meets water |
| V | Cloud | Billows below the upper atmosphere, darker the thicker it is; sails along in the wind as a whole and breaks up, raining out, against mountains and the edge; rains (or snows near ice) | Steam crowding at the top |
| | Carbon dioxide | Heavy, faint gas: sinks and pools, puts out flames, smothers what it buries | Burning charcoal or coal; fizz |
| | Hydrogen | The lightest gas; burns with a bang, leaving water | Electricity through fresh water |
| | Mercury | Liquid metal heavier than everything; sand floats on it; conducts | Burning sulfur against iron ore |
| | Alcohol | Runny, very flammable; sours to vinegar in the open | Sugar, water and mushroom |
| | Vinegar | Weak acid: fizzes with ash, cleans rust, greens copper | Alcohol left open to the air |
| | Chlorine | Heavy yellow-green gas; wilts plants | Electrified salt water |
| | Bleach | Kills algae, moss and mushrooms; clears stained glass | Chlorine meets lye |
| | Sulfur dioxide | Heavy choking gas; makes water acidic and clouds rain acid | Burning sulfur |
| | Fog | Thin mist that lingers low and drifts | Steam meets snow or ice |
| | Ink | Deep blue-black liquid that burns | Soot meets oil |
| | Ozone | Faint gas left by lightning; bleaches | Lightning fades |
| | Neon | Glows bright pink while electricity passes through it (keep it in a glass tube) | Plasma touching glass |
| | Red paint | Thick red paint that dries where it lies | Rust meets oil |
| | Molten glass | Glowing slow liquid that sets back into glass | Glass past 1200° |
| | Molten iron | White-hot liquid metal that sets back into iron | Iron past 1500°, or burning thermite |
| | Molten copper | Liquid copper that sets back; with tin, bronze | Copper past 1100° |
| | Brimstone | Red liquid sulfur that sets back to yellow | Sulfur past 115° |
| | Soap bubble | Floats up and pops | Foam in the wind |
| **Fire & blasts** | | | |
| 7 | Fire | Short-lived; rises and flickers; ignites flammable neighbours | Starter |
| K | Charcoal | Burns slowly and very hot, glowing rather than flaming; hot enough to make glass | Smother a wood fire with sand |
| | Coal | Burns for a very long time, very hot | Charcoal buried with no air and baked past 200° |
| X | Ash | Light powder left by fires; floats on water and blows in the wind | Wood, leaves or grass burning out |
| U | Sulfur | Yellow powder; burns with choking smoke; slowly turns water acidic | Lava meets water (now and then) |
| P | Saltpetre | White crystals | Leaves buried in earth |
| G | Gunpowder | Powder; burns very fast with small blasts, so a line of it works as a fuse | Charcoal with sulfur and saltpetre |
| | Fireworks | Shoots up when lit, then bursts into coloured sparks | Gunpowder meets salt or rust |
| | Thermite | Hard to light; burns at 2500°, melts stone into lava and metal into molten iron | Rust meets charcoal |
| 8 | Napalm | Sticky, slow-flowing liquid; burns for a long time, is hard to put out, spreads fire | Oil meets gunpowder |
| 9 | Nitroglycerin | Liquid; explodes on fire, when hot, or when it falls hard onto something | Acid meets oil |
| | Dynamite | Stable explosive: ignores knocks, needs a flame, big blast | Nitroglycerin soaked into clay |
| | Swamp gas | Bubbles up from rotting weeds; flashes into fire | Drowned grass |
| | Soot | Black powder smoke leaves on cold surfaces; burns | Smoke meets cold stone, iron or ice |
| | Lightning | A short, hot bolt: sparks wires, sets things alight; draw it on a wire. Strikes bend to the highest metal nearby, so a copper or iron spire is a lightning rod | A thick cloud strikes |
| | Red sprite | Eerie red jellyfish of light flashing high above a storm | Lightning from a thick cloud with open sky above |
| | Battery | Sends pulses of electricity into touching metal or salt water | Iron and charcoal in salt water |
| | Solar cell | Silicon: sends pulses into touching metal while the sun shines on it (works under glass, not in shade) | Lightning through quartz touching graphite |
| | Dynamo | A magnet in a copper coil: sends pulses into touching metal while the wind turns it (out in the open) or water pours onto it | A magnet touching copper, out in the wind |
| | Plasma | Glowing gas at 4000° | Lightning through hydrogen, or gas past 2000° |
| | Briquette | Burns for ages at a steady heat | Charcoal meets clay |
| | Peat | Slow-burning fuel | Grass or moss buried under earth |
| | Smoke bomb | Lit, it pours out smoke | Saltpetre meets sugar |
| **Life** | | | |
| S | Seed | Falls; on loam, or on damp sand or earth, it grows into a tree (wood trunk, branches, leaves); on dry sand far from water, a cactus | Starter |
| 5 | Grass | Weeds and grass: spreads over damp ground and loam, and into water; burns | A sandy shore |
| 4 | Wood | Static; burns slowly; buried under sand it slowly turns to oil | Grow a tree |
| | Flower | Blooms on trees grown in loam; now and then drops a seed | A tree rooted in loam |
| | Mushroom | Grows in buried damp wood and slowly eats through wood and leaves | Wood buried in damp ground |
| | Vine | Climbs wood, stone and brick walls | Grass meets wood |
| | Seaweed | Grows upward through salt water | Grass meets salt water |
| | Cactus | Grows in the desert; burning releases water | A seed on dry sand far from water |
| | Sap | Slow, sticky amber liquid | Wood tapped with iron |
| | Sugar | Sweet white powder | Sap heated past 120° |
| | Caramel | Sticky, very slow brown liquid, fresh from the heat; sets into toffee as it cools; burns | Sugar heated past 160° |
| | Toffee | Caramel set hard; melts back above 100° | Caramel left to cool |
| | Candy floss | Pink fluff, light as air; gone at a touch of water | Hot caramel caught by the wind |
| | Popcorn | Seeds that pop and jump in the heat, with a little pop you can hear | Seeds heated past 180° |
| | Fruit | Ripens from flowers and falls; rots into a seed | Flowers ripen |
| | Pulp | Thick slurry of broken-down wood | Wood meets lye |
| | Paper | Catches fire very easily | Pulp dried past 100° |
| | Bamboo | Shoots up fast in tall stalks | A seed on loam right beside water |
| | Amber | Golden solid | Sap left on sand |
| | Honeydew | Sweet drops that ferment like sugar | Flowers drip it |
| | Honey | Thick, golden, very slow | Bees on honeydew |
| | Sawdust | Light, catches fire easily | Termites eating wood |
| | Earthworm | Creature: burrows through earth, leaving loam; drowns in water | Damp loam |
| | Termite | Creature: eats wood into sawdust; dies out in the open | Rotting wood (mushrooms) |
| | Fish | Creature: swims, eats algae, breeds; can't survive out of water | Water under algae |
| | Firefly | Creature: drifts over grass, glowing | Grass with open air above |
| | Bee | Creature: turns honeydew into honey | Flowers draw them |
| | Snail | Creature: creeps over damp stone eating algae and moss | Moss beside water |
| | Ant | Digs earth and sand and carries the grains up into anthills; eats sweet things; drowns in water | Sugar on earth |
| | Yeast | In water, ferments sugar into alcohol and bubbles of carbon dioxide, multiplying while fed | Fruit soaking in water |
| | Coral polyp | Fixed in salt water, slowly builds a reef of coral rock, faster when warm; bleaches when too hot | Algae on sun-warmed salt water |
| R | Moss | Creeps over damp stone and brick | Grass touching stone |
| Y | Algae | Floats and spreads across water | Weeds reaching the surface |
| | **Tools** | | |
| E | Eraser | Clears cells | Always available |

The Discovery column gives the answers away, so skip it if you'd rather find them yourself.

Burning works per cell: wood, grass, leaves, oil, napalm and gunpowder keep their material while they burn
(they flicker with fire colours), throw off flames, set their neighbours alight, and finally burn out.
Water can put burning cells out, but how easily depends on the material (napalm hardly at all).

**Electricity** pulses along anything that conducts (iron, copper, salt water, mercury), one cell a frame.
A pulse warms the wire, sets flammable things beside it alight (so a wire makes a detonator) and
splits fresh water into hydrogen (salt water gives off chlorine). Draw Lightning on a wire to send a pulse, or build a battery. Big storms strike lightning, and now
and then throw red sprites, eerie jellyfish of red light, into the clear sky above the clouds.

**Creatures** are single cells with a simple life: each needs its habitat and food, breeds slowly
once fed and dies into something, so none can overrun a scene. Earthworms make loam, termites eat
wood, fish keep algae down, bees make honey, snails leave chalk, and fireflies just glow.

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
chains (neon, toffee, popcorn, icicles, fertiliser, compost...), with recipes and effort
estimates.

- [ ] **A primordial wilderness map**: a pre-generated starting world (from a seed, so it can be shared and regenerated) that looks like untouched prehistoric land: layered rock with ore veins and a buried oil pocket, a smouldering volcano with a lava chamber, a salt-water sea with sandy shores and seaweed, caves with stalactites, loam hills with grass and trees, a peat bog, and storm clouds over it all. Offered from the Scene menu. Loading it shouldn't count as discoveries (scenes already don't), so it doubles as a sandbox for Discovery mode.
- [ ] **Load-bearing materials**: see the design note in [`docs/elements.md`](docs/elements.md). (Vents are built.)
- [ ] **More materials**: pick one from [`docs/elements.md`](docs/elements.md). Each is a table entry, usually a `Reaction`, and a line in `RECIPES`; the tests check every one can be discovered.
- [ ] **Discovery goals**: small challenges once everything is unlocked ("grow a forest of 5 trees", "boil a whole pond").
- [ ] **Metal and electricity**: a conductive solid, plus a spark that travels through connected metal and ignites or explodes what it reaches.
- [ ] **Undo**: keep the last few scenes in memory (the scene format is small) and restore one with `Ctrl+Z`.
- [ ] **Example scenes**: a handful of built-in scenes (a volcano, a fuse and charges, a pond with plants) in a menu, stored as share-link text.
- [ ] **Line and shape tools**: drag to draw a straight line, a rectangle or a circle (outline or filled) in the selected material, with a preview outline while dragging, plus a "replace" brush that swaps one material for another. Tool buttons beside the brush slider, with keyboard shortcuts. Ideal for building containers and kilns. The sim already has `paintLine`; shapes are a few more `World` helpers plus input handling in `src/ui/input.ts`.
- [ ] **Pan and zoom on touch**: pinch to zoom into part of the grid, and drag with two fingers to pan (two fingers erase today).
- [ ] **Run the simulation in a Web Worker**: move `World.step()` off the main thread and pass the arrays across, so bigger grids stay smooth.
- [ ] **More sound**: a volume slider; ice cracking, glass shattering.
- [ ] **Smarter liquids**: pressure, so water rises to the same level in connected containers (a U-bend).
- [ ] **Heat view legend**: a small temperature scale in the corner while heat view is on.
- [ ] **Accessibility**: a high-contrast palette option, and keyboard control of the brush position.

## Licence

MIT. See [LICENSE](LICENSE).
