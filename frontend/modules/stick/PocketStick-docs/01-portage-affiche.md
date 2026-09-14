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

## Où intervenir — carte pour un agent qui reprend

Tout vit sous `frontend/modules/stick/`. La page est `/stick`
(`frontend/routes/stick/index.tsx` → `StickPage.tsx` → `labels/LabelPage.jsx`).

| Pour toucher à… | Le fichier |
|---|---|
| Le canvas, la sélection, les guides magnétiques | `labels/components/KonvaCanvas.jsx` |
| Un type d'élément à l'écran | `labels/components/canvas/` — `TextNode`, `ImageNode`, `BarcodeNode`, `QRCodeNode`, `ShapeNode` |
| Les onglets de la barre latérale | `labels/components/ToolsSidebar.jsx` (la table `tools`) puis `labels/components/templates/` |
| Les réglages de l'élément sélectionné | `labels/components/PropertyPanel.jsx` |
| L'état du document (éléments, historique, annuler/refaire) | `labels/store/useLabelStore.js` |
| Le passage produit → texte affiché | `labels/utils/dataBinding.js` **et** `labels/lib/produit-adapte.ts` |
| L'export PDF, à l'unité ou en planche | `labels/utils/exportPdf.js`, `labels/utils/exportPdfSheet.js` |
| Les templates enregistrés | `labels/services/templateService.js` (IndexedDB) |

**Ajouter un type d'élément** demande quatre gestes, et en oublier un ne
produit AUCUNE erreur — c'est ce qui rendait l'onglet Formes muet :

1. un composant dans `labels/components/canvas/` ;
2. une branche `if (type === '…')` dans la boucle de rendu de `KonvaCanvas.jsx` ;
3. un panneau dans `labels/components/templates/` qui appelle `addElement` ;
4. ses réglages dans `PropertyPanel.jsx`, et son nom dans `LayersPanel.jsx`.

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
2. **Redécouper ce qui a grossi** : `KonvaCanvas.jsx` (620 l.),
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
