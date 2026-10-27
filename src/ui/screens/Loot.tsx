import { useEffect, useRef, useState } from "react";
import { audioContext } from "../../audio/context";
import type { FinishResult } from "../../core/block";
import { getExercise } from "../../core/exercises";
import { ModChip } from "../components";
import { useApp } from "../context";
import { fmtClock } from "../components";
import { useHotkeys } from "../hotkeys";
import { AfterBlockReport } from "../../integration/game";
import type { LaunchPreset } from "./Today";

export interface NextInSession {
  preset: LaunchPreset;
  title: string;
}

/**
 * Fin de bloc : le mod obtenu d'abord (la pratique), puis le rapport de mission (le jeu), puis la pause et le bloc suivant
 * quand le bloc faisait partie de la séance du jour.
 */
export function LootScreen({ result, onDone, session, onNext }: {
  result: FinishResult;
  onDone: () => void;
  /** null : bloc libre ; sinon le bloc suivant de la séance (ou rien si la séance est finie). */
  session: { next: NextInSession | null } | null;
  onNext: (p: LaunchPreset) => void;
}) {
  const { cfg } = useApp();
  const ev = result.event;
  const ex = getExercise(ev.exerciseId);
  const next = session?.next ?? null;
  useHotkeys({ " ": () => (next ? onNext(next.preset) : onDone()) });

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="screen-head">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow holo">
            {ex.id} · NOTE {ev.note}/5{result.newRefBpm ? ` · NOUVELLE RÉFÉRENCE ${result.newRefBpm} BPM` : ""}
          </span>
          <h1>Fin de bloc</h1>
        </div>
        {session && <button type="button" className="btn" onClick={onDone}>Sortir de la séance</button>}
      </header>
      <div className="after-grid" data-session={!!session}>
        <section className="loot stack" aria-label="Mod obtenu">
          <h2 className="eyebrow">MOD OBTENU</h2>
          <ModChip inst={result.loot} showExercises />
          <p className="dim">
            {result.pity
              ? "Le compteur de pitié a joué : ce drop est au moins Prototype."
              : `Drops sans Prototype ni Fantôme : ${result.lootState.dropsSinceHigh} / ${cfg.loot.pityThreshold}`}
          </p>
          {ev.modVaincu && ev.mod && <p className="dim">{ev.mod.name} vaincu (+{ev.bonusXpPct} % d'XP pour le jeu).</p>}
          {!session && <button type="button" className="btn primary big" style={{ justifySelf: "start" }} onClick={onDone}>Continuer <span className="kbd">Espace</span></button>}
        </section>
        <AfterBlockReport blockId={ev.blockId} />
        {session && <PauseCard next={next} minutes={cfg.session.pauseMinutes} chime={cfg.session.pauseChime} onNext={onNext} onDone={onDone} />}
      </div>
    </div>
  );
}

function PauseCard({ next, minutes, chime, onNext, onDone }: {
  next: NextInSession | null; minutes: number; chime: boolean; onNext: (p: LaunchPreset) => void; onDone: () => void;
}) {
  const [end, setEnd] = useState(() => Date.now() + minutes * 60_000);
  const [now, setNow] = useState(Date.now());
  const rang = useRef(false);
  const left = Math.max(0, Math.round((end - now) / 1000));
  useEffect(() => {
    if (!next || minutes <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [next, minutes]);
  useEffect(() => {
    if (left > 0 || rang.current || !next || minutes <= 0) return;
    rang.current = true;
    if (chime) softChime();
  }, [left, chime, next, minutes]);

  if (!next) {
    return (
      <section className="panel stack pause-card" aria-label="Séance terminée">
        <h2 className="eyebrow holo">SÉANCE TERMINÉE</h2>
        <p>Tout ce qui était prévu aujourd'hui est fait.</p>
        <button type="button" className="btn primary big" onClick={onDone}>Retour à Aujourd'hui <span className="kbd">Espace</span></button>
      </section>
    );
  }
  return (
    <section className="panel stack pause-card" aria-label="Pause">
      {minutes > 0 && (
        <>
          <h2 className="eyebrow holo">PAUSE</h2>
          <span className="pause-clock num" aria-live="off">{fmtClock(left)}</span>
          <span className="dim small">{left > 0 ? "Un son doux à la fin. Rien ne démarre tout seul." : "Pause terminée, quand tu veux."}</span>
        </>
      )}
      <div className="stack next-block" style={{ gap: 4 }}>
        <span className="dim small">Bloc suivant · {next.preset.position.index} sur {next.preset.position.count}</span>
        <strong><span className="code">{next.preset.exerciseId}</span> · {next.title}</strong>
        <span className="dim">{next.preset.minutes} min</span>
      </div>
      <button type="button" className="btn primary big" onClick={() => onNext(next.preset)}>Préparer le bloc suivant <span className="kbd">Espace</span></button>
      {minutes > 0 && <button type="button" className="btn" onClick={() => { setEnd(Math.max(end, Date.now()) + 5 * 60_000); rang.current = false; }}>Prolonger de 5 min</button>}
    </section>
  );
}

/** Deux notes douces, si le son a déjà été déverrouillé par un geste. */
function softChime(): void {
  try {
    const ctx = audioContext();
    if (ctx.state !== "running") return;
    const t = ctx.currentTime + 0.05;
    for (const [i, f] of [[0, 660], [1, 880]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.25 + 0.6);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.25);
      o.stop(t + i * 0.25 + 0.7);
    }
  } catch {
    // pas de son : la pause s'affiche quand même comme terminée
  }
}
