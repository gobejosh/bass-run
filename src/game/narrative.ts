/**
 * Récit du rapport de mission.
 * - Repli local : gabarits de narrative.json, toujours disponible, immédiat et déterministe.
 * - API Claude : voir narrativeApi.ts (étape 3), jamais attendue pour afficher l'issue.
 */
import { hash32, makeRng, NARRATIVE, type NarrativeFacts } from "./engine";
import type { Narrative } from "./model";

const TITLES: Record<string, string> = {
  critSuccess: "Coup d'éclat",
  success: "Contrat rempli",
  partial: "À moitié",
  fail: "Repli",
  critFail: "Désastre",
  gig: "Petit boulot",
};

type Fallback = Record<string, string[] | string>;

function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Rapport assemblé à partir des gabarits locaux : une phrase par famille présente, dans l'ordre. */
export function fallbackNarrative(facts: NarrativeFacts, seed: string): Narrative {
  const fb = NARRATIVE.fallback as unknown as Fallback;
  const rng = makeRng(hash32(seed, "fallback", facts.contrat.cible, facts.issue ?? ""));
  const pick = (k: string) => {
    const list = fb[k];
    return Array.isArray(list) && list.length ? rng.pick(list) : null;
  };
  const vars = {
    quartier: facts.contrat.quartier,
    cible: facts.contrat.cible,
    meneur: facts.equipe[0]?.nom ?? "L'équipe",
    blesse: facts.blesses[0]?.nom ?? "Un runner",
    butin: facts.butin.join(", "),
  };
  const family = facts.contrat.petitBoulot ? "gig" : (facts.issue ?? "success");
  const lines = [pick(family)];
  if (!facts.contrat.petitBoulot) {
    if (facts.blesses.length) lines.push(pick("injury"));
    if (facts.butin.length) lines.push(pick("loot"));
  }
  const rapport = lines.filter((l): l is string => !!l).map((l) => capitalize(fill(l, vars))).join(" ");
  return { titre: TITLES[family] ?? "Rapport", rapport, source: "fallback" };
}

/** Ligne fixe d'une mission avortée (bloc abandonné). */
export function abortedNarrative(penalized: boolean): Narrative {
  return {
    titre: "Mission avortée",
    rapport: penalized
      ? "L'équipe a décroché en pleine opération, une fois de trop aujourd'hui : le client s'en souviendra."
      : "L'équipe a décroché avant le point de non-retour et elle est rentrée sans casse.",
    source: "fallback",
  };
}
