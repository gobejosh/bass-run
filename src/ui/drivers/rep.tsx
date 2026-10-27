import { useEffect, useState } from "react";
import { TIER_LABEL, type Passage, type Tier } from "../../core/library";
import { hasPassages, weakestPassage, type Piece } from "../../core/repertoire";
import { chorusNumber, scoreVisible } from "../../core/mods/live";
import { cryptoRng, pick } from "../../core/rng";
import type { TranspositionStep } from "../../core/transpose";
import { useApp } from "../context";
import { ScoreView } from "../GridView";
import { gridModDraws, keyLabel } from "./grid";
import type { ExerciseDriver } from "./types";

const passageBars = (p: Passage, fallback: number) =>
  p.fromBar !== undefined && p.toBar !== undefined && p.toBar >= p.fromBar ? p.toBar - p.fromBar + 1 : fallback;

const passageLabel = (p: Passage) =>
  `${p.label}${p.fromBar !== undefined ? ` (mes. ${p.fromBar}${p.toBar !== undefined ? `–${p.toBar}` : ""})` : ""}`;

export const repDriver: ExerciseDriver = {
  Chooser({ repo, choice, onChange }) {
    const [list, setList] = useState<Piece[]>([]);
    useEffect(() => void repo.pieces().then((all) => setList(all.filter(hasPassages))), [repo]);
    const melody = list.find((m) => m.id === choice.pieceId);

    const select = (m: Piece | undefined, p: Passage | undefined) =>
      onChange({ ...choice, pieceId: m?.id, passageId: p?.id, passageTier: p?.tier });

    // Morceau et passage de la séance s'il y en a, sinon le premier morceau et son passage le moins avancé.
    useEffect(() => {
      if (!list.length) return;
      const m = list.find((x) => x.id === choice.pieceId) ?? list[0]!;
      const p = m.passages.find((x) => x.id === choice.passageId) ?? weakestPassage(m) ?? m.passages[0];
      if (choice.pieceId !== m.id || choice.passageId !== p?.id || choice.passageTier !== p?.tier) select(m, p);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list]);

    if (list.length === 0) return null;
    return (
      <div className="stack" style={{ gap: 12 }}>
        <label className="field">
          <span>Mélodie</span>
          <select className="input" value={choice.pieceId ?? ""} onChange={(e) => {
            const m = list.find((x) => x.id === e.target.value);
            select(m, m?.passages[0]);
          }}>
            {list.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>
        {melody && (
          <label className="field">
            <span>Passage</span>
            <select className="input" value={choice.passageId ?? ""} onChange={(e) => select(melody, melody.passages.find((p) => p.id === e.target.value))}>
              {melody.passages.map((p) => <option key={p.id} value={p.id}>{passageLabel(p)} · {TIER_LABEL[p.tier]}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="btn ghost" style={{ justifySelf: "start" }} onClick={() => {
          const m = pick(cryptoRng, list);
          select(m, pick(cryptoRng, m.passages));
        }}>Tirer une mélodie au hasard</button>
      </div>
    );
  },

  async prepare(ctx) {
    const melody = ctx.choice.pieceId ? await ctx.repo.piece(ctx.choice.pieceId) : undefined;
    const passage = melody?.passages.find((p) => p.id === ctx.choice.passageId);
    if (!melody || !passage) throw new Error("Choisis une mélodie et un passage.");
    const extra = gridModDraws(ctx, melody.key, undefined);
    return {
      draws: {
        pieceId: melody.id,
        passageId: passage.id,
        title: melody.title,
        passage: passageLabel(passage),
        key: melody.key,
        targetBpm: passage.targetBpm,
        tier: passage.tier,
        ...extra.draws,
      },
      beatsPerBar: melody.beatsPerBar ?? ctx.cfg.block.beatsPerBar,
      chorusBars: passageBars(passage, ctx.cfg.rep01.defaultPassageBars),
      autoMeasures: { passage: passageLabel(passage), palier: passage.tier },
      ...(extra.prepSeconds ? { prepSeconds: extra.prepSeconds } : {}),
    };
  },

  Panel({ draws, mod, cfg, tick, prep, chorusBars }) {
    const { repo } = useApp();
    const [melody, setMelody] = useState<Piece | null>(null);
    const pid = (draws.pieceId ?? draws.melodyId) as string;
    useEffect(() => void repo.piece(pid).then((m) => setMelody(m ?? null)), [repo, pid]);
    const playedIndex = tick && !tick.bar.countIn ? tick.bar.playedIndex : null;
    const chorus = playedIndex === null ? 1 : chorusNumber(playedIndex, chorusBars);
    const steps = draws.transpositions as TranspositionStep[] | undefined;
    const step = steps ? steps[(chorus - 1) % steps.length] : undefined;
    const visible = scoreVisible(mod?.effects.hide, { prep, playedIndex, chorusBars });
    const key = keyLabel(draws.key as never, cfg.display.notation);

    return (
      <>
        <div>
          <div className="mid">{String(draws.title)}</div>
          <p className="dim">
            {String(draws.passage)} · palier {TIER_LABEL[draws.tier as Tier]}
            {draws.targetBpm ? ` · tempo visé ${String(draws.targetBpm)}` : ""}
            {key ? ` · ${key}` : ""}
          </p>
        </div>
        {step && (
          <div className="announce">
            Transpose en {step.label}{steps!.length > 1 ? ` (chorus ${chorus})` : ""}
            {!draws.key ? " · tonalité d'origine non renseignée, calcul depuis Do majeur" : ""}
          </div>
        )}
        {typeof draws.memoryKey === "string" && <div className="announce">De mémoire, en {draws.memoryKey}</div>}
        {!visible ? (
          <div className="hidden-grid">{prep ? "" : "Partition masquée : joue de mémoire"}</div>
        ) : melody?.scoreBlobId ? (
          <ScoreView repo={repo} blobId={melody.scoreBlobId} title={melody.title} />
        ) : (
          <p className="dim">Aucune partition pour ce morceau (onglet Répertoire).</p>
        )}
      </>
    );
  },
};
