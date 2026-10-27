import { abandonBlock, finishBlock, isMan03Advanced, nextRefBpm, startBlock } from "../src/core/block";
import { DEFAULT_CONFIG as cfg } from "../src/core/config";
import { emitPublicEvent, onPublicEvent, type PublicEvent } from "../src/core/events";
import { MODS, getMod } from "../src/core/mods/catalog";
import { canEquip, isCompatible } from "../src/core/mods/compat";
import { drawDropParams, lootMod } from "../src/core/mods/drop";
import { applyBlockEnd, updateInventory } from "../src/core/mods/inventory";
import { describeInstance, fillBrackets, resolveMod } from "../src/core/mods/resolve";
import { seededRng } from "../src/core/rng";
import { EXERCISE_IDS, type BlockRecord, type ModInstance, type Rarity } from "../src/core/types";

const inst = (modId: string, rarity: Rarity = "corpo", usesLeft = 3, params: Record<string, string> = {}): ModInstance => ({
  id: `i-${modId}-${rarity}-${usesLeft}`,
  modId,
  rarity,
  params,
  usesLeft,
  obtainedAt: 0,
});
const unlocked = { man03Advanced: true, repPassageReliable: true };
const locked = { man03Advanced: false, repPassageReliable: false };

describe("décompte des utilisations", () => {
  it("un mod sert 3 fois puis disparaît", () => {
    let i: ModInstance | null = inst("black-out");
    expect(i.usesLeft).toBe(cfg.loot.usesPerMod);
    i = applyBlockEnd(i, "termine").instance;
    expect(i?.usesLeft).toBe(2);
    i = applyBlockEnd(i!, "termine").instance;
    expect(i?.usesLeft).toBe(1);
    const last = applyBlockEnd(i!, "termine");
    expect(last.consumed).toBe(true);
    expect(last.instance).toBeNull();
  });

  it("un bloc abandonné ne consomme rien", () => {
    const i = inst("black-out", "corpo", 1);
    const r = applyBlockEnd(i, "abandonne");
    expect(r.consumed).toBe(false);
    expect(r.instance).toEqual(i);
  });

  it("met à jour l'inventaire : seul le mod équipé est consommé, le loot n'arrive que si le bloc est terminé", () => {
    const a = inst("black-out", "corpo", 1);
    const b = inst("tierces", "street", 3);
    const loot = inst("endurance", "fantome");
    expect(updateInventory([a, b], a.id, "termine", loot).map((x) => x.id)).toEqual([b.id, loot.id]);
    expect(updateInventory([a, b], a.id, "abandonne", loot)).toEqual([a, b]);
    expect(updateInventory([a, b], undefined, "termine", loot)).toEqual([a, b, loot]);
  });

  it("refuse de consommer un mod déjà épuisé", () => {
    expect(() => applyBlockEnd(inst("black-out", "corpo", 0), "termine")).toThrow();
  });
});

describe("compatibilité mod / exercice", () => {
  it("chaque mod n'est équipable que sur ses exercices listés", () => {
    for (const m of MODS) {
      for (const ex of EXERCISE_IDS) {
        const check = canEquip(inst(m.id), ex, unlocked);
        expect(check.ok, `${m.id} sur ${ex}`).toBe(m.exercises.includes(ex));
      }
    }
  });

  it("aucun mod sur RYT-01 ni EAR-01", () => {
    expect(MODS.some((m) => isCompatible(m, "RYT-01") || isCompatible(m, "EAR-01"))).toBe(false);
  });

  it("Extensions exige le palier avancé MAN-03, Overclock le palier « fiable »", () => {
    expect(canEquip(inst("extensions"), "MAN-03", locked)).toEqual({ ok: false, reason: "Palier avancé MAN-03 requis" });
    expect(canEquip(inst("extensions"), "MAN-03", { ...locked, man03Advanced: true }).ok).toBe(true);
    expect(canEquip(inst("overclock"), "REP-01", locked).ok).toBe(false);
    expect(canEquip(inst("overclock"), "REP-01", { ...locked, repPassageReliable: true }).ok).toBe(true);
  });

  it("refuse un mod sans utilisation restante", () => {
    expect(canEquip(inst("black-out", "corpo", 0), "MAN-01", unlocked).ok).toBe(false);
  });
});

