/**
 * Modèle de données du jeu côté app (au-delà du GameState du moteur).
 * Tout vit dans la base IndexedDB « basse-lowend », séparée de « basse-cyber ».
 */
import type { GameState, MissionReport, NarrativeFacts, Rarity, Slot } from "./engine";

/** Versions du schéma d'événements que le jeu sait lire. */
export const SUPPORTED_EVENT_SCHEMAS: readonly number[] = [1];

/** Enregistrement principal : l'état du moteur et ce que l'intégration y ajoute. */
export interface GameRecord {
  version: 1;
  /** Création de la partie (ms). Les blocs antérieurs ne sont jamais rejoués. */
  createdAt: number;
  state: GameState;
  /** Horodatage du dernier événement traité (curseur de rejeu). */
  cursorAt: number;
  /** Abandons de la journée (malus au-delà de core.abandon.freePerDay). */
  abandons: { date: string; count: number };
  /** Fin de la fenêtre de gestion (ms), ou null. Ouverte par un bloc terminé. */
  windowUntil: number | null;
}

/** Choix fait à l'écran de lancement, lié au prochain bloc lancé. */
export type IntentChoice =
  | { kind: "contract"; contractId: string; squad: string[] }
  | { kind: "gig" }
  | { kind: "none" };

export type Intent = IntentChoice & { armedAt: number; date: string };

export interface Narrative {
  titre: string;
  rapport: string;
  source: "api" | "fallback";
}

/** Rapport conservé pour l'affichage (le moteur ne garde qu'un résumé dans state.log). */
export interface StoredReport {
  blockId: string;
  at: number;
  type: "bloc_termine" | "bloc_abandonne";
  report: MissionReport;
  /** Instantané des objets gagnés (ils peuvent être recyclés plus tard). */
  items: { id: string; name: string; rarity: Rarity; slot: Slot }[];
  /** Faits transmis au récit (aucune donnée musicale, aucun titre). */
  facts: NarrativeFacts | null;
  narrative: Narrative | null;
}

export type ProcessedStatus = "applied" | "ignored" | "unsupported";

export interface ProcessedEvent {
  eventId: string;
  at: number;
  type: string;
  blockId: string;
  status: ProcessedStatus;
  reason?: string;
}

export interface GameSettings {
  /** Fin de la saison (AAAA-MM-JJ). Le début est la date de création de la partie. */
  seasonEnd: string;
  /** Mission quand l'écran de lancement n'a rien armé (jeu en panne, autre onglet…). */
  defaultMission: "auto" | "gig" | "none";
  /** Récits par l'API Claude (sinon gabarits locaux). */
  narrativeApi: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  seasonEnd: "2027-06-30",
  defaultMission: "auto",
  narrativeApi: true,
};

/** Une intention armée n'est valable que pour un lancement proche. */
export const INTENT_TTL_MS = 30 * 60 * 1000;

/** Date locale AAAA-MM-JJ (les contrats changent à minuit, heure de l'appareil). */
export function localDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Axe d'un exercice (« WLK-02 » → « WLK »). */
export function axisOf(exerciseId: string): string | null {
  const m = /^([A-Z]{3})-\d+$/.exec(exerciseId);
  return m ? m[1]! : null;
}

export const OUTCOME_LABEL: Record<string, string> = {
  critSuccess: "Succès critique",
  success: "Succès",
  partial: "Succès partiel",
  fail: "Échec",
  critFail: "Échec critique",
  aborted: "Mission avortée",
};
