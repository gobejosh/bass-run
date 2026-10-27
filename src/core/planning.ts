/**
 * Planning (logique pure).
 *
 * Les disponibilités varient d'une semaine à l'autre : chaque jour se remplit à la main, jour par jour.
 * Un jour est un jour de travail avec son objectif de temps, un jour off, ou « à définir » tant que tu
 * ne l'as pas rempli. Les contraintes de l'école sont des étiquettes libres sur un jour (« Cours 18 h »),
 * et un jour peut être marqué « cours de basse » : il sert d'échéance par défaut aux devoirs.
 * Pour aller vite : copier une semaine sur une autre.
 *
 * Aucune pression : rien ici ne compte les jours manqués ni ne reporte un objectif d'un jour sur l'autre.
 */

export type DayKind = "travail" | "off";

/** Un jour rempli par toi. */
export interface DayEntry {
  date: string;
  kind: DayKind;
  /** Objectif de temps joué (minutes), pauses exclues. Ignoré un jour off. */
  goalMinutes: number;
  /** Contraintes de l'école ou autres repères (« Cours 18 h », « Orchestre »). */
  tags: string[];
  /** Jour de cours de basse : échéance par défaut des devoirs. */
  lesson: boolean;
}

export interface DayPlan {
  date: string;
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  /** « a-definir » : jour pas encore rempli (aucune séance proposée, rien d'autre). */
  kind: DayKind | "a-definir";
  goalMinutes: number;
  tags: string[];
  lesson: boolean;
}

/** Objectif proposé quand tu passes un jour en « travail ». */
export const DEFAULT_GOAL_MINUTES = 120;

/* ------------------------------------------------------------------ dates locales AAAA-MM-JJ */

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: string, n: number): string {
  const d = parseIsoDate(date);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** 0 = lundi … 6 = dimanche. */
export function weekdayOf(date: string): number {
  return (parseIsoDate(date).getDay() + 6) % 7;
}

export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);
}

/* ------------------------------------------------------------------ résolution */

export function resolveDay(entries: readonly DayEntry[], date: string): DayPlan {
  const e = entries.find((x) => x.date === date);
  const weekday = weekdayOf(date);
  if (!e) return { date, weekday, kind: "a-definir", goalMinutes: 0, tags: [], lesson: false };
  return {
    date,
    weekday,
    kind: e.kind,
    goalMinutes: e.kind === "off" ? 0 : Math.max(0, Math.round(e.goalMinutes)),
    tags: [...e.tags],
    lesson: e.lesson,
  };
}

export function resolveWeek(entries: readonly DayEntry[], anyDateInWeek: string): DayPlan[] {
  const start = weekStartOf(anyDateInWeek);
  return Array.from({ length: 7 }, (_, i) => resolveDay(entries, addDays(start, i)));
}

/** Remplace (ou ajoute) le jour `entry.date`. */
export function setDay(entries: readonly DayEntry[], entry: DayEntry): DayEntry[] {
  return [...entries.filter((e) => e.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date));
}

/** Remet un jour à « à définir ». */
export function clearDay(entries: readonly DayEntry[], date: string): DayEntry[] {
  return entries.filter((e) => e.date !== date);
}

/**
 * Copie les jours remplis d'une semaine sur une autre (même jour de la semaine).
 * Les jours déjà remplis de la semaine cible sont remplacés seulement si `overwrite`.
 */
export function copyWeek(entries: readonly DayEntry[], fromWeek: string, toWeek: string, overwrite = false): DayEntry[] {
  const from = weekStartOf(fromWeek);
  const to = weekStartOf(toWeek);
  let out = [...entries];
  for (let i = 0; i < 7; i++) {
    const src = entries.find((e) => e.date === addDays(from, i));
    const date = addDays(to, i);
    if (!src || (!overwrite && out.some((e) => e.date === date))) continue;
    out = setDay(out, { ...src, tags: [...src.tags], date });
  }
  return out;
}

/** Prochain jour de cours à partir de `from` inclus, ou null. */
export function nextLesson(entries: readonly DayEntry[], from: string): string | null {
  return entries.filter((e) => e.lesson && e.date >= from).map((e) => e.date).sort()[0] ?? null;
}

/** Échéance proposée pour un nouveau devoir : le prochain cours après aujourd'hui, sinon dans 7 jours. */
export function defaultHomeworkDue(entries: readonly DayEntry[], today: string): string {
  return nextLesson(entries, addDays(today, 1)) ?? addDays(today, 7);
}
