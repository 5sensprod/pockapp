# Audit design — barre latérale de PocketStick

Lecture seule : aucun fichier modifié ni créé, aucun serveur, build ou formatage lancé. Tout ce qui est marqué `chemin:ligne` est LU ; les hauteurs en px sont ESTIMÉES d'après les classes Tailwind (ligne de base 16 px, `text-xs` = 16 px de haut, `text-sm` = 20 px). Chemins relatifs à `I:\pockapp\frontend\modules\stick\labels\components\`.

Hypothèse de hauteur : sur 768 px, la zone qui défile du panneau fait environ 600 px (768 − coque de l'application non lue − barre du haut ~48 à 64 px, `TopToolbar.jsx:45` − en-tête 40 px, `ToolsSidebar.jsx:155`). C'est le chiffre que retient aussi `06-reprise-ui.md:193`. Largeur : 400 − 64 − 1 = 335 px de panneau, 311 px utiles avec `px-3`.

## Synthèse

1. Les panneaux de réglages (Texte, Image, Effets…) tiennent le système ; les dix-sept panneaux de propositions n'en utilisent rien. Ce sont deux générations d'interface côte à côte, d'où l'impression de « vrac ».
2. Le « vieillot » vient de sept motifs répétés : cartes encadrées à gros padding, encadrés d'information colorés, boutons pleins saturés en quatre teintes, champs à bordure de 42 px, émojis, ombres lourdes, titres répétés.
3. Six panneaux dépassent 600 px par leur seule mise en page : Texte (~650), Dessin (~670), Page/Taille (~710), Mes images (~690), Produits en planche (~1 300), Données (~1 400). Redessinés, tous tiennent sauf Données (~650) et la planche dépliée.
4. Six défauts fonctionnels trouvés en lisant (détail en A) : suppression d'image au centre de la vignette, modèle sans aperçu impossible à gérer, « Marge (mm) » qui affiche des points, champs de taille qui ne suivent pas la page, état du verrou invisible, textes d'aide qui renvoient vers des endroits disparus.

---

## A. Inventaire visuel, panneau par panneau

### Cadre commun — `ToolsSidebar.jsx`
- Barre d'icônes : `w-16`, boutons `w-14 py-1.5 rounded-lg`, icône 20 px, libellé `text-[10px]` (`:113-124`). Dix boutons d'environ 47 px, soit ~500 px : elle tient.
- En-tête : `h-10 px-3`, titre `text-sm font-semibold` (`:155-156`). C'est le seul vrai titre de panneau.
- L'en-tête affiche `tool.label` et la barre d'icônes `tool.court` : on lit « Modèles » sous l'icône et « Templates » en titre (`:56`), « Page » et « Taille et fond » (`:58`).
- Deux boutons voisins, X et chevron (`:160-165`). Le X mène à un panneau « Outils » vide de 335 px avec une phrase centrée (`:196-210`).
- Marge intérieure différente dans chaque panneau : `p-4` (`TextTemplates:37`, `FormatPanel:60`, `UploadTemplate:183`, `SheetPanel:150`, `DonneesProduitPanel:119`, `QRCodeTemplates:21`), `p-3` (`ShapeTemplates:54`, `DessinPanel:52`, `BibliothequeCatalogue:67`), `p-3` + `p-1` (`PagePanel:20` + `FondPanel:25`), `p-2` (`LayersPanel:73`), `px-3 pb-3` (`ReglagesPanel:134`, `EffectsTemplates:90`), `p-4` + `p-3` empilés (`TemplateManager:398` + `TemplateGrid:152`). Le bord gauche du contenu saute de 8 à 28 px selon l'onglet.

### 1. Modèles — `ModelesPanel`, `TemplateManager`, `DesignTemplates`, `ui/TemplateGrid`
**Mes templates**
- Structure : onglets internes (45 px, `OngletsPanneau:24-25`), puis un en-tête `p-4` qui empile un titre, une recherche et des puces (`TemplateManager:328-395`).
- Le titre `h2 text-lg font-semibold` « Mes Templates » (`:330`) est la troisième occurrence du même mot, après l'en-tête et l'onglet interne.
- Hauteur avant la première vignette : 45 + ~173 = **~218 px**, plus de 35 % de l'écran.
- Deux boutons à icône seule : Enregistrer en `bg-blue-500 rounded-lg px-3 py-2` (`:335`), Importer en bordure (`:343`).
- Recherche de ~38 px, `rounded-lg border`, `pl-10` (`:366`).
- Puces `rounded-full`, actives en `bg-blue-500`, avec la même icône `Tag` répétée trois fois (`:44-47`, `:384-387`).
- Grille en colonnes `columns-2 gap-3` dans un double padding : colonnes de ~133 px (`TemplateGrid:154`).
- Vignette `rounded-lg hover:shadow-lg` sans bordure (`TemplateGrid:39`). Menu « ⋮ » visible au survol seulement (`:59`).
- Le menu est une colonne d'icônes sans libellé, `border-2 shadow-2xl` plus un `boxShadow` en ligne (`:86-91`).
- **Défaut** : le bouton « ⋮ » n'existe que dans la branche `template.thumbnail ?` (`:42-64`). Un modèle sans aperçu ne peut être ni renommé, ni dupliqué, ni supprimé.
- État vide dupliqué (`TemplateManager:404-411` et `TemplateGrid:171-175`, le second inatteignable).
- Messages : toasts à émojis « Template sauvegardé ✅ », « Erreur lors de la sauvegarde ❌ » (`:138, 141, 227, 230, 250, 253, 264, 267, 294, 297, 440, 443`).
- `console.log` : `:68, 88, 89, 189, 217`.
- Fenêtres modales : `text-lg`, champs `px-3 py-2 border rounded` sans taille de texte (16 px hérités), placeholder « Mon super template » (`:486-562`). Les deux modales sont deux copies à 95 % identiques (`:459-564`, `:569-671`).

**Designs**
- Puces `rounded-lg`, donc différentes de l'onglet voisin (`DesignTemplates:159`). Elles font ~366 px pour 311 : elles passent sur deux lignes (estimé).
- Cartes en une colonne, `border-2`, `hover:shadow-lg`, image 4/3 de 311 × 233 px (`:192`, `:220`). L'image est un simple texte « Aperçu à venir » (`:223`).
- Badge « 🏭 USINE » en dégradé violet-rose (`:214-216`). Badges de catégorie violet, bleu, vert (`:119-123`).
- Voile bleu et bouton flottant « Charger ce design » `shadow-lg` au survol (`:239-243`).
- Pied gris « N designs disponibles » (`:253-257`).
- Environ 315 px par carte : 1,3 carte visible.
- `alert()` pour les erreurs (`:44, 93`). `console.log` : `:40, 55, 85`.
- Hors présentation, à signaler : charger un design ne demande pas de confirmation et ne remet pas l'historique à zéro, alors que `TemplateManager:151-160, 224` le fait.

### 2. Page — `PagePanel`, `FormatPanel`, `FondPanel`
**Taille** (~713 px, dépasse)
- Encadré indigo quand la planche pilote la taille (`FormatPanel:62-66`). Il renvoie à « l'onglet *Planche* », qui n'existe plus : c'est « Produits ».
- Encadré bleu « Taille actuelle : 595 × 842 px » (`:70-80`).
- `h3 text-sm font-medium` (`:84`), puis douze cartes `p-3 border rounded-lg` en deux colonnes, soit six rangées de 62 px (`:87-117`).
- Unité incohérente : « px » ligne 57, « pt » ligne 111, pour la même mesure.
- Libellés anglais : « Instagram Post », « Instagram Story », « Facebook Post », « Twitter Post » (`:30-33`).
- Deux champs `px-3 py-2 border rounded` de ~42 px, sans taille de texte (`:134, 145`). Bouton plein « Appliquer » `bg-blue-500 rounded` (`:151`).
- La taille est dite trois fois : encadré, carte surlignée, champs.
- **Défaut** : les champs sont un état local initialisé au montage (`:20-21`). Ils ne suivent pas un changement de taille venu d'un modèle.

**Fond** (~265 px)
- `p-3` + `p-1`, `h3 text-sm` (`FondPanel:27`), pastille et phrase, puis trois boutons `py-2 text-sm rounded-lg border` de 38 px (`:15`, `:49-63`). L'infobulle dit « canvas » (`:54`).

### 3. Texte
**Propositions** (`TextTemplates`, ~647 px, dépasse)
- Six cartes pleine largeur `p-4 border rounded-lg`, de 72 à 90 px chacune, `space-y-3` (`:37-55`).
- Chaque carte porte une étiquette grise et un aperçu plafonné à 24 px (`:44-52`).
- Aide en `text-[11px]` avec renvoi orange (`:56-59`).

**Réglages** (`ReglagesPanel` + `ReglagesTexte`, ~425 px, tient)
- Bandeau d'icônes de 44 px, liaison produit, noyau en cinq rangées de 28 px (`ReglagesTexte:243-287`), trois sections repliées de 49 px.
- Conforme au système. Seul écart : le titre de fenêtre du sélecteur de police (voir Fenêtres flottantes).

### 4. Médias
**Mes images** (`UploadTemplate`, ~690 px, dépasse)
- Zone en pointillés `p-6 border-2 border-dashed` de ~148 px, avec quatre lignes dont « 🎯 Ajout automatique au canvas » (`:195-217`).
- Aucun glisser-déposer n'est codé : seul `onClick` existe (`:196`). L'aspect « zone de dépôt » promet ce qui n'existe pas.
- Filet, `h3 text-sm` « Bibliothèque (N) », lien « Actualiser » (`:237-249`).
- Grille en deux colonnes `aspect-square border-2 rounded-lg object-cover` de ~143 px, dans un `max-h-[400px] overflow-y-auto` : un ascenseur dans l'ascenseur (`:263`).
- **Défaut** : au survol, un voile noir et un bouton rond rouge plein « Supprimer » apparaissent AU CENTRE de la vignette (`:285-293`). C'est l'endroit où l'on clique pour ajouter l'image. Seul le `confirm()` natif protège (`:149`).
- Coche bleue « sélectionnée » qui reste sur la dernière image cliquée, sans signification (`:296-306`).
- Nom de fichier sur dégradé noir (`:309-313`).
- Erreur en encadré rouge avec lien « Fermer » (`:222-233`).
- État vide : « Uploadez votre première image » (`:260`).
- `console.log` : `:38, 81, 112`.

**PocketStock** (`BibliothequeCatalogue`)
- Sur le système à moitié : pas de titre parasite, mais trois lignes d'aide en tête (`:68-71`).
- Recherche d'un troisième style, `py-1.5 text-sm border rounded` (`:80`).
- Vignettes `p-1.5 rounded-lg border` en trois colonnes de ~98 px (`:25`, `:42`).
- Le rayon « Entreprise » occupe ~141 px pour un seul logo (`:86-98`).
- Premier logo de marque à ~350 px du haut (estimé).

**Réglages image** (~230 px, tient, conforme).

### 5. Assets — `AssetsPanel`, `ShapeTemplates`, `QRCodeTemplates`
**Formes** (~560 px, tient de justesse)
- `h3 text-sm` « Couleur », sept pastilles rondes `w-7 border-2` avec `hover:scale-110` et `ring-2` (`ShapeTemplates:63-66`), plus la pastille commune.
- `h3` « Formes », cinq cartes `p-6 border rounded-lg` de 106 px en deux colonnes (`:84`) : la moitié du panneau pour cinq pictogrammes.
- Aide `text-xs` qui renvoie à « la barre de propriétés », disparue (`:101-104`).

**QR code** (~230 px)
- Un sous-onglet entier pour UN bouton (`QRCodeTemplates:22-31`).
- Trois lignes : « QR Code », « Ajouter un QR Code au canvas », « Valeur fixe, à saisir dans les Propriétés (« Contenu ») ». Ni « Propriétés » ni « Contenu » n'existent plus : le champ est sans libellé dans `ReglagesCodes:35-44`.

**Réglages forme et QR** : conformes.

### 6. Dessin — `DessinPanel`
- Segments (bien), puis neuf réglages en disposition `bloc` avec champ, 44 px chacun (`:66-76`), « Varie selon », et une aide de trois lignes (`:96-98`). Total ~668 px : dépasse.
- Les mêmes paramètres ont deux noms selon qu'on règle le pinceau ou un tracé :
  - « Adoucir le tracé (%) » (`:69`) contre « Adoucir » (`TraceSelectionne:105`) ;
  - « Épaisseur variable (%) » (`:76`) contre « Variation » (`TraceSelectionne:107`) ;
  - « Effiler le début (%) » (`:74`) contre « Effiler début ».
- Et deux présentations : `bloc` + champ ici, `ligne` là.
- Tracé sélectionné : `ReglagesPanel nu` sous les segments (`:63`). Cohérent.

### 7. Effets — `EffectsTemplates`, `BlocOmbre`
- Sur le système. Sans sélection : une phrase `p-4 text-sm` (`:69`). Avec sélection : ~440 px, tout coupé (estimé).
- Écarts mineurs : le bouton « Appliquer cette ombre à tous les éléments » réécrit `BOUTON_ACTION` à la main (`BlocOmbre:177`) ; le code couleur hexadécimal est affiché en `font-mono` (`:170`).

### 8. Calques — `LayersPanel`
- Rangées `px-2 py-2 rounded` de 36 px, `space-y-1` (`:126`).
- La rangée sélectionnée est en **aplat `bg-blue-500 text-white`** (`:129`). C'est contraire à la règle « l'aplat est réservé à l'onglet ouvert et au bouton principal » (`06-reprise-ui.md:148-150`).
- **Défaut** : les quatre actions (œil, verrou, dupliquer, supprimer) n'apparaissent qu'au survol (`:152`). L'état verrouillé n'est donc pas visible au repos ; le masqué ne l'est que par `opacity-50` (`:130`).
- L'icône montre l'action et non l'état : `Unlock` quand c'est verrouillé (`:171`).
- Le nom passe de 25 à 12 caractères au survol : le texte saute (`:142-147`).
- Noms en anglais : `el.type` capitalisé donne « Barcode », « Image » (`:82`).
- Icône `Type` (texte) pour un tracé et pour une fiche (`:20-35`).
- Seul `selectedId` est surligné ; la sélection multiple (`extraIds`) est ignorée (`:76`).
- Un calque verrouillé n'est ni sélectionnable ni déplaçable d'ici (`:120, 124`).
- État vide : « Aucun calque », `py-12` (`:66`).
- Non vérifié : `moveElement` est appelé à chaque `dragover` (`:55-60`). Je n'ai pas lu le store pour savoir si cela fait un pas d'historique par cran.

### 9. Produits — `SheetPanel`, `TiragePanel`
**Une par page** (~450 px avec cinq produits, tient)
- `h3` « Tirage » (`TiragePanel:74`) sous l'en-tête « Produits ».
- Rangées `py-1.5 rounded border`, point bleu pour le produit affiché, quantité − champ + en `h-6 rounded border` (`:16-36`), croix (`:95-126`).
- Bouton en pointillés « Ajouter des produits » (`:135`).
- Deux boutons bordés pour le format (`:64-69`, `:141-148`), puis le décompte (`:150-159`).
- Bouton plein **vert** `py-3 rounded-lg` « Exporter le tirage PDF » (`SheetPanel:376-383`).

**Planche** (ajoute ~850 px)
- Encadré indigo avec case à cocher native, « Canvas = taille d'une cellule » (`SheetPanel:156-178`).
- Deux cartes de format (`:186-209`), cinq boutons de grille `rounded` (`:218-232`).
- Quatre champs de 42 px (`:238-295`), suivis d'une note : « * Les valeurs saisies restent en points (pt). Affichage converti en millimètres pour votre confort. » (`:297-300`).
- **Défaut** : le libellé dit « Marge (mm) » alors que le nombre est en points (`:266-277`). L'interface affiche une unité fausse.
- Aperçu de la grille 200 × 280 px sur fond gris, cases vertes (occupées) et bleues (libres) (`:305-330`). `BandeTirage` montre déjà les pages sous la page.
- Encadré **ambre** qui n'est pas un avertissement (taille de cellule, échelle, total) avec un bouton **indigo** (`:333-370`).
- Cinq teintes dans le panneau : indigo, bleu, vert, ambre, gris. **Aucun orange**, alors que l'onglet est orange dans la barre d'icônes (`ToolsSidebar:70`).

### 10. Données — `DonneesProduitPanel`
- `p-4 space-y-5`.
- Ligne « Valeurs de : *nom* » (`:122-124`), ou encadré orange sans produit (`:126-137`).
- Liste « Sur l'affiche (N) » : cartes `rounded-lg border` de 54 px, l'active en orange, avec `LiaisonProduit` dépliée (`:141-187`).
- Trois `Carte` `rounded-xl border p-3` : titre `text-sm font-semibold`, icône orange, phrase d'aide (`:63-72`). Ce sont les « cartes encadrées » que la règle du 3 octobre abandonne (`06-reprise-ui.md:151`).
- Texte : dix champs en deux colonnes, cartes `p-2 border rounded-lg` de 50 px (`:191-207`).
- Médias : cinq à six lignes `BOUTON_AJOUT` de 54 px (`:55`), galerie en quatre colonnes de ~58 px (`:230-241`), code-barres avec puces `py-0.5 rounded border` (`:296-311`).
- Éditorial : trois lignes, libellé « Fiche : … » (`:324`).
- Total ~1 400 px (estimé).
- Le « Logo de l'entreprise » y figure en gris, parce qu'il n'est pas lié (`:267-279`). Il est déjà dans Médias › PocketStock.
- **Réglages** (code-barres, fiche) : conformes, sauf « Style du tableau » — cases à cocher natives, curseur natif `:121-129`, champs `py-0.5 border` de ~22 px (`ReglagesFiche:138, 164, 175, 203`).

### Fenêtres flottantes
- `GradientColorPicker` :
  - onglets en aplat `bg-blue-500` (`:46-51`), troisième écriture du contrôle segmenté ;
  - `<input type=color>` `w-9 h-7 rounded` (`:68`) ;
  - bouton « Inverser » `bg-gray-100 rounded` (`:392`) ;
  - `rounded-lg shadow-xl w-64` (`:221`). Correct pour une fenêtre.
- `FontSelector` : recherche d'un quatrième style avec `focus:ring-2` (`:80`), « Rechercher... » et « Chargement... » avec trois points au lieu de « … », lignes `px-3 py-2 text-sm`.
- `MasqueTexture` :
  - `select` et champ `rounded border bg-white` sans hauteur (`:45, 72`) ;
  - émoji 🎲 comme bouton (`:80`), case native « Inverser » (`:84`) ;
  - jargon : « Graine », « Octaves », « Seuil », « F1 (cellules) / F2 / F2 − F1 (bords) » (`:66, 91, 101-103`), « Bruit », « Bruit blanc », « Perlin », « Voronoï » (`utils/bruit.js:20-25`).
- `ReglagesMasque` : tuiles `h-12 rounded border`, sélection par `ring-2` (`:20-35`). Une quatrième forme de tuile.
- `LiaisonProduit` : conforme (hauteur 28 px, orange justifié). La pastille de la fiche est en `rounded-lg` (`:32`).

### Autour
- `CanvasArea` :
  - œil `h-7 w-7 rounded`, actif en ambre (`:85-88`) : l'ambre sert d'« état actif » et non d'avertissement ;
  - « Réglages » `h-8 w-8 rounded-lg bg-blue-50` (`:98`) ;
  - « Effets » `px-3 py-1.5 text-sm font-medium` **violet** (`:109`) ;
  - zoom `rounded border` (`:66`).
  - Quatre styles de bouton sur une barre de 44 px.
- `TopToolbar` : « Nouveau » plein bleu et « Exporter » plein **vert**, `rounded` (`:51, 139`) ; annuler et rétablir `p-2` avec icônes de 20 px ; `console.log` `:91, 119`.
- `EtiquetteSelection` : correcte et sobre (`:153`), boutons `rounded` de 4 px au lieu de 6.
- `BandeTirage` : correcte.

---

## B. Diagnostic d'harmonie

### Variantes par brique

| Brique | Variantes | Où | À garder |
|---|---|---|---|
| Titre de panneau | 2 | `ToolsSidebar:156` ; `TemplateManager:330` (`text-lg`) | L'en-tête de 40 px, seul. Aucun titre répété dans le corps |
| Titre de section ou de groupe | 7 | voir liste ci-dessous | `Section` pour ce qui se replie ; un seul `TitreGroupe` `text-xs font-medium` + compteur pour le reste |
| Texte d'aide | 6 | 11 px gris-500 (`Section:56`) ; 12 px gris-500 (`ShapeTemplates:101`) ; 11 px gris-400 (`QRCodeTemplates:28`) ; 14 px (`ReglagesPanel:129`) ; 11 px bleu en encadré (`FormatPanel:76`) ; 12 px bleu + émoji (`UploadTemplate:211`) | `text-[11px] text-gray-500 dark:text-gray-400`, une ligne au plus, sinon infobulle |
| Carte de proposition | 12 | voir liste ci-dessous | La tuile sans bordure sur fond gris de `BlocOmbre:94` : même matière que `CHAMP` |
| Vignette d'image | 6 | 143 px (`UploadTemplate:271`) ; 98 px (`BibliothequeCatalogue:25`) ; 133 px (`TemplateGrid:39`) ; 311 px (`DesignTemplates:192`) ; 58 px (`DonneesProduitPanel:235`) ; 32 px nue (`DonneesProduitPanel:253`) | Une `Vignette` : rayon 6, anneau 1 px, `object-contain` sur fond blanc, survol en anneau bleu (orange si liée) ; grilles de 2, 3 ou 4 colonnes |
| Bouton principal | 8, en 4 teintes | `styles.js:41` (bleu-600) ; `TemplateManager:335`, `FormatPanel:151`, `TopToolbar:51` (bleu-500) ; `SheetPanel:379`, `TopToolbar:139` (vert-500) ; `SheetPanel:363` (indigo-600) ; `DesignTemplates:240` | `BOUTON_PRINCIPAL` (bleu-600, 28 px). Un seul par panneau |
| Bouton secondaire | 7 | `BOUTON_ACTION` ; `FondPanel:15` ; `TemplateManager:343` ; `TiragePanel:135` (pointillés) ; `BlocOmbre:177` ; `GradientColorPicker:392` ; `CanvasArea:66` | `BOUTON_ACTION` |
| Bouton discret (lien) | 4 | `UploadTemplate:245` ; `BlocOmbre:139` ; `DonneesProduitPanel:131` ; `UploadTemplate:228` | Celui de `BlocOmbre:139` |
| Bouton destructif | 6 | `ReglagesCommuns:109` ; `LayersPanel:188` ; `UploadTemplate:288` (rond plein rouge) ; `TiragePanel:120` ; `GradientColorPicker:341` ; `TemplateGrid:124` | `ReglagesCommuns:109` : icône rouge, fond rouge léger au survol, jamais d'aplat |
| Bouton à icône | 8 | `BOUTON_ICONE` ; `ToolsSidebar:32` ; `EtiquetteSelection:144` ; `LayersPanel:158` ; `TiragePanel:16` ; `CanvasArea:85, 98` ; `TopToolbar:63` | `BOUTON_ICONE` (28 × 28, rayon 6, icône 16) |
| Champ texte ou nombre | 8 | `CHAMP` ; `FormatPanel:134` et `SheetPanel:249` (42 px, bordés, 16 px) ; `TiragePanel:27` (24 px) ; `ReglagesFiche:164` (~22 px) ; `MasqueTexture:72` ; `Curseur:61` (24 px) ; `ChampNombre:66` (copie de `CHAMP`) ; modales | `CHAMP` par `ChampValide` |
| Liste déroulante | 5 | `CHAMP` (`ReglagesCodes:107`) ; `ReglagesFiche:138` ; `MasqueTexture:45` ; `LiaisonProduit:70` ; modales `TemplateManager:523` | `CHAMP` |
| Recherche | 3 (+1 flottante) | `TemplateManager:359` ; `BibliothequeCatalogue:74` ; `FontSelector:75` | Un `ChampRecherche` de 28 px sur `CHAMP` |
| Onglets internes, choix exclusifs | 7 | `Segments` ; `OngletsPanneau` (même aspect) ; puces rondes `TemplateManager:384` ; puces `DesignTemplates:159` ; `TiragePanel:64` ; `GradientColorPicker:46` ; `SheetPanel:223` | `Segments` partout |
| Rangée de liste | 5 | `LayersPanel:126` (aplat bleu) ; `TiragePanel:95` ; `DonneesProduitPanel:154` ; `FontSelector:102` ; `EtiquetteSelection:147` | Une `LigneListe` de 32 px, active en bleu léger (orange léger si produit) |
| État vide | 7 | `LayersPanel:66` ; `TemplateManager:404` ; `DesignTemplates:179` ; `UploadTemplate:257` ; `BibliothequeCatalogue:54` ; `ReglagesPanel:129` ; `ToolsSidebar:205` | Un `EtatVide` : icône 20 px grise, une phrase 12 px, une action au plus |
| Chargement | 5 | `TemplateManager:401` ; `DesignTemplates:176` ; `UploadTemplate:254` ; `BibliothequeCatalogue:84` ; `FontSelector:89` | `EtatVide chargement` |
| Erreur, confirmation | 4 mécanismes | encadré rouge (`UploadTemplate:222`) ; `useActionToasts` à émojis ; `alert()` (`DesignTemplates:44, 93`) ; `confirm()` natif (`UploadTemplate:149`) contre `useConfirmModal` | Toast `sonner` (déjà dans `LabelPage`) et `useConfirmModal` |
| Avertissement, information | 7, en 5 teintes | indigo (`FormatPanel:62`, `SheetPanel:156`) ; bleu (`FormatPanel:70`) ; ambre sans avertir (`SheetPanel:333`) ; orange (`DonneesProduitPanel:126`) ; pastille ambre + ⚠ (`ReglagesCommuns:132`) ; texte ambre (`ReglagesContourStylise:45`) ; rouge | Une `Note` d'une ligne : ambre pour avertir, gris pour informer, orange pour le produit |

Les sept titres de section :
- `text-sm font-medium` : `ShapeTemplates:57`, `FormatPanel:84`, `SheetPanel:182`, `TiragePanel:74`, `UploadTemplate:239`, `FondPanel:27` ;
- `text-xs font-medium` gris-800 : `BibliothequeCatalogue:37` ;
- `text-xs font-medium` gris-500 : `DonneesProduitPanel:142` ;
- `text-sm font-semibold` avec icône orange : `DonneesProduitPanel:67` ;
- `text-xs font-semibold` avec chevron : `Section:33` ;
- `font-medium` avec filet : `ReglagesFiche:132` ;
- `text-xs` avec icône : `SheetPanel:308`.

Les douze cartes de proposition : `TextTemplates:42`, `ShapeTemplates:84`, `QRCodeTemplates:24`, `FormatPanel:92`, `SheetPanel:190`, `SheetPanel:223`, `DonneesProduitPanel:55`, `:197`, `:305`, `BlocOmbre:94`, `ReglagesMasque:20`, `DesignTemplates:192`.

Pourquoi ces choix : chaque variante retenue existe déjà dans `ui/` ou dans un panneau refait. On ne crée pas un nouveau style, on finit d'appliquer celui du 3 octobre.

### Ce qui fait « vieillot », nommément
1. **Cartes encadrées à gros padding** : `p-6` pour un pictogramme (`ShapeTemplates:84`), `p-4` pour deux mots (`TextTemplates:42`, `QRCodeTemplates:24`), `rounded-xl border` (`DonneesProduitPanel:64`), `border-2` (`DesignTemplates:192`, `UploadTemplate:271`).
2. **Encadrés d'information colorés** : indigo, bleu, ambre, orange, rouge (lignes dans le tableau).
3. **Boutons pleins saturés** en quatre teintes, dont trois dans le seul panneau Produits.
4. **Champs « formulaire web »** : bordure grise, fond blanc, 42 px, texte de 16 px (`FormatPanel:134`, `SheetPanel:249`, modales).
5. **Émojis dans l'interface** : « 🏭 USINE », « 🎯 Ajout automatique au canvas », 🎲, ✅ et ❌ dans les toasts, ⚠.
6. **Ombres lourdes et effets de survol** : `hover:shadow-lg` (`TemplateGrid:39`, `DesignTemplates:192`), `shadow-2xl` + ombre en ligne (`TemplateGrid:86-90`), `hover:scale-110` (`ShapeTemplates:63`, `UploadTemplate:288`, `TopToolbar:94`), voile noir (`UploadTemplate:285`), dégradés (`DesignTemplates:214, 220`, `TemplateGrid:66`).
7. **Rayons mélangés** : `rounded` 4 px (`FormatPanel:134`, `SheetPanel:223`, `TiragePanel:16`), `rounded-md` 6 px (système), `rounded-lg` 8 px (cartes), `rounded-xl` 12 px (`DonneesProduitPanel:64`), `rounded-full` (puces `TemplateManager:384`).
8. **Titres répétés et mots doublés** : « Templates » trois fois ; « Tirage » sous « Produits » ; « QR Code / Ajouter un QR Code » ; « Formats prédéfinis » sous l'onglet « Taille ».
9. **Densité irrégulière** : contrôles de 22, 24, 28, 30, 34, 36, 38, 42 et 48 px relevés, contre une règle à 28.
10. **Deux bleus** : `blue-500` (ancien) et `blue-600` (système).

---

## C. Hiérarchie et contenu

| Onglet | Ce que le vendeur vient chercher | Ce qu'il voit d'abord | Verdict |
|---|---|---|---|
| Modèles | Son modèle d'étiquette de prix | Titre, deux boutons, recherche, puces : 218 px | Non. Vignettes à remonter à ~125 px |
| Page | A4 ou A5, portrait ou paysage | Encadré bleu, puis douze formats dont six de réseaux sociaux | Moyen. Papier d'abord, le reste replié |
| Texte | Ajouter un prix, un titre | Six grandes cartes | Oui, mais deux fois trop haut |
| Médias | Une image déjà importée | Zone d'import de 148 px | Non. Les images d'abord, l'import en bouton |
| Assets | Un rectangle, un trait | Sept pastilles de couleur, puis les formes | Presque. Formes d'abord, couleur ensuite |
| Dessin | Tracer | Outil, puis neuf curseurs | Non. Trois réglages utiles, le reste replié |
| Effets | Une ombre | Préréglages d'ombre | Oui |
| Calques | Retrouver, masquer, verrouiller | La liste | Oui, mais les états sont invisibles |
| Produits | Quels produits, combien, exporter | Liste et quantités ; Exporter tout en bas en planche | Liste oui ; Exporter à coller en pied |
| Données | Ajouter nom, prix, photo, code-barres | La liste des éléments déjà liés (vide au début) | Non. Ajouter d'abord, la liste ensuite |

### Redondances
- **Logo de l'entreprise** : Médias › PocketStock (`BibliothequeCatalogue:87-98`) et Données (`DonneesProduitPanel:267-279`). Le retirer de Données : il n'est pas lié, il y est d'ailleurs en gris.
- **Logo de la marque** : fixe dans PocketStock, lié dans Données. Les deux se justifient ; remplacer les paragraphes de renvoi par un lien cliquable (`onOpenTool` est déjà passé à tous les panneaux, `ToolsSidebar:188`).
- **QR code** : un sous-onglet d'Assets pour un bouton, plus celui de Données. Fusionner le QR fixe dans la grille des formes. `ongletDe` range déjà le QR dans `shape` (`reglagesParType.js:77`) : aucune logique ne change.
- **Pinceau et tracé** : mêmes paramètres, deux noms, deux présentations.
- **Taille de la page** : dite trois fois dans `FormatPanel`.
- **Aperçu de la planche** : `SheetPanel:305-330` et `BandeTirage`.
- **Exporter** : « Exporter » en haut vaut pour la page en cours (`TopToolbar:41`), « Exporter le tirage PDF » dans Produits vaut pour tout. Même vert, portées différentes, rien ne le dit hors infobulle.
- **Dupliquer et Supprimer** : bandeau des réglages, survol des calques, clavier.

### Textes à supprimer ou raccourcir, mot pour mot

| Où | Aujourd'hui | Remplacement |
|---|---|---|
| `ToolsSidebar:207` | « Choisissez un outil à gauche pour ajouter un élément, ou sélectionnez un élément sur la page pour le régler. » | « Choisissez un outil à gauche. » |
| `TemplateManager:330` | « Mes Templates » | supprimer |
| `TemplateManager:363` | « Rechercher un template... » | « Chercher un modèle… » |
| `TemplateManager:408-409` | « Aucun template trouvé » / « Aucun template sauvegardé » | « Aucun modèle ne correspond. » / « Aucun modèle enregistré. » + bouton « Enregistrer cette affiche » |
| `TemplateManager:154` | « Charger ce template écrasera votre travail actuel. » | « L'affiche en cours sera remplacée. » |
| `TemplateManager` toasts | « Template sauvegardé ✅ » / « Erreur lors de la sauvegarde ❌ » | « Modèle enregistré » / « Enregistrement impossible » (sans émoji ni titre « Succès ») |
| `TemplateManager:498` | « Mon super template » | « Étiquette prix 63 × 38 » |
| `DesignTemplates:215` | « 🏭 USINE » | supprimer |
| `DesignTemplates:223` | « Aperçu à venir » | supprimer (icône de catégorie seule) |
| `DesignTemplates:255` | « N designs disponibles » | supprimer (compteur dans le titre de groupe) |
| `FormatPanel:63-65` | « Le format du canvas est actuellement piloté par la planche (taille d'une cellule). Désactivez cette option dans l'onglet Planche pour modifier librement le format. » | « Taille fixée par la planche. » + lien « Voir Produits » |
| `FormatPanel:73, 77` | « Taille actuelle : … » et « * Unités affichées en millimètres (conversion à partir des points). » | supprimer (les deux champs disent la taille) |
| `FormatPanel:85, 123` | « Formats prédéfinis » / « Taille personnalisée » | « Papier » / rien |
| `FondPanel:38` | « Couleur unie ou dégradé » / « Choisir une couleur crée le fond » | supprimer |
| `FondPanel:43` | « Le fond est une image (ou un autre élément) : retirez-le pour poser une couleur. » | « Le fond est une image. » |
| `FondPanel:56, 59` | « Mettre la sélection en fond » / « Réajuster au format » | « Sélection en fond » / « Réajuster à la page » |
| `TextTemplates:57-58` | « Un texte qui suit le produit (nom, prix, marque…) : onglet Données produit. » | lien orange « Nom, prix… du produit → » |
| `UploadTemplate:209-212` | « Importer une image / PNG, JPG jusqu'à 10MB / 🎯 Ajout automatique au canvas » | bouton « Importer des images » (limite en infobulle) |
| `UploadTemplate:240` | « Bibliothèque (N) » | « Mes images · N » |
| `UploadTemplate:259-260` | « Aucune image dans la bibliothèque / Uploadez votre première image » | « Aucune image importée. » |
| `BibliothequeCatalogue:69-70` | « Images fixes, tirées de PocketStock. Pour le logo de la marque du produit affiché, qui change avec lui : onglet Données produit. » | lien orange en bas : « Logo de la marque du produit → » |
| `BibliothequeCatalogue:49` | « 60 affichées sur N : précisez la recherche pour voir les autres. » | « 60 sur N — cherchez pour voir les autres. » |
| `BibliothequeCatalogue:95` | « L'entreprise n'a pas de logo. Il se dépose dans les réglages de l'entreprise. » | « Pas de logo d'entreprise (Réglages). » |
| `ShapeTemplates:102-103` | « Couleur, contour et arrondi se règlent ensuite dans la barre de propriétés, la forme sélectionnée. » | supprimer (faux, et les réglages s'affichent d'eux-mêmes) |
| `QRCodeTemplates:26-30` | « QR Code / Ajouter un QR Code au canvas / Valeur fixe, à saisir dans les Propriétés (« Contenu »). » | tuile « QR code » dans la grille des formes |
| `QRCodeTemplates:33-34` | « Un QR qui mène à la page de chaque produit : onglet Données produit. » | supprimer (le lien de l'onglet suffit) |
| `DessinPanel:97` | « Chaque trait devient un élément recolorable ; Maj trace un trait droit, Ctrl+Z l'annule, Échap revient à la sélection. » | « Maj : trait droit · Échap : sélection » |
| `DessinPanel:69-76` | « Adoucir le tracé (%) », « Stabiliser (%) », « Simplifier au relâchement (%) », « Effiler le début (%) », « Effiler la fin (%) », « Épaisseur variable (%) » | « Adoucir », « Stabiliser », « Simplifier », « Effiler début », « Effiler fin », « Variation » (les mots de `TraceSelectionne:105-109`, unité dans la valeur) |
| `BlocOmbre:81` | « Activez l'ombre pour la régler, ou choisissez un préréglage. » | supprimer (les préréglages sont visibles) |
| `BlocOmbre:180` | « Appliquer cette ombre à tous les éléments » | « Appliquer à tous » |
| `LayersPanel:67` | « Aucun calque » | « La page est vide. » |
| `TiragePanel:74` | « Tirage » | « À imprimer · N » |
| `TiragePanel:105` | « Affiché sur le canvas » / « Afficher sur le canvas » | « Affiché sur la page » / « Afficher sur la page » |
| `SheetPanel:158-161` | « Canvas = taille d'une cellule / Quand activé, le canvas suit automatiquement les dimensions de chaque cellule de la planche. » | ligne à interrupteur « Page à la taille d'une étiquette » |
| `SheetPanel:216, 237` | « Disposition rapide » / « Configuration » | « Grille » / rien |
| `SheetPanel:298-299` | « * Les valeurs saisies restent en points (pt)… » | supprimer, et corriger l'unité (question 2) |
| `SheetPanel:336-355` | « Taille de cellule / Document / Échelle appliquée / Total » | une ligne : « Étiquette 63 × 38 mm · 24 par feuille » |
| `SheetPanel:365` | « Appliquer une fois la taille de cellule au canvas » | « Mettre la page à cette taille » |
| `SheetPanel:382` | « Exporter le tirage PDF » | « Exporter tout (PDF) » |
| `DonneesProduitPanel:123` | « Valeurs de : *nom* » | « Aperçu : *nom* » |
| `DonneesProduitPanel:127` | « Aucun produit au tirage : les liaisons restent, mais aucune valeur ne s'affiche. » | « Aucun produit choisi. » + « Ajouter des produits » |
| `DonneesProduitPanel:190` | « Chaque champ s'ajoute en texte lié : sa valeur telle quelle, code-barres compris (le numéro seul). » | supprimer |
| `DonneesProduitPanel:211` | « Photo, logo de la marque, image de la catégorie, QR code et code-barres dessiné, liés au produit. » | supprimer |
| `DonneesProduitPanel:228` | « Galerie (N) — liée au même rang pour chaque produit » | « Autres photos · N » (règle en infobulle) |
| `DonneesProduitPanel:246-247, 260` | « Cette marque n'a pas de logo : rien ne s'affichera » ; « Aucune catégorie de ce produit n'a d'image : rien ne s'affichera » ; « Suit le produit affiché » | « Pas de logo » ; « Pas d'image » ; supprimer |
| `DonneesProduitPanel:285` | « Ce produit n'a pas d'adresse : le QR ne s'affichera pas » | « Pas de page sur le site » |
| `DonneesProduitPanel:317` | « Les sections de la description du produit, mises en forme. » | supprimer |
| `DonneesProduitPanel:324, 327, 330` | « Fiche : *section* » ; « Contenu d'exemple tant qu'aucun produit n'est choisi » ; « Absente de ce produit : ne s'affichera pas » | « *section* » ; « Exemple » ; « Absente » |
| `ReglagesPanel:129` | « Sélectionnez un élément pour voir ses réglages. » | garder |
| `ReglagesCommuns:133` | « ⚠ La fiche dit maintenant « … ». » | même phrase, icône `AlertTriangle` au lieu de l'émoji |
| `CanvasArea:121` | « Sélectionnez un élément pour le modifier. » | garder |

### Jargon et mots de boutique

| Aujourd'hui | Proposition |
|---|---|
| Templates, Mes templates, Designs | Modèles, Mes modèles, Modèles prêts |
| Assets | Formes (en-tête : « Formes et QR code ») |
| Médias | Images |
| Données produit | Infos produit (question 1) |
| canvas | la page |
| cellule | étiquette |
| Uploadez | Importez |
| Éditorial (carte de Données) | Fiche produit |
| Médias (carte de Données) | Images et codes |
| Instagram Post / Story, Facebook Post, Twitter Post | Publication Instagram, Story Instagram, Publication Facebook, Publication X |
| pt et px mêlés | mm pour le papier (question 2) |
| Barcode, Qrcode (noms de calques) | Code-barres, QR code |
| Graine + 🎲 | Variante + bouton « Autre » (icône `Shuffle`) |
| Octaves | Détail |
| Seuil | Coupure |
| Douceur | Fondu |
| Bruit, Bruit blanc, Perlin, Voronoï | Grain doux, Grain fin, Nuages, Cellules |
| Distance : F1 (cellules), F2, F2 − F1 (bords) | Motif : Cellules pleines, Cloisons larges, Bords |
| Ondes (contour stylisé) | Nombre de vagues |

Les identifiants (`type`, `distance`, `seed`…) ne changent pas : seuls les `label` changent.

---

## D. Le système étendu

### Échelles (clair / sombre)
- **Typographie**, quatre tailles :
  - 14 px `text-sm font-semibold` : l'en-tête de panneau, uniquement ;
  - 12 px `text-xs font-medium text-gray-800 dark:text-gray-200` : titres de groupe, noms de tuile et de rangée ;
  - 12 px `text-xs text-gray-700 dark:text-gray-300` : contrôles et contenu ;
  - 11 px `text-[11px] text-gray-500 dark:text-gray-400` : aide, compteurs, valeurs secondaires.
  - Le 10 px reste réservé à la barre d'icônes et aux libellés des préréglages d'ombre. Plus de `text-sm` ni de `text-lg` dans un corps de panneau.
- **Espacement** : 4, 8, 12, 16 px. Panneau `px-3 py-3` ; entre groupes 16 (`space-y-4`) ou filet + `py-3` ; dans un groupe 8 ; titre vers contenu 8 ; grilles `gap-2`.
- **Rayons** : 6 px (`rounded-md`) pour contrôles, tuiles, vignettes, rangées ; 8 px (`rounded-lg`) pour fenêtres flottantes, pavé 2D, boutons de la barre d'icônes ; plein pour pastilles et interrupteur. Plus de `rounded` nu ni de `rounded-xl`.
- **Hauteurs** : contrôle 28 (`h-7`) ; rangée de liste et en-tête de section 32 (`h-8`) ; en-tête de panneau 40 ; bandeau sous l'en-tête 44 ; tuile de proposition 64 (`h-16`) ; rangée à deux lignes 40 (`h-10`) ; un seul bouton haut de 32 par panneau, au plus (le pied collant).
- **Bordures** : filet `border-gray-200 dark:border-gray-700` entre groupes. Aucune bordure sur une tuile au repos. Anneau 1 px sur une vignette d'image seulement.
- **Fonds** : panneau `bg-white dark:bg-gray-800` ; matière des contrôles et tuiles `bg-gray-100 dark:bg-gray-700` (survol `bg-gray-200 dark:bg-gray-600`) ; vignette d'image `bg-white` dans les deux thèmes.
- **Ombres** : aucune dans un panneau ; `shadow-lg` pour les fenêtres flottantes seulement.

Point non vérifiable sans écran : un logo noir sur transparent disparaît sur `dark:bg-gray-800` (`BibliothequeCatalogue:28`). D'où le fond blanc proposé pour les vignettes en sombre.

### Palette
- **Bleu** : aplat `bg-blue-600` (onglet ouvert, bouton principal) ; léger `bg-blue-100 text-blue-700` / `dark:bg-blue-900/50 dark:text-blue-300` (bascule active, rangée sélectionnée) ; anneau `ring-blue-500`. Tous les `blue-500` en aplat passent à `blue-600`.
- **Orange**, réservé à la fiche produit : texte `text-orange-600 dark:text-orange-400`, survol `bg-orange-50 dark:bg-orange-900/20`, aplat `bg-orange-500` pour le seul onglet ouvert.
- **Ambre** : avertissement seulement. Conséquences : l'encadré de `SheetPanel:333` devient gris ; l'œil actif de `CanvasArea:87` passe en `boutonBascule(true)`.
- **Rouge** : destructif, en icône ou en texte, jamais en aplat.
- **Violet** : supprimé.
  - Le bouton « Effets » (`CanvasArea:109`) et le bouton « Réglages » (`:98`) deviennent deux `boutonBascule(ouvert)` identiques, icône + libellé, actifs en bleu léger quand leur onglet est ouvert.
  - Le badge « USINE » disparaît.
  - Les badges de catégorie des designs passent en gris (`bg-gray-100 text-gray-600`).
- **Vert et indigo** : supprimés. Les deux « Exporter » deviennent des boutons principaux bleus ; « Nouveau » devient secondaire (question 4).

### Ajouts à `ui/styles.js`
```js
export const PANNEAU = 'px-3 py-3 space-y-4';
export const AIDE = 'text-[11px] leading-snug text-gray-500 dark:text-gray-400';
export const TUILE = 'rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 disabled:pointer-events-none';
export const TUILE_PRODUIT = 'rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50 disabled:pointer-events-none';
export const BOUTON_DISCRET = 'text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline';
export const BOUTON_DESTRUCTIF = `${BOUTON_ICONE} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`;
```
À corriger dans le socle : `Curseur` en disposition `ligne` avec `champ` déborde, parce que le champ fait `w-14` dans une case `w-10` (`Curseur.jsx:61, 82`). La case doit passer à `w-14` quand `champ` est vrai, pour que le pinceau puisse quitter la disposition `bloc`.

### Composants à ajouter (huit, tous dans `ui/`)

| Composant | Props | Classes |
|---|---|---|
| `Bouton.jsx` | `variante` (`principal` \| `secondaire` \| `discret` \| `destructif`), `icone`, `plein`, `grand`, `titre`, `desactive`, `onClic`, `children` | les constantes de `styles.js` ; `plein` → `w-full` ; `grand` → `h-8` |
| `TitreGroupe.jsx` | `titre`, `compte`, `action`, `produit` | `h-6 flex items-center justify-between` ; titre `text-xs font-medium text-gray-800 dark:text-gray-200` ; compte `font-normal text-gray-500` précédé de « · » ; `produit` → titre orange |
| `CarteProposition.jsx` | `titre`, `detail`, `apercu` (nœud), `icone`, `disposition` (`tuile` \| `ligne`), `produit`, `desactive`, `titreInfobulle`, `onAjout` | tuile : `${TUILE} h-16 px-2 flex flex-col items-center justify-center gap-1` ; ligne : `w-full min-h-10 px-2 py-1 flex items-center gap-2 text-left rounded-md hover:bg-gray-100 dark:hover:bg-gray-700` ; titre `text-xs` (orange si `produit`) ; détail `text-[11px] text-gray-500 truncate` |
| `Vignette.jsx` | `src`, `nom`, `montrerNom`, `ajuste` (`contain` \| `cover`), `produit`, `action` (nœud en coin, au survol et au focus), `onClic` | cadre : `relative aspect-square rounded-md overflow-hidden bg-white ring-1 ring-inset ring-gray-200 dark:ring-gray-600 hover:ring-2 hover:ring-blue-500` (orange si `produit`) ; image `w-full h-full object-contain p-1` ; nom `mt-1 text-[11px] leading-tight truncate text-center text-gray-600 dark:text-gray-400` ; action `absolute top-1 right-1 h-6 w-6 rounded-md bg-white/90 opacity-0 group-hover:opacity-100 focus-visible:opacity-100` |
| `GrilleVignettes.jsx` | `colonnes` (2 \| 3 \| 4), `children` | `grid gap-2` + `grid-cols-N`. Largeurs utiles : 151, 98, 71 px |
| `ChampRecherche.jsx` | `valeur`, `onValeur`, `placeholder`, `label` | `relative` ; loupe `absolute left-2 h-3.5 w-3.5 text-gray-400` ; `${CHAMP} w-full pl-7 pr-7` ; croix d'effacement en `BOUTON_ICONE` de 20 px quand non vide ; Échap vide puis rend le focus |
| `EtatVide.jsx` | `icone`, `titre`, `detail`, `action`, `chargement` | `py-8 flex flex-col items-center gap-2 text-center` ; icône `h-5 w-5 text-gray-400` (`Loader2 animate-spin` si `chargement`) ; titre `text-xs text-gray-600 dark:text-gray-300` ; détail `AIDE` |
| `LigneListe.jsx` | `icone`, `titre`, `detail`, `actif`, `produit`, `attenue`, `avant`, `etats` (toujours visibles), `actions` (au survol), `onClic`, `...glisser` | `group h-8 px-2 flex items-center gap-2 rounded-md cursor-pointer` ; actif `bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300` (orange léger si `produit`) ; sinon `hover:bg-gray-100 dark:hover:bg-gray-700` ; `detail` présent → `h-10` ; titre `flex-1 min-w-0 truncate text-xs` ; actions `hidden group-hover:flex group-focus-within:flex` |
| `Note.jsx` | `ton` (`info` \| `avertissement` \| `erreur` \| `produit`), `action`, `children` | `flex items-start gap-1.5 text-[11px] leading-snug` ; `info` gris-500 ; `avertissement` `text-amber-700 dark:text-amber-400` + `AlertTriangle` 14 px ; `erreur` rouge-600 ; `produit` orange-600. Pas de fond ni de bordure |

Aucun nouveau paquet npm : `lucide-react` et `sonner` sont déjà là.

### Logique à sortir en modules purs, testés par Vitest
- `utils/calques.js` : `nomCalque(el)`, `iconeCalque(el)` (une clé, pas un composant), `etatsCalque(el)`. Remplace `LayersPanel:20-35, 82-115`. C'est là que « Barcode » devient « Code-barres ».
- `utils/modeles.js` : `filtrerModeles(modeles, { terme, categorie })`. Reprend `TemplateManager:306-323` et `DesignTemplates:142-148`.
- `utils/formatsPage.js` : la liste de `FormatPanel:23-36` (mêmes ids, mêmes dimensions) et `enMm(pt)`, écrit deux fois (`FormatPanel:7-11`, `SheetPanel:28-32`).
- `utils/planche.js` : `tailleCase(feuille, { rows, cols, margin, spacing })`. Sort `SheetPanel:65-72` sans changer le calcul.

---

## E. Les panneaux redessinés

Échelle : cadre de 44 caractères ≈ 311 px. Hauteurs en px à droite ; toutes sont estimées.

### Squelette commun aux deux états
```
┌────────────────────────────────────────────┐
│ Titre de l'onglet                        ‹ │ 40  en-tête
├────────────────────────────────────────────┤
│ BANDEAU                                    │ 44  px-3 py-2, filet dessous
├────────────────────────────────────────────┤
│ CORPS  px-3 py-3, groupes espacés de 16    │
├────────────────────────────────────────────┤
│ PIED collant, facultatif                   │ 48
└────────────────────────────────────────────┘
```
Le passage de « propositions » à « réglages » ne change que le contenu du bandeau et du corps.
- En propositions, le bandeau porte les onglets internes (`OngletsPanneau`, déjà 45 px) ou la recherche.
- En réglages, il porte la rangée d'icônes de `ReglagesCommuns`, déjà 44 px (`ReglagesPanel:143` + `ReglagesCommuns:73`). Il suffit de lui donner le filet du dessous.
- Un onglet sans bandeau (Texte, Formes) commence son corps à la hauteur du bandeau : le premier contrôle est toujours à 12 px du bord gauche.

### 1. Modèles — premières vignettes à ~125 px (218 aujourd'hui)
```
│ Modèles                                  ‹ │ 40
│ [  Mes modèles   |   Modèles prêts   ]     │ 44
│ [⌕ Chercher un modèle…      ] [⇪] [Enreg.] │ 28
│ [ Tous | Affiches | Produits | Planches ]  │ 28
│ ┌──────────────────┐ ┌──────────────────┐  │
│ │                  │ │                  │  │ ~110
│ │      aperçu      │ │      aperçu   ⋯  │  │
│ └──────────────────┘ └──────────────────┘  │
│ Étiquette prix 63×38  Affiche promo A4     │ 16
│ 12/09/2026            03/10/2026           │ 14
```
- Grille en deux colonnes de 151 px, soit trois rangées visibles sur 600 px.
- Menu « ⋯ » en liste à libellés (Ouvrir, Renommer, Dupliquer, Exporter, Supprimer en rouge), sur le modèle de `EtiquetteSelection:147`. Il existe aussi sans aperçu.
- « Modèles prêts » utilise la même grille et la même `Vignette` : pas de badge, pas de pied.
- `OngletsPanneau` est gardé tel quel (onglets montés, écouteur `request-template-save`).

### 2. Page — un seul panneau, sans sous-onglets (~330 px, tient)
```
│ Page                                     ‹ │ 40
│ Taille   L [ 210 ] × H [ 297 ] mm          │ 28
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐ │
│ │   ▯    │ │   ▭    │ │   ▯    │ │  ▭    │ │ 64
│ │ A4     │ │ A4     │ │ A5     │ │ A5    │ │
│ └────────┘ └────────┘ └────────┘ └───────┘ │
│ ▸ Autres formats                           │ 32  carrés, réseaux, flyer, bannière
│────────────────────────────────────────────│
│ Fond     [■]  [Sélection en fond] [↔] [×]  │ 28
```
- Champs en `ChampValide`, liés à `canvasSize` : plus de bouton « Appliquer », plus de valeur périmée.
- Bornes : `min={1}` sans maximum. C'est ce que fait réellement `handleCustomSize` (`FormatPanel:47`), les `min="100" max="5000"` n'étant que des attributs HTML non appliqués à la frappe.
- La tuile du format courant est en bleu léger.
- Page pilotée par la planche : champs et tuiles désactivés, plus une `Note` « Taille fixée par la planche. Voir Produits ».
- `PagePanel` ne reçoit pas de props aujourd'hui (`PagePanel:11`) : lui passer `onOpenTool` pour ce lien.
- Si la fusion est refusée (question 3) : mêmes blocs sous `OngletsPanneau` inchangé.

### 3. Texte — ~270 px (647 aujourd'hui)
```
│ Texte                                    ‹ │ 40
│ ┌───────────────────┐ ┌──────────────────┐ │
│ │      Titre        │ │    Sous-titre    │ │ 64
│ │       Titre       │ │    Sous-titre    │ │
│ └───────────────────┘ └──────────────────┘ │
│ ┌───────────────────┐ ┌──────────────────┐ │
│ │      19,99 €      │ │      −30 %       │ │ 64
│ │       Prix        │ │    Promotion     │ │
│ └───────────────────┘ └──────────────────┘ │
│ ┌───────────────────┐ ┌──────────────────┐ │
│ │   Texte normal    │ │   Petit texte    │ │ 64
│ │      Corps        │ │      Petit       │ │
│ └───────────────────┘ └──────────────────┘ │
│ ⛓ Nom, prix… du produit →                  │ 28  lien orange
```
- Tuiles `CarteProposition` : aperçu dans son style (plafonné à 20 px), nom en 11 px dessous.
- En réglages : bandeau d'icônes à la place du vide, noyau à la place de la grille, mêmes marges. Rien d'autre ne change : `ReglagesTexte` est déjà bon.

### 4. Images (ex-Médias)
```
│ Images                                   ‹ │ 40
│ [   Mes images   |    PocketStock    ]     │ 44
│ [ ⇪ Importer des images               ]    │ 28
│ Mes images · 12                         ⟳  │ 24
│ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│ │            │ │         🗑 │ │          │ │ 98
│ └────────────┘ └────────────┘ └──────────┘ │
│ ┌────────────┐ ┌────────────┐ ┌──────────┐ │ … quatre rangées visibles
```
- Trois colonnes, image entière (`contain`), nom en infobulle.
- **La corbeille est dans le coin, 24 px, au survol**, avec `useConfirmModal` : plus jamais au centre.
- Plus de coche « sélectionnée », plus de `max-h-[400px]` : le panneau défile, pas la grille.

PocketStock :
```
│ [⌕ Chercher une marque, une catégorie…  ]  │ 28
│ [▣] Logo de l'entreprise                   │ 40  LigneListe à miniature
│ Marques · 179                              │ 24
│ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│ │   logo     │ │   logo     │ │  logo    │ │ 98 + 14
│ │  Yamaha    │ │  Fender    │ │  Roland  │ │
│ Catégories · 42                            │
│ ⛓ Logo de la marque du produit →           │ 28  lien orange
```
- Premier logo de marque à ~190 px (350 aujourd'hui).
- En réglages image : bandeau d'icônes, puis noyau (`ReglagesImage`, inchangé).

### 5. Formes (ex-Assets) — sans sous-onglets (~280 px, 559 aujourd'hui)
```
│ Formes et QR code                        ‹ │ 40
│ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│ │     ▭      │ │     ●      │ │    ▲     │ │ 64
│ │ Rectangle  │ │  Cercle    │ │ Triangle │ │
│ └────────────┘ └────────────┘ └──────────┘ │
│ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│ │     ★      │ │     ─      │ │   ▦      │ │ 64
│ │  Étoile    │ │   Trait    │ │ QR code  │ │
│ └────────────┘ └────────────┘ └──────────┘ │
│ Couleur  ● ● ● ● ● ● ○  [■]                │ 28  pastilles de 20 px
│ ⛓ QR vers la page du produit →             │ 28  lien orange
```
- Les pictogrammes prennent la couleur choisie (comme `ShapeTemplates:89`).
- Pastille choisie : `ring-2 ring-blue-500`, sans `scale`.
- La tuile QR appelle le `handleAdd` actuel de `QRCodeTemplates`.

### 6. Dessin — ~260 px (668 aujourd'hui)
```
│ Dessin                                   ‹ │ 40
│ [ Sélection |  Pinceau  | Surligneur ]     │ 28
│ Couleur                               [■]  │ 28
│ Épaisseur  ───●──────────────     5 px     │ 28
│ Opacité    ──────────────●───   100 %      │ 28
│────────────────────────────────────────────│
│ ▸ Forme du trait                           │ 32  repliée
│ Maj : trait droit · Échap : sélection      │ 16
```
- « Forme du trait » contient Adoucir, Stabiliser, Simplifier, Variation, Varie selon, Effiler début et fin.
- Ce sont les mots et la disposition de `TraitTrace` : pinceau et tracé sélectionné deviennent le même panneau, à une ligne près (« Fusion surligneur »).
- Mêmes clés `setReglagesDessin`, mêmes bornes.

### 7. Effets
- Avec sélection : inchangé.
- Sans sélection : `EtatVide` (icône `Sparkles`, « Sélectionnez un élément pour lui donner une ombre ou un flou. »).

### 8. Calques — cas difficile
```
│ Calques                                  ‹ │ 40
│ 12 éléments                 glisser = ordre│ 24
│ ⠿ T  Prix                     ⛓            │ 32
│ ⠿ T  Titre principal                 👁 🔒 │ 32  survol : états et actions
│ ⠿ ▣  Photo du produit         ⛓            │ 32
│ ⠿ ▭  Rectangle                       ⊘     │ 32  masqué : œil barré TOUJOURS visible
│ ⠿ ✎  Dessin                             🔒 │ 32  verrouillé : cadenas TOUJOURS visible
│ ⠿ ▦  QR · adresse sur le site ⛓            │ 32
│────────────────────────────────────────────│
│   ▭  Fond                               🔒 │ 32  épinglé en bas, non déplaçable
```
- `LigneListe` de 32 px : 16 rangées visibles sur 600 px (14 aujourd'hui).
- Sélection en **bleu léger** ; les éléments de `extraIds` aussi.
- Deux emplacements fixes de 24 px à droite pour l'œil et le cadenas. Au repos ils ne s'affichent que si l'état n'est pas celui par défaut (masqué, verrouillé). Au survol ils s'affichent tous les deux, plus Dupliquer et Supprimer.
- L'icône montre l'**état** (cadenas fermé = verrouillé), l'infobulle dit l'action.
- Le nom est tronqué par CSS (`truncate`) : plus de saut entre 25 et 12 caractères.
- Un trombone orange de 12 px marque un élément lié à la fiche.
- Un calque masqué a son nom en gris-400, pas toute la rangée à 50 %.
- Glisser-déposer : le mécanisme HTML5 actuel est gardé tel quel (`draggable`, `onDragOver`). Présentation seule : poignée `⠿` de 12 px en gris-300, rangée tenue en `opacity-60 ring-1 ring-blue-400`.
- Le fond (`role: 'fond'`) est sorti de la liste triable et épinglé sous un filet. À vérifier dans le store : `moveElement` accepte-t-il déjà de déplacer le fond ?
- Liste longue : c'est le panneau qui défile ; la ligne de compteur reste collée en haut (`sticky top-0 bg-white dark:bg-gray-800`).

### 9. Produits — cas difficile
```
│ Produits                                 ‹ │ 40
│ À imprimer · 5                [+ Ajouter]  │ 28
│ ● Yamaha P-45 noir          [−] 2 [+]   ×  │ 32
│   Fender Squier Strat       [−] 1 [+]   ×  │ 32
│   Câble jack 3 m            [−] 6 [+]   ×  │ 32
│────────────────────────────────────────────│
│ [  Une par page  |  Planche 3×8  ]         │ 28
│ 9 étiquettes · 1 planche (15 cases libres) │ 16
│────────────────────────────────────────────│
│ ▾ Planche                                  │ 32  visible en planche seulement
│   Feuille   [ A4 portrait | A4 paysage ]   │ 28
│   Grille    [2×2][2×3][3×3][4×4][5×5]      │ 28
│   Colonnes [ 3 ]        Lignes [ 8 ]       │ 28
│   Marge    [ 10 ]       Écart  [ 4 ]       │ 28
│   Page à la taille d'une étiquette    (●)  │ 28
│   Étiquette 63 × 38 mm · 24 par feuille    │ 16
├────────────────────────────────────────────┤
│ [        Exporter tout (PDF)             ] │ 48  pied collant, bouton principal
```
- Rangée : `LigneListe` avec point bleu pour le produit affiché, quantité en `BOUTON_ICONE` de 24 px + `ChampValide w-9`, croix discrète.
- Mêmes actions du store : `setQuantite`, `retirerDuTirage`, `goToProductIndex`. `QUANTITE_MAX` reste la borne.
- Format en `Segments`.
- « Planche » est une `Section` : dépliée ~250 px au lieu de ~850.
- L'aperçu de grille 200 × 280 disparaît : `BandeTirage` le montre, en vrai. S'il doit rester, 96 px de haut en gris neutre.
- « Mettre la page à cette taille » devient un `Bouton discret` sous la ligne d'information.
- Les `useEffect` de `SheetPanel:81-119` (`setSheetMeta`, `setCellPt`, synchronisation de la page) restent au premier niveau du composant, hors de la `Section` repliable. Sinon ils cesseraient de tourner quand la section se replie.
- Ce qui tient sur 600 px : six produits en « une par page » ; en planche dépliée, trois produits, le reste défile sous un pied toujours visible.
- L'onglet est orange dans la barre d'icônes : le point du produit affiché et le compteur peuvent l'être aussi. Le bouton Exporter reste bleu : c'est une action, pas une donnée.

### 10. Infos produit (ex-Données) — cas difficile
```
│ Infos produit                            ‹ │ 40
│ Aperçu : Yamaha P-45 noir                  │ 24  nom en orange
│ Textes                                     │ 24
│ ┌───────────────────┐ ┌──────────────────┐ │
│ │ Nom du produit    │ │ Prix             │ │ 40  libellé orange 12 px
│ │ Yamaha P-45 noir  │ │ 499,00 €         │ │     valeur grise 11 px
│ └───────────────────┘ └──────────────────┘ │
│   … cinq rangées (dix champs)              │ 216
│ Images et codes                            │ 24
│ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│ │  photo   │ │  logo    │ │  catégorie   │ │ 98 + 14  Vignette produit
│ │ Photo    │ │ Marque   │ │ Catégorie    │ │
│ └──────────┘ └──────────┘ └──────────────┘ │
│ Autres photos · 4   [▫][▫][▫][▫]           │ 71  4 colonnes
│ ▦ QR vers la page du produit               │ 40  LigneListe
│ ▮ Code-barres 3760…   [EAN-13][Code 128]   │ 40
│ Fiche produit                              │ 24
│ ☰ Caractéristiques techniques · 8 lignes   │ 32
│ ☰ Points forts · 5 lignes                  │ 32
│ ☰ Conseils d'utilisation · Absente         │ 32
│────────────────────────────────────────────│
│ ▾ Sur l'affiche · 3                        │ 32  Section, ouverte
│ T  Prix · 499,00 €                         │ 40  active : orange léger +
│     ⛓ Lié à [ Prix             ▾ ]         │ 28  LiaisonProduit dessous
```
- Plus de cartes `rounded-xl` : trois `TitreGroupe` et des filets.
- Les trois phrases d'aide disparaissent. La distinction « numéro en texte » contre « barres dessinées » est portée par le rangement : Textes d'un côté, Images et codes de l'autre.
- Ordre inversé : on ajoute d'abord, la liste des éléments liés vient ensuite.
- Hauteur ~650 px avec trois éléments liés. Les deux premiers groupes, les plus utilisés, tiennent ; la fiche et la liste demandent un cran d'ascenseur. Je n'ai pas trouvé de mise en page qui garde l'aperçu des valeurs et tienne en 600 px. Variante plus courte : libellés seuls en `h-7` (−60 px), valeurs en infobulle.
- Sans produit : `Note` orange « Aucun produit choisi. » + « Ajouter des produits » ; les tuiles restent visibles mais désactivées (comme `DonneesProduitPanel:196`).
- Le « Logo de l'entreprise » sort d'ici.
- En réglages (code-barres ou fiche sélectionnés) : bandeau d'icônes, « Lié à », noyau. « Style du tableau » passe sur `Interrupteur`, `Curseur`, `CHAMP` et un `TitreGroupe` pour « Cadre » et « Ligne mise en avant ». C'est le dernier morceau « laissé tel quel » (`06-reprise-ui.md:168`).

---

## F. La barre d'icônes

**Ordre actuel** (`ToolsSidebar:54-80`) : Modèles, Page, Texte, Médias, Assets, Dessin, Effets, Calques, Produits, Données. Les deux onglets orange sont relégués en bas, alors que le parcours du vendeur est : modèle, puis produits, puis retouche.

**Ordre proposé**, quatre groupes séparés par un filet (`my-1 h-px w-8 bg-gray-200 dark:bg-gray-700`) :
```
 Modèles      ┐ partir de quelque chose
 Page         ┘
 ───
 Produits     ┐ le produit (orange)
 Infos        ┘
 ───
 Texte        ┐ ajouter
 Images       │
 Formes       │
 Dessin       ┘
 ───
 Effets       ┐ finir
 Calques      ┘
```
- Hauteur : dix boutons de 47 px + trois filets de 9 px + marges ≈ 515 px. Elle tient sur 600 px sans ascenseur (estimé).
- Aucun onglet n'est supprimé. Seuls l'ordre et trois libellés changent : Médias → Images, Assets → Formes, Données → Infos. Les `id` (`image`, `shape`, `donnees`) restent : `ONGLET_PAR_TYPE` et `ONGLETS_FIXES` n'y voient rien.
- En-tête de panneau : afficher le même mot que sous l'icône, en version longue (« Modèles », « Page », « Formes et QR code », « Infos produit »). Fin du couple « Modèles / Templates » (`:56`).
- **État actif** : aplat bleu ou orange gardé ; c'est la règle.
- **Survol** : gardé.
- **À ajouter** : un point de 6 px, `bg-blue-500`, sur l'icône de l'onglet qui porte les réglages de l'élément sélectionné quand un autre onglet est ouvert (`ongletDe(selection) === tool.id && !ouvert`). Depuis Calques, Effets ou Infos — qui ne suivent pas la sélection — le vendeur voit où aller. `selection` est déjà lu ligne 49.
- **Le X de l'en-tête** (`:160`) mène à un panneau vide de 335 px. Je recommande de le retirer : recliquer l'icône active ferme déjà (`:83`), et le chevron replie. Le panneau « Outils » vide (`:196-210`) n'apparaît alors qu'au tout premier lancement.

---

## G. Plan en lots

| Lot | Contenu | Fichiers | Effort | Ce qui peut casser | Vérification en cinq minutes |
|---|---|---|---|---|---|
| 0 — Socle | Constantes dans `styles.js`, les huit composants de `ui/`, quatre modules purs + tests, correctif `Curseur` ligne + champ | `ui/styles.js`, `ui/*.jsx` (nouveaux), `ui/Curseur.jsx`, `utils/calques.js`, `modeles.js`, `formatsPage.js`, `planche.js` + `.test.js` | 1 j | Rien à l'écran. `Curseur` : seul appelant `ligne` + `champ` à vérifier | Les tests passent ; l'écran est identique |
| 1 — Texte et Formes | Tuiles de 64 px ; QR dans la grille ; liens orange ; aides fausses retirées | `TextTemplates.jsx`, `ShapeTemplates.jsx`, `AssetsPanel.jsx`, `QRCodeTemplates.jsx` | 0,5 j | Sélectionner un QR doit toujours ouvrir l'onglet Formes en réglages | Ajouter chaque texte, chaque forme, un QR ; sélectionner, désélectionner |
| 2 — Infos produit | Groupes, tuiles orange, liste en bas, logo d'entreprise retiré | `DonneesProduitPanel.jsx` | 1 j | États désactivés sans produit ; `LiaisonProduit` dépliée ; formats de code-barres grisés | Avec et sans produit : ajouter nom, prix, photo, code-barres, fiche ; changer une liaison |
| 3 — Produits | Rangées, segments, section Planche, pied collant, plus de vert, d'indigo ni d'ambre | `SheetPanel.jsx`, `TiragePanel.jsx` | 1 j | Les `useEffect` de `SheetPanel:81-119` doivent rester hors de la section repliée ; `React.memo` | Trois produits, quantités, passer en planche, changer la grille, exporter |
| 4 — Images | Bouton d'import, grille à trois colonnes, corbeille en coin, plus d'ascenseur imbriqué ; PocketStock allégé | `UploadTemplate.jsx`, `BibliothequeCatalogue.jsx`, `MediasPanel.jsx` | 0,5 à 1 j | `confirm()` → `useConfirmModal` ; images très allongées en `contain` | Importer, ajouter, supprimer ; chercher une marque ; thème sombre |
| 5 — Calques | `LigneListe`, états visibles, noms en français, sélection en bleu léger | `LayersPanel.jsx` (+ `utils/calques.js` du lot 0) | 0,5 j | Glisser-déposer HTML5 (`draggable` sur la rangée) ; clic sur un calque verrouillé | Réordonner, masquer, verrouiller, sélection multiple |
| 6 — Page | Champs liés à la page, tuiles papier, « Autres formats » repliés, Fond en une rangée ; fusion si accordée | `PagePanel.jsx`, `FormatPanel.jsx`, `FondPanel.jsx`, `ToolsSidebar.jsx` (prop `onOpenTool`) | 0,5 j | Bornes de `ChampValide` ; page pilotée par la planche | Changer de format, taper une taille, poser un fond, activer la planche |
| 7 — Modèles | En-tête compact, grille commune, menu à libellés présent même sans aperçu, modales sur le système, toasts sans émoji, `alert` → toast, `console.log` retirés | `TemplateManager.jsx`, `DesignTemplates.jsx`, `ui/TemplateGrid.jsx`, `ModelesPanel.jsx` | 1 à 1,5 j | Écouteur `request-template-save` (onglets montés) ; menu en `fixed` | Enregistrer, renommer, dupliquer, exporter, importer, supprimer ; charger un modèle prêt |
| 8 — Dessin et fenêtres | Pinceau en noyau + section ; `GradientColorPicker` (onglets → `Segments`) ; `MasqueTexture` (mots de boutique, 🎲 → icône, `CHAMP`) ; `FontSelector` (`ChampRecherche`) ; « Style du tableau » ; `ReglagesMasque` (tuiles) | `DessinPanel.jsx`, `GradientColorPicker.jsx`, `MasqueTexture.jsx`, `FontSelector.jsx`, `ReglagesFiche.jsx`, `ReglagesMasque.jsx`, `utils/bruit.js` (libellés seuls) | 1 j | `useFlottant` (hauteur de fenêtre changée) ; clés `setReglagesDessin` ; cases natives → `Interrupteur` (mêmes clés) | Dessiner, régler le pinceau ; dégradé, texture ; masque ; style d'une fiche |
| 9 — Barre d'icônes et barre fine | Ordre, filets, libellés, point de repère, X retiré ; « Réglages » et « Effets » en bascules neutres ; œil en bleu léger ; « Exporter » bleu | `ToolsSidebar.jsx`, `CanvasArea.jsx`, `TopToolbar.jsx` | 0,5 j | Habitudes du vendeur ; `reglagesParType.test.js` si les libellés y sont testés (non vérifié) | Parcourir les dix onglets ; sélectionner depuis Calques et voir le point |

Total : 7 à 8 jours. Chaque lot est indépendant après le socle. Le lot 9 vient en dernier parce qu'il déplace des repères. Les lots 1 à 3 d'abord parce que ce sont les gestes quotidiens du vendeur.

À chaque lot : `pnpm build:client` (mémoire du dépôt : `tsc --noEmit` ne suffit pas), et pas de `pnpm format`.

---

## H. Questions au propriétaire

1. **Renommer et réordonner la barre d'icônes ?**
   Recommandation : oui — Modèles, Page | Produits, Infos | Texte, Images, Formes, Dessin | Effets, Calques.
   Ce que ça change : les deux onglets orange montent en troisième et quatrième position ; « Assets » devient « Formes », « Médias » devient « Images », « Données » devient « Infos ». Aucun onglet ne disparaît. Si « Données produit » doit rester (c'est le nom de la doc et de `CLAUDE.md`), je garde le mot et ne change que l'ordre.

2. **Afficher le papier en millimètres partout, et corriger « Marge (mm) » ?**
   Aujourd'hui le libellé dit mm et le nombre est en points (`SheetPanel:266-300`) ; la taille de page est en « px » ou « pt » selon la ligne.
   Recommandation : afficher et saisir en mm pour A4, A5 et planche, en convertissant à l'affichage et en écrivant toujours des points. Clés et bornes inchangées (0 à 50 pt ≈ 0 à 17,6 mm).
   Ce que ça change : le vendeur tape « 5 » pour 5 mm. C'est le seul point du rapport qui touche à ce qu'un champ signifie ; je ne le ferais pas sans accord. À défaut, le libellé dit « pt » et la note disparaît.

3. **Supprimer deux jeux de sous-onglets ?**
   Assets (Formes | QR code) deviendrait une grille de six tuiles ; Page (Taille | Fond) un seul panneau de ~330 px.
   Recommandation : oui pour les deux. Modèles et Images gardent les leurs.
   Ce que ça change : un clic de moins pour le QR et pour le fond. Aucune logique : le QR reste rangé dans l'onglet `shape`.

4. **Une seule couleur d'action ?**
   Recommandation : « Exporter » (barre du haut et Produits) passe du vert au bleu principal ; « Nouveau » devient secondaire ; « Effets » perd son violet et devient le jumeau de « Réglages » ; « USINE » disparaît.
   Ce que ça change : l'écran n'a plus que bleu, orange, ambre, rouge. Le vert d'« Exporter » est peut-être un repère auquel le vendeur tient : à confirmer.

5. **Pouvoir ajouter sans désélectionner ?**
   Aujourd'hui, un texte sélectionné masque les propositions : pour en ajouter un second, il faut cliquer dans le vide.
   Recommandation : un bouton discret « + Ajouter » à droite du bandeau d'icônes, qui montre les propositions jusqu'à la prochaine sélection.
   Ce que ça change : un état local dans `ToolsSidebar`, remis à zéro au changement de `selectedId`. C'est un petit ajout de comportement, pas de la présentation : hors plan si la réponse est non.

---

## Captures à fournir pour lever les doutes

Fenêtre de 1366 × 768, thème clair sauf mention :
1. L'écran entier, rien de sélectionné, onglet Modèles › Mes modèles avec au moins six modèles — pour la hauteur réelle de la coque et de la zone qui défile.
2. Modèles › Designs.
3. Page › Taille, puis la même avec la planche qui pilote la taille (encadré indigo).
4. Texte en propositions, puis un texte lié sélectionné (réglages + « Lié à »).
5. Médias › Mes images avec une dizaine d'images, **souris sur une vignette**.
6. Médias › PocketStock, en clair et **en sombre** (logos sur fond sombre).
7. Assets › Formes et Assets › QR code.
8. Dessin, pinceau actif.
9. Effets, une ombre activée.
10. Calques avec une quinzaine d'éléments dont un masqué et un verrouillé, souris sur une rangée.
11. Produits en « Une par page » avec cinq produits, puis en « Planche » défilé jusqu'en bas.
12. Données produit, haut et bas du panneau, avec et sans produit.
13. Les fenêtres : sélecteur de couleur en mode Texture, liste des polices, menu « ⋮ » d'un modèle.
14. La barre fine du haut avec un texte sélectionné, à 1366 px et à 1280 px.
15. Un panneau au choix en thème sombre (Produits, de préférence).

---

## Non vérifié
- Hauteur de la coque de l'application au-dessus de `LabelPage` (`StickPage.tsx` non lu) : les « 600 px » sont une hypothèse.
- Toutes les hauteurs, les retours à la ligne des puces et des textes, le rendu en thème sombre : estimés.
- Le store (`useLabelStore.js`) n'a pas été lu : `moveElement` (un pas d'historique par cran ? le fond est-il déplaçable ?), `addElementCentre`, `deleteElement`.
- `useFlottant`, `useMajSelection`, `useAlignementPage`, `useActionToasts`, `useConfirmModal` : connus par leurs appelants seulement.
- Le contenu de `reglagesParType.test.js` (teste-t-il des libellés d'onglet ?).
- Le nombre réel de modèles, d'images et de designs chez le client.

## Fichiers
**Lus en entier** :
- `PocketStick-docs/06-reprise-ui.md` ; le paragraphe PocketStick de `CLAUDE.md`.
- `ui/` : `styles.js`, `Section.jsx`, `Interrupteur.jsx`, `Segments.jsx`, `Curseur.jsx`, `ChampValide.jsx`, `ChampNombre.jsx`, `Pave2D.jsx`, `PastilleCouleur.jsx`, `TemplateGrid.jsx`.
- `templates/` : `OngletsPanneau`, `ModelesPanel`, `TemplateManager`, `DesignTemplates`, `PagePanel`, `FormatPanel`, `FondPanel`, `TextTemplates`, `MediasPanel`, `UploadTemplate`, `BibliothequeCatalogue`, `AssetsPanel`, `ShapeTemplates`, `QRCodeTemplates`, `DessinPanel`, `LayersPanel`, `SheetPanel`, `TiragePanel`, `DonneesProduitPanel`, `ReglagesPanel`, `ReglagesCommuns`, `ReglagesTexte`, `ReglagesImage`, `ReglagesCodes`, `ReglagesFiche`, `TraceSelectionne`, `EffectsTemplates`, `BlocOmbre`.
- `components/` : `GradientColorPicker`, `FontSelector`, `MasqueTexture`, `ReglagesMasque`, `ReglagesContourStylise`, `LiaisonProduit`, `CanvasArea`, `ReglagesRapides`, `EtiquetteSelection`, `TopToolbar`, `BandeTirage`.

**Lus partiellement** :
- `ToolsSidebar.jsx` (lignes 1-47 en aperçu, 44-217 en entier).
- `utils/reglagesParType.js` (lignes 1-120 et 141-160).
- `LabelPage.jsx` (lignes 30-70 et une recherche de classes).
- Par extraits ciblés : `lib/tirage.js` (`SHEET_FORMATS`), `utils/champsProduit.js` (libellés), `utils/dessin.js`, `typo.js`, `bruit.js`, `ondulation.js`, `ficheProduit.js` (listes de libellés).

**Non lus** :
- `PocketStick-docs/08-audit-design-sidebar.md` (192 lignes, le prompt d'origine).
- `ProductSelector.jsx`, `KonvaCanvas.jsx`.
- `store/useLabelStore.js`, `useFlottant.js`, `useMajSelection.js`, `useAlignementPage.js`.
- `ui/useActionToasts`, `ui/useConfirmModal`, `services/*`, `StickPage.tsx`.
- Les docs 01 à 05 et 07, et les tests.