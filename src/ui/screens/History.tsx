import { useEffect, useState } from "react";
import { getMod } from "../../core/mods/catalog";
import { RARITY_LABEL, type BlockRecord } from "../../core/types";
import { fmtClock } from "../components";
import { useApp } from "../context";
import { MissionOutcome } from "../../integration/game";
import { isoDate, resolveWeek, type DayEntry } from "../../core/planning";
import { followUp } from "../../core/session";
import { pieceIdOf } from "../../core/repertoire";
import { fmtDay, fmtMinutes } from "../dates";

const STATUS: Record<BlockRecord["status"], string> = { en_cours: "En cours", termine: "Terminé", abandonne: "Abandonné" };

export function HistoryScreen() {
  const { repo } = useApp();
  const [blocks, setBlocks] = useState<BlockRecord[] | null>(null);
  const [plan, setPlan] = useState<DayEntry[]>([]);
  useEffect(() => {
    void repo.blocks().then(setBlocks);
    void repo.planning().then(setPlan);
  }, [repo]);
  if (!blocks) return null;
  const week = resolveWeek(plan, isoDate(new Date()));
  return (
    <div className="stack" style={{ gap: 24 }}>
      <h1>Journal</h1>
      <section className="panel stack" aria-label="Cette semaine">
        <h2 className="eyebrow">CETTE SEMAINE · JOUÉ ET PRÉVU, À TITRE D'INFORMATION</h2>
        <div className="week-follow">
          {week.map((d) => (
            <div key={d.date} className="week-follow-day">
              <span className="day-name">{fmtDay(d.date)}</span>
              <span className="num">{fmtMinutes(followUp(null, blocks, d.date).playedMinutes)}</span>
              <span className="dim small">{d.kind === "travail" ? `prévu ${fmtMinutes(d.goalMinutes)}` : d.kind === "off" ? "off" : "—"}</span>
            </div>
          ))}
        </div>
      </section>
      {blocks.length === 0 && <p className="empty">Aucun bloc pour l'instant.</p>}
      <div className="scroll-x">
        <table className="hist">
          <thead>
            <tr><th>Date</th><th>Exercice</th><th>Morceau</th><th>Statut</th><th>Durée</th><th>Tempo</th><th>Note</th><th>Mod</th><th>Mesures</th><th>Loot</th><th>Mission</th></tr>
          </thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.startedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>{b.exerciseId}</td>
                <td>{pieceIdOf(b) && typeof b.draws.title === "string" ? b.draws.title : "—"}</td>
                <td>{STATUS[b.status]}</td>
                <td className="num">{b.playedSeconds !== undefined ? fmtClock(b.playedSeconds) : "—"}</td>
                <td className="num">{b.targetBpm}{b.debrief?.cleanBpm ? ` → ${b.debrief.cleanBpm}` : ""}</td>
                <td className="num">{b.debrief?.note ?? "—"}</td>
                <td>{b.mod ? `${b.mod.name} (${RARITY_LABEL[b.mod.rarity]})` : "—"}</td>
                <td className="dim">{b.debrief ? Object.entries(b.debrief.measures).map(([k, v]) => `${k} : ${v}`).join(" · ") : ""}</td>
                <td>{b.loot ? `${getMod(b.loot.modId).name} (${RARITY_LABEL[b.loot.rarity]})` : "—"}</td>
                <td><MissionOutcome blockId={b.id} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
