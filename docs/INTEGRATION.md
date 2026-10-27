# Intégration de la pratique et du jeu LOW END

Références : spécification « Spécification des exercices » (sections Mods, Jeu parallèle, Cadre validé),
document « LOW END — Conception du jeu parallèle », et le code. En cas de conflit : la spec, puis le code, puis le résumé.

## Architecture

```
src/
  core/ audio/ storage/ ui/   partie musicale (inchangée, sauf 4 points de greffe dans ui/ et un type dans storage/)
  game/                       jeu LOW END
    engine/                   engine.js (moteur pur, partagé avec tools/sim.mjs), engine.d.ts, index.ts, config/*.json
    model.ts                  enregistrement de partie, intention de lancement, rapport, réglages
    apply.ts                  application d'un événement musical à la partie (pure)
    store.ts                  base IndexedDB « basse-lowend » (séparée de « basse-cyber »)
    bridge.ts                 pont : idempotence, rejeu, contrôle de schéma, traitement en série
    narrative.ts              récit de repli (gabarits)
    narrativeApi.ts           récit par l'API Claude
    runtime.ts                le jeu en fonctionnement (démarrage qui ne lève jamais, fenêtre de gestion)
    ui/                       choix de mission, rapport, onglet Équipe, réglages, colonne Historique
  integration/
    gameFeed.ts               flux d'événements en lecture seule remis au jeu
    game.tsx                  seul fichier par lequel l'interface musicale touche le jeu
tools/sim.mjs                 simulateur d'une saison (npm run sim -- type 50)
```

### Sens unique, vérifié par des tests

- Le jeu n'importe de la partie musicale que `core/events` (types et abonnement). Un test parcourt les imports.
- `core/`, `storage/` et `audio/` n'importent jamais le jeu.
- Le jeu reçoit un `EventFeed` gelé à deux fonctions (`since`, `subscribe`) ; les événements relus sont copiés et gelés.
- Un test joue des blocs, lance le jeu, et compare toute la base « basse-cyber » avant et après : identique. Il vérifie
  aussi que le jeu n'ouvre que sa propre base.

### Isolation (une panne du jeu ne touche jamais un bloc)

- Le démarrage du jeu est lancé après celui de l'app, sans être attendu, et ne lève jamais.
- Chaque composant du jeu est dans une error boundary (`GameSlot`) ; le choix de mission disparaît silencieusement s'il casse.
- Les abonnés aux événements sont déjà protégés par `emitPublicEvent` (try/catch) ; le pont ne fait qu'empiler.
- Un événement qui ferait échouer le moteur est écarté et noté (`processed.status = "ignored"`, raison « erreur »).

## Modèle de données du jeu (base « basse-lowend », v1)

| Magasin | Contenu |
|---|---|
| `game` | `current` : `{ version, createdAt, state (GameState du moteur), cursorAt, abandons {date, count}, windowUntil }` |
| `processed` | Un enregistrement par événement vu : `eventId`, `at`, `type`, `blockId`, statut (`applied`, `ignored`, `unsupported`) |
| `reports` | Rapports complets par `blockId`, avec instantané des objets gagnés, faits du récit et récit |
| `kv` | `intent` (choix armé au lancement), `settings` (réglages du jeu) |
| `secrets` | Clé d'API Claude. Jamais exportée |

Aucune migration de « basse-cyber ». La sauvegarde ajoute une clé `game` au fichier existant (format inchangé, `version: 1`) ;
un ancien fichier sans `game` restaure la pratique et conserve la partie en cours.

## Consommation des événements

| Événement | Effet |
|---|---|
| `bloc_lance` | Lie l'intention armée (contrat + équipe) au `blockId` et démarre la mission. Sans intention : réglage `defaultMission` |
| `bloc_termine` | `endBlock` (mission résolue, guérisons, forge, recrues, déblocages) ; rapport ; ouvre la fenêtre de gestion (2 min) |
| `bloc_abandonne` | Mission avortée ; au-delà de `core.abandon.freePerDay` abandons dans la journée, malus |

