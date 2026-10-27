/**
 * Aujourd'hui : la séance du jour, générée à partir du planning, retouchable avant de commencer.
 * Rien ici ne lit le jeu. Un jour off ou « à définir » n'a aucune conséquence.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../icons";
import { AXIS_LABEL, AXIS_SHORT, EXERCISES, getExercise } from "../../core/exercises";
import { DEFAULT_GOAL_MINUTES, isoDate, resolveDay, weekStartOf, type DayEntry, type DayPlan } from "../../core/planning";
import { hasGrid, hasPassages, type Piece } from "../../core/repertoire";
import {
  addBlock, AXES, followUp, generateSession, minutesByAxis, moveBlock, removeBlock, replaceBlock,
  type DayFollowUp, type PlannedBlock, type SessionPlan,
} from "../../core/session";
import type { BlockRecord, ExerciseId } from "../../core/types";
import { newId } from "../../core/mods/drop";
import { Stepper, Tag } from "../components";
import { useApp } from "../context";
import { fmtDay, fmtLongDay, fmtMinutes } from "../dates";
import { useHotkeys } from "../hotkeys";

/** Ce qu'il faut pour préparer un bloc de la séance. */
export interface LaunchPreset {
  sessionBlockId: string;
  exerciseId: ExerciseId;
  minutes: number;
  pieceId?: string;
  passageId?: string;
  /** « Bloc 3 sur 5 ». */
  position: { index: number; count: number };
}

export function presetFor(plan: SessionPlan, b: PlannedBlock): LaunchPreset {
  return {
    sessionBlockId: b.id, exerciseId: b.exerciseId, minutes: b.minutes,
    ...(b.pieceId ? { pieceId: b.pieceId } : {}), ...(b.passageId ? { passageId: b.passageId } : {}),
    position: { index: plan.blocks.indexOf(b) + 1, count: plan.blocks.length },
  };
}

interface TodayData {
  date: string;
  day: DayPlan;
  plan: SessionPlan | null;
  pieces: Piece[];
  blocks: BlockRecord[];
  follow: DayFollowUp;
}

export function useTodayData() {
  const { repo } = useApp();
  const [data, setData] = useState<TodayData | null>(null);
  const load = useCallback(async () => {
    const date = isoDate(new Date());
    const [entries, plan, pieces, blocks] = await Promise.all([repo.planning(), repo.session(date), repo.pieces(), repo.blocks()]);
    const day = resolveDay(entries, date);
    let p = plan ?? null;
    // Première visite d'un jour de travail : la séance est générée et gardée telle quelle.
    if (!p && day.kind === "travail" && day.goalMinutes > 0) {
      p = { ...generateSession(await repo.generatorInput(date, day.goalMinutes)), generatedAt: Date.now() };
      await repo.saveSession(p);
    }
    setData({ date, day, plan: p, pieces, blocks, follow: followUp(p, blocks, date) });
  }, [repo]);
  useEffect(() => void load(), [load]);
  return { data, reload: load };
}

export function reasonLabel(b: PlannedBlock): string {
  const r = b.reason;
  switch (r.kind) {
    case "ouverture": return "Ouverture du jour";
    case "devoir": return `Devoir · ${fmtDay(r.due)}`;
    case "entretien": return r.days === null ? "Entretien · jamais joué" : `Entretien · pas joué depuis ${r.days} j`;
    case "equilibre": return `Équilibre · ${AXIS_LABEL[r.axis].toLowerCase()}`;
    default: return "Ajouté à la main";
  }
}

export function blockTitle(b: Pick<PlannedBlock, "exerciseId" | "pieceId" | "passageId">, pieces: readonly Piece[]): string {
  const ex = getExercise(b.exerciseId);
  const p = pieces.find((x) => x.id === b.pieceId);
  if (!p) return ex.id.startsWith("DEC") ? `${ex.name} · standard tiré au lancement` : ex.name;
  const passage = p.passages.find((x) => x.id === b.passageId);
  return `${p.title}${passage ? ` · ${passage.label}` : ""}`;
}

