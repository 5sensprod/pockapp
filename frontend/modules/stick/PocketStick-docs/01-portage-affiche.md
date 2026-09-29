# Portage de « Outils → Affiche » d'AppPos vers PocketApp

*14 septembre 2026.*

L'éditeur d'affiches et d'étiquettes d'AppPos (`AppTools`, menu **Outils →
Affiche**, route `/tools/labels`) est repris dans PocketApp, module `stick`
(**PocketStick**), sur `/stick`.

Le portage a été fait **à l'identique, volontairement** : le code arrive tel
quel, en `.jsx` / `.js`, sans conversion TypeScript ni redécoupage. Ce document
dit ce qui a changé, et ce qui reste à nettoyer.

## Ce qui a été repris

`frontend/modules/stick/labels/` — 8 000 lignes, 26 fichiers, copiés depuis
`AppTools/src/features/labels/` et `AppTools/src/pages/LabelPage.jsx` :

- le canvas Konva (`components/KonvaCanvas.jsx`) et ses nœuds — texte, image,
  code-barres, QR ;
- les panneaux : formats, planche A4 (`SheetPanel.jsx`), calques, effets,
  formes, tableaux, polices Google ;
- le gestionnaire de templates (`components/templates/TemplateManager.jsx`) ;
- l'export PDF, à l'unité et en planche (`utils/exportPdf.js`,
  `utils/exportPdfSheet.js`) ;
- le store zustand (`store/useLabelStore.js`) et le binding de données
  (`utils/dataBinding.js`).

Dépendances ajoutées au dépôt : `konva`, `react-konva`, `react-konva-utils`,
`jspdf`, `qrcode`, `zustand`. `jsbarcode` y était déjà.

## Les quatre attaches qui ont dû changer

Le module était accroché à AppServe par quatre endroits. PocketApp n'écrit
jamais dans AppPos (`CLAUDE.md`), et aucune de ces API n'existe ici.

| Attache d'origine | Ce qui a été fait |
|---|---|
| `useProductDataStore` (cache REST + WebSocket AppPos) | `labels/lib/use-produits-affiche.ts` — `useCatalogProducts`, **recherche et pagination côté serveur**, 20 par page. Plus de 3 000 produits chargés en mémoire, plus de filtre côté navigateur |
| `/api/templates` (`templateApiService`) | **Neutralisé.** Le service garde son interface, rend des listes vides et lève sur écriture ; `templateService` est forcé en mode `'local'` et tient tout en **IndexedDB**, sur ce poste |
| `/api/presets/images` (`presetImageService`) | **Réécrit en local.** Même interface, bibliothèque d'images en IndexedDB (dataURL). Les images de produit, elles, viennent de PocketBase en URL complète |
| `useActionToasts` / `useConfirmModal` d'AppPos | `labels/ui/` — les toasts passent par `sonner` ; la modale de confirmation est copiée telle quelle |

Un cinquième point mérite d'être nommé : **`labels/lib/produit-adapte.ts`**.
`dataBinding.js` lit une forme NeDB (`_id`, `price`, `sale_price`,
`brand_ref.name`, `image.src`, `meta_data[{key:'barcode'}]`). Plutôt que de
réécrire les 8 000 lignes, un produit PocketBase y est **projeté**, en un seul
endroit. Deux règles du dépôt sont respectées au passage :

- le nom imprimé est **`designation`**, pas `name` — `name` est le titre de la
  page du site (`catalog-products.ts:94`) ;
- le prix promo passe par **`prixPromoActif`**, avec le **jour du serveur**
  (`useJourServeur`) : une promo expirée ne s'imprime pas sur une affiche.

## Conséquences à connaître

- **Les templates et la bibliothèque d'images sont LOCAUX au poste.** Le
  déploiement est multi-postes (`CLAUDE.md`) : ce qui est dessiné sur la caisse
  ne sera pas visible depuis un navigateur d'un autre poste. C'est une
  régression assumée du portage, pas un oubli.
