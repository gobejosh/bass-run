import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG, type AppConfig } from "../src/core/config";
import type { Axis } from "../src/core/exercises";
import { addDays, resolveDay } from "../src/core/planning";
import type { BlockTrace, Piece } from "../src/core/repertoire";
import {
  AXES, axisOf, followUp, generateSession, minutesByAxis, moveBlock, removeBlock, replaceBlock, splitMinutes,
  type BankAvailability, type DoneBlock, type GeneratorInput, type SessionPlan,
} from "../src/core/session";
import type { ExerciseId } from "../src/core/types";

const S: AppConfig["session"] = DEFAULT_CONFIG.session;
const BANK: BankAvailability = { neverDrawnWithGrid: 12, neverDrawnWithTheme: 8 };
const NO_BANK: BankAvailability = { neverDrawnWithGrid: 0, neverDrawnWithTheme: 0 };
const TUE = "2026-10-27"; // un mardi

const at = (date: string, h = 10) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!, h).getTime();
};

function piece(id: string, o: Partial<Piece> = {}): Piece {
  return {
    id, title: `Morceau ${id}`, beatsPerBar: 4, grid: [["Dm7"], ["G7"], ["Cmaj7"], ["Cmaj7"]], passages: [],
    status: "en-cours", priority: 0, homework: null, createdAt: 1, updatedAt: 1, ...o,
  };
}
const withPassages = (id: string, o: Partial<Piece> = {}) =>
  piece(id, { grid: undefined, passages: [{ id: `${id}-a`, label: "A", tier: "en-place" }, { id: `${id}-b`, label: "B", tier: "decouverte" }], ...o });

const REP: Piece[] = [piece("p1"), piece("p2"), withPassages("m1"), piece("p3", { status: "su" })];
/** Sans morceau su : pas d'entretien qui viendrait se mêler aux tests d'équilibre. */
const REP_NO_SU = REP.filter((p) => p.status !== "su");

let hour = 0;
function block(exerciseId: ExerciseId, date: string, minutes: number, o: Partial<DoneBlock> = {}): DoneBlock {
  return { exerciseId, startedAt: at(date, 8 + (hour++ % 12)), status: "termine", playedSeconds: minutes * 60, draws: {}, ...o };
}

const input = (o: Partial<GeneratorInput> = {}): GeneratorInput => ({
  date: TUE, goalMinutes: 120, pieces: REP, history: [], bank: BANK, settings: S, ...o,
});
const total = (p: SessionPlan) => p.blocks.reduce((s, b) => s + b.minutes, 0);

describe("générateur de séance : objectif de temps", () => {
  it("découpe le temps en blocs sans rien perdre ni ajouter", () => {
    expect(splitMinutes(120, 25, 10)).toEqual([25, 25, 25, 25, 20]);
    expect(splitMinutes(105, 25, 10)).toEqual([25, 25, 25, 30]);
    expect(splitMinutes(15, 25, 10)).toEqual([15]);
    expect(splitMinutes(8, 25, 10)).toEqual([]);
  });

  it.each([0, 5, 10, 25, 37, 50, 60, 90, 120, 135, 180, 240])("objectif %i min : la séance fait exactement l'objectif", (goal) => {
    const plan = generateSession(input({ goalMinutes: goal }));
    expect(total(plan)).toBe(goal >= S.minBlockMinutes ? goal : 0);
    for (const b of plan.blocks) {
      expect(b.minutes).toBeGreaterThanOrEqual(S.minBlockMinutes);
      expect(b.minutes).toBeLessThan(S.blockMinutes + S.minBlockMinutes);
    }
  });

  it("une séance régénérée en cours de journée complète seulement ce qui reste", () => {
    const history = [block("MAN-01", TUE, 25), block("WLK-01", TUE, 15)];
    const plan = generateSession(input({ goalMinutes: 120, history }));
    expect(total(plan)).toBe(80);
    expect(plan.blocks.some((b) => b.reason.kind === "ouverture")).toBe(false);
  });

  it("objectif déjà atteint : aucun bloc, aucune remarque", () => {
    const plan = generateSession(input({ goalMinutes: 60, history: [block("WLK-01", TUE, 75)] }));
    expect(plan.blocks).toEqual([]);
  });

  it("est déterministe ; « Régénérer » peut varier", () => {
    expect(generateSession(input())).toEqual(generateSession(input()));
    const variants = new Set(Array.from({ length: 6 }, (_, v) => JSON.stringify(generateSession(input({ variant: v })).blocks.map((b) => b.exerciseId))));
    expect(variants.size).toBeGreaterThan(1);
  });
});

