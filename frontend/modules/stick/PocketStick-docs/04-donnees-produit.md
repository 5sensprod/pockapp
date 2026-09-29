# Données produit : une seule UI pour lier un élément (29 septembre 2026)

Avant cette date, « lier un élément à une donnée produit » (`el.dataBinding`)
se faisait par six chemins, chacun avec sa liste de champs ou sans liste du
tout : Texte (toujours `name`), Tableau (5 champs), Propriétés (10 champs,
seulement sur un élément DÉJÀ lié), QR (`website_url`), code-barres
(`barcode`), Images (`product_image_src`) et le bouton Lier des Propriétés
(`product_image`). Le vendeur ne voyait nulle part ce qui était lié.

## Le registre : `labels/utils/champsProduit.js`

`CHAMPS_PRODUIT` : une clé canonique par donnée, son libellé, ses ALIAS et les
types d'élément qui savent la rendre — un QR n'encode que `website_url`, un
code-barres que `barcode` ou `sku`, une image que `product_image`, un texte
tout ce qui s'écrit.

- **Les clés des templates déjà enregistrés restent lues, jamais réécrites** :
  `product_image_src`, `image.src`, `image_src` sont des alias de
  `product_image`. Seul un geste du vendeur écrit une clé canonique. Une clé
  hors registre (template ancien) reste affichée sous son nom technique.
- `getProductField` (`dataBinding.js`) reste LA règle de résolution ; un test
  vérifie que chaque clé et chaque alias du registre y rendent une valeur.
- **Bug corrigé** : le panneau Images écrivait `product_image_src` mais ne
  reconnaissait une image liée que sur `product_image` — une photo liée
  depuis ce panneau n'y était jamais vue comme liée.

## Délier fige la valeur affichée

`miseAJourLiaison` : choisir « Valeur fixe » écrit, dans la propriété de valeur
du type (`text`, `qrValue`, `barcodeValue`, `src`), ce que l'élément affiche
POUR LE PRODUIT EN COURS, correction manuelle comprise. Avant, un texte délié
retombait sur sa valeur de création, et une image posée par le panneau Images
(`src: '{{product_image}}'`) restait liée par son gabarit après « Délier ».
Les `textOverrides` sont laissés en place (ignorés tant que l'élément n'est
pas lié, retrouvés s'il l'est de nouveau).

## Deux endroits, un seul composant

- **Propriétés** : le bloc « Donnée produit » (`components/LiaisonProduit.jsx`),
  le même pour texte, QR, code-barres et image — « Valeur fixe » puis les seuls
  champs compatibles. La fiche y affiche « Description », sans choix : elle est
  liée par sa `section`. Il remplace le sélecteur « Champ » et le bouton
  Lier/Délier de l'image.
- **Onglet « Données produit »** (`templates/DonneesProduitPanel.jsx`) : tous
  les éléments liés du document (`elementsLies`), leur champ et leur valeur
  pour le produit affiché ; un clic sélectionne l'élément et ouvre le même
  bloc. On y ajoute un texte lié champ par champ, la **photo du produit** et
  les **trois sections de la fiche**, regroupés, puis — voir plus bas — la
  galerie, le QR et le code-barres. Chaque création est écrite UNE fois
  (`utils/ajoutsProduit.js`) : deux copies divergeraient. Une photo ajoutée
  s'écrit désormais en clé canonique `product_image`.
