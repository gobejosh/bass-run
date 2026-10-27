/**
 * Accès aux données. Chaque opération de fin de bloc est atomique :
 * bloc, inventaire, compteur de pitié, tempo de référence et journal d'événements
 * sont écrits dans une seule transaction, puis l'événement est diffusé.
 */
import { abandonBlock, finishBlock, isMan03Advanced, startBlock, type StartInput } from "../core/block";
import { resolveConfig, type AppConfig } from "../core/config";
import { emitPublicEvent, type PublicEvent } from "../core/events";
import { cryptoRng, type Rng } from "../core/rng";
import type { BlockRecord, Debrief, LootState, ModInstance } from "../core/types";
import { DEFAULT_DICTIONARIES, type Dictionaries } from "../core/theory/dictionaries";
import type { Tier, UnknownStandard } from "../core/library";
import type { ParsedStandard } from "../core/libraryIO";
import { type DayEntry } from "../core/planning";
import { migrateLegacyLibrary, type BlockTrace, type Piece } from "../core/repertoire";
import type { GeneratorInput, SessionPlan } from "../core/session";
import { newId } from "../core/mods/drop";
import { withPassageTier } from "../core/rep";
import { CONFIG_KEY, DEFAULT_LOOT_STATE, LOOT_STATE_KEY, MIGRATION_MERGE_SAME_TITLE, openBasseDB, type DB, type StoredBlob } from "./db";

export class Repo {
  constructor(private readonly db: DB, private readonly rng: Rng = cryptoRng) {}

  static async open(name?: string, rng?: Rng): Promise<Repo> {
    return new Repo(await openBasseDB(name), rng);
  }

  get raw(): DB {
    return this.db;
  }

  /* ---------- configuration */

  async configOverrides(): Promise<unknown> {
    return (await this.db.get("settings", CONFIG_KEY)) ?? {};
  }
  async config(): Promise<AppConfig> {
    return resolveConfig(await this.configOverrides());
  }
  async setConfigOverrides(o: unknown): Promise<void> {
    await this.db.put("settings", o, CONFIG_KEY);
  }

  async dictionaries(): Promise<Dictionaries> {
    return (await this.db.get("dictionaries", "main")) ?? DEFAULT_DICTIONARIES;
  }
  async setDictionaries(d: Dictionaries): Promise<void> {
    await this.db.put("dictionaries", d, "main");
  }

  /* ---------- tempos de référence */

  async refBpm(key: string): Promise<number | undefined> {
    return (await this.db.get("refTempos", key))?.bpm;
  }
  async allRefTempos() {
    return this.db.getAll("refTempos");
  }
  async setRefBpm(key: string, bpm: number): Promise<void> {
    await this.db.put("refTempos", { key, bpm, updatedAt: Date.now() });
  }

  /* ---------- inventaire */

  async inventory(): Promise<ModInstance[]> {
    const all = await this.db.getAll("inventory");
    return all.sort((a, b) => b.obtainedAt - a.obtainedAt);
  }
  async lootState(): Promise<LootState> {
    return ((await this.db.get("meta", LOOT_STATE_KEY)) as LootState | undefined) ?? DEFAULT_LOOT_STATE;
  }

  /* ---------- blocs */

  async blocks(): Promise<BlockRecord[]> {
    const all = await this.db.getAllFromIndex("blocks", "byStart");
    return all.reverse();
  }
  async openBlock(): Promise<BlockRecord | undefined> {
    return (await this.db.getAllFromIndex("blocks", "byStatus", "en_cours"))[0];
  }
  async man03Advanced(): Promise<boolean> {
    const [blocks, cfg] = await Promise.all([this.db.getAllFromIndex("blocks", "byExercise", "MAN-03"), this.config()]);
    return isMan03Advanced(blocks, cfg);
  }

  async start(input: StartInput): Promise<BlockRecord> {
    if (await this.openBlock()) throw new Error("Un bloc est déjà en cours.");
    if (input.mod) {
      const fresh = await this.db.get("inventory", input.mod.id);
      if (!fresh || fresh.usesLeft <= 0) throw new Error("Ce mod n'est plus dans l'inventaire.");
    }
    const { block, event } = startBlock(input);
    const tx = this.db.transaction(["blocks", "events"], "readwrite");
    await Promise.all([tx.objectStore("blocks").add(block), tx.objectStore("events").add(event), tx.done]);
    emitPublicEvent(event);
    return block;
  }

