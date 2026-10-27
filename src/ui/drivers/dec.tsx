import { useMemo } from "react";
import { transposeGrid } from "../../core/grid";
import type { Grid, KeySig } from "../../core/library";
import { chorusNumber } from "../../core/mods/live";
import type { TranspositionStep } from "../../core/transpose";
import { useApp } from "../context";
import { GridView, ScoreView } from "../GridView";
import { gridModDraws, keyLabel } from "./grid";
import type { ExerciseDriver } from "./types";

/**
 * DEC-01 (walking à vue) et DEC-02 (thème à vue).
 * Le standard est tiré au lancement dans la banque inconnue et marqué « tiré » aussitôt.
 * Préparation de N secondes (grille ou thème visibles), puis le métronome démarre.
 */
function makeDecDriver(kind: "walking" | "theme"): ExerciseDriver {
  return {
    async prepare(ctx) {
      const s = await ctx.repo.drawUnknown(kind === "walking" ? "grid" : "theme");
      const extra = gridModDraws(ctx, s.key, s.grid);
      return {
        draws: {
          unknownId: s.id,
          title: s.title,
          key: s.key,
          ...(kind === "walking" ? { grid: s.grid } : { themeBlobId: s.themeBlobId, grid: s.grid }),
          ...extra.draws,
        },
        beatsPerBar: s.beatsPerBar,
        chorusBars: s.grid?.length || ctx.cfg.rep01.defaultPassageBars,
        prepSeconds: ctx.cfg.dec.prepSeconds,
      };
    },

    Panel({ draws, cfg, dicts, tick, chorusBars }) {
      const { repo } = useApp();
      const notation = cfg.display.notation;
      const playedIndex = tick && !tick.bar.countIn ? tick.bar.playedIndex : null;
      const chorus = playedIndex === null ? 1 : chorusNumber(playedIndex, chorusBars);
      const steps = draws.transpositions as TranspositionStep[] | undefined;
      const step = steps ? steps[(chorus - 1) % steps.length] : undefined;
      const src = draws.grid as Grid | undefined;
      const grid = useMemo(
        () => (src && step ? transposeGrid(src, step.letters, step.semis, dicts.qualities, notation) : src),
        [src, step, dicts.qualities, notation],
      );
      const key = keyLabel(draws.key as KeySig | undefined, notation);

      return (
        <>
          <p className="consigne">{kind === "walking" ? "Walking bass à vue sur cette grille." : "Joue le thème à vue."}</p>
          <div>
            <div className="mid">{String(draws.title)}</div>
            <p className="dim">{key}{step ? ` · à jouer en ${step.label}${steps!.length > 1 ? ` (chorus ${chorus})` : ""}` : ""}</p>
          </div>
          {kind === "walking" && grid && (
            <GridView grid={grid} qualities={dicts.qualities} notation={notation} current={playedIndex === null ? null : playedIndex % grid.length} />
          )}
          {kind === "theme" && typeof draws.themeBlobId === "string" && <ScoreView repo={repo} blobId={draws.themeBlobId} title={String(draws.title)} />}
          {kind === "theme" && grid && (
            <details>
              <summary className="dim">Grille</summary>
              <GridView grid={grid} qualities={dicts.qualities} notation={notation} />
            </details>
          )}
        </>
      );
    },
  };
}

export const dec01Driver = makeDecDriver("walking");
export const dec02Driver = makeDecDriver("theme");
