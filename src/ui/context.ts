import { createContext, useContext } from "react";
import type { AppConfig } from "../core/config";
import type { ResolvedMod } from "../core/mods/resolve";
import type { Dictionaries } from "../core/theory/dictionaries";
import type { BlockRecord } from "../core/types";
import type { Repo } from "../storage/repo";
import type { Prepared } from "./drivers/types";

export interface AppCtx {
  repo: Repo;
  cfg: AppConfig;
  dicts: Dictionaries;
  /** Relit la configuration et les dictionnaires après une modification. */
  refresh: () => Promise<void>;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp hors contexte");
  return c;
}

/** Bloc en cours de jeu (mémoire seulement : le reste est en base). */
export interface Session {
  block: BlockRecord;
  resolved?: ResolvedMod;
  prepared: Prepared;
}
