import * as E from "../../src/game/engine";
import type { GameState, ModRarity } from "../../src/game/engine";

const cfg = E.engineConfig();
const fresh = (seed = "t1") => E.newGame(cfg, { seed, seasonStart: "2026-11-02", seasonEnd: "2027-06-30" });
const RARITIES: ModRarity[] = ["none", "recup", "street", "corpo", "prototype", "fantome"];

/** Lance une mission sur le contrat standard du jour avec l'équipe suggérée. */
function withMission(state: GameState, blockId: string, date = "2026-11-03", mod: ModRarity = "none") {
  const board = E.getBoard(state, cfg, date);
  const c = board.contracts.find((x) => x.slot === "standard")!;
  const squad = E.suggestSquad(state, cfg, c, mod)!.ids;
  E.startMission(state, c, squad, blockId);
  return { contract: c, squad };
}

describe("moteur LOW END dans l'app", () => {
  it("se charge avec ses 11 tables et crée une partie déterministe", () => {
    const a = fresh("graine");
    const b = fresh("graine");
    expect(a).toEqual(b);
    expect(a.runners.map((r) => r.role)).toEqual(["solo", "netrunner"]);
    expect(a.districts).toHaveLength(6);
    expect(E.getBoard(a, cfg, "2026-11-03").contracts).toHaveLength(3);
  });

  it("bloc terminé : la mission est résolue et laisse un rapport", () => {
    const s = fresh();
    withMission(s, "b1");
    const r = E.endBlock(s, cfg, { id: "b1", date: "2026-11-03", completed: true, modRarity: "none", axis: "WLK", exerciseId: "WLK-01", tempo: null });
    expect(r.outcome).not.toBeNull();
    expect(r.outcome).not.toBe("aborted");
    expect(r.roll?.dice).toHaveLength(2);
    expect(s.activeMission).toBeNull();
    expect(s.counters.blocksCompleted).toBe(1);
    expect(s.log).toHaveLength(1);
  });

  it("bloc abandonné : mission avortée, rien gagné, contrat perdu, sans blessure", () => {
    const s = fresh();
    const { contract } = withMission(s, "b1");
    const rep0 = s.rep;
    const r = E.endBlock(s, cfg, { id: "b1", date: "2026-11-03", completed: false, modRarity: "none", axis: "WLK", exerciseId: "WLK-01", tempo: null });
    expect(r.outcome).toBe("aborted");
    expect(r.rewards).toEqual({ credits: 0, rep: 0, xp: 0, items: [] });
    expect(s.rep).toBe(rep0);
    expect(s.runners.every((x) => !x.injury)).toBe(true);
    expect(contract.taken).toBe(true);
    expect(s.counters.blocksCompleted).toBe(0);
  });

  it("abandon au-delà de l'arrêt gratuit : perte de réputation et un runner blessé", () => {
    const s = fresh();
    s.rep = 500;
    withMission(s, "b1");
    const r = E.endBlock(s, cfg, { id: "b1", date: "2026-11-03", completed: false, modRarity: "none", axis: "WLK", exerciseId: "WLK-01", tempo: null, abandonPenalty: true });
    expect(r.outcome).toBe("aborted");
    expect(r.penalized).toBe(true);
    expect(r.rewards.rep).toBeLessThan(0);
    expect(s.rep).toBe(500 + r.rewards.rep);
    expect(r.events.filter((e) => e.kind === "injury" || e.kind === "injuryAvoided")).toHaveLength(1);
    expect(s.log.at(-1)).toMatchObject({ outcome: "aborted", penalized: true });
  });

  it("le malus d'abandon ne touche jamais un petit boulot", () => {
    const s = fresh();
    const gig = E.makeGig(s, cfg, "2026-11-03", "b1");
    E.startMission(s, gig, E.suggestSquad(s, cfg, gig)!.ids, "b1");
    const r = E.endBlock(s, cfg, { id: "b1", date: "2026-11-03", completed: false, modRarity: "none", axis: null, exerciseId: null, tempo: null, abandonPenalty: true });
    expect(r.penalized).toBeUndefined();
    expect(s.runners.every((x) => !x.injury)).toBe(true);
  });
});

describe("bonus du mod vaincu", () => {
  it("le bonus au jet croît strictement avec la rareté (aucun < Récup < … < Fantôme)", () => {
    const s = fresh();
    const c = E.getBoard(s, cfg, "2026-11-03").contracts[1]!;
    const ids = s.runners.map((r) => r.id);
    const bonus = RARITIES.map((m) => E.evaluate(s, cfg, c, ids, m).modBonus);
    expect(bonus).toEqual([0, 1, 2, 3, 5, 7]);
    const win = RARITIES.map((m) => {
      const o = E.odds(E.evaluate(s, cfg, c, ids, m), cfg);
      return o.success + o.critSuccess;
    });
    for (let i = 1; i < win.length; i++) expect(win[i]!).toBeGreaterThanOrEqual(win[i - 1]!);
    expect(win.at(-1)!).toBeGreaterThan(win[0]!);
  });

  it("la chance d'équipement du mod vaincu croît avec la rareté", () => {
    const g = cfg.core.modLoot.gearChance as Record<string, number>;
    const seq = RARITIES.map((r) => g[r] ?? 0);
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThan(seq[i - 1]!);
  });

  it("le bonus d'XP (bonusXpPct) multiplie l'XP de la mission, à jet identique", () => {
    const base = fresh();
    withMission(base, "b1", "2026-11-03", "prototype");
    const a = structuredClone(base);
    const b = structuredClone(base);
    const block = { id: "b1", date: "2026-11-03", completed: true, modRarity: "prototype" as const, axis: "MAN", exerciseId: "MAN-01", tempo: null };
    const ra = E.endBlock(a, cfg, block);
    const rb = E.endBlock(b, cfg, { ...block, xpBonusPct: 50 });
    expect(rb.roll?.dice).toEqual(ra.roll?.dice);
    expect(rb.outcome).toBe(ra.outcome);
    expect(ra.rewards.xp).toBeGreaterThan(0);
    expect(Math.abs(rb.rewards.xp - ra.rewards.xp * 1.5)).toBeLessThanOrEqual(1);
  });
});
