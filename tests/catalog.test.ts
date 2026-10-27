import { MODS, getMod, validateCatalog, SIMPLE_TEMPO_PCT } from "../src/core/mods/catalog";
import { RARITIES } from "../src/core/types";

describe("catalogue des mods", () => {
  it("contient les 34 mods de la spec : 6 simples, 28 à intensité", () => {
    expect(MODS).toHaveLength(34);
    expect(MODS.filter((m) => m.type === "simple")).toHaveLength(6);
    expect(MODS.filter((m) => m.type === "intensity")).toHaveLength(28);
  });

  it("est cohérent (identifiants, exercices, 5 raretés, barème des mods simples)", () => {
    expect(validateCatalog([...MODS])).toEqual([]);
  });

  it("détecte un mod simple hors barème", () => {
    const bad = structuredClone(getMod("black-out"));
    bad.levels.fantome.tempoPct = 20;
    expect(validateCatalog([bad])).toContain("mod « black-out » : tempo fantome hors barème");
  });

  it("les mods simples suivent le barème -30/-20/-10/0/+10", () => {
    for (const m of MODS.filter((m) => m.type === "simple")) {
      for (const r of RARITIES) expect(m.levels[r].tempoPct).toBe(SIMPLE_TEMPO_PCT[r]);
    }
  });

  it("reprend les listes d'exercices de la spec (échantillon)", () => {
    expect(getMod("black-out").exercises).toEqual(["MAN-01", "MAN-02", "MAN-03", "MOD-01", "REP-01", "DEC-02"]);
    expect(getMod("zone-verrouillee").exercises).toHaveLength(11);
    expect(getMod("transposition").exercises).toEqual(["WLK-02", "WLK-03", "IMP-02", "IMP-03", "REP-01", "DEC-01", "DEC-02"]);
    expect(getMod("endurance").exercises).toHaveLength(9);
    expect(getMod("fantome-clic").exercises).toHaveLength(10);
    expect(getMod("overclock").exercises).toEqual(["REP-01"]);
  });

  it("reprend les libellés de niveaux de la spec (échantillon)", () => {
    expect(getMod("silence-radio").levels.fantome.label).toBe("Le clic ne revient qu'une mesure sur 8");
    expect(getMod("question-reponse").levels.fantome.label).toBe("1 / 1, la réponse reprend le rythme de la question");
    expect(getMod("cadence").levels.fantome.tempoPct).toBe(-30);
    expect(getMod("dominante").levels.recup.tempoPct).toBe(-20);
    expect(getMod("cycle-quartes").levels.recup.tempoPct).toBe(-20);
    expect(getMod("skip-notes").levels.fantome.tempoPct).toBe(10);
    expect(getMod("overclock").levels.fantome.tempoPct).toBe(15);
  });

  it("déclare les verrous Extensions et Overclock", () => {
    expect(getMod("extensions").unlock).toBe("man03-avance");
    expect(getMod("overclock").unlock).toBe("rep-fiable");
    expect(MODS.filter((m) => m.unlock !== null)).toHaveLength(2);
  });

  it("déclare les paramètres entre crochets", () => {
    const withParams = MODS.filter((m) => m.dropParams.length > 0).map((m) => m.id).sort();
    expect(withParams).toEqual(["fondamentale-interdite", "mono-cable", "registre-impose", "zone-verrouillee"]);
    expect(getMod("fondamentale-interdite").dropParams[0]!.rarities).toEqual(["corpo"]);
  });

  it("ne marque « app » au niveau du mod que si tous ses niveaux le sont", () => {
    for (const m of MODS) {
      const kinds = new Set(RARITIES.map((r) => m.levels[r].enforcement));
      const expected = kinds.size === 2 ? "mixte" : [...kinds][0];
      expect(m.enforcement, m.id).toBe(expected);
    }
  });
});
