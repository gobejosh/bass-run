import type { AppConfig } from "./config";
import type { ExerciseId, ModLevel } from "./types";

/** Clé du tempo de référence : par exercice, ou par passage pour REP-01 (morceau du répertoire ; ancien nom : mélodie). */
export function tempoKey(exerciseId: ExerciseId, rep?: { pieceId?: string; melodyId?: string; passageId: string }): string {
  const id = rep?.pieceId ?? rep?.melodyId;
  return exerciseId === "REP-01" && rep && id ? `REP-01:${id}:${rep.passageId}` : exerciseId;
}

export function clampBpm(bpm: number, cfg: AppConfig): number {
  return Math.min(cfg.tempo.maxBpm, Math.max(cfg.tempo.minBpm, bpm));
}

/** Tempo de référence : le dernier tempo propre noté, sinon la valeur initiale de la config. */
export function referenceBpm(stored: number | undefined, exerciseId: ExerciseId, cfg: AppConfig): number {
  if (stored !== undefined && stored > 0) return stored;
  return cfg.tempo.initialRefBpm[exerciseId];
}

/** Tempo de référence ± pourcentage, arrondi au BPM entier le plus proche, borné. */
export function applyPct(refBpm: number, pct: number, cfg: AppConfig): number {
  return clampBpm(Math.round(refBpm * (1 + pct / 100)), cfg);
}

/** Tempo imposé au bloc : référence, modifiée par le niveau du mod s'il y en a un. */
export function blockBpm(refBpm: number, level: ModLevel | undefined, cfg: AppConfig): number {
  return applyPct(refBpm, level?.tempoPct ?? 0, cfg);
}

/**
 * MOD-01 : paliers de tempo progressif.
 * Départ à startPct % du tempo du bloc, +stepBpm toutes les stepEveryBars mesures,
 * jusqu'à capPct % du tempo du bloc (dernier palier tenu ensuite).
 */
export function progressiveLadder(blockBpmValue: number, cfg: AppConfig): number[] {
  const { startPct, stepBpm, capPct } = cfg.mod01;
  const start = clampBpm(Math.round((blockBpmValue * startPct) / 100), cfg);
  const cap = clampBpm(Math.round((blockBpmValue * capPct) / 100), cfg);
  const steps: number[] = [];
  for (let b = start; b < cap; b += stepBpm) steps.push(b);
  steps.push(cap);
  return steps;
}

/** Tempo du palier en cours à la mesure `bar` (0 = première mesure après le décompte). */
export function ladderBpmAtBar(ladder: number[], bar: number, cfg: AppConfig): number {
  const i = Math.min(ladder.length - 1, Math.floor(Math.max(0, bar) / cfg.mod01.stepEveryBars));
  return ladder[i]!;
}
