/**
 * Plan de clic mesure par mesure (pur, testé). Le métronome Web Audio le consomme.
 *
 * - Les `countInBars` premières mesures cliquent sur tous les temps, au tempo initial.
 * - Ensuite, l'effet métronome du mod s'applique : temps choisis, raréfaction (1 mesure sur N),
 *   coupures aléatoires de min..max mesures.
 */
import type { Rng } from "../core/rng";
import { intBetween } from "../core/rng";
import type { MetronomeEffect } from "../core/types";

export interface BarPlan {
  /** Index absolu de la mesure (0 = première mesure de décompte). */
  index: number;
  /** Index de la mesure jouée (-countInBars..-1 pendant le décompte, puis 0, 1, 2…). */
  playedIndex: number;
  countIn: boolean;
  bpm: number;
  /** Temps qui cliquent (1 = premier temps). Vide : mesure muette. */
  clicks: number[];
}

export interface PlannerOptions {
  beatsPerBar: number;
  countInBars: number;
  metronome?: MetronomeEffect;
  /** Tempo de la mesure jouée n° `playedIndex` (≥ 0). Le décompte utilise tempoAt(0). */
  tempoAt: (playedIndex: number) => number;
  rng: Rng;
}

/** Temps effectifs d'un motif de clic dans une mesure de `beatsPerBar` temps. */
export function normalizeBeats(beats: number[] | undefined, beatsPerBar: number): number[] {
  if (!beats || beats.length === 0) return Array.from({ length: beatsPerBar }, (_, i) => i + 1);
  // Un temps au-delà de la mesure (ex. « 4 » en 3/4) est ramené sur le dernier temps.
  const set = new Set(beats.map((b) => Math.min(Math.max(1, b), beatsPerBar)));
  return [...set].sort((a, b) => a - b);
}

export function createClickPlanner(opts: PlannerOptions) {
  const { beatsPerBar, countInBars, metronome = {}, tempoAt, rng } = opts;
  const pattern = normalizeBeats(metronome.beats, beatsPerBar);
  const all = normalizeBeats(undefined, beatsPerBar);
  let index = 0;
  let silentLeft = 0;
  let mustClick = false;

  function next(): BarPlan {
    const i = index++;
    const playedIndex = i - countInBars;
    if (playedIndex < 0) {
      return { index: i, playedIndex, countIn: true, bpm: tempoAt(0), clicks: all };
    }
    const bpm = tempoAt(playedIndex);
    let clicks = pattern;

    if (metronome.everyNBars && metronome.everyNBars > 1 && playedIndex % metronome.everyNBars !== 0) {
      clicks = [];
    }

    const d = metronome.dropouts;
    if (d) {
      if (silentLeft > 0) {
        silentLeft--;
        clicks = [];
        if (silentLeft === 0) mustClick = true;
      } else if (mustClick) {
        mustClick = false; // au moins une mesure cliquée entre deux coupures
      } else if (rng.next() < d.chancePerBar) {
        const len = intBetween(rng, d.min, d.max);
        clicks = [];
        silentLeft = len - 1;
        if (silentLeft === 0) mustClick = true;
      }
    }
    return { index: i, playedIndex, countIn: false, bpm, clicks };
  }

  return { next };
}
