/**
 * Import de standards (en cours d'étude ou banque inconnue) depuis un texte ou du JSON.
 *
 * Format texte, un standard par bloc, blocs séparés par une ligne « --- » :
 *
 *   Titre: Autumn Leaves
 *   Tonalité: Sol m
 *   Mesure: 4
 *   Thème: autumn-leaves.pdf
 *   | Cm7 | F7 | Bbmaj7 | Ebmaj7 |
 *   | Am7b5 | D7 | Gm6 | % |
 *
 * Seul « Titre » est obligatoire. « Tonalité » : tonique + « m » pour mineur (Sol m, Gm, Fa, Eb).
 * « Thème » : nom du fichier de partition importé en même temps (DEC-02).
 *
 * Format JSON : tableau d'objets { title, key?, beatsPerBar?, grid?, theme? } où grid est le texte de grille.
 *
 * Les messages d'erreur ne citent JAMAIS de contenu (titre, accord) : seulement des numéros,
 * pour pouvoir servir à la banque inconnue sans spoiler.
 */
import { parseGridText } from "./grid";
import type { Grid, KeySig } from "./library";
import { parseNote } from "./theory/notes";

export interface ParsedStandard {
  title: string;
  key?: KeySig;
  beatsPerBar: number;
  grid?: Grid;
  /** Nom de fichier de partition attendu (sans chemin). */
  theme?: string;
  /** Répertoire seulement (ignorés pour la banque inconnue). */
  composer?: string;
  form?: string;
}

export interface ImportIssue {
  /** Numéro du standard dans le fichier (1 = premier). */
  entry: number;
  message: string;
}

export function parseKey(text: string): KeySig | undefined {
  const t = text.trim();
  const p = parseNote(t);
  if (!p) return undefined;
  const rest = p.rest.trim().toLowerCase();
  const minor = /^(m|min|mineur|minor|-)$/.test(rest);
  if (rest && !minor && !/^(maj|majeur|major)$/.test(rest)) return undefined;
  return { tonic: t.slice(0, t.length - p.rest.length).trim(), minor };
}

type Raw = { title?: string; key?: string; beats?: string; grid?: string; theme?: string; composer?: string; form?: string };

function finalize(entry: number, raw: Raw, issues: ImportIssue[]): ParsedStandard | null {
  if (!raw.title?.trim()) {
    issues.push({ entry, message: `standard n° ${entry} : titre manquant` });
    return null;
  }
  const out: ParsedStandard = { title: raw.title.trim(), beatsPerBar: 4 };
  if (raw.key) {
    const k = parseKey(raw.key);
    if (k) out.key = k;
    else issues.push({ entry, message: `standard n° ${entry} : tonalité illisible (ignorée)` });
  }
  if (raw.beats) {
    const b = Number(raw.beats);
    if (Number.isInteger(b) && b >= 2 && b <= 7) out.beatsPerBar = b;
    else issues.push({ entry, message: `standard n° ${entry} : mesure illisible, 4 temps retenus` });
  }
  if (raw.grid?.trim()) {
    const { grid, issues: gi } = parseGridText(raw.grid);
    if (grid.length) out.grid = grid;
    if (gi.length) {
      const bars = [...new Set(gi.map((i) => i.measure))].join(", ");
      issues.push({ entry, message: `standard n° ${entry} : ${gi.length} symbole(s) non reconnu(s), mesure(s) ${bars} (gardés tels quels)` });
    }
  }
  if (raw.theme?.trim()) out.theme = raw.theme.trim().split(/[\\/]/).pop();
  if (raw.composer?.trim()) out.composer = raw.composer.trim();
  if (raw.form?.trim()) out.form = raw.form.trim();
  if (!out.grid && !out.theme) {
    issues.push({ entry, message: `standard n° ${entry} : ni grille ni thème` });
    return null;
  }
  return out;
}

const HEADER = /^\s*(titre|title|tonalit[ée]|key|mesure|meter|th[èe]me|theme|compositeur|composer|forme|form)\s*:\s*(.*)$/i;

export function parseLibraryText(text: string): { entries: ParsedStandard[]; issues: ImportIssue[] } {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return parseLibraryJson(trimmed);
  const blocks = text.replace(/\r/g, "").split(/^\s*---+\s*$/m).filter((b) => b.trim());
  const entries: ParsedStandard[] = [];
  const issues: ImportIssue[] = [];
  blocks.forEach((block, i) => {
    const raw: Raw = {};
    const gridLines: string[] = [];
    for (const line of block.split("\n")) {
      const h = HEADER.exec(line);
      if (h) {
        const k = h[1]!.toLowerCase();
        const v = h[2]!;
        if (k.startsWith("tit")) raw.title = v;
        else if (k.startsWith("ton") || k === "key") raw.key = v;
        else if (k.startsWith("mes") || k === "meter") raw.beats = v;
        else if (k.startsWith("comp")) raw.composer = v;
        else if (k.startsWith("form")) raw.form = v;
        else raw.theme = v;
      } else if (line.trim() && !line.trim().startsWith("#")) {
        gridLines.push(line);
      }
    }
    raw.grid = gridLines.join("\n");
    const s = finalize(i + 1, raw, issues);
    if (s) entries.push(s);
  });
  return { entries, issues };
}

export function parseLibraryJson(text: string): { entries: ParsedStandard[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { entries: [], issues: [{ entry: 0, message: "JSON illisible" }] };
  }
  const list = Array.isArray(data) ? data : [data];
  const entries: ParsedStandard[] = [];
  list.forEach((item, i) => {
    if (typeof item !== "object" || item === null) {
      issues.push({ entry: i + 1, message: `standard n° ${i + 1} : objet attendu` });
      return;
    }
    const o = item as Record<string, unknown>;
    const s = finalize(i + 1, {
      title: typeof o.title === "string" ? o.title : undefined,
      key: typeof o.key === "string" ? o.key : undefined,
      beats: o.beatsPerBar !== undefined ? String(o.beatsPerBar) : undefined,
      grid: typeof o.grid === "string" ? o.grid : Array.isArray(o.grid) ? (o.grid as unknown[]).map((m) => (Array.isArray(m) ? m.join(" ") : String(m))).join(" | ") : undefined,
      theme: typeof o.theme === "string" ? o.theme : undefined,
      composer: typeof o.composer === "string" ? o.composer : undefined,
      form: typeof o.form === "string" ? o.form : undefined,
    }, issues);
    if (s) entries.push(s);
  });
  return { entries, issues };
}

/** Rattache les fichiers de thème importés aux standards (par nom de fichier, puis par titre). */
export function matchThemes(entries: ParsedStandard[], fileNames: string[]): Map<number, string> {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "");
  const byNorm = new Map(fileNames.map((f) => [norm(f), f]));
  const out = new Map<number, string>();
  entries.forEach((e, i) => {
    const f = (e.theme && (fileNames.find((x) => x === e.theme) ?? byNorm.get(norm(e.theme)))) ?? byNorm.get(norm(e.title));
    if (f) out.set(i, f);
  });
  return out;
}