  async finish(blockId: string, debrief: Debrief, playedSeconds: number) {
    const cfg = await this.config();
    const tx = this.db.transaction(["blocks", "inventory", "meta", "refTempos", "events"], "readwrite");
    const blocks = tx.objectStore("blocks");
    const inv = tx.objectStore("inventory");
    const block = await blocks.get(blockId);
    if (!block) throw new Error(`Bloc introuvable : ${blockId}`);
    const inventory = await inv.getAll();
    const lootState = ((await tx.objectStore("meta").get(LOOT_STATE_KEY)) as LootState | undefined) ?? DEFAULT_LOOT_STATE;
    const currentRefBpm = (await tx.objectStore("refTempos").get(block.tempoKey))?.bpm;

    const r = finishBlock(block, debrief, playedSeconds, { inventory, lootState, currentRefBpm, rng: this.rng, cfg });

    const keep = new Set(r.inventory.map((i) => i.id));
    for (const i of inventory) if (!keep.has(i.id)) await inv.delete(i.id);
    for (const i of r.inventory) await inv.put(i);
    await blocks.put(r.block);
    await tx.objectStore("meta").put(r.lootState, LOOT_STATE_KEY);
    if (r.newRefBpm !== undefined) {
      await tx.objectStore("refTempos").put({ key: block.tempoKey, bpm: r.newRefBpm, updatedAt: Date.now() });
    }
    await tx.objectStore("events").add(r.event);
    await tx.done;
    emitPublicEvent(r.event);
    return r;
  }

  async abandon(blockId: string, playedSeconds: number): Promise<BlockRecord> {
    const tx = this.db.transaction(["blocks", "events"], "readwrite");
    const block = await tx.objectStore("blocks").get(blockId);
    if (!block) throw new Error(`Bloc introuvable : ${blockId}`);
    const r = abandonBlock(block, playedSeconds);
    await tx.objectStore("blocks").put(r.block);
    await tx.objectStore("events").add(r.event);
    await tx.done;
    emitPublicEvent(r.event);
    return r.block;
  }

  /* ---------- répertoire */

  async pieces(): Promise<Piece[]> {
    return (await this.db.getAll("pieces")).sort((a, b) => a.title.localeCompare(b.title, "fr"));
  }
  async piece(id: string): Promise<Piece | undefined> {
    return this.db.get("pieces", id);
  }
  async putPiece(p: Piece): Promise<void> {
    await this.db.put("pieces", { ...p, updatedAt: Date.now() });
  }
  /** Supprime le morceau et sa partition. L'historique des blocs garde le titre noté au lancement. */
  async deletePiece(id: string): Promise<void> {
    const tx = this.db.transaction(["pieces", "blobs"], "readwrite");
    const p = await tx.objectStore("pieces").get(id);
    if (p?.scoreBlobId) await tx.objectStore("blobs").delete(p.scoreBlobId);
    await tx.objectStore("pieces").delete(id);
    await tx.done;
  }
  /** Import par fichier (format docs/IMPORT.md) : un morceau « à apprendre » par entrée. */
  async importPieces(entries: readonly ParsedStandard[], status: Piece["status"] = "a-apprendre"): Promise<number> {
    const tx = this.db.transaction("pieces", "readwrite");
    const now = Date.now();
    for (const e of entries) {
      await tx.store.put({
        id: newId(), title: e.title, beatsPerBar: e.beatsPerBar, passages: [], status, priority: 0, homework: null,
        ...(e.key ? { key: e.key } : {}), ...(e.grid ? { grid: e.grid } : {}), ...(e.composer ? { composer: e.composer } : {}), ...(e.form ? { form: e.form } : {}),
        createdAt: now, updatedAt: now,
      });
    }
    await tx.done;
    return entries.length;
  }

  /* ---------- banque de standards inconnus (anti-spoil) */

  /** Compteurs seulement : le contenu des standards jamais tirés ne sort jamais d'ici. */
  async bankCounts(): Promise<{ neverDrawn: number; drawn: number; neverWithGrid: number; neverWithTheme: number }> {
    const never = await this.db.getAllFromIndex("unknownBank", "byStatus", "jamais_tire");
    return {
      neverDrawn: never.length,
      drawn: await this.db.countFromIndex("unknownBank", "byStatus", "tire"),
      neverWithGrid: never.filter((s) => s.grid?.length).length,
      neverWithTheme: never.filter((s) => s.themeBlobId).length,
    };
  }

