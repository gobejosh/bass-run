import { useEffect, useState } from "react";
import { drawFragmentRange, drawMode, enabledModes, type ModeDraw } from "../../core/draw";
import { chordEvents } from "../../core/grid";
import type { Grid } from "../../core/library";
import { hasGrid, type Piece } from "../../core/repertoire";
import type { Rng } from "../../core/rng";
import type { Dictionaries } from "../../core/theory/dictionaries";
import { noteName, type Notation } from "../../core/theory/notes";
import { modeNotes } from "../../core/theory/scales";
import type { AppConfig } from "../../core/config";
import { NextButton, NoteRow, RevealToggle } from "./shared";
import type { ExerciseDriver } from "./types";

interface ChainStep {
  modeId: string;
  tonic: { letter: number; alter: number };
}

/** Un mode par accord reconnu de la grille, dans l'ordre. */
function allSteps(std: Piece, dicts: Dictionaries): ChainStep[] {
  return chordEvents(std.grid as Grid, std.beatsPerBar)
    .filter((e) => e.chord?.quality)
    .map((e) => ({ modeId: dicts.qualities.find((x) => x.id === e.chord!.quality)!.mode, tonic: e.chord!.root }));
}

function pickChain(rng: Rng, steps: ChainStep[], cfg: AppConfig): ChainStep[] {
  const { min, max } = cfg.man02.chainLength;
  const r = drawFragmentRange(rng, steps.length, Math.min(min, steps.length), Math.min(max, steps.length));
  return steps.slice(r.start, r.start + r.length);
}

const modeLabel = (d: { tonic: { letter: number; alter: number }; modeId: string }, dicts: Dictionaries, notation: Notation) =>
  `${noteName(d.tonic, notation)} ${dicts.modes.find((m) => m.id === d.modeId)?.name ?? d.modeId}`;

export const man02Driver: ExerciseDriver = {
  Chooser({ repo, choice, onChange }) {
    const [standards, setStandards] = useState<Piece[]>([]);
    useEffect(() => void repo.pieces().then((all) => setStandards(all.filter(hasGrid))), [repo]);
    const variant = choice.variant ?? "isole";
    return (
      <div className="field">
        <span>Variante</span>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={variant === "isole"} onClick={() => onChange({ variant: "isole" })}>Mode isolé</button>
          <button type="button" className="chip" aria-pressed={variant === "enchainement"} disabled={standards.length === 0}
            onClick={() => onChange({ variant: "enchainement", pieceId: "" })}>
            Enchaînement depuis un morceau
          </button>
        </div>
        {standards.length === 0 && <span className="dim">L'enchaînement demande un morceau avec sa grille (onglet Répertoire).</span>}
        {variant === "enchainement" && (
          <select className="input" value={choice.pieceId ?? ""} onChange={(e) => onChange({ ...choice, pieceId: e.target.value })}>
            <option value="">Morceau tiré au hasard</option>
            {standards.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        )}
      </div>
    );
  },

  async prepare({ choice, cfg, dicts, rng, repo }) {
    if (choice.variant === "enchainement") {
      const all = (await repo.pieces()).filter(hasGrid);
      const pool = all.filter((p) => cfg.session.drawStatuses.includes(p.status));
      const std = all.find((s) => s.id === choice.pieceId) ?? (pool.length ? pool : all)[rng.int((pool.length ? pool : all).length)];
      if (!std) throw new Error("Aucun morceau avec grille dans le répertoire.");
      const steps = allSteps(std, dicts);
      if (steps.length === 0) throw new Error(`Aucun accord reconnu dans la grille de « ${std.title} ».`);
      const chain = pickChain(rng, steps, cfg);
      return { draws: { variant: "enchainement", pieceId: std.id, title: std.title, steps, chain, direction: rng.next() < 0.5 ? "ascendant" : "descendant" } };
    }
    const d = drawMode(rng, enabledModes(dicts, cfg.man02.families));
    return { draws: { variant: "isole", first: { modeId: d.mode.id, tonic: d.tonic, direction: d.direction } } };
  },

  Panel({ draws, cfg, dicts, rng }) {
    const notation = cfg.display.notation;
    const octaves = cfg.man02.octaves === 2 ? "2 octaves" : "1 octave";
    const modes = enabledModes(dicts, cfg.man02.families);
    const [count, setCount] = useState(1);

    // Enchaînement : la chaîne entière est affichée, on avance d'un mode à la fois.
    const [chain, setChain] = useState(draws.chain as ChainStep[] | undefined);
    const [pos, setPos] = useState(0);
    const [single, setSingle] = useState(() => {
      const f = draws.first as { modeId: string; tonic: ModeDraw["tonic"]; direction: ModeDraw["direction"] } | undefined;
      return f;
    });

    if (draws.variant === "enchainement" && chain) {
      const dir = draws.direction as string;
      const cur = chain[pos]!;
      return (
        <>
          <p className="consigne">Enchaîne les modes de « {String(draws.title)} », un mode par accord, {dir} sur {octaves}, en nommant chaque note.</p>
          <div className="big">{modeLabel(cur, dicts, notation)}</div>
          <div className="chain" aria-label="Enchaînement">
            {chain.map((s, i) => (
              <span key={i} className="row" style={{ gap: 14 }}>
                {i > 0 && <span className="arrow">›</span>}
                <span className={`step ${i === pos ? "on" : ""}`}>{modeLabel(s, dicts, notation)}</span>
              </span>
            ))}
          </div>
          <NextButton
            label={pos < chain.length - 1 ? "Mode suivant" : "Nouvel enchaînement"}
            onNext={() => {
              if (pos < chain.length - 1) setPos(pos + 1);
              else {
                setPos(0);
                setChain(pickChain(rng, draws.steps as ChainStep[], cfg));
              }
            }}
          />
          <RevealToggle label="Afficher les notes">
            <NoteRow notes={modeNotes(cur.tonic, dicts.modes.find((m) => m.id === cur.modeId)!)} notation={notation} />
          </RevealToggle>
        </>
      );
    }

    const cur = single!;
    const mode = dicts.modes.find((m) => m.id === cur.modeId)!;
    return (
      <>
        <p className="consigne">Joue le mode {cur.direction} sur {octaves} en prononçant chaque note avec son altération.</p>
        <div className="big">{noteName(cur.tonic, notation)} {mode.name}</div>
        <div className="mid">{cur.direction === "ascendant" ? "↑ Ascendant" : "↓ Descendant"}</div>
        <NextButton
          label="Mode suivant"
          onNext={() => {
            const d = drawMode(rng, modes);
            setSingle({ modeId: d.mode.id, tonic: d.tonic, direction: d.direction });
            setCount(count + 1);
          }}
        />
        <p className="dim">Mode {count}</p>
        <RevealToggle label="Afficher les notes">
          <NoteRow notes={modeNotes(cur.tonic, mode)} notation={notation} />
        </RevealToggle>
      </>
    );
  },
};
