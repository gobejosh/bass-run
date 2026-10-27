import { useCallback, useEffect, useRef, useState } from "react";
import { createClickPlanner } from "../../audio/clickPlan";
import { Metronome, type BeatTick } from "../../audio/metronome";
import { getExercise } from "../../core/exercises";
import { callResponsePhase, chorusNumber, feelAt, targetAt } from "../../core/mods/live";
import type { ResolvedMod } from "../../core/mods/resolve";
import { cryptoRng } from "../../core/rng";
import { RARITY_LABEL } from "../../core/types";
import { ConfirmAction, EnforcementTag, fmtClock } from "../components";
import { useApp, type Session } from "../context";
import { driverFor } from "../drivers";
import { useHotkeys } from "../hotkeys";
import { useWakeLock } from "../wakeLock";

export interface RunResult {
  playedSeconds: number;
  lastBpm: number;
  auto: Record<string, number | string>;
}

export function RunScreen({ session, onDebrief, onAbandon }: {
  session: Session;
  onDebrief: (r: RunResult) => void;
  onAbandon: (playedSeconds: number) => void;
}) {
  const { cfg, dicts } = useApp();
  const { block, resolved, prepared } = session;
  const ex = getExercise(block.exerciseId);
  const driver = driverFor(block.exerciseId);
  const beatsPerBar = prepared.beatsPerBar ?? cfg.block.beatsPerBar;

  const [prepLeft, setPrepLeft] = useState(prepared.prepSeconds ?? 0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tick, setTick] = useState<BeatTick | null>(null);
  const [volume, setVolume] = useState(0.8);
  const auto = useRef<Record<string, number | string>>({ ...(prepared.autoMeasures ?? {}) });
  const metro = useRef<Metronome | null>(null);
  const lastBpm = useRef(block.targetBpm);
  const playing = prepLeft <= 0;

  // Horloge du bloc : temps joué, pauses et préparation exclues.
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (paused) return;
      if (!playing) setPrepLeft((p) => Math.max(0, p - dt));
      else setElapsed((e) => e + dt);
    }, 200);
    return () => clearInterval(id);
  }, [paused, playing]);

  // Métronome, démarré à la fin de la préparation.
  useEffect(() => {
    if (!ex.metronome || !playing) return;
    const tempoAt = prepared.tempoAt ?? (() => block.targetBpm);
    const planner = createClickPlanner({
      beatsPerBar,
      countInBars: cfg.block.countInBars,
      metronome: resolved?.effects.metronome,
      tempoAt,
      rng: cryptoRng,
    });
    const m = new Metronome({
      beatsPerBar,
      nextBar: () => planner.next(),
      onBeat: (t) => {
        lastBpm.current = t.bar.bpm;
        setTick(t);
      },
      volume,
    });
    metro.current = m;
    void m.start();
    return () => m.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => metro.current?.setVolume(volume), [volume]);

  const togglePause = useCallback(async () => {
    if (paused) await metro.current?.resume();
    else await metro.current?.pause();
    setPaused(!paused);
  }, [paused]);

  const report = useCallback((m: Record<string, number | string>) => {
    auto.current = { ...auto.current, ...m };
  }, []);

  useWakeLock(true);
  useHotkeys({ p: () => void togglePause() });

  const remaining = block.plannedMinutes * 60 - elapsed;
  const timeUp = remaining <= 0;

  function finish() {
    metro.current?.stop();
    onDebrief({ playedSeconds: Math.round(elapsed), lastBpm: lastBpm.current, auto: auto.current });
  }
  function abandon() {
    metro.current?.stop();
    onAbandon(Math.round(elapsed));
  }

  return (
    <div className="runner">
      <div className="runner-top">
        <div>
          <h2>{ex.id} · {ex.name}</h2>
          <p className="dim">{block.plannedMinutes} min{ex.metronome ? ` · ${block.targetBpm} BPM` : ""}</p>
        </div>
        <div className={`clock ${timeUp ? "over" : ""}`} aria-live="off">
          {playing ? fmtClock(remaining) : fmtClock(prepLeft)}
        </div>
      </div>

      {!playing && (
        <div className="notice">
          <span>Préparation : lis la grille avant de jouer. Le métronome démarre à la fin du décompte.</span>
          <button type="button" className="btn" onClick={() => setPrepLeft(0)}>Commencer maintenant</button>
        </div>
      )}
      {timeUp && (
        <div className="notice">
          <span>Temps écoulé. Termine ta phrase, puis passe au débrief.</span>
          <button type="button" className="btn primary" onClick={finish}>Débriefer</button>
        </div>
      )}

      {resolved && <ModPanel resolved={resolved} draws={block.draws} tick={tick} chorusBars={prepared.chorusBars ?? 4} />}

      <div className="stage">
        <driver.Panel
          block={block}
          draws={block.draws}
          mod={resolved}
          tick={tick}
          cfg={cfg}
          dicts={dicts}
          rng={cryptoRng}
          paused={paused || !playing}
          prep={!playing}
          chorusBars={prepared.chorusBars ?? 4}
          report={report}
        />
      </div>

      {ex.metronome && playing && <Rail tick={tick} beatsPerBar={beatsPerBar} bpm={tick?.bar.bpm ?? block.targetBpm} />}

      <div className="runner-actions">
        <button type="button" className="btn big" onClick={togglePause}>{paused ? "Reprendre" : "Pause"} <span className="kbd">P</span></button>
        {cfg.block.allowEarlyFinish && !timeUp && (
          <button type="button" className="btn" onClick={finish}>Terminer maintenant</button>
        )}
        <ConfirmAction label="Abandonner" question="Aucun mod ne sera gagné ni consommé." confirmLabel="Abandonner le bloc" onConfirm={abandon} />
        {ex.metronome && (
          <label className="row dim" style={{ marginLeft: "auto" }}>
            Volume
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </label>
        )}
      </div>
    </div>
  );
}