- **Tailwind doit scanner les `.jsx`.** `tailwind.config.cjs` ne listait que
  `.{ts,tsx}` : au premier essai, **aucune classe propre au module n'était
  générée** — seules celles qu'un `.tsx` du dépôt utilisait déjà. Le résultat
  n'est pas une erreur mais une mise en page à moitié stylée : pied de modale
  poussé hors de l'écran, et un `bg-opacity-0` absent qui laissait un voile
  bleu opaque sur les vignettes d'images. Corrigé le 14 septembre 2026 ; la
  feuille de style est passée de 102 à 126 kio, ce qui mesure l'écart.
  **À refaire dans l'autre sens** le jour où le module passera en TypeScript.
- **`allowJs` est activé** dans `tsconfig.app.json`, sans `checkJs` : le code
  porté est compilé, pas typé. `frontend/wailsjs` est exclu du programme en
  conséquence (ses bindings `.js` ont leurs `.d.ts` à côté).

## Ce qui a été ajouté après le portage (14 septembre 2026)

Quatre manques relevés au premier essai, tous corrigés le jour même.

- **Le QR code n'encodait qu'un chemin.** `produit-adapte.ts` posait
  `/produit/<slug>` dans `website_url`, que `QRCodeTemplates.jsx` encode tel
  quel : un QR n'a aucune origine à laquelle se raccrocher. L'adresse complète
  vient désormais de `frontend/lib/site/url-publique.ts`
  (`https://axemusique.shop/produit/<slug>`, surchargeable par
  `VITE_SITE_PUBLIC_URL`). Un produit **sans slug** — donc sans page — ne
  produit aucune adresse plutôt qu'une qui mènerait à « Produit introuvable ».
- **Les polices Google ne chargeaient jamais.** Le catalogue Google Fonts
  exige une clé (`VITE_GOOGLE_FONTS_KEY`) qu'aucun poste client ne possède, et
  l'embarquer dans le bundle referait la faille 3.1 du site. Or **charger** une
  police n'a jamais demandé de clé : seule la LISTE en demandait une. D'où
  `config/catalogueLocalPolices.js` — 72 familles figées, servies sans clé ;
  une clé présente (poste de développement) rend le catalogue complet.
- **L'onglet Formes était mort** : les boutons n'avaient pas de `onClick`, et le
  canvas ne savait pas rendre un élément `shape`. Les deux manquaient.
  `canvas/ShapeNode.jsx` dessine rectangle, cercle, triangle, étoile et trait
  **dans un cadre `width × height` posé par son coin haut gauche** — un
  `Circle` Konva est centré sur son origine, il fallait le décaler pour que le
  Transformer traite toutes les formes pareil.
- **Le code-barres n'avait ni hauteur de barres ni format de numéro.** La
  hauteur des barres se déduisait du cadre ; elle se règle maintenant à part
  (`barHeight`, vide = ancien calcul), avec l'épaisseur d'un module
  (`barWidth`, JsBarcode la figeait à 2). Le numéro affiché se groupe par
  `utils/barcodeText.js` — EAN-13 en 1·6·6, EAN-8 en 4·4, par 3, par 4,
  tirets, ou masqué. **Ce qui est ENCODÉ ne change jamais** : un scanner lit
  les barres, pas le texte, et un groupement n'insère que des séparateurs.
  Gardien : `utils/barcodeText.test.ts`, dont un cas vérifie qu'aucun format
  n'ajoute ni ne retire un chiffre.
  **Le symbole se dessine en homothétie** (correctif du même jour) : le nœud
  imposait sa hauteur de cadre à une image dont la hauteur naturelle venait de
  changer, si bien qu'augmenter la hauteur des barres ÉCRASAIT l'image — et le
  numéro se déformait avec elle. `BarcodeNode` retient maintenant le rapport
  hauteur/largeur réellement produit par JsBarcode et en déduit sa hauteur
  d'affichage : c'est le cadre qui suit le dessin, jamais l'inverse.
  **Et il se redessine à la résolution du cadre** : JsBarcode rend un bitmap à
  sa taille naturelle (~200 px), qu'un cadre de 600 px agrandissait trois fois
  — bords de barres adoucis à l'écran ET dans le PDF, qui capture le même
  bitmap. Le nœud dessine une première fois pour connaître la largeur naturelle
  (elle dépend de la valeur et du format), puis redessine à une échelle
  **entière** ≥ ×2 si le cadre est plus large, plafonnée à ×8. Entière, parce
  qu'un facteur fractionnaire rendrait certaines barres plus larges que leurs
  voisines par arrondi — et un scanner lit la LARGEUR des barres.

