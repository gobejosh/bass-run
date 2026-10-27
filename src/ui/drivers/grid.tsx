import { useEffect, useMemo, useState } from "react";
import { drawFragmentRange, drawRhythm } from "../../core/draw";
import { getExercise } from "../../core/exercises";
import { chordEvents, fragment, transposeGrid, type ChordEvent } from "../../core/grid";
import type { Grid, KeySig } from "../../core/library";
import { hasGrid, type Piece } from "../../core/repertoire";
import { chorusNumber, scoreVisible } from "../../core/mods/live";
import { sample, type Rng } from "../../core/rng";
import { planTransposition, sourceKey, type TranspositionStep } from "../../core/transpose";
import { chordTones } from "../../core/theory/chords";
import type { Dictionaries } from "../../core/theory/dictionaries";
import { drawAnyKey, fifthsOf, keyName, tonicFromFifths } from "../../core/theory/keys";
import { parseNote, type SpelledNote } from "../../core/theory/notes";
import { modeNotes } from "../../core/theory/scales";
import { useApp } from "../context";
import { FragmentView, GridView } from "../GridView";
import { spanLabel } from "./chord";
import { NoteRow, RhythmGrid } from "./shared";
import type { ExerciseDriver, PrepareContext } from "./types";

/** Choix d'un morceau du répertoire qui a une grille (ou tirage au hasard). */
export function StandardChooser({ repo, choice, onChange }: Parameters<NonNullable<ExerciseDriver["Chooser"]>>[0]) {
  const [list, setList] = useState<Piece[]>([]);
  useEffect(() => void repo.pieces().then((all) => setList(all.filter(hasGrid))), [repo]);
  if (list.length === 0) return null;
  return (
    <label className="field">
      <span>Morceau</span>
      <select className="input" value={choice.pieceId ?? ""} onChange={(e) => onChange({ ...choice, pieceId: e.target.value })}>
        <option value="">Tiré au hasard</option>
        {list.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
    </label>
  );
}

/** Palette réduite sur une grille : notes de l'accord de tonique d'abord, puis gamme de la tonalité. */
export function keyPalette(rng: Rng, key: { tonic: SpelledNote; minor: boolean }, dicts: Dictionaries, size: number): SpelledNote[] {
  const q = dicts.qualities.find((x) => x.id === (key.minor ? "m7" : "maj7"))!;
  const tones = chordTones(key.tonic, q);
  if (size <= tones.length) return sample(rng, tones, size);
  const mode = dicts.modes.find((m) => m.id === (key.minor ? "eolien" : "ionien"))!;
  const rest = modeNotes(key.tonic, mode).filter((n) => !tones.some((t) => t.letter === n.letter && t.alter === n.alter));
  return [...tones, ...sample(rng, rest, size - tones.length)];
}

/** Tirages communs aux exercices sur grille (standard en cours ou inconnu). */
export function gridModDraws(ctx: PrepareContext, key: KeySig | undefined, grid: Grid | undefined) {
  const { mod, rng, cfg, dicts } = ctx;
  const firstRoot = grid ? chordEvents(grid, 4).find((e) => e.chord)?.chord?.root : undefined;
  const src = sourceKey(key, firstRoot);
  const draws: Record<string, unknown> = {};
  const t = mod?.effects.transpose;
  if (t) draws.transpositions = planTransposition(rng, t, src, cfg.display.notation);
  const hide = mod?.effects.hide;
  if (hide && hide.mode === "title_only" && hide.randomKey) {
    const target = tonicFromFifths(drawAnyKey(rng, fifthsOf(src.tonic, src.minor)), src.minor);
    draws.memoryKey = keyName(target, src.minor, cfg.display.notation);
  }
  if (mod?.effects.paletteSize) draws.palette = keyPalette(rng, src, dicts, mod.effects.paletteSize);
  if (mod?.effects.rhythmMotifSpan) draws.rhythm = drawRhythm(rng, dicts.rhythms).id;
  return { draws, prepSeconds: hide && hide.mode === "preview" ? hide.seconds : undefined };
}

/** Morceau choisi, sinon tiré parmi les morceaux avec grille aux statuts retenus (Réglages > séances). */
export async function pickGridPiece(ctx: PrepareContext): Promise<Piece & { grid: Grid }> {
  const all = (await ctx.repo.pieces()).filter(hasGrid) as (Piece & { grid: Grid })[];
  if (all.length === 0) throw new Error("Ajoute d'abord un morceau avec sa grille (onglet Répertoire).");
  const chosen = all.find((s) => s.id === ctx.choice.pieceId);
  if (chosen) return chosen;
  const pool = all.filter((p) => ctx.cfg.session.drawStatuses.includes(p.status));
  const from = pool.length ? pool : all;
  return from[ctx.rng.int(from.length)]!;
}

export function keyLabel(key: KeySig | undefined, notation: "fr" | "en"): string {
  const p = key ? parseNote(key.tonic) : null;
  return p ? keyName(p.note, key!.minor, notation) : "";
}

function makeDriver(kind: "fragment" | "full"): ExerciseDriver {
  return {
    Chooser: StandardChooser,

    async prepare(ctx) {
      const std = await pickGridPiece(ctx);
      const events = chordEvents(std.grid, std.beatsPerBar);
      const extra = gridModDraws(ctx, std.key, std.grid);
      let chorusBars = std.grid.length;
      const draws: Record<string, unknown> = { pieceId: std.id, title: std.title, key: std.key, beatsPerBar: std.beatsPerBar, ...extra.draws };
      if (kind === "fragment") {
        const r = drawFragmentRange(ctx.rng, events.length);
        draws.fragment = r;
        chorusBars = fragment(events, r.start, r.length, std.beatsPerBar).bars;
      }
      return {
        draws,
        chorusBars,
        beatsPerBar: std.beatsPerBar,
        ...(extra.prepSeconds ? { prepSeconds: extra.prepSeconds } : {}),
      };
    },

    Panel(props) {
      const { block, draws, mod, cfg, dicts, tick, prep, rng, chorusBars } = props;
      const { repo } = useApp();
      const ex = getExercise(block.exerciseId);
      const notation = cfg.display.notation;
      const [std, setStd] = useState<(Piece & { grid: Grid }) | null>(null);
      const [range, setRange] = useState(draws.fragment as { start: number; length: number } | undefined);
      const pid = (draws.pieceId ?? draws.standardId) as string;
      useEffect(() => void repo.piece(pid).then((s) => setStd(s && hasGrid(s) ? (s as Piece & { grid: Grid }) : null)), [repo, pid]);

      const playedIndex = tick && !tick.bar.countIn ? tick.bar.playedIndex : null;
      const chorus = playedIndex === null ? 1 : chorusNumber(playedIndex, chorusBars);
      const steps = draws.transpositions as TranspositionStep[] | undefined;
      const step = steps ? steps[Math.min(steps.length - 1, (chorus - 1) % steps.length)] : undefined;
      const grid = useMemo(() => {
        if (!std) return null;
        return step ? transposeGrid(std.grid, step.letters, step.semis, dicts.qualities, notation) : std.grid;
      }, [std, step, dicts.qualities, notation]);
      const events: ChordEvent[] = useMemo(() => (grid ? chordEvents(grid, std!.beatsPerBar) : []), [grid, std]);

      const visible = scoreVisible(mod?.effects.hide, { prep, playedIndex, chorusBars });
      const rhythm = dicts.rhythms.find((r) => r.id === draws.rhythm);
      const key = keyLabel(draws.key as KeySig, notation);

      return (
        <>
          <p className="consigne">{ex.consigne}</p>
          <div>
            <div className="mid">{String(draws.title)}</div>
            <p className="dim">
              {key}
              {step ? ` · à jouer en ${step.label}${steps!.length > 1 ? ` (chorus ${chorus})` : ""}` : ""}
              {draws.memoryKey ? ` · à jouer en ${String(draws.memoryKey)}` : ""}
            </p>
          </div>
          {!grid ? null : !visible ? (
            <div className="hidden-grid">{prep ? "" : "Grille masquée : joue de mémoire"}</div>
          ) : kind === "fragment" && range ? (
            <FragmentView events={fragment(events, range.start, range.length, std!.beatsPerBar).events} qualities={dicts.qualities} notation={notation} />
          ) : (
            <GridView grid={grid} qualities={dicts.qualities} notation={notation} current={playedIndex === null ? null : playedIndex % grid.length} />
          )}
          {Array.isArray(draws.palette) && (
            <div className="stack" style={{ gap: 4 }}>
              <span className="dim">Palette réduite</span>
              <NoteRow notes={draws.palette as SpelledNote[]} notation={notation} />
            </div>
          )}
          {rhythm && mod?.effects.rhythmMotifSpan && (
            <div className="stack" style={{ gap: 4 }}>
              <span className="dim">Motif rythmique à développer {spanLabel(mod.effects.rhythmMotifSpan)}</span>
              <RhythmGrid motif={rhythm} />
            </div>
          )}
          {kind === "fragment" && std && visible && (
            <button type="button" className="btn ghost" style={{ justifySelf: "start" }}
              onClick={() => setRange(drawFragmentRange(rng, chordEvents(std.grid, std.beatsPerBar).length))}>
              Autre fragment
            </button>
          )}
        </>
      );
    },
  };
}

export const fragmentDriver = makeDriver("fragment");
export const fullGridDriver = makeDriver("full");
