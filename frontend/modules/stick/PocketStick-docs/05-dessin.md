# Outil Dessin (29 septembre 2026)

Porté de PocketStick (`I:\PocketStick\src\editor` : `draw/path.js`,
`canvas/DrawingLayer.jsx`, `panel/sections/draw.jsx`,
`store/document.js:185`), en lots séparés, suivant la règle « portage à
l'identique » : le lot 0 copie, les lots suivants améliorent.

## Lot 0 — portage (fait)

- `labels/utils/dessin.js` : copie de `path.js` (perfect-freehand 1.2.3,
  même contour, même chemin SVG, même curseur). Test repris :
  `utils/dessin.test.js`.
- **Seul écart, décidé avant le portage : un type d'élément `dessin`**, et non
  une image à src data URL (PocketApp n'a pas de type `svg`). L'élément GARDE
  ses points — plats, `[x0, y0, …]`, relatifs à `x`/`y`, arrondis au
  centième — et ses réglages (`strokeWidth`, `smoothing`, `thinning`,
  `brushType`) ; sa couleur est `fill`. Recolorer = changer `fill`.
- **Une seule règle de rendu** : `dessinTrace(el)` → `{ data, fill, opacity }`,
  lue par `components/canvas/DessinNode.jsx` (canvas) et par la branche
  `dessin` de `exportPdfSheet.js`. L'export du canvas cloné hérite du nœud.
  Le contour est mis en cache par tableau de points (WeakMap).
- Saisie : `components/canvas/DessinCalque.jsx`, copie de `DrawingLayer.jsx`,
  posé HORS du groupe du document (qui est cloné pour l'export).
- Store (`useLabelStore`) : `outilDessin`, `reglagesDessin` — ni historique ni
  template — et `ajouterDessin(points)`, qui passe par `addElement` : un trait
  = un Ctrl+Z. Activer le dessin vide la sélection et quitte le recadrage.
- Onglet « Dessin » (`templates/DessinPanel.jsx`), entre Assets et Effets.
  Quitter l'onglet ou Échap rend la sélection.
- Flou, ombres : `appliquerEffets` est générique par élément, un dessin en
  bénéficie déjà (canvas et exports).

## Défauts CONSERVÉS au lot 0 (à corriger ensuite)

1. ~~Perf~~ — corrigé au lot 1, ci-dessous.
2. ~~Pression simulée, souris et tactile seulement~~ — lot 2, ci-dessous.
3. ~~Aucun filtrage des points~~ — lot 3, ci-dessous.
4. ~~Pas d'effilement~~ — lot 4, ci-dessous.
5. ~~Surligneur sans fusion~~ — lot 5, ci-dessous.

## Lot 1 — perf (fait)

`DessinCalque.jsx` : les points sont ajoutés EN PLACE dans une ref (plus de
copie du tableau par mouvement), et l'aperçu est un `Path` toujours monté,
caché hors tracé, dont `dessiner` pose la géométrie au plus une fois par image
(`requestAnimationFrame`) puis `batchDraw` — aucun rendu React pendant le
tracé. Les réglages sont lus par une ref, à jour même au milieu d'un trait.

Ce qui reste : `strokeOutline` recalcule tout le contour à chaque IMAGE (et
non plus à chaque événement) — linéaire par image, donc supportable ; le lot 3
(distance minimale entre points) réduira encore n.

## Lot 2 — Pointer Events et pression du stylet (fait)

- `DessinCalque.jsx` écoute `pointerdown` / `pointermove` / `pointerup` /
  `pointercancel`. Un trait appartient à UN `pointerId` (un second doigt ne
  le brouille pas) ; `preventDefault` au départ coupe les événements souris
  de compatibilité (lasso, glisser). Tous les événements regroupés
  (`getCoalescedEvents`) sont relevés, convertis dans le repère du document
  par la transformation inverse du calque. `touch-action: none` sur le
  conteneur tant que l'outil est actif.
- Réglage « Varie selon » : `variation` = `vitesse` (défaut, comportement de
  PocketStick) ou `stylet`. `pressionReelle(pointerType, variation)` : la
  pression réelle n'est lue QUE pour un stylet en mode stylet ; souris et
  doigt restent en vitesse. Elle ne joue que si « Épaisseur variable » > 0.
- L'élément tracé au stylet porte `pressions` (un nombre par point, au
  millième) ; `dessinTrace` les relit — même rendu à l'écran et à l'export.
  Un élément sans `pressions` (lot 0, souris) est rendu comme avant.
- Non vérifié : la pression rapportée par WebView2 (Wails) selon le pilote
  du stylet ; certaines tablettes rendent 0,5 constant.

## Lot 3 — courbe assistée (fait)

Fonctions pures dans `utils/dessin.js`, testées :

- **Distance minimale** (`pointUtile`) : un point à moins de
  `DISTANCE_MIN_ECRAN` (1,5 px écran, converti par le zoom) du dernier gardé
  est écarté pendant la saisie.
- **Simplification** (`simplifier`, Ramer-Douglas-Peucker itératif) au
  relâchement, dans `elementDessin`. Réglage « Simplifier au relâchement » :
  tolérance = réglage × `SIMPLIFICATION_MAX` (0,5) × épaisseur, donc
  indépendante du zoom. À 0 (défaut), aucun point retiré. ⚠️ L'aperçu montre
  les points bruts : avec une simplification, le trait peut bouger très
  légèrement au relâchement.
- **Stabiliser** (`stabilisation` → `streamline`) est séparé d'« Adoucir ».
  Défaut 0,35 = 0,7 × 0,5, donc identique au réglage par défaut d'avant.
  Absente d'un élément ancien, elle vaut toujours 0,7 × adoucir : aucun
  dessin existant ne change d'aspect.
- **Maj** tenue : le tracé devient un segment droit depuis son premier point.

## Couleur en dégradé (même jour)

`dessinTrace` rend le remplissage par `remplissage` (`fillStyle.js`), la
règle des formes, sur le cadre `width × height` du dessin : `fill` ou
`fillGradient` (linéaire, radial, texture). La barre du haut
(`PropertyPanel.jsx`, `isDessin`) porte le même `GradientColorPicker` que les
formes. L'export planche reçoit les mêmes props.

## Lot 4 — plume (fait)

- **Effilement** : réglages « Effiler le début » et « Effiler la fin »
  (`effilementDebut`, `effilementFin`, 0–1) → `start.taper` / `end.taper` de
  perfect-freehand, en longueur : 100 % = `EFFILEMENT_MAX` (10) × épaisseur,
  donc stable pendant le tracé (une fraction de la longueur totale ferait
  bouger le début à chaque point). Écrits dans l'élément seulement s'ils
  valent quelque chose ; absents = bouts ronds, comme avant.
- L'aperçu passe désormais TOUS les réglages (`{ ...reglages }`) à
  `strokeOutline` : un réglage ajouté ne peut plus manquer à l'aperçu.
- **Flou, flou dégradé, ombre** : rien à écrire. L'onglet Effets ne filtre
  pas par type (`EffectsTemplates.jsx`, seuls les filtres d'image sont
  réservés aux images) et `appliquerEffets` est générique : le canvas et les
  deux exports les rendent déjà sur un dessin. Pas de filtre SVG.

## Lot 5 — surligneur en fusion produit (fait)

- Un trait tracé au surligneur porte `fusion: 'multiply'` ; `dessinTrace`
  rend `globalCompositeOperation` (`fusionDe` : seule `multiply` est
  reconnue, tout le reste = normale). Le pinceau n'écrit rien : les dessins
  d'avant restent en fusion normale. 30 px et 50 % d'opacité inchangés.
- Case « Fusion produit » sur un trait sélectionné (onglet Dessin).
- **Où la poser, mesuré dans Konva 9** : un nœud mis en cache se dessine avec
  SON mode de fusion (`Node._drawCachedSceneCanvas`, `Node.js:220`) ; un
  groupe sans cache l'applique à ses enfants (`Container.js:224-229`), mais
  un enfant dans un groupe mis en cache ne fusionne qu'avec le vide du cache.
  - Canvas et export cloné : les effets cachent le `Path` lui-même → fusion
    sur le Path.
  - Export planche : les effets cachent le GROUPE qui met le trait à
    l'échelle de la cellule → fusion sur le groupe, retirée du Path.
- Le fond blanc de la page, à l'écran, est sur un AUTRE calque : sur une page
  vide, le trait fusionne avec du transparent et garde sa couleur. Dans
  l'export planche, le fond blanc est dans le même calque : `multiply` sur
  blanc donne la même couleur. Le rendu est donc le même partout.
- L'aperçu du tracé est dans le même calque que le document : il fusionne
  déjà pendant qu'on dessine.

## Lot 6 — redessiner un trait (fait)

- Recolorer était acquis dès le lot 0 (`fill`, puis `fillGradient` par la
  barre du haut).
- `redessiner(el, maj)` (pur, testé) rejoue les points GARDÉS avec d'autres
  réglages : épaisseur, adoucir, stabiliser, épaisseur variable, effilements
  (`REGLAGES_TRACE`). Le contour change de taille : le cadre est recalculé
  comme à la création, les points décalés d'un nombre entier (ils restent
  exacts), et `x`/`y` du même décalage TOURNÉ et mis à l'échelle comme le
  nœud — le trait ne bouge pas sur la page, rotation et échelle comprises.
  La simplification n'est pas rejouée : elle retirerait des points pour de bon.
