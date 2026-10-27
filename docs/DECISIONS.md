# Hypothèses et décisions prises seul

Chaque ligne est modifiable. Entre parenthèses : où la changer. « config » = `src/core/config.ts` ou l'écran Réglages (surcharge JSON) ; « catalogue » = `src/core/mods/catalog.json` ; « dictionnaires » = `src/core/theory/dictionaries.ts`.

## Étape 1 — Socle et système de mods

### Choix difficiles à défaire (validés avec toi)
- **Stack** : PWA web TypeScript (React + Vite), Web Audio, IndexedDB, sans serveur. Toute la logique métier est en TypeScript pur, sans dépendance au navigateur.

### Règles de la spec interprétées
1. **Tempo de référence et blocs moddés** : la spec dit « dernier tempo noté propre ». Pris à la lettre, un Black-out Récup (-30 %) noté propre à 84 ferait tomber la référence de 120 à 84, et chaque mod lent tirerait la difficulté vers le bas. Par défaut, un bloc **sans mod** fixe la référence ; un bloc **avec mod** ne peut que la faire **monter**. Lecture littérale disponible. (config `tempo.moddedBlocksUpdateRef` : `raise-only` | `always` | `never`)
2. **Tempo de référence initial** tant qu'aucun débrief n'existe : MAN-01 60, MAN-02 80, MAN-03 60, WLK 120, MOD-01 80, IMP 120, RYT-01 80, REP-01 100, DEC-01 110, DEC-02 90. Il est aussi modifiable à chaque lancement ; la valeur saisie devient la référence. (config `tempo.initialRefBpm`)
3. **Arrondi des tempos** : au BPM entier le plus proche, bornés entre 30 et 400. (config `tempo.minBpm` / `maxBpm`)
4. **Pitié** : « après 15 drops consécutifs sans Prototype ou mieux » = le 16e drop est forcé. Il est tiré entre Prototype et Fantôme dans les proportions de la table de la note (note 1–3 : 75 % / 25 %). Le compteur revient à 0 sur tout Prototype ou Fantôme, forcé ou non. Il est global, pas par exercice. (config `loot.pityThreshold`)
5. **Loot** : chacun des 34 mods a la même probabilité, y compris ceux qui ne sont pas encore équipables (Extensions, Overclock) : la spec dit « tiré au hasard dans tout le catalogue ».
6. **Verrous** : Extensions et Overclock peuvent tomber mais restent grisés au lancement tant que le palier n'est pas atteint. Ils ne perdent aucune utilisation pendant ce temps.
7. **Mod « Fantôme » (clic raréfié)** : homonyme de la rareté Fantôme. Identifiant interne `fantome-clic` pour éviter toute confusion.
8. **Fin de bloc** : à l'échéance, le métronome continue (pour finir sa phrase) et un bouton Débriefer apparaît. Avant l'échéance, seul Abandonner est proposé. (config `block.allowEarlyFinish` pour autoriser « Terminer maintenant »)
9. **Débrief = terminé** : un bloc est terminé quand le débrief est validé. On peut encore abandonner depuis le débrief.
10. **Bloc resté ouvert** (onglet fermé en plein bloc) : au retour, l'app propose de le débriefer (durée estimée, plafonnée à la durée prévue) ou de l'abandonner.
11. **Décompte** : une mesure pleine est toujours cliquée avant que les mods ne s'appliquent, pour donner le tempo. (config `block.countInBars`)
12. **Mesure** : 4/4 par défaut ; les grilles pourront porter leur propre métrique. En 3/4, un clic « sur 4 » tombe sur le dernier temps. (config `block.beatsPerBar`)
13. **Durée jouée** : pauses et temps de préparation exclus.
14. **Bonus d'XP** : transmis au jeu dans l'événement `bloc_termine` (`bonusXpPct`), 0 sans mod. L'XP de base n'est pas définie côté musique : c'est au jeu de la fixer. (config `xpBonusPct`)
15. **Événements** : en plus de ceux demandés, `bloc_termine` contient le mod looté (le rapport de mission de la spec arrive « avec le loot de mod »). Diffusés en mémoire (`onPublicEvent`), sur `BroadcastChannel("basse-events")` et journalisés en base pour rejeu.

