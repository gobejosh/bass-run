/**
 * Le jeu en fonctionnement : stockage, pont, notifications pour l'interface, actions de gestion.
 *
 * Isolation : tout échec ici reste ici. startGame() ne lève jamais vers l'appelant (la partie
 * musicale), et le jeu indisponible se traduit seulement par des composants qui ne s'affichent pas.
 */
import { GameBridge, type EventFeed } from "./bridge";
import { engineConfig, type EngineConfig, type GameState } from "./engine";
import { newRecord } from "./apply";
import { requestNarrative, type FetchLike } from "./narrativeApi";
import type { GameRecord, GameSettings, IntentChoice, StoredReport } from "./model";
import { localDate } from "./model";
import { GameStore } from "./store";

type Listener = () => void;

/** Au-delà, un rapport rejoué garde son récit local (pas d'appels en rafale). */
const RECENT_STORY_MS = 10 * 60 * 1000;

export class GameRuntime {
  readonly cfg: EngineConfig = engineConfig();
  private listeners = new Set<Listener>();
  private cache: { record: GameRecord | null; settings: GameSettings | null } = { record: null, settings: null };
  readonly bridge: GameBridge;
  /** Rapports reçus pendant cette session (pour l'écran de fin de bloc). */
  private fresh = new Map<string, StoredReport>();
  /** Appelé après chaque rapport (récit par l'API). */
  onReport: ((r: StoredReport) => void) | null = (r) => void this.tellStory(r);
  /** Dernière erreur de l'API de récit (affichée dans les Réglages). */
  lastNarrativeError: string | null = null;
  /** Implémentation de fetch (remplaçable en test). */
  fetchImpl: FetchLike | undefined = undefined;

  constructor(readonly store: GameStore, feed: EventFeed, private readonly now: () => number = Date.now) {
    this.bridge = new GameBridge(store, feed, async () => ({ cfg: this.cfg, settings: await this.settings() }), {
      onProcessed: async (_e, o) => {
        if (o.report) {
          this.fresh.set(o.report.blockId, o.report);
          try {
            this.onReport?.(o.report);
          } catch (err) {
            console.error("[jeu] récit", err);
          }
        }
        await this.reload();
      },
      onError: (e, err) => console.error("[jeu] événement écarté", e?.eventId, err),
    });
  }

  /** Crée la partie si besoin, puis rejoue les événements manqués. */
  async init(seed: () => string = () => globalThis.crypto.randomUUID()): Promise<void> {
    if (!(await this.store.record())) {
      await this.store.putRecord(newRecord(this.cfg, await this.settings(), this.now(), seed()));
    }
    await this.reload();
    await this.bridge.start();
    await this.reload();
  }

  stop(): void {
    this.bridge.stop();
  }

  /* ---------- lecture pour l'interface */

  get record(): GameRecord | null {
    return this.cache.record;
  }

  async settings(): Promise<GameSettings> {
    if (!this.cache.settings) this.cache.settings = await this.store.settings();
    return this.cache.settings;
  }
  async setSettings(s: GameSettings): Promise<void> {
    await this.store.setSettings(s);
    this.cache.settings = s;
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async reload(): Promise<void> {
    this.cache.record = (await this.store.record()) ?? null;
    this.emit();
  }

  emit(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error("[jeu] abonné", err);
      }
    }
  }

  async report(blockId: string): Promise<StoredReport | undefined> {
    return this.fresh.get(blockId) ?? (await this.store.report(blockId));
  }

  /** Remplace le rapport en mémoire (récit arrivé) et prévient l'interface. */
  updateReport(r: StoredReport): void {
    this.fresh.set(r.blockId, r);
    this.emit();
  }

  /* ---------- récit */

  /**
   * Remplace le récit de repli par celui de l'API, en arrière-plan. Seulement pour un rapport
   * récent (pas pour des dizaines de blocs rejoués d'un coup), avec une clé, et si activé.
   */
  async tellStory(r: StoredReport): Promise<void> {
    if (!r.facts || this.now() - r.at > RECENT_STORY_MS) return;
    const [settings, key] = await Promise.all([this.settings(), this.store.apiKey()]);
    if (!settings.narrativeApi || !key) return;
    const { narrative, error } = await requestNarrative(r.facts, key, this.fetchImpl);
    this.lastNarrativeError = error ?? null;
    if (!narrative) return;
    await this.store.setNarrative(r.blockId, narrative);
    this.updateReport({ ...r, narrative });
  }

  /* ---------- réglages de partie */

  async setSeasonEnd(end: string): Promise<void> {
    await this.store.update((r) => (end > r.state.season.start ? { ...r, state: { ...r.state, season: { ...r.state.season, end } } } : null));
    await this.setSettings({ ...(await this.settings()), seasonEnd: end });
    await this.reload();
  }

  /** Nouvelle partie (la précédente est perdue). Les blocs passés ne sont pas rejoués. */
  async restart(seed: string = globalThis.crypto.randomUUID()): Promise<void> {
    await this.store.putRecord(newRecord(this.cfg, await this.settings(), this.now(), seed));
    this.fresh.clear();
    await this.reload();
  }

  /* ---------- lancement */

  /** Arme le choix affiché à l'écran de lancement ; il sera lié au prochain bloc lancé. */
  async arm(choice: IntentChoice): Promise<void> {
    const now = this.now();
    await this.store.arm({ ...choice, armedAt: now, date: localDate(now) });
  }

  /* ---------- fenêtre de gestion */

  windowLeftMs(): number {
    const until = this.cache.record?.windowUntil;
    return until ? Math.max(0, until - this.now()) : 0;
  }

  /**
   * Action de gestion : seulement pendant la fenêtre ouverte par un bloc terminé
   * (« pas de jeu sans pratique »). Renvoie false si refusée.
   */
  async act(fn: (state: GameState, cfg: EngineConfig) => boolean | void): Promise<boolean> {
    let ok = false;
    await this.store.update((r) => {
      if (!r.windowUntil || this.now() > r.windowUntil) return null;
      const res = fn(r.state, this.cfg);
      ok = res !== false;
      return ok ? r : null;
    });
    await this.reload();
    return ok;
  }
}

/* ---------- instance de l'app */

let current: GameRuntime | null = null;
let failure: unknown = null;
const waiters = new Set<() => void>();

export function gameRuntime(): GameRuntime | null {
  return current;
}
export function gameFailure(): unknown {
  return failure;
}
export function onGameReady(fn: () => void): () => void {
  waiters.add(fn);
  return () => waiters.delete(fn);
}

let starting: Promise<GameRuntime | null> | null = null;

/** Démarre le jeu sans jamais lever : un échec désactive seulement le jeu. Un seul démarrage à la fois. */
export function startGame(feed: EventFeed): Promise<GameRuntime | null> {
  starting ??= boot(feed);
  return starting;
}

async function boot(feed: EventFeed): Promise<GameRuntime | null> {
  try {
    const rt = new GameRuntime(await GameStore.open(), feed);
    await rt.init();
    current = rt;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void rt.bridge.resync().then(() => rt.reload());
      });
    }
  } catch (err) {
    failure = err;
    console.error("[jeu] indisponible", err);
  }
  for (const w of waiters) w();
  return current;
}
