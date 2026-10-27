# Basse Run — les 5 thèmes

Pupitre néon, Terminal phosphore, Signalétique industrielle, Éditorial Néo-Tokyo et Pupitre de jour, commutables dans l'application.

## Contenu

| Fichier | Rôle |
|---|---|
| `themes.css` | Tous les jetons : communs (espacements, cibles, mouvement) et un bloc par thème (couleurs, polices, tailles, rayons, allure). Les ratios WCAG sont notés en commentaire à côté de chaque couleur. |
| `theme.js` | Applique le thème enregistré avant le premier affichage, l'enregistre, met à jour la couleur de la barre système de la PWA. |
| `fonts/` | 36 fichiers woff2 (alphabet latin, français complet) + un repli pour ♭ ♮ ♯. Environ 0,9 Mo en tout. |
| `fonts/licences/` | Les licences OFL 1.1 de chaque famille. À garder avec les polices. |
| `precache.json` | La liste des fichiers à mettre en cache dans le service worker. |
| `demo.html` | Page d'essai : sélecteur de thème et composants de référence (panneaux, blocs, grille, métronome, raretés) écrits uniquement avec les jetons. |

## Intégration en 4 étapes

**1. Copier le dossier** à côté de `styles.css` (les chemins des polices sont relatifs à `themes.css`).

**2. Charger les deux fichiers dans `<head>`**, avant `styles.css`, et sans `defer` pour `theme.js` :

```html
<link rel="stylesheet" href="basse-run-themes/themes.css">
<script src="basse-run-themes/theme.js"></script>
<link rel="stylesheet" href="styles.css">
```

**3. Remplacer les couleurs de la V1 dans `styles.css`** par les jetons. Supprime ton bloc `:root` de couleurs et polices, puis remplace chaque valeur :

| Valeur V1 | Rôle | Jeton |
|---|---|---|
| `#120f24` | fond | `var(--c-bg)` |
| `#0d0a1c` | fond pendant un bloc | `var(--c-scene)` |
| `#1b1735` | panneaux | `var(--c-surface)` |
| `#241f44` | éléments posés | `var(--c-raised)` |
| `#3a3366`, `#2c2752` | séparateurs | `var(--c-line)` |
| `#766db3` | bords de champs et boutons | `var(--c-line-strong)` |
| `#eeeafb` | texte | `var(--c-ink)` |
| `#c4bfe3` | texte secondaire | `var(--c-ink-2)` |
| `#a29bcb`, `#8d86b8` | métadonnées | `var(--c-ink-3)` |
| `#4fe3ee` | action, maintenant | `var(--c-action)` |
| `#06262a` | texte sur action | `var(--c-on-action)` |
| `#1d6f78` | cadre du bloc suivant | `var(--c-action-dim)` |
| `#16303a` | fond de la mesure en cours, ligne « suivant » | `var(--c-now-bg)` |
| `#ffb04a` | devoirs, annonces | `var(--c-devoir)` |
| `#6a5226` / `#1f1a24` | cadre / fond du panneau devoirs | `var(--c-devoir-dim)` / `var(--c-devoir-bg)` |
| `#ff6b6b` / `#8a3a4a` | abandonner (texte / bord) | `var(--c-abandon)` / `var(--c-abandon-dim)` |
| `#b3ab98` `#6ee09a` `#5ba8ff` `#b98bff` `#ff5ca8` | raretés | `var(--c-rar-recup)` `--c-rar-street` `--c-rar-corpo` `--c-rar-proto` `--c-rar-fantome` |
| `'Chakra Petch'` | titres | `var(--f-display)` |
| `'Instrument Sans'` | texte | `var(--f-text)` |
| chiffres, codes | | `var(--f-mono)` |
| accords | | `var(--f-chord)` et `var(--fw-chord)` |
| chrono, tempo, pause | | `var(--f-chrono)` et `var(--fw-chrono)` |
| tailles d'accords, de chrono | | `var(--fs-chord)`, `--fs-chord-2`, `--fs-chord-portrait`, `--fs-chord-portrait-2`, `--fs-chrono`, `--fs-chrono-portrait`, `--fs-pause`, `--fs-bpm` |

Deux changements de sens par rapport à la V1 : les étiquettes de rareté s'écrivent en `--c-rar-ink` **sur** une plaque de la couleur de rareté (et non plus en texte coloré), et « Succès » dans le rapport de mission reste en `--c-ink` (il n'emprunte plus le vert de Street).

**4. Brancher les jetons d'allure.** Ce sont eux qui font qu'un thème ne se résume pas à ses couleurs. Exemples, repris de `demo.html` :

