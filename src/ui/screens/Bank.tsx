/** Banque de standards inconnus (DEC-01, DEC-02) : à part du répertoire, avec ses règles anti-spoil. */
import { useEffect, useState } from "react";
import type { UnknownStandard } from "../../core/library";
import { matchThemes, parseLibraryText, type ImportIssue, type ParsedStandard } from "../../core/libraryIO";
import { ConfirmAction, FilePick } from "../components";
import { useApp } from "../context";
import { GridView, ScoreView } from "../GridView";

/* ================================================================== banque inconnue */

export function BankSection() {
  const { repo, dicts, cfg } = useApp();
  const [counts, setCounts] = useState({ neverDrawn: 0, drawn: 0, neverWithGrid: 0, neverWithTheme: 0 });
  const [drawn, setDrawn] = useState<UnknownStandard[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [report, setReport] = useState<{ text: string; issues: ImportIssue[] } | null>(null);
  const [gridFile, setGridFile] = useState<File | null>(null);
  const [themeFiles, setThemeFiles] = useState<File[]>([]);

  const reload = () => {
    void repo.bankCounts().then(setCounts);
    void repo.drawnBank().then(setDrawn);
  };
  useEffect(reload, [repo]);

  async function doImport() {
    const { entries, issues }: { entries: ParsedStandard[]; issues: ImportIssue[] } = gridFile
      ? parseLibraryText(await gridFile.text())
      : { entries: themeFiles.map((f) => ({ title: f.name.replace(/\.[^.]+$/, ""), beatsPerBar: 4, theme: f.name })), issues: [] };
    const matches = matchThemes(entries, themeFiles.map((f) => f.name));
    const themes = new Map<number, { name: string; mime: string; data: Blob }>();
    for (const [i, name] of matches) {
      const f = themeFiles.find((x) => x.name === name)!;
      themes.set(i, { name: f.name, mime: f.type || "application/octet-stream", data: f });
    }
    // Un standard annoncé « thème seul » mais dont le fichier manque n'a plus rien : on l'écarte.
    const usable = entries.filter((e, i) => e.grid || themes.has(i));
    const usableThemes = new Map<number, { name: string; mime: string; data: Blob }>();
    entries.forEach((e, i) => {
      const j = usable.indexOf(e);
      if (j >= 0 && themes.has(i)) usableThemes.set(j, themes.get(i)!);
    });
    const r = await repo.importBank(usable, usableThemes);
    const missingThemes = entries.filter((e, i) => e.theme && !themes.has(i)).length;
    setReport({
      text: `${r.added} standard(s) ajouté(s) à la banque, dont ${r.themes} avec thème.${missingThemes ? ` ${missingThemes} thème(s) annoncé(s) sans fichier correspondant.` : ""}`,
      issues,
    });
    setGridFile(null);
    setThemeFiles([]);
    reload();
  }

  return (
    <section className="stack">
      <h2>Banque de déchiffrage</h2>
      <p className="dim" style={{ maxWidth: "70ch" }}>
        Pour DEC-01 et DEC-02. Le contenu n'est jamais affiché avant son tirage : l'import ne montre que des compteurs,
        et un standard devient consultable ici une fois tiré.
      </p>
      <div className="row" style={{ gap: 32 }}>
        <div><div className="counter num">{counts.neverDrawn}</div><span className="dim">jamais tirés ({counts.neverWithGrid} avec grille, {counts.neverWithTheme} avec thème)</span></div>
        <div><div className="counter num">{counts.drawn}</div><span className="dim">déjà tirés</span></div>
      </div>

      <div className="editor">
        <div className="form-grid">
          <label className="field">
            <span>Grilles (fichier .txt ou .json, format dans docs/IMPORT.md)</span>
            <FilePick label="Choisir le fichier de grilles" accept=".txt,.json,text/plain,application/json" files={gridFile ? [gridFile] : []} onFiles={(f) => setGridFile(f[0] ?? null)} />
          </label>
          <label className="field">
            <span>Thèmes (PDF ou images, plusieurs fichiers possibles)</span>
            <FilePick label="Choisir les partitions" multiple accept="application/pdf,image/*" files={themeFiles} onFiles={setThemeFiles} />
          </label>
        </div>
        <p className="dim">
          Les thèmes sont rattachés par la ligne « Thème: » du fichier de grilles, sinon par titre. Sans fichier de grilles, chaque partition devient un standard « thème seul » (DEC-02).
        </p>
        <div className="row">
          <button type="button" className="btn primary" disabled={!gridFile && themeFiles.length === 0} onClick={() => void doImport()}>Importer dans la banque</button>
          {counts.neverDrawn > 0 && (
            <ConfirmAction label="Vider les jamais tirés" question={`Supprimer les ${counts.neverDrawn} standards jamais tirés ? Les déjà tirés restent.`} confirmLabel="Vider" onConfirm={async () => {
              await repo.clearNeverDrawn();
              reload();
            }} />
          )}
        </div>
        {report && (
          <div className="stack" style={{ gap: 4 }}>
            <p>{report.text}</p>
            {report.issues.map((i, k) => <p key={k} className="dim">{i.message}</p>)}
          </div>
        )}
      </div>

      {drawn.length > 0 && (
        <div className="list">
          <h3>Déjà tirés</h3>
          {drawn.map((s) => (
            <div key={s.id} className="stack" style={{ gap: 8 }}>
              <div className="list-item">
                <span><strong>{s.title}</strong> <span className="dim">· tiré le {new Date(s.drawnAt ?? 0).toLocaleDateString("fr-FR")}</span></span>
                <button type="button" className="btn ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Fermer" : "Voir"}</button>
              </div>
              {open === s.id && (
                <div className="stack">
                  {s.grid && <GridView grid={s.grid} qualities={dicts.qualities} notation={cfg.display.notation} />}
                  {s.themeBlobId && <ScoreView repo={repo} blobId={s.themeBlobId} title={s.title} />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

