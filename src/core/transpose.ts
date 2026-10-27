/**
 * Transposition d'un standard : tirage de la tonalité cible et intervalle à appliquer.
 */
import type { KeySig } from "./library";
import type { Rng } from "./rng";
import type { ModEffects } from "./types";
import { drawAnyKey, drawKeyAtDistance, fifthsOf, intervalBetween, keyName, tonicFromFifths } from "./theory/keys";
import { parseNote, type Notation, type SpelledNote } from "./theory/notes";

export interface TranspositionStep {
  letters: number;
  semis: number;
  /** Tonalité cible lisible (« Mi♭ majeur »). */
  label: string;
}

export function sourceKey(key: KeySig | undefined, firstRoot?: SpelledNote): { tonic: SpelledNote; minor: boolean } {
  const p = key ? parseNote(key.tonic) : null;
  if (p) return { tonic: p.note, minor: key!.minor };
  return { tonic: firstRoot ?? { letter: 0, alter: 0 }, minor: false };
}

function stepTo(src: { tonic: SpelledNote; minor: boolean }, fifths: number, notation: Notation): TranspositionStep {
  const target = tonicFromFifths(fifths, src.minor);
  const { letters, semis } = intervalBetween(src.tonic, target);
  return { letters, semis, label: keyName(target, src.minor, notation) };
}

/** Tonalités cibles du bloc : une seule, ou une par chorus (Transposition Fantôme). */
export function planTransposition(
  rng: Rng,
  effect: NonNullable<ModEffects["transpose"]>,
  src: { tonic: SpelledNote; minor: boolean },
  notation: Notation,
  choruses = 64,
): TranspositionStep[] {
  const from = fifthsOf(src.tonic, src.minor);
  switch (effect.mode) {
    case "distance":
      return [stepTo(src, drawKeyAtDistance(rng, from, effect.min, effect.max), notation)];
    case "any":
      return [stepTo(src, drawAnyKey(rng, from), notation)];
    case "each_chorus": {
      const out: TranspositionStep[] = [];
      let prev = from;
      for (let i = 0; i < choruses; i++) {
        const f = drawAnyKey(rng, prev);
        out.push(stepTo(src, f, notation));
        prev = f;
      }
      return out;
    }
  }
}
