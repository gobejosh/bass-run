import "fake-indexeddb/auto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { emitPublicEvent, type PublicEvent } from "../../src/core/events";
import { seededRng } from "../../src/core/rng";
import type { ModInstance } from "../../src/core/types";
import { Repo } from "../../src/storage/repo";
import { eventFeed } from "../../src/integration/gameFeed";
import { GameRuntime } from "../../src/game/runtime";
import { GameStore } from "../../src/game/store";
import { localDate } from "../../src/game/model";
import { openContracts } from "../../src/game/apply";

let n = 0;
const running: GameRuntime[] = [];
const track = (rt: GameRuntime) => (running.push(rt), rt);
afterEach(() => {
  // Le bus d'événements est global : chaque test arrête ses runtimes.
  for (const rt of running.splice(0)) rt.stop();
  vi.restoreAllMocks();
});

async function setup() {
  n++;
  const repo = await Repo.open(`music-${n}`, seededRng(n));
  const store = await GameStore.open(`game-${n}`);
  const rt = track(new GameRuntime(store, eventFeed(repo)));
  return { repo, store, rt };
}

const base = { exerciseId: "WLK-01" as const, tempoKey: "WLK-01", plannedMinutes: 10, refBpm: 120, targetBpm: 120, draws: {} };
const mod = (rarity: ModInstance["rarity"], id = `m-${rarity}`): ModInstance => ({ id, modId: "silence-radio", rarity, params: {}, usesLeft: 3, obtainedAt: 1 });

/** Contenu complet de la base musicale, pour vérifier que le jeu n'y écrit rien. */
async function snapshot(repo: Repo) {
  const out: Record<string, unknown> = {};
  for (const name of repo.raw.objectStoreNames) {
    out[name] = { keys: await repo.raw.getAllKeys(name as never), values: await repo.raw.getAll(name as never) };
  }
  return JSON.stringify(out);
}

describe("pont à sens unique", () => {
  const SRC = resolve(__dirname, "../../src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  const imports = (file: string) =>
    [...readFileSync(file, "utf8").matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)].map((m) => m[1] ?? m[2]!);

  it("le jeu n'importe de la partie musicale que les types et l'abonnement aux événements", () => {
    for (const f of files(join(SRC, "game"))) {
      for (const spec of imports(f)) {
        if (!spec.startsWith(".")) {
          expect(["react", "idb"], `${relative(SRC, f)} → ${spec}`).toContain(spec);
          continue;
        }
        const target = relative(SRC, resolve(join(f, ".."), spec)).replace(/\\/g, "/");
        const ok = target.startsWith("game/") || target === "core/events";
        expect(ok, `${relative(SRC, f)} importe ${target}`).toBe(true);
      }
    }
  });

  it("la logique musicale (core, storage, audio) ignore le jeu", () => {
    for (const dir of ["core", "storage", "audio"]) {
      for (const f of files(join(SRC, dir))) {
        for (const spec of imports(f)) expect(spec, relative(SRC, f)).not.toMatch(/game|integration/);
      }
    }
  });

  it("le flux remis au jeu est en lecture seule et ses événements sont gelés", async () => {
    const { repo } = await setup();
    const b = await repo.start(base);
    await repo.abandon(b.id, 10);
    const feed = eventFeed(repo);
    expect(Object.keys(feed).sort()).toEqual(["since", "subscribe"]);
    expect(Object.isFrozen(feed)).toBe(true);
    const evs = await feed.since(0);
    expect(evs).toHaveLength(2);
    expect(Object.isFrozen(evs[0])).toBe(true);
    expect(() => {
      (evs[0] as { blockId: string }).blockId = "x";
    }).toThrow();
    expect((await repo.events())[0]!.blockId).toBe(b.id);
  });

  it("le jeu traite les blocs sans rien écrire dans la base musicale, et n'ouvre que sa propre base", async () => {
    const { repo, rt } = await setup();
    await rt.init(() => "seed");
    rt.stop(); // les blocs se jouent pendant que le jeu ne tourne pas
    await repo.raw.put("inventory", mod("corpo"));
    const b1 = await repo.start({ ...base, mod: mod("corpo") });
    await repo.finish(b1.id, { note: 4, cleanBpm: 124, measures: {} }, 600);
    const b2 = await repo.start(base);
    await repo.abandon(b2.id, 30);
    const before = await snapshot(repo);

    const opened: string[] = [];
    const orig = indexedDB.open.bind(indexedDB);
    const spy = vi.spyOn(indexedDB, "open").mockImplementation((name: string, v?: number) => {
      opened.push(name);
      return orig(name, v);
    });
    const rt2 = track(new GameRuntime(await GameStore.open(`game-${n}`), eventFeed(repo)));
    await rt2.init();
    await rt2.bridge.idle();
    spy.mockRestore();

    expect(rt2.record!.state.counters.blocksCompleted).toBe(1);
    expect(await snapshot(repo)).toBe(before);
    expect(opened.every((name) => name.startsWith("game-"))).toBe(true);
  });
});