## Ce qui a été ajouté fin septembre 2026 — l'éditeur aligné sur PocketStick

Du 28 au 29 septembre 2026 (commits `01dcf9b`, `b3fdb07`, `d791074`,
`03cb4c4`, `e005154`). **La référence est PocketStick** (`I:\pocketstick`,
`src/editor/`) : quand un comportement y existe, il est REPRIS. Deux fichiers
en sont des copies à l'identique, avec leurs tests — `utils/crop.js` et
`utils/layout.js`. Ne pas les faire diverger : corriger là-bas, recopier ici.

**Mise en page de l'éditeur**
- **Barre contextuelle fixe** (44 px) au-dessus du canvas, dans
  `CanvasArea.jsx` — plus dans `TopToolbar`. Sélectionner un élément la
  remplit sans rien pousser : le canvas ne saute plus. Trop d'options : elle
  défile en largeur. Les actions sont **regroupées en menus**
  (`MenuGroupe.jsx`) : style du texte, alignement du texte, position.
- **Tout ce qui s'ouvre depuis cette barre est en `position: fixed`**
  (couleurs, polices, menus) : la barre défile, un `absolute` y serait coupé —
  c'est arrivé à la liste des polices.
- **Zone de travail qui défile** : page centrée avec marge (`MARGE_ESPACE`),
  molette = défilement, **Ctrl+molette = zoom**, zoom « ajusté » à l'ouverture
  et à chaque changement de format. Plus de déplacement au bouton du milieu.
- **Hauteur bornée** : `StickPage.tsx` vaut `100dvh - var(--header-h)` ; sans
  borne, c'est toute la page qui défilait au lieu du panneau de gauche.

**Texte**
- Taille de police réglable ; couleur **unie ou dégradé**
  (`GradientColorPicker.jsx`, `utils/fillStyle.js`, partagé écran/export).
- **Édition en place** reprise de `TextEditor.jsx` : textarea transparent aux
  métriques du Konva.Text. Entrée = retour à la ligne, Ctrl+Entrée ou clic
  ailleurs = valider, Échap = annuler.
- **Étirer la case change sa LARGEUR, jamais la taille de police** ; poignées
  de côté seulement.
