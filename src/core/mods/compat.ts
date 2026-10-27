import type { ExerciseId, ModDef, ModInstance, UnlockRule } from "../types";
import { getMod } from "./catalog";

/** État de maîtrise utile aux verrous. */
export interface UnlockContext {
  /** MAN-03 : palier avancé atteint (débloque Extensions). */
  man03Advanced: boolean;
  /** REP-01 : le passage choisi est au palier « fiable » ou mieux (débloque Overclock). */
  repPassageReliable: boolean;
}

export const UNLOCK_LABEL: Record<UnlockRule, string> = {
  "man03-avance": "Palier avancé MAN-03 requis",
  "rep-fiable": "Passage au palier « fiable » requis",
};

export function isCompatible(mod: ModDef, exerciseId: ExerciseId): boolean {
  return mod.exercises.includes(exerciseId);
}

export function isUnlocked(mod: ModDef, ctx: UnlockContext): boolean {
  switch (mod.unlock) {
    case null:
      return true;
    case "man03-avance":
      return ctx.man03Advanced;
    case "rep-fiable":
      return ctx.repPassageReliable;
  }
}

export type EquipCheck = { ok: true } | { ok: false; reason: string };

export function canEquip(inst: ModInstance, exerciseId: ExerciseId, ctx: UnlockContext): EquipCheck {
  if (inst.usesLeft <= 0) return { ok: false, reason: "Plus d'utilisation" };
  const mod = getMod(inst.modId);
  if (!isCompatible(mod, exerciseId)) return { ok: false, reason: `Incompatible avec ${exerciseId}` };
  if (!isUnlocked(mod, ctx)) return { ok: false, reason: UNLOCK_LABEL[mod.unlock!] };
  return { ok: true };
}

/** Exercices sur lesquels au moins un mod est équipable (aucun pour RYT-01 et EAR-01). */
export function exercisesWithMods(mods: readonly ModDef[]): Set<ExerciseId> {
  return new Set(mods.flatMap((m) => m.exercises));
}
