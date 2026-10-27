/**
 * Règles d'inventaire (fonctions pures).
 * - Inventaire illimité.
 * - Chaque instance a N utilisations (3 par défaut) ; à 0 elle disparaît.
 * - Une utilisation est consommée quand un bloc équipé de ce mod est TERMINÉ.
 * - Un bloc abandonné ne consomme rien.
 */
import type { BlockStatus, ModInstance } from "../types";

export interface UseOutcome {
  /** L'instance mise à jour, ou null si elle doit disparaître. */
  instance: ModInstance | null;
  consumed: boolean;
}

export function applyBlockEnd(inst: ModInstance, status: Exclude<BlockStatus, "en_cours">): UseOutcome {
  if (status === "abandonne") return { instance: inst, consumed: false };
  if (inst.usesLeft <= 0) throw new Error(`Mod ${inst.id} déjà épuisé`);
  const usesLeft = inst.usesLeft - 1;
  return { instance: usesLeft > 0 ? { ...inst, usesLeft } : null, consumed: true };
}

/** Met à jour une liste d'inventaire après la fin d'un bloc, puis ajoute le loot éventuel. */
export function updateInventory(
  inventory: readonly ModInstance[],
  equippedId: string | undefined,
  status: Exclude<BlockStatus, "en_cours">,
  loot?: ModInstance,
): ModInstance[] {
  const out: ModInstance[] = [];
  for (const inst of inventory) {
    if (inst.id === equippedId) {
      const r = applyBlockEnd(inst, status);
      if (r.instance) out.push(r.instance);
    } else {
      out.push(inst);
    }
  }
  if (loot && status === "termine") out.push(loot);
  return out;
}