- **Texte lié corrigeable** sans toucher la fiche : `el.textOverrides`,
  **par `_id` de produit** (sinon, en planche, la correction du premier
  produit s'imprimerait sur tous). Bouton « Texte d'origine ».
- Alignement dans le bloc (gauche, centre, droite, justifié).
- Le cadre se **re-mesure** quand une police Google arrive (elle arrive après
  le rendu) : `TextNode` appelle `_setTextData`, interne à Konva — à
  revérifier à chaque mise à jour de Konva.
- `stripHtmlToText` décode les **entités numériques** (`&#34;` → `"`).

**QR code** — lié à `website_url` et à RIEN d'autre. Un produit sans URL
(sans slug) n'affiche aucun QR, à l'écran comme au PDF. L'ancien repli sur le
code-barres puis la référence imprimait un QR qui ne menait nulle part.

**Images** — sans déformation, comme PocketStick : `cropX/Y/Width/Height`.
Coin = tout grandit ; côté = l'image se recadre. Double-clic ou « Recadrer »
ouvre le mode recadrage (`canvas/CropOverlay.jsx`, dessiné HORS du groupe
exporté). Une image ajoutée arrive **à la taille du canvas**
(`utils/imagePlacement.js`) — sa résolution n'était pas réduite avant, Konva
dessine toujours la source entière. ⚠️ **Fluidité** : pendant le geste, aucun
état React ne doit changer, et `ImageNode` mémoïse `crop` ; un objet neuf à
chaque rendu remettait l'ancien recadrage sous la souris.

**Formes** — cercle, triangle et étoile ont leur origine au CENTRE
(`dessinForme`, `ShapeNode.jsx`) : toute position enregistrée passe par
`positionDepuisNoeud` (`KonvaCanvas.jsx`), aimantation comprise. Sans cela, la
forme sautait d'une demi-taille.

**Sélection** — multiple (Maj/Ctrl+clic) et **lasso** ; `selectedId` reste
l'élément principal, `extraIds` les autres, lus par `idsSelectionnes`.
Alignement sur la page (un élément) ou entre éléments, **distribution** dès
trois. **Suppr** / Retour arrière / corbeille suppriment la sélection en un
seul Ctrl+Z (`deleteElements`). ⚠️ La duplication ne vise encore que
l'élément principal.

**Fiche produit** (outil « Fiche produit ») — caractéristiques techniques en
tableau, points forts en puces, conseils en paragraphe. **Aucun champ dédié
en base** : tout est dans la `description`, forme fixe de
`renderProductSheetDescription` (`backend/routes/gemini_routes.go`), découpée
par `blocCorrespondant` du module site (`modules/site/lib/sheet-blocks.ts`) —
pas de seconde copie du découpage. `utils/ficheProduit.js` extrait,
`utils/ficheKonva.js` dessine (écran ET planche). Coupée à N lignes, titre
réglable, tableau stylable (cadre, grille, arrondi, ligne mise en avant, fond
des noms). **Un produit sans la section n'affiche rien** ; sans produit, un
contenu d'exemple qui ne s'imprime jamais. La ligne mise en avant est un
NUMÉRO de ligne, pas une caractéristique.

**Exports**
- **Solo** (`exportPdf.js`) clone le groupe du document : il suit l'écran
  sans rien à maintenir. Tout ce qui ne doit pas s'imprimer (recadrage, lasso,
  Transformer) vit hors de ce groupe.
- **Planche** (`exportPdfSheet.js`) **redessine** chaque élément : c'est lui
  qui dérive. Il partage maintenant le dessin avec l'écran — `dessinForme`,
  `remplissage`, `konvaCrop`, `dessinerCodeBarres` (`utils/barcodeCanvas.js`),
  `construireFiche` — et résout les textes par `resolvePropForElement`.
  **Un seul produit sélectionné remplit toutes les cases** avec le produit du
  canvas ; avant, les cases partaient sans produit, et la fiche, les textes et
  QR liés étaient faux ou absents.

## Chantier suivant — le canvas ne suit pas les modifications du catalogue

**Constat, lu dans le code** : le produit choisi est COPIÉ dans le store
(`useLabelStore.js` : `selectedProduct`, `selectedProducts`), projeté une fois
par `versProduitAffiche`. Le canvas, `resolvePropForElement`, `FicheNode` et
l'export en planche (`useLabelStore.getState()`) lisent cette copie. Or le
temps réel du catalogue **existe déjà** — `frontend/lib/realtime/`, temps réel
natif de PocketBase (SSE, pas WebSocket) sur `products`, `brands`,
`categories`, `suppliers`, qui invalide les caches TanStack Query. Il met à
jour la liste du sélecteur, **jamais la copie** : un titre, une marque, un
prix ou une description corrigés dans PocketStock ne changent pas l'affiche
ouverte. Les templates (`TemplateManager.jsx`, IndexedDB) peuvent aussi figer
des produits entiers.

**Piste** : ne garder que des IDENTIFIANTS dans le store, résoudre les
produits par une requête TanStack par ids invalidée par le temps réel
existant (la clé doit être dans `COLLECTIONS_SURVEILLEES` ET
`invalidateCatalog`, gardé par `catalog-realtime.test.ts`), et conserver
`textOverrides`, la sélection et le recadrage en cours à chaque mise à jour.
Rien de neuf à écouter ni à ouvrir côté réseau.

## Où intervenir — carte pour un agent qui reprend

Tout vit sous `frontend/modules/stick/`. La page est `/stick`
(`frontend/routes/stick/index.tsx` → `StickPage.tsx` → `labels/LabelPage.jsx`).

