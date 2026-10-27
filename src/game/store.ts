/**
 * Stockage du jeu : base IndexedDB « basse-lowend », distincte de la base musicale « basse-cyber ».
 * Le jeu n'ouvre jamais la base musicale : il ne la connaît que par le flux d'événements (bridge.ts).
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PublicEvent } from "../core/events";
import { applyEvent, type ApplyContext } from "./apply";
import type { GameRecord, GameSettings, Intent, Narrative, ProcessedEvent, StoredReport } from "./model";
import { DEFAULT_SETTINGS } from "./model";

export interface LowEndDB extends DBSchema {
  game: { key: string; value: GameRecord };
  processed: { key: string; value: ProcessedEvent; indexes: { byAt: number } };
  reports: { key: string; value: StoredReport; indexes: { byAt: number } };
  kv: { key: string; value: unknown };
  /** Secrets (clé d'API) : jamais exportés. */
  secrets: { key: string; value: string };
}

export const GAME_DB_NAME = "basse-lowend";
export const GAME_DB_VERSION = 1;
const CURRENT = "current";

export type GameDB = IDBPDatabase<LowEndDB>;

export function openGameDB(name = GAME_DB_NAME): Promise<GameDB> {
  return openDB<LowEndDB>(name, GAME_DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("game");
      db.createObjectStore("processed", { keyPath: "eventId" }).createIndex("byAt", "at");
      db.createObjectStore("reports", { keyPath: "blockId" }).createIndex("byAt", "at");
      db.createObjectStore("kv");
      db.createObjectStore("secrets");
    },
  });
}

export interface HandleOutcome {
  /** false : événement déjà traité (idempotence). */
  fresh: boolean;
  processed?: ProcessedEvent;
  report?: StoredReport;
}

export class GameStore {
  constructor(readonly db: GameDB) {}

  static async open(name?: string): Promise<GameStore> {
    return new GameStore(await openGameDB(name));
  }

  async record(): Promise<GameRecord | undefined> {
    return this.db.get("game", CURRENT);
  }
  async putRecord(r: GameRecord): Promise<void> {
    await this.db.put("game", r, CURRENT);
  }

  async settings(): Promise<GameSettings> {
    return { ...DEFAULT_SETTINGS, ...((await this.db.get("kv", "settings")) as Partial<GameSettings> | undefined) };
  }
  async setSettings(s: GameSettings): Promise<void> {
    await this.db.put("kv", s, "settings");
  }

  async intent(): Promise<Intent | null> {
    return ((await this.db.get("kv", "intent")) as Intent | undefined) ?? null;
  }
  async arm(i: Intent): Promise<void> {
    await this.db.put("kv", i, "intent");
  }

  async report(blockId: string): Promise<StoredReport | undefined> {
    return this.db.get("reports", blockId);
  }
  async reports(limit = 50): Promise<StoredReport[]> {
    const all = await this.db.getAllFromIndex("reports", "byAt");
    return all.reverse().slice(0, limit);
  }
  async setNarrative(blockId: string, n: Narrative): Promise<void> {
    const tx = this.db.transaction("reports", "readwrite");
    const r = await tx.store.get(blockId);
    if (r) await tx.store.put({ ...r, narrative: n });
    await tx.done;
  }

  async processed(): Promise<ProcessedEvent[]> {
    return this.db.getAllFromIndex("processed", "byAt");
  }
  async isProcessed(eventId: string): Promise<boolean> {
    return (await this.db.getKey("processed", eventId)) !== undefined;
  }

  /**
   * Applique un événement dans UNE transaction : contrôle d'idempotence, état, rapport,
   * journal des événements traités et consommation de l'intention. Tout ou rien.
   */
  async handle(e: Readonly<PublicEvent>, ctx: ApplyContext): Promise<HandleOutcome> {
    const tx = this.db.transaction(["game", "processed", "reports", "kv"], "readwrite");
    const done = tx.done;
    try {
      if ((await tx.objectStore("processed").getKey(e.eventId)) !== undefined) {
        await done;
        return { fresh: false };
      }
      const record = await tx.objectStore("game").get(CURRENT);
      if (!record) throw new Error("Aucune partie");
      const intent = ((await tx.objectStore("kv").get("intent")) as Intent | undefined) ?? null;
      const r = applyEvent(record, e, intent, ctx);
      const processed: ProcessedEvent = {
        eventId: e.eventId,
        at: e.at,
        type: e.type,
        blockId: e.blockId,
        status: r.status,
        ...(r.reason ? { reason: r.reason } : {}),
      };
      if (r.record !== record) await tx.objectStore("game").put(r.record, CURRENT);
      if (r.report) await tx.objectStore("reports").put(r.report);
      if (r.intentConsumed) await tx.objectStore("kv").delete("intent");
      await tx.objectStore("processed").put(processed);
      await done;
      return { fresh: true, processed, ...(r.report ? { report: r.report } : {}) };
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* déjà close */
      }
      await done.catch(() => undefined);
      throw err;
    }
  }

  /** Action de gestion atomique sur l'état (équiper, recruter…). */
  async update(fn: (r: GameRecord) => GameRecord | null): Promise<GameRecord | null> {
    const tx = this.db.transaction("game", "readwrite");
    const cur = await tx.store.get(CURRENT);
    const next = cur ? fn(structuredClone(cur)) : null;
    if (next) await tx.store.put(next, CURRENT);
    await tx.done;
    return next;
  }

  /* ---------- clé d'API (jamais exportée) */
  async apiKey(): Promise<string | undefined> {
    return this.db.get("secrets", "anthropic");
  }
  async setApiKey(key: string | null): Promise<void> {
    if (key) await this.db.put("secrets", key, "anthropic");
    else await this.db.delete("secrets", "anthropic");
  }

  /* ---------- sauvegarde */
  async exportAll(): Promise<GameBackup> {
    const [record, processed, reports, settings] = await Promise.all([
      this.record(),
      this.db.getAll("processed"),
      this.db.getAll("reports"),
      this.settings(),
    ]);
    return { format: "basse-lowend-backup", version: 1, record: record ?? null, processed, reports, settings };
  }

  async importAll(b: GameBackup): Promise<void> {
    if (b?.format !== "basse-lowend-backup") throw new Error("Données de jeu illisibles dans cette sauvegarde.");
    const tx = this.db.transaction(["game", "processed", "reports", "kv"], "readwrite");
    await Promise.all([tx.objectStore("game").clear(), tx.objectStore("processed").clear(), tx.objectStore("reports").clear(), tx.objectStore("kv").clear()]);
    if (b.record) await tx.objectStore("game").put(b.record, CURRENT);
    for (const p of b.processed ?? []) await tx.objectStore("processed").put(p);
    for (const r of b.reports ?? []) await tx.objectStore("reports").put(r);
    if (b.settings) await tx.objectStore("kv").put(b.settings, "settings");
    await tx.done;
  }
}

export interface GameBackup {
  format: "basse-lowend-backup";
  version: 1;
  record: GameRecord | null;
  processed: ProcessedEvent[];
  reports: StoredReport[];
  settings: GameSettings;
}
