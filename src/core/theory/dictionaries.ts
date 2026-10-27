/**
 * Dictionnaires par défaut : modes, qualités d'accords, motifs mélodiques et rythmiques.
 * Préremplis au premier lancement, modifiables ensuite (stockés en base).
 */

export type ModeFamily = "majeur" | "mineur-melodique" | "mineur-harmonique";

export interface ModeDef {
  id: string;
  name: string;
  family: ModeFamily;
  /** Degré dans la gamme parente (1..7). */
  degree: number;
  /** Demi-tons depuis la tonique pour les 7 degrés. */
  intervals: number[];
}

/** Degré (1..13, b/# éventuels) → [lettres depuis la fondamentale, demi-tons]. */
export type ChordTone = [degree: number, semitones: number];

export interface QualityDef {
  id: string;
  /** Symbole affiché après la fondamentale. */
  symbol: string;
  label: string;
  /** 4 notes : fondamentale, tierce (ou quarte en sus), quinte, septième (ou sixte). */
  tones: ChordTone[];
  /** Mode associé pour l'enchaînement MAN-02 (id de mode). */
  mode: string;
}

export interface MotifDef {
  id: string;
  name: string;
  /** Décalages de degrés joués depuis chaque degré du mode (0 = degré de départ). */
  steps: number[];
}

export interface RhythmMotif {
  id: string;
  /** Description lisible d'un motif de 2 temps. */
  label: string;
  /** Grille en doubles-croches sur 2 temps (8 cases) : x = attaque, - = tenue, . = silence. */
  grid: string;
}

export interface Dictionaries {
  modes: ModeDef[];
  qualities: QualityDef[];
  motifs: MotifDef[];
  rhythms: RhythmMotif[];
}

const rotate = (scale: number[], start: number): number[] =>
  scale.map((_, i) => (scale[(start + i) % 7]! - scale[start]! + 12) % 12);

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MEL_MIN = [0, 2, 3, 5, 7, 9, 11];
const HARM_MIN = [0, 2, 3, 5, 7, 8, 11];

const family = (fam: ModeFamily, scale: number[], names: [string, string][]): ModeDef[] =>
  names.map(([id, name], i) => ({ id, name, family: fam, degree: i + 1, intervals: rotate(scale, i) }));

export const DEFAULT_MODES: ModeDef[] = [
  ...family("majeur", MAJOR, [
    ["ionien", "Ionien"], ["dorien", "Dorien"], ["phrygien", "Phrygien"], ["lydien", "Lydien"],
    ["mixolydien", "Mixolydien"], ["eolien", "Éolien"], ["locrien", "Locrien"],
  ]),
  ...family("mineur-melodique", MEL_MIN, [
    ["mineur-melodique", "Mineur mélodique"], ["dorien-b2", "Dorien ♭2"], ["lydien-augmente", "Lydien augmenté"],
    ["lydien-b7", "Lydien ♭7"], ["mixolydien-b13", "Mixolydien ♭13"], ["locrien-9", "Locrien ♮9"], ["altere", "Altéré"],
  ]),
  ...family("mineur-harmonique", HARM_MIN, [
    ["mineur-harmonique", "Mineur harmonique"], ["locrien-13", "Locrien ♮13"], ["ionien-augmente", "Ionien augmenté"],
    ["dorien-11", "Dorien ♯11"], ["mixolydien-b9-b13", "Mixolydien ♭9 ♭13"], ["lydien-9", "Lydien ♯9"], ["ultralocrien", "Ultralocrien"],
  ]),
];

