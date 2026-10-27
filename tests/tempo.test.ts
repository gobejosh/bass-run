import { createClickPlanner, normalizeBeats } from "../src/audio/clickPlan";
import { DEFAULT_CONFIG as cfg } from "../src/core/config";
import { getMod } from "../src/core/mods/catalog";
import { resolveMod } from "../src/core/mods/resolve";
import { seededRng } from "../src/core/rng";
import { applyPct, blockBpm, ladderBpmAtBar, progressiveLadder, referenceBpm, tempoKey } from "../src/core/tempo";
import { RARITIES, type ModInstance, type Rarity } from "../src/core/types";

const inst = (modId: string, rarity: Rarity): ModInstance => ({ id: "i", modId, rarity, params: {}, usesLeft: 3, obtainedAt: 0 });

describe("calcul des tempos", () => {
  it("mod simple : -30/-20/-10/réf/+10 sur 100 BPM", () => {
    const got = RARITIES.map((r) => blockBpm(100, getMod("black-out").levels[r], cfg));
    expect(got).toEqual([70, 80, 90, 100, 110]);
  });

  it("arrondit au BPM le plus proche", () => {
    expect(applyPct(123, -30, cfg)).toBe(86); // 86,1
    expect(applyPct(125, -10, cfg)).toBe(113); // 112,5 → 113
    expect(applyPct(137, 10, cfg)).toBe(151); // 150,7
  });

  it("borne le tempo entre min et max", () => {
    expect(applyPct(35, -30, cfg)).toBe(cfg.tempo.minBpm);
    expect(applyPct(390, 10, cfg)).toBe(cfg.tempo.maxBpm);
  });

  it("mod à intensité : levier au tempo de référence sauf mention", () => {
    const ref = 120;
    const t = (id: string, r: Rarity) => resolveMod(inst(id, r), ref, cfg, seededRng(1)).targetBpm;
    expect(t("silence-radio", "fantome")).toBe(120);
    expect(t("fantome-clic", "recup")).toBe(96); // « Clic sur 2 et 4 à -20 % »
    expect(t("fantome-clic", "street")).toBe(120);
    expect(t("cadence", "street")).toBe(96);
    expect(t("cadence", "fantome")).toBe(84); // « Croches à -30 % »
    expect(t("densite", "fantome")).toBe(96); // « Triolets à -20 % »
    expect(t("dominante", "corpo")).toBe(108);
    expect(t("dominante", "fantome")).toBe(132);
    expect(t("skip-notes", "fantome")).toBe(132);
    expect(t("question-reponse", "recup")).toBe(96);
    expect(t("cycle-quartes", "recup")).toBe(96);
  });

  it("Overclock : +3/+5/+8/+10/+15 % au-dessus du tempo du passage", () => {
    expect(RARITIES.map((r) => resolveMod(inst("overclock", r), 100, cfg, seededRng(1)).targetBpm)).toEqual([103, 105, 108, 110, 115]);
  });

  it("tempo de référence : dernier tempo propre, sinon valeur initiale", () => {
    expect(referenceBpm(undefined, "WLK-01", cfg)).toBe(120);
    expect(referenceBpm(142, "WLK-01", cfg)).toBe(142);
  });

  it("clé de tempo par passage pour REP-01", () => {
    expect(tempoKey("REP-01", { melodyId: "m1", passageId: "p2" })).toBe("REP-01:m1:p2");
    expect(tempoKey("WLK-01", { melodyId: "m1", passageId: "p2" })).toBe("WLK-01");
  });

  it("MOD-01 : paliers de 70 % à 110 % par pas de 4 BPM toutes les 8 mesures", () => {
    const ladder = progressiveLadder(100, cfg);
    expect(ladder[0]).toBe(70);
    expect(ladder.at(-1)).toBe(110);
    expect(ladder.slice(0, 3)).toEqual([70, 74, 78]);
    expect(ladderBpmAtBar(ladder, 0, cfg)).toBe(70);
    expect(ladderBpmAtBar(ladder, 7, cfg)).toBe(70);
    expect(ladderBpmAtBar(ladder, 8, cfg)).toBe(74);
    expect(ladderBpmAtBar(ladder, 10_000, cfg)).toBe(110);
  });
});

describe("plan de clic du métronome", () => {
  const plan = (metronome: Parameters<typeof createClickPlanner>[0]["metronome"], bars: number, beatsPerBar = 4, seed = 1) => {
    const p = createClickPlanner({ beatsPerBar, countInBars: 1, metronome, tempoAt: () => 100, rng: seededRng(seed) });
    return Array.from({ length: bars }, () => p.next());
  };

  it("décompte d'une mesure pleine, même avec un mod", () => {
    const bars = plan({ beats: [4] }, 3);
    expect(bars[0]).toMatchObject({ countIn: true, clicks: [1, 2, 3, 4], playedIndex: -1 });
    expect(bars[1]).toMatchObject({ countIn: false, clicks: [4], playedIndex: 0 });
  });

  it("sans mod : tous les temps", () => {
    expect(plan(undefined, 4).every((b) => b.clicks.length === 4)).toBe(true);
  });

  it("Fantôme Prototype : clic sur le 1, une mesure sur deux", () => {
    const bars = plan(getMod("fantome-clic").levels.prototype.effects!.metronome, 9).slice(1);
    expect(bars.map((b) => b.clicks)).toEqual([[1], [], [1], [], [1], [], [1], []]);
  });

  it("Silence radio Fantôme : le clic ne revient qu'une mesure sur 8", () => {
    const bars = plan(getMod("silence-radio").levels.fantome.effects!.metronome, 17).slice(1);
    expect(bars.filter((b) => b.clicks.length > 0).map((b) => b.playedIndex)).toEqual([0, 8]);
  });

  it("Silence radio : coupures de min..max mesures, toujours séparées par une mesure cliquée", () => {
    for (const r of ["recup", "street", "corpo", "prototype"] as const) {
      const d = getMod("silence-radio").levels[r].effects!.metronome!.dropouts!;
      const bars = plan({ dropouts: d }, 3000, 4, 11).slice(1);
      const runs: number[] = [];
      let cur = 0;
      for (const b of bars) {
        if (b.clicks.length === 0) cur++;
        else if (cur > 0) (runs.push(cur), (cur = 0));
      }
      expect(runs.length, r).toBeGreaterThan(20);
      expect(Math.min(...runs), r).toBeGreaterThanOrEqual(d.min);
      expect(Math.max(...runs), r).toBeLessThanOrEqual(d.max);
    }
  });

  it("en 3/4, un clic « sur 4 » tombe sur le dernier temps", () => {
    expect(normalizeBeats([2, 4], 3)).toEqual([2, 3]);
    expect(normalizeBeats([4], 3)).toEqual([3]);
  });

  it("suit le tempo par mesure (MOD-01)", () => {
    const ladder = progressiveLadder(100, cfg);
    const p = createClickPlanner({ beatsPerBar: 4, countInBars: 1, tempoAt: (i) => ladderBpmAtBar(ladder, i, cfg), rng: seededRng(1) });
    const bars = Array.from({ length: 10 }, () => p.next());
    expect(bars[0]!.bpm).toBe(70);
    expect(bars[8]!.bpm).toBe(70);
    expect(bars[9]!.bpm).toBe(74);
  });
});
