#!/usr/bin/env node
/**
 * Vérifie avant publication qu'aucun fichier personnel ni secret ne part en ligne.
 * Lancé après chaque build (npm run build) : chez l'hébergeur, un échec arrête le déploiement.
 *
 * 1. dist/ (ce qui est publié) : seulement les types de fichiers attendus, aucun motif de clé d'API, aucune sauvegarde,
 *    non indexation en place (balise meta, robots.txt).
 * 2. Sources (ce qui part sur GitHub, hors node_modules et dist) : aucun motif de clé, aucune sauvegarde, aucun fichier
 *    de partition. (Le .gitignore les écarte déjà ; ceci rattrape un ajout forcé.)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const problems = [];
const KEY = /sk-ant-[A-Za-z0-9_-]{16,}/; // clé Anthropic (le texte d'aide « sk-ant-… » de l'app ne correspond pas)
const BACKUP = /"format"\s*:\s*"(basse-run-backup|basse-lowend-backup)"|"standards"\s*:\s*\[\s*\{|"pieces"\s*:\s*\[\s*\{/;
const DIST_OK = new Set([".html", ".js", ".css", ".woff2", ".svg", ".webmanifest", ".txt", ""]);
const PERSONAL = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".gif", ".musicxml", ".mxl", ".mscz", ".gp", ".gpx", ".gp5", ".zip", ".csv"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-single", ".git", "envois"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(f)) walk(p, out);
    } else out.push(p);
  }
  return out;
}
const rel = (p) => relative(root, p).replace(/\\/g, "/");
const isText = (p) => [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".html", ".css", ".txt", ".yml", ".yaml", ".toml", ".jsonc", ".webmanifest", ""].includes(extname(p));

// 1. Ce qui est publié
for (const out of ["dist", "dist-single"]) {
  const dir = join(root, out);
  if (!existsSync(dir)) continue;
  for (const p of walk(dir)) {
    const r = rel(p);
    const ext = extname(p).toLowerCase();
    const appIcon = ext === ".png" && /^dist[^/]*\/icons\/[a-z0-9-]+\.png$/.test(r);
    if (!DIST_OK.has(ext) && !appIcon) problems.push(`${r} : type de fichier inattendu dans le site publié`);
    if (ext === ".txt" && !r.includes("/licences-polices/") && !r.endsWith("/robots.txt")) problems.push(`${r} : fichier texte inattendu dans le site publié`);
    if (isText(p) || ext === ".js") {
      const s = readFileSync(p, "utf8");
      if (KEY.test(s)) problems.push(`${r} : contient ce qui ressemble à une clé d'API`);
      if (ext === ".json" && BACKUP.test(s)) problems.push(`${r} : ressemble à une sauvegarde`);
    }
  }
  const index = join(dir, "index.html");
  if (existsSync(index) && !/<meta name="robots" content="noindex/.test(readFileSync(index, "utf8"))) problems.push(`${out}/index.html : balise noindex absente`);
  if (out === "dist" && existsSync(index) && !existsSync(join(dir, "robots.txt"))) problems.push("dist/robots.txt absent");
}
// Le dossier dist/ des sources ne doit contenir que le build : walk() l'a sauté ci-dessous.

// 2. Ce qui part sur GitHub
for (const p of walk(root)) {
  const r = rel(p);
  const ext = extname(p).toLowerCase();
  if (r.startsWith("tests/fixtures/")) continue;
  if (PERSONAL.has(ext) && !/^public\/icons\/[a-z0-9-]+\.png$/.test(r)) problems.push(`${r} : fichier personnel possible (partition, image, archive) dans les sources`);
  if (/^basse-run-.*\.json$/.test(r.split("/").pop())) problems.push(`${r} : sauvegarde de l'app dans les sources`);
  if (isText(p) && statSync(p).size < 5_000_000) {
    const s = readFileSync(p, "utf8");
    if (KEY.test(s)) problems.push(`${r} : contient ce qui ressemble à une clé d'API`);
    if (ext === ".json" && r !== "package.json" && r !== "package-lock.json" && BACKUP.test(s) && !r.startsWith("src/")) problems.push(`${r} : ressemble à une sauvegarde`);
  }
}

if (problems.length) {
  console.error("Publication refusée :\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log("Vérification avant publication : rien de personnel ni de secret, non indexation en place.");
