/**
 * Événements publics : la seule surface que le jeu parallèle peut consommer.
 *
 * Pont à sens unique : le jeu peut s'abonner, jamais écrire. Les charges utiles sont
 * des copies profondes gelées ; aucune référence vers l'état interne ne sort d'ici.
 * Les événements sont aussi diffusés sur BroadcastChannel("basse-events") pour une
 * autre page de la même origine, et journalisés en base (voir storage/repo.ts).
 */
import type { ExerciseId, Rarity } from "./types";

export const EVENTS_SCHEMA_VERSION = 1;
export const BROADCAST_CHANNEL = "basse-events";

export interface PublicMod {
  modId: string;
  name: string;
  rarity: Rarity;
}

interface Base {
  schema: typeof EVENTS_SCHEMA_VERSION;
  /** Identifiant unique de l'événement. */
  eventId: string;
  /** Horodatage (ms epoch). */
  at: number;
  blockId: string;
  exerciseId: ExerciseId;
}

export interface BlockStartedEvent extends Base {
  type: "bloc_lance";
  plannedMinutes: number;
  mod: PublicMod | null;
}

export interface BlockFinishedEvent extends Base {
  type: "bloc_termine";
  note: 1 | 2 | 3 | 4 | 5;
  /** Durée réellement jouée, pauses exclues. */
  playedSeconds: number;
  mod: PublicMod | null;
  /** Bloc terminé avec un mod équipé. */
  modVaincu: boolean;
  /** Bonus d'XP du mod vaincu (0 sans mod). */
  bonusXpPct: number;
  /** Mod obtenu en fin de bloc. */
  loot: PublicMod;
}

export interface BlockAbandonedEvent extends Base {
  type: "bloc_abandonne";
  playedSeconds: number;
  mod: PublicMod | null;
}

export type PublicEvent = BlockStartedEvent | BlockFinishedEvent | BlockAbandonedEvent;

type Handler = (e: Readonly<PublicEvent>) => void;
const handlers = new Set<Handler>();
let channel: BroadcastChannel | null | undefined;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** S'abonner aux événements. Renvoie la fonction de désabonnement. */
export function onPublicEvent(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Interne à la partie musicale : diffuse un événement. */
export function emitPublicEvent(e: PublicEvent): Readonly<PublicEvent> {
  const frozen = deepFreeze(structuredClone(e));
  for (const h of handlers) {
    try {
      h(frozen);
    } catch (err) {
      // Un abonné défaillant ne doit jamais perturber la pratique.
      console.error("[events] abonné en erreur", err);
    }
  }
  if (channel === undefined) {
    channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(BROADCAST_CHANNEL) : null;
  }
  channel?.postMessage(frozen);
  return frozen;
}
