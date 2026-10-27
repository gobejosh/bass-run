/** Réglages du jeu (section de l'écran Réglages). */
import { useEffect, useState } from "react";
import type { GameSettings as Settings } from "../model";
import { requestNarrative, SAMPLE_FACTS } from "../narrativeApi";
import { useGame } from "./hooks";

export function GameSettings() {
  const { rt, record } = useGame();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!rt) return;
    void rt.settings().then(setSettings);
    void rt.store.apiKey().then((k) => setHasKey(!!k));
  }, [rt]);

  if (!rt || !settings || !record) return <p className="dim">Le jeu n'est pas disponible pour l'instant.</p>;

  const save = async (s: Settings) => {
    setSettings(s);
    await rt.setSettings(s);
  };

  return (
    <div className="stack">
      <h2>Jeu (LOW END)</h2>

      <div className="form-grid">
        <label className="field">
          <span>Fin de la saison (début : {new Date(record.state.season.start).toLocaleDateString("fr-FR")})</span>
          <input className="input" type="date" value={record.state.season.end} min={record.state.season.start}
            onChange={(e) => e.target.value && void rt.setSeasonEnd(e.target.value)} />
        </label>
        <label className="field">
          <span>Mission quand rien n'a été choisi au lancement</span>
          <select className="input" value={settings.defaultMission} onChange={(e) => void save({ ...settings, defaultMission: e.target.value as Settings["defaultMission"] })}>
            <option value="auto">Contrat standard (sinon sûr, sinon petit boulot)</option>
            <option value="gig">Petit boulot</option>
            <option value="none">Aucune mission</option>
          </select>
        </label>
      </div>

      <h3>Récits par l'API Claude</h3>
      <p className="dim" style={{ maxWidth: "70ch" }}>
        La clé est gardée dans ce navigateur seulement et n'est jamais incluse dans les sauvegardes. Elle reste lisible par
        quiconque a accès à cet appareil : utilise une clé dédiée à cette app, avec un plafond de dépense dans la console
        Anthropic. Sans clé ou sans réseau, les rapports utilisent les gabarits locaux. Seuls les faits de la mission sont
        envoyés, jamais de données musicales.
      </p>
      <label className="row">
        <input type="checkbox" checked={settings.narrativeApi} onChange={(e) => void save({ ...settings, narrativeApi: e.target.checked })} />
        Utiliser l'API pour les rapports de mission
      </label>
      <div className="row">
        <input className="input" style={{ maxWidth: 420 }} type="password" autoComplete="off" placeholder={hasKey ? "Clé enregistrée (saisir pour remplacer)" : "sk-ant-…"}
          value={keyInput} onChange={(e) => setKeyInput(e.target.value)} aria-label="Clé d'API Claude" />
        <button type="button" className="btn primary" disabled={!keyInput.trim()} onClick={async () => {
          await rt.store.setApiKey(keyInput.trim());
          setKeyInput("");
          setHasKey(true);
          setMsg({ ok: true, text: "Clé enregistrée." });
        }}>Enregistrer la clé</button>
        {hasKey && (
          <>
            <button type="button" className="btn" disabled={asking} onClick={async () => {
              setAsking(true);
              const key = await rt.store.apiKey();
              const r = key ? await requestNarrative(SAMPLE_FACTS, key, rt.fetchImpl) : { narrative: null, error: "aucune clé" };
              setAsking(false);
              setMsg(r.narrative ? { ok: true, text: `Test réussi : « ${r.narrative.titre} » — ${r.narrative.rapport}` } : { ok: false, text: `Échec du test : ${r.error ?? "inconnu"}.` });
            }}>{asking ? "Test en cours…" : "Tester la clé"}</button>
            <button type="button" className="btn danger" onClick={async () => {
              await rt.store.setApiKey(null);
              setHasKey(false);
              setMsg({ ok: true, text: "Clé effacée." });
            }}>Effacer la clé</button>
          </>
        )}
      </div>
      {msg && <p className={msg.ok ? "dim" : "error"}>{msg.text}</p>}
      {rt.lastNarrativeError && <p className="dim">Dernier appel à l'API : {rt.lastNarrativeError} (récit local utilisé).</p>}

      <h3>Partie</h3>
      <RestartGame onRestart={() => rt.restart()} />
    </div>
  );
}

function RestartGame({ onRestart }: { onRestart: () => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className="btn danger" style={{ justifySelf: "start" }} onClick={() => setAsking(true)}>Recommencer une partie</button>;
  return (
    <span className="confirm" role="group" aria-label="Recommencer une partie">
      <span>Effacer l'équipe et la ville ? La pratique n'est pas touchée.</span>
      <button type="button" className="btn danger" onClick={() => { setAsking(false); void onRestart(); }}>Recommencer</button>
      <button type="button" className="btn ghost" onClick={() => setAsking(false)}>Annuler</button>
    </span>
  );
}
