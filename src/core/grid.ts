/**
 * Grilles : saisie texte mesure par mesure, découpage en événements d'accords, fragments, transposition.
 *
 * Format de saisie :
 *   | Dm7 | G7 | Cmaj7 | % |
 *   | Em7 A7 | Dm7 G7 |
 * - « | » sépare les mesures (retours à la ligne libres) ;
 * - plusieurs accords dans une mesure se partagent les temps également ;
 * - « . » prolonge l'accord précédent d'un temps (« Dm7 . . G7 » = 3 + 1 temps) ;
 * - « % » répète la mesure précédente ; « N.C. » = pas d'accord.
 */
import type { Grid } from "./library";
import { parseChord, transposeChord, chordName, type Chord } from "./theory/chords";
import type { QualityDef } from "./theory/dictionaries";
import type { Notation } from "./theory/notes";

export interface GridIssue {
  /** Mesure concernée (1 = première). */
  measure: number;
  /** Symbole non reconnu. Ne jamais l'afficher pour la banque inconnue. */
  token: string;
}

export function parseGridText(text: string): { grid: Grid; issues: GridIssue[] } {
  const cells = text
    .replace(/\r/g, "")
    .split(/[|\n]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const grid: Grid = [];
  const issues: GridIssue[] = [];
  for (const cell of cells) {
    if (cell === "%") {
      const prev = grid[grid.length - 1];
      if (prev) grid.push([...prev]);
      else issues.push({ measure: grid.length + 1, token: "%" });
      continue;
    }
    const tokens = cell.split(/\s+/);
    for (const t of tokens) {
      if (t === "." || /^n\.?c\.?$/i.test(t)) continue;
      if (!parseChord(t)) issues.push({ measure: grid.length + 1, token: t });
    }
    grid.push(tokens);
  }
  return { grid, issues };
}

export function gridToText(grid: Grid): string {
  const lines: string[] = [];
  for (let i = 0; i < grid.length; i += 4) {
    lines.push("| " + grid.slice(i, i + 4).map((m) => m.join(" ")).join(" | ") + " |");
  }
  return lines.join("\n");
}

export interface ChordEvent {
  /** Symbole tel que saisi (« N.C. » possible). */
  symbol: string;
  chord: Chord | null;
  /** Mesure (0-indexée) et temps de départ (0-indexé). */
  measure: number;
  beat: number;
  beats: number;
}

/** Découpe une grille en événements d'accords (les accords identiques consécutifs sont fusionnés). */
export function chordEvents(grid: Grid, beatsPerBar: number): ChordEvent[] {
  const out: ChordEvent[] = [];
  grid.forEach((tokens, measure) => {
    const usesDots = tokens.includes(".");
    const slots: { symbol: string; beats: number }[] = [];
    if (usesDots) {
      for (const t of tokens) {
        if (t === "." && slots.length) slots[slots.length - 1]!.beats += 1;
        else if (t !== ".") slots.push({ symbol: t, beats: 1 });
      }
    } else {
      for (const t of tokens) slots.push({ symbol: t, beats: beatsPerBar / tokens.length });
    }
    let beat = 0;
    for (const s of slots) {
      const last = out[out.length - 1];
      if (last && last.symbol === s.symbol) last.beats += s.beats;
      else out.push({ symbol: s.symbol, chord: parseChord(s.symbol), measure, beat, beats: s.beats });
      beat += s.beats;
    }
  });
  return out;
}

/** Nombre de mesures d'une grille. */
export const gridBars = (grid: Grid): number => grid.length;

/** Événements formant un fragment, et leur durée totale en mesures (arrondie au-dessus). */
export function fragment(events: ChordEvent[], start: number, length: number, beatsPerBar: number) {
  const evs = events.slice(start, start + length);
  const beats = evs.reduce((s, e) => s + e.beats, 0);
  return { events: evs, bars: Math.max(1, Math.ceil(beats / beatsPerBar)) };
}

/** Transpose chaque accord d'une grille ; les symboles non reconnus sont laissés tels quels. */
export function transposeGrid(grid: Grid, letters: number, semis: number, qualities: readonly QualityDef[], notation: Notation): Grid {
  return grid.map((m) =>
    m.map((t) => {
      if (t === "." || t === "%" || /^n\.?c\.?$/i.test(t)) return t;
      const c = parseChord(t);
      return c ? chordName(transposeChord(c, letters, semis), qualities, notation).replace(/ /g, "\u202F") : t;
    }),
  );
}

/** Affiche un symbole de grille dans la notation choisie (sans espace, pour tenir dans une case). */
export function displaySymbol(t: string, qualities: readonly QualityDef[], notation: Notation): string {
  if (t === "." || t === "%" || /^n\.?c\.?$/i.test(t)) return t;
  const c = parseChord(t);
  return c ? chordName(c, qualities, notation).replace(/ /g, "\u202F") : t;
}
