import { drawChord, drawFunction, drawPalette, enabledQualities, nextPitch, spellForMan01, stringSequence } from "../src/core/draw";
import { DEFAULT_CONFIG as cfg } from "../src/core/config";
import { seededRng } from "../src/core/rng";
import { chordName, chordTones, functionLabel, functionNote, parseChord, transposeChord } from "../src/core/theory/chords";
import { DEFAULT_DICTIONARIES as dicts, DEFAULT_MODES } from "../src/core/theory/dictionaries";
import { drawAnyKey, drawKeyAtDistance, fifthsOf, intervalBetween, tonicFromFifths } from "../src/core/theory/keys";
import { noteName, parseNote, pcOf, type SpelledNote } from "../src/core/theory/notes";
import { modeNotes, tonicSpellings, upFourth } from "../src/core/theory/scales";

const n = (s: string): SpelledNote => parseNote(s)!.note;
const names = (xs: SpelledNote[]) => xs.map((x) => noteName(x)).join(" ");
const mode = (id: string) => DEFAULT_MODES.find((m) => m.id === id)!;
const q = (id: string) => dicts.qualities.find((x) => x.id === id)!;

describe("notes", () => {
  it("analyse les noms français et anglais", () => {
    expect(n("Do")).toEqual({ letter: 0, alter: 0 });
    expect(n("Mib")).toEqual({ letter: 2, alter: -1 });
    expect(n("Fa#")).toEqual({ letter: 3, alter: 1 });
    expect(n("Bb")).toEqual({ letter: 6, alter: -1 });
    expect(n("Ré")).toEqual({ letter: 1, alter: 0 });
    expect(noteName(n("Sib"))).toBe("Si♭");
    expect(noteName(n("C##"), "en")).toBe("C𝄪");
  });
});

describe("modes", () => {
  it("orthographie une lettre par degré", () => {
    expect(names(modeNotes(n("Ré"), mode("dorien")))).toBe("Ré Mi Fa Sol La Si Do");
    expect(names(modeNotes(n("Fa"), mode("lydien")))).toBe("Fa Sol La Si Do Ré Mi");
    expect(names(modeNotes(n("Mib"), mode("ionien")))).toBe("Mi♭ Fa Sol La♭ Si♭ Do Ré");
    expect(names(modeNotes(n("Sol"), mode("altere")))).toBe("Sol La♭ Si♭ Do♭ Ré♭ Mi♭ Fa");
    expect(names(modeNotes(n("Si"), mode("ultralocrien")))).toBe("Si Do Ré Mi♭ Fa Sol La♭");
  });

  it("21 modes : 7 par famille", () => {
    expect(DEFAULT_MODES).toHaveLength(21);
    expect(DEFAULT_MODES.filter((m) => m.family === "majeur").map((m) => m.intervals)).toContainEqual([0, 2, 3, 5, 7, 9, 10]);
  });

  it("choisit l'orthographe de tonique la plus lisible", () => {
    // Do♯ ionien = 7 dièses, Ré♭ ionien = 5 bémols → Ré♭
    expect(tonicSpellings(1, mode("ionien")).map((t) => noteName(t))).toEqual(["Ré♭"]);
    // Fa♯ / Sol♭ ionien : 6 de chaque côté → les deux
    expect(tonicSpellings(6, mode("ionien")).map((t) => noteName(t)).sort()).toEqual(["Fa♯", "Sol♭"]);
    // Aucune tonique tirée ne produit de double altération pour les modes de la gamme majeure
    for (const m of DEFAULT_MODES.filter((x) => x.family === "majeur")) {
      for (let pc = 0; pc < 12; pc++) {
        for (const t of tonicSpellings(pc, m)) expect(modeNotes(t, m).every((x) => Math.abs(x.alter) <= 1), `${m.id} ${pc}`).toBe(true);
      }
    }
  });

  it("monte d'une quarte en restant lisible", () => {
    let t = n("Do");
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(noteName(t));
      t = upFourth(t);
    }
    expect(seen).toEqual(["Do", "Fa", "Si♭", "Mi♭", "La♭", "Ré♭", "Sol♭", "Si", "Mi", "La", "Ré", "Sol"]);
  });
});

