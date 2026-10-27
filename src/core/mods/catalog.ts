import raw from "./catalog.json";
import { EXERCISE_IDS, RARITIES, type ModDef, type Rarity } from "../types";

/** Tempo d'un mod simple selon la rareté (barème de la spec). */
export const SIMPLE_TEMPO_PCT: Record<Rarity, number> = {
  recup: -30,
  street: -20,
  corpo: -10,
  prototype: 0,
  fantome: 10,
};

/** Vérifie la cohérence du catalogue. Renvoie la liste des problèmes (vide si tout va bien). */
export function validateCatalog(mods: ModDef[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const m of mods) {
    const where = `mod « ${m.id} »`;
    if (ids.has(m.id)) errors.push(`${where} : identifiant en double`);
    ids.add(m.id);
    if (!m.name) errors.push(`${where} : nom manquant`);
    if (m.type !== "simple" && m.type !== "intensity") errors.push(`${where} : type inconnu`);
    if (m.exercises.length === 0) errors.push(`${where} : aucun exercice compatible`);
    for (const ex of m.exercises) {
      if (!(EXERCISE_IDS as readonly string[]).includes(ex)) errors.push(`${where} : exercice inconnu ${ex}`);
    }
    for (const r of RARITIES) {
      const lvl = m.levels[r];
      if (!lvl) {
        errors.push(`${where} : niveau ${r} manquant`);
        continue;
      }
      if (!lvl.label) errors.push(`${where} : libellé ${r} manquant`);
      if (typeof lvl.tempoPct !== "number") errors.push(`${where} : tempoPct ${r} manquant`);
      if (m.type === "simple") {
        if (lvl.tempoPct !== SIMPLE_TEMPO_PCT[r]) errors.push(`${where} : tempo ${r} hors barème`);
        if (lvl.effects && Object.keys(lvl.effects).length > 0) errors.push(`${where} : un mod simple ne doit faire varier que le tempo`);
      }
    }
    for (const p of m.dropParams) {
      if (p.values.length === 0) errors.push(`${where} : paramètre ${p.key} sans valeurs`);
      if (!m.constraint.includes("[") && !Object.values(m.levels).some((l) => l.label.includes("[")))
        errors.push(`${where} : paramètre ${p.key} sans crochets dans la spec`);
    }
  }
  return errors;
}

export const MODS: readonly ModDef[] = Object.freeze(raw.mods as ModDef[]);

const BY_ID = new Map(MODS.map((m) => [m.id, m]));

export function getMod(id: string): ModDef {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Mod inconnu : ${id}`);
  return m;
}

export function findMod(id: string): ModDef | undefined {
  return BY_ID.get(id);
}
