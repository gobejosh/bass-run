/**
 * Récit par l'API Claude (Messages API), appelé directement depuis le navigateur avec la clé
 * saisie dans les Réglages. Jamais attendu pour afficher l'issue : le repli local est déjà là.
 *
 * N'envoie que les faits produits par narrativeInput() : contrat, quartier, runners, issue,
 * blessés, butin. Aucune donnée musicale (exercice, note, tempo, titre) n'y figure.
 */
import { NARRATIVE, type NarrativeFacts } from "./engine";
import type { Narrative } from "./model";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const api = NARRATIVE.api as { endpoint: string; model: string; max_tokens: number; timeoutMs: number; headers: Record<string, string> };
const prompt = NARRATIVE.report as { system: string; userTemplate: string };
const MAX_CHARS = 400;

export interface NarrativeRequest {
  url: string;
  headers: Record<string, string>;
  body: { model: string; max_tokens: number; system: string; messages: { role: "user"; content: string }[] };
}

export function buildRequest(facts: NarrativeFacts, key: string): NarrativeRequest {
  return {
    url: api.endpoint,
    headers: { ...api.headers, "x-api-key": key },
    body: {
      model: api.model,
      max_tokens: api.max_tokens,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.userTemplate.replace("{{json}}", JSON.stringify(facts, null, 1)) }],
    },
  };
}

/** Extrait et vérifie {titre, rapport} de la réponse. null si elle n'est pas conforme. */
export function parseResponse(data: unknown): Narrative | null {
  const content = (data as { content?: { type: string; text?: string }[] })?.content;
  const text = content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
  if (!text) return null;
  const json = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = json.indexOf("{");
  const end = json.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(json.slice(start, end + 1)) as { titre?: unknown; rapport?: unknown };
    if (typeof o.titre !== "string" || typeof o.rapport !== "string") return null;
    const titre = o.titre.trim();
    const rapport = o.rapport.trim();
    if (!titre || !rapport || rapport.length > MAX_CHARS || titre.length > 80) return null;
    return { titre, rapport, source: "api" };
  } catch {
    return null;
  }
}

/** Demande le récit. Renvoie null sur toute erreur (réseau, délai, clé, réponse invalide). */
export async function requestNarrative(facts: NarrativeFacts, key: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<{ narrative: Narrative | null; error?: string }> {
  const req = buildRequest(facts, key);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), api.timeoutMs);
  try {
    const res = await fetchImpl(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: ctrl.signal });
    if (!res.ok) return { narrative: null, error: res.status === 401 ? "clé refusée" : `erreur ${res.status}` };
    const n = parseResponse(await res.json());
    return n ? { narrative: n } : { narrative: null, error: "réponse non conforme" };
  } catch (err) {
    return { narrative: null, error: ctrl.signal.aborted ? "délai dépassé" : err instanceof Error ? err.message : "réseau indisponible" };
  } finally {
    clearTimeout(timer);
  }
}

/** Faits d'exemple pour tester la clé depuis les Réglages. */
export const SAMPLE_FACTS: NarrativeFacts = {
  contrat: { verbe: "Copier", cible: "le registre d'identités", type: "Piratage", client: "une fixeuse, Sable", quartier: "Les Docks Rouillés", faction: "Korex Logistique", palier: 1, complication: null, grandCoup: null, petitBoulot: false },
  equipe: [{ nom: "Mira « Vex » Okafor", role: "Netrunner", trait: "Prodige", niveau: 2 }],
  issue: "success",
  jet: { des: [6, 8], marge: 2, modVaincu: false },
  blesses: [],
  butin: [],
  credits: 60,
};
