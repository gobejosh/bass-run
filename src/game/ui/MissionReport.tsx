/**
 * Rapport de mission, affiché à côté du loot de fin de bloc. L'issue et les récompenses
 * s'affichent tout de suite ; le récit arrive dès qu'il est prêt (repli local sinon).
 */
import { useEffect, useState } from "react";
import type { StoredReport } from "../model";
import { OUTCOME_LABEL } from "../model";
import { useGame } from "./hooks";
import { eventLabel, fmtInt, fmtNum, fmtSigned, RARITY_NAME, SLOT_LABEL, SLOT_NAME, typeName } from "./labels";
import { QuickManage, WindowBanner } from "./Manage";

export function MissionReport({ blockId }: { blockId: string }) {
  const { rt, record, version } = useGame();
  const [rep, setRep] = useState<StoredReport | null | undefined>(undefined);
  const [waitedOut, setWaitedOut] = useState(false);

  useEffect(() => {
    if (!rt) return;
    let live = true;
    void rt.report(blockId).then((r) => live && setRep(r ?? null));
    return () => {
      live = false;
    };
  }, [rt, blockId, version]);

  useEffect(() => {
    const t = setTimeout(() => setWaitedOut(true), 6000);
    return () => clearTimeout(t);
  }, []);

  if (!rt || !record) return null;
  if (!rep) return waitedOut ? null : <section className="lw-report"><p className="dim">Transmission du rapport de mission…</p></section>;

  const cfg = rt.cfg;
  const state = record.state;
  const r = rep.report;
  const c = r.contract;
  const lines = r.events.map((e) => eventLabel(e, state, cfg)).filter((l): l is string => !!l);

  return (
    <section className="lw-report" aria-label="Rapport de mission">
      {c && r.outcome ? (
        <>
          <div className={`lw-outcome o-${r.outcome}`}>
            <span className="lw-outcome-name">{OUTCOME_LABEL[r.outcome]}{r.penalized ? " · malus" : ""}</span>
            <span>{SLOT_NAME[c.kind === "c" ? c.slot : c.kind]} · {typeName(cfg, c.type)} · {state.districts[c.tier - 1]?.name}</span>
          </div>
          <p className="dim">{c.verb} {c.target}, pour {c.client}.</p>
          {r.roll && (
            <p className="num lw-roll">
              Jet {r.roll.dice[0]} + {r.roll.dice[1]} · marge {fmtNum(r.roll.margin)}
              {r.roll.modBonus > 0 ? ` · mod vaincu +${r.roll.modBonus}` : ""}
            </p>
          )}
          {rep.narrative && (
            <div className="lw-story">
              <h3>{rep.narrative.titre}</h3>
              <p>{rep.narrative.rapport}</p>
            </div>
          )}
          {r.outcome !== "aborted" || r.penalized ? (
            <p className="lw-rewards">
              {fmtSigned(r.rewards.credits)} crédits · {fmtSigned(r.rewards.rep)} réputation · {fmtSigned(r.rewards.xp)} XP
              {r.catchUp && r.catchUp.rep > 1 ? <span className="dim"> · rattrapage ×{fmtNum(r.catchUp.rep)}</span> : null}
            </p>
          ) : null}
        </>
      ) : (
        <p className="dim">Bloc joué sans mission.</p>
      )}

      {lines.length > 0 && (
        <ul className="lw-events">
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}

      {rep.items.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <h3>Équipement trouvé</h3>
          {rep.items.map((it) => (
            <div key={it.id} className={`lw-item r-${it.rarity}`}>
              <span>{it.name}</span>
              <span className="dim">{SLOT_LABEL[it.slot]} · <span className={`plate r-${it.rarity}`}>{RARITY_NAME[it.rarity]}</span></span>
            </div>
          ))}
        </div>
      )}

      {rep.type === "bloc_termine" && (
        <>
          <WindowBanner />
          <QuickManage />
          <p className="dim">{fmtInt(state.credits)} crédits · {fmtInt(state.rep)} réputation · détail dans l'onglet Équipe.</p>
        </>
      )}
    </section>
  );
}