### Traduction machine des mods (catalogue)
- **Appliqué par l'app vs consigne** : au niveau de chaque rareté, pas seulement du mod. Le tempo est toujours imposé par l'app. Les mods dont certains niveaux seulement sont pris en charge sont marqués « mixte » : Fondamentale interdite (Prototype), Encerclement (Prototype), Approche chromatique (Corpo), Two-feel (Prototype), Rétrograde (Fantôme).
- **Silence radio** : « rares » = 10 % de chances par mesure de lancer une coupure ; Street 15 %, Corpo 20 %, Prototype 25 %. Au moins une mesure cliquée entre deux coupures. (catalogue, `chancePerBar`)
- **Fondamentale interdite** : contrainte de base « pas de fondamentale au premier temps » (le walking la pose normalement sur le 1). La cible Corpo est tirée au drop ; la cible Prototype change toutes les 4 mesures, jamais deux fois la même.
- **Encerclement Prototype / Approche chromatique Corpo** : « sens tiré » = un sens tiré au lancement pour tout le bloc (le niveau suivant, « sens alterné », change à chaque mesure).
- **Two-feel Prototype** : départ en two-feel, bascules dans les deux sens toutes les 4 à 16 mesures, annoncées une mesure avant.
- **Question-réponse** : Récup à Prototype = N mesures de jeu puis N de silence. Fantôme = question 1 mesure, réponse jouée 1 mesure reprenant son rythme (pas de silence). À confirmer.
- **Toutes positions** : lu comme « trouver toutes les occurrences de la note sur chaque corde jusqu'à la case N », alors que MAN-01 de base demande une position par corde.
- **Extensions** : la fonction demandée est tirée uniquement parmi les extensions du niveau. « Altérations seules » = ♭9, ♯9, ♯11, ♭13 (♭13 ajoutée).
- **Zone verrouillée** : position tirée entre les cases 1 et 12. **Mono-câble** : une des 5 cordes. (catalogue, `dropParams`)
- **Contraintes sans texte dans la spec** (nom seul) : j'ai rédigé une phrase pour Chrono serré, Annonce vocale, Enharmonie, Toutes positions, Sur le temps, Arpège réflexe, Extensions, Skip notes, Encerclement, Ascenseur, Approche chromatique, Transposition, Two-feel, Endurance, Étendue, Densité, Overclock. Les libellés de niveaux, eux, sont recopiés mot pour mot.

### Palier avancé MAN-03 (débloque Extensions)
Atteint quand les **3 derniers blocs MAN-03 terminés sans mod** ont chacun une note ≥ 4 et un temps de réaction moyen ≤ 2,0 s. Il peut se reperdre. (config `man03.advanced`)

## Étape 2 — Tirages et exercices MAN / MOD