- **Un seul endroit pour ajouter un élément lié** (même jour, après essai) :
  photo, QR vers la page du produit et sections de la fiche s'ajoutent depuis
  « Données produit » (`ajouterPhotoProduit`, `ajouterQRProduit`,
  `ajouterFiche`). L'onglet **Fiche produit** est supprimé ; l'onglet
  **Images** n'est plus qu'une bibliothèque statique (son mode « Images du
  produit » est retiré, avec l'ajout statique d'une image de galerie), puis
  fusionné avec **Upload** en un onglet **Médias** (`UploadTemplate`, qui
  portait déjà import, bibliothèque et suppression ; `ImageTemplates.jsx` est
  supprimé, avec ses « Formats recommandés », purement indicatifs) ;
  l'onglet **QR Code** n'ajoute qu'un QR à valeur fixe ; l'onglet **Texte**
  perd son interrupteur « Utiliser les données » (qui, ALLUMÉ par défaut
  avec un produit, liait au nom tout texte ajouté, quel que soit son style)
  et n'ajoute que des textes statiques. L'onglet
  **Code-barres** est supprimé aussi : ses cinq formats vivent dans
  « Données produit » (`FORMATS_CODE_BARRES`, `ajouterCodeBarres`), grisés
  quand le code-barres du produit ne s'y plie pas (`formatCompatible`). Au
  passage, l'ancien onglet jugeait le format sur le code-barres PUIS la
  référence, mais liait toujours `barcode` : un produit sans code-barres
  donnait un élément vide.
- **La galerie** : « Données produit » montre les photos de la galerie du
  produit affiché (`photosGalerie`, sans celle qui est déjà l'image
  principale) ; un clic ajoute une image LIÉE à `product_gallery_<rang>` — le
  même rang pour chaque produit, vide si un produit n'en a pas autant. Le
  bloc « Donnée produit » propose ces rangs pour une image. `getProductField`
  résout désormais ces clés : avant, seul l'export planche les connaissait
  (`gallerySrcAt`, supprimé) et l'écran rendait une image vide.
- **Calques** affichent le libellé (« Texte (Prix promo) »), plus la clé.
- **Le panneau « Tableau » est supprimé** : il ne faisait qu'ajouter des
  textes liés, ce que fait l'onglet « Données produit ».

**Orange = PocketStock** (`modules/stock/index.ts`, `text-orange-500`), d'où
viennent ces données — et SEULEMENT là où il porte une information : onglets
« Produits » et « Données produit », bloc
lié, champs. Texte, QR ou Images ne
sont pas orange : ils servent aussi au statique.

## Contenir : une photo de produit entière, quelles que soient ses proportions

Une image est un CADRE ; en **Remplir** (le comportement d'origine, `crop.js`)
elle le couvre, rognée depuis le coin haut-gauche de son recadrage. Le cadre
prenant les proportions de la photo du PREMIER produit, et le recadrage réglé
sur elle s'appliquant tel quel aux suivants, les autres produits n'affichaient
qu'un bout de leur photo.

`el.fit` (`utils/ajustementImage.js`) : absent ou `'cover'` = Remplir,
`'contain'` = **Contenir** — l'image entière, centrée (`rectContenu`), marges
vides. Le recadrage est ignoré et CONSERVÉ (repasser en Remplir le retrouve) ;
« Recadrer » et le double-clic sont désactivés (`startCrop` du store refuse).

- **Un seul dessin** : `sceneImage` (`imageForme.js`) reçoit `fit`, pour le
  canvas (`ImageNode`), l'export par clone (le clone emporte la `sceneFunc`)
  et l'export planche (`exportPdfSheet.js`). Masque, miroir, texture et ombre
  s'appliquent au cadre. Sur le canvas de sélection, le cadre entier reste
  cliquable, marges comprises.
- Le nœud reçoit un `crop` EXPLICITE sur l'image entière : un `crop` indéfini
  laisserait sur le nœud Konva le recadrage d'avant.
- Redimensionner une image contenue ne touche pas au recadrage
  (`KonvaCanvas`, `liveMedia.natural` nul).
- `crop.js` n'est PAS modifié : c'est une copie à l'identique de PocketStick.
- **Les nouvelles images naissent en Contenir** (Images, photo liée, Upload :
  `AJUSTEMENT_NOUVELLE_IMAGE`). Un élément existant sans `fit` reste en
  Remplir : aucun template ne change d'aspect à l'ouverture. Pour une photo
  liée d'un template ancien, passer une fois en Contenir à la main.

Gardiens : `champsProduit.test.js`, `ajustementImage.test.js`.
