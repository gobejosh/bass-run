import "fake-indexeddb/auto";
import * as E from "../../src/game/engine";
import { seededRng } from "../../src/core/rng";
import { Repo } from "../../src/storage/repo";
import { eventFeed } from "../../src/integration/gameFeed";
import { GameRuntime } from "../../src/game/runtime";
import { GameStore } from "../../src/game/store";

describe("fenêtre de gestion : pas de jeu sans pratique", () => {
  it("s'ouvre après un bloc terminé, permet d'agir, puis se verrouille", async () => {
    let clock = Date.now();
    const repo = await Repo.open("mg-music", seededRng(3));
    const rt = new GameRuntime(await GameStore.open("mg-game"), eventFeed(repo), () => clock);
    await rt.init();
    await rt.store.update((r) => ({ ...r, state: { ...r.state, credits: 5000 } }));
    await rt.reload();
    const cand = rt.record!.state.candidates.find((c) => !rt.record!.state.runners.some((r) => r.role === c.role))!;
    expect(await rt.act((s, cfg) => E.recruit(s, cfg, cand.id))).toBe(false); // avant tout bloc

    const b = await repo.start({ exerciseId: "MAN-01", tempoKey: "MAN-01", plannedMinutes: 5, refBpm: 60, targetBpm: 60, draws: {} });
    await repo.finish(b.id, { note: 3, measures: {} }, 300);
    await rt.bridge.idle();
    clock = Date.now() + 1000;
    expect(rt.windowLeftMs()).toBeGreaterThan(0);
    expect(await rt.act((s, cfg) => E.recruit(s, cfg, cand.id))).toBe(true);
    expect(rt.record!.state.runners.some((r) => r.id === cand.id)).toBe(true);
    expect(await rt.act((s, cfg) => E.buyModule(s, cfg, "dojo"))).toBe(true);
    expect(rt.record!.state.planque.dojo).toBe(1);

    clock = Date.now() + 121_000; // fenêtre écoulée
    expect(rt.windowLeftMs()).toBe(0);
    expect(await rt.act((s, cfg) => E.buyModule(s, cfg, "infirmerie"))).toBe(false);
    expect(rt.record!.state.planque.infirmerie).toBe(0);
    rt.stop();
  });
});
