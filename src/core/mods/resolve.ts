import type { AppConfig } from "../config";
import { pick, type Rng } from "../rng";
import { blockBpm } from "../tempo";
import { RARITY_LABEL, type ModDef, type ModEffects, type ModInstance, type ModLevel } from "../types";
import { getMod } from "./catalog";

/** Remplace chaque groupe [..] d'un texte par la valeur tirée correspondante. */
export function fillBrackets(text: string, params: Record<string, string>): string {
  const values = Object.values(params);
  if (values.length === 0) return text;
  let i = 0;
  return text.replace(/\[[^\]]*\]/g, (m) => {
    const v = values[Math.min(i++, values.length - 1)];
    return v !== undefined ? `[${v}]` : m;
  });
}

const SENS_CHOICES: Record<string, string[]> = {
  encerclement: ["par-dessus puis par-dessous", "par-dessous puis par-dessus"],
  "approche-chromatique": ["par le demi-ton inférieur", "par le demi-ton supérieur"],
};

export interface ResolvedMod {
  mod: ModDef;
  instance: ModInstance;
  level: ModLevel;
  effects: ModEffects;
  /** Tempo imposé au bloc. */
  targetBpm: number;
  /** Tirages faits au lancement (sens…). */
  launch: Record<string, string>;
  /** Lignes de consigne à afficher pendant le bloc. */
  lines: string[];
  /** L'app applique ce niveau elle-même (au-delà du tempo). */
  appliedByApp: boolean;
}

export function describeInstance(inst: ModInstance): { title: string; constraint: string; level: string } {
  const mod = getMod(inst.modId);
  return {
    title: `${mod.name} · ${RARITY_LABEL[inst.rarity]}`,
    constraint: fillBrackets(mod.constraint, inst.params),
    level: fillBrackets(mod.levels[inst.rarity].label, inst.params),
  };
}

export function resolveMod(inst: ModInstance, refBpm: number, cfg: AppConfig, rng: Rng): ResolvedMod {
  const mod = getMod(inst.modId);
  const level = mod.levels[inst.rarity];
  const effects = level.effects ?? {};
  const launch: Record<string, string> = {};
  for (const d of effects.launchDraws ?? []) {
    if (d === "sens") launch.sens = pick(rng, SENS_CHOICES[mod.id] ?? ["ascendant", "descendant"]);
  }
  const d = describeInstance(inst);
  const lines = [d.constraint, d.level];
  if (launch.sens) lines.push(`Sens : ${launch.sens}`);
  return {
    mod,
    instance: inst,
    level,
    effects,
    targetBpm: blockBpm(refBpm, level, cfg),
    launch,
    lines,
    appliedByApp: level.enforcement === "app",
  };
}
