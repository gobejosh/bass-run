/**
 * Point d'entrée du moteur pour l'app : tables JSON chargées et indexées une fois.
 * Le moteur (engine.js) et ses tables sont partagés avec le simulateur (tools/sim.mjs).
 */
import * as E from "./engine.js";
import affixes from "./config/affixes.json";
import contracts from "./config/contracts.json";
import core from "./config/core.json";
import cosmetics from "./config/cosmetics.json";
import districts from "./config/districts.json";
import items from "./config/items.json";
import names from "./config/names.json";
import narrative from "./config/narrative.json";
import planque from "./config/planque.json";
import roles from "./config/roles.json";
import traits from "./config/traits.json";

export * from "./engine.js";

export const RAW_TABLES = { core, roles, traits, districts, contracts, items, affixes, planque, names } as const;
export const NARRATIVE = narrative;
export const COSMETICS = cosmetics;

let cached: E.EngineConfig | null = null;

/** Configuration du moteur, construite une seule fois. */
export function engineConfig(): E.EngineConfig {
  if (!cached) cached = E.buildConfig(structuredClone(RAW_TABLES) as unknown as E.RawConfig);
  return cached;
}
