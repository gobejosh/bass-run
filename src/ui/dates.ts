/** Affichage des dates et durées, en français. */
import { parseIsoDate } from "../core/planning";

/** « jeu. 29 oct. » */
export function fmtDay(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

/** « mardi 27 octobre » */
export function fmtLongDay(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/** « aujourd'hui », « hier », « il y a 5 j », « jamais joué ». */
export function sinceLabel(at: number | undefined, now: number): string {
  if (at === undefined) return "jamais joué";
  const d = (x: number) => { const t = new Date(x); return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); };
  const days = Math.round((d(now) - d(at)) / 86_400_000);
  return days <= 0 ? "aujourd'hui" : days === 1 ? "hier" : `il y a ${days} j`;
}

/** 95 → « 1 h 35 », 40 → « 40 min ». */
export function fmtMinutes(m: number): string {
  const r = Math.round(m);
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60);
  const rest = r % 60;
  return rest ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
}