function Rail({ tick, beatsPerBar, bpm }: { tick: BeatTick | null; beatsPerBar: number; bpm: number }) {
  const bar = tick?.bar;
  return (
    <div className="rail" aria-label="Métronome">
      <div className="rail-row">
        <div className="bpm num">{bpm}<small>BPM</small></div>
        <div className="cells" style={{ ["--beats" as string]: beatsPerBar }}>
          {Array.from({ length: beatsPerBar }, (_, i) => {
            const beat = i + 1;
            const armed = bar ? bar.clicks.includes(beat) : true;
            const now = tick?.beat === beat;
            return <div key={beat} className={`cell ${armed ? "armed" : ""} ${now ? "now" : ""} ${bar?.countIn ? "countin" : ""}`} />;
          })}
        </div>
      </div>
      <p className="dim">
        {!bar ? "Décompte…" : bar.countIn ? "Décompte" : `Mesure ${bar.playedIndex + 1}`}
        {bar && !bar.countIn && bar.clicks.length === 0 ? " · clic coupé" : ""}
      </p>
    </div>
  );
}

function ModPanel({ resolved, draws, tick, chorusBars }: {
  resolved: ResolvedMod;
  draws: Record<string, unknown>;
  tick: BeatTick | null;
  chorusBars: number;
}) {
  const { mod, instance, effects, lines } = resolved;
  const live = (draws.mod ?? {}) as { targets?: string[]; switches?: number[] };
  const bar = tick && !tick.bar.countIn ? tick.bar.playedIndex : null;
  const announces: string[] = [];
  if (bar !== null) {
    if (effects.choruses) announces.push(`Chorus ${Math.min(chorusNumber(bar, chorusBars), effects.choruses)} / ${effects.choruses}`);
    if (effects.callResponse) {
      const ph = callResponsePhase(bar, effects.callResponse.bars, effects.callResponse.echoRhythm);
      announces.push(ph === "question" ? "Question : joue" : ph === "reponse" ? "Réponse : même rythme" : "Silence");
    }
    if (live.targets && effects.liveAnnounce?.kind === "cible") {
      announces.push(`Cible au temps 1 : ${targetAt(live.targets, bar, effects.liveAnnounce.everyBars)}`);
    }
    if (live.switches) {
      const f = feelAt(live.switches, bar);
      announces.push(`${f.feel === "two" ? "Two-feel" : "Four"}${f.upcoming ? ` · bascule à la prochaine mesure` : ""}`);
    }
  }
  return (
    <div className={`mod r-${instance.rarity}`}>
      <div className="head">
        <span className="name">{mod.name}</span>
        <span className={`plate r-${instance.rarity}`}>{RARITY_LABEL[instance.rarity]}</span>
      </div>
      <div className="level">{lines[1]}</div>
      <div className="dim">{lines[0]}</div>
      {lines.slice(2).map((l) => <div key={l} className="dim">{l}</div>)}
      <div className="meta"><EnforcementTag app={resolved.appliedByApp} /></div>
      {announces.map((a) => <div key={a.split(":")[0]} className="announce">{a}</div>)}
    </div>
  );
}
