/**
 * Hauteurs et orthographe des notes.
 * Une note orthographiée = une lettre (0 = Do … 6 = Si) + une altération (-2..+2).
 */

export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const; // Do Ré Mi Fa Sol La Si
export const LETTERS_FR = ["Do", "Ré", "Mi", "Fa", "Sol", "La", "Si"] as const;
export const LETTERS_EN = ["C", "D", "E", "F", "G", "A", "B"] as const;

export type Notation = "fr" | "en";

export interface SpelledNote {
  letter: number; // 0..6
  alter: number; // -2..2
}

export const mod12 = (n: number): number => ((n % 12) + 12) % 12;
export const mod7 = (n: number): number => ((n % 7) + 7) % 7;

export function pcOf(n: SpelledNote): number {
  return mod12(LETTER_PC[n.letter]! + n.alter);
}

const ALTER_SYMBOL: Record<number, string> = { [-2]: "𝄫", [-1]: "♭", 0: "", 1: "♯", 2: "𝄪" };
const ALTER_ASCII: Record<number, string> = { [-2]: "bb", [-1]: "b", 0: "", 1: "#", 2: "##" };

export function noteName(n: SpelledNote, notation: Notation = "fr", ascii = false): string {
  const base = (notation === "fr" ? LETTERS_FR : LETTERS_EN)[n.letter]!;
  return base + (ascii ? ALTER_ASCII : ALTER_SYMBOL)[n.alter]!;
}

/** Orthographie une hauteur sur une lettre donnée (altération ramenée dans -6..+6 puis contrôlée). */
export function spellOnLetter(pc: number, letter: number): SpelledNote {
  let alter = mod12(pc - LETTER_PC[mod7(letter)]!);
  if (alter > 6) alter -= 12;
  return { letter: mod7(letter), alter };
}

/** Toutes les orthographes possibles d'une hauteur avec au plus `maxAlter` altérations. */
export function spellingsOf(pc: number, maxAlter = 2): SpelledNote[] {
  const out: SpelledNote[] = [];
  for (let letter = 0; letter < 7; letter++) {
    const s = spellOnLetter(pc, letter);
    if (Math.abs(s.alter) <= maxAlter) out.push(s);
  }
  return out;
}

/** Orthographe usuelle (naturel, sinon dièse ou bémol selon la préférence). */
export function commonSpelling(pc: number, prefer: "sharp" | "flat" = "flat"): SpelledNote {
  const opts = spellingsOf(pc, 1);
  const natural = opts.find((s) => s.alter === 0);
  if (natural) return natural;
  return opts.find((s) => s.alter === (prefer === "sharp" ? 1 : -1))!;
}

/** Transpose une note orthographiée d'un intervalle (lettres + demi-tons). */
export function transposeNote(n: SpelledNote, letterSteps: number, semitones: number): SpelledNote {
  return spellOnLetter(pcOf(n) + semitones, n.letter + letterSteps);
}

/** Analyse « Do », « Ré#», « Mib », « C », « Bb », « F## »… */
export function parseNote(text: string): { note: SpelledNote; rest: string } | null {
  const s = text.trim();
  const fr = /^(do|ré|re|mi|fa|sol|la|si)/i.exec(s);
  let letter: number;
  let i: number;
  if (fr) {
    const w = fr[1]!.toLowerCase().replace("re", "ré");
    letter = (LETTERS_FR as readonly string[]).map((x) => x.toLowerCase()).indexOf(w);
    i = fr[0].length;
  } else {
    const en = /^[A-G]/.exec(s);
    if (!en) return null;
    letter = (LETTERS_EN as readonly string[]).indexOf(en[0]);
    i = 1;
  }
  let alter = 0;
  const acc = /^(𝄪|𝄫|##|bb|#|b|♯|♭)/.exec(s.slice(i));
  if (acc) {
    alter = { "𝄪": 2, "##": 2, "𝄫": -2, bb: -2, "#": 1, "♯": 1, b: -1, "♭": -1 }[acc[1]!]!;
    i += acc[0].length;
  }
  return { note: { letter, alter }, rest: s.slice(i) };
}
