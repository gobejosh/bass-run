/**
 * Planning : chaque jour se remplit à la main selon tes disponibilités (travail avec objectif, off, ou à définir).
 * Suivi prévu / joué à titre d'information, sans jugement.
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";
import { addDays, copyWeek, DEFAULT_GOAL_MINUTES, isoDate, resolveWeek, weekStartOf, type DayEntry, type DayPlan } from "../../core/planning";
import { AXES, followUp, minutesByAxis, type SessionPlan } from "../../core/session";
import type { BlockRecord } from "../../core/types";
import { Segmented, Stepper } from "../components";
import { useApp } from "../context";
import { fmtDay, fmtMinutes } from "../dates";
import { AxisBars } from "./Today";

export function PlanningScreen({ onSettings }: { onSettings: () => void }) {
  const { repo, cfg } = useApp();
  const today = isoDate(new Date());
  const [week, setWeek] = useState(weekStartOf(today));
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [sessions, setSessions] = useState<SessionPlan[]>([]);
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [e, s, b] = await Promise.all([repo.planning(), repo.sessions(week, addDays(week, 6)), repo.blocks()]);
    setEntries(e);
    setSessions(s);
    setBlocks(b);
  }, [repo, week]);
  useEffect(() => void load(), [load]);

  const days = resolveWeek(entries, week);
  const planned = days.reduce((s, d) => s + d.goalMinutes, 0);
  const played = days.reduce((s, d) => s + followUp(null, blocks, d.date).playedMinutes, 0);
  const byAxis = minutesByAxis(blocks, week, addDays(week, 6));
  const total = Object.values(byAxis).reduce((s, x) => s + x, 0);
  const shareTotal = AXES.reduce((s, a) => s + Math.max(0, cfg.session.axisShares[a]), 0) || 1;

  async function save(d: DayPlan, patch: Partial<DayEntry> | null) {
    if (patch === null) await repo.clearDay(d.date);
    else await repo.putDay({ date: d.date, kind: d.kind === "a-definir" ? "travail" : d.kind, goalMinutes: d.goalMinutes || DEFAULT_GOAL_MINUTES, tags: d.tags, lesson: d.lesson, ...patch });
    // La séance d'aujourd'hui s'adaptera à l'objectif depuis l'écran Aujourd'hui (rien n'est régénéré dans ton dos).
    await load();
  }

  async function copyPrevious() {
    const next = copyWeek(entries, addDays(week, -7), week);
    const added = next.length - entries.length;
    await repo.putDays(next.filter((e) => e.date >= week && e.date <= addDays(week, 6)));
    setMsg(added ? `${added} jour(s) copié(s) de la semaine précédente ; les jours déjà remplis n'ont pas changé.` : "Rien à copier : la semaine précédente est vide, ou cette semaine est déjà remplie.");
    await load();
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="screen-head">
        <div className="row" style={{ gap: 12 }}>
          <button type="button" className="icon-btn" aria-label="Semaine précédente" onClick={() => setWeek(addDays(week, -7))}><Icon name="prev" /></button>
          <div className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">{plural(days.filter((d) => d.kind === "travail").length, "JOUR DE TRAVAIL", "JOURS DE TRAVAIL")} · {days.filter((d) => d.kind === "off").length} OFF · {days.filter((d) => d.kind === "a-definir").length} À DÉFINIR</span>
            <h1>Semaine du {fmtDay(week).replace(/^\S+\s/, "")}</h1>
          </div>
          <button type="button" className="icon-btn" aria-label="Semaine suivante" onClick={() => setWeek(addDays(week, 7))}><Icon name="next" /></button>
          {week !== weekStartOf(today) && <button type="button" className="btn ghost" onClick={() => setWeek(weekStartOf(today))}>Cette semaine</button>}
        </div>
        <div className="row">
          <span className="num">Joué {fmtMinutes(played)} <span className="dim">· prévu {fmtMinutes(planned)}</span></span>
          <button type="button" className="btn" onClick={() => void copyPrevious()}>Copier la semaine précédente</button>
        </div>
      </header>
      {msg && <p className="dim">{msg}</p>}

      <div className="week-grid">
        {days.map((d) => {
          const f = followUp(sessions.find((s) => s.date === d.date) ?? null, blocks, d.date);
          return (
            <section key={d.date} className="day-card" data-kind={d.kind} data-today={d.date === today} aria-label={fmtDay(d.date)}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong className="day-name">{fmtDay(d.date)}</strong>
                {d.date === today && <span className="eyebrow holo">AUJOURD'HUI</span>}
              </div>
              <Segmented label={`Type du ${fmtDay(d.date)}`} value={d.kind}
                onChange={(k) => void save(d, k === "a-definir" ? null : { kind: k })}
                options={[["travail", "Travail"], ["off", "Off"], ["a-definir", "—"]]} />
              {d.kind === "travail" && (
                <Stepper label={`Objectif du ${fmtDay(d.date)} en minutes`} value={d.goalMinutes} min={10} max={600} step={15} onChange={(v) => void save(d, { goalMinutes: v })} />
              )}
              {d.kind !== "a-definir" && (
                <>
                  <label className="check small">
                    <input type="checkbox" checked={d.lesson} onChange={(e) => void save(d, { lesson: e.target.checked })} />
                    <span>Cours de basse</span>
                  </label>
                  <TagsInput value={d.tags} onChange={(tags) => void save(d, { tags })} />
                </>
              )}
              <span className="dim small day-foot">
                {d.kind === "off" ? "Aucune conséquence." : d.kind === "a-definir" ? "Pas encore rempli." : f.playedMinutes || d.date <= today ? `Joué ${fmtMinutes(f.playedMinutes)} sur ${fmtMinutes(d.goalMinutes)}` : `${fmtMinutes(d.goalMinutes)} prévues`}
              </span>
            </section>
          );
        })}
      </div>

      <div className="two-cols">
        <section className="panel stack" aria-label="Équilibre de la semaine">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="eyebrow">PART DU TEMPS PAR AXE · CETTE SEMAINE</h2>
            <span className="dim small">réel · cible</span>
          </div>
          <AxisBars minutes={byAxis} total={total} shares={cfg.session.axisShares} shareTotal={shareTotal} />
        </section>
        <section className="panel stack">
          <h2 className="eyebrow">SÉANCES</h2>
          <p className="dim">Blocs de {cfg.session.blockMinutes} min, pauses de {cfg.session.pauseMinutes} min, ouverture {cfg.session.openingAxis ? `par l'axe ${cfg.session.openingAxis}` : "libre"}, devoirs à {cfg.session.homeworkHorizonDays} jours de l'échéance, entretien après {cfg.session.maintenanceAfterDays} jours.</p>
          <p className="dim">La séance d'un jour se construit quand tu ouvres Aujourd'hui. Un jour off, ou un jour prévu mais pas joué, ne change rien aux suivants.</p>
          <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={onSettings}>Régler les séances et les parts par axe</button>
        </section>
      </div>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Étiquettes libres (contraintes de l'école…), séparées par des virgules. */
function TagsInput({ value, onChange }: { value: string[]; onChange: (t: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => setText(value.join(", ")), [value]);
  const commit = () => {
    const tags = text.split(",").map((t) => t.trim()).filter(Boolean);
    if (tags.join("|") !== value.join("|")) onChange(tags);
  };
  return (
    <input className="input small" placeholder="Contraintes (école, répét…)" aria-label="Contraintes du jour" value={text}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())} />
  );
}
