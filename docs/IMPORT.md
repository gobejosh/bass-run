# Formats d'import

## Morceaux du répertoire ou banque inconnue

Le même format sert à importer des morceaux dans le Répertoire (bouton « Importer un fichier ») et des standards dans la
banque de déchiffrage. Les morceaux importés arrivent avec le statut « À apprendre ».

Fichier texte, un standard par bloc, blocs séparés par une ligne `---`. Seul `Titre` est obligatoire ; il faut une grille, un thème, ou les deux.

```
Titre: Mon standard
Compositeur: Joseph Kosma
Forme: AABC
Tonalité: Sol m
Mesure: 4
Thème: mon-standard.pdf
| Cm7 | F7 | Bbmaj7 | Ebmaj7 |
| Am7b5 | D7 | Gm6 | % |
---
Titre: Un autre
Tonalité: Fa
| Fmaj7 | % | Gm7 C7 | Fmaj7 |
```

- **Tonalité** : tonique en français ou en anglais, suivie de `m` pour mineur (`Sol m`, `Gm`, `Sib`, `Eb`).
- **Compositeur**, **Forme** : facultatifs, pour le répertoire seulement (ignorés pour la banque inconnue).
- **Mesure** : nombre de temps (4 par défaut).
- **Thème** : nom du fichier de partition importé en même temps (DEC-02). Sans cette ligne, l'app cherche un fichier dont le nom ressemble au titre.
- **Grille** : `|` entre les mesures, espaces entre les accords d'une même mesure (temps partagés également), `.` pour prolonger d'un temps (`Dm7 . . G7` = 3 + 1), `%` pour répéter la mesure précédente, `N.C.` pour un arrêt. Retours à la ligne libres. Les lignes commençant par `#` sont ignorées.
- **Accords reconnus** : maj7 (Δ, M7, maj9…), 6, 69, 7 (9, 13), 7sus4, 7alt (7#9, 7b13, 7#5…), 7b9, 7#11, m7 (-7, m9, m11), m6, mMaj7 (m(maj7), -Δ), m7b5 (ø), dim7 (°7), maj7#5, triades majeures et mineures, basse `/X`. Un symbole inconnu est gardé tel quel à l'affichage.

Le même contenu peut être fourni en JSON :

```json
[
  { "title": "Mon standard", "key": "Sol m", "beatsPerBar": 4, "grid": "| Cm7 | F7 | Bbmaj7 | Ebmaj7 |", "theme": "mon-standard.pdf" }
]
```

## Banque inconnue : anti-spoil

L'import n'affiche que des compteurs et des numéros (« standard n° 3 : tonalité illisible »), jamais un titre ni un accord. Prépare et vérifie ton fichier **avant** de l'importer, sans regarder les grilles si possible (par exemple en le faisant générer depuis un recueil par quelqu'un d'autre). Un standard n'est consultable dans Répertoire > Banque de déchiffrage qu'une fois tiré.

Sans fichier de grilles, chaque partition importée devient un standard « thème seul » (DEC-02), titré d'après son nom de fichier.