### Points à préciser de la spec
1. **Accordage** : Si-Mi-La-Ré-Sol confirmé par défaut. (config `instrument.strings`)
2. **MAN-01, temps limite** : un temps pour les 5 cordes, **12 s** par note, puis note suivante automatique. Étendue : cases 0 à 12. Avec Cadence, la note change à la mesure, calée sur le métronome : blanches toutes les 3 mesures, noires toutes les 2, croches à chaque mesure. (config `man01.timeLimitSec`, `man01.maxFret`)
3. **MAN-01, mesure au débrief** : l'app compte les notes présentées ; tu saisis le total de cordes trouvées dans le temps.
4. **MAN-01, ordre des cordes** : choisi au lancement (grave → aigu par défaut). En « aléatoire », un nouvel ordre est tiré à chaque note. Une même hauteur ne sort jamais deux fois de suite ; les touches noires s'affichent au hasard en dièse ou en bémol sans mod.
5. **MAN-02, étendue** : 1 octave. **Modes tirés** : les 7 modes de la gamme majeure. Les 14 modes des mineurs mélodique et harmonique sont déjà dans le dictionnaire, il suffit de les activer. (config `man02.octaves`, `man02.families`)
6. **MAN-02, règle accord → mode** (variante enchaînement) : maj7 et 6 → Ionien, 7 → Mixolydien, m7 → Dorien, m7♭5 → Locrien, dim7 → Ultralocrien, mMaj7 et m6 → Mineur mélodique, 7alt → Altéré, 7♭9 → Mixolydien ♭9 ♭13, 7♯11 → Lydien ♭7, maj7♯5 → Lydien augmenté, 7sus4 → Mixolydien. Règle par qualité, sans analyse de la fonction dans la tonalité (un maj7 de IVe degré reste Ionien et non Lydien). (dictionnaires, champ `mode` de chaque qualité)
7. **MAN-02, enchaînement** : 4 à 8 accords consécutifs d'un standard en cours (choisi ou tiré), un seul sens tiré pour toute la chaîne. Les accords non reconnus sont sautés. (config `man02.chainLength`)
8. **MAN-02, tonique** : l'orthographe la plus lisible pour le mode tiré (Ré♭ ionien plutôt que Do♯ ; Fa♯ et Sol♭ tous deux possibles).
9. **MAN-03, mesure de la vitesse** : tap à l'écran, Espace ou Entrée (compatible avec une pédale Bluetooth qui envoie ces touches). Délai max 5 s, au-delà « hors délai ». Après chaque réponse, l'app montre la bonne note pendant 1,2 s. (config `man03.timeoutSec`)
10. **MAN-03 avec Sur le temps** : fenêtres de 4, 3, 2 temps à partir du 1er temps de chaque mesure ; Prototype et Fantôme : question sur le 4e temps d'une mesure sur deux, réponse sur le temps (ou le contretemps) suivant. La réponse compte si le tap arrive dans la fenêtre.
11. **MAN-03, fonction « septième »** : sixte sur un accord de 6te, quarte à la place de la tierce sur un 7sus4.
12. **Qualités d'accords tirées** : maj7, 6, 7, 7sus4, m7, m6, mMaj7, m7♭5, dim7. Également reconnues dans les grilles mais non tirées par défaut : 7alt, 7♭9, 7♯11, maj7♯5 et les triades. (config `chords.enabledQualities`)
13. **Fondamentales tirées** : 12 hauteurs, orthographiées comme la tonique du mode associé à la qualité (pas de La♯ m7♭5 si Si♭ m7♭5 est plus lisible).
14. **Notation** : noms de notes et d'accords en français (« Ré m7 »). La saisie accepte français et anglais. (config `display.notation` : `fr` ou `en`)
15. **Banque de motifs (MOD-01)** : gamme 1-2-3-4, tierces, 1-2-3-1, 1-2-3-5, triades, arpèges 4 sons, quartes, 1-3-2-4. (dictionnaires)
16. **Tempo progressif (MOD-01)** : départ à 70 % du tempo du bloc, +4 BPM toutes les 8 mesures, plafond à 110 %, puis on tient le plafond. Le dernier palier entendu préremplit le tempo propre au débrief. (config `mod01`)
17. **MOD-01, notes affichées** : jamais par défaut (ce serait la réponse) ; un bouton « Afficher les notes du mode » les révèle.
18. **Un seul tirage par bloc pour MOD-01** ; pour MAN-02 et les exercices sur un accord, un bouton (ou Espace pour MAN-02) tire le suivant.

