/**
 * Sound, synthesised live with the Web Audio API (no sound files, no requests). The simulation
 * makes no sound itself: every couple of frames this samples the grid (a sixth of the cells, a
 * different sixth each time) and reads the sim's `noise` counters, then sets the soundscape:
 *
 *   wind         filtered brown noise, gusting, following the Wind setting
 *   fire         random crackles and pops, and a low roar under a big blaze
 *   explosions   a thump falling in pitch plus a rumbling burst, bigger with the blast
 *   lightning    thunder after the flash: a crack and rumble near, a later, deeper roll far off;
 *                before a near strike, the corona: a sizzling crackle as the charge builds
 *   steam, acid  a hiss
 *   rain, pours  a patter of drops over a soft wash; pouring powder, a grainy hush
 *   lava         slow, deep bubbles
 *   electricity  a mains hum
 *   fireworks    a pop, then tinkling sparks
 *   bees         a faint wavering buzz
 *   discovery    a bright chime (a longer one for the reward)
 *
 * Browsers only allow audio after the player's first tap or key press, so nothing starts before
 * that. The player can switch sound off (saved). The audio context is suspended whenever there's
 * nothing to hear, while the game is paused, and while the tab is hidden.
 */
import { M, MATERIALS, type World } from '../sim';

const SOUND_KEY = 'falling-sand.sound';
/** Overall volume (before the compressor that keeps stacked booms from clipping). */
const MASTER = 0.5;
/** Wind volume at full strength (before gusts). */
const WIND_VOLUME = 0.9;
/** Seconds of quiet before the audio context is suspended. */
const IDLE_SECONDS = 2;
/** Sample the grid every this many frames, looking at every STRIDE-th cell. */
const SAMPLE_EVERY = 2;
const STRIDE = 6;
/** Seconds between corona episodes, however many charges overlap in a big storm. */
const CORONA_GAP = 1.5;
/** A corona swells for at least this long before a strike can end it. */
const CORONA_MIN = 0.6;

const EMPTY: number = M.Empty;
const FIRE: number = M.Fire;
const LAVA: number = M.Lava;
const BEE: number = M.Bee;
const SPARK: number = M.Spark;
const BOLT: number = M.Lightning;
const LIQUID = Uint8Array.from(MATERIALS, (d) => (d.kind === 'liquid' ? 1 : 0));
const POWDER = Uint8Array.from(MATERIALS, (d) => (d.kind === 'powder' ? 1 : 0));

function readEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice just won't persist.
  }
}

/** Two seconds of noise: white (every sample independent) or brown (random steps, a deep rush). */
function noiseBuffer(ctx: AudioContext, brown: boolean): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white * 0.5;
    }
  }
  return buffer;
}

/** How many of something happen in `dt` seconds at `rate` per second (randomly rounded), at most `cap`. */
function events(rate: number, dt: number, cap: number): number {
  const e = rate * dt;
  return Math.min(cap, Math.floor(e) + (Math.random() < e - Math.floor(e) ? 1 : 0));
}

/** What a sample of the grid found (counts scaled up to the whole grid). */
interface Heard {
  fire: number;
  fallingLiquid: number;
  fallingPowder: number;
  lava: number;
  charged: number;
  bees: number;
  sparks: number;
  bolts: number;
}

/** A continuous sound whose loudness follows the scene: a source through a filter into a gain. */
interface Loop {
  gain: GainNode;
  target: number;
}

export class Sound {
  enabled = readEnabled();
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private loops: Record<'roar' | 'hiss' | 'wash' | 'hush' | 'hum' | 'buzz', Loop> | null = null;
  private crackleBus: AudioNode | null = null;
  private dripBus: AudioNode | null = null;
  private coronaBus: AudioNode | null = null;
  private sizzle: GainNode | null = null;
  /** Wind strength (0..1) the gusts are currently following. */
  private strength = 0;
  private nextGust = 0;
  /** Audio-clock time until which something may still be sounding. */
  private busyUntil = 0;
  private frame = 0;
  private offset = 0;
  private lastSample = 0;
  private lastSteam = 0;
  private heard: Heard = { fire: 0, fallingLiquid: 0, fallingPowder: 0, lava: 0, charged: 0, bees: 0, sparks: 0, bolts: 0 };
  private lastBoom = 0;
  private pendingBoom = 0;
  private lastThunder = 0;
  /** Charge is building towards a strike (the sim's corona count was non-zero last time). */
  private charging = false;
  /** How far off the coming strike is (0 near .. 1 far), chosen as its charge starts. */
  private strikeFar = 0;
  /** No new corona episode before this audio time. */
  private coronaQuietUntil = 0;
  private coronaStart = 0;

