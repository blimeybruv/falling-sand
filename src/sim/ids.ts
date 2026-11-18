/**
 * Material ids. A cell's material is stored as one of these numbers in a Uint8Array.
 * Kept in its own file so materials.ts and behaviours.ts can both import it without a cycle.
 * When adding a material, append a new id here (never renumber existing ones).
 */
export const M = {
  Empty: 0,
  Sand: 1,
  Water: 2,
  Stone: 3,
  Wood: 4,
  Plant: 5,
  Oil: 6,
  Fire: 7,
  Smoke: 8,
  Steam: 9,
  Napalm: 10,
  Nitro: 11,
  Acid: 12,
  Lava: 13,
  Ice: 14,
  Gunpowder: 15,
} as const;

export type MaterialId = (typeof M)[keyof typeof M];
