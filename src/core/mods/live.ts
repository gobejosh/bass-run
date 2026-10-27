/**
 * Effets de mods qui évoluent pendant le bloc, mesure par mesure (fonctions pures).
 * L'index de mesure est `playedIndex` (0 = première mesure après le décompte).
 */
import { intBetween, pick, type Rng } from "../rng";

/** Numéro de chorus en cours (1, 2, …). */
export function chorusNumber(playedIndex: number, chorusBars: number): number {
  return Math.floor(Math.max(0, playedIndex) / Math.max(1, chorusBars)) + 1;
}

/** Question-réponse : phase de la mesure. */
export function callResponsePhase(playedIndex: number, bars: number, echo = false): "question" | "reponse" | "silence" {
  const second = Math.floor(Math.max(0, playedIndex) / bars) % 2 === 1;
  if (!second) return "question";
  return echo ? "reponse" : "silence";
}

/** Suite de cibles tirées, chacune différente de la précédente. */
export function targetSequence(rng: Rng, choices: readonly string[], count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const prev = out[i - 1];
    out.push(pick(rng, choices.filter((c) => c !== prev)));
  }
  return out;
}

export const TARGETS = ["3ce", "5te", "7e"] as const;

/** Cible en vigueur à la mesure donnée, changeant toutes les `every` mesures. */
export function targetAt(seq: readonly string[], playedIndex: number, every: number): string {
  return seq[Math.min(seq.length - 1, Math.floor(Math.max(0, playedIndex) / every))]!;
}

/** Bascules two-feel / four : mesures (playedIndex) où le jeu change, espacées de min..max mesures. */
export function switchBars(rng: Rng, range: [number, number], horizonBars: number): number[] {
  const out: number[] = [];
  let bar = 0;
  for (;;) {
    bar += intBetween(rng, range[0], range[1]);
    if (bar > horizonBars) return out;
    out.push(bar);
  }
}

/** État two-feel à une mesure donnée (départ en two-feel) et annonce une mesure avant chaque bascule. */
export function feelAt(switches: readonly number[], playedIndex: number): { feel: "two" | "four"; upcoming: boolean } {
  const passed = switches.filter((b) => b <= playedIndex).length;
  return { feel: passed % 2 === 0 ? "two" : "four", upcoming: switches.includes(playedIndex + 1) };
}

/** Horizon généreux de mesures pour précalculer les tirages d'un bloc. */
export function horizonBars(minutes: number, bpm: number, beatsPerBar: number): number {
  return Math.ceil(((minutes + 5) * bpm) / beatsPerBar) + 16;
}

/** Mémoire vive : la grille ou la partition est-elle visible à cet instant ? */
export function scoreVisible(
  hide: { mode: "after_first_chorus" } | { mode: "preview"; seconds: number } | { mode: "title_only"; randomKey?: boolean } | undefined,
  state: { prep: boolean; playedIndex: number | null; chorusBars: number },
): boolean {
  if (!hide) return true;
  switch (hide.mode) {
    case "after_first_chorus":
      return state.playedIndex === null || state.playedIndex < state.chorusBars;
    case "preview":
      return state.prep;
    case "title_only":
      return false;
  }
}
