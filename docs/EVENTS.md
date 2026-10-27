# Interface avec le jeu parallèle

La partie musicale publie des événements ; le jeu ne peut que les lire. Il n'existe aucune fonction pour écrire dans la partie musicale.

## S'abonner

Dans la même application :

```ts
import { onPublicEvent } from "./core/events";
const stop = onPublicEvent((e) => { /* e est gelé (Object.freeze profond) */ });
```

Depuis une autre page de la même origine :

```ts
const ch = new BroadcastChannel("basse-events");
ch.onmessage = (m) => handle(m.data);
```

Rejeu : tous les événements sont aussi journalisés en base (`Repo.events(depuisTimestamp)`), dans l'ordre.

## Événements (schéma v1)

Champs communs : `schema` (1), `type`, `eventId`, `at` (ms epoch), `blockId`, `exerciseId`.

| type | champs propres |
|---|---|
| `bloc_lance` | `plannedMinutes`, `mod` |
| `bloc_termine` | `note` (1–5), `playedSeconds`, `mod`, `modVaincu`, `bonusXpPct`, `loot` |
| `bloc_abandonne` | `playedSeconds`, `mod` |

`mod` et `loot` : `{ modId, name, rarity }` ou `null`. `rarity` ∈ `recup`, `street`, `corpo`, `prototype`, `fantome`.

- **Mod vaincu** : `bloc_termine` avec un mod équipé (`modVaincu: true`).
- **Bonus d'XP** : `bonusXpPct` du mod vaincu selon sa rareté (+10/20/35/50/75 %, provisoire), 0 sans mod. L'XP de base est l'affaire du jeu.
- **Bloc lancé / terminé / abandonné** : la mission démarre au lancement, se résout à `bloc_termine`, échoue à `bloc_abandonne`.

## Consommateur : LOW END

`src/game/bridge.ts` consomme ces événements via `src/integration/gameFeed.ts` (abonnement + `Repo.events`, copies gelées),
avec idempotence par `eventId`, rejeu au démarrage et contrôle du champ `schema`. Toute nouvelle version du schéma doit être
ajoutée à `SUPPORTED_EVENT_SCHEMAS` (`src/game/model.ts`), sinon le jeu l'écarte en la signalant. Détails : docs/INTEGRATION.md.
