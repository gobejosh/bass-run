import type { AppConfig } from "../config";
import { rollRarity } from "../rarity";
import { pick, type Rng } from "../rng";
import type { LootState, ModDef, ModInstance, Rarity } from "../types";
import { MODS } from "./catalog";

export const newId = (): string => globalThis.crypto.randomUUID();

/** Tire les paramètres entre crochets d'un mod pour une rareté donnée. */
export function drawDropParams(rng: Rng, mod: ModDef, rarity: Rarity): Record<string, string> {
  const params: Record<string, string> = {};
  for (const p of mod.dropParams) {
    if (p.rarities && !p.rarities.includes(rarity)) continue;
    params[p.key] = pick(rng, p.values);
  }
  return params;
}

export interface LootResult {
  instance: ModInstance;
  pity: boolean;
  next: LootState;
}

/**
 * Loot de fin de bloc terminé : un mod tiré uniformément dans tout le catalogue,
 * une rareté tirée selon la note (avec pitié), puis ses paramètres [entre crochets].
 */
export function lootMod(
  rng: Rng,
  note: number,
  state: LootState,
  cfg: AppConfig,
  opts: { mods?: readonly ModDef[]; now?: number; id?: () => string } = {},
): LootResult {
  const mods = opts.mods ?? MODS;
  const mod = pick(rng, mods);
  const { rarity, pity, next } = rollRarity(rng, note, state, cfg);
  return {
    instance: {
      id: (opts.id ?? newId)(),
      modId: mod.id,
      rarity,
      params: drawDropParams(rng, mod, rarity),
      usesLeft: cfg.loot.usesPerMod,
      obtainedAt: opts.now ?? Date.now(),
    },
    pity,
    next,
  };
}
