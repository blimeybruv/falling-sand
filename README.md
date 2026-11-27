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
ten materials. The anomalies have their own reward: find all seven and you earn the transmuter. Progress is saved in your browser.

Switch to Sandbox mode (the Mode menu, behind the downward arrow on a phone) to have everything at once. Your
Discovery progress is kept for when you switch back.

## Controls

| Input | Action |
|---|---|
| Left-drag, or a finger | Draw the selected material (an outline shows the brush) |
| Right-drag | Erase (on a touch screen, pick the eraser) |
| Rest the mouse pointer | A small label beside it names the material underneath (and gives its temperature in heat view). It appears after a moment's pause and keeps out of the way while you draw |
| Mouse wheel, or pinch | Zoom in (up to 8×) and out, around the pointer; `=` / `+` and `_` too. Drag with the middle button or two fingers, or use the arrow keys, to look around. While zoomed, a readout in the corner shows the zoom: click it to see the whole grid again. Only the view changes, so the simulation runs as fast as ever |
| Number and letter keys | Pick a material (the key is shown on its palette button; a few have none) |
| A–Z button (beside the material tabs) | Sort the materials by name; press again for the usual order, grouped by kind. Remembered next time. In Discovery mode, materials not yet found stay after the rest, so it gives nothing away |
| `E` | Eraser |
| `[` and `]` | Smaller / bigger brush (or the Brush slider) |
| Drawing tools (beside the material tabs) | Brush (`Shift+B`), line (`Shift+L`), box (`Shift+R`), circle (`Shift+O`) and replace (`Shift+X`). Drag a line, box or circle out, with a preview, and let go to draw it; the brush size sets how thick it is, and the square button (`Shift+F`) fills boxes and circles, and the pin (`Shift+P`) draws powders fixed: sand, earth or gunpowder drawn with it on stay exactly where you put them (they still burn and react; a blast knocks them loose), for building shapes out of them. Creatures and seeds can't be pinned. Pins are kept in saves, share links and undo. A circle is centred where you start. Replace swaps the material you start on for the selected one (water for oil, say, leaving the tank alone). Right-drag erases with any tool |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo your last changes (strokes, shapes, Clear, loading a scene), up to 30 back; also in the Scene menu |
| `Space` | Pause / play |
| `.` | Step one frame while paused (or the Step button) |
| `T` | Heat view: colour everything by temperature, with a scale in the corner (or the Heat view button) |
| Speed menu | 0.25× to 3× simulation speed |
| Wind menu | Blow smoke, fire, steam and falling particles left or right; it sweeps loose powders up off the ground (snow and ash heaps are stripped grain by grain; sawdust flies; sand only rolls along the surface). Clouds sail along; in a strong wind, dunes creep and snow piles into drifts, fire races downwind, and flowers send seeds off on the breeze. Gusty swells and drops and now and then turns round |
| Edges button | Walls (the default: things pile up against the edges) or open: sand, liquids and creatures fall off the bottom, liquids and gases flow out of the sides and rise out of the top, and clouds sail off with the wind. Solid things you draw stay put, so you can build a floor |
| Collapse button | Structural collapse, off by default. When on, stone and basalt reach 10 cells sideways (or hanging) from support, concrete and obsidian 8, brick 6, ice 5, glass 3, and powders drawn with the pin only 2; past that they crumble (stone into gravel, glass into sand) and fall, a cell further each frame, so a bridge comes down in a ripple when you blast out its pillar. Columns stand at any height, a slab rests on a sand pile, and metal and wood never collapse, so an iron girder bridges any gap. Floors and bridges have a weight limit too: a glass floor over a gap holds a little sand but a deep pile crushes it, and a pinned sand bridge gives way under a heap; stone takes a lot |
| Speaker button | Sound on or off; hover over it (or tab to it) for a volume slider, which sits beside it on phones. Wind (following the Wind setting, gusting), crackling fire, booming explosions, thunder after lightning (with a corona sizzle as the charge builds before a near strike), hissing steam and acid, rain and pouring sand, bubbling lava, humming electricity, fireworks, buzzing bees, crying gulls and cawing crows, glass shattering in a blast and ice cracking as it melts or freezes over, a low throb near an anomaly (and everything muffled by hush), and a chime for each discovery. All made live with the Web Audio API, no sound files |
| Sun menu | Sunlight from above warms whatever it reaches first: it evaporates water (which rises and makes clouds), dries mud and salt water, burns off clouds and melts snow, but not in the shade. Glass lets it through. Plants grow faster in sunlight and slower in shade (moss the other way round). Sun on falling rain draws a faint rainbow. Vapour rising against a roof condenses on it, so a shallow tray of salt water under glass in the sun makes a solar still: fresh water drips back, salt is left behind. Day/night runs a three-minute day: the sky brightens, warms at dawn and dusk and fills with stars; clear nights chill whatever is open to the sky (a cloud or a roof keeps it warm), mist rises off water, ponds skin over with thin ice, and fog settling on frozen ground leaves frost. The morning sun melts it all |
| Scene menu | Undo and redo, save in this browser, load it again, download or open a scene file, or copy a share link. Also seven example scenes: a primordial wilderness (a new one each time: sea, hills and a peat bog, a smouldering volcano, and ore, coal, oil and a cave in the rock below), a volcano island, a fuse and charges, pond life, a thunderstorm, a forest to set alight, and five kinds of tree to watch grow |
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
| O | Loam | Rich soil: seeds grow tall trees on it without water, and grass spreads over it; after rain, mushrooms sprout on it in the shade | Earth with sand and clay around it |
| | Fertiliser | Seeds on it sprout without water, grass beside it spreads faster; enriches earth into loam | Ash meets saltpetre |
| | Compost | Rots down into loam | Mushroom in grass or leaves |
| 3 | Stone | Static and indestructible (only burning thermite melts it); conducts heat well | Starter |
| B | Brick | Static; insulates, never burns, and acid can't eat it | Fire clay in a kiln |
| Q | Glass | Static; acid can't eat it. Sand or gravel dropped on it from a height, or hail, smashes it into sand | Melt sand with lava or a charcoal fire |
| N | Obsidian | Black volcanic glass; indestructible | Lava meets ice |
| I | Ice | Static and cold; melts near heat, slowly freezes neighbouring water. Steam reaching the top of the sky now and then freezes into a crystal, which falls and melts where it lands (unless the ground is frozen) | Steam reaching the top |
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
| | Frost | Thin white coat; melts when warm | Steam meets dry ice, or fog on ground frozen by a clear night |
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
| 2 | Water | Falls and spreads sideways, and finds its level through a pipe or U-bend (as every liquid does); puts out fire, turning it to steam; boils when hot (now and then leaving salt); freezes next to ice | Starter |
| W | Salt water | Sinks under fresh water and never freezes; boiling it gives salt back, and so does the sun drying a shallow pool (deep water keeps its salt dissolved) | Salt meets water |
| 6 | Oil | Liquid, lighter than water (floats on it); burns fast | Bury wood under sand |
| | Tar | Thick, black and very slow; floats on water; burns smokily | Oil heated gently, before it catches |
| | Lye | Slippery liquid; neutralises acid into salt water | Ash meets water |
| | Foam | Light soap foam: floats on everything, smothers fires, then pops | Lye meets oil |
| | Fizz | Bubbling froth that gives off carbon dioxide | Ash meets acid |
| A | Acid | Liquid; dissolves what it touches (but not stone, water, glass, brick or obsidian), using itself up | Rain on smoke (or sulfur in water) |
| L | Lava | Slow, glowing, very hot liquid; sets things alight, boils water and sets to stone where they meet, and slowly crusts into basalt in open air | Reward for 10 discoveries |
| 0 | Smoke | Rises and drifts, then fades | Let a fire burn out |
| - | Steam | Rises; condenses back to water near the top or under a ceiling, sometimes freezing | Fire meets water |
| V | Cloud | Fair-weather cumulus: rises or sinks as one block to a level cloud base and gathers into a rounded heap, flat underneath and domed on top, white above and grey below; drizzles now and then (or snows near ice); the sun burns it off only slowly; sails along in the wind as a whole and breaks up, raining out, against mountains and the edge | Steam crowding at the top |
| | Storm cloud | The dark base of a cloud piled deep: pours, harder the deeper the cloud above, and strikes lightning; clears back into fair-weather cloud once it has rained itself thinner. A downpour hangs from it in faint grey shafts, and a storm raining itself out hangs rounded pouches (mammatus) under its base | A cloud 20 or more rows deep |
| | Cirrus | Thin, high streaks blown along by the wind; never rains, fades in about a minute | Water vapour rising above the cloud layer |
| | Carbon dioxide | Heavy, faint gas: sinks and pools, puts out flames, smothers what it buries | Burning charcoal or coal; fizz |
| | Hydrogen | The lightest gas; burns with a bang, leaving water | Electricity through fresh water |
| | Mercury | Liquid metal heavier than everything; sand floats on it; conducts | Burning sulfur against iron ore |
| | Alcohol | Runny, very flammable; sours to vinegar in the open | Sugar, water and mushroom |
| | Vinegar | Weak acid: fizzes with ash, cleans rust, greens copper | Alcohol left open to the air |
| | Chlorine | Heavy yellow-green gas; wilts plants | Electrified salt water |
| | Bleach | Kills algae, moss and mushrooms; clears stained glass | Chlorine meets lye |
| | Sulfur dioxide | Heavy choking gas; makes water acidic and clouds rain acid | Burning sulfur |
| | Fog | Thin mist that lingers low over the ground and pools in hollows, then evaporates | Steam meets snow or ice, or a clear night over water |
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
| X | Ash | Light powder left by fires; floats on water, and the wind lifts it off a heap and carries it away. Rich in potash: seeds grow into trees on it without water, and grass spreads faster beside it. Lying on soil it slowly soaks in over a minute or two, enriching it into loam | Wood, leaves or grass burning out |
| U | Sulfur | Yellow powder; burns with choking smoke; slowly turns water acidic | Lava meets water (now and then) |
| P | Saltpetre | White crystals (nitrate): grass spreads faster on it. Lightning striking soil leaves some | Leaves buried in earth, or lightning striking soil |
| G | Gunpowder | Powder; burns very fast with small blasts, so a line of it works as a fuse | Charcoal with sulfur and saltpetre |
| | Fireworks | Shoots up when lit, then bursts into coloured sparks | Gunpowder meets salt or rust |
| | Thermite | Hard to light; burns at 2500°, melts stone into lava and metal into molten iron | Rust meets charcoal |
| 8 | Napalm | Sticky, slow-flowing liquid; burns for a long time, is hard to put out, spreads fire | Oil meets gunpowder |
| 9 | Nitroglycerin | Liquid; explodes on fire, when hot, or when it falls hard onto something | Acid meets oil |
| | Dynamite | Stable explosive: ignores knocks, needs a flame, big blast | Nitroglycerin soaked into clay |
| | Swamp gas | Bubbles up from rotting weeds; flashes into fire | Drowned grass |
| | Soot | Black powder smoke leaves on cold surfaces; burns | Smoke meets cold stone, iron or ice |
| | Lightning | A short, hot bolt: sparks wires, sets things alight; draw it on a wire. Strikes bend to the highest metal nearby, so a copper or iron spire is a lightning rod | A storm cloud strikes |
| | Red sprite | Eerie red jellyfish of light flashing high above a storm | Lightning from a thick cloud with open sky above |
| | Battery | Sends pulses of electricity into touching metal or salt water | Iron and charcoal in salt water |
| | Solar cell | Silicon: sends pulses into touching metal while the sun shines on it (works under glass, not in shade) | Lightning through quartz touching graphite |
| | Dynamo | A magnet in a copper coil: sends pulses into touching metal while the wind turns it (out in the open) or water pours onto it | A magnet touching copper, out in the wind |
| | Accumulator | A rechargeable battery: stores the pulses fed into it (from a solar cell, say) and pays them out once the supply stops, so a circuit runs on after dark | Pulses from a solar cell or another battery arriving at a battery |
| | Thermocouple | Copper fused to iron: sends pulses while one side is far hotter than another, so a fire can power a circuit | Molten copper setting against iron |
| | Heat lamp | A carbon-filament bulb: powered, it glows and shines heat down in a narrow cone, fading with distance; thaws, dries, boils puddles and burns off cloud and fog | Graphite carrying a pulse against glass |
| | Plasma | Glowing gas at 4000° | Lightning through hydrogen, or gas past 2000° |
| | Briquette | Burns for ages at a steady heat | Charcoal meets clay |
| | Peat | Slow-burning fuel | Grass or moss buried under earth |
| | Smoke bomb | Lit, it pours out smoke | Saltpetre meets sugar |
| **Life** | | | |
| S | Seed | Falls and grows into a tree that suits where it lands: on damp ground, ash or fertiliser a broadleaf (thick-trunked when tall, with forking branches); on loam a flowering tree (or bamboo right by water); beside fresh water a willow with hanging curtains of leaves; on a sandy shore by the sea a palm; on dry sand far from water, a cactus. A seed from a pine cone grows a pine, even on poor dry ground. Very rarely, on rich ground, a giant tree. Sprouts fastest on ash or in smoke, as after a forest fire | Starter |
| 5 | Grass | Weeds and grass: spreads over damp ground and loam, and into water; burns | A sandy shore |
| 4 | Wood | Static; burns slowly; buried under sand it slowly turns to oil | Grow a tree |
| | Flower | Blooms on trees grown in loam; now and then drops a seed | A tree rooted in loam |
| | Mushroom | Grows in buried damp wood and slowly eats through wood and leaves; sprouts on loam in damp shade after rain; rots into compost after a minute or so | Wood buried in damp ground, or rain on loam in the shade |
| | Vine | Climbs wood, stone and brick walls | Grass meets wood |
| | Seaweed | Kelp: grows up through salt water in wavering stalks of mixed heights, putting out fronds | Grass meets salt water |
| | Cactus | Grows in the desert; burning releases water | A seed on dry sand far from water |
| | Sap | Slow, sticky amber liquid | Wood tapped with iron |
| | Sugar | Sweet white powder | Sap heated past 120° |
| | Caramel | Sticky, very slow brown liquid, fresh from the heat; sets into toffee as it cools; burns | Sugar heated past 160° |
| | Toffee | Caramel set hard; melts back above 100° | Caramel left to cool |
| | Candy floss | Pink fluff, light as air; gone at a touch of water | Hot caramel caught by the wind |
| | Popcorn | Seeds that pop and jump in the heat, with a little pop you can hear | Seeds heated past 180° |
| | Fruit | Ripens from flowers and falls; rots into a seed. Dropped from high up, it bursts into pulp | Flowers ripen |
| | Pulp | Thick slurry of broken-down wood | Wood meets lye |
| | Paper | Catches fire very easily | Pulp dried past 100° |
| | Bamboo | Shoots up fast in tall stalks | A seed on loam right beside water |
| | Amber | Golden solid | Sap left on sand |
| | Honeydew | Sweet drops that ferment like sugar | Flowers drip it |
| | Honey | Thick, golden, very slow | Bees on honeydew |
| | Sawdust | Very light: a gust sends nearly all of it flying, far downwind; catches fire easily | Termites eating wood |
| | Earthworm | Creature: burrows through earth, leaving loam, and works ash beside it into the soil; comes up to the surface when rain lies on the ground; drowns if it falls into water | Damp loam |
| | Termite | Creature: eats wood into sawdust; dies out in the open | Rotting wood (mushrooms) |
| | Fish | Creature: swims, eats algae, breeds; can't survive out of water; stunned by a nearby blast, it floats up and comes round | Water under algae |
| | Firefly | Creature: drifts over grass, glowing | Grass with open air above |
| | Bee | Creature: turns honeydew into honey | Flowers draw them |
| | Snail | Creature: creeps over damp stone eating algae and moss; withdraws into its shell in strong dry sun | Moss beside water |
| | Seagull | Creature: wheels over open water, floats on it and dives for fish; cries now and then. Starves without fish | A fish near the surface of open water |
| | Pine cone | Drops from a tree crown as it burns (and now and then from a living pine); fireproof, it opens into a pine seed once the fire has passed and it has cooled | A tree crown burning |
| | Crow | Creature: flies low over the land, perches, and swoops on earthworms out on the surface; caws. Starves without worms | An earthworm out on the surface (rain brings them up) |
| | Ant | Digs earth and sand and carries the grains up into anthills; eats sweet things; drowns in water | Sugar on earth |
| | Yeast | In water, ferments sugar into alcohol and bubbles of carbon dioxide, multiplying while fed | Fruit soaking in water |
| | Coral polyp | Fixed in salt water, slowly builds a reef of coral rock, faster when warm; bleaches when too hot | Algae on sun-warmed salt water |
| R | Moss | Creeps over damp stone and brick | Grass touching stone |
| Y | Algae | Floats and spreads across the surface of water in drifting rafts (never a solid mat), now and then dying back; fish eat it | Weeds reaching the surface |
| | **Tools** | | |
| E | Eraser | Clears cells | Always available |
| **Anomalies** | | | |
| | Cold sun | Heat flows into it: everything around it is chilled hard, so water freezes and fire goes out; it glows brighter the more heat it drinks. Shrugs off blasts, like every anomaly | Dry ice touched by plasma |
| | Lift field | Gravity runs backwards around it: sand and water nearby fountain up out of it and rain down outside | Lightning striking a magnet wrapped in plasma |
| | Gravity knot | Everything falls towards it: it pulls loose grains and drops in from all sides and crushes what it holds, sand and earth into stone, coal into diamond, snow into ice | A diamond caught in the heart of a blast |
| | Stasis pocket | Time runs slow around it: fire, water and creatures nearby move in slow motion | A red sprite touching stone, earth or sand |
| | Arc node | Insulation fails around it: every so often it throws an arc of lightning at something nearby, conductor or not, setting it alight | Lightning striking graphite under salt water |
| | Phase fault | Phase changes come loose around it: ice thaws, water boils and metal melts nearby without being heated, and changes back a little way off as it cools | Plasma touching mercury |
| | Linked gate | Distance comes loose: a grain or drop falling into one gate comes out under another (every gate is linked to every other); gas rising into one comes out of the top of another | Lightning striking an arc node |
| | Transmuter | Slowly turns its neighbours one step along a chain (rust to iron to copper to gold, coal to graphite to diamond, sand or stone to quartz), then after half a minute to a minute burns out into slag | Reward for finding every other anomaly |
| **Eldritch** | | | |
| | Umbral ooze | A slow black liquid that eats the light around it (everything near it darkens); sunlight and heat boil it away, so it pools in shadow | Ink sealed in obsidian, with no air around it |
| | Hush | A pale mist that swallows sound: the whole soundscape fades the more of it there is, and fire inside it gutters out | Fog drifting through umbral ooze |
| | Creeping bloom | A faintly glowing growth that spreads over wood, plants and stone in the dark, feeding on them; sunlight withers it, heat kills it, it burns readily, and with nothing left to eat it dies back | A mushroom beside umbral ooze |
| | Mimic dust | Takes on the colour of whatever it touches, and never quite settles: hard to spot until it moves | Sand caught in a phase fault |
| | Wrong water | Falls towards the nearest wall instead of down, and climbs it | Water that has passed through linked gates |
| | Watching stone | Only changes while nothing is watching it: with the pointer away, it slowly turns the rock and earth around it into more of itself; with the pointer over it, it stops. It can't cross water or salt | A transmuter burning out walled in by obsidian |

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
    discovery.ts   Discovery mode: starters, recipes and hints, the rewards, progress
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

- [ ] **A wind pass over every material** (later, no hurry): go through the table and give each material wind values that match how it really behaves (`wind` for things in the air, `drifts` and `lofts` for powders on the ground), measured in the sim, so seeds, leaves, feathers, flour-like powders, smoke and spray all respond in proportion. Sand stays as it is until then: when it was made to loft like sawdust, a wind reshaped the example scenes too drastically, so it only rolls along the surface. A player's suggestion.
- [ ] **More pressure**: liquids already find their level through a U-bend; real pressure would add fountains from a high tank and dams bursting, and gas pressure a sealed pot bursting. See "Physics depth" in [`docs/elements.md`](docs/elements.md).
- [ ] **More materials**: pick one from [`docs/elements.md`](docs/elements.md). Each is a table entry, usually a `Reaction`, and a line in `RECIPES`; the tests check every one can be discovered.
- [ ] **Discovery goals**: small challenges once everything is unlocked ("grow a forest of 5 trees", "boil a whole pond").
- [ ] **Run the simulation in a Web Worker**: move `World.step()` off the main thread and pass the arrays across, so bigger grids stay smooth.
- [ ] **Accessibility**: a high-contrast palette option, and keyboard control of the brush position.

## Licence

MIT. See [LICENSE](LICENSE).
