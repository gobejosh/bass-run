/**
 * Générateur de séance (logique pure, déterministe).
 *
 * Il remplit l'objectif de temps du jour avec des blocs (un exercice existant, une durée, parfois un
 * morceau du répertoire) en mélangeant, dans cet ordre :
 *   1. l'ouverture (facultative) : premier bloc du jour dans un axe fixé (MAN par défaut) ;
 *   2. les devoirs du prof dont l'échéance approche, au plus une part de la séance ;
 *   3. l'entretien : morceaux sus pas rejoués depuis longtemps ;
 *   4. l'équilibre : les axes en retard sur leur part cible du temps de la semaine passent devant.
 *
 * Ce que le générateur lit : la date, l'objectif, le répertoire, l'historique des blocs (exercice, date,
 * durée, morceau) et, pour la banque de standards inconnus, deux NOMBRES seulement (combien de
 * standards jamais tirés ont une grille, un thème). Il ne lit aucune donnée du jeu et aucun contenu
 * de la banque : son entrée n'a pas de champ pour cela.
 *
 * Aucune dette : seul l'objectif du jour compte. Un jour off ou une journée sans pratique ne reporte rien.
 */
import type { AppConfig } from "./config";
import { EXERCISES, type Axis } from "./exercises";
import { hasGrid, hasPassages, lastPlayedByPiece, maintenanceDue, pieceIdOf, weakestPassage, type BlockTrace, type Piece } from "./repertoire";
import { seededRng, type Rng } from "./rng";
import type { ExerciseId } from "./types";
import { daysBetween, isoDate, weekStartOf } from "./planning";

export const AXES: readonly Axis[] = ["MAN", "WLK", "MOD", "IMP", "RYT", "EAR", "REP", "DEC"];

export type BlockReason =
  | { kind: "ouverture" }
  | { kind: "devoir"; due: string }
  | { kind: "entretien"; days: number | null }
  | { kind: "equilibre"; axis: Axis }
  | { kind: "manuel" };

export interface PlannedBlock {
  id: string;
  exerciseId: ExerciseId;
  minutes: number;
  pieceId?: string;
  passageId?: string;
  reason: BlockReason;
}

export interface SessionPlan {
  date: string;
  /** Objectif du jour (minutes jouées). */
  goalMinutes: number;
  blocks: PlannedBlock[];
  generatedAt: number;
}

/** Compteurs de la banque inconnue : jamais son contenu. */
export interface BankAvailability {
  neverDrawnWithGrid: number;
  neverDrawnWithTheme: number;
}

export interface GeneratorInput {
  date: string;
  goalMinutes: number;
  pieces: readonly Piece[];
  history: readonly BlockTrace[];
  bank: BankAvailability;
  settings: AppConfig["session"];
  /** Variation pour « Régénérer » (0 par défaut : même résultat pour les mêmes données). */
  variant?: number;
  /** Préfixe des identifiants de blocs (tests). */
  idPrefix?: string;
}

/* ------------------------------------------------------------------ outils */

const AXIS_OF = new Map(EXERCISES.map((e) => [e.id, e.axis]));
export const axisOf = (id: ExerciseId): Axis => AXIS_OF.get(id)!;

/** Exercices qui demandent un morceau du répertoire, et ce qu'il doit contenir. */
const PIECE_NEED: Partial<Record<ExerciseId, "grid" | "passages">> = {
  "WLK-02": "grid", "WLK-03": "grid", "IMP-02": "grid", "IMP-03": "grid", "REP-01": "passages",
};
/** Exercices qu'on peut jouer pour un devoir ou un entretien, selon le contenu de la fiche. */
const PIECE_WORK: readonly ExerciseId[] = ["WLK-03", "IMP-03", "REP-01", "WLK-02", "IMP-02"];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const minutesOf = (b: BlockTrace) => Math.max(0, (b.playedSeconds ?? 0) / 60);
const dayOf = (ms: number) => isoDate(new Date(ms));

/** Durées des blocs : autant de blocs pleins que possible, le reste allonge le dernier ou devient un bloc court. */
export function splitMinutes(remaining: number, block: number, min: number): number[] {
  if (remaining < min || block <= 0) return [];
  const n = Math.floor(remaining / block);
  const rest = remaining - n * block;
  if (n === 0) return [remaining];
  const out = Array<number>(n).fill(block);
  if (rest >= min) out.push(rest);
  else out[n - 1]! += rest;
  return out;
}

