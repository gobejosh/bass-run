# LOW END — jeu parallèle

Moteur, tables et simulateur du jeu de gestion de runners greffé sur l'app de pratique.
La conception complète est dans le document « LOW END — Conception du jeu parallèle ».

## Contenu

- `engine.js` : moteur pur (ES module, sans dépendance). Point d'entrée de fin de bloc : `endBlock(state, cfg, block)`.
- `config/*.json` : toutes les règles et tables (11 fichiers, chacun documenté par son champ `_doc`).
- `sim.mjs` : simulateur d'une saison avec joueur automatique.
- `sim-results.json`, `sim-output.txt` : résultats utilisés dans le document (5 scénarios × 200 parties).

## Utilisation dans la PWA

```js
import * as E from './engine.js';
const cfg = E.buildConfig({ core, roles, traits, districts, contracts, items, affixes, planque, names }); // JSON chargés
const state = E.newGame(cfg, { seed: crypto.randomUUID(), seasonStart: '2026-11-02', seasonEnd: '2027-06-30' });

// Lancement du bloc (après choix de l'exercice et du mod)
const board = E.getBoard(state, cfg, today);
const pick = E.suggestSquad(state, cfg, board.contracts[1], modRarity); // { ids, odds }
E.startMission(state, board.contracts[1], pick.ids, blockId);

// Fin du bloc (terminé ou abandonné) — la note d'auto-évaluation n'est jamais transmise
const report = E.endBlock(state, cfg, { id: blockId, date: today, completed, modRarity, axis, exerciseId, tempo, standardTitle });
const facts = E.narrativeInput(state, cfg, report); // à envoyer à l'API Claude (voir narrative.json)
```

## Simulation

```
node sim.mjs all 200     # 5 scénarios, ~7 min
node sim.mjs type 50     # un scénario
```
