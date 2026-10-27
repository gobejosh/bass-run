import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from "idb";
import type { PublicEvent } from "../core/events";
import type { BlockRecord, LootState, ModInstance } from "../core/types";
import type { Melody, Standard, UnknownStandard, Dictionaries } from "../core/library";
import type { DayEntry } from "../core/planning";
import { migrateLegacyLibrary, type Piece } from "../core/repertoire";
import type { SessionPlan } from "../core/session";

export interface StoredBlob {
  id: string;
  name: string;
  mime: string;
  data: Blob;
}

export interface BasseDB extends DBSchema {
  settings: { key: string; value: unknown };
  meta: { key: string; value: unknown };
  refTempos: { key: string; value: { key: string; bpm: number; updatedAt: number } };
  blocks: { key: string; value: BlockRecord; indexes: { byExercise: string; byStatus: string; byStart: number } };
  inventory: { key: string; value: ModInstance };
  standards: { key: string; value: Standard };
  unknownBank: { key: string; value: UnknownStandard; indexes: { byStatus: string } };
  melodies: { key: string; value: Melody };
  blobs: { key: string; value: StoredBlob };
  dictionaries: { key: string; value: Dictionaries };
  events: { key: string; value: PublicEvent; indexes: { byAt: number } };
  /** v2 : répertoire (remplace standards et mélodies, gelés après migration). */
  pieces: { key: string; value: Piece };
  /** v2 : jours remplis à la main. */
  planning: { key: string; value: DayEntry };
  /** v2 : séance du jour, par date. */
  sessions: { key: string; value: SessionPlan };
}

export const DB_NAME = "basse-cyber";
export const DB_VERSION = 2;

/** Option de la migration v1 → v2 (validée : une mélodie rejoint le standard de même titre). */
export const MIGRATION_MERGE_SAME_TITLE = true;

export type DB = IDBPDatabase<BasseDB>;

export function openBasseDB(name = DB_NAME): Promise<DB> {
  return openDB<BasseDB>(name, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore("settings");
        db.createObjectStore("meta");
        db.createObjectStore("refTempos", { keyPath: "key" });
        const blocks = db.createObjectStore("blocks", { keyPath: "id" });
        blocks.createIndex("byExercise", "exerciseId");
        blocks.createIndex("byStatus", "status");
        blocks.createIndex("byStart", "startedAt");
        db.createObjectStore("inventory", { keyPath: "id" });
        db.createObjectStore("standards", { keyPath: "id" });
        const bank = db.createObjectStore("unknownBank", { keyPath: "id" });
        bank.createIndex("byStatus", "status");
        db.createObjectStore("melodies", { keyPath: "id" });
        db.createObjectStore("blobs", { keyPath: "id" });
        db.createObjectStore("dictionaries");
        const ev = db.createObjectStore("events", { keyPath: "eventId" });
        ev.createIndex("byAt", "at");
      }
      if (oldVersion < 2) {
        db.createObjectStore("pieces", { keyPath: "id" });
        db.createObjectStore("planning", { keyPath: "date" });
        db.createObjectStore("sessions", { keyPath: "date" });
        // Migration dans la transaction de mise à niveau : tout ou rien.
        if (oldVersion >= 1) {
          migrateV1toV2(tx).catch((err) => {
            console.error("[migration v2]", err);
            tx.abort(); // rien n'est écrit : la base reste en v1, intacte
          });
        }
      }
    },
  });
}

type UpgradeTx = IDBPTransaction<BasseDB, StoreNames<BasseDB>[], "versionchange">;

/**
 * Standards en cours d'étude + mélodies imposées → répertoire. Les anciens magasins sont gardés tels quels
 * (filet de sécurité, plus lus) ; les tempos de référence REP-01 d'une mélodie fusionnée sont renommés.
 */
async function migrateV1toV2(tx: UpgradeTx): Promise<void> {
  const standards = await tx.objectStore("standards").getAll();
  const melodies = await tx.objectStore("melodies").getAll();
  const { pieces, tempoKeyRenames } = migrateLegacyLibrary(standards, melodies, { mergeSameTitle: MIGRATION_MERGE_SAME_TITLE });
  for (const p of pieces) await tx.objectStore("pieces").put(p);
  const tempos = tx.objectStore("refTempos");
  for (const [from, to] of tempoKeyRenames) {
    const row = await tempos.get(from);
    if (!row) continue;
    await tempos.put({ ...row, key: to });
    await tempos.delete(from);
  }
  await tx.objectStore("meta").put({ at: Date.now(), standards: standards.length, melodies: melodies.length, pieces: pieces.length, renamedTempos: tempoKeyRenames.length }, "migrationV2");
}

export const LOOT_STATE_KEY = "lootState";
export const CONFIG_KEY = "configOverrides";
export const DEFAULT_LOOT_STATE: LootState = { dropsSinceHigh: 0 };
