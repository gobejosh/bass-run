import { useState } from "react";
import { DEFAULT_DICTIONARIES, type Dictionaries } from "../../core/theory/dictionaries";
import { ConfirmAction } from "../components";
import { useApp } from "../context";

/* ================================================================== dictionnaires */

export function DictionariesSection() {
  const { repo, dicts, refresh } = useApp();
  const [text, setText] = useState(() => JSON.stringify(dicts, null, 2));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(d: Dictionaries) {
    await repo.setDictionaries(d);
    await refresh();
    setText(JSON.stringify(d, null, 2));
    setMsg({ ok: true, text: "Dictionnaires enregistrés." });
  }

  return (
    <div className="stack">
      <h2>Dictionnaires</h2>
      <p className="dim" style={{ maxWidth: "70ch" }}>
        Modes (intervalles en demi-tons), qualités d'accords (degré et demi-tons, mode associé), motifs mélodiques
        (décalages de degrés) et motifs rythmiques (8 doubles-croches : x attaque, - tenue, . silence).
      </p>
      <details>
        <summary className="dim">Modifier en JSON</summary>
        <div className="stack" style={{ marginTop: 12 }}>
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Dictionnaires en JSON" />
          <div className="row">
            <button type="button" className="btn primary" onClick={() => {
              try {
                const d = JSON.parse(text) as Dictionaries;
                if (!Array.isArray(d.modes) || !Array.isArray(d.qualities) || !Array.isArray(d.motifs) || !Array.isArray(d.rhythms)) {
                  throw new Error("il faut les listes modes, qualities, motifs et rhythms");
                }
                void save(d);
              } catch (e) {
                setMsg({ ok: false, text: `JSON invalide : ${e instanceof Error ? e.message : e}` });
              }
            }}>Enregistrer les dictionnaires</button>
            <ConfirmAction className="btn ghost" label="Revenir aux valeurs par défaut" question="Remplacer tes dictionnaires ?" confirmLabel="Remplacer" onConfirm={() => save(DEFAULT_DICTIONARIES)} />
            {msg && <span className={msg.ok ? "dim" : "error"}>{msg.text}</span>}
          </div>
        </div>
      </details>
    </div>
  );
}
