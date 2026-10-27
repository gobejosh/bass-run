import { useMemo } from "react";
import { drawDirections, drawMode, drawMotif, enabledModes } from "../../core/draw";
import { horizonBars } from "../../core/mods/live";
import { ladderBpmAtBar, progressiveLadder } from "../../core/tempo";
import { noteName, type SpelledNote } from "../../core/theory/notes";
import { modeNotes, upFourth } from "../../core/theory/scales";
import { NoteRow, RevealToggle } from "./shared";
import type { ExerciseDriver } from "./types";

const NOTE_VALUE_LABEL = { blanches: "en blanches", noires: "en noires", croches: "en croches", triolets: "en triolets" } as const;

export const mod01Driver: ExerciseDriver = {
  async prepare({ cfg, dicts, rng, mod, blockBpm }) {
    const d = drawMode(rng, enabledModes(dicts, cfg.man02.families));
    const motif = drawMotif(rng, dicts.motifs);
    const ladder = progressiveLadder(blockBpm, cfg);
    const draws: Record<string, unknown> = { modeId: d.mode.id, tonic: d.tonic, motifId: motif.id, ladder };
    if (mod?.effects.retrograde && "announced" in mod.effects.retrograde) {
      const reps = Math.ceil(horizonBars(60, blockBpm, cfg.block.beatsPerBar) / cfg.mod01.repetitionBars);
      draws.directions = drawDirections(rng, reps);
    }
    return { draws, tempoAt: (i) => ladderBpmAtBar(ladder, i, cfg) };
  },

  Panel({ draws, mod, cfg, dicts, tick }) {
    const notation = cfg.display.notation;
    const mode = dicts.modes.find((m) => m.id === draws.modeId)!;
    const motif = dicts.motifs.find((m) => m.id === draws.motifId)!;
    const ladder = draws.ladder as number[];
    const bar = tick && !tick.bar.countIn ? tick.bar.playedIndex : 0;
    const step = Math.min(ladder.length - 1, Math.floor(bar / cfg.mod01.stepEveryBars));
    const barsToNext = step < ladder.length - 1 ? cfg.mod01.stepEveryBars - (bar % cfg.mod01.stepEveryBars) : null;

    // Cycle des quartes : la tonique monte d'une quarte toutes les N mesures.
    const every = mod?.effects.fourthsEveryBars;
    const tonics = useMemo(() => {
      const out: SpelledNote[] = [draws.tonic as SpelledNote];
      for (let i = 0; i < 24; i++) out.push(upFourth(out[out.length - 1]!));
      return out;
    }, [draws.tonic]);
    const tonicIdx = every ? Math.floor(bar / every) % 12 : 0;
    const tonic = tonics[tonicIdx]!;
    const nextTonic = tonics[tonicIdx + 1]!;
    const barsToNextTonic = every ? every - (bar % every) : null;

    const retro = mod?.effects.retrograde;
    const dirs = draws.directions as ("endroit" | "envers")[] | undefined;
    const rep = Math.floor(bar / cfg.mod01.repetitionBars);
    const noteValue = mod?.effects.noteValue;

    return (
      <>
        <p className="consigne">
          Joue le motif à travers le mode depuis la tonique{noteValue ? `, ${NOTE_VALUE_LABEL[noteValue]}` : ""}. Le tempo monte de {cfg.mod01.stepBpm} BPM toutes les {cfg.mod01.stepEveryBars} mesures.
        </p>
        <div className="big">{noteName(tonic, notation)} {mode.name}</div>
        <div className="mid">Motif {motif.name}</div>
        {every && (
          <div className="announce">
            Tonique suivante : {noteName(nextTonic, notation)} dans {barsToNextTonic} mesure{barsToNextTonic! > 1 ? "s" : ""}
          </div>
        )}
        {retro && "announced" in retro && dirs && tick && !tick.bar.countIn && (
          <div className="announce">Répétition {rep + 1} : {dirs[rep] === "envers" ? "à l'envers" : "à l'endroit"}</div>
        )}
        <dl className="kv">
          <dt>Palier</dt>
          <dd className="num">{step + 1} / {ladder.length} · {ladder[step]} BPM</dd>
          <dt>Prochain palier</dt>
          <dd>{barsToNext === null ? "Plafond atteint, tiens ce tempo" : `${ladder[step + 1]} BPM dans ${barsToNext} mesure${barsToNext > 1 ? "s" : ""}`}</dd>
        </dl>
        <RevealToggle label="Afficher les notes du mode">
          <NoteRow notes={modeNotes(tonic, mode)} notation={notation} />
        </RevealToggle>
      </>
    );
  },
};
