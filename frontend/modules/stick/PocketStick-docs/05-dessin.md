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
3. Aucun filtrage des points ; « Adoucir » pilote aussi le streamline.
4. Pas d'effilement.
5. Surligneur = 30 px et 50 % d'opacité, sans fusion.

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

## Lots suivants

1 perf (points en place, rAF) · 2 Pointer Events et pression du stylet ·
3 courbe assistée (distance minimale, Ramer-Douglas-Peucker, Adoucir séparé,
Maj = trait droit) · 4 effilement · 5 surligneur en `multiply` (à vérifier
avec le cache des effets) · 6 redessiner/recolorer dans les Propriétés.