export function TodayScreen({ onLaunch, onFree }: { onLaunch: (p: LaunchPreset) => void; onFree: () => void }) {
  const { repo, cfg } = useApp();
  const { data, reload } = useTodayData();
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<{ replace?: string } | null>(null);
  const [goalDraft, setGoalDraft] = useState(DEFAULT_GOAL_MINUTES);
  const [variant, setVariant] = useState(0);

  const next = data?.plan?.blocks.find((b) => !data.follow.doneIds.includes(b.id));
  useHotkeys({ " ": () => next && data?.plan && !editing && onLaunch(presetFor(data.plan, next)) }, !!next && !editing);

  const week = useMemo(() => {
    if (!data) return null;
    const from = weekStartOf(data.date);
    return minutesByAxis(data.blocks, from, data.date);
  }, [data]);

  if (!data) return null;
  const { date, day, plan, pieces, follow } = data;

  async function setDay(e: Omit<DayEntry, "date">) {
    await repo.putDay({ ...e, date });
    await regenerate(e.kind === "off" ? 0 : e.goalMinutes, 0);
  }

  /** Nouvelle séance pour le temps qui reste ; les blocs déjà faits restent en tête. */
  async function regenerate(goal: number, v: number) {
    const done = plan?.blocks.filter((b) => follow.doneIds.includes(b.id)) ?? [];
    const gen = generateSession(await repo.generatorInput(date, goal, v));
    await repo.saveSession({ date, goalMinutes: goal, blocks: [...done, ...gen.blocks], generatedAt: Date.now() });
    setVariant(v);
    await reload();
  }

  async function edit(p: SessionPlan) {
    await repo.saveSession(p);
    await reload();
  }

  const pending = plan?.blocks.filter((b) => !follow.doneIds.includes(b.id)) ?? [];
  const homework = pieces.filter((p) => p.homework).sort((a, b) => a.homework!.due.localeCompare(b.homework!.due));
  const weekTotal = week ? Object.values(week).reduce((s, x) => s + x, 0) : 0;
  const shareTotal = AXES.reduce((s, a) => s + Math.max(0, cfg.session.axisShares[a]), 0) || 1;

  return (
    <div className="today">
      <header className="screen-head">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">{fmtLongDay(date).toUpperCase()} · {day.kind === "travail" ? "JOUR DE TRAVAIL" : day.kind === "off" ? "JOUR OFF" : "À DÉFINIR"}{day.tags.length ? ` · ${day.tags.join(" · ").toUpperCase()}` : ""}</span>
          <h1>Séance du jour</h1>
        </div>
        {day.kind === "travail" && (
          <div className="progress-box">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="dim">Joué aujourd'hui</span>
              <span className="num">{fmtMinutes(follow.playedMinutes)} <span className="dim">sur {fmtMinutes(day.goalMinutes)} prévues</span></span>
            </div>
            <div className="meter"><div style={{ width: `${Math.min(100, (follow.playedMinutes / Math.max(1, day.goalMinutes)) * 100)}%` }} /></div>
          </div>
        )}
      </header>

      <div className="today-grid">
        <div className="stack" style={{ gap: 16 }}>
          {day.kind === "a-definir" && (
            <section className="panel stack">
              <h2>Aujourd'hui n'est pas encore planifié</h2>
              <p className="dim">Indique ton temps disponible : la séance se construit tout de suite. Tu peux aussi remplir toute la semaine dans Planning.</p>
              <div className="row">
                <Stepper label="Objectif en minutes" value={goalDraft} onChange={setGoalDraft} min={10} max={600} step={15} />
                <button type="button" className="btn primary big" onClick={() => void setDay({ kind: "travail", goalMinutes: goalDraft, tags: [], lesson: false })}>Travailler {fmtMinutes(goalDraft)}</button>
                <button type="button" className="btn" onClick={() => void setDay({ kind: "off", goalMinutes: 0, tags: [], lesson: false })}>Jour off</button>
              </div>
            </section>
          )}

          {day.kind === "off" && (
            <section className="panel stack">
              <h2>Jour off</h2>
              <p className="dim">Rien de prévu, et aucune conséquence. Un bloc libre reste possible.</p>
              <div className="row">
                <button type="button" className="btn primary" onClick={onFree}>Bloc libre</button>
                <button type="button" className="btn ghost" onClick={() => void setDay({ kind: "travail", goalMinutes: DEFAULT_GOAL_MINUTES, tags: day.tags, lesson: day.lesson })}>Finalement, travailler aujourd'hui</button>
              </div>
            </section>
          )}

          {day.kind === "travail" && plan && (
            <>
              {next ? (
                <section className="panel hero" aria-label="Prochain bloc">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="eyebrow holo">PROCHAIN BLOC · {plan.blocks.indexOf(next) + 1} SUR {plan.blocks.length}</span>
                    {next.reason.kind === "devoir" && <Tag tone="sodium">{reasonLabel(next)}</Tag>}
                  </div>
                  <span className="hero-title">{blockTitle(next, pieces)}</span>
                  <span className="dim"><span className="code">{next.exerciseId}</span>{next.pieceId ? ` · ${getExercise(next.exerciseId).name}` : ""} · {next.minutes} min · {reasonLabel(next).toLowerCase()}</span>
                  <div className="row">
                    <button type="button" className="btn primary big grow" onClick={() => onLaunch(presetFor(plan, next))}>Préparer ce bloc <span className="kbd">Espace</span></button>
                    <button type="button" className="btn big" onClick={onFree}>Bloc libre</button>
                  </div>
                </section>
              ) : (
                <section className="panel stack">
                  <h2>{plan.blocks.length ? "Séance terminée" : "Rien à prévoir"}</h2>
                  <p className="dim">{plan.blocks.length ? "Tout ce qui était prévu est fait. Un bloc libre reste possible." : "L'objectif du jour est déjà atteint, ou trop court pour un bloc."}</p>
                  <div className="row"><button type="button" className="btn primary" onClick={onFree}>Bloc libre</button></div>
                </section>
              )}

              <section className="panel stack" aria-label="Blocs de la séance">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 className="eyebrow">LA SÉANCE · BLOCS DE {cfg.session.blockMinutes} MIN, PAUSES DE {cfg.session.pauseMinutes} MIN</h2>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn" onClick={() => void regenerate(day.goalMinutes, variant + 1)}>Régénérer</button>
                    <button type="button" className="btn" aria-pressed={editing} onClick={() => { setEditing(!editing); setPicker(null); }}>{editing ? "Terminé" : "Modifier"}</button>
                  </div>
                </div>
                {plan.goalMinutes !== day.goalMinutes && (
                  <div className="notice">
                    <span>L'objectif du jour est passé à {fmtMinutes(day.goalMinutes)}.</span>
                    <button type="button" className="btn" onClick={() => void regenerate(day.goalMinutes, variant)}>Adapter la séance</button>
                  </div>
                )}
                <ol className="session-list">
                  {plan.blocks.map((b, i) => {
                    const done = follow.doneIds.includes(b.id);
                    const isNext = b === next;
                    return (
                      <li key={b.id} className="session-row" data-state={done ? "done" : isNext ? "next" : "todo"}>
                        <span className="n num">{i + 1}</span>
                        <span className="main">
                          <span className="title"><span className="code">{b.exerciseId}</span> · {blockTitle(b, pieces)}</span>
                          <span className="dim small">{reasonLabel(b)}</span>
                        </span>
                        <span className="num state">{done ? <><Icon name="check" size={18} label="fait" /> {b.minutes} min</> : isNext ? "suivant" : `${b.minutes} min`}</span>
                        {editing && !done && (
                          <span className="row tools">
                            <button type="button" className="icon-btn" aria-label="Monter" onClick={() => void edit(moveBlock(plan, b.id, -1))}><Icon name="up" /></button>
                            <button type="button" className="icon-btn" aria-label="Descendre" onClick={() => void edit(moveBlock(plan, b.id, 1))}><Icon name="down" /></button>
                            <button type="button" className="icon-btn" aria-label="Remplacer" onClick={() => setPicker({ replace: b.id })}><Icon name="swap" /></button>
                            <button type="button" className="icon-btn danger" aria-label="Supprimer" onClick={() => void edit(removeBlock(plan, b.id))}><Icon name="close" /></button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {pending.length === 0 && plan.blocks.length === 0 && <p className="dim">Aucun bloc prévu.</p>}
                {editing && !picker && <button type="button" className="btn ghost dashed" onClick={() => setPicker({})}>+ Ajouter un bloc</button>}
                {picker && (
                  <BlockPicker
                    pieces={pieces}
                    initial={picker.replace ? plan.blocks.find((b) => b.id === picker.replace) : undefined}
                    defaultMinutes={cfg.session.blockMinutes}
                    onCancel={() => setPicker(null)}
                    onPick={async (b) => {
                      await edit(picker.replace ? replaceBlock(plan, picker.replace, b) : addBlock(plan, b, newId()));
                      setPicker(null);
                    }}
                  />
                )}
                <div className="row">
                  <span className="dim small">Objectif du jour</span>
                  <Stepper label="Objectif du jour en minutes" value={day.goalMinutes} min={0} max={600} step={15}
                    onChange={(v) => void repo.putDay({ date, kind: "travail", goalMinutes: v, tags: day.tags, lesson: day.lesson }).then(reload)} />
                </div>
              </section>
            </>
          )}
        </div>

        <aside className="stack" style={{ gap: 16 }}>
          {homework.length > 0 && (
            <section className="panel stack homework-card" aria-label="Devoirs">
              <h2 className="eyebrow sodium">DEVOIRS DU PROF</h2>
              {homework.map((p) => (
                <div key={p.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span><strong>{p.title}</strong>{p.homework!.note ? <span className="dim"> · {p.homework!.note}</span> : null}</span>
                  <span className="dim">{fmtDay(p.homework!.due)}</span>
                </div>
              ))}
            </section>
          )}
          {week && (
            <section className="panel stack" aria-label="Équilibre de la semaine">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 className="eyebrow">CETTE SEMAINE · PART DU TEMPS</h2>
                <span className="dim small">réel · cible</span>
              </div>
              <AxisBars minutes={week} total={weekTotal} shares={cfg.session.axisShares} shareTotal={shareTotal} />
              <span className="dim small">Les axes sous leur cible passent devant dans les prochaines séances. Un jour off ne change rien.</span>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

export function AxisBars({ minutes, total, shares, shareTotal }: { minutes: Record<string, number>; total: number; shares: Record<string, number>; shareTotal: number }) {
  return (
    <div className="axis-bars">
      {AXES.map((a) => {
        const real = total ? (minutes[a]! / total) * 100 : 0;
        const target = (Math.max(0, shares[a] ?? 0) / shareTotal) * 100;
        const scale = (x: number) => `${Math.min(100, x / 0.35)}%`; // 35 % de part = barre pleine
        return (
          <div key={a} className="axis-bar" data-behind={real < target - 2} title={AXIS_LABEL[a]}>
            <span>{AXIS_SHORT[a]}</span>
            <span className="axis-track"><i style={{ width: scale(real) }} /><b style={{ left: scale(target) }} /></span>
            <span className="num">{Math.round(real)} · {Math.round(target)} %</span>
          </div>
        );
      })}
    </div>
  );
}

/** Choix d'un bloc (remplacer ou ajouter) : exercice, durée, morceau si l'exercice en demande un. */
export function BlockPicker({ pieces, initial, defaultMinutes, onPick, onCancel }: {
  pieces: readonly Piece[];
  initial?: PlannedBlock;
  defaultMinutes: number;
  onPick: (b: Omit<PlannedBlock, "id" | "reason">) => void;
  onCancel: () => void;
}) {
  const [exerciseId, setExerciseId] = useState<ExerciseId>(initial?.exerciseId ?? "WLK-01");
  const [minutes, setMinutes] = useState(initial?.minutes ?? defaultMinutes);
  const [pieceId, setPieceId] = useState(initial?.pieceId ?? "");
  const need = ["WLK-02", "WLK-03", "IMP-02", "IMP-03"].includes(exerciseId) ? "grid" : exerciseId === "REP-01" ? "passages" : null;
  const pool = need === "grid" ? pieces.filter(hasGrid) : need === "passages" ? pieces.filter(hasPassages) : [];
  const piece = pool.find((p) => p.id === pieceId);
  const [passageId, setPassageId] = useState(initial?.passageId ?? "");
  return (
    <div className="editor stack">
      <div className="form-grid">
        <label className="field"><span>Exercice</span>
          <select className="input" value={exerciseId} onChange={(e) => { setExerciseId(e.target.value as ExerciseId); setPieceId(""); setPassageId(""); }}>
            {EXERCISES.map((e) => <option key={e.id} value={e.id}>{e.id} · {e.name}</option>)}
          </select>
        </label>
        <div className="field"><span>Durée (min)</span><Stepper label="Durée du bloc" value={minutes} onChange={setMinutes} min={5} max={120} step={5} /></div>
        {need && (
          <label className="field"><span>Morceau</span>
            <select className="input" value={pieceId} onChange={(e) => { setPieceId(e.target.value); setPassageId(""); }}>
              <option value="">Choisi au lancement</option>
              {pool.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
        )}
        {piece && need === "passages" && (
          <label className="field"><span>Passage</span>
            <select className="input" value={passageId} onChange={(e) => setPassageId(e.target.value)}>
              <option value="">Choisi au lancement</option>
              {piece.passages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="row">
        <button type="button" className="btn primary" onClick={() => onPick({ exerciseId, minutes, ...(pieceId ? { pieceId } : {}), ...(passageId ? { passageId } : {}) })}>Valider</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}
