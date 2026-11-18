# Element ideas

A menu of materials for contributors to pick from, grouped into chains so each one leads to
another. Recipes should follow from the physics where possible, so players can guess them in
Discovery mode. See `CLAUDE.md` for how to add a material and make it discoverable.

**Effort:** **T** = a table entry plus a `Reaction`, no code · **F** = one small function in
`behaviours.ts` · **S** = needs a new system.

**Status:** ✅ built · blank = up for grabs.

## Fire and fuel

| | Material | How it's made | What it does | Leads to | Effort |
|---|---|---|---|---|---|
| ✅ | Charcoal | Burning wood smothered with sand | Black powder; burns slowly and very hot, glowing with few flames | Gunpowder, glass | T |
| ✅ | Ash | Wood, leaves and grass sometimes leave ash when they burn out | Light grey powder that floats on water and blows in the wind | Lye, fertile soil | T |
| | Coal | Charcoal or wood buried deep and kept hot for a long time | Like charcoal, but burns even longer | Fuel for smelting | F |
| | Swamp gas | Grass or leaves rotting underwater | A faint gas that bubbles up and flashes into fire if it meets a flame | Fun with ponds | T |
| | Tar | Oil heated without burning | Very sticky, slow and black; burns smokily | Waterproofing, roads | T |

## Earth and building

| | Material | How it's made | What it does | Leads to | Effort |
|---|---|---|---|---|---|
| ✅ | Mud | Earth plus water | Thick, slow liquid; dries back to earth when heated; turns to clay if left in water | Clay | T |
| ✅ | Brick | Clay fired in a kiln | Static; insulates, doesn't burn, and acid can't eat it | Furnaces | T |
| ✅ | Glass | Sand heated very hot (lava, or a charcoal fire) | Static and pale; acid can't eat it | Containers for acid | T |
| ✅ | Obsidian | Lava cooled fast by ice | Black, glassy and indestructible | Bragging rights | T |
| | Cement | Ash plus sand plus water | Pours like a liquid, then sets into stone | Building | F |

## Water and weather

| | Material | How it's made | What it does | Leads to | Effort |
|---|---|---|---|---|---|
| | Salt | Salt water boiled dry | White powder; melts ice; dissolves in water | Salt water, saltpetre | T |
| | Salt water | Salt plus water | Heavier than fresh water and doesn't freeze; boiling it leaves salt behind | Salt | T |
| | Cloud | Lots of steam gathered at the top | Drifts in the wind and rains water drops | Rain, snow, lightning | F |
| | Snow | A cloud above ice, or rain falling past ice | Soft, light powder that melts into water | | T |
| | Lightning | A big enough cloud | A spark that strikes down and sets things alight | Electricity | S |

## Life

| | Material | How it's made | What it does | Leads to | Effort |
|---|---|---|---|---|---|
| | Moss | Grass next to stone near water | Creeps slowly over damp stone | Decoration | T |
| | Algae | Grass in still water | A green scum spreading across the water's surface | Swamp gas | T |
| | Mushroom | Seeds or wood in damp, dark, enclosed places | Spreads through wood, slowly eating it | Rot, compost | F |
| | Flower | A tree growing on loam, sometimes | Colourful; drops new seeds | Makes seeds discoverable instead of a starter | F |

## Chemistry and metal

| | Material | How it's made | What it does | Leads to | Effort |
|---|---|---|---|---|---|
| ✅ | Sulfur | Lava meeting water sometimes leaves yellow deposits | Yellow powder; burns with choking smoke; slowly turns water acidic | Gunpowder, acid | T |
| ✅ | Saltpetre | Leaves buried in earth | White crystals | Gunpowder | T |
| ✅ | Gunpowder (reworked) | Charcoal, sulfur and saltpetre together | Burns very fast with small blasts | Fuses, fireworks | F |
| | Lye | Ash plus water | A mild, slippery liquid | Soap | T |
| | Soap / foam | Lye plus oil | Foam floats and smothers fires | Firefighting | T |
| | Iron ore | Found in stone; acid exposes it | Speckled stone | Iron | T |
| | Iron | Ore plus charcoal plus heat (smelting) | Static metal; conducts heat fast | Rust, thermite, electricity | T |
| | Rust | Iron plus water, over time | Crumbles into orange powder | Thermite | T |
| | Thermite | Rust plus iron powder | Burns hotter than anything and melts through stone (the one exception to stone being indestructible) | Chaos | F |
| | Fireworks | Gunpowder plus a metal | Shoots up and bursts into coloured sparks | Celebrations | F |

## Notes

- Electricity (lightning, conducting metal, sparks) is the biggest missing system: a per-cell
  charge that travels through conductors. Worth designing on its own before building on it.
- Avoid reactions that fire constantly in ordinary sandbox play; slow ones (chances of 0.001–0.01
  per frame) feel like nature, fast ones feel like a bug.