Lu dans l'événement : `eventId`, `type`, `at`, `blockId`, `exerciseId` (pour l'axe), `mod.rarity`, `modVaincu`,
`bonusXpPct`. Jamais lu : la note, la durée, le loot. Les événements ne portent aucun titre ni tempo.

- **Idempotence** : contrôle dans la transaction du jeu (un `eventId` déjà vu est sans effet).
- **Rejeu** : au démarrage et au retour sur l'onglet, depuis le curseur moins une minute, dans l'ordre chronologique
  (à horodatage égal, le lancement d'un bloc avant sa fin).
- **Schéma** : seules les versions de `SUPPORTED_EVENT_SCHEMAS` sont lues ; les autres sont notées `unsupported`.
- **Bloc resté ouvert** : géré par la partie musicale (débriefer ou abandonner) ; le jeu attend l'événement de fin.
  Une mission dont la fin n'arrive jamais est close sans pénalité au lancement suivant.

## Décisions et hypothèses

### Validées avec toi
- Une seule app (pas de monorepo), base du jeu séparée, clé d'API saisie et gardée en local.
- Abandon : le premier de la journée sans conséquence, ensuite malus (`core.json > abandon`).

### Prises seul (toutes réglables)
1. Nouvelle partie au premier démarrage ; saison du jour de création au 30 juin 2027 (Réglages). Les blocs antérieurs ne sont pas rejoués.
2. Choix de mission « armé » à l'écran de lancement, lié au `bloc_lance` suivant s'il a lieu le même jour, dans les 30 min.
3. Sans choix armé : standard, sinon sûr, sinon petit boulot, jamais le risqué (`defaultMission` dans Réglages).
4. Malus d'abandon : 25 % de la valeur du contrat en réputation et blessure normale d'un runner envoyé ; jamais sur un petit boulot ;
   tous les abandons de la journée comptent, avec ou sans mission.
5. Fenêtre de gestion : 2 min depuis la fin d'un bloc **terminé** ; utilisable dans le rapport et l'onglet Équipe ; se ferme au temps écoulé.
6. `bonusXpPct` du mod vaincu multiplie l'XP de la mission, en plus du bonus au jet (`core.json > modXpBonus.apply`).
7. Forge mémorielle nommée d'après l'axe : ni titre (anti-spoil), ni tempo (absent des événements).
8. Récit par l'API seulement pour un rapport de moins de 10 minutes (pas d'appels en rafale lors d'un rejeu). Délai 8 s, puis repli.
9. Couleurs : jetons de `styles.css` (raretés comprises) ; les couleurs de `core.json` ne servent pas à l'interface.
10. Onglet « Équipe » (ta liste) plutôt que « Ville » (document de conception).
11. Moteur : trois ajouts étroits (export de `injure`, `xpBonusPct`, `abandonPenalty`) ; le simulateur donne des résultats identiques.

### Conflits relevés
| # | Conflit | Retenu |
|---|---|---|
| A | Le moteur nomme les objets forgés d'après le titre du standard ; la spec interdit tout titre côté jeu | Aucun titre transmis (test) |
| B | Spec : abandon = mission échouée ; moteur : mission avortée sans pénalité | Ta règle : premier arrêt gratuit, puis malus |
| C | Spec : bonus d'XP du mod vaincu ; moteur : bonus au jet et butin | Les deux |
| D | Spec : 3 issues ; moteur : 5 (critiques) | 5 |
| E | Spec : la réputation débloque les quartiers ; moteur : réputation et acte de la saison | Moteur |
| F | Moteur hors cadre : Alerte, Grand Coup, Chaleur, forge, planque, cosmétiques, codex, épilogue | Noyau en V1 ; cosmétiques, codex, épilogue en V2 |
| G | « Basse-Ville — Cahier des charges V1 » (XP pondérée par la note) | Écarté : contraire à la spec actuelle |

### Repéré, non corrigé
- « Équiper le meilleur » (moteur) répartit par runner, pas globalement : au départ, le deck de piratage va au Solo.
  Le corriger changerait le simulateur.

## V2
Carte SVG des quartiers (Voronoï), avatars SVG, codex et épilogue (prompts déjà dans `narrative.json`), cosmétiques,
répartition globale de l'équipement, tempo et axe dans les événements (schéma v2) si la forge doit les afficher.
