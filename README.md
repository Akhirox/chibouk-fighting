# Chibouk Fighting

Combat de ring 3D dans le navigateur, avec 5 combattants et un public de singes.
Three.js (rendu et animations) et cannon-es (physique des objets), sans étape de compilation.

## Mettre en ligne sur GitHub Pages

1. Créez un dépôt sur GitHub, par exemple `chibouk-fighting`.
2. Envoyez **tout le contenu de ce dossier** à la racine du dépôt :
   `index.html`, `.nojekyll`, `css/`, `js/`, `lib/` et `assets/`.
   - Par l'interface web : *Add file → Upload files*, glissez les fichiers et dossiers, puis *Commit changes*.
   - En ligne de commande :
     ```bash
     git init && git add . && git commit -m "Chibouk Fighting"
     git branch -M main
     git remote add origin https://github.com/VOTRE-PSEUDO/chibouk-fighting.git
     git push -u origin main
     ```
3. Dans le dépôt, allez dans **Settings → Pages**, choisissez *Source : Deploy from a branch*, branche `main`, dossier `/ (root)`, puis *Save*.
4. Au bout d'une minute environ, le jeu est en ligne à l'adresse
   `https://VOTRE-PSEUDO.github.io/chibouk-fighting/`.

> Le fichier `.nojekyll` est caché sur macOS et Linux. Vérifiez qu'il a bien été envoyé.

## Tester en local

Il faut passer par un petit serveur web, car ouvrir `index.html` en double-cliquant bloque le chargement du modèle :

```bash
npx serve .            # ou : python3 -m http.server 8000
```

Ouvrez ensuite l'adresse affichée (par exemple http://localhost:3000).

## Commandes

| Action | Joueur 1 / Solo | Joueur 2 |
|---|---|---|
| Se déplacer | `Z Q S D` (AZERTY) ou `W A S D` (QWERTY) ; en solo, les flèches marchent aussi | Flèches |
| Sprint | `Maj` gauche | `Maj` droit |
| Direct du droit | `F` (ou `J` en solo) | `K` / pavé num. `1` |
| Coup de pied | `G` (ou `K` en solo) | `L` / pavé num. `2` |
| Uppercut | `H` (ou `L` en solo) | `J` / pavé num. `3` |
| Esquive (avec gauche/droite pour choisir le côté) | `Espace` | `Ctrl` droit, `Entrée` ou pavé num. `0` |
| Provoquer | `T` | `U` / pavé num. `5` |

Pendant le combat :

- `C` change de caméra (Dynamique, Plan TV, Cinéma, Libre à la souris).
- `O` déclenche une pluie d'objets.
- `Échap` ou `P` met en pause.

Sur mobile, en mode Joueur vs IA, un joystick et quatre boutons s'affichent (poing, pied, uppercut, esquive).

## Combattants

Louis, Niels, Rioky, Arnaud et Thomas, à choisir dans l'onglet **Combattants** du menu (portraits).
Seuls les deux combattants choisis sont téléchargés, ce qui garde le chargement rapide.

## Équilibrage

- Le direct sort vite (×1,45) ; le coup de pied est plus lent (×0,88), puissant mais punissable.
- Après s'être relevé, un combattant est invincible 0,9 s (il clignote). Attaquer met fin à cette protection.
- Les esquives rendent invincible au milieu du mouvement.

## Animations

Tous les combattants partagent une bibliothèque d'animations, `assets/anims.glb` (même squelette Mixamo).

| Rôle dans le jeu | Clip |
|---|---|
| Repos, marche, sprint | `Idle`, `Walk`, `Sprint` |
| Attaques | `Punch Cross`, `Kick`, `Melee Uppercut` |
| Esquives (invincible au milieu du mouvement) | `Dodge Left`, `Dodge Right` |
| Impacts selon la zone touchée | `Hit Head`, `Hit Chest`, `Hit Stomach`, `Hit Shoulder Left`, `Hit Shoulder Right` |
| Mise au sol et K.O. | `Hit Knockback` |
| Provocation et fin de round | `Yes` |
| Victoire | `Celebration` puis `Dance` |

Il manque un clip ? Le jeu se rabat sur un comportement simple (réaction procédurale au coup, recul au lieu d'esquive…).

## Réglages (menu)

- **Combat** : mode (IA vs IA, Joueur vs IA, 2 joueurs), nombre de rounds, durée, points de vie, puissance des coups, chance de mise au sol, vitesses.
- **Combattants** : choix du combattant de chaque coin et couleur de sa tenue.
- **IA** : niveau (de Facile à Légende) et agressivité.
- **Physique** : nombre d'objets, gravité (Lune à Jupiter), rebond, force des impacts.
- **Affichage & son** : caméra, ralenti sur les K.O., secousses, chiffres de dégâts, ombres, public, musique, bruitages.

Les réglages sont mémorisés dans le navigateur.

## Ajouter un combattant

1. Exportez-le depuis Meshy en GLB avec le squelette **Mixamo** (les animations du fichier ne sont pas nécessaires).
2. Déposez-le dans `assets/fighters/<id>.glb` et ajoutez un portrait carré `assets/portraits/<id>.jpg`.
3. Ajoutez une ligne `{ id: '<id>', name: 'NOM' }` dans `ROSTER` (fichier `js/config.js`).

Les modèles de ce dossier ont été compressés (meshopt) ; un GLB brut de Meshy fonctionne aussi, il est juste plus lourd.

## Public et musique

- Le premier rang est fait de singes animés (repos, surprise, célébration, danse, pleurs) qui réagissent au combat : les fans de chaque coin sont assis de son côté.
- Les rangs suivants utilisent une version allégée du singe, figée en deux poses, pour ménager la carte graphique.
- La musique de fond (`assets/audio/chibouk-fighting.mp3`) démarre au premier clic ; volume réglable dans *Affichage & son*.
- Les bruitages d'impact sont dans `assets/audio/` (3 variantes de direct, 3 de coup lourd, souffles, chute).

## Structure

```
index.html        page, menu et HUD
css/style.css     styles
js/main.js        boucle de jeu, rounds, caméra, menu
js/fighter.js     combattant : animations, coups, réactions, couleur
js/ai.js          intelligence artificielle
js/physics.js     objets physiques et colliders (cannon-es)
js/arena.js       ring, cordes élastiques, lumières, public
js/fx.js          étincelles, chiffres de dégâts, sons synthétisés
js/input.js       clavier et tactile
js/config.js      réglages par défaut
js/assets.js      chargement des modèles (avec cache)
lib/              three.js r170, décodeur meshopt et cannon-es 0.20 (inclus, aucun CDN nécessaire)
assets/fighters/  les 5 combattants
assets/portraits/ leurs portraits
assets/anims.glb  bibliothèque d'animations de combat
assets/monkey*.glb  le public (version animée et version allégée)
assets/audio/     musique et bruitages
```