### Mods
- **Cycle des quartes** : la tonique monte d'une quarte en restant entre 6 bémols et 6 dièses (Sol♭ → Si, pas Do♭). L'app annonce la tonique suivante et le nombre de mesures restantes.
- **Rétrograde Fantôme** : une répétition = 2 mesures ; l'app annonce « à l'endroit » ou « à l'envers » à chaque répétition. (config `mod01.repetitionBars`)
- **Enharmonie** : « Mi♯, Si♯, Fa♭, Do♭ » = ces orthographes sortent une fois sur deux quand la hauteur s'y prête. Doubles altérations : 20 % (occasionnelles) ou 50 % (fréquentes) quand la hauteur en admet une (Sol♯/La♭ n'en a pas).
- **Palette réduite** : notes tirées d'abord parmi les notes de l'accord, puis dans le mode associé pour la 5e note.
- **Motif imposé** : motif rythmique de 2 temps tiré dans une banque de 10, affiché en grille de doubles-croches. (dictionnaires, `rhythms`)
- **Chorus sur un accord** (WLK-01, IMP-01) : 4 mesures, comme le dit la spec.

## Étape 3 — Grilles, répertoire et déchiffrage

### Points à préciser de la spec
1. **Accompagnement (WLK, IMP)** : métronome seul en V1. Un accompagnement harmonique ou de batterie passe en V2.
2. **Préparation avant déchiffrage (DEC-01, DEC-02)** : 60 s, grille ou thème visibles, puis le métronome démarre. Un bouton « Commencer maintenant » abrège. Ce temps n'est pas compté dans la durée du bloc. (config `dec.prepSeconds`)
3. **REP-01, les 10 morceaux de l'année** : l'app ne fixe aucun nombre ; tu saisis autant de mélodies que ton cours en impose.

### Paliers de maîtrise REP-01 (non définis dans la spec)
- **Découverte** : notes connues, pas encore en place.
- **En place** : joué sans arrêt à au moins 60 % du tempo visé du passage.
- **Fiable** : sans arrêt à au moins 85 % du tempo visé. **Débloque Overclock.**
- **Maîtrisé** : au tempo visé.
L'app suggère le palier au débrief d'après le tempo propre et le tempo visé du passage ; c'est toi qui le valides, et il est enregistré sur le passage. (config `rep01.tiers`)