describe("consommation des événements", () => {
  it("idempotence : un événement reçu deux fois (direct puis rejeu, ou rediffusé) n'est appliqué qu'une fois", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    const b = await repo.start(base);
    const r = await repo.finish(b.id, { note: 3, measures: {} }, 600);
    await rt.bridge.idle();
    emitPublicEvent(r.event); // rediffusion du même événement
    await rt.bridge.resync(); // et rejeu du journal
    await rt.bridge.idle();
    expect(rt.record!.state.counters.blocksCompleted).toBe(1);
    expect(rt.record!.state.log).toHaveLength(1);
    const processed = await rt.store.processed();
    expect(processed.map((p) => p.type)).toEqual(["bloc_lance", "bloc_termine"]);
  });

  it("rejeu : à horodatage égal, le lancement d'un bloc est traité avant sa fin", async () => {
    const { repo } = await setup();
    const first = track(new GameRuntime(await GameStore.open(`game-${n}`), eventFeed(repo)));
    await first.init();
    first.stop();
    const b = await repo.start(base);
    await repo.finish(b.id, { note: 4, measures: {} }, 600);
    const [lance, fin] = (await repo.events()).map((e) => structuredClone(e)) as PublicEvent[];
    const tied = [{ ...fin!, at: lance!.at }, lance!]; // même milliseconde, fin listée en premier
    const feed = { since: async () => tied, subscribe: () => () => undefined };
    const later = track(new GameRuntime(await GameStore.open(`game-${n}`), feed));
    await later.init();
    expect((await later.report(b.id))?.report.contract).not.toBeNull();
  });

  it("rejeu : les événements manqués (onglet fermé) sont traités au démarrage, dans l'ordre", async () => {
    const { repo, store } = await setup();
    const rt = track(new GameRuntime(store, eventFeed(repo)));
    await rt.init();
    rt.stop();
    const b = await repo.start(base);
    expect(rt.record!.state.activeMission).toBeNull();
    await repo.finish(b.id, { note: 5, measures: {} }, 600);

    const later = track(new GameRuntime(await GameStore.open(`game-${n}`), eventFeed(repo)));
    await later.init();
    const rep = await later.report(b.id);
    expect(rep?.report.contract).not.toBeNull();
    expect(rep?.report.outcome).not.toBe("aborted");
    expect(later.record!.state.activeMission).toBeNull();
    expect(later.record!.cursorAt).toBeGreaterThan(0);
  });

  it("les blocs antérieurs à la création de la partie ne sont jamais rejoués", async () => {
    const { repo, store } = await setup();
    const old = await repo.start(base);
    await repo.finish(old.id, { note: 5, measures: {} }, 600);
    const rt = track(new GameRuntime(store, eventFeed(repo), () => Date.now() + 1000));
    await rt.init();
    expect(rt.record!.state.counters.blocksCompleted).toBe(0);
    expect((await store.processed()).every((p) => p.status === "ignored")).toBe(true);
  });

  it("une version de schéma inconnue est écartée et signalée, sans toucher la partie", async () => {
    const { rt } = await setup();
    await rt.init();
    const before = structuredClone(rt.record);
    const weird = { schema: 2, type: "bloc_termine", eventId: "future-1", at: Date.now() + 5, blockId: "z", exerciseId: "WLK-01", note: 5, playedSeconds: 1, mod: null, modVaincu: false, bonusXpPct: 0, loot: { modId: "black-out", name: "Black-out", rarity: "recup" } };
    emitPublicEvent(weird as unknown as PublicEvent);
    await rt.bridge.idle();
    const p = (await rt.store.processed()).find((x) => x.eventId === "future-1");
    expect(p).toMatchObject({ status: "unsupported" });
    expect(rt.record!.state).toEqual(before!.state);
  });

  it("un abonné du jeu défaillant ne perturbe jamais la partie musicale", async () => {
    const { repo, store } = await setup();
    const broken = track(new GameRuntime(store, eventFeed(repo)));
    await broken.init();
    vi.spyOn(store, "handle").mockRejectedValue(new Error("panne du jeu"));
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const b = await repo.start(base);
    const r = await repo.finish(b.id, { note: 4, measures: {} }, 600);
    await broken.bridge.idle();
    err.mockRestore();
    expect(r.block.status).toBe("termine");
    expect((await repo.blocks())[0]!.status).toBe("termine");
    expect((await store.processed()).filter((p) => p.reason?.startsWith("erreur"))).toHaveLength(2);
  });
});

