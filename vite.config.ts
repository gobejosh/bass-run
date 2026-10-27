import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// SINGLEFILE=1 produit un unique index.html autonome (pratique pour l'héberger n'importe où).
const singleFile = process.env.SINGLEFILE === "1";

/** Écrit dans dist/sw.js la liste de tous les fichiers du build (polices des 5 thèmes comprises) et un nom de cache unique. */
function precache(): Plugin {
  let outDir = "dist";
  return {
    name: "basse-run-precache",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).replace(/\\/g, "/"));
        }
      };
      walk(outDir);
      const list = files.filter((f) => f !== "sw.js" && !f.endsWith(".map")).sort().map((f) => `./${f}`);
      const swPath = join(outDir, "sw.js");
      let sw: string;
      try {
        sw = readFileSync(swPath, "utf8");
      } catch {
        return; // build sans service worker (simple fichier)
      }
      const hash = createHash("sha256").update(list.join("\n")).update(files.map((f) => statSync(join(outDir, f)).size).join(",")).digest("hex").slice(0, 10);
      sw = sw.replace(/const CACHE = "[^"]*";/, `const CACHE = "basse-run-${hash}";`).replace("const PRECACHE = [];", `const PRECACHE = ${JSON.stringify(list)};`);
      writeFileSync(swPath, sw);
    },
  };
}

/**
 * Politique de sécurité du contenu, posée en balise meta au build (marche chez tout hébergeur, GitHub Pages compris).
 * Aucun script en ligne ni venu d'ailleurs ; seule sortie réseau : l'API Claude, pour les récits du jeu (clé saisie dans l'app).
 * Les partitions s'affichent depuis des adresses blob: créées par l'app.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "frame-src blob:",
  "object-src 'none'",
  "connect-src 'self' https://api.anthropic.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function securityHtml(): Plugin {
  return {
    name: "basse-run-security-html",
    apply: "build",
    transformIndexHtml(html) {
      if (singleFile) {
        // Un seul fichier : le script de thème est mis en ligne (pas de CSP, qui l'interdirait).
        const boot = readFileSync("public/theme-boot.js", "utf8");
        return html.replace('<script src="./theme-boot.js"></script>', `<script>\n${boot}</script>`);
      }
      return html.replace("<meta charset=\"UTF-8\" />", `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), securityHtml(), ...(singleFile ? [viteSingleFile()] : [precache()])],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
