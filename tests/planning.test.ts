import { addDays, clearDay, copyWeek, daysBetween, defaultHomeworkDue, nextLesson, resolveDay, resolveWeek, setDay, weekdayOf, weekStartOf, type DayEntry } from "../src/core/planning";

const day = (date: string, o: Partial<DayEntry> = {}): DayEntry => ({ date, kind: "travail", goalMinutes: 120, tags: [], lesson: false, ...o });

describe("planning rempli à la main", () => {
  it("calcule les jours de la semaine du lundi au dimanche", () => {
    expect(weekdayOf("2026-10-26")).toBe(0); // lundi
    expect(weekdayOf("2026-11-01")).toBe(6); // dimanche
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-10-27", "2026-10-29")).toBe(2);
    expect(addDays("2027-03-27", 2)).toBe("2027-03-29"); // passage à l'heure d'été
  });

  it("un jour non rempli est « à définir », sans objectif", () => {
    expect(resolveDay([], "2026-10-27")).toMatchObject({ kind: "a-definir", goalMinutes: 0, tags: [], lesson: false });
  });

  it("chaque jour se remplit indépendamment ; un jour off a un objectif nul", () => {
    let e: DayEntry[] = [];
    e = setDay(e, day("2026-10-27", { goalMinutes: 90 }));
    e = setDay(e, day("2026-10-28", { kind: "off", goalMinutes: 300 }));
    e = setDay(e, day("2026-10-29", { goalMinutes: 45, tags: ["Cours 18 h"], lesson: true }));
    e = setDay(e, day("2026-10-27", { goalMinutes: 150 })); // modifié
    const week = resolveWeek(e, "2026-10-28");
    expect(week.map((d) => d.kind)).toEqual(["a-definir", "travail", "off", "travail", "a-definir", "a-definir", "a-definir"]);
    expect(week.map((d) => d.goalMinutes)).toEqual([0, 150, 0, 45, 0, 0, 0]);
    expect(week[3]).toMatchObject({ tags: ["Cours 18 h"], lesson: true });
    expect(resolveWeek(clearDay(e, "2026-10-27"), "2026-10-27")[1]!.kind).toBe("a-definir");
  });

  it("copie une semaine sur la suivante sans écraser ce qui est déjà rempli", () => {
    const e = [day("2026-10-26", { goalMinutes: 60 }), day("2026-10-28", { kind: "off" }), day("2026-11-04", { goalMinutes: 200 })];
    const copied = copyWeek(e, "2026-10-26", "2026-11-02");
    expect(resolveDay(copied, "2026-11-02").goalMinutes).toBe(60);
    expect(resolveDay(copied, "2026-11-04").goalMinutes).toBe(200);
    expect(resolveDay(copyWeek(e, "2026-10-26", "2026-11-02", true), "2026-11-04").kind).toBe("off");
    expect(resolveDay(copied, "2026-11-03").kind).toBe("a-definir");
  });

  it("propose le prochain cours comme échéance des devoirs, sinon dans 7 jours", () => {
    const e = [day("2026-10-29", { lesson: true }), day("2026-11-05", { lesson: true })];
    expect(nextLesson(e, "2026-10-27")).toBe("2026-10-29");
    expect(defaultHomeworkDue(e, "2026-10-27")).toBe("2026-10-29");
    expect(defaultHomeworkDue(e, "2026-10-29")).toBe("2026-11-05"); // le jour du cours, le devoir vise le suivant
    expect(defaultHomeworkDue([], "2026-10-27")).toBe("2026-11-03");
  });
});