function usable(id: ExerciseId, pieces: readonly Piece[], bank: BankAvailability, excluded: readonly ExerciseId[], drawStatuses: readonly string[]): boolean {
  if (excluded.includes(id)) return false;
  if (id === "DEC-01") return bank.neverDrawnWithGrid > 0;
  if (id === "DEC-02") return bank.neverDrawnWithTheme > 0;
  const need = PIECE_NEED[id];
  if (!need) return true;
  return pieces.some((p) => drawStatuses.includes(p.status) && (need === "grid" ? hasGrid(p) : hasPassages(p)));
}

/* ------------------------------------------------------------------ générateur */

export function generateSession(input: GeneratorInput): SessionPlan {
  const { date, pieces, history, bank, settings: S } = input;
  const rng: Rng = seededRng(hashSeed(`${date}#${input.variant ?? 0}`));
  const prefix = input.idPrefix ?? `s${date}-${input.variant ?? 0}`;
  let seq = 0;
  const nextId = () => `${prefix}-${++seq}`;

  const done = history.filter((b) => b.status !== "en_cours");
  const today = done.filter((b) => dayOf(b.startedAt) === date);
  const playedToday = Math.round(today.reduce((s, b) => s + minutesOf(b), 0));
  const remaining = Math.max(0, Math.round(input.goalMinutes) - playedToday);
  const durations = splitMinutes(remaining, S.blockMinutes, S.minBlockMinutes);
  const plan: PlannedBlock[] = [];
  if (durations.length === 0) return { date, goalMinutes: input.goalMinutes, blocks: plan, generatedAt: 0 };

  const now = new Date(`${date}T12:00:00`).getTime();
  const lastByPiece = lastPlayedByPiece(done);
  const lastByExercise = new Map<string, number>();
  const lastByPair = new Map<string, number>();
  for (const b of done) {
    lastByExercise.set(b.exerciseId, Math.max(lastByExercise.get(b.exerciseId) ?? 0, b.startedAt));
    const pid = pieceIdOf(b);
    if (pid) lastByPair.set(`${pid}|${b.exerciseId}`, Math.max(lastByPair.get(`${pid}|${b.exerciseId}`) ?? 0, b.startedAt));
  }

  const isUsable = (id: ExerciseId) => usable(id, pieces, bank, S.excludedExercises, S.drawStatuses);
  const piecesInPlan = () => new Set(plan.map((b) => b.pieceId).filter(Boolean));
  const exercisesInPlan = () => new Set(plan.map((b) => b.exerciseId));
  const take = () => durations[plan.length]!;
  const full = () => plan.length >= durations.length;

  /** Exercice pour un morceau précis : le couple (morceau, exercice) le moins récent. */
  const exerciseForPiece = (p: Piece, focus?: ExerciseId[]): ExerciseId | null => {
    const cands = (focus?.length ? focus : PIECE_WORK).filter((id) => {
      if (S.excludedExercises.includes(id)) return false;
      const need = PIECE_NEED[id];
      return need === "grid" ? hasGrid(p) : need === "passages" ? hasPassages(p) : true;
    });
    if (!cands.length) return null;
    const inPlan = exercisesInPlan();
    return [...cands].sort((a, b) =>
      Number(inPlan.has(a)) - Number(inPlan.has(b)) ||
      (lastByPair.get(`${p.id}|${a}`) ?? 0) - (lastByPair.get(`${p.id}|${b}`) ?? 0) ||
      PIECE_WORK.indexOf(a) - PIECE_WORK.indexOf(b))[0]!;
  };

  const pushForPiece = (p: Piece, exerciseId: ExerciseId, reason: BlockReason) => {
    const passage = exerciseId === "REP-01" ? weakestPassage(p) : undefined;
    plan.push({ id: nextId(), exerciseId, minutes: take(), pieceId: p.id, ...(passage ? { passageId: passage.id } : {}), reason });
  };

  /** Morceau pour un exercice qui en demande un : priorité, puis le moins récemment joué. */
  const pieceFor = (id: ExerciseId): Piece | null => {
    const need = PIECE_NEED[id];
    if (!need) return null;
    const inPlan = piecesInPlan();
    const pool = pieces.filter((p) => S.drawStatuses.includes(p.status) && (need === "grid" ? hasGrid(p) : hasPassages(p)));
    if (!pool.length) return null;
    return [...pool].sort((a, b) =>
      Number(inPlan.has(a.id)) - Number(inPlan.has(b.id)) ||
      b.priority - a.priority ||
      (lastByPiece.get(a.id) ?? 0) - (lastByPiece.get(b.id) ?? 0) ||
      a.title.localeCompare(b.title, "fr"))[0]!;
  };

  /** Exercice d'un axe : utilisable, pas encore dans la séance si possible, le moins récent. */
  const exerciseIn = (axis: Axis): ExerciseId | null => {
    const inPlan = exercisesInPlan();
    const cands = EXERCISES.filter((e) => e.axis === axis && isUsable(e.id)).map((e) => e.id);
    if (!cands.length) return null;
    return [...cands].sort((a, b) =>
      Number(inPlan.has(a)) - Number(inPlan.has(b)) ||
      (lastByExercise.get(a) ?? 0) - (lastByExercise.get(b) ?? 0) ||
      rng.next() - 0.5)[0]!;
  };

  const pushExercise = (id: ExerciseId, reason: BlockReason) => {
    const p = pieceFor(id);
    if (PIECE_NEED[id] && !p) return false;
    if (p) pushForPiece(p, id, reason);
    else plan.push({ id: nextId(), exerciseId: id, minutes: take(), reason });
    return true;
  };

  // 1. Ouverture : seulement si rien n'a encore été joué aujourd'hui.
  if (S.openingAxis && playedToday === 0 && (S.axisShares[S.openingAxis] ?? 0) > 0) {
    const id = exerciseIn(S.openingAxis);
    if (id) pushExercise(id, { kind: "ouverture" });
  }

  // 2. Devoirs : échéance aujourd'hui ou dans l'horizon, les plus proches d'abord.
  const homework = pieces
    .filter((p) => p.homework && daysBetween(date, p.homework.due) >= 0 && daysBetween(date, p.homework.due) <= S.homeworkHorizonDays)
    .sort((a, b) => a.homework!.due.localeCompare(b.homework!.due) || b.priority - a.priority || a.title.localeCompare(b.title, "fr"));
  const hwCap = Math.min(
    homework.length * Math.max(1, S.homeworkBlocksPerPiece),
    Math.max(homework.length ? 1 : 0, Math.floor(durations.length * S.homeworkMaxShare)),
  );
  for (let i = 0, added = 0; homework.length && added < hwCap && !full() && i < hwCap * homework.length; i++) {
    const p = homework[i % homework.length]!;
    const ex = exerciseForPiece(p, p.homework!.focus);
    if (!ex) continue;
    pushForPiece(p, ex, { kind: "devoir", due: p.homework!.due });
    added++;
  }

  // 3. Entretien : morceaux sus pas rejoués depuis N jours, les plus anciens d'abord.
  const inPlanNow = piecesInPlan();
  const maintenance = pieces
    .filter((p) => !inPlanNow.has(p.id) && maintenanceDue(p, lastByPiece, now, S.maintenanceAfterDays))
    .sort((a, b) => (lastByPiece.get(a.id) ?? 0) - (lastByPiece.get(b.id) ?? 0) || b.priority - a.priority);
  for (const p of maintenance.slice(0, S.maintenancePerDay)) {
    if (full()) break;
    const ex = exerciseForPiece(p);
    if (!ex) continue;
    const last = lastByPiece.get(p.id);
    pushForPiece(p, ex, { kind: "entretien", days: last === undefined ? null : Math.floor((now - last) / 86_400_000) });
  }

  // 4. Équilibre : retard de chaque axe sur sa part cible du temps de la semaine (proportionnel, sans dette).
  const weekStart = weekStartOf(date);
  const weekDone = done.filter((b) => dayOf(b.startedAt) >= weekStart && dayOf(b.startedAt) <= date);
  const doneByAxis = new Map<Axis, number>(AXES.map((a) => [a, 0]));
  for (const b of weekDone) doneByAxis.set(axisOf(b.exerciseId), doneByAxis.get(axisOf(b.exerciseId))! + minutesOf(b));
  const shareTotal = AXES.reduce((s, a) => s + Math.max(0, S.axisShares[a] ?? 0), 0) || 1;
  const basis = weekDone.reduce((s, b) => s + minutesOf(b), 0) + remaining;

  while (!full()) {
    const planned = new Map<Axis, number>(AXES.map((a) => [a, 0]));
    for (const b of plan) planned.set(axisOf(b.exerciseId), planned.get(axisOf(b.exerciseId))! + b.minutes);
    const ranked = AXES.filter((a) => (S.axisShares[a] ?? 0) > 0)
      .map((a) => {
        const target = (Math.max(0, S.axisShares[a] ?? 0) / shareTotal) * basis;
        const deficit = target - doneByAxis.get(a)! - planned.get(a)!;
        const prio = S.axisPriority[a] ?? 0;
        const weighted = deficit >= 0 ? deficit * (1 + S.priorityWeight * prio) : deficit * (1 - S.priorityWeight * prio);
        return { a, weighted, tie: rng.next() };
      })
      .sort((x, y) => y.weighted - x.weighted || x.tie - y.tie);
    let placed = false;
    for (const { a } of ranked) {
      const id = exerciseIn(a);
      if (id && pushExercise(id, { kind: "equilibre", axis: a })) {
        placed = true;
        break;
      }
    }
    if (!placed) break; // plus rien d'utilisable (axes tous à 0 ou exercices exclus)
  }

  return { date, goalMinutes: input.goalMinutes, blocks: spreadAxes(plan), generatedAt: 0 };
}

