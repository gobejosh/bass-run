#!/usr/bin/env node
/**
 * Prépare la mise en ligne depuis le navigateur seul (GitHub → Add file → Upload files, 100 fichiers au plus par envoi).
 * Copie dans envois/envoi-1, envoi-2… les fichiers que Git suivrait (le .gitignore est appliqué), en gardant les chemins :
 * on fait glisser le CONTENU de chaque dossier envoi-N à la racine du dépôt, dans l'ordre.
 * Le dossier .github (publication automatique) est toujours dans le dernier envoi : la première publication part ainsi
 * avec tous les fichiers en place.
 * Usage : node tools/pack-envois.mjs   (nécessite git, pour appliquer le .gitignore)
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const MAX = 95; // marge sous la limite de 100
const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n").filter(Boolean).filter((f) => !f.startsWith("envois/")).sort();

/** Groupes de fichiers d'au plus MAX, en découpant un dossier trop gros par sous-dossiers. */
function groups(list, depth) {
  const by = new Map();
  for (const f of list) {
    const parts = f.split("/");
    const key = parts.length > depth + 1 ? parts.slice(0, depth + 1).join("/") : `${parts.slice(0, depth).join("/")}/·fichiers`;
    by.set(key, [...(by.get(key) ?? []), f]);
  }
  return [...by.values()].flatMap((g) => (g.length > MAX && depth < 6 ? groups(g, depth + 1) : [g]));
}

const workflow = files.filter((f) => f.startsWith(".github/"));
const rest = files.filter((f) => !f.startsWith(".github/"));
const batches = [];
for (const g of groups(rest, 0)) {
  const b = batches.find((x) => x.length + g.length <= MAX);
  if (b) b.push(...g);
  else batches.push([...g]);
}
const last = batches[batches.length - 1];
if (last && last.length + workflow.length <= MAX) last.push(...workflow);
else batches.push(workflow);
rmSync("envois", { recursive: true, force: true });
batches.forEach((b, i) => {
  for (const f of b) {
    const to = join("envois", `envoi-${i + 1}`, f);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(f, to);
  }
  console.log(`envoi-${i + 1} : ${b.length} fichiers`);
});
console.log(`${files.length} fichiers en ${batches.length} envois.`);
