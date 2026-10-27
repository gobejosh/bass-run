/**
 * REP-01 : paliers de maîtrise des passages.
 *
 * - Découverte : notes connues, pas encore en place.
 * - En place : joué sans arrêt à au moins 60 % du tempo cible du passage.
 * - Fiable : sans arrêt à au moins 85 % du tempo cible (débloque Overclock).
 * - Maîtrisé : au tempo cible.
 * L'app suggère un palier d'après le tempo propre noté ; tu confirmes au débrief.
 */
import type { AppConfig } from "./config";
import { TIERS, type Melody, type Passage, type Tier } from "./library";

export function suggestTier(cleanBpm: number, targetBpm: number | undefined, cfg: AppConfig): Tier | null {
  if (!targetBpm || targetBpm <= 0 || !cleanBpm) return null;
  const pct = (cleanBpm / targetBpm) * 100;
  const t = cfg.rep01.tiers;
  if (pct >= t.maitrisePct) return "maitrise";
  if (pct >= t.fiablePct) return "fiable";
  if (pct >= t.enPlacePct) return "en-place";
  return "decouverte";
}

export const tierRank = (t: Tier): number => TIERS.indexOf(t);
export const isReliable = (t: Tier | undefined): boolean => !!t && tierRank(t) >= tierRank("fiable");

export function findPassage(melodies: readonly Melody[], melodyId?: string, passageId?: string): { melody: Melody; passage: Passage } | null {
  const melody = melodies.find((m) => m.id === melodyId);
  const passage = melody?.passages.find((p) => p.id === passageId);
  return melody && passage ? { melody, passage } : null;
}

export function withPassageTier<T extends { passages: Passage[] }>(m: T, passageId: string, tier: Tier): T {
  return { ...m, passages: m.passages.map((p) => (p.id === passageId ? { ...p, tier } : p)) };
}
