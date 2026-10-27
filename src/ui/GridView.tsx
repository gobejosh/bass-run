import { useEffect, useState } from "react";
import { displaySymbol, type ChordEvent } from "../core/grid";
import type { Grid } from "../core/library";
import type { QualityDef } from "../core/theory/dictionaries";
import type { Notation } from "../core/theory/notes";
import type { Repo } from "../storage/repo";

/** Grille mesure par mesure, 4 mesures par ligne, mesure en cours surlignée. */
export function GridView({ grid, qualities, notation, current, compact }: {
  grid: Grid;
  qualities: readonly QualityDef[];
  notation: Notation;
  current?: number | null;
  /** Aperçu dense (saisie) plutôt que lecture au pupitre. */
  compact?: boolean;
}) {
  return (
    <div className={`grid-view ${compact ? "compact" : ""}`} role="list" aria-label="Grille">
      {grid.map((m, i) => (
        <div key={i} className={`bar ${current === i ? "now" : ""}`} role="listitem" data-chords={m.filter((t) => t !== ".").length}>
          <span className="bar-n">{i + 1}</span>
          <span className="bar-chords">
            {m.filter((t) => t !== ".").map((t, j) => <span key={j}>{displaySymbol(t, qualities, notation)}</span>)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Fragment : suite d'accords, largeur proportionnelle à la durée. */
export function FragmentView({ events, qualities, notation }: { events: ChordEvent[]; qualities: readonly QualityDef[]; notation: Notation }) {
  return (
    <div className="fragment">
      {events.map((e, i) => (
        <div key={i} className="frag-chord" style={{ flexGrow: e.beats }}>
          <span className="frag-name">{displaySymbol(e.symbol, qualities, notation)}</span>
          <span className="dim">{e.beats} temps</span>
        </div>
      ))}
    </div>
  );
}

/** Partition importée (PDF ou image), lue depuis la base. */
export function ScoreView({ repo, blobId, title }: { repo: Repo; blobId: string; title: string }) {
  const [url, setUrl] = useState<{ href: string; mime: string } | null>(null);
  useEffect(() => {
    let href: string | null = null;
    void repo.blob(blobId).then((b) => {
      if (!b) return;
      href = URL.createObjectURL(b.data);
      setUrl({ href, mime: b.mime });
    });
    return () => {
      if (href) URL.revokeObjectURL(href);
    };
  }, [repo, blobId]);
  if (!url) return <p className="dim">Chargement de la partition…</p>;
  return url.mime === "application/pdf" ? (
    <div className="stack" style={{ gap: 6 }}>
      <iframe className="score" src={url.href} title={title} />
      {/* Certains navigateurs (Chrome sur Android notamment) n'affichent pas un PDF dans la page. */}
      <a className="btn ghost" href={url.href} target="_blank" rel="noopener">Ouvrir la partition en plein écran</a>
    </div>
  ) : (
    <img className="score" src={url.href} alt={title} />
  );
}