| Pour toucher à… | Le fichier |
|---|---|
| Le canvas, la sélection, les guides magnétiques | `labels/components/KonvaCanvas.jsx` |
| Un type d'élément à l'écran | `labels/components/canvas/` — `TextNode`, `ImageNode`, `BarcodeNode`, `QRCodeNode`, `ShapeNode`, `FicheNode`, `CropOverlay` |
| Les onglets de la barre latérale | `labels/components/ToolsSidebar.jsx` (la table `tools`) puis `labels/components/templates/` |
| Les réglages de l'élément sélectionné | `labels/components/PropertyPanel.jsx`, affiché dans la barre de `CanvasArea.jsx` ; menus `MenuGroupe.jsx` |
| Sélection, lasso, suppression | `labels/store/useLabelStore.js` (`idsSelectionnes`, `setSelection`, `deleteElements`) et `KonvaCanvas.jsx` |
| Recadrage, alignement, distribution | `labels/utils/crop.js`, `labels/utils/layout.js` — **copies de PocketStick** |
| Fiche produit | `labels/utils/ficheProduit.js` (extraction), `labels/utils/ficheKonva.js` (dessin) |
| L'état du document (éléments, historique, annuler/refaire) | `labels/store/useLabelStore.js` |
| Le passage produit → texte affiché | `labels/utils/dataBinding.js` **et** `labels/lib/produit-adapte.ts` |
| L'export PDF, à l'unité ou en planche | `labels/utils/exportPdf.js`, `labels/utils/exportPdfSheet.js` |
| Les templates enregistrés | `labels/services/templateService.js` (IndexedDB) |

**Ajouter un type d'élément** demande cinq gestes, et en oublier un ne
produit AUCUNE erreur — c'est ce qui rendait l'onglet Formes muet :

1. un composant dans `labels/components/canvas/` ;
2. une branche `if (type === '…')` dans la boucle de rendu de `KonvaCanvas.jsx` ;
3. un panneau dans `labels/components/templates/` qui appelle `addElement` ;
4. ses réglages dans `PropertyPanel.jsx`, et son nom dans `LayersPanel.jsx` ;
5. **sa branche dans `exportPdfSheet.js`** (`updateElementsWithProduct` s'il
   dépend du produit, `createDocumentImage` pour le dessin) — sinon il est à
   l'écran et au PDF solo, mais **absent de la planche**. Partager le dessin
   avec le canvas plutôt que le réécrire.

**Deux pièges déjà payés :**

- **Tailwind doit voir le fichier.** `tailwind.config.cjs` scanne désormais
  `.{ts,tsx,js,jsx}`. Un nouveau fichier hors de `frontend/` ne serait pas
  stylé, sans erreur.
- **Ce module n'est pas typé** (`allowJs` sans `checkJs`) et **n'est pas
  formaté** par Biome au même titre que le reste : `pnpm format` le réécrirait
  entièrement. Formater uniquement ses propres fichiers.

## À nettoyer, plus tard

Rien de ce qui suit n'est urgent ; tout est une dette prise sciemment le jour
du portage.

1. **Convertir en TypeScript** et retirer `allowJs`. C'est le gros morceau :
   26 fichiers, dont trois dépassent 400 lignes.
2. **Redécouper ce qui a grossi** : `KonvaCanvas.jsx` (plus de 800 l.), `PropertyPanel.jsx` (plus de 1000 l.),
   `TemplateManager.jsx` (766 l.), `ImageTemplates.jsx` (486 l.).
3. **Porter les templates dans PocketBase** — une collection `label_templates`,
   miniature en fichier — pour qu'ils suivent d'un poste à l'autre.
   `templateApiService.js` est le point d'entrée : son interface est déjà la
   bonne, seul son corps est à écrire.
4. **Idem pour la bibliothèque d'images** (`presetImageService.js`).
5. **Faire lire `CatalogProductShape` directement à `dataBinding.js`**, ce qui
   fera disparaître `produit-adapte.ts`.
6. **Remplacer `ui/ConfirmModal.jsx`** par l'`AlertDialog` du dépôt.
7. **Aligner le style** (Biome) : le code porté n'a **pas** été formaté, pour
   que le diff avec AppPos reste lisible tant que le portage est frais.

## Suite

