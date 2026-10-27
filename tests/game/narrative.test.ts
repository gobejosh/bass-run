import "fake-indexeddb/auto";
import { seededRng } from "../../src/core/rng";
import { Repo } from "../../src/storage/repo";
import { eventFeed } from "../../src/integration/gameFeed";
import { GameRuntime } from "../../src/game/runtime";
import { GameStore } from "../../src/game/store";
import { fallbackNarrative } from "../../src/game/narrative";
import { buildRequest, parseResponse, requestNarrative, SAMPLE_FACTS, type FetchLike } from "../../src/game/narrativeApi";

const reply = (text: string, ok = true, status = 200): FetchLike => async () => ({ ok, status, json: async () => ({ content: [{ type: "text", text }] }) });

describe("récit de repli", () => {
  it("assemble 1 à 3 phrases tirées des gabarits, sans variable non remplie", () => {
    const n = fallbackNarrative({ ...SAMPLE_FACTS, blesses: [{ nom: "Mira « Vex » Okafor", gravite: "normal", blocs: 3 }], butin: ["Deck de piratage"] }, "s");
    expect(n.source).toBe("fallback");
    expect(n.rapport).not.toMatch(/\{\w+\}/);
    expect(n.rapport).toContain("Mira « Vex » Okafor");
    expect(n.rapport).toContain("Deck de piratage");
  });
});

describe("récit par l'API Claude", () => {
  it("la requête suit narrative.json et n'envoie que les faits de la mission", () => {
    const req = buildRequest(SAMPLE_FACTS, "sk-test");
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    expect(req.headers).toMatchObject({ "x-api-key": "sk-test", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });
    expect(req.body.model).toBe("claude-haiku-5-5");
    expect(req.body.messages[0]!.content).toContain(SAMPLE_FACTS.contrat.cible);
  });

  it("accepte une réponse JSON conforme, même entourée d'un bloc de code", () => {
    expect(parseResponse({ content: [{ type: "text", text: '```json\n{"titre":"Nuit blanche","rapport":"Tout a tenu."}\n```' }] })).toEqual({ titre: "Nuit blanche", rapport: "Tout a tenu.", source: "api" });
  });

  it("refuse JSON invalide, champs manquants ou texte trop long", () => {
    expect(parseResponse({ content: [{ type: "text", text: "pas du json" }] })).toBeNull();
    expect(parseResponse({ content: [{ type: "text", text: '{"titre":"x"}' }] })).toBeNull();
    expect(parseResponse({ content: [{ type: "text", text: JSON.stringify({ titre: "x", rapport: "a".repeat(401) }) }] })).toBeNull();
    expect(parseResponse({})).toBeNull();
  });

  it("toute erreur (clé refusée, réseau) renvoie null, sans lever", async () => {
    expect(await requestNarrative(SAMPLE_FACTS, "k", reply("", false, 401))).toEqual({ narrative: null, error: "clé refusée" });
    const down: FetchLike = async () => {
      throw new Error("Failed to fetch");
    };
    expect((await requestNarrative(SAMPLE_FACTS, "k", down)).narrative).toBeNull();
  });
});

describe("récit dans le flux d'un bloc", () => {
  let n = 0;
  async function setup(fetchImpl: FetchLike) {
    n++;
    const repo = await Repo.open(`nmusic-${n}`, seededRng(n));
    const rt = new GameRuntime(await GameStore.open(`ngame-${n}`), eventFeed(repo));
    rt.fetchImpl = fetchImpl;
    await rt.init();
    return { repo, rt };
  }
  const base = { exerciseId: "DEC-01" as const, tempoKey: "DEC-01", plannedMinutes: 10, refBpm: 110, targetBpm: 110, draws: { title: "TITRE-SECRET" } };

  it("le récit de l'API remplace le repli, et la requête ne contient aucune donnée musicale", async () => {
    const bodies: string[] = [];
    const { repo, rt } = await setup(async (_u, init) => {
      bodies.push(init.body);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"titre":"Signal pur","rapport":"L\'équipe est passée."}' }] }) };
    });
    await rt.store.setApiKey("sk-test");
    const b = await repo.start(base);
    await repo.finish(b.id, { note: 5, cleanBpm: 133, measures: { arrets: 2 } }, 600);
    await rt.bridge.idle();
    await vi.waitFor(async () => expect((await rt.store.report(b.id))?.narrative?.source).toBe("api"));
    expect((await rt.report(b.id))?.narrative?.titre).toBe("Signal pur");
    expect(bodies).toHaveLength(1);
    for (const forbidden of ["TITRE-SECRET", "DEC-01", "133", "arrets", "\"note\""]) expect(bodies[0]).not.toContain(forbidden);
    rt.stop();
  });

  it("sans clé : aucun appel, le repli reste", async () => {
    const calls = vi.fn();
    const { repo, rt } = await setup(calls as unknown as FetchLike);
    const b = await repo.start(base);
    await repo.finish(b.id, { note: 3, measures: {} }, 600);
    await rt.bridge.idle();
    expect(calls).not.toHaveBeenCalled();
    expect((await rt.report(b.id))?.narrative?.source).toBe("fallback");
    rt.stop();
  });
});

describe("sauvegarde du jeu", () => {
  it("l'export ne contient jamais la clé d'API, et la restauration rend la partie à l'identique", async () => {
    const a = await GameStore.open("bk-a");
    const repo = await Repo.open("bk-music", seededRng(1));
    const rt = new GameRuntime(a, eventFeed(repo));
    await rt.init();
    await a.setApiKey("sk-secret-123");
    const b0 = await repo.start({ exerciseId: "WLK-01", tempoKey: "WLK-01", plannedMinutes: 5, refBpm: 120, targetBpm: 120, draws: {} });
    await repo.finish(b0.id, { note: 4, measures: {} }, 300);
    await rt.bridge.idle();
    rt.stop();
    const dump = JSON.parse(JSON.stringify(await a.exportAll()));
    expect(JSON.stringify(dump)).not.toContain("sk-secret-123");

    const b = await GameStore.open("bk-b");
    await b.importAll(dump);
    expect(await b.record()).toEqual(await a.record());
    expect(await b.reports()).toEqual(await a.reports());
    expect((await b.processed()).length).toBe(2);
    expect(await b.apiKey()).toBeUndefined();
    await expect(b.importAll({} as never)).rejects.toThrow("illisibles");
  });
});
