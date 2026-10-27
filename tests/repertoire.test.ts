import type { Melody, Standard } from "../src/core/library";
import { aliasMap, lastPlayedByPiece, maintenanceDue, migrateLegacyLibrary, pieceIdOf, weakestPassage, type BlockTrace } from "../src/core/repertoire";

const std = (id: string, title: string): Standard => ({ id, title, key: { tonic: "Sol", minor: true }, beatsPerBar: 4, grid: [["Cm7"], ["F7"]], createdAt: 10 });
const mel = (id: string, title: string): Melody => ({
  id, title, beatsPerBar: 3, scoreBlobId: `blob-${id}`, createdAt: 20,
  passages: [{ id: `${id}-p1`, label: "A", fromBar: 1, toBar: 8, targetBpm: 140, tier: "fiable" }, { id: `${id}-p2`, label: "B", tier: "decouverte" }],
});

describe("migration vers le répertoire (pure)", () => {
  it("sans fusion : chaque standard et chaque mélodie devient un morceau, sans rien perdre", () => {
    const standards = [std("s1", "Autumn Leaves"), std("s2", "Solar")];
    const melodies = [mel("m1", "Autumn leaves"), mel("m2", "Donna Lee")];
    const r = migrateLegacyLibrary(standards, melodies, { mergeSameTitle: false, now: 99 });
    expect(r.pieces.map((p) => p.id)).toEqual(["s1", "s2", "m1", "m2"]);
    expect(r.tempoKeyRenames).toEqual([]);
    const s1 = r.pieces[0]!;
    expect(s1).toMatchObject({ title: "Autumn Leaves", key: standards[0]!.key, beatsPerBar: 4, grid: standards[0]!.grid, status: "en-cours", passages: [], createdAt: 10 });
    const m1 = r.pieces[2]!;
    expect(m1).toMatchObject({ title: "Autumn leaves", beatsPerBar: 3, scoreBlobId: "blob-m1", passages: melodies[0]!.passages, status: "en-cours", createdAt: 20 });
    expect(m1.grid).toBeUndefined();
  });

  it("avec fusion : une mélodie de même titre rejoint son standard, et ses tempos REP-01 suivent", () => {
    const r = migrateLegacyLibrary([std("s1", "Autumn Leaves"), std("s2", "Solar")], [mel("m1", "  autumn LEAVES "), mel("m2", "Donna Lee")], { mergeSameTitle: true });
    expect(r.pieces.map((p) => p.id)).toEqual(["s1", "s2", "m2"]);
    const s1 = r.pieces[0]!;
    expect(s1.grid).toEqual([["Cm7"], ["F7"]]);
    expect(s1.scoreBlobId).toBe("blob-m1");
    expect(s1.passages.map((p) => p.id)).toEqual(["m1-p1", "m1-p2"]);
    expect(s1.legacyIds).toEqual(["m1"]);
    expect(r.mergedMelodies).toEqual([["m1", "s1"]]);
    expect(r.tempoKeyRenames).toEqual([["REP-01:m1:m1-p1", "REP-01:s1:m1-p1"], ["REP-01:m1:m1-p2", "REP-01:s1:m1-p2"]]);
  });

  it("ne fusionne pas quand deux standards portent le même titre", () => {
    const r = migrateLegacyLibrary([std("s1", "Blues"), std("s2", "Blues")], [mel("m1", "Blues")], { mergeSameTitle: true });
    expect(r.pieces).toHaveLength(3);
  });
});

describe("dernier jeu et entretien", () => {
  const b = (draws: Record<string, unknown>, startedAt: number, playedSeconds = 600): BlockTrace => ({ exerciseId: "WLK-03", startedAt, status: "termine", playedSeconds, draws });

  it("reconnaît le morceau d'un bloc, ancien ou nouveau format", () => {
    expect(pieceIdOf(b({ standardId: "s1" }, 1))).toBe("s1");
    expect(pieceIdOf(b({ melodyId: "m1" }, 1))).toBe("m1");
    expect(pieceIdOf(b({ pieceId: "p1", standardId: "x" }, 1))).toBe("p1");
    expect(pieceIdOf(b({}, 1))).toBeUndefined();
  });

  it("suit les anciens identifiants d'une mélodie fusionnée et ignore les blocs de moins d'une minute", () => {
    const last = lastPlayedByPiece([b({ melodyId: "m1" }, 500), b({ standardId: "s1" }, 300), b({ standardId: "s1" }, 900, 30)], aliasMap([{ id: "s1", legacyIds: ["m1"] }]));
    expect(last.get("s1")).toBe(500);
  });

  it("« à entretenir » : su, et pas joué depuis N jours", () => {
    const now = 100 * 86_400_000;
    const last = new Map([["a", now - 30 * 86_400_000], ["b", now - 3 * 86_400_000]]);
    expect(maintenanceDue({ id: "a", status: "su" }, last, now, 21)).toBe(true);
    expect(maintenanceDue({ id: "b", status: "su" }, last, now, 21)).toBe(false);
    expect(maintenanceDue({ id: "c", status: "su" }, last, now, 21)).toBe(true);
    expect(maintenanceDue({ id: "a", status: "en-cours" }, last, now, 21)).toBe(false);
  });

  it("passage le moins avancé", () => {
    expect(weakestPassage({ passages: mel("m", "x").passages })?.id).toBe("m-p2");
  });
});