describe("mission pendant le bloc", () => {
  it("le choix armé au lancement est lié au blockId du bloc lancé", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    const s = structuredClone(rt.record!.state);
    const risky = openContracts(s, rt.cfg, localDate(Date.now())).find((c) => c.slot === "risque")!;
    const squad = [s.runners[0]!.id];
    await rt.arm({ kind: "contract", contractId: risky.id, squad });
    const b = await repo.start(base);
    await rt.bridge.idle();
    const m = rt.record!.state.activeMission!;
    expect(m.blockId).toBe(b.id);
    expect(m.contract.id).toBe(risky.id);
    expect(m.squad).toEqual(squad);
    expect(await rt.store.intent()).toBeNull(); // intention consommée
  });

  it("sans choix armé : contrat standard et équipe suggérée", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    await repo.start(base);
    await rt.bridge.idle();
    expect(rt.record!.state.activeMission!.contract.slot).toBe("standard");
    expect(rt.record!.state.activeMission!.squad.length).toBeGreaterThan(0);
  });

  it("« aucune mission » est respecté", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    await rt.arm({ kind: "none" });
    await repo.start(base);
    await rt.bridge.idle();
    expect(rt.record!.state.activeMission).toBeNull();
  });

  it("bloc terminé = mission résolue ; le rapport arrive avec un récit et ouvre la fenêtre de gestion", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    const b = await repo.start(base);
    await repo.finish(b.id, { note: 2, measures: {} }, 600);
    await rt.bridge.idle();
    const rep = (await rt.report(b.id))!;
    expect(["critSuccess", "success", "partial", "fail", "critFail"]).toContain(rep.report.outcome);
    expect(rep.narrative?.rapport.length).toBeGreaterThan(10);
    expect(rep.narrative?.source).toBe("fallback");
    expect(rt.windowLeftMs()).toBeGreaterThan(100_000);
    expect(rt.record!.state.activeMission).toBeNull();
  });

  it("le mod vaincu se retrouve dans le jet selon sa rareté (+5 pour un Prototype)", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    await repo.raw.put("inventory", mod("prototype"));
    const b = await repo.start({ ...base, mod: mod("prototype") });
    await repo.finish(b.id, { note: 3, measures: {} }, 600);
    await rt.bridge.idle();
    const rep = (await rt.report(b.id))!;
    expect(rep.report.roll?.modBonus).toBe(5);
    expect(rep.facts?.jet?.modVaincu).toBe(true);
  });

  it("bloc abandonné = mission échouée : le premier du jour sans malus, le suivant avec malus", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    await rt.store.update((r) => ({ ...r, state: { ...r.state, rep: 400 } }));
    const b1 = await repo.start(base);
    await repo.abandon(b1.id, 60);
    await rt.bridge.idle();
    const r1 = (await rt.report(b1.id))!;
    expect(r1.report.outcome).toBe("aborted");
    expect(r1.report.penalized).toBeUndefined();
    expect(rt.record!.state.rep).toBe(400);
    expect(rt.windowLeftMs()).toBe(0); // un abandon n'ouvre pas la fenêtre de gestion

    const b2 = await repo.start(base);
    await repo.abandon(b2.id, 60);
    await rt.bridge.idle();
    const r2 = (await rt.report(b2.id))!;
    expect(r2.report.outcome).toBe("aborted");
    expect(r2.report.penalized).toBe(true);
    expect(rt.record!.state.rep).toBeLessThan(400);
    expect(rt.record!.abandons).toEqual({ date: localDate(Date.now()), count: 2 });
  });

  it("une mission orpheline (fin jamais reçue) est close sans pénalité au lancement suivant", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    const b1 = await repo.start(base);
    await rt.bridge.idle();
    // Le bloc est clos sans que l'événement n'arrive (journal perdu) : on simule en marquant son abandon comme déjà traité.
    const ev = await repo.abandon(b1.id, 1).then(async () => (await repo.events()).at(-1)!);
    await rt.store.db.put("processed", { eventId: ev.eventId, at: ev.at, type: ev.type, blockId: ev.blockId, status: "ignored" });
    const b2 = await repo.start(base);
    await rt.bridge.idle();
    expect(rt.record!.state.activeMission!.blockId).toBe(b2.id);
    expect(rt.record!.state.log.at(-1)).toMatchObject({ blockId: b1.id, outcome: "aborted" });
    expect(rt.record!.state.log.at(-1)!.penalized).toBeUndefined();
  });

  it("hors fenêtre de gestion, aucune action de jeu n'est possible", async () => {
    const { rt } = await setup();
    await rt.init();
    expect(await rt.act(() => true)).toBe(false);
  });
});

describe("anti-spoil", () => {
  it("aucun titre de standard (banque inconnue) n'atteint le jeu, même dans un objet forgé", async () => {
    const { repo, rt } = await setup();
    await rt.init();
    await repo.importBank([{ title: "TITRE-SECRET", beatsPerBar: 4, grid: [["Cm7"], ["F7"]] }], new Map());
    await rt.store.update((r) => {
      r.state.counters.blocksSinceForge = 79; // le prochain bloc terminé forge un objet
      return r;
    });
    const s = await repo.drawUnknown("grid");
    const b = await repo.start({ ...base, exerciseId: "DEC-01", tempoKey: "DEC-01", draws: { unknownId: s.id, title: s.title, grid: s.grid } });
    await repo.finish(b.id, { note: 4, cleanBpm: 110, measures: {} }, 600);
    await rt.bridge.idle();
    const all = JSON.stringify({ record: rt.record, reports: await rt.store.reports(), processed: await rt.store.processed() });
    expect(all).not.toContain("TITRE-SECRET");
    const forged = Object.values(rt.record!.state.items).find((i) => i.forged);
    expect(forged?.forged).toMatchObject({ axis: "DEC", standardTitle: null, tempo: null });
  });
});