/** Évite deux blocs du même axe d'affilée quand c'est possible, sans déplacer l'ouverture. */
function spreadAxes(blocks: PlannedBlock[]): PlannedBlock[] {
  const out = [...blocks];
  for (let i = 1; i < out.length; i++) {
    if (axisOf(out[i]!.exerciseId) !== axisOf(out[i - 1]!.exerciseId)) continue;
    const j = out.findIndex((b, k) => k > i && axisOf(b.exerciseId) !== axisOf(out[i - 1]!.exerciseId) && (k + 1 >= out.length || axisOf(out[k + 1]!.exerciseId) !== axisOf(out[i]!.exerciseId)));
    if (j > i) [out[i], out[j]] = [out[j]!, out[i]!];
  }
  // Les durées restent dans l'ordre d'origine : le bloc court éventuel reste en dernier.
  const minutes = blocks.map((b) => b.minutes);
  return out.map((b, i) => ({ ...b, minutes: minutes[i]! }));
}

/* ------------------------------------------------------------------ retouches avant de commencer */

export function moveBlock(plan: SessionPlan, id: string, delta: -1 | 1): SessionPlan {
  const i = plan.blocks.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= plan.blocks.length) return plan;
  const blocks = [...plan.blocks];
  [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
  return { ...plan, blocks };
}