describe("accords", () => {
  it("analyse les symboles de grille courants", () => {
    const cases: [string, string | null][] = [
      ["Dm7", "m7"], ["D-7", "m7"], ["Ré m7", "m7"], ["G7", "7"], ["Cmaj7", "maj7"], ["CΔ", "maj7"], ["C6", "6"],
      ["Bø", "m7b5"], ["Bm7b5", "m7b5"], ["F#dim7", "dim7"], ["Cm(maj7)", "mMaj7"], ["G7alt", "7alt"], ["G7b9", "7b9"],
      ["Bb7#11", "7#11"], ["D9", "7"], ["Fm6", "m6"], ["C", "maj"], ["Cm", "m"], ["G7sus4", "7sus4"], ["C6/9", "6"], ["Xyz", null],
    ];
    for (const [s, qq] of cases) {
      const c = parseChord(s);
      if (qq === null) expect(c, s).toBeNull();
      else expect(c?.quality, s).toBe(qq);
    }
    expect(parseChord("C7/E")?.bass).toEqual({ letter: 2, alter: 0 });
    expect(parseChord("Ebmaj7")?.root).toEqual({ letter: 2, alter: -1 });
  });

  it("affiche en notation française ou anglaise", () => {
    expect(chordName(parseChord("Bbmaj7")!, dicts.qualities)).toBe("Si♭ maj7");
    expect(chordName(parseChord("Bbmaj7")!, dicts.qualities, "en")).toBe("B♭maj7");
    expect(chordName(parseChord("Bø")!, dicts.qualities)).toBe("Si m7♭5");
  });

  it("orthographie les notes de l'accord", () => {
    expect(names(chordTones(n("Ré"), q("m7")))).toBe("Ré Fa La Do");
    expect(names(chordTones(n("Mib"), q("7")))).toBe("Mi♭ Sol Si♭ Ré♭");
    expect(names(chordTones(n("Do#"), q("dim7")))).toBe("Do♯ Mi Sol Si♭");
    expect(names(chordTones(n("Fa"), q("m7b5")))).toBe("Fa La♭ Do♭ Mi♭");
  });

  it("fonctions et extensions (MAN-03)", () => {
    expect(noteName(functionNote(n("Sol"), q("7"), "septième"))).toBe("Fa");
    expect(noteName(functionNote(n("Do"), q("6"), "septième"))).toBe("La");
    expect(functionLabel("septième", q("6"))).toBe("sixte");
    expect(functionLabel("tierce", q("7sus4"))).toBe("quarte");
    expect(noteName(functionNote(n("Sol"), q("7"), "b9"))).toBe("La♭");
    expect(noteName(functionNote(n("Sol"), q("7"), "#11"))).toBe("Do♯");
    expect(noteName(functionNote(n("Sol"), q("7"), "b13"))).toBe("Mi♭");
    expect(noteName(functionNote(n("Ré"), q("m7"), "11"))).toBe("Sol");
  });

  it("transpose en gardant une orthographe logique", () => {
    const c = parseChord("Dm7")!;
    expect(chordName(transposeChord(c, 2, 3), dicts.qualities)).toBe("Fa m7"); // tierce mineure
    expect(chordName(transposeChord(parseChord("G7")!, 1, 1), dicts.qualities)).toBe("La♭ 7");
  });
});

describe("tonalités", () => {
  it("cycle des quintes", () => {
    expect(fifthsOf(n("Do"), false)).toBe(0);
    expect(fifthsOf(n("Mib"), false)).toBe(-3);
    expect(fifthsOf(n("Fa#"), false)).toBe(6);
    expect(fifthsOf(n("La"), true)).toBe(0);
    expect(fifthsOf(n("Do"), true)).toBe(-3);
    for (let f = -7; f <= 7; f++) {
      expect(fifthsOf(tonicFromFifths(f, false), false)).toBe(f);
      expect(fifthsOf(tonicFromFifths(f, true), true)).toBe(f);
    }
  });

  it("tire une tonalité à la bonne distance", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 200; i++) {
      const from = rng.int(13) - 6;
      const to = drawKeyAtDistance(rng, from, 3, 4);
      expect(Math.abs(to - from)).toBeGreaterThanOrEqual(3);
      expect(Math.abs(to - from)).toBeLessThanOrEqual(4);
      expect(Math.abs(to)).toBeLessThanOrEqual(6);
      expect(drawAnyKey(rng, from)).not.toBe(from);
    }
  });

  it("intervalle entre toniques", () => {
    expect(intervalBetween(n("Do"), n("Mib"))).toEqual({ letters: 2, semis: 3 });
    expect(intervalBetween(n("La"), n("Do"))).toEqual({ letters: 2, semis: 3 });
  });
});

