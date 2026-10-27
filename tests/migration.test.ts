import "fake-indexeddb/auto";
import { openDB } from "idb";
import { seededRng } from "../src/core/rng";
import { generateSession } from "../src/core/session";
import type { Melody, Standard } from "../src/core/library";
import { Repo, type BackupFile } from "../src/storage/repo";

let n = 0;
const name = () => `migr-${++n}`;

const S1: Standard = { id: "s1", title: "Autumn Leaves", key: { tonic: "Sol", minor: true }, beatsPerBar: 4, grid: [["Cm7"], ["F7"], ["Bbmaj7"], ["Ebmaj7"]], createdAt: 1 };
const S2: Standard = { id: "s2", title: "Solar", key: { tonic: "Do", minor: true }, beatsPerBar: 4, grid: [["Cm7"], ["%"]], createdAt: 2 };
const M1: Melody = { id: "m1", title: "autumn leaves", beatsPerBar: 4, scoreBlobId: "b1", createdAt: 3, passages: [{ id: "p1", label: "A", fromBar: 1, toBar: 8, targetBpm: 140, tier: "fiable" }] };
const M2: Melody = { id: "m2", title: "Donna Lee", key: { tonic: "La♭", minor: false }, beatsPerBar: 4, createdAt: 4, passages: [{ id: "p2", label: "Tête", tier: "decouverte" }] };

/** Crée une base « basse-cyber » telle que l'écrivait la version 1 de l'app, avec des données. */
async function makeV1(dbName: string) {
  const db = await openDB(dbName, 1, {
    upgrade(d) {
      d.createObjectStore("settings");
      d.createObjectStore("meta");
      d.createObjectStore("refTempos", { keyPath: "key" });
      const blocks = d.createObjectStore("blocks", { keyPath: "id" });
      blocks.createIndex("byExercise", "exerciseId");
      blocks.createIndex("byStatus", "status");
      blocks.createIndex("byStart", "startedAt");
      d.createObjectStore("inventory", { keyPath: "id" });
      d.createObjectStore("standards", { keyPath: "id" });
      const bank = d.createObjectStore("unknownBank", { keyPath: "id" });
      bank.createIndex("byStatus", "status");
      d.createObjectStore("melodies", { keyPath: "id" });
      d.createObjectStore("blobs", { keyPath: "id" });
      d.createObjectStore("dictionaries");
      const ev = d.createObjectStore("events", { keyPath: "eventId" });
      ev.createIndex("byAt", "at");
    },
  });
  await db.put("standards", S1);
  await db.put("standards", S2);
  await db.put("melodies", M1);
  await db.put("melodies", M2);
  await db.put("refTempos", { key: "REP-01:m1:p1", bpm: 126, updatedAt: 5 });
  await db.put("refTempos", { key: "REP-01:m2:p2", bpm: 90, updatedAt: 5 });
  await db.put("refTempos", { key: "WLK-03", bpm: 150, updatedAt: 5 });
  await db.put("blobs", { id: "b1", name: "autumn.pdf", mime: "application/pdf", data: new Blob(["%PDF"]) });
  await db.put("blocks", { id: "k1", exerciseId: "WLK-03", tempoKey: "WLK-03", plannedMinutes: 10, startedAt: 100, endedAt: 700, playedSeconds: 600, status: "termine", refBpm: 140, targetBpm: 140, draws: { standardId: "s1", title: "Autumn Leaves" } });
  await db.put("blocks", { id: "k2", exerciseId: "REP-01", tempoKey: "REP-01:m1:p1", plannedMinutes: 10, startedAt: 200, endedAt: 800, playedSeconds: 600, status: "termine", refBpm: 120, targetBpm: 120, draws: { melodyId: "m1", passageId: "p1" } });
  await db.put("unknownBank", { id: "u1", status: "jamais_tire", importedAt: 1, title: "SECRET-BANK", beatsPerBar: 4, grid: [["Dm7"]] });
  await db.put("inventory", { id: "i1", modId: "black-out", rarity: "street", params: {}, usesLeft: 2, obtainedAt: 1 });
  await db.put("settings", { man01: { timeLimitSec: 10 } }, "configOverrides");
  const snapshot = {
    blocks: await db.getAll("blocks"), unknownBank: await db.getAll("unknownBank"), inventory: await db.getAll("inventory"),
    standards: await db.getAll("standards"), melodies: await db.getAll("melodies"), settings: await db.get("settings", "configOverrides"),
  };
  db.close();
  return snapshot;
}

