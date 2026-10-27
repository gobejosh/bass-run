/**
 * Répertoire : les morceaux à travailler (V1.1). Remplace les « standards en cours d'étude » et accueille
 * les mélodies imposées de REP-01 (partition, passages, paliers).
 *
 * Logique pure. La banque de standards inconnus (DEC-01, DEC-02) n'en fait PAS partie : elle reste dans
 * son propre magasin, avec ses règles anti-spoil, et rien ici ne la lit.
 */
import type { Grid, KeySig, Melody, Passage, Standard, Tier } from "./library";
import { TIERS } from "./library";
import type { ExerciseId } from "./types";

/** Statut saisi par toi. « À entretenir » n'est pas saisi : il se déduit (voir maintenanceDue). */
export const PIECE_STATUSES = ["a-apprendre", "en-cours", "su"] as const;
export type PieceStatus = (typeof PIECE_STATUSES)[number];
export const PIECE_STATUS_LABEL: Record<PieceStatus, string> = {
  "a-apprendre": "À apprendre",
  "en-cours": "En cours",
  su: "Su",
};

export type Priority = -1 | 0 | 1;

export interface Homework {
  /** Échéance : date du prochain cours (AAAA-MM-JJ). */
  due: string;
  /** Exercices visés (facultatif). Vide : l'app choisit selon ce que la fiche contient. */
  focus?: ExerciseId[];
  note?: string;
}

export interface Piece {
  id: string;
  title: string;
  composer?: string;
  key?: KeySig;
  beatsPerBar: number;
  /** Forme libre : AABA, blues, AABC… */
  form?: string;
  grid?: Grid;
  /** Partition (PDF ou image) : thème, ou mélodie imposée de REP-01. */
  scoreBlobId?: string;
  /** Passages de la mélodie (REP-01). Vide : le morceau n'est pas proposé en REP-01. */
  passages: Passage[];
  status: PieceStatus;
  priority: Priority;
  homework?: Homework | null;
  notes?: string;
  /** Anciens identifiants (mélodie fusionnée) : l'historique des blocs qui les citent reste rattaché. */
  legacyIds?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Ancien identifiant → identifiant du morceau. */
export function aliasMap(pieces: readonly Pick<Piece, "id" | "legacyIds">[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of pieces) for (const old of p.legacyIds ?? []) m.set(old, p.id);
  return m;
}

export const hasGrid = (p: Pick<Piece, "grid">): boolean => !!p.grid && p.grid.length > 0;
export const hasPassages = (p: Pick<Piece, "passages">): boolean => p.passages.length > 0;

/* ------------------------------------------------------------------ dernier jeu */

/** Ce qu'il faut d'un bloc pour savoir quel morceau il a travaillé. */
export interface BlockTrace {
  exerciseId: ExerciseId;
  startedAt: number;
  status: "en_cours" | "termine" | "abandonne";
  playedSeconds?: number;
  draws: Record<string, unknown>;
}

/**
 * Identifiant du morceau travaillé par un bloc. Les anciens blocs portent `standardId` (WLK, IMP, MAN-02)
 * ou `melodyId` (REP-01) : la migration garde ces identifiants, l'historique reste donc lisible.
 */
export function pieceIdOf(b: Pick<BlockTrace, "draws">): string | undefined {
  const d = b.draws;
  for (const k of ["pieceId", "standardId", "melodyId"] as const) {
    if (typeof d[k] === "string" && d[k]) return d[k] as string;
  }
  return undefined;
}

/** Dernier bloc (terminé ou abandonné, au moins une minute jouée) sur chaque morceau. */
export function lastPlayedByPiece(blocks: readonly BlockTrace[], aliases: ReadonlyMap<string, string> = new Map()): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of blocks) {
    if (b.status === "en_cours" || (b.playedSeconds ?? 0) < 60) continue;
    const raw = pieceIdOf(b);
    if (!raw) continue;
    const id = aliases.get(raw) ?? raw;
    if ((out.get(id) ?? 0) < b.startedAt) out.set(id, b.startedAt);
  }
  return out;
}