Les produits affichés suivent la base depuis le 29 septembre 2026 :
[`02-produits-vivants.md`](02-produits-vivants.md).

## Cadre de sélection masquable (29 septembre 2026)

Pour juger une ombre, un dégradé ou un contour sans le Transformer par-dessus :
- **interrupteur** : bouton œil en tête de la barre contextuelle (`CanvasArea.jsx`) ou touche **H** (ignorée pendant
  une saisie) — drapeau `cadreMasque` ;
- **automatique** : tenir n'importe quel `input[type=range]` de la page masque
  le cadre jusqu'au relâchement — drapeau `cadreMasqueGeste`, écouteurs dans
  `KonvaCanvas.jsx`.

Affichage seul : `visible` du Transformer. `selectedId`, `extraIds` et `cropId`
ne bougent pas, les drapeaux n'entrent ni dans l'historique ni dans les
templates. Le recadrage (`CropTransformer`) n'est jamais masqué.

## Tirage : vignette seule et planche unifiées (29 septembre 2026)

Plus de choix « vierge / données » au départ ni de planche à part : le canvas
est le modèle, le tirage (produits × quantités, format page ou planche) dit
qui l'imprime, et l'export pagine. Voir [`03-tirage.md`](03-tirage.md).

## Tout élément ajouté atterrit au centre (29 septembre 2026)

