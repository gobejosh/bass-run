import { useEffect, useReducer, useState } from "react";
import type { GameRecord } from "../model";
import { gameRuntime, onGameReady, type GameRuntime } from "../runtime";

/** Le jeu en cours (null tant qu'il démarre, ou s'il est indisponible). Se met à jour à chaque changement. */
export function useGame(): { rt: GameRuntime | null; record: GameRecord | null; version: number } {
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const rt = gameRuntime();
  useEffect(() => (rt ? rt.subscribe(bump) : onGameReady(bump)), [rt]);
  return { rt, record: rt?.record ?? null, version };
}

/** Horloge pour les comptes à rebours (arrêtée quand inutile). */
export function useNow(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return now;
}