### Données
- **Format de saisie des grilles** : `| Dm7 | G7 | Cmaj7 | % |`, détaillé dans docs/IMPORT.md. Les symboles non reconnus sont gardés tels quels et signalés (sans les citer pour la banque inconnue).
- **Tonalité** : obligatoire pour un standard en cours, facultative pour la banque et les mélodies. Sans tonalité, la transposition part de la fondamentale du premier accord (ou de Do pour une mélodie, ce que l'app signale).
- **Partitions** (thèmes DEC-02, mélodies REP-01) : PDF ou image importés, stockés dans le navigateur. L'app ne lit pas les notes d'une partition.
- **Tempo de référence REP-01** : un par passage, pas par exercice (clé `REP-01:mélodie:passage`).
- **Chorus REP-01** : la longueur du passage si ses mesures de début et de fin sont saisies, sinon 16 mesures. (config `rep01.defaultPassageBars`)
- **Fragment (WLK-02, IMP-02)** : 2 à 4 changements d'accords consécutifs (deux mesures identiques comptent pour un), affichés avec leur durée en temps. Un chorus = la durée du fragment. « Autre fragment » en retire un sans relancer le bloc.
- **Standard choisi ou tiré** : WLK-02/03 et IMP-02/03 proposent un standard au choix ou « tiré au hasard ».

### Anti-spoil
- Le tirage DEC marque le standard « tiré » dans la même transaction, avant tout affichage : il est grillé même si le bloc est abandonné.
- Aucun tirage n'a lieu tant qu'un autre bloc est ouvert, pour ne jamais griller un standard pour rien.
- L'import n'affiche que des compteurs et des numéros. Pour « vider la banque », seuls les jamais tirés sont supprimés, sans être montrés.
- Les standards déjà tirés sont consultables dans Répertoire > Banque de déchiffrage (anciennement onglet Données). L'historique des blocs n'affiche pas les tirages.
- Un test automatique vérifie qu'aucun message d'import ne cite un titre, une tonalité ou un accord, et un test navigateur que rien de la banque n'apparaît à l'écran avant tirage.

### Mods sur grilles
- **Transposition** : tonalité cible tirée au lancement selon la distance sur le cycle des quintes (entre 6 ♭ et 6 ♯). La grille affichée est transposée. Pour REP-01 et DEC-02 (partitions), l'app annonce la tonalité cible ; c'est toi qui transposes. Fantôme : une nouvelle tonalité à chaque chorus, jamais deux fois la même d'affilée.
- **Mémoire vive** : Récup, grille visible pendant le décompte et le 1er chorus ; Street et Corpo, grille visible 30 s ou 10 s en préparation, puis masquée dès le départ du métronome ; Prototype, titre seul ; Fantôme, titre seul et tonalité tirée.
- **Palette réduite sur une grille** (IMP-02/03) : notes de l'accord de tonique d'abord, puis gamme de la tonalité (ionien en majeur, éolien en mineur).
- **Endurance** : compteur « Chorus n / N » affiché pendant le bloc.

### Ajouts hors spec (à valider)
- **Sauvegarde / restauration** complète dans Réglages (fichier JSON, partitions incluses), et demande de stockage persistant au navigateur.
- **Mode hors ligne** : une fois hébergée, l'app reste utilisable sans réseau.

## Intégration du jeu LOW END

Décisions, hypothèses et conflits avec la spec : voir docs/INTEGRATION.md.

## Finalisation — étape 0 : répertoire, planning et générateur (logique pure)

Voir docs/FINALISATION.md pour l'état des lieux, les conflits H à O et l'architecture cible. Toutes les valeurs ci-dessous
sont dans `config.session` (Réglages), sauf mention.

### Répertoire (src/core/repertoire.ts)
1. **Statuts** : trois statuts saisis (à apprendre, en cours, su). « À entretenir » est déduit : su et pas joué depuis
   `maintenanceAfterDays` jours (21). Information seulement : aucune perte, aucun compteur. (config)
2. **Dernier jeu d'un morceau** : dernier bloc terminé ou abandonné d'au moins une minute qui le cite.
3. **Migration** (à valider avant d'être appliquée aux données) : chaque standard et chaque mélodie devient un morceau
   « en cours » avec le même identifiant ; option de fusion d'une mélodie avec le standard de même titre (titre normalisé,
   un seul standard correspondant), avec renommage des tempos de référence REP-01 et conservation de l'ancien identifiant.
4. **Priorité d'un morceau** : −1, 0, +1 ; sert au choix du morceau dans les séances.

### Planning (src/core/planning.ts)
5. **Planning rempli à la main** (ta demande) : pas de semaine type. Chaque jour est « travail » avec un objectif, « off »,
   ou « à définir » tant que tu ne l'as pas rempli. « Copier la semaine précédente » remplit les jours encore vides.
6. **Contraintes de l'école** : des étiquettes libres sur un jour (« Cours 18 h ») et une case « cours de basse » ;
   l'échéance d'un nouveau devoir est par défaut le prochain cours après aujourd'hui, sinon dans 7 jours.
7. **Jour off ou à définir** : objectif nul, aucune séance. Aucun report d'un jour sur l'autre.

### Générateur de séance (src/core/session.ts)
8. **Structure** : blocs de 25 min (`blockMinutes`), pause de 5 min (`pauseMinutes`) non comptée dans l'objectif ; un reste
   de moins de 10 min (`minBlockMinutes`) allonge le dernier bloc, sinon il devient un bloc court.
9. **Ouverture** : premier bloc du jour dans l'axe MAN (`openingAxis`, `null` pour désactiver), seulement si rien n'a
   encore été joué ce jour-là.
10. **Devoirs** : pris en compte à 7 jours de l'échéance (`homeworkHorizonDays`), le plus proche d'abord, un bloc par
    devoir (`homeworkBlocksPerPiece`), au plus la moitié de la séance (`homeworkMaxShare`) et au moins un bloc. Exercice :
    celui que le devoir vise, sinon le moins récent parmi WLK-03, IMP-03, REP-01, WLK-02, IMP-02 selon le contenu de la fiche.
11. **Entretien** : au plus un morceau par séance (`maintenancePerDay`), le moins récemment joué.
12. **Parts cibles par défaut** : MAN 15, WLK 20, MOD 10, IMP 15, RYT 10, EAR 5, REP 15, DEC 10 (%). Un axe à 0 n'est jamais
    proposé. (`axisShares`)
13. **Équilibre sans dette** : la cible d'un axe est sa part du temps de la semaine (déjà joué + reste du jour). Une journée
    manquée ne crée aucun rattrapage ; seule la proportion compte.
14. **Priorité d'axe** : ±50 % sur le retard (`axisPriority`, `priorityWeight`).
15. **Morceau d'un exercice** : morceaux aux statuts `drawStatuses` (tous par défaut) ayant ce qu'il faut (grille ou
    passages) ; ta priorité, puis le moins récemment joué ; REP-01 prend le passage le moins avancé.
16. **Banque inconnue** : DEC-01 n'est proposé que s'il reste un standard jamais tiré avec grille, DEC-02 avec thème. Le
    générateur ne reçoit que ces deux nombres.
17. **Déterminisme** : mêmes données, même séance ; « Régénérer » change de variante.
18. **Suivi** : minutes prévues, minutes jouées, blocs prévus faits, blocs libres. Aucun pourcentage de réussite, aucune couleur d'alerte.

## Finalisation — étapes 2 et 3 : répertoire, planning, séances

### Validé avec toi
- Navigation : rail à gauche (Aujourd'hui, Planning, Répertoire, Mods, LOW END, Journal, Réglages en bas).
- Migration : une mélodie rejoint le standard de même titre (`MIGRATION_MERGE_SAME_TITLE` dans src/storage/db.ts).
- Planning rempli à la main, jour par jour.

### Prises seul
1. **Migration v1 → v2** dans la transaction de mise à niveau d'IndexedDB : tout ou rien (en cas d'erreur, la base reste en
   v1, intacte). Les magasins `standards` et `melodies` sont gardés tels quels, plus lus : filet de sécurité, supprimés en v3.
   Un compte rendu est écrit dans `meta.migrationV2`.
2. **Sauvegarde** : format version 2 (répertoire, planning, séances en plus). Un fichier version 1 se restaure en passant par
   la même migration.
3. **Séance du jour** : générée à la première ouverture d'Aujourd'hui un jour de travail, puis gardée telle quelle.
   « Régénérer » refait le reste de la séance (les blocs faits restent en tête). Si tu changes l'objectif du jour, la séance
   ne change pas toute seule : un bouton « Adapter la séance » le propose.
4. **Jour « à définir »** : Aujourd'hui propose de le remplir en un geste (objectif réglable, ou off).
5. **Lancement depuis la séance** : exercice, durée, morceau et passage préremplis, tout reste modifiable. Si tu changes
   d'exercice, le bloc ne compte plus comme fait dans la séance (il devient un bloc libre).
6. **Pause** : seulement entre deux blocs de la séance, chronométrée, prolongeable de 5 min, son doux à la fin (désactivable).
   Rien ne démarre tout seul. « Sortir de la séance » à tout moment ; un bloc libre reste possible.
7. **Fin de bloc** : le mod obtenu d'abord, le rapport de mission ensuite dans un panneau neutre (issue en couleur de texte,
   sans aplat), puis la pause et le bloc suivant. « Équiper le meilleur » n'a plus l'apparence du bouton principal.