  /** Standards déjà tirés : les seuls consultables. */
  async drawnBank(): Promise<UnknownStandard[]> {
    const drawn = await this.db.getAllFromIndex("unknownBank", "byStatus", "tire");
    return drawn.sort((a, b) => (b.drawnAt ?? 0) - (a.drawnAt ?? 0));
  }

  async importBank(entries: ParsedStandard[], themes: Map<number, { name: string; mime: string; data: Blob }>): Promise<{ added: number; themes: number }> {
    const tx = this.db.transaction(["unknownBank", "blobs"], "readwrite");
    let nThemes = 0;
    for (const [i, e] of entries.entries()) {
      const theme = themes.get(i);
      let themeBlobId: string | undefined;
      if (theme) {
        themeBlobId = newId();
        await tx.objectStore("blobs").put({ id: themeBlobId, ...theme });
        nThemes++;
      }
      await tx.objectStore("unknownBank").put({
        id: newId(),
        status: "jamais_tire",
        importedAt: Date.now(),
        title: e.title,
        beatsPerBar: e.beatsPerBar,
        ...(e.key ? { key: e.key } : {}),
        ...(e.grid ? { grid: e.grid } : {}),
        ...(themeBlobId ? { themeBlobId } : {}),
      });
    }
    await tx.done;
    return { added: entries.length, themes: nThemes };
  }

  /**
   * Tire un standard jamais tiré (avec grille pour DEC-01, avec thème pour DEC-02)
   * et le marque « tiré » dans la même transaction : il est grillé dès qu'il s'affiche.
   */
  async drawUnknown(need: "grid" | "theme"): Promise<UnknownStandard> {
    const tx = this.db.transaction("unknownBank", "readwrite");
    const never = await tx.store.index("byStatus").getAll("jamais_tire");
    const pool = never.filter((s) => (need === "grid" ? s.grid?.length : s.themeBlobId));
    if (pool.length === 0) {
      await tx.done;
      throw new Error(need === "grid" ? "Plus aucun standard inconnu avec grille dans la banque." : "Plus aucun standard inconnu avec thème dans la banque.");
    }
    const picked = { ...pool[this.rng.int(pool.length)]!, status: "tire" as const, drawnAt: Date.now() };
    await tx.store.put(picked);
    await tx.done;
    return picked;
  }

  /** Vide les standards jamais tirés (sans les montrer). Les déjà tirés sont conservés. */
  async clearNeverDrawn(): Promise<number> {
    const tx = this.db.transaction(["unknownBank", "blobs"], "readwrite");
    const never = await tx.objectStore("unknownBank").index("byStatus").getAll("jamais_tire");
    for (const s of never) {
      await tx.objectStore("unknownBank").delete(s.id);
      if (s.themeBlobId) await tx.objectStore("blobs").delete(s.themeBlobId);
    }
    await tx.done;
    return never.length;
  }

  /** Palier d'un passage (REP-01), noté au débrief. */
  async setPassageTier(pieceId: string, passageId: string, tier: Tier): Promise<void> {
    const p = await this.db.get("pieces", pieceId);
    if (p) await this.db.put("pieces", withPassageTier(p, passageId, tier));
  }

  /* ---------- planning et séances */

  async planning(): Promise<DayEntry[]> {
    return this.db.getAll("planning");
  }
  async putDay(e: DayEntry): Promise<void> {
    await this.db.put("planning", e);
  }
  async clearDay(date: string): Promise<void> {
    await this.db.delete("planning", date);
  }
  async putDays(entries: readonly DayEntry[]): Promise<void> {
    const tx = this.db.transaction("planning", "readwrite");
    for (const e of entries) await tx.store.put(e);
    await tx.done;
  }
  async session(date: string): Promise<SessionPlan | undefined> {
    return this.db.get("sessions", date);
  }
  async saveSession(plan: SessionPlan): Promise<void> {
    await this.db.put("sessions", plan);
  }
  async sessions(from: string, to: string): Promise<SessionPlan[]> {
    return this.db.getAll("sessions", IDBKeyRange.bound(from, to));
  }

  /**
   * Entrée du générateur de séance : morceaux, historique des blocs, et deux COMPTEURS de la banque inconnue.
   * Rien d'autre : ni le jeu (autre base, jamais ouverte ici), ni le contenu de la banque.
   */
  async generatorInput(date: string, goalMinutes: number, variant = 0): Promise<GeneratorInput> {
    const [pieces, blocks, counts, cfg] = await Promise.all([this.pieces(), this.db.getAll("blocks"), this.bankCounts(), this.config()]);
    const history: BlockTrace[] = blocks.map((b) => ({
      exerciseId: b.exerciseId, startedAt: b.startedAt, status: b.status,
      ...(b.playedSeconds !== undefined ? { playedSeconds: b.playedSeconds } : {}),
      draws: pickPieceDraws(b.draws),
    }));
    return {
      date, goalMinutes, pieces, history, settings: cfg.session, variant,
      bank: { neverDrawnWithGrid: counts.neverWithGrid, neverDrawnWithTheme: counts.neverWithTheme },
    };
  }