describe("loot", () => {
  it("tire dans tout le catalogue (chacun des 34 mods sort)", () => {
    const rng = seededRng(1);
    const seen = new Set<string>();
    let state = { dropsSinceHigh: 0 };
    for (let i = 0; i < 5000; i++) {
      const r = lootMod(rng, 3, state, cfg, { id: () => String(i), now: 0 });
      seen.add(r.instance.modId);
      state = r.next;
    }
    expect(seen.size).toBe(34);
  });

  it("donne 3 utilisations et fige les paramètres entre crochets", () => {
    const rng = seededRng(9);
    for (let i = 0; i < 200; i++) {
      const r = lootMod(rng, 5, { dropsSinceHigh: 0 }, cfg, { id: () => "x", now: 0 });
      expect(r.instance.usesLeft).toBe(3);
      const mod = getMod(r.instance.modId);
      for (const p of mod.dropParams) {
        const applies = !p.rarities || p.rarities.includes(r.instance.rarity);
        if (applies) expect(p.values).toContain(r.instance.params[p.key]);
        else expect(r.instance.params[p.key]).toBeUndefined();
      }
    }
  });

  it("Fondamentale interdite n'a une cible tirée qu'en Corpo", () => {
    const rng = seededRng(3);
    const mod = getMod("fondamentale-interdite");
    expect(Object.keys(drawDropParams(rng, mod, "corpo"))).toEqual(["cible"]);
    expect(drawDropParams(rng, mod, "prototype")).toEqual({});
  });
});

describe("affichage des paramètres", () => {
  it("remplace les crochets par la valeur tirée", () => {
    expect(fillBrackets("Tout sur une seule corde [corde]", { corde: "La" })).toBe("Tout sur une seule corde [La]");
    expect(describeInstance(inst("fondamentale-interdite", "corpo", 3, { cible: "7e" })).level).toBe("Cible tirée [7e]");
    expect(describeInstance(inst("zone-verrouillee", "street", 3, { case: "5" })).constraint).toBe("Sans quitter une position [5]");
    expect(fillBrackets("Sans crochets", {})).toBe("Sans crochets");
  });
});

describe("résolution au lancement", () => {
  it("Encerclement Prototype tire un sens ; Corpo non", () => {
    const rng = seededRng(5);
    expect(resolveMod(inst("encerclement", "prototype"), 120, cfg, rng).launch.sens).toBeDefined();
    expect(resolveMod(inst("encerclement", "corpo"), 120, cfg, rng).launch.sens).toBeUndefined();
  });
  it("distingue appliqué par l'app et consigne", () => {
    const rng = seededRng(5);
    expect(resolveMod(inst("black-out"), 100, cfg, rng).appliedByApp).toBe(false);
    expect(resolveMod(inst("silence-radio"), 100, cfg, rng).appliedByApp).toBe(true);
    expect(resolveMod(inst("two-feel", "prototype"), 100, cfg, rng).appliedByApp).toBe(true);
    expect(resolveMod(inst("two-feel", "street"), 100, cfg, rng).appliedByApp).toBe(false);
  });
});