describe("tirages", () => {
  it("MAN-01 : jamais deux fois la même hauteur de suite", () => {
    const rng = seededRng(1);
    let prev: number | undefined;
    for (let i = 0; i < 500; i++) {
      const p = nextPitch(rng, prev);
      expect(p).not.toBe(prev);
      prev = p;
    }
  });

  it("Enharmonie : chaque orthographe désigne la bonne hauteur", () => {
    const rng = seededRng(2);
    for (const sp of [undefined, "alternate", "flats", "edge", "double_rare", "double_frequent"] as const) {
      for (let i = 0; i < 300; i++) {
        const pc = rng.int(12);
        expect(pcOf(spellForMan01(rng, pc, sp, i)), `${sp} ${pc}`).toBe(pc);
      }
    }
  });

  it("Enharmonie : bémols seuls, alternance, cas limites, doubles altérations", () => {
    const rng = seededRng(5);
    expect(noteName(spellForMan01(rng, 1, "flats", 0))).toBe("Ré♭");
    expect(noteName(spellForMan01(rng, 1, "alternate", 0))).toBe("Do♯");
    expect(noteName(spellForMan01(rng, 1, "alternate", 1))).toBe("Ré♭");
    const edges = new Set(Array.from({ length: 200 }, () => noteName(spellForMan01(rng, 5, "edge", 0))));
    expect(edges).toEqual(new Set(["Fa", "Mi♯"]));
    const doubles = Array.from({ length: 400 }, () => spellForMan01(rng, 2, "double_frequent", 0)).filter((s) => Math.abs(s.alter) === 2);
    expect(doubles.length).toBeGreaterThan(150);
    expect(doubles.length).toBeLessThan(250);
  });

  it("ordre des cordes", () => {
    const s = cfg.instrument.strings.map((x) => x.name);
    expect(stringSequence(seededRng(1), "grave-aigu", s)).toEqual(["Si", "Mi", "La", "Ré", "Sol"]);
    expect(stringSequence(seededRng(1), "aigu-grave", s)).toEqual(["Sol", "Ré", "La", "Mi", "Si"]);
    expect([...stringSequence(seededRng(1), "aleatoire", s)].sort()).toEqual([...s].sort());
  });

  it("accords tirés parmi les qualités activées, avec des fondamentales lisibles", () => {
    const rng = seededRng(7);
    const qs = enabledQualities(dicts, cfg.chords.enabledQualities);
    expect(qs.map((x) => x.id).sort()).toEqual([...cfg.chords.enabledQualities].sort());
    for (let i = 0; i < 300; i++) {
      const c = drawChord(rng, qs, dicts);
      expect(Math.abs(c.root.alter)).toBeLessThanOrEqual(1);
    }
  });

  it("fonctions : de base sans mod, extensions du niveau avec Extensions", () => {
    const rng = seededRng(9);
    for (let i = 0; i < 100; i++) {
      expect(["fondamentale", "tierce", "quinte", "septième"]).toContain(drawFunction(rng));
      expect(["9", "11"]).toContain(drawFunction(rng, ["9", "11"]));
    }
  });

  it("palette réduite : notes de l'accord d'abord", () => {
    const rng = seededRng(4);
    const chord = { root: n("Ré"), quality: q("m7") };
    const tones = names(chordTones(chord.root, chord.quality)).split(" ");
    for (let size = 1; size <= 4; size++) {
      const p = drawPalette(rng, chord, dicts, size);
      expect(p).toHaveLength(size);
      for (const x of p) expect(tones).toContain(noteName(x));
    }
    const five = drawPalette(rng, chord, dicts, 5).map((x) => noteName(x));
    expect(five.slice(0, 4)).toEqual(tones);
    expect(["Mi", "Sol", "Si"]).toContain(five[4]);
  });
});
