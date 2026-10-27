import { DEFAULT_CONFIG as cfg } from "../src/core/config";
import { dropTableFor, highOnly, isHigh, rollRarity } from "../src/core/rarity";
import { cryptoRng, scriptedRng, seededRng } from "../src/core/rng";
import { RARITIES, type Rarity } from "../src/core/types";

const sum = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);

describe("tables de drop", () => {
  it("chaque table somme à 100 %", () => {
    for (const t of Object.values(cfg.loot.dropTable)) expect(sum(t)).toBe(100);
  });

  it("associe la bonne table à chaque note", () => {
    for (const n of [1, 2, 3]) expect(dropTableFor(n, cfg)).toEqual({ recup: 40, street: 30, corpo: 18, prototype: 9, fantome: 3 });
    expect(dropTableFor(4, cfg)).toEqual({ recup: 30, street: 30, corpo: 22, prototype: 13, fantome: 5 });
    expect(dropTableFor(5, cfg)).toEqual({ recup: 20, street: 30, corpo: 26, prototype: 17, fantome: 7 });
  });

  it("refuse une note hors 1..5", () => {
    expect(() => dropTableFor(0, cfg)).toThrow();
    expect(() => dropTableFor(6, cfg)).toThrow();
    expect(() => dropTableFor(3.5, cfg)).toThrow();
  });

  it("respecte les probabilités (200 000 tirages, pitié neutralisée)", () => {
    const noPity = { ...cfg, loot: { ...cfg.loot, pityThreshold: Infinity } };
    for (const note of [2, 4, 5]) {
      const rng = seededRng(note * 7919);
      const counts: Record<Rarity, number> = { recup: 0, street: 0, corpo: 0, prototype: 0, fantome: 0 };
      const N = 200_000;
      for (let i = 0; i < N; i++) counts[rollRarity(rng, note, { dropsSinceHigh: 0 }, noPity).rarity]++;
      const table = dropTableFor(note, cfg);
      for (const r of RARITIES) expect(Math.abs(counts[r] / N - table[r] / 100)).toBeLessThan(0.005);
    }
  });

  it("frontières du tirage pondéré : 0 → Récup, 0,9999 → Fantôme, 0,97 → Fantôme pour une note de 1", () => {
    expect(rollRarity(scriptedRng([0]), 1, { dropsSinceHigh: 0 }, cfg).rarity).toBe("recup");
    expect(rollRarity(scriptedRng([0.9999]), 1, { dropsSinceHigh: 0 }, cfg).rarity).toBe("fantome");
    expect(rollRarity(scriptedRng([0.97]), 1, { dropsSinceHigh: 0 }, cfg).rarity).toBe("fantome");
    expect(rollRarity(scriptedRng([0.969]), 1, { dropsSinceHigh: 0 }, cfg).rarity).toBe("prototype");
  });
});

describe("compteur de pitié", () => {
  it("s'incrémente sous Prototype et se remet à zéro sur Prototype ou Fantôme", () => {
    expect(rollRarity(scriptedRng([0]), 3, { dropsSinceHigh: 4 }, cfg).next.dropsSinceHigh).toBe(5);
    expect(rollRarity(scriptedRng([0.95]), 3, { dropsSinceHigh: 4 }, cfg).next.dropsSinceHigh).toBe(0);
    expect(rollRarity(scriptedRng([0.99]), 3, { dropsSinceHigh: 4 }, cfg).next.dropsSinceHigh).toBe(0);
  });

  it("ne se déclenche pas au 15e drop, mais force au moins Prototype au 16e après 15 drops bas", () => {
    // 15 drops bas consécutifs : le 15e lui-même est tiré normalement.
    let state = { dropsSinceHigh: 0 };
    for (let i = 0; i < 15; i++) {
      const r = rollRarity(scriptedRng([0]), 1, state, cfg); // 0 → Récup
      expect(r.pity).toBe(false);
      expect(r.rarity).toBe("recup");
      state = r.next;
    }
    expect(state.dropsSinceHigh).toBe(15);
    // Le suivant est forcé, même avec un tirage qui donnerait Récup.
    const forced = rollRarity(scriptedRng([0]), 1, state, cfg);
    expect(forced.pity).toBe(true);
    expect(isHigh(forced.rarity)).toBe(true);
    expect(forced.next.dropsSinceHigh).toBe(0);
  });

  it("en pitié, garde les proportions Prototype/Fantôme de la note (note 1–3 : 9/3 → 75 %/25 %)", () => {
    expect(highOnly(dropTableFor(2, cfg))).toEqual({ recup: 0, street: 0, corpo: 0, prototype: 9, fantome: 3 });
    const rng = seededRng(42);
    let fantome = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const r = rollRarity(rng, 2, { dropsSinceHigh: 15 }, cfg);
      expect(isHigh(r.rarity)).toBe(true);
      if (r.rarity === "fantome") fantome++;
    }
    expect(Math.abs(fantome / N - 0.25)).toBeLessThan(0.006);
  });

  it("le seuil est configurable", () => {
    const c = { ...cfg, loot: { ...cfg.loot, pityThreshold: 3 } };
    expect(rollRarity(scriptedRng([0]), 1, { dropsSinceHigh: 3 }, c).pity).toBe(true);
    expect(rollRarity(scriptedRng([0]), 1, { dropsSinceHigh: 2 }, c).pity).toBe(false);
  });
});

describe("aléa cryptographique", () => {
  it("int() est uniforme et borné", () => {
    const counts = new Array(7).fill(0);
    const N = 70_000;
    for (let i = 0; i < N; i++) counts[cryptoRng.int(7)]++;
    for (const c of counts) expect(Math.abs(c / N - 1 / 7)).toBeLessThan(0.01);
  });
  it("next() reste dans [0, 1)", () => {
    for (let i = 0; i < 10_000; i++) {
      const x = cryptoRng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
