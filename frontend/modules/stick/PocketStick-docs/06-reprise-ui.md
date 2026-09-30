# Reprise — UI de l'éditeur, puis l'outil Dessin

## État au 30 septembre 2026 — mission « UI » terminée, poussée sur `main`

| Lot | Fait | Commit |
|---|---|---|
| 1 — Zoom : le bouton central affiche le zoom, ramène à 100 % ; « Ajuster » gardé | oui | `973f7e6` |
| 2 — Voile gris sur ce qui dépasse de la page (`VoileHorsPage`, écran seulement) | oui | `df7bbe0` |
| 3 — Contour à main levée des lettres | oui | `a5f1ec1` (mesure), `d01e759` |
| Hors lot — « Données produit » en trois cartes (Texte, Médias, Éditorial) | oui | `00336b9` |
| Hors lot — une forme redimensionnée enregistre sa TAILLE, échelle 1 | oui | `57248bd` |
| Hors lot — texture de remplissage sur le bord déformé ; gras chargé avant l'export ; cadre réel du contour stylisé gardé par un clone (`cadreReel`) | oui | `dcdde29` |

Détail du lot 3, mesures et écarts acceptés :
[`07-contour-lettres.md`](07-contour-lettres.md).

Pièges rencontrés, à ne pas refaire :
- **Recharger la page déconnecte** (`main.tsx` efface la session PocketBase).
  Modifier un module que Vite ne remplace pas à chaud recharge la page aussi.
- Après plusieurs remplacements à chaud, un onglet peut avoir **deux
  instances du store** : `import('/frontend/…/useLabelStore.js')` depuis la
  console écrit dans l'ancienne, l'éditeur affiche la nouvelle. Pour vérifier
  un rendu sans l'éditeur : `apercuCase` (`utils/exportPdfSheet.js`) avec des
  éléments de test — c'est le chemin de l'export planche.
- **Un réglage posé à la main sur un nœud Konva** (`getSelfRect`…) est perdu
  par `clone()` : le porter en ATTRIBUT et l'installer dans la sceneFunc et
  avant `cache()` (`installerCadreReel`, `installerContourLettres`,
  `installerCourbure`).
- **Une texture est un motif SANS répétition posé sur un cadre** : tout
  dessin qui déborde de `width × height` doit lui passer son cadre réel
  (`degradeCanvas2D(…, cadre)`, `fillPatternX/Y`). Un dégradé, lui, s'étend à
  l'infini — c'est pour ça que le défaut ne se voyait qu'en texture.

---

## Prompt de reprise — mission suivante : l'outil Dessin

```
Contexte : PocketApp (I:\pockapp), module `stick` (PocketStick, /stick), éditeur
d'affiches Konva. Lis d'abord CLAUDE.md, puis dans
frontend/modules/stick/PocketStick-docs/ : 05-dessin.md (l'outil Dessin, lots
0 à 6, contour stylisé lot A, ondulation lot B), 07-contour-lettres.md (la
section « Implémentation ») et ce fichier (06-reprise-ui.md, les pièges).

═══ MISSION : AMÉLIORER LES DESSINS ═══

Lot 1 — Options « à main levée » sur les tracés
Les formes et les lettres ont le menu « Contour stylisé → Contour à main
levée » (épaisseur variable, tremblé, ondulation) : MenuContourStylise.jsx,
moteur `styliserContour` (utils/contourStylise.js), partagé. Un élément
`dessin` n'y a pas accès : son trait vient de `strokeOutline` (utils/dessin.js,
perfect-freehand) à partir de ses points gardés, rendu par `dessinTrace` —
seule règle, canvas (DessinNode.jsx) et export planche (exportPdfSheet.js,
branche dessin, fusion posée sur le GROUPE).
Voulu : tremblé et ondulation (au moins) appliqués à un tracé.
À établir AVANT de coder, et à me soumettre :
- ce qui existe déjà côté dessin (thinning = épaisseur variable ;
  effilements ; stabilisation) et ce qui manque vraiment ;
- où appliquer la déformation : sur les POINTS du tracé avant
  `strokeOutline` (le trait reste un perfect-freehand), ou en passant le
  tracé par `styliserContour` (trait ouvert, `ferme: false`) ;
- `ondes` : nombre sur tout le tracé (comme une forme) ou densité par
  longueur (comme les lettres, `ondesDuContour`) ;
- le cache de `dessinTrace` (clé des réglages) et `redessiner` (lot 6 : le
  cadre change quand le trait change) doivent suivre ;
- l'aperçu pendant le tracé (DessinCalque.jsx) : avec ou sans la
  déformation ?

Lot 2 — Fermer un tracé pour en faire une forme
Voulu : un tracé qu'on ferme devient une forme — REMPLISSAGE (couleur,
dégradé, texture) et CONTOUR (couleur, épaisseur, contour à main levée),
comme une forme géométrique.
À décider avec moi avant de coder :
- le geste : fermer au relâchement quand le dernier point revient près du
  premier ? bouton « Fermer le tracé » dans la barre ? les deux ?
- le modèle : un `dessin` qui gagne `ferme: true` + `fill` + `stroke`, ou
  une nouvelle forme `shape: 'libre'` avec ses points dans ShapeNode /
  `dessinForme` (qui sait déjà peindre remplissage + contour stylisé,
  ombre de silhouette, `cadreReel`, texture calée sur le cadre réel) ?
  Attention : aujourd'hui `dessin.fill` est la COULEUR DU TRAIT (le trait
  est un polygone rempli) — ne pas casser les dessins existants.
- réversible (rouvrir) ou non ;
- Transformer : une forme libre redimensionnée doit enregistrer sa taille
  et une échelle 1 (`handleTransformEnd`, KonvaCanvas.jsx, voir `57248bd`)
  — donc mettre ses points à l'échelle, pas le nœud.

MÉTHODE
1. État des lieux (chemin:ligne), puis proposition avec compromis.
2. ME DEMANDER avant d'implémenter, et avant toute nouvelle dépendance npm.
3. Un lot à la fois ; commit seulement quand je le dis.

CONTRAINTES DU DÉPÔT
- Répondre en français. Distinguer lu dans le code (chemin:ligne) et rapporté.
- Module .jsx/.js non typé ; ne pas lancer `pnpm format`.
- Logique testable → module pur. Tests : `npx vitest run frontend/modules/stick`.
  Build : `pnpm build:client`, seulement serveur de dev arrêté — sinon demander.
- Ne pas lancer de serveur de preview sans me le demander. Recharger la page
  déconnecte : me prévenir avant.
- Rendu IDENTIQUE à l'écran et dans les deux exports (page par clone,
  planche par `exportPdfSheet`). Un dessin existant ne doit pas changer
  d'aspect : réglage absent = comportement d'avant.
```
