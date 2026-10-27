/**
 * Répertoire : les morceaux à travailler (grille, mélodie découpée en passages, statut, devoir, notes)
 * et, dans un onglet à part, la banque de déchiffrage avec ses règles anti-spoil.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../icons";
import { gridToText, parseGridText } from "../../core/grid";
import { TIER_LABEL, TIERS, type Passage, type Tier } from "../../core/library";
import { parseKey, parseLibraryText } from "../../core/libraryIO";
import { newId } from "../../core/mods/drop";
import { defaultHomeworkDue, isoDate, type DayEntry } from "../../core/planning";
import {
  hasGrid, hasPassages, lastPlayedByPiece, aliasMap, maintenanceDue, PIECE_STATUS_LABEL, PIECE_STATUSES,
  type Homework, type Piece, type PieceStatus, type Priority,
} from "../../core/repertoire";
import type { ExerciseId } from "../../core/types";
import { ConfirmAction, FilePick, Segmented, Tag } from "../components";
import { useApp } from "../context";
import { GridView, ScoreView } from "../GridView";
import { fmtDay, sinceLabel } from "../dates";
import { BankSection } from "./Bank";

type Filter = "tous" | PieceStatus | "entretien" | "devoirs";

export function RepertoireScreen() {
  const [tab, setTab] = useState<"pieces" | "bank">("pieces");
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="screen-head">
        <h1>Répertoire</h1>
        <Segmented label="Listes" value={tab} onChange={setTab} options={[["pieces", "Mes morceaux"], ["bank", "Banque de déchiffrage"]]} />
      </div>
      {tab === "pieces" ? <PiecesTab /> : <BankSection />}
    </div>
  );
}

const FOCUS_CHOICES: ExerciseId[] = ["WLK-03", "IMP-03", "REP-01", "WLK-02", "IMP-02", "MAN-02"];

function emptyPiece(): Piece {
  const now = Date.now();
  return { id: newId(), title: "", beatsPerBar: 4, passages: [], status: "a-apprendre", priority: 0, homework: null, createdAt: now, updatedAt: now };
}

function PiecesTab() {
  const { repo, cfg } = useApp();
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [last, setLast] = useState<Map<string, number>>(new Map());
  const [planning, setPlanning] = useState<DayEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("tous");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<{ piece: Piece; isNew: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    const [p, blocks, plan] = await Promise.all([repo.pieces(), repo.blocks(), repo.planning()]);
    setPieces(p);
    setLast(lastPlayedByPiece(blocks, aliasMap(p)));
    setPlanning(plan);
  };
  useEffect(() => void reload(), [repo]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const due = (p: Piece) => maintenanceDue(p, last, now, cfg.session.maintenanceAfterDays);
  const counts: Record<Filter, number> = {
    tous: pieces.length,
    "a-apprendre": pieces.filter((p) => p.status === "a-apprendre").length,
    "en-cours": pieces.filter((p) => p.status === "en-cours").length,
    su: pieces.filter((p) => p.status === "su").length,
    entretien: pieces.filter(due).length,
    devoirs: pieces.filter((p) => p.homework).length,
  };
  const q = query.trim().toLowerCase();
  const shown = pieces.filter((p) =>
    (filter === "tous" || (filter === "entretien" ? due(p) : filter === "devoirs" ? !!p.homework : p.status === filter)) &&
    (!q || p.title.toLowerCase().includes(q) || (p.composer ?? "").toLowerCase().includes(q)),
  ).sort((a, b) => Number(!!b.homework) - Number(!!a.homework) || (a.homework?.due ?? "").localeCompare(b.homework?.due ?? "") || a.title.localeCompare(b.title, "fr"));

  async function importFile(files: File[]) {
    const f = files[0];
    if (!f) return;
    const { entries, issues } = parseLibraryText(await f.text());
    const n = await repo.importPieces(entries);
    setMsg(`${n} morceau(x) importé(s), statut « À apprendre ».${issues.length ? " " + issues.map((i) => i.message).join(" ; ") : ""}`);
    await reload();
  }

  const filters: [Filter, string][] = [["tous", "Tous"], ["a-apprendre", "À apprendre"], ["en-cours", "En cours"], ["su", "Su"], ["entretien", "À entretenir"], ["devoirs", "Devoirs"]];

  return (
    <div className="rep-layout" data-open={!!open}>
      <section className="panel rep-list" aria-label="Liste des morceaux">
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setOpen({ piece: emptyPiece(), isNew: true })}>+ Nouveau morceau</button>
          <FilePick label="Importer un fichier" accept=".txt,.json,text/plain,application/json" files={[]} onFiles={(f) => void importFile(f)} />
        </div>
        {msg && <p className="dim">{msg}</p>}
        <input className="input" type="search" placeholder="Chercher un titre, un compositeur" aria-label="Chercher" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips" role="group" aria-label="Filtre">
          {filters.map(([f, l]) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{l} · {counts[f]}</button>
          ))}
        </div>
        {pieces.length === 0 ? (
          <p className="empty">Aucun morceau. Ajoute ceux que tu travailles, avec leur grille ou leur mélodie.</p>
        ) : shown.length === 0 ? (
          <p className="empty">Aucun morceau dans ce filtre.</p>
        ) : (
          <div className="list">
            {shown.map((p) => (
              <button key={p.id} type="button" className="piece-row" aria-pressed={open?.piece.id === p.id} onClick={() => setOpen({ piece: p, isNew: false })}>
                <span className="piece-main">
                  <span className="piece-title">{p.title}</span>
                  <span className="dim piece-meta">{[p.composer, keyText(p), p.form, hasGrid(p) ? "grille" : null, hasPassages(p) ? `mélodie, ${p.passages.length} passage${p.passages.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="piece-side">
                  {p.homework ? <Tag tone="sodium">Devoir · {fmtDay(p.homework.due)}</Tag> : due(p) ? <Tag tone="strong">Su · à entretenir</Tag> : <Tag tone={p.status === "en-cours" ? "holo" : "plain"}>{PIECE_STATUS_LABEL[p.status]}</Tag>}
                  <span className="dim small">{sinceLabel(last.get(p.id), now)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {open && (
        <PieceEditor
          key={open.piece.id}
          initial={open.piece}
          isNew={open.isNew}
          lastPlayed={last.get(open.piece.id)}
          defaultDue={defaultHomeworkDue(planning, isoDate(new Date()))}
          onClose={() => setOpen(null)}
          onSaved={async (p) => { await reload(); setOpen({ piece: p, isNew: false }); }}
          onDeleted={async () => { setOpen(null); await reload(); }}
        />
      )}
    </div>
  );
}

const keyText = (p: Pick<Piece, "key">) => (p.key ? `${p.key.tonic}${p.key.minor ? " m" : ""}` : "");

function PieceEditor({ initial, isNew, lastPlayed, defaultDue, onClose, onSaved, onDeleted }: {
  initial: Piece;
  isNew: boolean;
  lastPlayed?: number;
  defaultDue: string;
  onClose: () => void;
  onSaved: (p: Piece) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { repo, dicts, cfg } = useApp();
  const [title, setTitle] = useState(initial.title);
  const [composer, setComposer] = useState(initial.composer ?? "");
  const [keyStr, setKeyStr] = useState(keyText(initial));
  const [beats, setBeats] = useState(initial.beatsPerBar);
  const [form, setForm] = useState(initial.form ?? "");
  const [status, setStatus] = useState<PieceStatus>(initial.status);
  const [priority, setPriority] = useState<Priority>(initial.priority);
  const [hw, setHw] = useState<Homework | null>(initial.homework ?? null);
  const [gridText, setGridText] = useState(initial.grid ? gridToText(initial.grid) : "");
  const [passages, setPassages] = useState<Passage[]>(initial.passages);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [scoreFile, setScoreFile] = useState<File | null>(null);
  const [dropScore, setDropScore] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (isNew) titleRef.current?.focus(); }, [isNew]);

  const parsed = useMemo(() => parseGridText(gridText), [gridText]);
  const key = keyStr.trim() ? parseKey(keyStr) : undefined;
  const keyBad = !!keyStr.trim() && !key;
  const canSave = !!title.trim() && !keyBad && passages.every((p) => p.label.trim()) && !busy;

  const setPassage = (i: number, p: Partial<Passage>) => setPassages(passages.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  async function save() {
    if (!canSave) return;
    setBusy(true);
    let scoreBlobId = dropScore ? undefined : initial.scoreBlobId;
    if ((scoreFile || dropScore) && initial.scoreBlobId) await repo.deleteBlob(initial.scoreBlobId);
    if (scoreFile) scoreBlobId = await repo.putBlob(scoreFile.name, scoreFile.type || "application/octet-stream", scoreFile);
    const { key: _k, grid: _g, scoreBlobId: _s, composer: _c, form: _f, notes: _n, ...rest } = initial;
    void [_k, _g, _s, _c, _f, _n];
    const piece: Piece = {
      ...rest,
      title: title.trim(),
      beatsPerBar: beats,
      status,
      priority,
      homework: hw,
      passages,
      ...(composer.trim() ? { composer: composer.trim() } : {}),
      ...(key ? { key } : {}),
      ...(form.trim() ? { form: form.trim() } : {}),
      ...(parsed.grid.length ? { grid: parsed.grid } : {}),
      ...(scoreBlobId ? { scoreBlobId } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    await repo.putPiece(piece);
    setBusy(false);
    await onSaved(piece);
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  };

  return (
    <section className="panel rep-editor" aria-label={isNew ? "Nouveau morceau" : `Fiche ${initial.title}`} onKeyDown={onKey}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn ghost rep-back" onClick={onClose}><Icon name="back" size={18} /> Liste</button>
        <span className="dim small">{isNew ? "Nouveau morceau" : `Dernier jeu : ${sinceLabel(lastPlayed, Date.now())}`}</span>
      </div>

      <div className="form-grid rep-fields">
        <label className="field span-2"><span>Titre</span><input ref={titleRef} className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>Compositeur</span><input className="input" value={composer} onChange={(e) => setComposer(e.target.value)} /></label>
        <label className="field"><span>Tonalité (Fa, Sol m, Bb…)</span><input className="input" value={keyStr} onChange={(e) => setKeyStr(e.target.value)} aria-invalid={keyBad} /></label>
        <label className="field"><span>Temps par mesure</span>
          <select className="input" value={beats} onChange={(e) => setBeats(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label className="field"><span>Forme</span><input className="input" placeholder="AABA, blues…" value={form} onChange={(e) => setForm(e.target.value)} /></label>
      </div>

      <div className="row">
        <Segmented label="Statut" value={status} onChange={setStatus} options={PIECE_STATUSES.map((s) => [s, PIECE_STATUS_LABEL[s]] as const)} />
        <span className="row" style={{ gap: 8 }}>
          <span className="dim">Priorité</span>
          <Segmented<Priority> label="Priorité" value={priority} onChange={setPriority} options={[[-1, "moins"], [0, "normale"], [1, "plus"]]} />
        </span>
      </div>

      <div className={`homework ${hw ? "on" : ""}`}>
        <label className="check">
          <input type="checkbox" checked={!!hw} onChange={(e) => setHw(e.target.checked ? { due: defaultDue } : null)} />
          <span>Devoir du prof</span>
        </label>
        {hw && (
          <>
            <label className="field"><span>Pour le</span><input className="input" type="date" value={hw.due} onChange={(e) => e.target.value && setHw({ ...hw, due: e.target.value })} /></label>
            <div className="field">
              <span>Travail visé (facultatif)</span>
              <div className="chips">
                {FOCUS_CHOICES.filter((id) => (id === "REP-01" ? passages.length > 0 : parsed.grid.length > 0)).map((id) => {
                  const on = hw.focus?.includes(id) ?? false;
                  return (
                    <button key={id} type="button" className="chip" aria-pressed={on}
                      onClick={() => setHw({ ...hw, focus: on ? (hw.focus ?? []).filter((x) => x !== id) : [...(hw.focus ?? []), id] })}>{id}</button>
                  );
                })}
              </div>
            </div>
            <label className="field"><span>Consigne du prof</span><input className="input" value={hw.note ?? ""} onChange={(e) => setHw({ ...hw, note: e.target.value })} /></label>
          </>
        )}
      </div>

      <div className="grid-edit">
        <label className="field">
          <span>Grille : « | » entre les mesures, espaces entre les accords, « % » répète, « . » prolonge d'un temps</span>
          <textarea className="input mono" spellCheck={false} value={gridText} onChange={(e) => setGridText(e.target.value)} placeholder="| Dm7 G7 | Cmaj7 | % |" />
        </label>
        <div className="field">
          <span>Aperçu · {parsed.grid.length} mesure{parsed.grid.length > 1 ? "s" : ""}{parsed.issues.length ? "" : parsed.grid.length ? " · tout est reconnu" : ""}</span>
          {parsed.grid.length > 0 ? <GridView grid={parsed.grid} qualities={dicts.qualities} notation={cfg.display.notation} compact /> : <p className="empty">La grille apparaît ici pendant la saisie.</p>}
          {parsed.issues.length > 0 && <p className="error">Non reconnu : {parsed.issues.map((i) => `« ${i.token} » (mes. ${i.measure})`).join(", ")}. Gardé tel quel à l'affichage.</p>}
          {parsed.grid.length > 0 && !key && <p className="dim">Sans tonalité, la transposition part du premier accord.</p>}
        </div>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <h3>Mélodie (REP-01)</h3>
        <div className="row">
          <FilePick label={initial.scoreBlobId && !dropScore ? "Remplacer la partition" : "Choisir la partition"} accept="application/pdf,image/*" files={scoreFile ? [scoreFile] : []} onFiles={(f) => { setScoreFile(f[0] ?? null); setDropScore(false); }} />
          {initial.scoreBlobId && !dropScore && !scoreFile && (
            <>
              <button type="button" className="btn ghost" onClick={() => setShowScore(!showScore)} aria-expanded={showScore}>{showScore ? "Masquer" : "Voir la partition"}</button>
              <button type="button" className="btn ghost" onClick={() => setDropScore(true)}>Retirer</button>
            </>
          )}
          {dropScore && <span className="dim">La partition sera retirée à l'enregistrement.</span>}
        </div>
        {showScore && initial.scoreBlobId && <ScoreView repo={repo} blobId={initial.scoreBlobId} title={initial.title} />}
        {passages.length === 0 && <p className="dim">Sans passage, le morceau n'est pas proposé en REP-01.</p>}
        {passages.map((p, i) => (
          <div key={p.id} className="passage-row">
            <label className="field"><span>Passage</span><input className="input" value={p.label} onChange={(e) => setPassage(i, { label: e.target.value })} /></label>
            <label className="field"><span>De la mes.</span><input className="input" inputMode="numeric" value={p.fromBar ?? ""} onChange={(e) => setPassage(i, { fromBar: num(e.target.value) })} /></label>
            <label className="field"><span>À la mes.</span><input className="input" inputMode="numeric" value={p.toBar ?? ""} onChange={(e) => setPassage(i, { toBar: num(e.target.value) })} /></label>
            <label className="field"><span>Tempo visé</span><input className="input" inputMode="numeric" value={p.targetBpm ?? ""} onChange={(e) => setPassage(i, { targetBpm: num(e.target.value) })} /></label>
            <label className="field"><span>Palier</span>
              <select className="input" value={p.tier} onChange={(e) => setPassage(i, { tier: e.target.value as Tier })}>
                {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </select>
            </label>
            <button type="button" className="btn ghost" aria-label={`Retirer ${p.label}`} onClick={() => setPassages(passages.filter((_, k) => k !== i))}>Retirer</button>
          </div>
        ))}
        <button type="button" className="btn ghost" style={{ justifySelf: "start" }}
          onClick={() => setPassages([...passages, { id: newId(), label: `Passage ${passages.length + 1}`, tier: "decouverte" }])}>+ Passage</button>
      </div>

      <label className="field"><span>Notes libres</span><textarea className="input notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

      <div className="row sticky-actions">
        <button type="button" className="btn primary big" disabled={!canSave} onClick={() => void save()}>Enregistrer <span className="kbd">Ctrl+Entrée</span></button>
        <button type="button" className="btn ghost" onClick={onClose}>Fermer</button>
        {!isNew && (
          <ConfirmAction label="Supprimer" question={`Supprimer « ${initial.title} » ? L'historique des blocs est conservé.`} confirmLabel="Supprimer"
            onConfirm={async () => { await repo.deletePiece(initial.id); await onDeleted(); }} />
        )}
      </div>
    </section>
  );
}
