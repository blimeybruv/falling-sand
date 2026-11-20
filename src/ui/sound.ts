/**
 * Sound, synthesised with the Web Audio API (no sound files, no requests): a wind that follows the
 * Wind setting, gusting, and a chime for each discovery. Browsers only allow audio after the
 * player's first tap or key press, so nothing starts before that. The player can switch sound off;
 * the choice is saved. The audio context is suspended whenever there's nothing to hear.
 */

const SOUND_KEY = 'falling-sand.sound';
/** Overall volume. */
const MASTER = 0.5;
/** Wind volume at full strength (before gusts). */
const WIND_VOLUME = 0.9;
/** Seconds of quiet before the audio context is suspended. */
const IDLE_SECONDS = 2;

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

/** Two seconds of brown noise (random steps, smoothed): a deep rush that a filter turns into wind. */
function brownNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export class Sound {
  enabled = readEnabled();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  /** Wind strength (0..1) the gusts are currently following. */
  private strength = 0;
  private nextGust = 0;
  /** Audio-clock time until which something may still be sounding. */
  private busyUntil = 0;

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

  /** Call every frame: the wind's strength (World.wind) and whether the simulation is running. */
  update(wind: number, running: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || document.hidden) return;
    const strength = running ? Math.abs(wind) : 0;
    const t = ctx.currentTime;
    if (strength !== this.strength) {
      this.strength = strength;
      this.nextGust = 0;
    }
    // Wake up for the wind (after being idle, or coming back to the tab).
    if (strength > 0 && ctx.state === 'suspended') void ctx.resume();
    if (strength === 0 && ctx.state === 'running' && t > this.busyUntil) {
      void ctx.suspend();
      return;
    }
    if (t < this.nextGust || ctx.state !== 'running') return;
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

  /** A short bright chime: something new discovered. */
  discovery(): void {
    this.chime([84, 88, 91, 96], 0.07, 0.2); // C, E, G, C
  }

  /** A longer, fuller chime: the reward unlocked. */
  reward(): void {
    this.chime([72, 76, 79, 84, 88, 91, 96, 100], 0.06, 0.2);
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
    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(ctx.destination);

    const noise = ctx.createBufferSource();
    noise.buffer = brownNoise(ctx);
    noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter).connect(this.windGain).connect(this.master);
    noise.start();
  }

  /** Notes (MIDI numbers) in quick succession, each a triangle tone with a quiet sine an octave up. */
  private chime(notes: readonly number[], spacing: number, volume: number): void {
    if (!this.enabled) return;
    this.start();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
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
          osc.connect(env).connect(master);
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
