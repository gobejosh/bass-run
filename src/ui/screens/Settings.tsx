import { useEffect, useState } from "react";
import { DEFAULT_CONFIG } from "../../core/config";
import { ConfirmAction, Stepper } from "../components";
import { useApp } from "../context";
import { checkGameBackup, gameBackup, GameSettingsSection, restoreGameBackup } from "../../integration/game";
import { DictionariesSection } from "./Dictionaries";
import { SessionSettings } from "./SessionSettings";
import { ThemePicker } from "./ThemePicker";

export function SettingsScreen() {
  const { repo, cfg, refresh } = useApp();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [tempos, setTempos] = useState<{ key: string; bpm: number }[]>([]);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    void repo.configOverrides().then((o) => setText(JSON.stringify(o, null, 2)));
    void repo.allRefTempos().then((t) => setTempos(t.sort((a, b) => a.key.localeCompare(b.key))));
    // « REP-01:<morceau>:<passage> » → « REP-01 · Autumn Leaves · A »
    void repo.pieces().then((ps) => {
      const m = new Map<string, string>();
      for (const p of ps) for (const pa of p.passages) m.set(`REP-01:${p.id}:${pa.id}`, `REP-01 · ${p.title} · ${pa.label}`);
      setLabels(m);
    });
  }, [repo]);

  async function save() {
    try {
      const parsed = text.trim() ? JSON.parse(text) : {};
      if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Il faut un objet JSON.");
      await repo.setConfigOverrides(parsed);
      await refresh();
      setMsg({ ok: true, text: "Réglages enregistrés." });
    } catch (e) {
      setMsg({ ok: false, text: `JSON invalide : ${e instanceof Error ? e.message : e}` });
    }
  }

  return (
    <div className="stack" style={{ gap: 36 }}>
      <h1>Réglages</h1>
      <section className="panel" aria-label="Thème">
        <ThemePicker />
      </section>
      <section className="panel stack" id="reglages-seances">
        <SessionSettings />
      </section>

      <section className="stack">
        <h2>Tempos de référence</h2>
        {tempos.length === 0 ? (
          <p className="dim">Aucun tempo noté pour l'instant. Ils apparaissent après les débriefs.</p>
        ) : (
          <div className="form-grid">
            {tempos.map((t) => (
              <label key={t.key} className="field">
                <span>{labels.get(t.key) ?? t.key}</span>
                <Stepper
                  label={`Tempo de référence ${t.key}`}
                  value={t.bpm}
                  min={cfg.tempo.minBpm}
                  max={cfg.tempo.maxBpm}
                  onChange={(bpm) => {
                    setTempos(tempos.map((x) => (x.key === t.key ? { ...x, bpm } : x)));
                    void repo.setRefBpm(t.key, bpm);
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <h2>Sauvegarde</h2>
        <p className="dim" style={{ maxWidth: "70ch" }}>
          Tes données restent dans ce navigateur. Exporte-les régulièrement : le fichier contient tout, pratique et partie du
          jeu, y compris la banque de standards inconnus (ne l'ouvre pas si tu veux éviter le spoil). La clé d'API n'y figure
          jamais. Restaurer remplace toutes les données actuelles.
        </p>
        <div className="row">
          <button type="button" className="btn primary" onClick={async () => {
            const dump = await repo.exportAll();
            // Un seul fichier : la pratique et, si le jeu tourne, la partie (sans la clé d'API).
            const game = await gameBackup().catch(() => null);
            if (game) dump.game = game;
            const blob = new Blob([JSON.stringify(dump)], { type: "application/json" });
            const filename = `basse-run-${new Date().toISOString().slice(0, 10)}.json`;
            // Hébergée sur claude.ai, la page passe par le service de téléchargement du lecteur.
            const host = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null> } }).claude;
            const downloads = host?.use ? await host.use("downloads") : null;
            if (downloads) {
              try {
                await downloads.save({ filename, data: blob });
                setMsg({ ok: true, text: "Sauvegarde exportée." });
              } catch (err) {
                const code = (err as { code?: string }).code;
                setMsg({ ok: false, text: code === "declined" ? "Export annulé." : "Export impossible ici." });
              }
              return;
            }
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          }}>Exporter une sauvegarde</button>
          <label className="btn">
            Choisir une sauvegarde
            <input type="file" accept="application/json,.json" hidden onChange={(e) => setPending(e.target.files?.[0] ?? null)} />
          </label>
          {pending && (
            <ConfirmAction label={`Restaurer « ${pending.name} »`} className="btn" question="Remplacer toutes les données actuelles ?" confirmLabel="Restaurer" onConfirm={async () => {
              try {
                const file = JSON.parse(await pending.text());
                checkGameBackup(file?.game);
                await repo.importAll(file);
                const game = await restoreGameBackup(file?.game).catch(() => "unavailable" as const);
                await refresh();
                setPending(null);
                setMsg({
                  ok: game !== "unavailable",
                  text: game === "restored" ? "Sauvegarde restaurée (pratique et jeu)."
                    : game === "kept" ? "Pratique restaurée. Ce fichier ne contient pas de partie : la partie en cours est conservée."
                    : "Pratique restaurée, mais la partie n'a pas pu l'être (jeu indisponible).",
                });
              } catch (err) {
                setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
              }
            }} />
          )}
        </div>
      </section>

      <section className="stack">
        <GameSettingsSection />
      </section>

      <section className="stack">
        <DictionariesSection />
      </section>

      <section className="stack">
        <h2>Configuration avancée</h2>
        <p className="dim" style={{ maxWidth: "70ch" }}>
          Surcharges de la configuration par défaut, en JSON. Seules les clés écrites ici remplacent les valeurs par défaut,
          par exemple <code>{'{"man01": {"timeLimitSec": 10}}'}</code>. Chaque clé est expliquée dans docs/DECISIONS.md.
        </p>
        <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Surcharges de configuration" />
        <div className="row">
          <button type="button" className="btn primary" onClick={save}>Enregistrer les réglages</button>
          {msg && <span className={msg.ok ? "dim" : "error"}>{msg.text}</span>}
        </div>
        <details>
          <summary className="dim">Configuration par défaut</summary>
          <pre style={{ fontSize: "0.82rem", overflowX: "auto" }}>{JSON.stringify(DEFAULT_CONFIG, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}
