import { useEffect, useRef, useState } from "react";
import { nextPitch, spellForMan01, stringSequence, type StringOrder } from "../../core/draw";
import { noteName, type SpelledNote } from "../../core/theory/notes";
import { Meter, useCountdown } from "./shared";
import type { ExerciseDriver } from "./types";

const ORDERS: [StringOrder, string][] = [
  ["grave-aigu", "Grave vers aigu"],
  ["aigu-grave", "Aigu vers grave"],
  ["aleatoire", "Aléatoire"],
];

/** Durée d'une note (en temps) selon la figure imposée par Cadence. */
const NOTE_BEATS = { blanches: 2, noires: 1, croches: 0.5, triolets: 1 / 3 } as const;

export const man01Driver: ExerciseDriver = {
  Chooser({ choice, onChange }) {
    const order = (choice.order ?? "grave-aigu") as StringOrder;
    return (
      <div className="field">
        <span>Ordre des cordes</span>
        <div className="chips">
          {ORDERS.map(([id, label]) => (
            <button key={id} type="button" className="chip" aria-pressed={order === id} onClick={() => onChange({ ...choice, order: id })}>{label}</button>
          ))}
        </div>
      </div>
    );
  },

  async prepare({ choice, cfg, mod }) {
    const order = (choice.order ?? "grave-aigu") as StringOrder;
    const factor = mod?.effects.timeLimitFactor ?? 1;
    return {
      draws: { order, timeLimitSec: Math.round(cfg.man01.timeLimitSec * factor * 10) / 10 },
      autoMeasures: { notes: 0 },
    };
  },

  Panel({ draws, mod, cfg, rng, paused, tick, report }) {
    const strings = cfg.instrument.strings.map((s) => s.name);
    const order = draws.order as StringOrder;
    const limit = draws.timeLimitSec as number;
    const spelling = mod?.effects.spelling;
    const maxFret = mod?.effects.maxFret;
    const cadence = mod?.effects.noteValue;

    const blackCount = useRef(0);
    const [count, setCount] = useState(0);
    const [state, setState] = useState(() => draw(undefined));

    function draw(prevPc: number | undefined): { pc: number; note: SpelledNote; seq: string[] } {
      const pc = nextPitch(rng, prevPc);
      const note = spellForMan01(rng, pc, spelling, blackCount.current);
      if ([1, 3, 6, 8, 10].includes(pc)) blackCount.current++;
      return { pc, note, seq: stringSequence(rng, order, strings) };
    }
    function advance() {
      setState((s) => draw(s.pc));
      setCount((c) => c + 1);
    }

    useEffect(() => report({ notes: count + 1 }), [count, report]);

    // Sans Cadence : chrono en secondes. Avec Cadence : la note change à la mesure, calée sur le métronome.
    const left = useCountdown(limit, paused || !!cadence, count, () => {
      if (!cadence) advance();
    });
    const barsPerNote = cadence ? Math.max(1, Math.ceil((strings.length * NOTE_BEATS[cadence]) / cfg.block.beatsPerBar)) : 0;
    const lastBar = useRef<number | null>(null);
    useEffect(() => {
      if (!cadence || !tick || tick.bar.countIn || tick.beat !== 1) return;
      const i = tick.bar.playedIndex;
      if (lastBar.current === null) {
        lastBar.current = i;
        return;
      }
      if (i - lastBar.current >= barsPerNote) {
        lastBar.current = i;
        advance();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    return (
      <>
        <p className="consigne">
          {maxFret !== undefined
            ? `Toutes les positions de la note sur chaque corde, ${maxFret === null ? "sur tout le manche" : `jusqu'à la case ${maxFret}`}.`
            : `Une position par corde, cases 0 à ${cfg.man01.maxFret}.`}
          {cadence ? ` Une corde par ${cadence === "blanches" ? "blanche" : cadence === "noires" ? "noire" : cadence === "croches" ? "croche" : "triolet"}, nouvelle note toutes les ${barsPerNote} mesure${barsPerNote > 1 ? "s" : ""}.` : ""}
        </p>
        <div className="big" aria-live="polite">{noteName(state.note, cfg.display.notation)}</div>
        <div className="mid dim">{state.seq.join("  ›  ")}</div>
        {!cadence && <Meter ratio={left / limit} />}
        <div className="row dim">
          <span>Note {count + 1}</span>
          {!cadence && <span>{limit} s par note</span>}
          <button type="button" className="btn ghost" onClick={advance}>Note suivante</button>
        </div>
      </>
    );
  },
};