export const DEFAULT_QUALITIES: QualityDef[] = [
  { id: "maj7", symbol: "maj7", label: "Majeur 7", tones: [[1, 0], [3, 4], [5, 7], [7, 11]], mode: "ionien" },
  { id: "6", symbol: "6", label: "Majeur 6", tones: [[1, 0], [3, 4], [5, 7], [6, 9]], mode: "ionien" },
  { id: "7", symbol: "7", label: "Dominante 7", tones: [[1, 0], [3, 4], [5, 7], [7, 10]], mode: "mixolydien" },
  { id: "7sus4", symbol: "7sus4", label: "Dominante 7 sus4", tones: [[1, 0], [4, 5], [5, 7], [7, 10]], mode: "mixolydien" },
  { id: "7alt", symbol: "7alt", label: "Dominante altérée", tones: [[1, 0], [3, 4], [5, 8], [7, 10]], mode: "altere" },
  { id: "7b9", symbol: "7♭9", label: "Dominante 7 ♭9", tones: [[1, 0], [3, 4], [5, 7], [7, 10]], mode: "mixolydien-b9-b13" },
  { id: "m7", symbol: "m7", label: "Mineur 7", tones: [[1, 0], [3, 3], [5, 7], [7, 10]], mode: "dorien" },
  { id: "m6", symbol: "m6", label: "Mineur 6", tones: [[1, 0], [3, 3], [5, 7], [6, 9]], mode: "mineur-melodique" },
  { id: "mMaj7", symbol: "mMaj7", label: "Mineur majeur 7", tones: [[1, 0], [3, 3], [5, 7], [7, 11]], mode: "mineur-melodique" },
  { id: "m7b5", symbol: "m7♭5", label: "Demi-diminué", tones: [[1, 0], [3, 3], [5, 6], [7, 10]], mode: "locrien" },
  { id: "dim7", symbol: "dim7", label: "Diminué 7", tones: [[1, 0], [3, 3], [5, 6], [7, 9]], mode: "ultralocrien" },
  { id: "maj7#5", symbol: "maj7♯5", label: "Majeur 7 quinte augmentée", tones: [[1, 0], [3, 4], [5, 8], [7, 11]], mode: "lydien-augmente" },
  { id: "7#11", symbol: "7♯11", label: "Dominante 7 ♯11", tones: [[1, 0], [3, 4], [5, 7], [7, 10]], mode: "lydien-b7" },
  // Triades : reconnues dans les grilles, jamais tirées (pas de septième pour MAN-03).
  { id: "maj", symbol: "", label: "Majeur (triade)", tones: [[1, 0], [3, 4], [5, 7]], mode: "ionien" },
  { id: "m", symbol: "m", label: "Mineur (triade)", tones: [[1, 0], [3, 3], [5, 7]], mode: "dorien" },
];

export const DEFAULT_MOTIFS: MotifDef[] = [
  { id: "gamme", name: "Gamme (1-2-3-4)", steps: [0, 1, 2, 3] },
  { id: "tierces", name: "Tierces", steps: [0, 2] },
  { id: "1231", name: "1-2-3-1", steps: [0, 1, 2, 0] },
  { id: "1235", name: "1-2-3-5", steps: [0, 1, 2, 4] },
  { id: "triades", name: "Triades (1-3-5)", steps: [0, 2, 4] },
  { id: "arpeges-4", name: "Arpèges 4 sons (1-3-5-7)", steps: [0, 2, 4, 6] },
  { id: "quartes", name: "Quartes", steps: [0, 3] },
  { id: "1324", name: "1-3-2-4", steps: [0, 2, 1, 3] },
];

export const DEFAULT_RHYTHMS: RhythmMotif[] = [
  { id: "r1", label: "Noire, deux croches", grid: "x---x-x-" },
  { id: "r2", label: "Deux croches, noire", grid: "x-x-x---" },
  { id: "r3", label: "Croche, noire, croche (syncope)", grid: "x-x---x-" },
  { id: "r4", label: "Soupir, noire", grid: "....x---" },
  { id: "r5", label: "Demi-soupir, croche, noire", grid: "..x-x---" },
  { id: "r6", label: "Croche pointée, double ×2", grid: "x--xx--x" },
  { id: "r7", label: "Contretemps, contretemps", grid: "..x-..x-" },
  { id: "r8", label: "Noire liée à une croche, croche", grid: "x-----x-" },
  { id: "r9", label: "Quatre croches", grid: "x-x-x-x-" },
  { id: "r10", label: "Blanche", grid: "x-------" },
];

export const DEFAULT_DICTIONARIES: Dictionaries = {
  modes: DEFAULT_MODES,
  qualities: DEFAULT_QUALITIES,
  motifs: DEFAULT_MOTIFS,
  rhythms: DEFAULT_RHYTHMS,
};