export function removeBlock(plan: SessionPlan, id: string): SessionPlan {
  return { ...plan, blocks: plan.blocks.filter((b) => b.id !== id) };
}

export function replaceBlock(plan: SessionPlan, id: string, next: Omit<PlannedBlock, "id" | "reason">): SessionPlan {
  return { ...plan, blocks: plan.blocks.map((b) => (b.id === id ? { ...next, id, reason: { kind: "manuel" } } : b)) };
}

export function addBlock(plan: SessionPlan, block: Omit<PlannedBlock, "id" | "reason">, id: string): SessionPlan {
  return { ...plan, blocks: [...plan.blocks, { ...block, id, reason: { kind: "manuel" } }] };
}

/* ------------------------------------------------------------------ suivi : fait / prévu, sans jugement */

export interface DoneBlock extends BlockTrace {
  /** Bloc de séance réalisé (absent : bloc libre). */
  sessionBlockId?: string;
}

export interface DayFollowUp {
  plannedMinutes: number;
  playedMinutes: number;
  /** Blocs prévus réalisés (terminés ou abandonnés avec du temps joué). */
  doneIds: string[];
  /** Blocs joués hors séance ce jour-là. */
  freeBlocks: number;
}

export function followUp(plan: SessionPlan | null, blocks: readonly DoneBlock[], date: string): DayFollowUp {
  const day = blocks.filter((b) => b.status !== "en_cours" && dayOf(b.startedAt) === date);
  const ids = new Set(plan?.blocks.map((b) => b.id) ?? []);
  const doneIds = [...new Set(day.map((b) => b.sessionBlockId).filter((x): x is string => !!x && ids.has(x)))];
  return {
    plannedMinutes: plan ? plan.blocks.reduce((s, b) => s + b.minutes, 0) : 0,
    playedMinutes: Math.round(day.reduce((s, b) => s + minutesOf(b), 0)),
    doneIds,
    freeBlocks: day.filter((b) => !b.sessionBlockId || !ids.has(b.sessionBlockId)).length,
  };
}

/** Part du temps joué par axe sur une période (pour l'écran Planning). */
export function minutesByAxis(blocks: readonly BlockTrace[], from: string, to: string): Record<Axis, number> {
  const out = Object.fromEntries(AXES.map((a) => [a, 0])) as Record<Axis, number>;
  for (const b of blocks) {
    if (b.status === "en_cours") continue;
    const d = dayOf(b.startedAt);
    if (d >= from && d <= to) out[axisOf(b.exerciseId)] += minutesOf(b);
  }
  return out;
}
