import { useCallback, useEffect, useRef, useState } from "react";
import { drawChord, drawFunction, enabledQualities, type ChordDraw } from "../../core/draw";
import { chordName, functionLabel, functionNote, FUNCTION_LABEL } from "../../core/theory/chords";
import { noteName } from "../../core/theory/notes";
import { Meter } from "./shared";
import type { ExerciseDriver, PanelProps } from "./types";

interface Question {
  chord: ChordDraw;
  fn: string;
  shownAt: number;
  /** Fenêtre de réponse en secondes. */
  window: number;
}

type Outcome = { ok: boolean; reaction: number };

const FEEDBACK_MS = 1200;

export const man03Driver: ExerciseDriver = {
  async prepare() {
    return { draws: {}, autoMeasures: { questions: 0, rates: 0 } };
  },
  Panel: Man03Panel,
};

function Man03Panel({ mod, cfg, dicts, rng, paused, tick, report }: PanelProps) {
  const notation = cfg.display.notation;
  const qualities = enabledQualities(dicts, cfg.chords.enabledQualities);
  const extensions = mod?.effects.functions;
  const bw = mod?.effects.beatWindow;
  const arp = mod?.effects.arpeggio;

  const [q, setQ] = useState<Question | null>(null);
  const [last, setLast] = useState<{ q: Question; o: Outcome } | null>(null);
  const [now, setNow] = useState(performance.now());
  const results = useRef<Outcome[]>([]);
  const pausedAt = useRef<number | null>(null);

  const ask = useCallback((window: number) => {
    setQ((prev) => ({
      chord: drawChord(rng, qualities, dicts),
      fn: drawFunction(rng, extensions, prev?.fn),
      shownAt: performance.now(),
      window,
    }));
    setLast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qRef = useRef<Question | null>(null);
  qRef.current = q;

  const close = useCallback((ok: boolean) => {
    const cur = qRef.current;
    if (!cur) return;
    qRef.current = null;
    const reaction = (performance.now() - cur.shownAt) / 1000;
    const o = { ok: ok && reaction <= cur.window, reaction };
    results.current.push(o);
    const hits = results.current.filter((r) => r.ok);
    report({
      questions: results.current.length,
      rates: results.current.length - hits.length,
      ...(hits.length ? { reactionMoy: Math.round((hits.reduce((sum, r) => sum + r.reaction, 0) / hits.length) * 100) / 100 } : {}),
    });
    setQ(null);
    setLast({ q: cur, o });
  }, [report]);

  // Mode libre : une question, réponse au tap, nouvelle question après le retour visuel.
  useEffect(() => {
    if (bw || paused) return;
    if (!q && !last) ask(cfg.man03.timeoutSec);
    if (!q && last) {
      const t = setTimeout(() => ask(cfg.man03.timeoutSec), FEEDBACK_MS);
      return () => clearTimeout(t);
    }
  }, [bw, paused, q, last, ask, cfg.man03.timeoutSec]);

  // Pause : on décale l'instant d'affichage pour ne pas compter le temps de pause.
  useEffect(() => {
    if (paused) pausedAt.current = performance.now();
    else if (pausedAt.current !== null) {
      const d = performance.now() - pausedAt.current;
      pausedAt.current = null;
      setQ((cur) => (cur ? { ...cur, shownAt: cur.shownAt + d } : cur));
    }
  }, [paused]);

  // Horloge d'affichage + délai dépassé.
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      const t = performance.now();
      setNow(t);
      const cur = qRef.current;
      if (cur && (t - cur.shownAt) / 1000 > cur.window) close(false);
    }, 50);
    return () => clearInterval(id);
  }, [paused, close]);

  // Sur le temps : questions calées sur le métronome.
  useEffect(() => {
    if (!bw || !tick || tick.bar.countIn || paused) return;
    const beatSec = 60 / tick.bar.bpm;
    const i = tick.bar.playedIndex;
    if ("beats" in bw) {
      if (tick.beat === 1) ask(bw.beats * beatSec);
    } else if (i % 2 === 0 && tick.beat === cfg.block.beatsPerBar) {
      ask(bw.next === "beat" ? beatSec : beatSec / 2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Tap : Espace, Entrée, ou la zone à l'écran.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.code !== "Enter") return;
      e.preventDefault();
      close(true);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [close]);

  const shown = q ?? last?.q;
  const quality = shown?.chord.quality;
  const fnLabel = shown && quality ? (FUNCTION_LABEL[shown.fn] ?? functionLabel(shown.fn, quality)) : "";
  const hits = results.current.filter((r) => r.ok);

  return (
    <>
      <p className="consigne">
        {arp
          ? `Joue l'arpège (${arp.notes === 3 ? "triade" : "4 sons"}${arp.octaves === 2 ? ", 2 octaves" : ""}${arp.roundTrip ? ", aller-retour" : ""}) en partant de la note demandée, puis tape.`
          : "Joue la note demandée, puis tape l'écran ou appuie sur Espace."}
        {bw && ("beats" in bw ? ` Fenêtre : ${bw.beats} temps.` : bw.next === "beat" ? " La question tombe sur le 4 : joue sur le temps suivant." : " La question tombe sur le 4 : joue sur le contretemps suivant.")}
      </p>
      {shown ? (
        <>
          <div className="big">{chordName({ root: shown.chord.root, quality: shown.chord.quality.id, suffix: "" }, dicts.qualities, notation)}</div>
          <div className="mid">{fnLabel}</div>
        </>
      ) : (
        <div className="mid dim">{bw ? "La question arrive sur le temps…" : "…"}</div>
      )}
      {q && <Meter ratio={1 - (now - q.shownAt) / 1000 / q.window} />}
      {last && (
        <p className={last.o.ok ? "result-ok" : "result-ko"}>
          {noteName(functionNote(last.q.chord.root, last.q.chord.quality, last.q.fn), notation)} ·{" "}
          {last.o.ok ? `${last.o.reaction.toFixed(2)} s` : "hors délai"}
        </p>
      )}
      <button type="button" className="tap" onClick={() => close(true)} disabled={!q}>Joué</button>
      <p className="dim">
        {results.current.length} question{results.current.length > 1 ? "s" : ""}
        {hits.length ? ` · moyenne ${(hits.reduce((s, r) => s + r.reaction, 0) / hits.length).toFixed(2)} s` : ""}
        {results.current.length - hits.length ? ` · ${results.current.length - hits.length} hors délai` : ""}
      </p>
    </>
  );
}
