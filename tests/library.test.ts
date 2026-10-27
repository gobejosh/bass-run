import "fake-indexeddb/auto";
import { DEFAULT_CONFIG as cfg } from "../src/core/config";
import { chordEvents, fragment, gridToText, parseGridText, transposeGrid } from "../src/core/grid";
import { matchThemes, parseKey, parseLibraryText } from "../src/core/libraryIO";
import { isReliable, suggestTier } from "../src/core/rep";
import { seededRng } from "../src/core/rng";
import { DEFAULT_QUALITIES } from "../src/core/theory/dictionaries";
import { Repo } from "../src/storage/repo";

describe("grilles", () => {
  it("lit une grille mesure par mesure, avec % et plusieurs accords par mesure", () => {
    const { grid, issues } = parseGridText("| Dm7 | G7 | Cmaj7 | % |\n| Em7 A7 | Dm7 . . G7 |");
    expect(issues).toEqual([]);
    expect(grid).toEqual([["Dm7"], ["G7"], ["Cmaj7"], ["Cmaj7"], ["Em7", "A7"], ["Dm7", ".", ".", "G7"]]);
    expect(gridToText(grid)).toBe("| Dm7 | G7 | Cmaj7 | Cmaj7 |\n| Em7 A7 | Dm7 . . G7 |");
  });

  it("signale les symboles non reconnus avec leur mesure", () => {
    expect(parseGridText("| Dm7 | Zz9 | G7 |").issues).toEqual([{ measure: 2, token: "Zz9" }]);
  });

  it("découpe en événements : durées, fusion des accords répétés", () => {
    const { grid } = parseGridText("| Cmaj7 | % | Em7 A7 | Dm7 . . G7 |");
    const ev = chordEvents(grid, 4);
    expect(ev.map((e) => [e.symbol, e.beats])).toEqual([["Cmaj7", 8], ["Em7", 2], ["A7", 2], ["Dm7", 3], ["G7", 1]]);
    expect(fragment(ev, 1, 3, 4)).toMatchObject({ bars: 2 });
  });

  it("transpose une grille", () => {
    const { grid } = parseGridText("| Dm7 | G7 | Cmaj7 | Bø E7 |");
    expect(transposeGrid(grid, 1, 2, DEFAULT_QUALITIES, "en")).toEqual([["Em7"], ["A7"], ["Dmaj7"], ["C♯m7♭5", "F♯7"]]);
    expect(transposeGrid(grid, 6, 10, DEFAULT_QUALITIES, "fr")[0]).toEqual(["Do\u202Fm7"]);
  });
});

describe("import des recueils", () => {
  const TEXT = `Titre: Standard A
Tonalité: Sol m
| Cm7 | F7 | Bbmaj7 | Ebmaj7 |
---
Titre: Standard B
Mesure: 3
Thème: b.pdf
| Fmaj7 | % | Gm7 C7 |
---
Tonalité: Fa
| F7 |
---
Titre: Standard D
Tonalité: Zorg
| Xyz9 | F7 |`;

  it("lit le format texte et ne cite aucun contenu dans les messages", () => {
    const { entries, issues } = parseLibraryText(TEXT);
    expect(entries.map((e) => e.title)).toEqual(["Standard A", "Standard B", "Standard D"]);
    expect(entries[0]!.key).toEqual({ tonic: "Sol", minor: true });
    expect(entries[1]).toMatchObject({ beatsPerBar: 3, theme: "b.pdf" });
    expect(issues.map((i) => i.entry)).toEqual([3, 4, 4]);
    for (const i of issues) {
      for (const secret of ["Standard", "Xyz9", "Zorg", "F7"]) expect(i.message).not.toContain(secret);
    }
  });

  it("lit le format JSON", () => {
    const { entries } = parseLibraryText(JSON.stringify([{ title: "X", key: "Eb", grid: "| Ebmaj7 | Cm7 |" }, { title: "Y", theme: "y.png" }]));
    expect(entries).toHaveLength(2);
    expect(entries[0]!.grid).toEqual([["Ebmaj7"], ["Cm7"]]);
    expect(entries[1]!.theme).toBe("y.png");
  });

  it("tonalités", () => {
    expect(parseKey("Gm")).toEqual({ tonic: "G", minor: true });
    expect(parseKey("Sib")).toEqual({ tonic: "Sib", minor: false });
    expect(parseKey("Ré mineur")).toEqual({ tonic: "Ré", minor: true });
    expect(parseKey("Truc")).toBeUndefined();
  });

  it("rattache les partitions par nom de fichier ou par titre", () => {
    const { entries } = parseLibraryText(TEXT);
    const m = matchThemes(entries, ["b.pdf", "standard-a.png"]);
    expect(m.get(0)).toBe("standard-a.png");
    expect(m.get(1)).toBe("b.pdf");
  });
});