const DAY = 86_400_000;

/** « À entretenir » : su, et pas rejoué depuis au moins N jours (ou jamais). Information seulement. */
export function maintenanceDue(p: Pick<Piece, "id" | "status">, lastPlayed: ReadonlyMap<string, number>, now: number, afterDays: number): boolean {
  if (p.status !== "su") return false;
  const last = lastPlayed.get(p.id);
  return last === undefined || now - last >= afterDays * DAY;
}

/** Passage le moins avancé d'une mélodie (pour REP-01 proposé par le générateur). */
export function weakestPassage(p: Pick<Piece, "passages">): Passage | undefined {
  return [...p.passages].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))[0];
}

/* ------------------------------------------------------------------ migration v1 → répertoire */

const normTitle = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface LegacyMigration {
  pieces: Piece[];
  /** Clés de tempo de référence à renommer (REP-01:<mélodie fusionnée>:<passage> → REP-01:<morceau>:<passage>). */
  tempoKeyRenames: [from: string, to: string][];
  /** Mélodie fusionnée dans un standard de même titre : ancien id → id du morceau. */
  mergedMelodies: [melodyId: string, pieceId: string][];
}

/**
 * Standards en cours d'étude et mélodies imposées → morceaux du répertoire. Aucune donnée perdue :
 * - chaque standard devient un morceau « en cours », même identifiant (l'historique et les tirages restent liés) ;
 * - chaque mélodie devient un morceau « en cours » avec sa partition et ses passages, même identifiant ;
 * - option `mergeSameTitle` : une mélodie dont le titre normalisé est celui d'un seul standard est fusionnée
 *   dans ce standard (partition + passages), et ses tempos de référence REP-01 sont renommés.
 */
export function migrateLegacyLibrary(
  standards: readonly Standard[],
  melodies: readonly Melody[],
  opts: { mergeSameTitle: boolean; now?: number } = { mergeSameTitle: false },
): LegacyMigration {
  const now = opts.now ?? Date.now();
  const pieces: Piece[] = standards.map((s) => ({
    id: s.id,
    title: s.title,
    key: s.key,
    beatsPerBar: s.beatsPerBar,
    grid: s.grid,
    passages: [],
    status: "en-cours",
    priority: 0,
    homework: null,
    createdAt: s.createdAt,
    updatedAt: now,
  }));
  const byTitle = new Map<string, Piece[]>();
  for (const p of pieces) byTitle.set(normTitle(p.title), [...(byTitle.get(normTitle(p.title)) ?? []), p]);

  const tempoKeyRenames: [string, string][] = [];
  const mergedMelodies: [string, string][] = [];
  for (const m of melodies) {
    const twins = byTitle.get(normTitle(m.title)) ?? [];
    const target = opts.mergeSameTitle && twins.length === 1 && twins[0]!.passages.length === 0 && !twins[0]!.scoreBlobId ? twins[0]! : null;
    if (target) {
      target.passages = m.passages.map((p) => ({ ...p }));
      if (m.scoreBlobId) target.scoreBlobId = m.scoreBlobId;
      if (!target.key && m.key) target.key = m.key;
      target.legacyIds = [...(target.legacyIds ?? []), m.id];
      mergedMelodies.push([m.id, target.id]);
      for (const p of m.passages) tempoKeyRenames.push([`REP-01:${m.id}:${p.id}`, `REP-01:${target.id}:${p.id}`]);
      continue;
    }
    pieces.push({
      id: m.id,
      title: m.title,
      ...(m.key ? { key: m.key } : {}),
      beatsPerBar: m.beatsPerBar ?? 4,
      ...(m.scoreBlobId ? { scoreBlobId: m.scoreBlobId } : {}),
      passages: m.passages.map((p) => ({ ...p })),
      status: "en-cours",
      priority: 0,
      homework: null,
      createdAt: m.createdAt,
      updatedAt: now,
    });
  }
  return { pieces, tempoKeyRenames, mergedMelodies };
}

/** Palier d'un passage, pour l'affichage compact. */
export const tierIndex = (t: Tier): number => TIERS.indexOf(t);
