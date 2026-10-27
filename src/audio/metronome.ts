/**
 * Métronome Web Audio.
 *
 * Ordonnanceur à anticipation : un minuteur JS se réveille toutes les 25 ms mais ne fait
 * que PLANIFIER les clics sur l'horloge audio (AudioContext.currentTime), 120 ms à l'avance.
 * La précision ne dépend donc jamais du minuteur JS. Pause = suspension du contexte audio :
 * l'horloge audio s'arrête, la grille de temps reste intacte à la reprise.
 */
import type { BarPlan } from "./clickPlan";
import { audioContext } from "./context";

export interface BeatTick {
  bar: BarPlan;
  /** Temps dans la mesure (1..beatsPerBar). */
  beat: number;
  clicked: boolean;
}

export interface MetronomeOptions {
  beatsPerBar: number;
  nextBar: () => BarPlan;
  /** Appelé (côté UI) au moment où chaque temps sonne, cliqué ou non. */
  onBeat?: (t: BeatTick) => void;
  volume?: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;

export class Metronome {
  private ctx: AudioContext | null = null;
  private generation = 0;
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeatTime = 0;
  private beatInBar = 0;
  private bar: BarPlan | null = null;
  private queue: { time: number; tick: BeatTick }[] = [];
  private raf = 0;
  private running = false;

  constructor(private readonly opts: MetronomeOptions) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Le contexte doit avoir été déverrouillé par un geste (voir audio/context.ts). */
  async start(): Promise<void> {
    if (this.running) return;
    const gen = ++this.generation;
    const ctx = audioContext();
    this.ctx = ctx;
    await ctx.resume();
    // stop() appelé pendant l'attente (abandon rapide, double montage React) : on n'insiste pas.
    if (gen !== this.generation || this.ctx !== ctx) return;
    this.gain = ctx.createGain();
    this.gain.gain.value = this.opts.volume ?? 0.8;
    this.gain.connect(ctx.destination);
    this.nextBeatTime = ctx.currentTime + 0.15;
    this.beatInBar = 0;
    this.bar = null;
    this.running = true;
    this.timer = setInterval(() => this.schedule(), LOOKAHEAD_MS);
    this.schedule();
    this.pump();
  }

  async pause(): Promise<void> {
    await this.ctx?.suspend();
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
  }

  setVolume(v: number): void {
    if (this.gain) this.gain.gain.value = v;
  }

  stop(): void {
    this.generation++;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.timer = null;
    this.queue = [];
    this.gain?.disconnect();
    this.gain = null;
    void this.ctx?.resume(); // au cas où le bloc s'arrête en pause
    this.ctx = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    while (this.nextBeatTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      if (this.beatInBar === 0) this.bar = this.opts.nextBar();
      const bar = this.bar!;
      const beat = this.beatInBar + 1;
      const clicked = bar.clicks.includes(beat);
      if (clicked) this.click(this.nextBeatTime, beat === 1, bar.countIn);
      this.queue.push({ time: this.nextBeatTime, tick: { bar, beat, clicked } });
      this.nextBeatTime += 60 / bar.bpm;
      this.beatInBar = (this.beatInBar + 1) % this.opts.beatsPerBar;
    }
  }

  private click(time: number, accent: boolean, countIn: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = countIn ? (accent ? 2000 : 1500) : accent ? 1700 : 1150;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    osc.connect(env).connect(this.gain!);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  /** Diffuse les temps à l'UI quand l'horloge audio les atteint. */
  private pump = (): void => {
    if (!this.running) return;
    const now = this.ctx?.currentTime ?? 0;
    while (this.queue.length && this.queue[0]!.time <= now) {
      const { tick } = this.queue.shift()!;
      this.opts.onBeat?.(tick);
    }
    this.raf = requestAnimationFrame(this.pump);
  };
}
