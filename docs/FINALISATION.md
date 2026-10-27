# Finalisation : interface, répertoire, planning — puis hébergement

Document de travail de la phase de finalisation. Il complète ARCHITECTURE.md, DECISIONS.md et INTEGRATION.md.
Maquettes : canevas « Basse Run — Maquettes V1 » (lien donné dans la discussion).

## 1. État des lieux (étape 0)

### Sources lues
| Source | Accès | Remarque |
|---|---|---|
| Spécification des exercices | complet | 15 exercices, mods, cadre du jeu |
| LOW END — Conception du jeu | complet | texte, tableaux et maquette fil de fer ; deux graphiques de simulation non lisibles en texte, leurs chiffres sont dans les tableaux |
| Basse-Ville — Cahier des charges V1 | complet | concept antérieur, source d'idées |
| Basse-Ville — Maquette V1 | complet | 10 écrans 1280×800 |
| Code et docs de l'archive | complet | 142 tests verts au départ, TypeScript strict sans erreur |

### Ce qui existe
- Pratique : 15 exercices avec pilote, métronome précis, mods (34) à rareté, loot, pitié, inventaire, tempos de référence, débrief, historique, sauvegarde.
- Données : standards en cours d'étude, mélodies imposées (passages, paliers), banque inconnue anti-spoil, dictionnaires.
- Jeu LOW END : moteur, pont à sens unique, mission au lancement, rapport en fin de bloc, onglet Équipe, récits par l'API.
- PWA : manifeste, service worker « réseau d'abord », build simple fichier possible.

