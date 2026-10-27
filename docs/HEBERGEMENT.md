# Hébergement sur GitHub Pages, pas à pas (navigateur seul)

But : Basse Run en ligne en HTTPS, installée comme une application sur le PC portable Windows et la tablette Android,
utilisable hors ligne, mise à jour à chaque envoi du code, invisible des moteurs de recherche.

Tout se fait dans le navigateur, sur le PC (glisser-déposer de dossiers) : rien à installer. Les tests et la construction
du site tournent chez GitHub.

Adresse finale : `https://<ton-pseudo>.github.io/basse-run/` (pseudo GitHub en minuscules).

## 0. Ce qui est public, ce qui ne l'est pas

Avec GitHub gratuit, le dépôt doit être **public** pour publier sur Pages.

| Public (lisible par qui ouvre le dépôt) | Jamais en ligne |
|---|---|
| Le code de l'app, les tests, la documentation de conception (`docs/`, dont les décisions et la conception du jeu) | Tes données : répertoire, partitions, historique, planning, partie, banque inconnue. Elles ne sont que dans le navigateur de chaque appareil. |
| Le nom et l'adresse e-mail liés à chaque envoi (d'où l'étape 1 : adresse masquée) | La clé de l'API Claude : saisie dans l'app, gardée dans le navigateur, jamais dans les sauvegardes ni dans le dépôt |

Garde-fous :
- Les dossiers `envoi-1`, `envoi-2`, `envoi-3` livrés contiennent uniquement le code (les fichiers personnels possibles
  sont écartés par le `.gitignore` au moment où je les prépare). **N'y ajoute rien.**
- Chez GitHub, chaque publication lance les tests puis `npm run build`, qui se termine par une vérification
  (`tools/check-publish.mjs`) : clé d'API, sauvegarde, partition ou image personnelle trouvée, ou balise de non
  indexation absente = échec, rien n'est publié, la version en ligne reste la précédente.
- Non indexation : balise `<meta name="robots" content="noindex, nofollow…">` sur la page. (Sur GitHub Pages, le
  `robots.txt` d'un sous-dossier comme `/basse-run/` n'est pas lu par les robots : c'est la balise qui protège, et c'est
  la méthode que Google recommande. Option au § 8 pour aller plus loin.)
- Politique de sécurité du contenu : aucun script en ligne ni venu d'ailleurs ; seule sortie réseau autorisée :
  `api.anthropic.com` (récits du jeu).

## 1. Compte GitHub et adresse e-mail masquée (une fois)

1. Créer un compte sur github.com si besoin.
2. Photo de profil (en haut à droite) → **Settings** → **Emails** :
   - cocher **Keep my email addresses private** ;
   - cocher **Block command line pushes that expose my email**.

   Les envois faits depuis le site utiliseront l'adresse masquée `…@users.noreply.github.com`.

## 2. Créer le dépôt (une fois)

**+** (en haut à droite) → **New repository**
- Repository name : `basse-run`
- **Public**
- Ne rien cocher (pas de README, pas de .gitignore, pas de licence).
- **Create repository**.

## 3. Envoyer le code (une fois)

Sur le PC : clic droit sur `basse-run-envois.zip` → **Extraire tout**. Tu obtiens trois dossiers : `envoi-1`, `envoi-2`,
`envoi-3`. Chaque envoi reste sous la limite de GitHub (100 fichiers à la fois).

**Envoi 1**
1. Sur la page du dépôt vide, cliquer le lien **uploading an existing file** (ou, plus tard : **Add file** →
   **Upload files**).
2. Dans l'Explorateur Windows, ouvrir le dossier `envoi-1`, tout sélectionner (**Ctrl+A**) et faire glisser la sélection
   sur la page GitHub. Il faut glisser le **contenu** du dossier (`docs`, `public`, `src`, `package.json`…), pas le
   dossier `envoi-1` lui-même.
3. Attendre que la liste des fichiers ait fini de se remplir.
4. En bas : message « Envoi 1 », **Commit directly to the main branch**, puis **Commit changes**.
5. Contrôle : à la racine du dépôt, tu dois voir `docs`, `public`, `src`, `tools`, `package.json`, `.gitignore`…

