/** Issue de la mission d'un bloc, pour la colonne « Mission » de l'Historique. */
import { useEffect, useState } from "react";
import type { StoredReport } from "../model";
import { OUTCOME_LABEL } from "../model";
import type { GameRuntime } from "../runtime";
import { useGame } from "./hooks";

/** Tous les rapports, relus une fois par changement de partie et partagés entre les cellules. */
let cache: { rt: GameRuntime; version: number; map: Promise<Map<string, StoredReport>> } | null = null;
function reportsFor(rt: GameRuntime, version: number): Promise<Map<string, StoredReport>> {
  if (!cache || cache.rt !== rt || cache.version !== version) {
    cache = { rt, version, map: rt.store.reports(Infinity).then((list) => new Map(list.map((r) => [r.blockId, r]))) };
  }
  return cache.map;
}

export function MissionCell({ blockId }: { blockId: string }) {
  const { rt, version } = useGame();
  const [rep, setRep] = useState<StoredReport | null>(null);
  useEffect(() => {
    if (!rt) return;
    let live = true;
    void reportsFor(rt, version).then((m) => live && setRep(m.get(blockId) ?? null));
    return () => {
      live = false;
    };
  }, [rt, version, blockId]);
  const outcome = rep?.report.contract ? rep.report.outcome : null;
  if (!outcome) return <span className="dim">—</span>;
  return <span className={`o-text o-${outcome}`}>{OUTCOME_LABEL[outcome]}{rep?.report.penalized ? " · malus" : ""}</span>;
}