describe("générateur de séance : priorités", () => {
  it("l'ouverture du jour est dans l'axe choisi, seulement au premier bloc", () => {
    const plan = generateSession(input());
    expect(plan.blocks[0]!.reason.kind).toBe("ouverture");
    expect(axisOf(plan.blocks[0]!.exerciseId)).toBe("MAN");
    const none = generateSession(input({ settings: { ...S, openingAxis: null } }));
    expect(none.blocks.some((b) => b.reason.kind === "ouverture")).toBe(false);
  });

  it("un devoir dont l'échéance approche passe devant, sur le bon morceau", () => {
    const pieces = [...REP, piece("hw", { homework: { due: addDays(TUE, 2) } })];
    const plan = generateSession(input({ pieces, settings: { ...S, openingAxis: null } }));
    expect(plan.blocks[0]!.reason).toEqual({ kind: "devoir", due: addDays(TUE, 2) });
    expect(plan.blocks[0]!.pieceId).toBe("hw");
    expect(["WLK-03", "IMP-03", "WLK-02", "IMP-02"]).toContain(plan.blocks[0]!.exerciseId);
  });

  it("le devoir le plus proche d'abord ; un devoir lointain ou passé n'entre pas", () => {
    const pieces = [
      ...REP,
      piece("loin", { homework: { due: addDays(TUE, 20) } }),
      piece("passe", { homework: { due: addDays(TUE, -1) } }),
      piece("jeudi", { homework: { due: addDays(TUE, 2) } }),
      piece("demain", { homework: { due: addDays(TUE, 1) } }),
    ];
    const plan = generateSession(input({ pieces, settings: { ...S, openingAxis: null } }));
    const hw = plan.blocks.filter((b) => b.reason.kind === "devoir").map((b) => b.pieceId);
    expect(hw[0]).toBe("demain");
    expect(hw).toContain("jeudi");
    expect(hw).not.toContain("loin");
    expect(hw).not.toContain("passe");
  });

  it("les devoirs prennent au plus la part réglée de la séance, et au moins un bloc", () => {
    const pieces = [...REP, ...["a", "b", "c", "d", "e"].map((x) => piece(x, { homework: { due: addDays(TUE, 1) } }))];
    const plan = generateSession(input({ pieces, goalMinutes: 125 })); // 5 blocs
    const hw = plan.blocks.filter((b) => b.reason.kind === "devoir");
    expect(hw.length).toBe(Math.floor(5 * S.homeworkMaxShare));
    const tiny = generateSession(input({ pieces, goalMinutes: 25, settings: { ...S, openingAxis: null } }));
    expect(tiny.blocks.map((b) => b.reason.kind)).toEqual(["devoir"]);
  });

  it("un seul devoir n'occupe qu'un bloc par séance par défaut (réglable)", () => {
    const pieces = [...REP, piece("hw", { homework: { due: addDays(TUE, 1) } })];
    const count = (n: number) => generateSession(input({ pieces, settings: { ...S, homeworkBlocksPerPiece: n } })).blocks.filter((b) => b.reason.kind === "devoir").length;
    expect(count(1)).toBe(1);
    expect(count(2)).toBe(2);
  });

  it("un devoir peut viser des exercices précis ; REP-01 prend le passage le moins avancé", () => {
    const pieces = [...REP, withPassages("mel", { homework: { due: addDays(TUE, 1), focus: ["REP-01"] } })];
    const plan = generateSession(input({ pieces, settings: { ...S, openingAxis: null } }));
    expect(plan.blocks[0]).toMatchObject({ exerciseId: "REP-01", pieceId: "mel", passageId: "mel-b" });
  });

  it("entretien : un morceau su pas rejoué depuis longtemps revient, un morceau rejoué récemment non", () => {
    const old = block("WLK-03", addDays(TUE, -30), 25, { draws: { standardId: "p3" } });
    const plan = generateSession(input({ history: [old] }));
    expect(plan.blocks.find((b) => b.reason.kind === "entretien")).toMatchObject({ pieceId: "p3", reason: { kind: "entretien", days: 30 } });
    const recent = block("WLK-03", addDays(TUE, -3), 25, { draws: { standardId: "p3" } });
    expect(generateSession(input({ history: [recent] })).blocks.some((b) => b.reason.kind === "entretien")).toBe(false);
  });

  it("la priorité d'un axe le fait passer devant à retard égal", () => {
    const flat = { ...S, openingAxis: null, axisShares: { MAN: 1, WLK: 1, MOD: 1, IMP: 1, RYT: 1, EAR: 1, REP: 1, DEC: 1 } };
    for (const axis of ["RYT", "EAR", "MOD"] as Axis[]) {
      const plan = generateSession(input({ pieces: REP_NO_SU, goalMinutes: 25, settings: { ...flat, axisPriority: { [axis]: 1 } } }));
      expect(axisOf(plan.blocks[0]!.exerciseId)).toBe(axis);
    }
  });

  it("la priorité d'un morceau le fait choisir pour les exercices sur grille", () => {
    const pieces = [piece("a"), piece("b", { priority: 1 }), piece("c")];
    const only = { ...S, openingAxis: null, axisShares: { MAN: 0, WLK: 1, MOD: 0, IMP: 0, RYT: 0, EAR: 0, REP: 0, DEC: 0 } };
    const plan = generateSession(input({ pieces, goalMinutes: 25, settings: only }));
    expect(plan.blocks[0]!.pieceId ?? "b").toBe("b");
  });
});