8. **Raccourcis** (clavier ou pédale) : Espace = action principale de l'écran (préparer le bloc, lancer, bloc suivant) ;
   P = pause ; 1 à 5 = note ; Entrée = valider le débrief ; Échap = retour depuis le lancement. Après un toucher,
   Espace déclenche l'action de l'écran et non le bouton touché ; au clavier (Tab), le bouton qui a le focus garde la main.
9. **Écran gardé allumé** pendant un bloc (Wake Lock), repris au retour sur l'onglet.
10. **Morceaux importés par fichier** : statut « À apprendre ». Formats : ceux de docs/IMPORT.md, plus `Compositeur:` et `Forme:`.
11. **Tirage « au hasard »** (WLK, IMP, MAN-02) : parmi les morceaux avec grille aux statuts retenus (`session.drawStatuses`).
12. **Banque de déchiffrage** : onglet à part dans Répertoire, mêmes règles anti-spoil ; les dictionnaires passent dans Réglages.
    L'onglet Données disparaît.
13. **LOW END** : sous-onglets Équipe (avec l'équipement en stock), Recrues et planque, Ville (contrats du jour, quartiers), Journal.
14. **Journal** : semaine en cours (joué et prévu par jour, sans jugement) puis l'historique, avec le morceau travaillé.
    Le titre d'un standard tiré de la banque n'y est pas affiché.
15. **Accessibilité en attendant le style définitif** : bords des contrôles à `--line-strong` (3,8:1), cibles de 44 px,
    cases du métronome sans transition ni lueur. Le reste des jetons attend ton choix de direction visuelle.

## Finalisation — étapes 1 et 4 : thèmes, accessibilité

### Validé avec toi
- Cinq thèmes au choix dans Réglages → Apparence : Néon (par défaut), Phosphore, Signal, Tokyo, Jour (docs/THEMES.md).

### Prises seul
1. **Thème par appareil** : gardé dans le navigateur (`localStorage`, clé `basse-run.theme`), pas dans la base ni dans les
   sauvegardes. Raison : le PC et la tablette n'ont pas la même lumière ni la même distance de lecture. Il est posé avant le
   premier affichage (script dans index.html) : pas d'éclair d'un autre thème au démarrage.
2. **Polices embarquées** (src/themes/fonts, licences dans public/licences-polices) : aucune requête vers Google Fonts, l'app
   reste lisible hors ligne. Le service worker met en cache au premier passage tous les fichiers du build, polices des cinq
   thèmes comprises (liste écrite au build par vite.config.ts) ; le nom du cache change à chaque build, l'ancien est effacé.
3. **Pendant un bloc** : classe `is-in-block` sur la page, aucune animation ni transition, quel que soit le thème.
   `prefers-reduced-motion` coupe aussi les animations hors bloc.
4. **Icônes** : petits dessins SVG (coche, flèches, croix) au lieu de caractères Unicode, qui ne s'affichaient pas de la même
   façon selon la police du thème.
5. **Accessibilité** : audit axe-core sur tous les écrans dans les cinq thèmes, aucune violation. Corrigés en passant : rôles
   de tableau sur la grille, libellés sur des éléments qui n'en acceptent pas, contrastes baissés par une opacité (remplacée
   par une couleur de texte douce ou une bordure en tirets pour un runner blessé), texte sur fond « en cours » du thème
   Phosphore (couleur d'encre dédiée).
6. **Conflits de noms CSS** repérés en intégrant les thèmes (`.rail`, `.app`, `.bar` utilisés à deux endroits) : renommés
   `.navrail`, `.app-shell`, `.axis-track`.

## Finalisation — étape 5 : hébergement sur GitHub Pages

### Validé avec toi
- Hébergeur : **GitHub Pages** (dépôt public, un seul compte). Comparés : Cloudflare (recommandé pour garder le dépôt
  privé, un compte de plus) et Netlify (offre gratuite à crédits, site mis en pause quand ils sont épuisés).

### Prises seul
1. **Publication par GitHub Actions** (`.github/workflows/deploy.yml`) : à chaque envoi sur `main`, `npm ci`, tests, build
   (avec la vérification « rien de personnel ni de secret »), puis publication. Une étape en échec = rien de publié.
   Actions dans leurs dernières versions majeures (Node 24 ; Node 20 a été retiré des exécuteurs GitHub en septembre 2026).
   Node 22 pour le build (`.nvmrc`).
2. **Non indexation** : la balise meta `noindex` est la vraie protection. Sur GitHub Pages, un `robots.txt` placé dans
   `/basse-run/` n'est pas lu (les robots ne lisent que celui de la racine du domaine) ; il est gardé, sans effet, pour le
   cas d'un autre hébergeur. Pas d'en-tête HTTP possible sur GitHub Pages : le fichier `_headers` et la configuration
   Cloudflare ont été retirés. Option documentée : un dépôt `<pseudo>.github.io` avec un robots.txt qui interdit tout.
3. **Dépôt public** : seulement code, tests et documentation. Adresse e-mail des commits masquée (adresse
   `noreply` de GitHub, et blocage des envois qui l'exposeraient) : étape obligatoire du guide.
4. **Vérification avant publication** (`tools/check-publish.mjs`, lancée par `npm run build`) : refuse un motif de clé
   Anthropic dans les sources ou le site, une sauvegarde, un fichier de partition, d'image ou d'archive, et vérifie la
   balise `noindex`. Les tests construisent leurs fausses clés à l'exécution pour ne pas la déclencher.
5. **`.gitignore` large** (`*.pdf`, images, `*.txt`, `*.csv`, archives, sauvegardes…) avec exceptions nommées : licences des
   polices, icônes de l'app, `public/robots.txt`. Vérifié par un clone propre : le build passe avec les seuls fichiers suivis.
6. **Politique de sécurité du contenu** en balise meta (au build seulement ; le build « simple fichier » n'en a pas, il met
   le script de thème en ligne) : scripts et polices de l'app seulement, réseau vers `api.anthropic.com` seulement. Le
   script qui pose le thème avant l'affichage est dans un fichier (`public/theme-boot.js`) pour pouvoir interdire tout
   script en ligne. Pas de `Referer` envoyé.
7. **Mises à jour** : le nouveau service worker prend la main tout de suite mais la page n'est jamais rechargée d'office ;
   un bandeau (hors bloc) propose « Recharger maintenant » ou « Plus tard ». Vérification d'une nouvelle version aussi au
   retour au premier plan (app installée laissée ouverte).
8. **Icônes PNG** 192, 512 et « maskable » (fond plein, dessin dans la zone sûre) en plus de l'icône SVG, pour une vraie
   installation sur Android.
9. **Partition PDF** : lien « Ouvrir la partition en plein écran » sous l'aperçu, car Chrome sur Android n'affiche pas
   toujours un PDF dans la page.
10. **Pas de mot de passe sur le site** : il ne contient que du code, les données sont dans les navigateurs.
11. **Vérifié** : site servi sous `/basse-run/` comme sur GitHub Pages → installable (aucune erreur d'installabilité dans
    Chromium), service worker limité à `/basse-run/`, ouverture et navigation hors ligne, aucune erreur ni fichier manquant.
12. **Mise en ligne depuis le navigateur seul** (à ta demande) : sans Git ni Node sur le PC. Je livre le code en dossiers
    `envoi-1`, `envoi-2`… de moins de 100 fichiers (limite de l'envoi par le site GitHub), préparés par
    `tools/pack-envois.mjs` (`npm run envois`) avec les seuls fichiers que Git suivrait (le `.gitignore` est appliqué).
    Le dossier `.github` (publication automatique) est toujours dans le dernier envoi, et Pages est activé juste avant :
    la première publication part avec tous les fichiers. Vérifié en refusionnant les envois : 210 fichiers, tests et build
    verts. Limite : envoyer des fichiers ne supprime pas ceux qui sont en ligne ; je donnerai la liste des fichiers
    supprimés à chaque livraison qui en retire.
13. **Version de Node du build** écrite directement dans la publication (22) plutôt que lue dans `.nvmrc` : un fichier
    commençant par un point pourrait ne pas passer par l'envoi depuis le navigateur.
