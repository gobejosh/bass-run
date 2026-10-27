import { callResponsePhase, chorusNumber, feelAt, scoreVisible, switchBars, targetAt, targetSequence, TARGETS } from "../src/core/mods/live";
import { seededRng } from "../src/core/rng";

describe("effets de mods en direct", () => {
  it("compte les chorus", () => {
    expect([0, 3, 4, 7, 8].map((i) => chorusNumber(i, 4))).toEqual([1, 1, 2, 2, 3]);
    expect(chorusNumber(31, 32)).toBe(1);
  });

  it("question-réponse : jeu puis silence par blocs de N mesures ; en Fantôme la réponse est jouée", () => {
    expect([0, 1, 2, 3, 4].map((i) => callResponsePhase(i, 2))).toEqual(["question", "question", "silence", "silence", "question"]);
    expect([0, 1, 2].map((i) => callResponsePhase(i, 1, true))).toEqual(["question", "reponse", "question"]);
  });

  it("Fondamentale interdite Prototype : la cible change toutes les 4 mesures, jamais deux fois la même d'affilée", () => {
    const seq = targetSequence(seededRng(4), TARGETS, 200);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    expect(targetAt(seq, 3, 4)).toBe(seq[0]);
    expect(targetAt(seq, 4, 4)).toBe(seq[1]);
  });

  it("Two-feel Prototype : bascules espacées de 4 à 16 mesures, annoncées une mesure avant", () => {
    const sw = switchBars(seededRng(8), [4, 16], 500);
    expect(sw.length).toBeGreaterThan(20);
    sw.forEach((b, i) => {
      const gap = b - (sw[i - 1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(4);
      expect(gap).toBeLessThanOrEqual(16);
    });
    const first = sw[0]!;
    expect(feelAt(sw, first - 1)).toEqual({ feel: "two", upcoming: true });
    expect(feelAt(sw, first).feel).toBe("four");
  });
});

describe("Mémoire vive", () => {
  const st = (prep: boolean, playedIndex: number | null) => ({ prep, playedIndex, chorusBars: 32 });
  it("Récup : visible pendant le décompte et le 1er chorus, cachée ensuite", () => {
    const h = { mode: "after_first_chorus" as const };
    expect(scoreVisible(h, st(false, null))).toBe(true);
    expect(scoreVisible(h, st(false, 31))).toBe(true);
    expect(scoreVisible(h, st(false, 32))).toBe(false);
  });
  it("Street / Corpo : visible seulement pendant la préparation", () => {
    const h = { mode: "preview" as const, seconds: 30 };
    expect(scoreVisible(h, st(true, null))).toBe(true);
    expect(scoreVisible(h, st(false, null))).toBe(false);
  });
  it("Prototype / Fantôme : jamais visible", () => {
    expect(scoreVisible({ mode: "title_only" }, st(true, null))).toBe(false);
  });
  it("sans mod : toujours visible", () => {
    expect(scoreVisible(undefined, st(false, 999))).toBe(true);
  });
});
