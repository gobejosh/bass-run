/**
 * Modes, toniques et orthographes « pédagogiques ».
 */
import type { ModeDef } from "./dictionaries";
import { fifthsOf, tonicFromFifths } from "./keys";
import { commonSpelling, pcOf, spellOnLetter, spellingsOf, type SpelledNote } from "./notes";

/** Notes d'un mode depuis une tonique, une lettre par degré. */
export function modeNotes(tonic: SpelledNote, mode: ModeDef): SpelledNote[] {
  return mode.intervals.map((semi, i) => spellOnLetter(pcOf(tonic) + semi, tonic.letter + i));
}

const accidentals = (notes: SpelledNote[]): number => notes.reduce((s, n) => s + Math.abs(n.alter), 0);

/**
 * Orthographe de la tonique qui donne le mode le plus lisible :
 * pas de double altération sur la tonique, puis le moins d'altérations au total.
 * Égalité (Fa♯ / Sol♭ ionien) : on garde les deux, le tirage choisira.
 */
export function tonicSpellings(pc: number, mode: ModeDef): SpelledNote[] {
  const options = spellingsOf(pc, 1);
  const scored = options.map((t) => ({ t, notes: modeNotes(t, mode) }))
    .map(({ t, notes }) => ({ t, doubles: notes.filter((n) => Math.abs(n.alter) > 1).length, acc: accidentals(notes) }));
  const best = Math.min(...scored.map((s) => s.doubles * 100 + s.acc));
  return scored.filter((s) => s.doubles * 100 + s.acc === best).map((s) => s.t);
}

/** Les 12 toniques usuelles (une orthographe par hauteur, bémols pour les touches noires sauf Fa♯). */
export const USUAL_TONICS: SpelledNote[] = Array.from({ length: 12 }, (_, pc) => commonSpelling(pc, pc === 6 ? "sharp" : "flat"));

/** Remonte d'une quarte juste (Cycle des quartes), en restant entre 6 bémols et 6 dièses. */
export function upFourth(n: SpelledNote): SpelledNote {
  let f = fifthsOf(n, false) - 1;
  if (f < -6) f += 12;
  return tonicFromFifths(f, false);
}
