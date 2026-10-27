import { useState } from "react";
import { drawChord, drawPalette, drawRhythm, enabledQualities, type ChordDraw } from "../../core/draw";
import type { Rng } from "../../core/rng";
import { chordName } from "../../core/theory/chords";
import type { Dictionaries, RhythmMotif } from "../../core/theory/dictionaries";
import type { SpelledNote } from "../../core/theory/notes";
import type { ModEffects } from "../../core/types";
import { getExercise } from "../../core/exercises";
import { NoteRow, RhythmGrid } from "./shared";
import type { ExerciseDriver } from "./types";

interface ChordState {
  chord: ChordDraw;
  palette?: SpelledNote[];
  rhythm?: RhythmMotif;
}

function drawAll(rng: Rng, dicts: Dictionaries, enabled: string[], effects?: ModEffects): ChordState {
  const chord = drawChord(rng, enabledQualities(dicts, enabled), dicts);
  return {
    chord,
    ...(effects?.paletteSize ? { palette: drawPalette(rng, chord, dicts, effects.paletteSize) } : {}),
    ...(effects?.rhythmMotifSpan ? { rhythm: drawRhythm(rng, dicts.rhythms) } : {}),
  };
}

export function spanLabel(span: NonNullable<ModEffects["rhythmMotifSpan"]>): string {
  if ("bars" in span) return `sur ${span.bars} mesures`;
  if ("choruses" in span) return `sur ${span.choruses} chorus`;
  return "sur tout le bloc";
}

/** WLK-01 et IMP-01 : un accord tiré au hasard (fondamentale + qualité). Un chorus = 4 mesures. */
export const chordDriver: ExerciseDriver = {
  async prepare({ cfg, dicts, rng, mod }) {
    const s = drawAll(rng, dicts, cfg.chords.enabledQualities, mod?.effects);
    return {
      draws: { root: s.chord.root, quality: s.chord.quality.id, ...(s.palette ? { palette: s.palette } : {}), ...(s.rhythm ? { rhythm: s.rhythm.id } : {}) },
      chorusBars: 4,
    };
  },

  Panel({ block, draws, mod, cfg, dicts, rng }) {
    const ex = getExercise(block.exerciseId);
    const [s, setS] = useState<ChordState>(() => ({
      chord: { root: draws.root as SpelledNote, quality: dicts.qualities.find((q) => q.id === draws.quality)! },
      palette: draws.palette as SpelledNote[] | undefined,
      rhythm: dicts.rhythms.find((r) => r.id === draws.rhythm),
    }));
    const name = chordName({ root: s.chord.root, quality: s.chord.quality.id, suffix: "" }, dicts.qualities, cfg.display.notation);
    return (
      <>
        <p className="consigne">{ex.consigne}</p>
        <div className="big">{name}</div>
        {s.palette && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="dim">Palette réduite</span>
            <NoteRow notes={s.palette} notation={cfg.display.notation} />
          </div>
        )}
        {s.rhythm && mod?.effects.rhythmMotifSpan && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="dim">Motif rythmique à développer {spanLabel(mod.effects.rhythmMotifSpan)}</span>
            <RhythmGrid motif={s.rhythm} />
          </div>
        )}
        <button type="button" className="btn ghost" style={{ justifySelf: "start" }}
          onClick={() => setS(drawAll(rng, dicts, cfg.chords.enabledQualities, mod?.effects))}>
          Nouvel accord
        </button>
      </>
    );
  },
};
