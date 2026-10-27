import { useState } from "react";
import { getExercise } from "../../core/exercises";
import { TIER_LABEL, type Tier } from "../../core/library";
import { suggestTier } from "../../core/rep";
import type { BlockRecord, Debrief } from "../../core/types";
import { ConfirmAction, fmtClock, Stepper } from "../components";
import { useApp } from "../context";
import { useHotkeys } from "../hotkeys";

export function DebriefScreen({ block, playedSeconds, lastBpm, auto, onSubmit, onAbandon }: {
  block: BlockRecord;
  playedSeconds: number;
  lastBpm: number;
  auto: Record<string, number | string>;
  onSubmit: (d: Debrief) => Promise<void>;
  onAbandon: () => void;
}) {
  const { cfg } = useApp();
  const ex = getExercise(block.exerciseId);
  const [note, setNote] = useState<Debrief["note"] | null>(null);
  const [bpm, setBpm] = useState(lastBpm || block.targetBpm);
  const [measures, setMeasures] = useState<Record<string, string>>(
    Object.fromEntries(ex.measures.map((m) => [m.key, auto[m.key] !== undefined ? String(auto[m.key]) : ""])),
  );
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!note) return;
    setBusy(true);
    setError(null);
    try {
      const parsed: Record<string, number | string> = {};
      for (const m of ex.measures) {
        const raw = measures[m.key]?.trim() ?? "";
        if (raw === "") continue;
        parsed[m.key] = m.kind === "int" || m.kind === "decimal" ? Number(raw.replace(",", ".")) : raw;
      }
      await onSubmit({
        note,
        ...(ex.asksCleanBpm ? { cleanBpm: bpm } : {}),
        measures: parsed,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  useHotkeys({
    "1": () => setNote(1), "2": () => setNote(2), "3": () => setNote(3), "4": () => setNote(4), "5": () => setNote(5),
    enter: () => void submit(),
  });

  return (
    <div className="stack" style={{ maxWidth: 760, gap: 28 }}>
      <div>
        <h1>Débrief</h1>
        <p className="dim" style={{ marginTop: 6 }}>
          {ex.id} · {ex.name} · {fmtClock(playedSeconds)} jouées
          {block.mod ? ` · ${block.mod.name}` : ""}
        </p>
      </div>

      <div className="field">
        <span>Auto-évaluation · touches 1 à 5</span>
        <div className="notes" role="group" aria-label="Note sur 5">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button key={n} type="button" className="note-btn" aria-pressed={note === n} onClick={() => setNote(n)}>{n}</button>
          ))}
        </div>
      </div>

      {ex.asksCleanBpm && (
        <div className="field">
          <span>Tempo propre atteint (BPM)</span>
          <Stepper label="Tempo propre" value={bpm} onChange={setBpm} min={cfg.tempo.minBpm} max={cfg.tempo.maxBpm} />
        </div>
      )}

      {ex.id === "REP-01" && (() => {
        const sug = suggestTier(bpm, block.draws.targetBpm as number | undefined, cfg);
        return sug ? <p className="dim">D'après le tempo noté et le tempo visé du passage, palier suggéré : {TIER_LABEL[sug]}.</p> : null;
      })()}

      {ex.measures.length > 0 && (
        <div className="form-grid">
          {ex.measures.map((m) => (
            <label key={m.key} className="field">
              <span>{m.label}{m.unit ? ` (${m.unit})` : ""}</span>
              {m.kind === "select" ? (
                <select className="input" value={measures[m.key]} onChange={(e) => setMeasures({ ...measures, [m.key]: e.target.value })}>
                  <option value="">—</option>
                  {m.options!.map((o) => <option key={o} value={o}>{TIER_LABEL[o as Tier] ?? o}</option>)}
                </select>
              ) : (
                <input
                  className="input"
                  inputMode={m.kind === "text" ? "text" : "decimal"}
                  value={measures[m.key]}
                  onChange={(e) => setMeasures({ ...measures, [m.key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
      )}

      <label className="field">
        <span>Commentaire (facultatif)</span>
        <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="btn primary big" disabled={!note || busy} onClick={submit}>
          {note ? <>Valider le bloc <span className="kbd">Entrée</span></> : "Choisis une note pour valider"}
        </button>
        <ConfirmAction label="Abandonner" question="Aucun mod ne sera gagné ni consommé." confirmLabel="Abandonner le bloc" onConfirm={onAbandon} />
      </div>
    </div>
  );
}
