# Reprise — UI de l'éditeur : zoom, hors-page, contour des lettres (30 septembre 2026)

Prompt de reprise pour une nouvelle session. Rien n'est encore fait.

```
Contexte : PocketApp (I:\pockapp), module `stick` (PocketStick, /stick), éditeur
d'affiches Konva. Lis d'abord CLAUDE.md, puis dans
frontend/modules/stick/PocketStick-docs/ : 01-portage-affiche.md, 05-dessin.md
et ce fichier (06-reprise-ui.md).

═══ MISSION : AMÉLIORER L'UI DE L'ÉDITEUR — ZOOM, HORS-PAGE, CONTOUR DES LETTRES ═══

Lot 1 — Zone de zoom (frontend/modules/stick/labels/components/CanvasArea.jsx:103-112)
Aujourd'hui : [−] [100 %] [+] [100 %]. L'étiquette du milieu affiche le zoom
(Math.round(zoom * 100)) et le dernier bouton appelle resetZoom.
Voulu : [−] [zoom actuel] [+]. Le bouton central AFFICHE le zoom en cours et,
au clic, ramène à 100 % ; on supprime le bouton séparé. Garder les titres
(infobulles) et l'accessibilité (aria-label qui dit « Revenir à 100 % »).
Vérifier ce que fait resetZoom dans useLabelStore (100 % réel ou ajustement à
la fenêtre ? CanvasArea.jsx:32-47 recalcule un zoom d'ajustement) et me dire
lequel des deux le clic doit donner avant de coder.

Lot 2 — Griser ce qui dépasse de la page, comme Polotno
Un élément (ou la partie d'un élément) posé hors de la page doit rester
visible mais voilé de gris, pour qu'on voie qu'il ne s'imprimera pas.
Point de départ lu dans KonvaCanvas.jsx :
- le fond blanc de la page est un Rect dans son PROPRE Layer
  (listening=false), avant le Layer du document ;
- le document est le Group `docGroupRef` (x=docPos, scale=zoom), CLONÉ par
  l'export (utils/exportPdf.js) : rien de ce voile ne doit entrer dedans ;
- le Transformer, le lasso, le calque Dessin (DessinCalque) et le recadrage
  sont dans le même Layer que le document, APRÈS lui.
Piste à évaluer : un voile gris semi-transparent qui couvre toute la scène SAUF
le rectangle de la page (quatre Rect, ou un Shape avec un trou en
evenodd), listening=false, dans le repère de docPos/zoom, posé APRÈS le
groupe du document mais AVANT le Transformer, les poignées et l'étiquette de
sélection, qui doivent rester nettes. Vérifier les interactions :
- clic et glisser sur un élément à moitié hors page (le voile ne capte rien) ;
- surligneur en fusion multiply (lot 5 de 05-dessin.md) : il ne doit pas
  fusionner avec le voile ;
- zoom à la molette et redimensionnement de la page ;
- aucun changement dans les deux exports (page et planche).

Lot 3 — Contour vectoriel des lettres (contour stylisé du TEXTE)
But : appliquer aux lettres ce que le lot A de 05-dessin.md fait aux formes
(utils/contourStylise.js : épaisseur variable, tremblé, ondulation,
effilements), sur le contour SEUL — l'effet « Ondulation » en pixels (lot B,
utils/ondulation.js) ondule déjà la lettre entière, remplissage compris.
État lu dans le code :
- le contour d'un texte est le `stroke` natif de Konva (`contourTexte`,
  utils/fillStyle.js:38-46, fillAfterStrokeEnabled) : le navigateur trace les
  lettres sans jamais exposer leur géométrie ;
- aucune lecture de police n'est installée (ni opentype.js ni fontkit dans
  package.json) → NOUVELLE DÉPENDANCE à me demander avant de l'ajouter.
Chantier à étudier AVANT tout code :
1. Accès au fichier de police : Google Fonts (utils/loadGoogleFont.js,
   hooks/useGoogleFonts.js) ET polices locales (config/catalogueLocalPolices.js)
   n'arrivent pas par le même chemin — obtenir les octets TTF/WOFF de chacune,
   hors ligne compris (poste Wails).
2. Mise en page : retours à la ligne, interlettrage, alignement, hauteur de
   ligne, texte courbé (utils/texteCourbe.js), typo (utils/typo.js) —
   reproduire celle de Konva à l'identique, sinon le contour ne tombe pas sur
   les lettres. Risque principal : deux mises en page qui divergent. Mesurer
   l'écart sur des textes réels avant de s'engager.
3. Contours des glyphes → polylignes (courbes aplaties), puis le moteur du lot A
   (contourDeBase → rééchantillonnage → déformation → perfect-freehand), un
   trait par contour fermé (les trous de « o », « A » compris).
4. Rendu : une seule règle pour le canvas (TextNode) et l'export planche
   (exportPdfSheet.js, branche text), comme dessinForme ; cadre réel posé sur
   le nœud (getSelfRect) pour le cache des effets ; ombre unique de la
   silhouette (voir `ombreSilhouette`, ShapeNode.jsx) ; donnée absente = contour
   Konva ordinaire, aucun template ne change.
5. Coût : texte lié à un produit (change à chaque produit du tirage), export
   planche de nombreuses cases → cache par (police, texte, réglages).
Livrable du lot 3 d'abord : une étude chiffrée (faisabilité, écart de mise en
page mesuré, taille de la dépendance, coût), PAS de code tant que je n'ai pas
validé.

MÉTHODE
1. État des lieux (chemin:ligne), puis proposition avec compromis.
2. ME DEMANDER avant d'implémenter, et avant toute nouvelle dépendance npm.
3. Un lot à la fois ; commit seulement quand je le dis.

CONTRAINTES DU DÉPÔT
- Répondre en français. Distinguer lu dans le code (chemin:ligne) et rapporté.
- Module .jsx/.js non typé ; ne pas lancer `pnpm format`.
- Logique testable → module pur. Tests : `npx vitest run frontend/modules/stick`.
  Build : `pnpm build:client`, seulement serveur de dev arrêté — sinon demander.
- Ne pas lancer de serveur de preview sans me le demander.
- Rendu IDENTIQUE à l'écran et dans les exports : le voile du lot 2 est un
  affichage d'écran seulement, il ne doit jamais s'imprimer.
```
