/** Small, fast, seedable PRNG (mulberry32), so simulation tests are deterministic. */
export class Rng {
  private state: number;

  constructor(seed = 0x2f6b1d3) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** -1 or 1. */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}