Les panneaux posaient des coordonnées en dur (`x: 50, y: 50 + elements.length * 30`),
qui ne suivaient ni la taille du canvas (panneau Format, verrou « Canvas = taille
d'une cellule », template chargé) ni celle de l'élément.

- **Règle unique** : `labels/utils/placement.js` — taille du cadre par type
  (QR = `size`, texte = mesure, les autres = `width × height`), centrage dans le
  `canvasSize` **lu au moment de l'ajout**, et décalage de 16 px en diagonale
  **seulement** si un élément occupe déjà exactement la même position (plafonné
  à 20 pas). Gardien : `placement.test.js`.
- **Point d'entrée** : `addElementCentre(element, taille?)` du store, appelé par
  les panneaux texte, tableau, forme, QR, code-barres, fiche, image et import.
  **`addElement` ne place rien** : la restauration d'un template ou d'un design
  (`TemplateManager`, `DesignTemplates`) passe par lui et garde ses positions.
  La duplication reste à +20 px de l'original.
- **Texte** : mesuré avant l'ajout par un `Konva.Text` hors scène
  (`utils/mesurerTexte.js`), appelé depuis les panneaux — le store n'importe pas
  Konva, sinon les tests Node échouent (« Cannot find module 'canvas' »). Pas de
  recentrage après chargement de la police : il ramènerait un texte déjà
  déplacé et doublerait l'étape d'historique. Écart possible : quelques pixels.
- **Fiche** : hauteur calculée par `construireFiche` (synchrone) sur le même
  contenu que dessine `KonvaCanvas` (produit du canvas, sinon l'exemple).
- **Image** : taille de `cadreSurCanvas`, inchangée ; position par la règle commune.

## Style, flou, effets d'image, dégradés (29 septembre 2026)

Repris de PocketStick (I:\pocketstick) quand il l'avait, créé sinon.

- **Copier / coller le style** (création, PocketStick ne l'a pas) :
  `utils/styleCopie.js`. Le style = tout sauf géométrie, contenu, lien au
  produit et état d'édition. Même type : tout ; types différents : opacité,
  ombre, flou, plus la peinture entre texte et forme. Un seul Ctrl+Z, les
  verrouillés sont épargnés. Raccourcis Ctrl+Alt+C / Ctrl+Alt+V.
- **Étiquette de sélection** : `components/EtiquetteSelection.jsx`, HTML
  par-dessus le Stage (même repère, dans le conteneur qui défile), sous le cadre
  (la poignée de rotation est au-dessus). Copier / coller le style et un menu
  de profondeur — avancer, reculer, premier plan, arrière-plan —, raccourci du
  panneau Calques (`deplacerEnProfondeur`, `reordonner`). Masquée pendant un
  geste, un recadrage, ou cadre masqué (H).
- **Flou sur tout élément** (`blurEnabled`, `blurRadius`) et **effets d'image**
  (luminosité, sépia, noir et blanc, et les dix filtres réglables de
  `utils/effetsImage.js`, porté à l'identique avec son test) : une SEULE
  fonction, `utils/effetsKonva.js` (`appliquerEffets`), pour le canvas (effet
  après rendu dans `KonvaCanvas`), l'export planche (`createDocumentImage`) et
  l'export du canvas cloné (`recacherFiltres` — le cache Konva ne suit pas un
  `clone()`). Konva ne filtre qu'un nœud en cache : cache avec marge, rayon ×
  résolution du cache. Le miroir (flipX/flipY) n'est PAS repris.
  ⚠️ Sur le canvas, le cache est reposé à l'image suivante, puis à 400 ms et
  1,5 s (image, QR ou police qui arrivent tard) : une image plus lente que ça
  resterait non filtrée jusqu'à la retouche suivante. L'export, lui, attend
  ses images.
  ⚠️ Un texte surligné : le surlignage n'est pas flouté (nœud à part).
- **Dégradé au modèle PocketStick** (`utils/paint.js`) : linéaire (angle CSS)
  ou radial (centre, rayon), 2 à 16 arrêts. **L'ancien `{ from, to, angle }`
  reste lu** (`versPeinture`, 0° ancien = 90° CSS, mêmes points à l'écran) et
  n'est réécrit qu'à la première retouche : aucune migration des templates.
  `culori` n'est pas installé ici : la validation d'une couleur passe par
  `CSS.supports` ; `mixPaint` (animation) n'est pas repris.
  - **Contour** des formes (`strokeGradient`) : **linéaire seulement**, Konva
    ne dessine pas de contour radial (`konva/lib/Context.js`, `_stroke`) ; le
    sélecteur ne propose pas « Radial » (`lineaireSeulement`). Le texte n'a pas
    de contour dans cet éditeur.
  - **QR** (`fillGradient` du QR) : sur les modules, fond uni —
    `utils/qrImage.js`, une seule fonction pour le canvas et l'export.
  - Sélecteur : `GradientColorPicker` réécrit (type, barre d'arrêts — clic pour
    ajouter —, position, angle ou centre et rayon, inverser, préréglages).
- Gardiens : `styleCopie.test.js`, `paint.test.js`, `effetsImage.test.js`,
  `fillStyle.test.ts` (inchangé sur le fond, comparaisons à la virgule près).

## Miroir, masques, flou dégradé, contour du texte (29 septembre 2026)

- **Miroir et masque d'image** (`flipX`, `flipY`, `mask`) :
  `utils/imageForme.js`. L'image reste UN `Konva.Image` (redimensionnement et
  recadrage le manipulent directement) ; c'est son dessin qui change, par une
  `sceneFunc` : découpe à la forme du masque, repère retourné, puis
  `Konva.Image._sceneFunc`. Même fonction pour l'export planche ; l'export du
  canvas cloné la reçoit avec le clone. Les huit formes sont celles de
  PocketStick (`store/masks.js`), réécrites en chemins 100 × 100 étirés sur le
  cadre. Le miroir porte sur ce que montre le cadre (recadrage compris) et
  n'est pas un style copiable ; le masque l'est.
  ⚠️ La zone cliquable reste le rectangle ; l'ombre est découpée avec l'image.
- **Flou dégradé** (`blurFade: { angle, from, to }`) : net avant `from`, flou
  complet après `to`, le long de l'angle (convention CSS des dégradés).
  Un filtre maison dans `utils/effetsKonva.js` : `Konva.Filters.Blur` sur une
  copie, mêlée pixel par pixel à l'image nette (fondu lissé, `poidsFondu`).
- **Contour du texte** (`stroke`, `strokeWidth`, `strokeGradient`) :
  `contourTexte` (`utils/fillStyle.js`), canvas et export. Remplissage APRÈS le
  contour (`fillAfterStrokeEnabled`) : le trait entoure les lettres sans les
  ronger. Dégradé linéaire seulement, comme tout contour. À l'export planche,
  l'épaisseur suit l'échelle de la cellule.
- Gardien : `imageForme.test.js`.