- Onglet Dessin, trait sélectionné : bloc « Redessiner le trait ». Un curseur
  tenu = une étape d'historique (mêmes clés à chaque mise à jour,
  `gesteHistorique.js`). « Reprendre ces réglages pour le pinceau » copie le
  trait dans les réglages de l'outil.

Les six lots de la revue sont faits.

## Contour stylisé des formes — lot A (29 septembre 2026)

Le moteur du Dessin, appliqué au contour des formes (rectangle, cercle,
triangle, étoile, trait). Menu « Contour stylisé » (icône vagues) à côté du
contour dans la barre du haut (`MenuContourStylise.jsx`) : épaisseur
variable, tremblé, ondulation (amplitude, nombre d'ondes), effilements.

- **Donnée** : `el.contourStyle` (objet) ; absent = contour Konva ordinaire,
  aucune forme existante ne change. Il ne s'affiche qu'avec une épaisseur et
  une couleur de contour.
- **Géométrie** (`utils/contourStylise.js`, pur, testé) : le contour de base
  reproduit les primitives Konva (sommet du triangle et de l'étoile en haut,
  arrondi borné comme `Rect`), il est rééchantillonné, déplacé selon sa
  normale (ondulation sinusoïdale à nombre d'ondes ENTIER, tremblé par bruit
  PÉRIODIQUE : il se referme sans couture), puis épaissi par perfect-freehand
  avec une pression tirée d'un second bruit. Graine = `el.id` : le même
  élément donne le même trait à l'écran et dans les deux exports.
- **Rendu** : `dessinForme` rend alors un `Konva.Shape` dont la `sceneFunc`
  remplit la ligne déformée (le remplissage suit l'ondulation, dégradés
  compris, par `fillShape`) puis le trait (couleur ou `strokeGradient` via
  `degradeCanvas2D`). Même origine que la primitive remplacée — offset pour
  les formes centrées — : `positionDepuisNoeud`, rotation et Transformer
  n'y voient rien. L'ombre suit : Konva l'applique autour de la `sceneFunc`.
- ⚠️ **Cadre réel** : un `Shape` a pour cadre `{0, 0, width, height}`, or le
  trait déborde. Le cadre du trait est posé sur le nœud (`getSelfRect`), par
  `ShapeNode` ET par l'export planche — sans lui, le cache des effets
  couperait ce qui dépasse.
- Le copier-coller de style entre formes le reprend (même type = tout).