describe("migration de la base vers le répertoire (v1 → v2)", () => {
  it("fusionne standards et mélodies dans le répertoire, sans rien perdre", async () => {
    const dbName = name();
    const before = await makeV1(dbName);
    const repo = await Repo.open(dbName, seededRng(1));

    const pieces = await repo.pieces();
    expect(pieces.map((p) => p.id).sort()).toEqual(["m2", "s1", "s2"]);
    const autumn = pieces.find((p) => p.id === "s1")!;
    expect(autumn).toMatchObject({ title: "Autumn Leaves", key: S1.key, grid: S1.grid, scoreBlobId: "b1", passages: M1.passages, legacyIds: ["m1"], status: "en-cours" });
    expect(pieces.find((p) => p.id === "m2")).toMatchObject({ title: "Donna Lee", key: M2.key, passages: M2.passages });
    expect(pieces.find((p) => p.id === "s2")).toMatchObject({ grid: S2.grid, passages: [] });

    // Tempos : celui de la mélodie fusionnée suit le morceau, les autres ne bougent pas.
    expect(await repo.refBpm("REP-01:s1:p1")).toBe(126);
    expect(await repo.refBpm("REP-01:m1:p1")).toBeUndefined();
    expect(await repo.refBpm("REP-01:m2:p2")).toBe(90);
    expect(await repo.refBpm("WLK-03")).toBe(150);

    // Tout le reste est intact, anciens magasins compris (filet de sécurité).
    const raw = repo.raw;
    expect(await raw.getAll("blocks")).toEqual(before.blocks);
    expect(await raw.getAll("unknownBank")).toEqual(before.unknownBank);
    expect(await raw.getAll("inventory")).toEqual(before.inventory);
    expect(await raw.getAll("standards")).toEqual(before.standards);
    expect(await raw.getAll("melodies")).toEqual(before.melodies);
    expect(await raw.get("settings", "configOverrides")).toEqual(before.settings);
    expect((await repo.blob("b1"))?.name).toBe("autumn.pdf");
    expect(await raw.get("meta", "migrationV2")).toMatchObject({ standards: 2, melodies: 2, pieces: 3, renamedTempos: 1 });
    repo.raw.close();
  });

  it("ne migre qu'une fois : rouvrir la base ne recrée ni ne double rien", async () => {
    const dbName = name();
    await makeV1(dbName);
    const a = await Repo.open(dbName);
    await a.putPiece({ ...(await a.piece("s2"))!, status: "su" });
    a.raw.close();
    const b = await Repo.open(dbName);
    expect((await b.pieces()).length).toBe(3);
    expect((await b.piece("s2"))?.status).toBe("su");
    b.raw.close();
  });

  it("une installation neuve crée directement la base v2, vide", async () => {
    const repo = await Repo.open(name());
    expect(await repo.pieces()).toEqual([]);
    expect(await repo.planning()).toEqual([]);
    expect(await repo.raw.get("meta", "migrationV2")).toBeUndefined();
  });

  it("l'historique reste rattaché aux morceaux après la fusion", async () => {
    const dbName = name();
    await makeV1(dbName);
    const repo = await Repo.open(dbName);
    const input = await repo.generatorInput("2026-10-27", 60);
    expect(input.history.map((h) => h.draws)).toEqual([{ standardId: "s1" }, { melodyId: "m1" }]);
  });
});

describe("sauvegardes", () => {
  it("une sauvegarde v1 se restaure en passant par la même migration", async () => {
    const dbName = name();
    await makeV1(dbName);
    const old = await Repo.open(dbName);
    // Fabrique un fichier v1 : les magasins d'avant le répertoire seulement.
    const v2 = await old.exportAll();
    const v1: BackupFile = { ...v2, version: 1, stores: Object.fromEntries(Object.entries(v2.stores).filter(([k]) => !["pieces", "planning", "sessions"].includes(k))) };
    const fresh = await Repo.open(name());
    await fresh.importAll(JSON.parse(JSON.stringify(v1)));
    expect((await fresh.pieces()).map((p) => p.id).sort()).toEqual(["m2", "s1", "s2"]);
    expect(await fresh.refBpm("REP-01:s1:p1")).toBe(126);
  });

  it("export puis import v2 : répertoire, planning et séances identiques", async () => {
    const a = await Repo.open(name());
    await a.putPiece({ id: "x", title: "Blues", beatsPerBar: 4, grid: [["F7"]], passages: [], status: "su", priority: 1, homework: { due: "2026-10-29" }, createdAt: 1, updatedAt: 1 });
    await a.putDay({ date: "2026-10-27", kind: "travail", goalMinutes: 90, tags: ["Cours 18 h"], lesson: true });
    await a.saveSession({ date: "2026-10-27", goalMinutes: 90, blocks: [{ id: "b", exerciseId: "MAN-01", minutes: 25, reason: { kind: "ouverture" } }], generatedAt: 1 });
    const file = JSON.parse(JSON.stringify(await a.exportAll())) as BackupFile;
    expect(file.version).toBe(2);
    const b = await Repo.open(name());
    await b.importAll(file);
    expect(await b.pieces()).toEqual(await a.pieces());
    expect(await b.planning()).toEqual(await a.planning());
    expect(await b.session("2026-10-27")).toEqual(await a.session("2026-10-27"));
  });

  it("refuse une version de sauvegarde inconnue", async () => {
    const r = await Repo.open(name());
    await expect(r.importAll({ format: "basse-cyber-backup", version: 9 as never, exportedAt: 0, stores: {} })).rejects.toThrow("Version");
  });
});

describe("générateur branché sur la base", () => {
  it("ne reçoit de la banque inconnue que des compteurs : aucun titre ne peut en sortir", async () => {
    const dbName = name();
    await makeV1(dbName);
    const repo = await Repo.open(dbName);
    const input = await repo.generatorInput("2026-10-27", 240);
    expect(input.bank).toEqual({ neverDrawnWithGrid: 1, neverDrawnWithTheme: 0 });
    expect(JSON.stringify(input)).not.toContain("SECRET-BANK");
    expect(JSON.stringify(generateSession(input))).not.toContain("SECRET-BANK");
  });

  it("le bloc lancé depuis la séance garde son lien, l'événement du jeu ne le porte pas", async () => {
    const repo = await Repo.open(name());
    const b = await repo.start({ exerciseId: "MAN-01", tempoKey: "MAN-01", plannedMinutes: 25, refBpm: 60, targetBpm: 60, draws: {}, sessionBlockId: "sb-1" });
    expect(b.sessionBlockId).toBe("sb-1");
    const ev = (await repo.events())[0]!;
    expect(JSON.stringify(ev)).not.toContain("sb-1");
  });
});
