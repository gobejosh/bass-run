/**
 * Tonalités et cycle des quintes (Transposition, Mémoire vive Fantôme).
 */
import type { KeySig } from "../library";
import { pick, type Rng } from "../rng";
import { mod12, mod7, noteName, parseNote, pcOf, type Notation, type SpelledNote } from "./notes";

/** Position sur le cycle des quintes de chaque lettre (Fa -1, Do 0, Sol 1 … Si 5). */
const LETTER_FIFTHS = [0, 2, 4, -1, 1, 3, 5]; // Do Ré Mi Fa Sol La Si

/** Nombre d'altérations à la clé, signé (dièses > 0, bémols < 0). */
export function fifthsOf(tonic: SpelledNote, minor: boolean): number {
  return LETTER_FIFTHS[tonic.letter]! + 7 * tonic.alter - (minor ? 3 : 0);
}

/** Tonique d'une tonalité à partir de sa position sur le cycle. */
export function tonicFromFifths(fifths: number, minor: boolean): SpelledNote {
  const f = fifths + (minor ? 3 : 0);
  // Lettre : on avance de 4 lettres (une quinte) par quinte depuis Do.
  const letter = mod7(4 * f);
  const base = LETTER_FIFTHS[letter]!;
  return { letter, alter: Math.round((f - base) / 7) };
}

export function keyOf(k: KeySig): { tonic: SpelledNote; minor: boolean; fifths: number } | null {
  const p = parseNote(k.tonic);
  if (!p) return null;
  return { tonic: p.note, minor: k.minor, fifths: fifthsOf(p.note, k.minor) };
}

export function keyName(tonic: SpelledNote, minor: boolean, notation: Notation = "fr"): string {
  return `${noteName(tonic, notation)} ${minor ? (notation === "fr" ? "mineur" : "minor") : notation === "fr" ? "majeur" : "major"}`;
}

/** Intervalle (lettres, demi-tons) pour aller d'une tonique à une autre, vers le haut. */
export function intervalBetween(from: SpelledNote, to: SpelledNote): { letters: number; semis: number } {
  return { letters: mod7(to.letter - from.letter), semis: mod12(pcOf(to) - pcOf(from)) };
}

/** Tonalités usuelles : de 6 bémols à 6 dièses (Fa♯ et Sol♭ comptent pour une seule hauteur). */
const USUAL_RANGE = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

/**
 * Tire une tonalité cible à une distance donnée (nombre d'altérations d'écart) sur le cycle.
 * Si les deux sens sont possibles, le sens est tiré ; on reste entre 6 bémols et 6 dièses.
 */
export function drawKeyAtDistance(rng: Rng, fromFifths: number, min: number, max: number): number {
  const candidates = USUAL_RANGE.filter((f) => {
    const d = Math.abs(f - fromFifths);
    return d >= min && d <= max && mod12(7 * f) !== mod12(7 * fromFifths);
  });
  if (candidates.length === 0) throw new Error(`Aucune tonalité à ${min}..${max} altérations de ${fromFifths}`);
  return pick(rng, candidates);
}

/** Tonalité quelconque, différente de la tonalité d'origine (hauteur différente). */
export function drawAnyKey(rng: Rng, fromFifths: number): number {
  return pick(rng, USUAL_RANGE.filter((f) => mod12(7 * f) !== mod12(7 * fromFifths) && f !== -6));
}