  constructor() {
    const unlock = (): void => {
      if (!this.enabled) return;
      this.start();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx?.suspend();
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    saveEnabled(on);
    if (on) this.start();
    else void this.ctx?.suspend();
  }

  /** Call once per animation frame, with whether the simulation is running (not paused). */
  update(world: World, running: boolean): void {
    const noise = world.noise;
    const ctx = this.ctx;
    if (!ctx || !this.enabled || document.hidden) {
      noise.blasts = noise.blastRadius = noise.strikes = noise.corona = noise.fizzes = noise.bursts = 0;
      this.lastSteam = world.created[M.Steam];
      return;
    }
    const t = ctx.currentTime;
    const strength = running ? Math.abs(world.wind) : 0;
    this.updateWind(t, strength);

    if (++this.frame % SAMPLE_EVERY !== 0) return;
    const dt = Math.min(0.2, Math.max(0.001, t - this.lastSample));
    this.lastSample = t;
    const steam = world.created[M.Steam];
    const steamRate = Math.max(0, steam - this.lastSteam) / dt;
    this.lastSteam = steam;
    const fizzRate = noise.fizzes / dt;
    const blasts = noise.blasts;
    const blastRadius = noise.blastRadius;
    const strikes = noise.strikes;
    const corona = noise.corona;
    const bursts = noise.bursts;
    noise.blasts = noise.blastRadius = noise.strikes = noise.corona = noise.fizzes = noise.bursts = 0;

    const h = this.heard;
    if (running) this.sample(world);
    else h.fire = h.fallingLiquid = h.fallingPowder = h.lava = h.charged = h.bees = h.sparks = h.bolts = 0;

    const loud = (n: number, full: number): number => Math.min(1, Math.sqrt(n / full));
    const loops = this.loops;
    if (loops) {
      loops.roar.target = 0.3 * loud(h.fire, 1500);
      loops.hiss.target = running ? 0.22 * loud(steamRate + fizzRate * 0.5, 80) : 0;
      loops.wash.target = 0.16 * loud(h.fallingLiquid, 600);
      loops.hush.target = 0.2 * loud(h.fallingPowder, 600);
      loops.hum.target = 0.05 * Math.min(1, h.charged / 60);
      loops.buzz.target = 0.06 * Math.min(1, h.bees / 6);
    }
    const crackles = Math.min(45, h.fire * 0.06);
    const drips = Math.min(70, h.fallingLiquid * 0.2);
    const bubbles = Math.min(2.5, h.lava * 0.004);
    const pings = Math.min(25, h.sparks * 0.5);
    const busy =
      strength > 0 ||
      crackles + drips + bubbles + pings > 0 ||
      blasts + strikes + bursts + corona + h.bolts > 0 ||
      (loops !== null && Object.values(loops).some((l) => l.target > 0.001));

    if (busy) {
      this.busyUntil = Math.max(this.busyUntil, t + IDLE_SECONDS);
      if (ctx.state === 'suspended') {
        void ctx.resume();
        return;
      }
    } else if (ctx.state === 'running' && t > this.busyUntil) {
      void ctx.suspend();
      return;
    }
    if (ctx.state !== 'running') return;

    if (loops) {
      for (const loop of Object.values(loops)) {
        if (Math.abs(loop.gain.gain.value - loop.target) > 0.002) loop.gain.gain.setTargetAtTime(loop.target, t, 0.25);
      }
    }
    const ahead = t + 0.02;
    for (let k = events(crackles, dt, 6); k > 0; k--) this.crackle(ahead + Math.random() * dt);
    for (let k = events(drips, dt, 8); k > 0; k--) this.drip(ahead + Math.random() * dt);
    for (let k = events(bubbles, dt, 1); k > 0; k--) this.bubble(ahead + Math.random() * dt);
    for (let k = events(pings, dt, 4); k > 0; k--) this.ping(ahead + Math.random() * dt);

    // Explosions: one boom at a time (a few frames apart), as big as the biggest blast since.
    if (blasts > 0) this.pendingBoom = Math.max(this.pendingBoom, blastRadius + Math.min(4, blasts - 1));
    if (this.pendingBoom > 0 && t - this.lastBoom > 0.08) {
      this.boom(ahead, this.pendingBoom);
      this.pendingBoom = 0;
      this.lastBoom = t;
    }
    if (bursts > 0) this.pop(ahead);
    // The strike a corona warned of thunders at the distance chosen for it. Any other strike, or a
    // bolt seen in the grid (lightning drawn with the brush), thunders from a random distance.
    const warned = this.updateCorona(t, dt, corona > 0, strikes > 0);
    if (warned >= 0) {
      this.thunder(ahead, warned);
      this.lastThunder = t;
    } else if ((strikes > 0 || h.bolts > 0) && t - this.lastThunder > 0.8) {
      this.thunder(ahead, Math.random());
      this.lastThunder = t;
    }
  }

  /** A short bright chime: something new discovered. */
  discovery(): void {
    this.chime([84, 88, 91, 96], 0.07, 0.2); // C, E, G, C
  }

  /** A longer, fuller chime: the reward unlocked. */
  reward(): void {
    this.chime([72, 76, 79, 84, 88, 91, 96, 100], 0.06, 0.2);
  }

  /** Count what's going on, in a sixth of the cells (a different sixth each time). */
  private sample(w: World): void {
    const { mat, burn, vel, charge, size } = w;
    let fire = 0;
    let fallingLiquid = 0;
    let fallingPowder = 0;
    let lava = 0;
    let charged = 0;
    let bees = 0;
    let sparks = 0;
    let bolts = 0;
    for (let i = this.offset; i < size; i += STRIDE) {
      const m = mat[i];
      if (m === EMPTY) continue;
      if (m === FIRE || burn[i] > 0) fire++;
      if (vel[i] > 1) {
        if (LIQUID[m]) fallingLiquid++;
        else if (POWDER[m]) fallingPowder++;
      }
      if (m === LAVA) lava++;
      else if (m === BEE) bees++;
      else if (m === SPARK) sparks++;
      else if (m === BOLT) bolts++;
      if (charge[i] !== 0) charged++;
    }
    this.offset = (this.offset + 1) % STRIDE;
    const h = this.heard;
    h.fire = fire * STRIDE;
    h.fallingLiquid = fallingLiquid * STRIDE;
    h.fallingPowder = fallingPowder * STRIDE;
    h.lava = lava * STRIDE;
    h.charged = charged * STRIDE;
    h.bees = bees * STRIDE;
    h.sparks = sparks * STRIDE;
    h.bolts = bolts * STRIDE;
  }

  private updateWind(t: number, strength: number): void {
    if (strength !== this.strength) {
      this.strength = strength;
      this.nextGust = 0;
    }
    if (t < this.nextGust || this.ctx?.state !== 'running') return;
    // A new gust: drift towards a fresh loudness and pitch, rising with the wind's strength.
    const gust = strength === 0 ? 0 : 0.6 + Math.random() * 0.8;
    const level = WIND_VOLUME * Math.pow(strength, 0.8) * gust;
    const pitch = 220 + 700 * strength * (0.7 + Math.random() * 0.6);
    this.windGain?.gain.setTargetAtTime(level, t, strength === 0 ? 0.3 : 0.7);
    this.windFilter?.frequency.setTargetAtTime(pitch, t, 0.8);
    this.busyUntil = Math.max(this.busyUntil, t + IDLE_SECONDS);
    // With the wind dropped, that was the fade-out: no more gusts until it picks up again.
    this.nextGust = strength === 0 ? Infinity : t + 0.6 + Math.random() * 1.4;
  }

  private start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext as typeof AudioContext | undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 6;
    compressor.knee.value = 6;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.25;
    compressor.connect(ctx.destination);
    this.out = ctx.createGain();
    this.out.gain.value = MASTER;
    this.out.connect(compressor);
    this.white = noiseBuffer(ctx, false);
    this.brown = noiseBuffer(ctx, true);

    const wind = this.loop(this.brown, 'bandpass', 400, 0.7);
    this.windGain = wind.gain;
    this.windFilter = wind.filter;
    this.loops = {
      roar: { gain: this.loop(this.brown, 'lowpass', 320, 0.7).gain, target: 0 },
      hiss: { gain: this.loop(this.white, 'highpass', 3800, 0.7).gain, target: 0 },
      wash: { gain: this.loop(this.white, 'bandpass', 5200, 0.6).gain, target: 0 },
      hush: { gain: this.loop(this.white, 'bandpass', 1700, 0.8).gain, target: 0 },
      hum: { gain: this.tone('sawtooth', 100, 'lowpass', 700, 0), target: 0 },
      buzz: { gain: this.tone('sawtooth', 215, 'bandpass', 520, 9), target: 0 },
    };
    this.crackleBus = this.bus('highpass', 650);
    this.dripBus = this.bus('bandpass', 3400, 1.1);
    this.coronaBus = this.bus('highpass', 3500);
    this.sizzle = this.loop(this.white, 'bandpass', 6500, 1.5).gain;
  }