describe("générateur de séance : équilibre entre axes", () => {
  it("les axes en retard passent devant", () => {
    const history = [block("WLK-01", "2026-10-26", 200), block("REP-01", "2026-10-26", 100)];
    const plan = generateSession(input({ pieces: REP_NO_SU, history, goalMinutes: 100, settings: { ...S, openingAxis: null } }));
    const axes = plan.blocks.map((b) => axisOf(b.exerciseId));
    expect(axes).not.toContain("WLK");
    expect(axes).not.toContain("REP");
  });

  it("sur une semaine jouée telle que générée, chaque axe approche sa part cible", () => {
    const history: BlockTrace[] = [];
    const monday = "2026-10-26";
    for (let d = 0; d < 7; d++) {
      const date = addDays(monday, d);
      const plan = generateSession(input({ date, goalMinutes: 180, history }));
      plan.blocks.forEach((b, i) => history.push({ exerciseId: b.exerciseId, startedAt: at(date, 8 + i), status: "termine", playedSeconds: b.minutes * 60, draws: b.pieceId ? { pieceId: b.pieceId } : {} }));
    }
    const mins = minutesByAxis(history, monday, addDays(monday, 6));
    const sum = Object.values(mins).reduce((s, x) => s + x, 0);
    const shareTotal = AXES.reduce((s, a) => s + S.axisShares[a], 0);
    for (const a of AXES) expect(Math.abs(mins[a] / sum - S.axisShares[a] / shareTotal), a).toBeLessThan(0.05);
  });

  it("un axe à part nulle ou un exercice exclu n'est jamais proposé", () => {
    const settings = { ...S, axisShares: { ...S.axisShares, EAR: 0 }, excludedExercises: ["RYT-01"] as ExerciseId[] };
    for (let v = 0; v < 10; v++) {
      const plan = generateSession(input({ goalMinutes: 240, settings, variant: v }));
      expect(plan.blocks.map((b) => b.exerciseId)).not.toContain("EAR-01");
      expect(plan.blocks.map((b) => b.exerciseId)).not.toContain("RYT-01");
    }
  });

  it("n'attache un morceau qu'aux exercices qui en demandent, avec le bon contenu", () => {
    for (let v = 0; v < 10; v++) {
      for (const b of generateSession(input({ goalMinutes: 240, variant: v })).blocks) {
        const p = REP.find((x) => x.id === b.pieceId);
        if (b.exerciseId === "REP-01") expect(p?.passages.length).toBeGreaterThan(0);
        else if (["WLK-02", "WLK-03", "IMP-02", "IMP-03"].includes(b.exerciseId)) expect(p?.grid?.length).toBeGreaterThan(0);
        else expect(b.pieceId).toBeUndefined();
      }
    }
  });
});