describe("paliers REP-01", () => {
  it("suggère le palier d'après le tempo propre", () => {
    expect(suggestTier(50, 100, cfg)).toBe("decouverte");
    expect(suggestTier(60, 100, cfg)).toBe("en-place");
    expect(suggestTier(85, 100, cfg)).toBe("fiable");
    expect(suggestTier(100, 100, cfg)).toBe("maitrise");
    expect(suggestTier(100, undefined, cfg)).toBeNull();
  });
  it("Overclock : fiable ou maîtrisé", () => {
    expect(isReliable("en-place")).toBe(false);
    expect(isReliable("fiable")).toBe(true);
    expect(isReliable("maitrise")).toBe(true);
  });
});

describe("banque de standards inconnus", () => {
  let n = 0;
  const fresh = () => Repo.open(`bank-${++n}`, seededRng(n));

  it("tire chaque standard une seule fois, le marque tiré, et ne compte que des nombres", async () => {
    const repo = await fresh();
    const entries = Array.from({ length: 5 }, (_, i) => ({ title: `S${i}`, beatsPerBar: 4, grid: [["C7"]] }));
    await repo.importBank(entries, new Map());
    expect(await repo.bankCounts()).toEqual({ neverDrawn: 5, drawn: 0, neverWithGrid: 5, neverWithTheme: 0 });
    expect(await repo.drawnBank()).toEqual([]);
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const s = await repo.drawUnknown("grid");
      expect(s.status).toBe("tire");
      expect(seen.has(s.title)).toBe(false);
      seen.add(s.title);
    }
    expect((await repo.drawnBank()).map((s) => s.title).sort()).toEqual([...seen].sort());
    await expect(repo.drawUnknown("grid")).rejects.toThrow("Plus aucun");
  });

  it("DEC-02 ne tire que des standards avec thème", async () => {
    const repo = await fresh();
    await repo.importBank(
      [{ title: "grille seule", beatsPerBar: 4, grid: [["C7"]] }, { title: "avec thème", beatsPerBar: 4, theme: "t.pdf" }],
      new Map([[1, { name: "t.pdf", mime: "application/pdf", data: new Blob(["x"]) }]]),
    );
    expect((await repo.drawUnknown("theme")).title).toBe("avec thème");
    await expect(repo.drawUnknown("theme")).rejects.toThrow();
  });

  it("les tirages sont uniformes", async () => {
    const counts = new Map<string, number>();
    for (let k = 0; k < 300; k++) {
      const repo = await fresh();
      await repo.importBank([0, 1, 2].map((i) => ({ title: `S${i}`, beatsPerBar: 4, grid: [["C7"]] })), new Map());
      const t = (await repo.drawUnknown("grid")).title;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const c of counts.values()) expect(Math.abs(c / 300 - 1 / 3)).toBeLessThan(0.1);
  });

  it("vider la banque ne touche pas aux standards déjà tirés", async () => {
    const repo = await fresh();
    await repo.importBank([0, 1].map((i) => ({ title: `S${i}`, beatsPerBar: 4, grid: [["C7"]] })), new Map());
    await repo.drawUnknown("grid");
    expect(await repo.clearNeverDrawn()).toBe(1);
    expect((await repo.bankCounts()).drawn).toBe(1);
  });
});

describe("transposition d'un standard", () => {
  it("respecte la distance sur le cycle des quintes et donne l'intervalle", async () => {
    const { planTransposition } = await import("../src/core/transpose");
    const rng = seededRng(12);
    const src = { tonic: { letter: 3, alter: 0 }, minor: false }; // Fa majeur (-1)
    for (let i = 0; i < 100; i++) {
      const [step] = planTransposition(rng, { mode: "distance", min: 2, max: 2 }, src, "fr");
      expect(["Mi♭ majeur", "Sol majeur"]).toContain(step!.label); // Fa (1 ♭) ± 2 altérations
    }
    const each = planTransposition(rng, { mode: "each_chorus" }, src, "fr", 20);
    expect(each).toHaveLength(20);
    for (let i = 1; i < each.length; i++) expect(each[i]!.label).not.toBe(each[i - 1]!.label);
  });
});