  /** A looping noise source through a filter into a gain (starting silent). */
  private loop(buffer: AudioBuffer, type: BiquadFilterType, freq: number, q: number): { gain: GainNode; filter: BiquadFilterNode } {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.out!);
    // Each loop starts at a different point in the buffer, so they don't share a pattern.
    src.start(0, Math.random() * 2);
    return { gain, filter };
  }

  /** A held tone through a filter into a gain (starting silent), its pitch wavering if `vibrato` > 0. */
  private tone(type: OscillatorType, freq: number, filterType: BiquadFilterType, filterFreq: number, vibrato: number): GainNode {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (vibrato > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const depth = ctx.createGain();
      depth.gain.value = vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start();
    }
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(this.out!);
    osc.start();
    return gain;
  }

  /** A filter that short sounds of one kind pass through on their way out. */
  private bus(type: BiquadFilterType, freq: number, q = 0.7): AudioNode {
    const filter = this.ctx!.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    filter.connect(this.out!);
    return filter;
  }

  /** A snippet of noise with a sharp attack and a quick decay. */
  private burst(dest: AudioNode, t: number, peak: number, duration: number, rate: number, brown = false): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    env.gain.setValueAtTime(peak, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + duration);
    src.connect(env).connect(dest);
    src.start(t, Math.random() * 1.5, duration + 0.02);
  }

  /** Fire: mostly tiny ticks, now and then a fatter pop. */
  private crackle(t: number): void {
    const pop = Math.random() < 0.12;
    const peak = (pop ? 0.55 : 0.2) * (0.4 + Math.random() * 0.6);
    this.burst(this.crackleBus!, t, peak, pop ? 0.05 : 0.01 + Math.random() * 0.02, pop ? 0.5 : 0.7 + Math.random() * 1.1);
  }

  /** Rain: a tiny click, its pitch varying drop to drop. */
  private drip(t: number): void {
    this.burst(this.dripBus!, t, 0.1 + Math.random() * 0.12, 0.004 + Math.random() * 0.008, 0.5 + Math.random());
  }

  /** Lava: a deep bubble, rising in pitch as it bursts. */
  private bubble(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const f = 70 + Math.random() * 70;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    osc.connect(env).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /** Sparks: a faint high ping. */
  private ping(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.value = 2400 + Math.random() * 3200;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.04 + Math.random() * 0.03, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
    osc.connect(env).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** An explosion: a thump dropping in pitch, under a burst of rumble, both bigger with the blast. */
  private boom(t: number, radius: number): void {
    const ctx = this.ctx!;
    const k = Math.min(1, radius / 12);
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(75 + Math.random() * 25, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.4 + 0.5 * k);
    const thump = ctx.createGain();
    thump.gain.setValueAtTime(0, t);
    thump.gain.linearRampToValueAtTime(0.28 + 0.3 * k, t + 0.006);
    thump.gain.exponentialRampToValueAtTime(0.0005, t + 0.5 + 0.8 * k);
    osc.connect(thump).connect(this.out!);
    osc.start(t);
    osc.stop(t + 1.4);
    this.rumble(t, 0.25 + 0.3 * k, 0.6 + 1.6 * k, 1400);
    this.burst(this.crackleBus!, t, 0.2 + 0.2 * k, 0.04, 0.6);
  }

  /** A firework bursting: a small, bright pop. */
  private pop(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.35, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.2);
    osc.connect(env).connect(this.out!);
    osc.start(t);
    osc.stop(t + 0.25);
    this.burst(this.crackleBus!, t, 0.3, 0.06, 0.8);
  }

  /**
   * Corona: as charge builds before a strike, things near where it will land hiss and crackle, the
   * warning sign of a close strike. So it's only heard when the coming strike is near (its distance
   * is picked as the charge starts); it swells, then cuts off as the bolt lands.
   */
  /**
   * Runs a corona episode: it starts when charge begins building (choosing the coming strike's
   * distance) and ends with the next strike, whose distance it returns (otherwise -1). In a big
   * storm many charges overlap, so a new episode waits CORONA_GAP seconds after the last.
   */
  private updateCorona(t: number, dt: number, building: boolean, struck: boolean): number {
    let warned = -1;
    // A strike in the first moments of an episode is some other bolt (charges overlap in a storm).
    if (struck && t - this.coronaStart < CORONA_MIN) struck = false;
    if (this.charging && (struck || !building)) {
      if (struck) warned = this.strikeFar;
      this.charging = false;
      this.coronaQuietUntil = t + CORONA_GAP;
      this.sizzle?.gain.setTargetAtTime(0, t, 0.015);
    }
    if (building && !this.charging && t > this.coronaQuietUntil) {
      this.charging = true;
      this.coronaStart = t;
      this.strikeFar = Math.random();
      if (this.strikeFar < 0.4) this.sizzle?.gain.setTargetAtTime(0.09, t, 0.35);
    }
    if (this.charging && this.strikeFar < 0.4) {
      for (let k = events(70, dt, 8); k > 0; k--) {
        this.burst(this.coronaBus!, t + 0.02 + Math.random() * dt, 0.05 + Math.random() * 0.1, 0.003 + Math.random() * 0.004, 1 + Math.random());
      }
    }
    return warned;
  }

  /**
   * Lightning, `far` away (0 near .. 1 far). Light arrives at once and sound about a kilometre every three seconds, so the
   * thunder comes after the flash: straight away for a near strike, with a sharp crack; up to two
   * seconds later for a far one, quieter, deeper and longer (the crack's high notes don't carry).
   */
  private thunder(t: number, far: number): void {
    const delay = far * far * 2;
    if (far < 0.4) this.burst(this.crackleBus!, t + delay, 0.45 * (1 - far), 0.09, 1.2);
    this.rumble(t + delay + 0.05, 0.8 - 0.4 * far, 2.6 + 1.6 * far, 1100 - 700 * far);
  }

  /** Brown noise through a low-pass filter closing from `from` Hz, loud at first and fading. */
  private rumble(t: number, peak: number, duration: number, from: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0005, t + duration);
    src.connect(filter).connect(env).connect(this.out!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
    this.busyUntil = Math.max(this.busyUntil, t + duration + IDLE_SECONDS);
  }

  /** Notes (MIDI numbers) in quick succession, each a triangle tone with a quiet sine an octave up. */
  private chime(notes: readonly number[], spacing: number, volume: number): void {
    if (!this.enabled) return;
    this.start();
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return;
    const play = (): void => {
      const t0 = ctx.currentTime + 0.03;
      notes.forEach((note, k) => {
        const freq = 440 * Math.pow(2, (note - 69) / 12);
        const start = t0 + k * spacing;
        for (const [type, mult, vol] of [
          ['triangle', 1, 1],
          ['sine', 2, 0.35],
        ] as const) {
          const osc = ctx.createOscillator();
          osc.type = type;
          osc.frequency.value = freq * mult;
          const env = ctx.createGain();
          env.gain.setValueAtTime(0, start);
          env.gain.linearRampToValueAtTime(vol * volume, start + 0.008);
          env.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
          osc.connect(env).connect(out);
          osc.start(start);
          osc.stop(start + 1);
        }
      });
      this.busyUntil = Math.max(this.busyUntil, t0 + notes.length * spacing + 1 + IDLE_SECONDS);
    };
    if (ctx.state === 'suspended') {
      // Keep the idle check from suspending it again before the chime starts.
      this.busyUntil = Math.max(this.busyUntil, ctx.currentTime + 5);
      void ctx.resume().then(play);
    } else play();
  }
}