describe("générateur de séance : séparations", () => {
  it("ne lit aucune donnée du jeu ni du stockage : ses imports restent dans la logique musicale pure", () => {
    for (const f of ["session", "planning", "repertoire"]) {
      const src = readFileSync(resolve(__dirname, `../src/core/${f}.ts`), "utf8");
      const specs = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
      for (const s of specs) {
        expect(s.startsWith("./"), `${f} importe ${s}`).toBe(true);
        expect(s, `${f} importe ${s}`).not.toMatch(/game|integration|storage|ui|events/);
      }
    }
  });

  it("son entrée n'a pas de place pour le jeu ni le contenu de la banque inconnue", () => {
    const keys: (keyof GeneratorInput)[] = ["date", "goalMinutes", "pieces", "history", "bank", "settings", "variant", "idPrefix"];
    const bankKeys: (keyof BankAvailability)[] = ["neverDrawnWithGrid", "neverDrawnWithTheme"];
    expect(keys).toHaveLength(8);
    expect(bankKeys).toHaveLength(2);
  });

  it("banque inconnue : DEC n'est proposé que si elle a des standards jamais tirés, sans rien en citer", () => {
    const withBank = Array.from({ length: 8 }, (_, v) => generateSession(input({ goalMinutes: 300, variant: v })));
    const decs = withBank.flatMap((p) => p.blocks).filter((b) => b.exerciseId.startsWith("DEC"));
    expect(decs.length).toBeGreaterThan(0);
    for (const b of decs) {
      expect(b.pieceId).toBeUndefined();
      expect(Object.keys(b).sort()).toEqual(["exerciseId", "id", "minutes", "reason"]);
    }
    for (let v = 0; v < 8; v++) {
      const plan = generateSession(input({ goalMinutes: 300, bank: NO_BANK, variant: v }));
      expect(plan.blocks.some((b) => b.exerciseId.startsWith("DEC"))).toBe(false);
    }
    const onlyGrid = generateSession(input({ goalMinutes: 600, bank: { neverDrawnWithGrid: 3, neverDrawnWithTheme: 0 } }));
    expect(onlyGrid.blocks.map((b) => b.exerciseId)).not.toContain("DEC-02");
  });

  it("la séance ne contient aucun titre : seulement des identifiants de morceaux du répertoire", () => {
    const pieces = REP.map((p) => ({ ...p, title: `TITRE-SECRET-${p.id}` }));
    const json = JSON.stringify(generateSession(input({ pieces, goalMinutes: 300 })));
    expect(json).not.toContain("TITRE-SECRET");
  });
});

describe("planning : jours off et jours manqués sans conséquence", () => {
  it("un jour « à définir » n'a pas de séance tant que tu ne l'as pas rempli", () => {
    const d = resolveDay([], TUE);
    expect(generateSession(input({ date: d.date, goalMinutes: d.goalMinutes })).blocks).toEqual([]);
  });

  it("un jour off a un objectif nul et une séance vide", () => {
    const wed = resolveDay([{ date: "2026-10-28", kind: "off", goalMinutes: 120, tags: [], lesson: false }], "2026-10-28");
    expect(wed).toMatchObject({ kind: "off", goalMinutes: 0 });
    expect(generateSession(input({ date: wed.date, goalMinutes: wed.goalMinutes })).blocks).toEqual([]);
  });

  it("le lendemain d'un jour off, ou d'un jour prévu mais non joué, la séance est la même et ne fait que l'objectif du jour", () => {
    const thu = "2026-10-29";
    const before = [block("WLK-03", "2026-10-26", 50, { draws: { standardId: "p1" } }), block("MAN-01", "2026-10-27", 60)];
    const afterOff = generateSession(input({ date: thu, goalMinutes: 120, history: before }));
    const afterMissed = generateSession(input({ date: thu, goalMinutes: 120, history: before }));
    expect(afterMissed).toEqual(afterOff);
    expect(total(afterOff)).toBe(120);
  });

  it("une semaine sans aucune pratique ne gonfle pas la séance suivante", () => {
    const lastWeek = [block("WLK-01", "2026-10-20", 60)];
    const plan = generateSession(input({ date: "2026-10-26", goalMinutes: 90, history: lastWeek }));
    expect(total(plan)).toBe(90);
  });

  it("le suivi compare sans jugement : minutes prévues, jouées, blocs faits et blocs libres", () => {
    const plan = generateSession(input({ goalMinutes: 75, idPrefix: "x" }));
    const blocks: DoneBlock[] = [
      block(plan.blocks[0]!.exerciseId, TUE, 25, { sessionBlockId: plan.blocks[0]!.id }),
      block("EAR-01", TUE, 10),
    ];
    const f = followUp(plan, blocks, TUE);
    expect(f).toEqual({ plannedMinutes: 75, playedMinutes: 35, doneIds: [plan.blocks[0]!.id], freeBlocks: 1 });
    expect(Object.keys(f).sort()).toEqual(["doneIds", "freeBlocks", "plannedMinutes", "playedMinutes"]);
  });
});

describe("retouches avant de commencer", () => {
  it("déplacer, supprimer, remplacer un bloc", () => {
    const plan = generateSession(input({ goalMinutes: 75, idPrefix: "r" }));
    const [a, b, c] = plan.blocks;
    expect(moveBlock(plan, b!.id, -1).blocks.map((x) => x.id)).toEqual([b!.id, a!.id, c!.id]);
    expect(moveBlock(plan, a!.id, -1)).toBe(plan);
    expect(removeBlock(plan, b!.id).blocks.map((x) => x.id)).toEqual([a!.id, c!.id]);
    const r = replaceBlock(plan, c!.id, { exerciseId: "EAR-01", minutes: 15 });
    expect(r.blocks[2]).toEqual({ id: c!.id, exerciseId: "EAR-01", minutes: 15, reason: { kind: "manuel" } });
  });
});
