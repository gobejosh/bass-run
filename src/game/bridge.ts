/**
 * Pont musique → jeu, à sens unique.
 *
 * Le jeu ne reçoit qu'un flux d'événements en lecture seule (EventFeed) : abonnement aux
 * événements en direct et relecture du journal depuis un horodatage. Il ne connaît ni le
 * dépôt musical, ni sa base, ni aucune fonction d'écriture.
 *
 * Garanties :
 * - idempotence par eventId (contrôlée dans la transaction du jeu) ;
 * - rejeu au démarrage (et au retour sur l'onglet) des événements manqués, dans l'ordre ;
 * - contrôle de la version du schéma (les versions inconnues sont écartées et signalées) ;
 * - traitement en série : un seul événement à la fois, jamais d'entrelacement.
 */
import type { PublicEvent } from "../core/events";
import type { ApplyContext } from "./apply";
import type { GameStore, HandleOutcome } from "./store";

export interface EventFeed {
  /** Événements journalisés depuis `at` (inclus), dans l'ordre chronologique. */
  since(at: number): Promise<readonly Readonly<PublicEvent>[]>;
  /** Événements en direct. Renvoie la fonction de désabonnement. */
  subscribe(handler: (e: Readonly<PublicEvent>) => void): () => void;
}

export interface BridgeHooks {
  onProcessed?: (e: Readonly<PublicEvent>, o: HandleOutcome) => void | Promise<void>;
  onError?: (e: Readonly<PublicEvent> | null, err: unknown) => void;
}

/** Marge de relecture sous le curseur (horloges identiques à la milliseconde). */
const REPLAY_MARGIN_MS = 60_000;

export class GameBridge {
  private chain: Promise<void> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly store: GameStore,
    private readonly feed: EventFeed,
    private readonly ctx: () => Promise<ApplyContext>,
    private readonly hooks: BridgeHooks = {},
  ) {}

  /** Démarre : abonnement immédiat (rien n'est perdu), puis rejeu, puis les événements en direct, en série. */
  start(): Promise<void> {
    if (!this.unsubscribe) this.unsubscribe = this.feed.subscribe((e) => void this.enqueue(e));
    return this.resync();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Relit le journal depuis le curseur et traite ce qui manque. */
  resync(): Promise<void> {
    return this.run(async () => {
      const record = await this.store.record();
      const from = Math.max(0, (record?.cursorAt ?? 0) - REPLAY_MARGIN_MS);
      // À horodatage égal (même milliseconde), le lancement d'un bloc passe avant sa fin.
      const events = [...(await this.feed.since(from))].sort((a, b) => a.at - b.at || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
      for (const e of events) await this.process(e);
    });
  }

  /** Attend la fin des traitements en cours (tests, sauvegarde). */
  idle(): Promise<void> {
    return this.chain;
  }

  private enqueue(e: Readonly<PublicEvent>): Promise<void> {
    return this.run(() => this.process(e));
  }

  private run(task: () => Promise<void>): Promise<void> {
    const next = this.chain.then(task).catch((err) => this.hooks.onError?.(null, err));
    this.chain = next;
    return next;
  }

  private async process(e: Readonly<PublicEvent>): Promise<void> {
    try {
      if (await this.store.isProcessed(e.eventId)) return;
      const o = await this.store.handle(e, await this.ctx());
      if (o.fresh) await this.hooks.onProcessed?.(e, o);
    } catch (err) {
      // Un événement qui fait échouer le moteur est écarté (et signalé) pour ne jamais bloquer les suivants.
      this.hooks.onError?.(e, err);
      try {
        await this.store.db.put("processed", {
          eventId: e.eventId,
          at: e.at,
          type: e.type,
          blockId: e.blockId,
          status: "ignored",
          reason: `erreur : ${err instanceof Error ? err.message : String(err)}`,
        });
      } catch {
        /* rien de plus à faire */
      }
    }
  }
}

const TYPE_ORDER: Record<PublicEvent["type"], number> = { bloc_lance: 0, bloc_termine: 1, bloc_abandonne: 1 };
