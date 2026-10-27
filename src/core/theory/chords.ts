/**
 * Accords : analyse des symboles de grille, notes de l'accord, extensions, affichage.
 */
import type { ChordTone, QualityDef } from "./dictionaries";
import { mod7, noteName, parseNote, pcOf, spellOnLetter, transposeNote, type Notation, type SpelledNote } from "./notes";

export interface Chord {
  root: SpelledNote;
  /** Identifiant de qualité du dictionnaire, ou null si le suffixe est inconnu. */
  quality: string | null;
  /** Suffixe tel qu'écrit (conservé pour l'affichage si la qualité est inconnue). */
  suffix: string;
  bass?: SpelledNote;
}

/** Suffixes reconnus → qualité. L'ordre compte : les plus longs d'abord. */
const SUFFIXES: [RegExp, string][] = [
  [/^(m|mi|min|-)(maj7|Maj7|ma7|M7|Δ7?|\(maj7\))$/, "mMaj7"],
  [/^(m7b5|m7♭5|mi7b5|min7b5|-7b5|ø7?)$/, "m7b5"],
  [/^(dim7?|°7?|o7?)$/, "dim7"],
  [/^(maj7#5|maj7♯5|Δ#5|Δ♯5|\+maj7|\+Δ)$/, "maj7#5"],
  [/^(maj7|ma7|M7|Δ7?|maj9|ma9|M9|Δ9|maj13|Δ13|maj7#11|Δ#11|Δ♯11|maj7♯11)$/, "maj7"],
  [/^(m|mi|min|-)(7|9|11|13)$/, "m7"],
  [/^(m|mi|min|-)(6|69|6\/9)$/, "m6"],
  [/^(m|mi|min|-)$/, "m"],
  [/^(7sus4?|9sus4?|13sus4?|sus4?)$/, "7sus4"],
  [/^(7alt|alt|7#9|7♯9|7b13|7♭13|7#5|7♯5|7\+|\+7|7b9b13|7♭9♭13|7#9#5|7b9#9)$/, "7alt"],
  [/^(7b9|7♭9|7\(b9\)|13b9|13♭9)$/, "7b9"],
  [/^(7#11|7♯11|9#11|9♯11|13#11|13♯11)$/, "7#11"],
  [/^(7|9|13|11)$/, "7"],
  [/^(6|69|6\/9|add9)?$/, "maj"],
];

/** Liste des qualités et de leurs mots-clés reconnus (pour l'aide à la saisie). */
export function qualityForSuffix(suffix: string): string | null {
  const s = suffix.trim();
  if (s === "6" || s === "69" || s === "6/9") return "6";
  for (const [re, q] of SUFFIXES) if (re.test(s)) return q;
  return null;
}

export function parseChord(text: string): Chord | null {
  const t = text.trim();
  if (!t) return null;
  const [main, bassText] = t.split("/").length === 2 && !/6\/9$/.test(t) ? (t.split("/") as [string, string]) : [t, undefined];
  const p = parseNote(main);
  if (!p) return null;
  const suffix = p.rest.trim();
  const bass = bassText ? parseNote(bassText)?.note : undefined;
  return { root: p.note, quality: qualityForSuffix(suffix), suffix, ...(bass ? { bass } : {}) };
}

/** Symbole affichable : « Ré m7 », « Si♭ maj7 », ou en notation anglaise « Dm7 ». */
export function chordName(c: Chord, qualities: readonly QualityDef[], notation: Notation = "fr"): string {
  const q = qualities.find((x) => x.id === c.quality);
  const sym = q ? q.symbol : c.suffix;
  const sep = notation === "fr" && sym ? " " : "";
  const bass = c.bass ? `/${noteName(c.bass, notation)}` : "";
  return `${noteName(c.root, notation)}${sep}${sym}${bass}`;
}

/** Note d'une fonction d'accord (degré + demi-tons) orthographiée depuis la fondamentale. */
export function toneOf(root: SpelledNote, tone: ChordTone): SpelledNote {
  const [degree, semis] = tone;
  return spellOnLetter(pcOf(root) + semis, root.letter + (degree - 1));
}

export function chordTones(root: SpelledNote, q: QualityDef): SpelledNote[] {
  return q.tones.map((t) => toneOf(root, t));
}

/** Fonctions demandées en MAN-03, avec leur ton dans la qualité. */
export const BASE_FUNCTIONS = ["fondamentale", "tierce", "quinte", "septième"] as const;

const EXTENSIONS: Record<string, ChordTone> = {
  "9": [9, 14], b9: [9, 13], "#9": [9, 15], "11": [11, 17], "#11": [11, 18], "13": [13, 21], b13: [13, 20],
};

export const FUNCTION_LABEL: Record<string, string> = {
  "9": "9", b9: "♭9", "#9": "♯9", "11": "11", "#11": "♯11", "13": "13", b13: "♭13",
};

/** Libellé réel de la fonction pour une qualité (septième d'un accord de 6te = sixte, tierce d'un sus4 = quarte). */
export function functionLabel(fn: string, q: QualityDef): string {
  const idx = (BASE_FUNCTIONS as readonly string[]).indexOf(fn);
  if (idx < 0) return FUNCTION_LABEL[fn] ?? fn;
  const degree = q.tones[idx]?.[0];
  return { 1: "fondamentale", 3: "tierce", 4: "quarte", 5: "quinte", 6: "sixte", 7: "septième" }[degree ?? 1] ?? fn;
}

/** Note correspondant à une fonction (de base ou extension) d'un accord. */
export function functionNote(root: SpelledNote, q: QualityDef, fn: string): SpelledNote {
  const idx = (BASE_FUNCTIONS as readonly string[]).indexOf(fn);
  if (idx >= 0) {
    const tone = q.tones[idx] ?? q.tones[0]!;
    return toneOf(root, tone);
  }
  const ext = EXTENSIONS[fn];
  if (!ext) throw new Error(`Fonction inconnue : ${fn}`);
  return spellOnLetter(pcOf(root) + ext[1], root.letter + mod7(ext[0] - 1));
}

/** Transpose un accord en conservant l'orthographe logique (lettres + demi-tons). */
export function transposeChord(c: Chord, letterSteps: number, semitones: number): Chord {
  return {
    ...c,
    root: transposeNote(c.root, letterSteps, semitones),
    ...(c.bass ? { bass: transposeNote(c.bass, letterSteps, semitones) } : {}),
  };
}
