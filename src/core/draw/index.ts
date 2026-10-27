/**
 * Moteur de tirage : tous les paramètres aléatoires des exercices.
 * Chaque fonction reçoit le générateur (crypto en production, déterministe en test).
 */
import type { ModEffects } from "../types";
import { intBetween, pick, sample, type Rng } from "../rng";
import type { Dictionaries, ModeDef, ModeFamily, MotifDef, QualityDef, RhythmMotif } from "../theory/dictionaries";
import { BASE_FUNCTIONS, chordTones } from "../theory/chords";
import { commonSpelling, mod12, spellingsOf, type SpelledNote } from "../theory/notes";
import { modeNotes, tonicSpellings } from "../theory/scales";

/* ---------------------------------------------------------------- notes (MAN-01) */

export type Spelling = NonNullable<ModEffects["spelling"]>;

const EDGE: Record<number, SpelledNote> = {
  5: { letter: 2, alter: 1 }, // Mi♯
  0: { letter: 6, alter: 1 }, // Si♯
  4: { letter: 3, alter: -1 }, // Fa♭
  11: { letter: 0, alter: -1 }, // Do♭
};

const isBlack = (pc: number) => [1, 3, 6, 8, 10].includes(mod12(pc));

/**
 * Orthographie une hauteur pour MAN-01 selon le niveau d'Enharmonie.
 * `blackCount` = nombre de touches noires déjà présentées (pour l'alternance).
 */
export function spellForMan01(rng: Rng, pc: number, spelling: Spelling | undefined, blackCount: number): SpelledNote {
  const randomCommon = () => commonSpelling(pc, rng.next() < 0.5 ? "sharp" : "flat");
  const edgeOr = (fallback: () => SpelledNote) => (EDGE[pc] && rng.next() < 0.5 ? EDGE[pc]! : fallback());
  const double = (p: number) => {
    const d = spellingsOf(pc, 2).filter((s) => Math.abs(s.alter) === 2);
    if (d.length && rng.next() < p) return pick(rng, d);
    return edgeOr(randomCommon);
  };
  switch (spelling) {
    case undefined:
      return randomCommon();
    case "alternate":
      return isBlack(pc) ? commonSpelling(pc, blackCount % 2 === 0 ? "sharp" : "flat") : commonSpelling(pc);
    case "flats":
      return commonSpelling(pc, "flat");
    case "edge":
      return edgeOr(randomCommon);
    case "double_rare":
      return double(0.2);
    case "double_frequent":
      return double(0.5);
  }
}

/** Hauteur suivante, différente de la précédente. */
export function nextPitch(rng: Rng, previous?: number): number {
  const choices = Array.from({ length: 12 }, (_, i) => i).filter((p) => p !== previous);
  return pick(rng, choices);
}

export type StringOrder = "grave-aigu" | "aigu-grave" | "aleatoire";

export function stringSequence(rng: Rng, order: StringOrder, strings: string[]): string[] {
  if (order === "grave-aigu") return [...strings];
  if (order === "aigu-grave") return [...strings].reverse();
  return sample(rng, strings, strings.length);
}

/* ---------------------------------------------------------------- modes */

export function enabledModes(dicts: Dictionaries, families: ModeFamily[]): ModeDef[] {
  return dicts.modes.filter((m) => families.includes(m.family));
}

export interface ModeDraw {
  mode: ModeDef;
  tonic: SpelledNote;
  direction: "ascendant" | "descendant";
}

export function drawMode(rng: Rng, modes: ModeDef[]): ModeDraw {
  const mode = pick(rng, modes);
  const tonic = drawTonicFor(rng, mode);
  return { mode, tonic, direction: rng.next() < 0.5 ? "ascendant" : "descendant" };
}

export function drawTonicFor(rng: Rng, mode: ModeDef, pc?: number): SpelledNote {
  return pick(rng, tonicSpellings(pc ?? rng.int(12), mode));
}

/* ---------------------------------------------------------------- accords */

export interface ChordDraw {
  root: SpelledNote;
  quality: QualityDef;
}

export function enabledQualities(dicts: Dictionaries, ids: string[]): QualityDef[] {
  const q = dicts.qualities.filter((x) => ids.includes(x.id) && x.tones.length >= 4);
  if (q.length === 0) throw new Error("Aucune qualité d'accord activée (config chords.enabledQualities).");
  return q;
}

/** Fondamentale : 12 hauteurs, orthographiée comme la tonique du mode associé (lisible). */
export function drawChord(rng: Rng, qualities: QualityDef[], dicts: Dictionaries): ChordDraw {
  const quality = pick(rng, qualities);
  const mode = dicts.modes.find((m) => m.id === quality.mode);
  const pc = rng.int(12);
  const root = mode ? pick(rng, tonicSpellings(pc, mode)) : commonSpelling(pc);
  return { root, quality };
}

/** Fonction demandée (MAN-03) : de base, ou extension si le mod Extensions est équipé. */
export function drawFunction(rng: Rng, extensions?: string[], previous?: string): string {
  const pool = extensions && extensions.length ? extensions : [...BASE_FUNCTIONS];
  const choices = pool.length > 1 ? pool.filter((f) => f !== previous) : pool;
  return pick(rng, choices);
}

/* ---------------------------------------------------------------- motifs */

export function drawMotif(rng: Rng, motifs: MotifDef[]): MotifDef {
  return pick(rng, motifs);
}

export function drawRhythm(rng: Rng, rhythms: RhythmMotif[]): RhythmMotif {
  return pick(rng, rhythms);
}

/**
 * Palette réduite : N notes tirées dans la gamme associée à l'accord.
 * Les notes de l'accord sont prioritaires (on ne tire au-delà que si N > 4).
 */
export function drawPalette(rng: Rng, chord: ChordDraw, dicts: Dictionaries, size: number): SpelledNote[] {
  const tones = chordTones(chord.root, chord.quality);
  if (size <= tones.length) return sample(rng, tones, size);
  const mode = dicts.modes.find((m) => m.id === chord.quality.mode);
  const scale = mode ? modeNotes(chord.root, mode) : tones;
  const others = scale.filter((n) => !tones.some((t) => t.letter === n.letter && t.alter === n.alter));
  return [...tones, ...sample(rng, others, size - tones.length)];
}

/** Rétrograde Fantôme : sens de chaque répétition. */
export function drawDirections(rng: Rng, count: number): ("endroit" | "envers")[] {
  return Array.from({ length: count }, () => (rng.next() < 0.5 ? "endroit" : "envers"));
}

/** Fragment de grille : 2 à 4 accords consécutifs (indices dans la liste aplatie). */
export function drawFragmentRange(rng: Rng, chordCount: number, min = 2, max = 4): { start: number; length: number } {
  const length = Math.min(chordCount, intBetween(rng, min, max));
  return { start: rng.int(chordCount - length + 1), length };
}