**Envoi 2** : retour à la page du dépôt (onglet **Code**) → **Add file** → **Upload files** → glisser le contenu de
`envoi-2` (`src`, `tests`) → **Commit changes**. Les fichiers rejoignent le dossier `src` existant, rien n'est écrasé.

**Avant l'envoi 3 : activer GitHub Pages**
- Dans le dépôt : **Settings** → **Pages** → **Build and deployment** → **Source** : **GitHub Actions**.

**Envoi 3** : **Add file** → **Upload files** → glisser le contenu de `envoi-3` (`.github`, `src`) → **Commit changes**.

Contrôle : à la racine du dépôt, un dossier `.github` doit apparaître. S'il manque (certains navigateurs ignorent les
dossiers commençant par un point) : **Add file** → **Create new file**, taper le nom `.github/workflows/deploy.yml`, y
coller le contenu du fichier `envoi-3\.github\workflows\deploy.yml` (ouvert avec le Bloc-notes), puis **Commit changes**.

## 4. Première publication

1. Onglet **Actions** : « Publier sur GitHub Pages » tourne (point jaune), 1 à 3 minutes.
2. Les deux étapes `build` et `deploy` passent au vert ; l'adresse apparaît sous `deploy`.
3. Ouvrir `https://<ton-pseudo>.github.io/basse-run/`.

Si la publication ne s'est pas lancée (dossier `.github` ajouté à la main avant d'activer Pages, par exemple) :
**Actions** → « Publier sur GitHub Pages » → **Run workflow**.

Facultatif : sur la page d'accueil du dépôt, roue dentée à côté de **About** → laisser **Website** vide et décocher
« Use your GitHub Pages website », pour que la page du dépôt ne fasse pas de lien vers l'app.

## 5. Installer l'app sur chaque appareil

