/**
 * Seul point de contact entre la partie musicale et le jeu.
 *
 * Le jeu reçoit un flux en lecture seule : abonnement aux événements publics et relecture du
 * journal. Les événements relus en base sont copiés et gelés comme ceux diffusés en direct :
 * aucune référence vers l'état musical ne sort d'ici, et aucune fonction d'écriture n'est exposée.
 */
import { onPublicEvent, type PublicEvent } from "../core/events";
import type { EventFeed } from "../game/bridge";
import type { Repo } from "../storage/repo";

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

export function eventFeed(repo: Pick<Repo, "events">): EventFeed {
  return Object.freeze({
    async since(at: number): Promise<readonly Readonly<PublicEvent>[]> {
      const events = await repo.events(at);
      return deepFreeze(structuredClone(events));
    },
    subscribe(handler: (e: Readonly<PublicEvent>) => void): () => void {
      return onPublicEvent(handler);
    },
  });
}
