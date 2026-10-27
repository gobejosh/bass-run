/** Libellés français du jeu, tirés des tables quand elles les fournissent. */
import type { Effect, EngineConfig, GameState, ReportEvent, Runner } from "../engine";
import { displayName } from "../engine";

export const STATS = ["PIR", "CBT", "MAT", "SOC"] as const;
export const SLOTS = ["arme", "implant", "outil"] as const;
export const SLOT_LABEL: Record<string, string> = { arme: "Arme", implant: "Implant", outil: "Outil" };
export const SLOT_NAME: Record<string, string> = { sur: "Sûr", standard: "Standard", risque: "Risqué", op: "Opération", g: "Petit boulot" };
export const RARITY_NAME: Record<string, string> = { recup: "Récup", street: "Street", corpo: "Corpo", prototype: "Prototype", fantome: "Fantôme" };
export const INJURY_NAME: Record<string, string> = { light: "légère", normal: "normale", severe: "grave" };

export const statName = (cfg: EngineConfig, s: string) => (cfg.core.stats as Record<string, string>)[s] ?? s;
export const roleName = (cfg: EngineConfig, id: string) => (cfg.roleById[id]?.name as string | undefined) ?? id;
export const typeName = (cfg: EngineConfig, id: string) => (cfg.typeById[id]?.name as string | undefined) ?? "Opération";

/** Pseudo seul, pour les listes compactes. */
export const handle = (r: Runner) => r.name.handle;

export function runnerById(state: GameState, id: string): Runner | undefined {
  return state.runners.find((r) => r.id === id) ?? state.candidates.find((r) => r.id === id);
}

const pct = (v: number) => `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)} %`;
const signed = (v: number) => `${v > 0 ? "+" : "−"}${String(Math.abs(v)).replace(".", ",")}`;

/** Effet d'un trait, talent, affixe ou module, en une courte phrase. */
export function effectLabel(cfg: EngineConfig, e: Effect): string {
  const when = e.when?.type ? ` en ${typeName(cfg, e.when.type).toLowerCase()}` : e.when?.crewMax ? ` en équipe de ${e.when.crewMax} ou moins` : e.when?.stat ? ` quand ${e.when.stat} est demandé` : "";
  switch (e.kind) {
    case "stat":
      return `${signed(e.value)} ${e.stat === "all" ? "partout" : e.stat}`;
    case "growth":
      return `croissance ${pct(e.value)}`;
    case "roll":
      return `${signed(e.value)} au jet${when}`;
    case "dc":
      return `DD ${signed(e.value)}${when}`;
    case "supportCoef":
      return `soutien ${pct(e.value)}`;
    case "critRange":
      return "succès critique plus fréquent";
    case "fumbleRange":
      return e.value < 0 ? "échec critique impossible" : "échec critique plus fréquent";
    case "injuryDuration":
      return `blessures ${signed(e.value)} bloc`;
    case "injuryAvoid":
      return `${Math.round(e.value * 100)} % d'esquiver une blessure`;
    case "xpMult":
      return `XP ${pct(e.value)}`;
    case "creditMult":
      return `crédits ${pct(e.value)}`;
    case "repMult":
      return `réputation ${pct(e.value)}`;
    case "gearChance":
      return `équipement ${pct(e.value)}`;
    case "stealth":
      return "discret (hors exposition)";
    default:
      return e.kind;
  }
}

export function effectsLabel(cfg: EngineConfig, effects: readonly Effect[]): string {
  return effects.map((e) => effectLabel(cfg, e)).join(", ");
}

/** Événement de rapport en une ligne lisible ; null pour ceux qu'on n'affiche pas en V1. */
export function eventLabel(e: ReportEvent, state: GameState, cfg: EngineConfig): string | null {
  const who = (id: unknown) => {
    const r = typeof id === "string" ? runnerById(state, id) : undefined;
    return r ? displayName(r) : "Un runner";
  };
  const district = (t: unknown) => state.districts[Number(t) - 1]?.name ?? `palier ${String(t)}`;
  switch (e.kind) {
    case "levelUp":
      return `${who(e.runner)} passe au niveau ${String(e.level)}.`;
    case "talentChoice":
      return `${who(e.runner)} peut choisir un talent.`;
    case "injury":
      return `${who(e.runner)} est blessé (${INJURY_NAME[String(e.severity)] ?? ""}) : indisponible ${String(e.blocks)} bloc${Number(e.blocks) > 1 ? "s" : ""}.`;
    case "injuryAvoided":
      return `${who(e.runner)} esquive la blessure.`;
    case "healed":
      return `${who(e.runner)} est remis sur pied.`;
    case "alert":
      return `Alerte ${district(e.tier)} : ${String(e.from)} → ${String(e.to)}.`;
    case "unlock":
      return `Nouveau quartier ouvert : ${String(e.district)}.`;
    case "grandCoupOpen":
      return "Le Grand Coup est ouvert : une carte « Opération » rejoint les contrats.";
    case "forge": {
      const it = state.items[String(e.item)];
      return `Forge mémorielle : ${it?.name ?? "un objet unique"}.`;
    }
    case "opStage":
      return `Grand Coup : étape ${String(e.stage)} réussie.`;
    case "grandCoupDone":
      return "Le Grand Coup est bouclé.";
    default:
      return null;
  }
}

/** Acte de la saison en cours. */
export function currentAct(cfg: EngineConfig, fraction: number): { name: string; id: number } {
  const acts = cfg.core.season.acts as { id: number; name: string; opensAt: number }[];
  let cur = acts[0]!;
  for (const a of acts) if (fraction >= a.opensAt) cur = a;
  return cur;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("fr-FR");
export const fmtPct = (p: number) => `${Math.round(p * 100)} %`;
export const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtInt(Math.abs(n))}`;
export const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",").replace("-", "−");
export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