describe("cycle d'un bloc et événements", () => {
  const start = (mod?: ModInstance) =>
    startBlock({ exerciseId: "WLK-01", tempoKey: "WLK-01", plannedMinutes: 10, refBpm: 120, targetBpm: 96, mod, draws: {}, now: 1000, id: "b1" });

  it("terminé avec mod : mod vaincu, bonus XP de sa rareté, une utilisation consommée, un loot", () => {
    const m = inst("silence-radio", "prototype", 3);
    const { block, event } = start(m);
    expect(event).toMatchObject({ type: "bloc_lance", blockId: "b1", mod: { modId: "silence-radio", rarity: "prototype" } });
    const r = finishBlock(block, { note: 5, cleanBpm: 132, measures: {} }, 600, {
      inventory: [m], lootState: { dropsSinceHigh: 0 }, currentRefBpm: 120, rng: seededRng(2), cfg, now: 2000,
    });
    expect(r.block.status).toBe("termine");
    expect(r.event.modVaincu).toBe(true);
    expect(r.event.bonusXpPct).toBe(50);
    expect(r.event.playedSeconds).toBe(600);
    expect(r.inventory.find((x) => x.id === m.id)?.usesLeft).toBe(2);
    expect(r.inventory).toContainEqual(r.loot);
    expect(r.newRefBpm).toBe(132);
  });

  it("terminé sans mod : pas de mod vaincu, bonus 0", () => {
    const { block } = start();
    const r = finishBlock(block, { note: 3, cleanBpm: 110, measures: {} }, 600, {
      inventory: [], lootState: { dropsSinceHigh: 0 }, rng: seededRng(2), cfg,
    });
    expect(r.event.modVaincu).toBe(false);
    expect(r.event.bonusXpPct).toBe(0);
    expect(r.newRefBpm).toBe(110);
  });

  it("abandonné : ni loot ni consommation", () => {
    const m = inst("silence-radio", "prototype", 1);
    const { block } = start(m);
    const r = abandonBlock(block, 120, 3000);
    expect(r.block.status).toBe("abandonne");
    expect(r.block.loot).toBeUndefined();
    expect(r.event.type).toBe("bloc_abandonne");
    expect(updateInventory([m], m.id, "abandonne")).toEqual([m]);
  });

  it("un bloc clos ne peut pas être clos deux fois", () => {
    const { block } = start();
    const done = abandonBlock(block, 1).block;
    expect(() => abandonBlock(done, 1)).toThrow();
  });

  it("les événements diffusés sont gelés : le jeu ne peut rien modifier", () => {
    const received: PublicEvent[] = [];
    const off = onPublicEvent((e) => received.push(e as PublicEvent));
    const { event } = start(inst("black-out"));
    emitPublicEvent(event);
    off();
    expect(received).toHaveLength(1);
    expect(Object.isFrozen(received[0])).toBe(true);
    expect(() => {
      (received[0] as { mod: { rarity: string } }).mod.rarity = "fantome";
    }).toThrow();
    expect(received[0]).not.toBe(event);
  });
});

describe("tempo de référence après un bloc moddé", () => {
  it("raise-only : un bloc moddé peut monter la référence, jamais la baisser", () => {
    expect(nextRefBpm(84, true, 120, "raise-only")).toBeUndefined();
    expect(nextRefBpm(126, true, 120, "raise-only")).toBe(126);
    expect(nextRefBpm(84, false, 120, "raise-only")).toBe(84);
  });
  it("always et never", () => {
    expect(nextRefBpm(84, true, 120, "always")).toBe(84);
    expect(nextRefBpm(140, true, 120, "never")).toBeUndefined();
    expect(nextRefBpm(undefined, false, 120, "always")).toBeUndefined();
  });
});

describe("palier avancé MAN-03", () => {
  const b = (i: number, note: number, reaction: number, mod = false): BlockRecord => ({
    id: String(i), exerciseId: "MAN-03", tempoKey: "MAN-03", plannedMinutes: 5, startedAt: i, endedAt: i,
    status: "termine", refBpm: 60, targetBpm: 60, draws: {},
    debrief: { note: note as 1, measures: { reactionMoy: reaction } },
    ...(mod ? { mod: { instanceId: "x", modId: "black-out", name: "Black-out", rarity: "corpo", params: {} } } : {}),
  });
  it("exige 3 blocs récents sans mod, note ≥ 4 et réaction ≤ 2 s", () => {
    expect(isMan03Advanced([b(1, 4, 1.8), b(2, 5, 1.5)], cfg)).toBe(false);
    expect(isMan03Advanced([b(1, 4, 1.8), b(2, 5, 1.5), b(3, 4, 2.0)], cfg)).toBe(true);
    expect(isMan03Advanced([b(1, 4, 1.8), b(2, 5, 1.5), b(3, 3, 1.0)], cfg)).toBe(false);
    expect(isMan03Advanced([b(0, 2, 9), b(1, 4, 1.8), b(2, 5, 1.5), b(3, 4, 1.9)], cfg)).toBe(true);
    expect(isMan03Advanced([b(1, 4, 1.8), b(2, 5, 1.5), b(3, 4, 1.9, true)], cfg)).toBe(false);
  });
});