### Ce qui manque pour la V1 finale
- Répertoire (fiche complète : compositeur, forme, statut, devoir, notes, partition, passages).
- Planning hebdomadaire, générateur de séance, enchaînement des blocs avec pauses, suivi prévu / fait.
- Interface : navigation qui tienne 8 sections, mode « scène » lisible au pupitre, réglages en formulaires (aujourd'hui en JSON).
- Hébergement : non indexation, procédure de mise à jour du service worker, guide.

### Défauts corrigés pendant l'état des lieux
- Test instable (environ 1 exécution sur 10, déjà présent dans l'archive) : au rejeu, deux événements de la même
  milliseconde (lancement et fin d'un bloc) pouvaient être traités dans le désordre, et la mission était perdue. Le pont
  du jeu trie désormais à horodatage égal le lancement avant la fin (src/game/bridge.ts), avec un test dédié.
- Métronome : si le bloc s'arrêtait pendant le démarrage audio (abandon rapide, double montage React en développement),
  `start()` reprenait sur un contexte nul (`createGain` sur `null`). Corrigé par un jeton de génération (src/audio/metronome.ts).

## 2. Revue critique des écrans actuels

Captures faites à 1366×768 (PC), 1280×800 (tablette paysage) et 800×1280 (tablette portrait).

| Écran | Constat | Proposition |
|---|---|---|
| Navigation | 6 onglets texte en haut, cibles de 40 px ; avec Planning et Répertoire elle passe sur deux lignes en portrait | Rail vertical à gauche, 6 entrées avec icône + libellé (64 px), Réglages en bas |
| Pratiquer | Liste de 15 exercices en colonne de 1 150 px de haut : défilement sur PC ; pas de 25 min dans les durées | Axe en 8 onglets puis 1 à 3 exercices ; durée 25 min ajoutée ; tout prérempli depuis la séance |
| Bloc en cours | À 1366×768, Pause, Abandonner et Volume sont sous la ligne de flottaison ; accords à 22 px au plus, illisibles à 1,5 m ; l'écran de la tablette se met en veille en plein bloc | Mode scène : tout tient sans défilement, accords 30 px (paysage) à 27 px (portrait) en 4 colonnes × 8 lignes, chrono 76–84 px, Wake Lock, raccourcis Espace / P |
| Métronome visuel | Cases avec transition de 160 ms et lueur : mouvement superflu pendant le jeu | Cases sans transition ni lueur ; seule leur couleur change, au temps |
| Débrief | Note à la souris seulement ; bouton désactivé peu lisible | Touches 1 à 5 et Entrée ; cases de 88 px ; « Ensuite » rappelé |
| Fin de bloc | Le bandeau vert de la mission est plus voyant que le mod obtenu : le jeu passe devant la pratique | Mod obtenu à gauche et en premier ; mission dans un panneau neutre ; pause et bloc suivant à droite |
| Équipe | Une page de 2 000 px qui mêle équipe, recrues, planque, contrats, quartiers, journal | Sous-onglets Équipe · Planque · Ville · Journal |
| Données | Quatre sujets sur une page ; champs de fichier natifs en anglais (« Choose File ») ; dictionnaires en JSON | Standards et mélodies → Répertoire ; banque → onglet à part du Répertoire ; dictionnaires → Réglages avancés |
| Réglages | Configuration en JSON brut | Formulaires pour les réglages courants (séance, planning, métronome) ; JSON gardé en « avancé » |
| Historique | Tableau de 10 colonnes, défilement horizontal en portrait | Journal : semaine (prévu / joué par jour) puis liste compacte |
| Accessibilité | Texte : contrastes bons (encre 15,9:1, encre douce 6,6 à 7,2:1). Bords de champs et boutons à 1,65:1 (< 3:1). Puces à 38 px, `.lw-small` à 32 px | Jeton « trait fort » `#766db3` (3,8:1) pour les bords de contrôles ; toutes les cibles ≥ 44 px |

## 3. Conflits relevés

Ordre de priorité : spec, puis code, puis prompt, puis Basse-Ville.

| # | Conflit | Retenu |
|---|---|---|
| H | Basse-Ville : XP pondérée par l'auto-évaluation | Exclu (déjà conflit G d'INTEGRATION.md) |
| I | Basse-Ville : un jour prévu non fait fait avancer Quantize et retire 5 % de maîtrise ; érosion de 10 % par semaine | Exclu : contraire à « aucune pression ». « À entretenir » n'est qu'une information (jours depuis le dernier jeu) |
| J | Basse-Ville : blocs Échauffement, Technique, Relevé | Absents de la spec (15 exercices) : le générateur ne propose que les 15 exercices |
| K | Basse-Ville : bloc d'une heure = 2 créneaux de 25 min + 5 min de pause | Un « créneau » Basse-Ville = un bloc de la spec (un exercice, un mod, une mission, un loot). Séance = blocs de 25 min, pauses de 5 min, réglables |
| L | Basse-Ville : premier créneau du jour toujours échauffement + manche | Option « ouverture par l'axe MAN », activée par défaut, désactivable |
| M | Prompt : 4 statuts dont « à entretenir » ; spec : aucun statut | 3 statuts saisis (à apprendre, en cours, su) + « à entretenir » déduit (su et pas joué depuis 21 jours), pour ne rien avoir à tenir à jour |
| N | Le jeu récompense chaque bloc, quelle que soit sa durée ; des séances en blocs de 25 min donnent ~5 blocs pour 2 h (la simulation du jeu supposait 4 par jour) | Rien à changer pour la V1 : le scénario « intense » (6 blocs par jour) reste équilibré. À noter : un bloc de 5 min rapporte une mission entière ; un seuil de durée côté jeu irait en V2 (décision à prendre par toi) |
| O | INTEGRATION.md : onglet « Équipe » plutôt que « Ville » | Entrée « LOW END » avec sous-onglets Équipe, Planque, Ville (liste des quartiers ; la carte SVG reste en V2), Journal |

## 4. Architecture cible

```
src/core/
  repertoire.ts   morceaux, statut déduit « à entretenir », dernier jeu, migration v1 → répertoire (pur)   ← fait
  planning.ts     semaine type, exceptions datées, jours de cours, prochain cours (pur)                  ← fait
  session.ts      générateur de séance, retouches, suivi prévu / joué (pur)                               ← fait
src/storage/
  db.ts           basse-cyber v2 : magasins pieces, planning, sessions ; migration dans la mise à niveau
  repo.ts         pieces, planning, séance du jour, entrée du générateur (morceaux, blocs, 2 compteurs de banque)
src/ui/
  shell/          rail de navigation, mode scène, raccourcis clavier / pédale, Wake Lock
  screens/        Aujourd'hui, Planning, Répertoire (+ banque), Mods, LOW END (sous-onglets), Journal, Réglages
  kit/            composants partagés : Button, Chip, Segmented, Stepper, Tag, Panel, Field, FilePicker…
```

### Modèle de données (basse-cyber v2)
| Magasin | Contenu | Changement |
|---|---|---|
| `pieces` | Morceau : titre, compositeur, tonalité, mesure, forme, grille, partition, passages, statut, priorité, devoir {échéance, exercices visés, note}, notes, anciens identifiants | nouveau |
| `planning` | `week` (semaine type), `overrides` (exceptions datées) | nouveau |
| `sessions` | Séance du jour par date : blocs prévus (exercice, durée, morceau, passage, raison) | nouveau |
| `blocks` | + `sessionBlockId` facultatif ; les tirages portent `pieceId` | champs ajoutés, rien de retiré |
| `standards`, `melodies` | Gelés après migration, plus lus ni affichés ; supprimés en v3 | filet de sécurité |
| `refTempos` | Clés REP-01 renommées seulement si une mélodie est fusionnée | selon le choix de migration |
| `settings` | + section `session` (durées, parts cibles, priorités, devoirs, entretien) | config par défaut étendue |

- Les identifiants sont conservés : un standard devient un morceau de même identifiant, une mélodie aussi. L'historique,
  les tirages enregistrés et les tempos de référence restent liés sans réécriture.
- Sauvegarde : format version 2 ; une sauvegarde version 1 se restaure en passant par la même migration.
- Événements du jeu : inchangés. Le jeu ne reçoit ni titre, ni morceau, ni séance.

### Générateur (déjà codé et testé)
1. **Ouverture** : premier bloc du jour dans l'axe MAN (si rien n'a été joué).
2. **Devoirs** : échéance dans les 7 jours, la plus proche d'abord ; au plus un bloc par devoir et la moitié de la séance.
3. **Entretien** : un morceau su pas rejoué depuis 21 jours, au plus un par séance.
4. **Équilibre** : retard de chaque axe sur sa part cible du temps de la semaine (proportionnel : pas de dette),
   pondéré par ta priorité d'axe ; dans l'axe, l'exercice le moins récent ; le morceau selon ta priorité puis le moins récent.
5. Blocs de 25 min, le reste de moins de 10 min allonge le dernier ; deux blocs du même axe ne se suivent pas si possible.

Entrée : date, objectif, morceaux, historique des blocs, deux compteurs de la banque, réglages. Rien d'autre.

## 5. Étapes livrables

| Étape | Contenu | Testable en pratiquant | Validation |
|---|---|---|---|
| ✓ 0 | État des lieux, maquettes, logique pure (répertoire, planning, générateur) et tests, correctif métronome | Rien de visible | — |
| ✓ 1 | Rail de navigation, mode scène (Wake Lock, raccourcis, tailles), débrief au clavier, fin de bloc rééquilibrée, LOW END en sous-onglets, cinq thèmes au choix (Réglages → Apparence) | Un bloc au pupitre, sur PC et tablette | — |
| ✓ 2 | Migration v2, écran Répertoire (fiche, saisie de grille avec aperçu, import), exercices branchés sur le répertoire, banque à part, sauvegarde v2 | Tes standards et mélodies retrouvés ; WLK, IMP, MAN-02, REP-01 | Migration |
| ✓ 3 | Planning (jours remplis à la main, cours), Aujourd'hui (séance générée et retouchable), enchaînement avec pauses, sortie, bloc libre, suivi | Une vraie journée de séance | — |
| ✓ 4 | Journal, réglages des séances en formulaire, audit d'accessibilité (axe-core, 0 violation dans les 5 thèmes), vérifications 1366×768, 1280×800, 800×1280 | Une semaine d'usage | — |
| ½ 5 | Fait : GitHub Pages choisi, publication automatique (tests, build, vérification « rien de personnel ni de secret »), non indexation, politique de sécurité, avis de mise à jour, icônes d'installation, guide docs/HEBERGEMENT.md, essai sous `/basse-run/`. Mise en ligne depuis le navigateur seul (3 envois). Reste : ta mise en ligne (guide § 1 à 4) et l'installation sur tes appareils (§ 5) | Installation sur tes appareils | — |