  /* ---------- fichiers */

  async putBlob(name: string, mime: string, data: Blob): Promise<string> {
    const id = newId();
    await this.db.put("blobs", { id, name, mime, data });
    return id;
  }
  async blob(id: string): Promise<StoredBlob | undefined> {
    return this.db.get("blobs", id);
  }
  async deleteBlob(id: string): Promise<void> {
    await this.db.delete("blobs", id);
  }

  /* ---------- sauvegarde */

  /** Export complet (fichiers inclus, en base64). Contient la banque inconnue : ne pas l'ouvrir. */
  async exportAll(): Promise<BackupFile> {
    const stores: Record<string, unknown[]> = {};
    for (const name of BACKUP_STORES) {
      const keys = await this.db.getAllKeys(name);
      const values = await this.db.getAll(name);
      stores[name] = values.map((v, i) => ({ k: keys[i], v }));
    }
    stores.blobs = await Promise.all(
      (await this.db.getAll("blobs")).map(async (b) => ({ k: b.id, v: { ...b, data: await blobToBase64(b.data) } })),
    );
    return { format: "basse-cyber-backup", version: 2, exportedAt: Date.now(), stores };
  }

  /** Remplace toutes les données par celles d'une sauvegarde. */
  async importAll(file: BackupFile): Promise<void> {
    if (file?.format !== "basse-cyber-backup") throw new Error("Ce fichier n'est pas une sauvegarde Basse Run.");
    if (file.version !== 1 && file.version !== 2) throw new Error("Version de sauvegarde inconnue : mets l'app à jour.");
    const names = [...BACKUP_STORES, "blobs"] as const;
    const tx = this.db.transaction(names, "readwrite");
    for (const name of names) {
      const store = tx.objectStore(name);
      await store.clear();
      for (const row of (file.stores[name] ?? []) as { k: IDBValidKey; v: unknown }[]) {
        let v = row.v as Record<string, unknown>;
        if (name === "blobs") v = { ...v, data: base64ToBlob(v.data as string, v.mime as string) };
        // Les magasins à clé intégrée refusent une clé explicite.
        if (store.keyPath) await store.put(v as never);
        else await store.put(v as never, row.k as never);
      }
    }
    // Sauvegarde d'avant le répertoire : même migration qu'à la mise à jour de la base.
    if (file.version === 1) {
      const standards = await tx.objectStore("standards").getAll();
      const melodies = await tx.objectStore("melodies").getAll();
      const { pieces, tempoKeyRenames } = migrateLegacyLibrary(standards, melodies, { mergeSameTitle: MIGRATION_MERGE_SAME_TITLE });
      for (const p of pieces) await tx.objectStore("pieces").put(p);
      for (const [from, to] of tempoKeyRenames) {
        const row = await tx.objectStore("refTempos").get(from);
        if (!row) continue;
        await tx.objectStore("refTempos").put({ ...row, key: to });
        await tx.objectStore("refTempos").delete(from);
      }
    }
    await tx.done;
  }

  /** Journal des événements publics (pour rejeu par le jeu). */
  async events(sinceAt = 0): Promise<PublicEvent[]> {
    return this.db.getAllFromIndex("events", "byAt", IDBKeyRange.lowerBound(sinceAt));
  }
}

const BACKUP_STORES = ["settings", "meta", "refTempos", "blocks", "inventory", "standards", "unknownBank", "melodies", "dictionaries", "events", "pieces", "planning", "sessions"] as const;

/** Seuls les champs qui désignent un morceau sont transmis au générateur. */
function pickPieceDraws(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["pieceId", "standardId", "melodyId"]) if (typeof d[k] === "string") out[k] = d[k];
  return out;
}

export interface BackupFile {
  format: "basse-cyber-backup";
  /** 1 : avant le répertoire ; 2 : répertoire, planning, séances. */
  version: 1 | 2;
  exportedAt: number;
  stores: Record<string, unknown[]>;
  /** Données du jeu parallèle (base séparée), ajoutées par l'écran Réglages ; ignorées ici. */
  game?: unknown;
}

async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
