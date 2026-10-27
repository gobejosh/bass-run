/** Réglages des séances, en formulaire (écrits dans les surcharges de configuration, section « session »). */
import { useState } from "react";
import { deepMerge, DEFAULT_CONFIG, type AppConfig } from "../../core/config";
import { AXIS_LABEL, AXIS_SHORT, EXERCISES, type Axis } from "../../core/exercises";
import { PIECE_STATUS_LABEL, PIECE_STATUSES } from "../../core/repertoire";
import { AXES } from "../../core/session";
import { Segmented, Stepper } from "../components";
import { useApp } from "../context";

type S = AppConfig["session"];

export function SessionSettings() {
  const { repo, cfg, refresh } = useApp();
  const [s, setS] = useState<S>(cfg.session);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof S>(k: K, v: S[K]) => { setS({ ...s, [k]: v }); setMsg(null); };
  const shareTotal = AXES.reduce((t, a) => t + s.axisShares[a], 0);

  async function save(next: S) {
    const over = (await repo.configOverrides()) as Record<string, unknown>;
    await repo.setConfigOverrides(deepMerge(over, { session: next }));
    await refresh();
    setS(next);
    setMsg("Réglages des séances enregistrés. Ils s'appliquent aux prochaines séances générées.");
  }

  return (
    <div className="stack">
      <h2>Séances</h2>
      <div className="form-grid">
        <div className="field"><span>Durée d'un bloc (min)</span><Stepper label="Durée d'un bloc" value={s.blockMinutes} min={5} max={90} step={5} onChange={(v) => set("blockMinutes", v)} /></div>
        <div className="field"><span>Pause entre deux blocs (min)</span><Stepper label="Pause" value={s.pauseMinutes} min={0} max={30} onChange={(v) => set("pauseMinutes", v)} /></div>
        <div className="field"><span>Bloc le plus court (min)</span><Stepper label="Bloc le plus court" value={s.minBlockMinutes} min={5} max={30} onChange={(v) => set("minBlockMinutes", v)} /></div>
        <label className="field"><span>Premier bloc du jour</span>
          <select className="input" value={s.openingAxis ?? ""} onChange={(e) => set("openingAxis", (e.target.value || null) as Axis | null)}>
            <option value="">Libre (pas d'ouverture imposée)</option>
            {AXES.map((a) => <option key={a} value={a}>{a} · {AXIS_LABEL[a]}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={s.pauseChime} onChange={(e) => set("pauseChime", e.target.checked)} /><span>Son doux à la fin de la pause</span></label>
      </div>

      <h3>Part cible du temps par axe, et ta priorité</h3>
      <p className="dim">Les parts sont relatives (total actuel : {shareTotal}). Un axe à 0 n'est jamais proposé. La priorité pèse ±{Math.round(s.priorityWeight * 100)} % sur le retard d'un axe.</p>
      <div className="axis-settings">
        {AXES.map((a) => (
          <div key={a} className="axis-setting">
            <span title={AXIS_LABEL[a]}><span className="code">{a}</span> {AXIS_SHORT[a]}</span>
            <Stepper label={`Part de ${AXIS_LABEL[a]}`} value={s.axisShares[a]} min={0} max={100} step={5} onChange={(v) => set("axisShares", { ...s.axisShares, [a]: v })} />
            <Segmented<-1 | 0 | 1> label={`Priorité de ${AXIS_LABEL[a]}`} value={s.axisPriority[a] ?? 0} onChange={(v) => set("axisPriority", { ...s.axisPriority, [a]: v })}
              options={[[-1, "−"], [0, "="], [1, "+"]]} />
          </div>
        ))}
      </div>

      <h3>Devoirs et entretien</h3>
      <div className="form-grid">
        <div className="field"><span>Un devoir entre dans les séances à N jours de l'échéance</span><Stepper label="Horizon des devoirs" value={s.homeworkHorizonDays} min={1} max={30} onChange={(v) => set("homeworkHorizonDays", v)} /></div>
        <div className="field"><span>Part maximale des devoirs dans une séance (%)</span><Stepper label="Part des devoirs" value={Math.round(s.homeworkMaxShare * 100)} min={0} max={100} step={10} onChange={(v) => set("homeworkMaxShare", v / 100)} /></div>
        <div className="field"><span>Blocs par devoir et par séance</span><Stepper label="Blocs par devoir" value={s.homeworkBlocksPerPiece} min={1} max={4} onChange={(v) => set("homeworkBlocksPerPiece", v)} /></div>
        <div className="field"><span>« À entretenir » après N jours sans jouer un morceau su</span><Stepper label="Entretien après" value={s.maintenanceAfterDays} min={3} max={120} onChange={(v) => set("maintenanceAfterDays", v)} /></div>
        <div className="field"><span>Blocs d'entretien par séance, au plus</span><Stepper label="Blocs d'entretien" value={s.maintenancePerDay} min={0} max={4} onChange={(v) => set("maintenancePerDay", v)} /></div>
      </div>

      <div className="field">
        <span>Morceaux proposés par les séances et le tirage « au hasard »</span>
        <div className="chips">
          {PIECE_STATUSES.map((st) => {
            const on = s.drawStatuses.includes(st);
            return <button key={st} type="button" className="chip" aria-pressed={on} onClick={() => set("drawStatuses", on ? s.drawStatuses.filter((x) => x !== st) : [...s.drawStatuses, st])}>{PIECE_STATUS_LABEL[st]}</button>;
          })}
        </div>
      </div>
      <div className="field">
        <span>Exercices jamais proposés par les séances (toujours lançables à la main)</span>
        <div className="chips">
          {EXERCISES.map((e) => {
            const on = s.excludedExercises.includes(e.id);
            return <button key={e.id} type="button" className="chip" aria-pressed={on} title={e.name} onClick={() => set("excludedExercises", on ? s.excludedExercises.filter((x) => x !== e.id) : [...s.excludedExercises, e.id])}>{e.id}</button>;
          })}
        </div>
      </div>

      <div className="row">
        <button type="button" className="btn primary" onClick={() => void save(s)}>Enregistrer les réglages des séances</button>
        <button type="button" className="btn ghost" onClick={() => void save(DEFAULT_CONFIG.session)}>Valeurs par défaut</button>
        {msg && <span className="dim">{msg}</span>}
      </div>
    </div>
  );
}
