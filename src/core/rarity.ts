import type { AppConfig } from "./config";
import { weighted, type Rng } from "./rng";
import { RARITIES, type LootState, type Rarity, type RarityTable } from "./types";

export const rarityRank = (r: Rarity): number => RARITIES.indexOf(r);

/** Prototype ou mieux. */
export const isHigh = (r: Rarity): boolean => rarityRank(r) >= rarityRank("prototype");

export function dropTableFor(note: number, cfg: AppConfig): RarityTable {
  if (!Number.isInteger(note) || note < 1 || note > 5) throw new RangeError(`note invalide : ${note}`);
  if (note === 5) return cfg.loot.dropTable.five;
  if (note === 4) return cfg.loot.dropTable.four;
  return cfg.loot.dropTable.low;
}

/** Table restreinte à Prototype et Fantôme, dans leurs proportions d'origine. */
export function highOnly(table: RarityTable): RarityTable {
  return { recup: 0, street: 0, corpo: 0, prototype: table.prototype, fantome: table.fantome };
}

export interface RarityRoll {
  rarity: Rarity;
  /** Le compteur de pitié a forcé au moins Prototype. */
  pity: boolean;
  next: LootState;
}

/**
 * Tire la rareté d'un drop.
 * Pitié : si les `pityThreshold` drops précédents étaient tous sous Prototype,
 * ce drop est tiré parmi Prototype / Fantôme (proportions de la table de la note).
 */
export function rollRarity(rng: Rng, note: number, state: LootState, cfg: AppConfig): RarityRoll {
  const table = dropTableFor(note, cfg);
  const pity = state.dropsSinceHigh >= cfg.loot.pityThreshold;
  const rarity = weighted(rng, pity ? highOnly(table) : table);
  return {
    rarity,
    pity,
    next: { dropsSinceHigh: isHigh(rarity) ? 0 : state.dropsSinceHigh + 1 },
  };
}
