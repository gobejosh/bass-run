import "fake-indexeddb/auto";
import { onPublicEvent, type PublicEvent } from "../src/core/events";
import { seededRng } from "../src/core/rng";
import type { ModInstance } from "../src/core/types";
import { Repo } from "../src/storage/repo";

let n = 0;
const freshRepo = () => Repo.open(`test-${++n}`, seededRng(n));

const mod: ModInstance = { id: "m1", modId: "black-out", rarity: "street", params: {}, usesLeft: 3, obtainedAt: 1 };
const base = { exerciseId: "MAN-01" as const, tempoKey: "MAN-01", plannedMinutes: 5, refBpm: 60, targetBpm: 48, draws: {} };

describe("persistance d'un bloc", () => {
  it("terminé : enregistre débrief, tempo de réf., consomme le mod, ajoute le loot, journalise", async () => {
    const repo = await freshRepo();
    await repo.raw.put("inventory", mod);
    const got: PublicEvent[] = [];
    const off = onPublicEvent((e) => got.push(e as PublicEvent));

    const b = await repo.start({ ...base, mod });
    expect(await repo.openBlock()).toMatchObject({ id: b.id });
    await expect(repo.start(base)).rejects.toThrow("déjà en cours");

    const r = await repo.finish(b.id, { note: 4, cleanBpm: 72, measures: {} }, 300);
    off();
    const inv = await repo.inventory();
    expect(inv.find((i) => i.id === "m1")?.usesLeft).toBe(2);
    expect(inv.find((i) => i.id === r.loot.id)).toBeDefined();
    expect(await repo.refBpm("MAN-01")).toBe(72);
    expect((await repo.lootState()).dropsSinceHigh).toBe(r.lootState.dropsSinceHigh);
    expect(await repo.openBlock()).toBeUndefined();
    expect((await repo.events()).map((e) => e.type)).toEqual(["bloc_lance", "bloc_termine"]);
    expect(got.map((e) => e.type)).toEqual(["bloc_lance", "bloc_termine"]);
  });

  it("abandonné : ni loot, ni consommation, ni tempo de réf.", async () => {
    const repo = await freshRepo();
    await repo.raw.put("inventory", { ...mod, usesLeft: 1 });
    const b = await repo.start({ ...base, mod: { ...mod, usesLeft: 1 } });
    await repo.abandon(b.id, 30);
    expect(await repo.inventory()).toEqual([{ ...mod, usesLeft: 1 }]);
    expect(await repo.refBpm("MAN-01")).toBeUndefined();
    expect((await repo.blocks())[0]!.status).toBe("abandonne");
  });

  it("la 3e utilisation fait disparaître le mod", async () => {
    const repo = await freshRepo();
    await repo.raw.put("inventory", { ...mod, usesLeft: 1 });
    const b = await repo.start({ ...base, mod: { ...mod, usesLeft: 1 } });
    await repo.finish(b.id, { note: 3, measures: {} }, 300);
    expect((await repo.inventory()).some((i) => i.id === "m1")).toBe(false);
  });

  it("un bloc moddé plus lent ne fait pas baisser le tempo de référence", async () => {
    const repo = await freshRepo();
    await repo.setRefBpm("MAN-01", 60);
    await repo.raw.put("inventory", mod);
    const b = await repo.start({ ...base, mod });
    await repo.finish(b.id, { note: 5, cleanBpm: 48, measures: {} }, 300);
    expect(await repo.refBpm("MAN-01")).toBe(60);
  });

  it("refuse d'équiper un mod absent de l'inventaire", async () => {
    const repo = await freshRepo();
    await expect(repo.start({ ...base, mod })).rejects.toThrow("plus dans l'inventaire");
  });
});

describe("sauvegarde", () => {
  it("export puis import restituent toutes les données, fichiers compris", async () => {
    const a = await freshRepo();
    await a.raw.put("inventory", mod);
    await a.setRefBpm("WLK-01", 132);
    await a.putBlob("p.png", "image/png", new Blob([new Uint8Array([1, 2, 3, 250])], { type: "image/png" }));
    await a.importBank([{ title: "secret", beatsPerBar: 4, grid: [["C7"]] }], new Map());
    const b0 = await a.start(base);
    await a.finish(b0.id, { note: 5, cleanBpm: 70, measures: {} }, 60);
    const dump = JSON.parse(JSON.stringify(await a.exportAll()));

    const b = await freshRepo();
    await b.importAll(dump);
    expect(await b.inventory()).toEqual(await a.inventory());
    expect(await b.refBpm("WLK-01")).toBe(132);
    expect(await b.bankCounts()).toEqual(await a.bankCounts());
    expect((await b.blocks()).length).toBe(1);
    const blobs = await b.raw.getAll("blobs");
    expect(new Uint8Array(await blobs[0]!.data.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250]));
  });

  it("refuse un fichier qui n'est pas une sauvegarde", async () => {
    const a = await freshRepo();
    await expect(a.importAll({} as never)).rejects.toThrow("pas une sauvegarde");
  });
});