### PC portable Windows (Edge ou Chrome)
1. Ouvrir l'adresse.
2. Edge : icône « Application disponible » dans la barre d'adresse (ou menu ⋯ → Applications → Installer Basse Run).
   Chrome : icône d'installation dans la barre d'adresse (ou menu ⋮ → Caster, enregistrer et partager → Installer la page
   en tant qu'application).
3. L'app a sa fenêtre et son icône dans le menu Démarrer ; on peut l'épingler à la barre des tâches.

### Tablette Android (Chrome)
1. Ouvrir l'adresse dans Chrome.
2. Menu ⋮ → **Ajouter à l'écran d'accueil** → **Installer** (ou la bannière « Installer l'application »).
3. L'icône arrive sur l'écran d'accueil ; l'app s'ouvre en plein écran, sans barre d'adresse.

### Vérifications sur chaque appareil
- [ ] Thème choisi (Réglages → Apparence) : il est propre à l'appareil.
- [ ] Un bloc de 5 minutes : métronome, écran qui reste allumé (tablette), raccourcis Espace / P (PC).
- [ ] Une partition PDF d'un morceau : sur la tablette, si elle ne s'affiche pas dans la page, « Ouvrir la partition en
      plein écran ».
- [ ] Hors ligne : couper le Wi-Fi, fermer complètement l'app, la rouvrir → elle s'ouvre et un bloc se lance.
      (Seuls les récits du jeu par l'API ont besoin du réseau ; sans réseau, le jeu utilise ses gabarits locaux.)
- [ ] Clé de l'API Claude (facultative) : à saisir sur chaque appareil, dans Réglages → Jeu (LOW END) → Récits par l'API
      Claude. Elle n'est jamais copiée par les sauvegardes.

## 6. Mettre à jour

**Quand je te livre une nouvelle version** (toujours sous forme de dossiers `envoi-N`) :
1. Refaire les envois dans l'ordre : **Add file** → **Upload files** → glisser le contenu de chaque dossier →
   **Commit changes**. Les fichiers de même nom sont remplacés. (Pages est déjà activé : rien à refaire de ce côté.)
2. Si je t'indique des fichiers **supprimés** dans cette version : les ouvrir un par un dans le dépôt → menu **⋯** →
   **Delete file** → **Commit changes**. (Envoyer des fichiers ne supprime jamais ceux qui sont déjà en ligne.)
3. Chaque envoi relance la publication ; seule la dernière compte. Onglet **Actions** : la dernière ligne doit être verte.

**Sur les appareils :** à la prochaine ouverture (ou au retour sur l'app), la nouvelle version se télécharge en
arrière-plan. L'app ne se recharge jamais d'elle-même (un bloc pourrait être en cours) : un bandeau propose « Recharger
maintenant » ou « Plus tard » ; sinon elle s'applique au démarrage suivant. Pour forcer : fermer toutes les fenêtres de
l'app et la rouvrir.

Les données ne sont pas touchées par une mise à jour. Si une version change le format de la base, la migration se fait à
l'ouverture, en tout ou rien : en cas d'erreur, l'ancienne base reste intacte (voir DECISIONS.md).

Si l'onglet **Actions** montre une croix rouge : la version en ligne n'a pas changé. Ouvrir le passage en échec pour
lire l'étape fautive (test, build ou vérification « rien de personnel ») et m'envoyer une capture.
Pendant une mise à jour en plusieurs envois, les passages intermédiaires peuvent échouer (fichiers pas encore tous là) :
seul le dernier compte.

## 7. Données : à savoir

- **Chaque appareil a ses propres données.** Le PC et la tablette ne se synchronisent pas.
- **Passer de l'un à l'autre** : Réglages → Sauvegarde → « Exporter une sauvegarde » sur l'appareil de départ, envoyer
  le fichier (`basse-run-AAAA-MM-JJ.json`) à l'autre appareil (câble USB, mail à toi-même, Drive), puis « Choisir une
  sauvegarde » → Restaurer. **La restauration remplace tout** sur l'appareil d'arrivée : pas de fusion. Le plus simple :
  un appareil principal, ou toujours transférer avant de changer d'appareil.
- **Ne jamais effacer les « données de site »** (Effacer les données de navigation avec « Cookies et données de sites »,
  ou désinstaller en cochant la suppression des données) sans sauvegarde récente : tout serait perdu. Vider seulement le
  **cache** (« Images et fichiers en cache ») ne touche pas aux données.
- L'app demande au navigateur un stockage « persistant » : il ne l'efface pas de lui-même quand la place manque.
- Le fichier de sauvegarde contient tout (répertoire, partitions, historique, partie, banque inconnue) : garde-le pour toi,
  **jamais dans un dossier `envoi-N`** ni sur GitHub, et ne l'ouvre pas si tu veux éviter de voir la banque.
- Une sauvegarde par semaine, rangée à part, est une bonne habitude.

## 8. Sécurité : liste de contrôle

Avant le premier envoi :
- [ ] Adresse e-mail masquée (§ 1).
- [ ] Les dossiers `envoi-N` sont tels que livrés : aucune sauvegarde, partition ni image ajoutée.
- [ ] La clé de l'API Claude n'a été saisie que dans l'app, jamais dans un fichier.

Après la mise en ligne :
- [ ] Onglet **Actions** : la publication est verte (elle comprend la vérification « rien de personnel ni de secret »).
- [ ] Afficher le code source de la page (Ctrl+U) : la ligne `<meta name="robots" content="noindex…` est là.
- [ ] Optionnel : sur console.anthropic.com, une clé dédiée à Basse Run avec une limite de dépense mensuelle.

Option (non nécessaire) : pour fermer aussi l'exploration par les robots sur tout ton domaine `github.io`, créer un second
dépôt public nommé exactement `<ton-pseudo>.github.io` contenant un fichier `robots.txt` (`User-agent: *` puis
`Disallow: /`, créé avec **Add file** → **Create new file**) et activer Pages dessus (Settings → Pages → Source :
Deploy from a branch → main).

L'adresse du site n'est pas protégée par un mot de passe : quelqu'un qui la connaîtrait verrait une app vide, puisque les
données ne sont que dans tes navigateurs.

## Annexe : avec Git en ligne de commande

Si un jour tu préfères le terminal (Git pour Windows et Node.js 22 installés) : cloner le dépôt
(`git clone https://github.com/<ton-pseudo>/basse-run.git`), configurer l'adresse masquée
(`git config --global user.email "<id>+<pseudo>@users.noreply.github.com"`), remplacer les fichiers, puis
`npm install`, `npm test`, `npm run build`, `git add -A`, `git status` (relire la liste), `git commit -m "…"`, `git push`.
Le `.gitignore` écarte alors sauvegardes, partitions et images, et les suppressions de fichiers suivent toutes seules.
