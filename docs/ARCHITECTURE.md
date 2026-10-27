# Architecture — partie musicale

PWA web en TypeScript, sans serveur : tout tourne dans le navigateur, les données restent sur l'appareil (IndexedDB). L'interface est en React, mais toute la logique métier est du TypeScript pur, sans DOM, testée par Vitest.

## Couches

```
src/
  core/                  ← logique pure, aucune dépendance au navigateur
    rng.ts               tirages réellement aléatoires (crypto.getRandomValues, rejet anti-biais)
    types.ts             modèle de données
    config.ts            configuration par défaut (tous les « points à préciser »)
    rarity.ts            raretés, table de drop, compteur de pitié
    tempo.ts             tempo de référence, tempo effectif d'un bloc moddé
    mods/
      catalog.json       les 34 mods, transcrits de la spec
      catalog.ts         chargement + validation du catalogue
      drop.ts            loot de fin de bloc (mod + rareté + paramètres [entre crochets])
      inventory.ts       inventaire, 3 utilisations, consommation
      compat.ts          compatibilité mod/exercice + verrous (Extensions, Overclock)
      resolve.ts         mod + rareté + tempo de réf. → effets concrets du bloc
    exercises.ts         fiches des 15 exercices (mesures au débrief, métronome, mods…)
    block.ts             cycle de vie d'un bloc (lancé → terminé | abandonné)
    events.ts            événements publics pour le jeu (lecture seule)
    repertoire.ts        morceaux du répertoire, « à entretenir », migration v1 (finalisation)
    planning.ts          semaine type, exceptions, jours de cours (finalisation)
    session.ts           générateur de séance, retouches, suivi prévu / joué (finalisation)
    theory/              notes, enharmonie, modes, accords, transposition, grilles
    draw/                moteur de tirage par exercice
  audio/
    metronome.ts         Web Audio, ordonnanceur à anticipation sur l'horloge audio
    clickPlan.ts         plan de clic par mesure (pur, testé) : temps cliqués, raréfaction, coupures
  storage/
    db.ts                IndexedDB (idb) : schéma et accès
    repo.ts              opérations transactionnelles (fin de bloc, loot, inventaire)
  ui/                    écrans React
tests/                   Vitest
docs/                    ce document, DECISIONS.md
```

Règle d'or : `ui/` et `storage/` dépendent de `core/`, jamais l'inverse. Le jeu parallèle ne voit que `core/events.ts`.

Le jeu LOW END vit dans `src/game/` avec sa propre base ; l'interface musicale ne le touche que par `src/integration/game.tsx`.
Voir docs/INTEGRATION.md.

## Modèle de données

| Magasin IndexedDB | Contenu |
|---|---|
| `settings` | Surcharges de la configuration par défaut (`core/config.ts`) |
| `refTempos` | Tempo de référence par clé d'exercice (`WLK-01`, ou `REP-01:<mélodie>:<passage>`) |
| `blocks` | Historique des blocs : exercice, durée, paramètres tirés, mod équipé (copie figée), statut, débrief, loot |
| `inventory` | Instances de mods : mod, rareté, paramètres tirés au drop, utilisations restantes |
| `lootState` | Compteur de pitié |
| `pieces` | Répertoire (v2) : titre, compositeur, tonalité, mesure, forme, grille, partition, passages, statut, priorité, devoir, notes |
| `planning` | Jours remplis à la main (v2) : travail + objectif, off, étiquettes, cours de basse |
| `sessions` | Séance du jour par date (v2) : blocs prévus et leur raison |
| `standards` | Standards en cours d'étude (v1) : gelés après la migration vers `pieces` |
| `unknownBank` | Standards inconnus : grille, thème (fichier), statut jamais tiré / tiré. Jamais listés avant tirage |
| `melodies` | Mélodies imposées (v1) : gelées après la migration vers `pieces` |
| `blobs` | Fichiers importés (partitions PDF ou images) |
| `dictionaries` | Modes, qualités d'accords, motifs mélodiques, motifs rythmiques (préremplis, modifiables) |
| `events` | Journal append-only des événements publics |

### Un mod dans le catalogue

```jsonc
{
  "id": "silence-radio",
  "name": "Silence radio",
  "constraint": "Coupures aléatoires du clic",
  "type": "intensity",            // ou "simple"
  "exercises": ["WLK-01", "..."],
  "enforcement": "app",            // "app" : l'app l'applique ; "consigne" : simple consigne affichée ; "mixte"
  "dropParams": [],                // paramètres [entre crochets] tirés au drop
  "unlock": null,                  // ou "man03-avance" / "rep-fiable"
  "levels": {                      // une entrée par rareté
    "recup":     { "label": "1 mesure, rares", "tempoPct": 0, "effects": { "metronome": { "dropouts": { "min": 1, "max": 1, "chancePerBar": 0.125 } } } },
    "...": {}
  }
}
```

