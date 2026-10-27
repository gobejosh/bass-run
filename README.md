# Basse Run

App personnelle d'accompagnement de la pratique de la basse 5 cordes : blocs de pratique, exercices, métronome précis, mods à rareté,
et LOW END, un jeu de gestion de runners cyberpunk qui n'avance qu'au rythme des blocs.
PWA en TypeScript (React, Vite), sans serveur : tout est stocké dans le navigateur (pratique et jeu dans deux bases séparées).

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests de la logique critique (Vitest) : pratique, moteur du jeu, pont, récits, gestion
npm run typecheck  # TypeScript strict
npm run sim -- type 50   # simulateur d'une saison du jeu (scénarios : type, leger, intense, sansmods, tardif, all)
npm run build      # site statique dans dist/, puis vérification : rien de personnel ni de secret publié
npm run verifier   # la même vérification seule
npm run envois     # dossiers envois/envoi-N (< 100 fichiers) pour la mise en ligne depuis le navigateur
SINGLEFILE=1 VITE_SINGLEFILE=1 npm run build   # un unique dist/index.html autonome
```

Publiée sur GitHub Pages à chaque envoi sur `main` (.github/workflows/deploy.yml). L'app s'installe comme une application et fonctionne hors ligne : voir docs/HEBERGEMENT.md (mise en ligne, installation, mises à jour, données, sécurité).

## Où regarder

| Sujet | Fichier |
|---|---|
| Architecture, modèle de données, étapes | docs/ARCHITECTURE.md |
| Hypothèses et décisions prises seul | docs/DECISIONS.md |
| Finalisation : état des lieux, conflits, architecture cible, étapes | docs/FINALISATION.md |
| Thèmes (Néon, Phosphore, Signal, Tokyo, Jour) | docs/THEMES.md, src/themes/ |
| Hébergement, installation, données par appareil | docs/HEBERGEMENT.md |
| Formats d'import (répertoire, banque inconnue) | docs/IMPORT.md |
| Événements pour le jeu parallèle | docs/EVENTS.md |
| Intégration du jeu : pont, stockage, décisions, conflits | docs/INTEGRATION.md |
| Moteur du jeu et simulation | docs/game/MOTEUR.md, src/game/engine/config/*.json |
| Configuration par défaut | src/core/config.ts (surchargeable dans Réglages) |
| Catalogue des 34 mods | src/core/mods/catalog.json |
| Dictionnaires (modes, accords, motifs) | src/core/theory/dictionaries.ts (modifiables dans Réglages) |

## Organisation du code

- `src/core/` : logique pure, sans navigateur — raretés, drop, pitié, inventaire, tempos, théorie, tirages, import, événements.
- `src/audio/` : métronome Web Audio (ordonnanceur sur l'horloge audio) et plan de clic mesure par mesure.
- `src/storage/` : IndexedDB, opérations atomiques de fin de bloc, sauvegarde.
- `src/ui/` : écrans React ; `src/ui/drivers/` contient un pilote par exercice (tirage au lancement + panneau pendant le bloc).
- `src/game/` : jeu LOW END (moteur, pont, stockage, récits, écrans) ; `src/integration/` : seul point de contact avec la pratique.
- `tests/` : 167 tests de la pratique (dont 60 pour le répertoire, la migration, le planning et le générateur), 38 du jeu, du pont et de la clé d'API.