```css
.label { font: var(--fw-label) var(--fs-label)/1.2 var(--f-label);
         text-transform: var(--label-case); letter-spacing: var(--label-tracking); }
.label::before { content: var(--label-before); }   /* « [ » en Terminal */
.label::after  { content: var(--label-after); }

.panel { background: var(--panel-bg); border: var(--panel-border);
         border-top: var(--panel-rule); border-radius: var(--r-lg); padding: var(--panel-pad); }
.panel--now    { border: var(--panel-now-border); border-top: var(--panel-now-rule); }
.panel--devoir { background: var(--panel-devoir-bg); border: var(--panel-devoir-border); border-top: var(--panel-devoir-rule); }

.btn--primary { background: var(--c-action); color: var(--c-on-action); clip-path: var(--btn-primary-clip); }

.blk--next { background: var(--row-next-bg); color: var(--row-next-ink); border: var(--row-next-border); }
.bar--now  { background: var(--now-cell-bg); box-shadow: var(--now-cell-ring); }
.bar--now .chord { color: var(--now-cell-ink); }   /* vidéo inverse en Terminal, aplat rose en Néo-Tokyo */

h1 { font: var(--fw-display) var(--fs-h1)/1 var(--f-display);
     text-transform: var(--title-case); letter-spacing: var(--title-tracking); }
```

## Le sélecteur dans les réglages

```js
// Construire la liste
BasseRunTheme.list.forEach(t => /* t.id, t.label, t.color */ …);
// Choisir
BasseRunTheme.set('signal');
// Réagir au changement (par exemple pour redessiner un canvas)
document.addEventListener('basse-run:theme', e => console.log(e.detail.id));
```

`demo.html` contient un sélecteur prêt à copier : un groupe de boutons radio dans un `fieldset`, cibles de 56 px, focus visible. Le choix est gardé dans `localStorage` (clé `basse-run.theme`) ; si tu ranges déjà tes réglages ailleurs, appelle simplement `BasseRunTheme.set(id)` au démarrage.

Le thème ne doit pas changer pendant un bloc : ne propose le sélecteur que hors bloc.

## Hors ligne (service worker)

Ajoute le contenu de `precache.json` à ta liste de précache, en préfixant chaque chemin par `basse-run-themes/`. Le navigateur ne télécharge que les polices du thème affiché, mais sans précache un changement de thème hors ligne retomberait sur les polices système.

## Règles à garder

- **Pendant un bloc**, pose la classe `is-in-block` sur `<body>` : `themes.css` y coupe toute animation et toute transition. Les cases du métronome changent de couleur instantanément, sans transition ni lueur.
- **`prefers-reduced-motion`** : les durées `--dur` et `--dur-fast` tombent à zéro automatiquement. Utilise-les pour toutes tes transitions hors bloc.
- **Chiffres qui changent** (chrono, tempo, compteurs) : toujours en `--f-mono` ou `--f-chrono`. Ce sont des polices à chasse fixe, les chiffres ne bougent pas. Chakra Petch, Anton et Saira n'ont pas de chiffres tabulaires.
- **♭ ♮ ♯** : aucune des 14 familles ne les contient. Ils viennent de Noto Sans Symbols, agrandi à 150 % pour atteindre la hauteur des capitales, déjà branché dans toutes les piles de polices (`'Basse Run Musique'`). Rien à faire.
- **Icônes** : ✓, → et les blocs █ ░ ne sont pas dans les polices embarquées (sous-ensemble latin). Utilise des icônes SVG en `currentColor` plutôt que ces caractères, sinon ils viendront d'une police système différente selon l'appareil.
- **Rouge** : `--c-abandon` sert seulement à abandonner ou supprimer, jamais à signaler un retard.
- **Axes de travail** (MAN, WLK…) : écrits, jamais codés par couleur. Les barres de part du temps utilisent `--c-ink-3`.
- **Focus clavier** : `outline: var(--focus-width) solid var(--c-focus); outline-offset: var(--focus-offset);` sur `:focus-visible`.

## Contrastes

Tous recalculés à partir de `themes.css` : texte ≥ 4,5:1 sur le fond, les panneaux, les éléments posés et le fond des devoirs ; bords de champs et boutons ≥ 3:1 sur le fond, les panneaux et la scène ; étiquettes de rareté ≥ 4,5:1 sur leur plaque, plaques ≥ 3:1 sur les panneaux. `--c-line` est purement décoratif et n'a pas de seuil : ne l'utilise jamais seul pour délimiter un bouton ou un champ.

## Licences

Les 15 familles sont sous SIL Open Font License 1.1 (fichiers dans `fonts/licences/`). Tu peux les embarquer dans l'application et la distribuer ; garde les licences avec les fichiers et ne vends pas les polices seules. Fichiers issus des paquets Fontsource (sous-ensemble latin).