`label` reprend mot pour mot la cellule de la spec ; `effects` est la traduction machine que l'app exécute. Un mod simple n'a que `tempoPct` (-30/-20/-10/0/+10).

### Une instance dans l'inventaire

`{ id, modId, rarity, params: { corde: "La" }, usesLeft: 3, obtainedAt }`. Les paramètres sont figés au drop et affichés dans l'inventaire.

## Cycle d'un bloc

1. **Lancement** : exercice + durée + mod optionnel (seulement ceux compatibles et déverrouillés). L'app tire les paramètres de l'exercice, résout le mod (tempo, effets), émet `bloc_lance`.
2. **Jeu** : métronome (sauf EAR-01), consigne, grille ou partition, chrono. Pause possible.
3. **Fin** : à l'échéance → débrief (note /5, tempo propre, mesure propre à l'exercice) → `bloc_termine`. Le tempo propre devient le tempo de référence. Le mod équipé perd une utilisation. Un mod est looté.
4. **Abandon** à tout moment : `bloc_abandonne`, ni loot ni consommation.

La fin de bloc (débrief, tempo de réf., consommation, loot, pitié, événement) s'écrit dans une seule transaction IndexedDB : pas d'état à moitié appliqué.

## Métronome

Ordonnanceur classique « lookahead » : un minuteur JS se réveille toutes les 25 ms, mais il ne fait que **planifier** les clics sur l'horloge `AudioContext.currentTime`, 100 ms à l'avance. La précision ne dépend donc jamais du minuteur. Le contenu de chaque mesure (quels temps cliquent, coupures, raréfaction, tempo) est calculé par `clickPlan.ts`, une fonction pure testée. Une mesure de décompte est toujours jouée en entier avant que les mods ne s'appliquent.

## Interface avec le jeu

`core/events.ts` expose `onPublicEvent(handler)` (abonnement seul, aucun retour possible) et diffuse aussi sur un `BroadcastChannel("basse-events")`. Les événements sont des copies gelées. Ils sont aussi journalisés dans `events` pour rejeu. Aucune fonction du jeu n'écrit dans la partie musicale.

| Événement | Charge utile |
|---|---|
| `bloc_lance` | blocId, exerciceId, durée prévue, mod équipé (id, nom, rareté) |
| `bloc_termine` | blocId, exerciceId, note, durée réelle, mod équipé, `modVaincu`, `bonusXpPct`, mod looté (id, rareté) |
| `bloc_abandonne` | blocId, exerciceId, durée réelle, mod équipé |

## Anti-spoil

La banque de standards inconnus s'importe par fichier ; l'import n'affiche que des compteurs (« 12 ajoutés, 1 ligne invalide : ligne 7 »), jamais un titre ni un accord. L'interface ne montre que « N jamais tirés / M déjà tirés ». Un standard passe à « tiré » à l'instant où il s'affiche, même si le bloc est abandonné. Seuls les standards déjà tirés sont consultables.

## Découpage en étapes

| Étape | Livrable testable en pratiquant |
|---|---|
| **1. Socle et mods** | Lancer un bloc sur n'importe quel exercice, métronome précis, débrief, tempo de référence, loot, inventaire, équipement. Mods appliqués par le métronome et le tempo (Fantôme, Silence radio, tous les mods simples, Overclock…). Les autres s'affichent en consigne. |
| **2. Tirages et exercices MAN / MOD** | Dictionnaires, MAN-01 (note + chrono), MAN-02 (mode, sens, variante enchaînement), MAN-03 (accord + fonction, temps de réaction au tap), MOD-01 (motif + paliers de tempo). Mods Chrono serré, Enharmonie, Toutes positions, Sur le temps, Extensions, Cycle des quartes, Rétrograde… |
| **3. Grilles et répertoire** | Saisie des standards, mélodies et passages, banque inconnue anti-spoil. WLK, IMP, REP, DEC avec grille affichée. Transposition, Mémoire vive, Endurance (compteur de chorus), Palette réduite, Question-réponse, Motif imposé, paliers REP et Overclock. |
| **4. Finitions (V1.1)** | Sauvegarde / restauration, historique et courbes de tempo, installation hors ligne. |

V2 (hors périmètre) : cumul de mods, accompagnement harmonique, RYT-01 et EAR-01 détaillés, reconnaissance audio.
