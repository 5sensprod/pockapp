# Reprise — UI de l'éditeur, l'outil Dessin, puis la refonte de l'interface

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

## Mission « Améliorer les dessins » — terminée, commit `e2d5c65`

| Lot | Fait |
|---|---|
| 1 — Tremblé et ondulation sur un tracé (menu « Contour stylisé », `pointsDeformes`) | oui |
| 2 — Fermer un tracé en forme `shape: 'libre'` (`utils/formeLibre.js`), lissage réglable après coup (`traceLibre`, `relisser`) | oui |
| Hors lot — copier/coller le style ne colle plus la géométrie d'un dessin ; un style collé sur un tracé recalcule son cadre | oui |

Détail, compromis et ce qui est perdu à la fermeture :
[`05-dessin.md`](05-dessin.md), section « Mission Améliorer les dessins ».

Export PDF vérifié par le propriétaire le 3 octobre 2026 (rapporté).
`pnpm build:client` passe (3 octobre 2026, sur `c23caaf`). Les tests du module passent (270).

Pièges rencontrés, à ne pas refaire :
- **Les points gardés d'un tracé sont BRUTS** : le trait qu'on voit a déjà
  traversé la stabilisation de perfect-freehand. Toute géométrie tirée d'un
  tracé part de `ligneDuTrait` (`dessin.js`), pas de `pointsDe`.
- **`styliserContour` n'est pas un simple déformateur** : son `getStroke` a
  ses propres réglages (pression tirée du bruit, `streamline: 0`). Pour
  déformer sans changer de trait : `deformerLigne`.
- **Tout champ de GÉOMÉTRIE ajouté à un élément va dans `HORS_STYLE`**
  (`styleCopie.js`) — sinon « coller le style » colle la forme. Oublié pour
  `points`, vu à l'usage.
- **Un changement qui déplace le contour d'un tracé passe par `redessiner`**
  (cadre recalculé), jamais par un `updateElement` direct — y compris depuis
  `collerStyle`.
- **perfect-freehand n'est pas exactement invariant d'échelle** : rejouer un
  tracé à une autre taille s'écarte de 0,1 à 0,2 px. Les tests tolèrent un
  demi-pixel par unité d'échelle ; ne pas viser l'égalité.

---

## Refonte de l'interface — 3 octobre 2026

Audit par un agent (lecture seule), puis six étapes validées une à une à
l'écran par le propriétaire.

**Le principe, décidé par le propriétaire** : sélectionner un élément affiche
l'onglet de SON type dans la barre latérale, avec ses réglages détaillés à la
place des propositions de base ; désélectionner ramène les propositions. La
barre d'options au-dessus de la page, qui portait jusqu'à 16 contrôles et
défilait sur 1 500 px, ne porte plus aucun réglage.

| Quoi | Où |
|---|---|
| La carte : sections et onglet de chaque type, règle de bascule | `utils/reglagesParType.js` (pur, testé) |
| Le panneau : relie une section à son composant | `components/templates/ReglagesPanel.jsx` |
| Sections par type | `templates/ReglagesTexte.jsx`, `ReglagesImage.jsx`, `ReglagesCodes.jsx` (QR, code-barres, forme), `ReglagesFiche.jsx`, `TraceSelectionne.jsx` |
| Commun à tout élément (position, remplir, supprimer, liaison produit) | `templates/ReglagesCommuns.jsx` |
| Contour à main levée, masque (à plat) | `components/ReglagesContourStylise.jsx`, `ReglagesMasque.jsx` |
| Le curseur, unique | `components/ui/Curseur.jsx` |
| Fenêtres flottantes (couleur, police) dans l'écran | `utils/positionFlottante.js` + `components/useFlottant.js` |
| La barre fine : œil, Réglages, Effets, zoom | `components/CanvasArea.jsx` |
| L'onglet suit la sélection | `LabelPage.jsx` (effet sur `selectedId`) |

Onglets : texte → Texte ; image → Médias ; forme et QR → Assets ; tracé →
Dessin ; code-barres et fiche → Données produit.

Supprimés : `PropertyPanel.jsx`, `MenuGroupe.jsx`, `MenuMasque.jsx`,
`MenuContourStylise.jsx` (les deux derniers renommés en `Reglages*`). Les docs
01 à 05 et 07 les citent encore dans leurs sections datées : c'est de
l'historique.

Règles à ne pas défaire :
- **Mêmes clés écrites qu'avant** : les sections ont été déplacées, pas
  réécrites (le « Style du tableau » de la fiche tel quel). L'historique « un
  curseur tenu = un pas » tient à ce que les clés d'un `updateElement` ne
  changent pas d'un appel à l'autre.
- **Un réglage de tracé passe par `redessiner`**, une forme libre par
  `relisser` — depuis le panneau comme depuis l'ancienne barre.
- **La bascule d'onglet se fait au CHANGEMENT de sélection**, pas en continu :
  on peut ensuite ouvrir l'onglet qu'on veut. Trois onglets ne se quittent pas
  d'office (`ONGLETS_FIXES`) : Calques, Effets, Données produit — on y
  sélectionne pour travailler. Depuis eux, le bouton « Réglages » de la barre.
  Une première version ne suivait que depuis les onglets de type : après un
  template, cliquer un élément ne montrait plus rien.
- **L'œil n'est pas dans la barre flottante de l'élément** : elle disparaît
  avec le cadre, on ne pourrait plus le rallumer au clic.
- **Tout réglage qui se glisse est un `input[type=range]` ou porte
  `data-geste-reglage`** (pavé 2D, champ à glisser) : c'est ce que le canvas
  cherche (`closest`) pour masquer le cadre pendant le geste (`KonvaCanvas`).

`pnpm build:client` passe (3 octobre 2026, sur `c23caaf`).
Non fait : cohérences de l'audit (sélection multiple
qui ne règle que le premier élément — annoncée dans le panneau, pas
corrigée ; alignement du texte qui fixe une largeur — annoncé ; les deux
« Ondulation » ; « Appliquer l'ombre à tous » qui fait un pas d'historique
par élément). Vérifié à l'écran par le propriétaire, étape par étape ; aucun
test de rendu de composant n'existe.

---

## Modernisation de la barre latérale — 3 octobre 2026

Audit par un agent design (lecture seule), puis cinq lots validés à l'écran
par le propriétaire. Aucune valeur écrite n'a changé : mêmes clés, mêmes
bornes, mêmes pas — c'est l'aspect et la forme des contrôles qui changent.

| Quoi | Où |
|---|---|
| Classes communes (ligne, champ, pastille, boutons) | `components/ui/styles.js` |
| Section repliable, interrupteur dans l'en-tête, `avant` (préréglages) | `ui/Section.jsx` |
| Interrupteur (`button role="switch"`) | `ui/Interrupteur.jsx` |
| Contrôle segmenté | `ui/Segments.jsx` |
| Pavé 2D (deux valeurs d'un geste) | `ui/Pave2D.jsx`, calculs `utils/pave2D.js` |
| Champ à glisser sur son libellé | `ui/ChampNombre.jsx` (`valeurGlissee`, `pave2D.js`) |
| Ombre portée et ombre interne : un seul bloc | `templates/BlocOmbre.jsx`, `utils/presetsOmbre.js` |
| Onglet Effets | `templates/EffectsTemplates.jsx` |
| Barre d'icônes à libellés, en-têtes de 40 px | `components/ToolsSidebar.jsx` |

Règles visuelles : UN accent, le bleu ; orange = ce qui vient de la fiche
produit ; ambre = avertissement ; rouge = destructif. L'aplat bleu est
réservé à l'onglet ouvert et au bouton principal ; une bascule active est en
bleu léger. Contrôles de 28 px, rayon 6 px, texte 12 px, filets entre
sections (plus de cartes encadrées).

Règles à ne pas défaire :
- **Le pavé écrit X et Y ENSEMBLE**, dans un seul `updateElement`, depuis la
  poignée comme depuis un champ : la clé du geste (`id|champs triés`) reste la
  même, un glisser fait un pas d'annulation.
- **X/Y restent la seule vérité de l'ombre** ; angle et distance ne sont
  qu'affichés (`polaire`). Une valeur hors ±40 (template ancien) colle la
  poignée au bord, en ambre, sans être réécrite.
- **L'aperçu est du CSS** (`filtreApercu`, `ombreInterneApercu`), pas du
  Konva : indicatif, à l'échelle du pavé.
- **Interrupteur, segments, pavé ne sont pas des `<input>`** : Suppr et H du
  canvas restent actifs après un clic. Un curseur relâché à la souris rend le
  focus (`Curseur`, `onPointerUp`).
- `blurFade` et `ondulationEffet` sont des OBJETS : chaque écriture rend
  l'objet entier.

Laissé tel quel : les cases à cocher natives du « Style du tableau » de la
fiche, le violet des designs d'usine et du bouton « Effets » de la barre du
haut.

Couleurs unies : `ui/PastilleCouleur.jsx` (le sélecteur maison,
`GradientColorPicker` en `uniSeulement`) remplace les onze `<input
type="color">` natifs. Sans `opacite`, elle écrit `#rrggbb` comme le natif —
c'est le cas de l'ombre, dont l'opacité est une clé à part ; avec, elle garde
`#rrggbbaa` (trait d'une forme, pinceau). Elle annule le renvoi de clic du
`<label>` qui l'entoure souvent, sans quoi un clic dans le vide de la fenêtre
la refermait. Reste natif : le choix fin d'une teinte, DANS la fenêtre
(`ChampCouleur` de `GradientColorPicker`).

Changé au passage : le préréglage d'ombre « colorée (Indigo) » a disparu
(cinq vignettes noires, la couleur se choisit à part) ; quatre préréglages
d'ombre interne sont nouveaux.

Gardiens : `utils/pave2D.test.js` (pavé, champ à glisser, ombres). `pnpm build:client`
passe (3 octobre 2026, sur `aa61bc3`).

---

## Panneaux en noyaux, options rapides, casse — 3 octobre 2026 (suite)

Second audit par un agent design, sur le panneau Texte : déplié, il faisait
environ 1 390 px pour 600 visibles (estimé d'après les classes). Constat du
propriétaire : infos importantes noyées, texte inutile, ascenseur obligé.

**Un panneau = un NOYAU, puis des sections rares.**
- Le noyau : les réglages courants du type, en rangées serrées, SANS titre de
  section ni libellé redondant (`nu: true` dans `SECTIONS`, `ReglagesPanel.jsx`).
  Texte : police et taille ; style et alignement ; couleur, contour,
  surlignage ; casse ; largeur du bloc.
- Les sections rares (`SECTIONS_RARES`, `utils/reglagesParType.js`) sont
  repliées. Elles s'ouvrent si l'élément y porte un réglage
  (`sectionActive`), et le signalent d'un point bleu quand elles sont
  repliées. La `key` de la `Section` porte l'id de l'élément : l'état du pli
  se recalcule à chaque sélection (un pli fait à la main n'est pas retenu).
- Le bandeau commun est UNE rangée d'icônes (`ReglagesCommuns.jsx`) :
  position, remplir, dupliquer, supprimer ; puis « Lié à ».

| Type | Noyau | Sections |
|---|---|---|
| Texte | `Texte.Noyau` | Espacement, Contour à main levée, Masque |
| Image | `Photo.Noyau` | Masque |
| Forme | `Codes.NoyauForme` (arrondi compris) | Contour à main levée, Lissage, Masque |
| Tracé | `NoyauTrace` | Forme du trait, Contour à main levée ; « Fermer en forme » |
| QR, code-barres | `NoyauQr`, `NoyauBarres` | — |
| Fiche | `Fiche.Contenu` | Style du tableau |

**Options rapides dans la barre du haut** (`ReglagesRapides.jsx`,
`RAPIDES_PAR_TYPE`) : texte — taille, gras, italique, casse ; image — Remplir /
Contenir, miroirs ; tous — centrer sur la page. Ce sont les MÊMES atomes que
le panneau et le MÊME `maj`. Masquées sous 1280 px de fenêtre.

Décisions du propriétaire, gardées par `reglagesParType.test.js` ou notées ici :
- **aucune couleur dans la barre du haut** : la fenêtre du sélecteur y
  déborde ; les couleurs restent dans la barre latérale ;
- **ni Dupliquer ni Supprimer dans la barre du haut** ;
- ni la police (trop large), ni l'alignement du texte (il fixe la largeur du
  bloc, son Auto / Fixe doit rester à côté).

**Un seul chemin d'écriture** : `useMajSelection` (panneau et barre). Un
réglage vaut pour toute la sélection du MÊME type, en un pas d'historique
(`utils/majSelection.js`, action `updateElements`) : le style se partage — la
frontière est `HORS_STYLE` de `styleCopie.js` —, la géométrie reste à chacun,
un tracé est redessiné pour lui-même. Les effets vont à toute la sélection,
tous types. Aligner (`useAlignementPage`) et « Appliquer cette ombre à tous »
font aussi un seul pas.

**La casse** (`el.casse`, `utils/typo.js`) : normale, majuscules, minuscules,
une majuscule par mot. C'est un STYLE appliqué au dessin (`appliquerCasse`),
à l'écran (`TextNode`) et dans l'export planche : le texte saisi, ou lu dans
la fiche, n'est jamais réécrit. `TextNode` édite le texte BRUT — éditer la
forme en majuscules figerait la casse dans le contenu.

**Champs numériques** : `ui/ChampValide.jsx`, brouillon validé à Entrée ou en
sortant. Borner à chaque frappe rendait « 36 » intapable (« 3 » remontait à
4, on obtenait 46).

Les quatre cohérences du premier audit sont closes : sélection multiple,
largeur du bloc visible et réversible (Auto / Fixe), « Ondulation de
l'élément » dans Effets, ombre « à tous » en un pas.

Reste ouvert : le jargon des textures du masque (« Graine », « Octaves ») ;
les panneaux de PROPOSITIONS (Templates, Page, Médias, Assets, Calques,
Produits, Données produit) n'ont pas été refaits — prompt d'audit dans
[`08-audit-design-sidebar.md`](08-audit-design-sidebar.md).

Gardiens : `reglagesParType.test.js`, `majSelection.test.js`, `casse.test.js`.
Vérifié à l'écran par le propriétaire ; `pnpm build:client` non relancé
depuis `aa61bc3`.

---

## Panneaux de propositions — audit et lot 0 (socle), 3 octobre 2026

Audit par un agent design (lecture seule), sur le prompt de
[`08-audit-design-sidebar.md`](08-audit-design-sidebar.md) ; rapport entier
dans [`09-audit-barre-laterale.md`](09-audit-barre-laterale.md) — inventaire,
système, maquettes, plan en dix lots.

Décisions du propriétaire (les cinq questions du rapport, toutes « oui ») :
1. barre d'icônes réordonnée et renommée — Modèles, Page | Produits, Infos |
   Texte, Images, Formes, Dessin | Effets, Calques ; les `id` ne changent pas ;
2. le papier en MILLIMÈTRES partout, saisie comprise ; le store garde des
   points ;
3. plus de sous-onglets dans Assets (le QR rejoint les formes) ni dans Page ;
4. une seule couleur d'action : « Exporter » en bleu, « Effets » sans violet,
   plus de badge « USINE » ;
5. un bouton « + Ajouter » dans le bandeau des réglages, pour ajouter sans
   désélectionner.

**Lot 0 — le socle. Rien ne change à l'écran : aucun panneau ne l'importe
encore.**

| Quoi | Où |
|---|---|
| Classes : `PANNEAU`, `AIDE`, `TUILE`, `TUILE_PRODUIT`, `BOUTON_DISCRET`, `BOUTON_DESTRUCTIF` | `components/ui/styles.js` |
| Bouton (principal, secondaire, discret, destructif) | `ui/Bouton.jsx` |
| Titre d'un groupe qui ne se replie pas | `ui/TitreGroupe.jsx` |
| Ce qu'un panneau propose d'ajouter (tuile ou ligne) | `ui/CarteProposition.jsx` |
| Vignette d'image, et sa grille | `ui/Vignette.jsx`, `ui/GrilleVignettes.jsx` |
| Recherche | `ui/ChampRecherche.jsx` |
| État vide, chargement | `ui/EtatVide.jsx` |
| Rangée de liste | `ui/LigneListe.jsx` |
| Note d'une ligne (info, avertissement, erreur, produit) | `ui/Note.jsx` |
| Nom, icône et états d'un calque | `utils/calques.js` |
| Filtre des modèles | `utils/modeles.js` |
| Formats de page, points ↔ mm (`enMm`, `enPt`) | `utils/formatsPage.js` |
| Taille d'une case de planche | `utils/planche.js` |

Seul changement dans un fichier existant : `Curseur` en `ligne` avec `champ`
donne 56 px à sa case (le champ débordait de 40). Aucun appelant n'utilisait
cette combinaison — `champ` ne sert qu'en `bloc` (`TraceSelectionne`).

Les modules purs sont écrits mais PAS ENCORE branchés : `LayersPanel`,
`TemplateManager`, `DesignTemplates`, `FormatPanel` et `SheetPanel` gardent
leur copie jusqu'au lot qui les refait. `nomCalque` changera des noms à
l'écran (« Barcode » → « Code-barres ») : c'est le lot 5.

Gardiens : `calques.test.js`, `modeles.test.js`, `formatsPage.test.js`,
`planche.test.js`. Les tests du module passent (354) ; `pnpm build:client`
passe, mais ne prouve rien des neuf composants, que rien n'importe — ils ont
été compilés un à un par esbuild.

**Lot 1 — Texte et Formes** (3 octobre 2026, à vérifier à l'écran).

- Texte : six tuiles de 64 px en deux colonnes (`TextTemplates.jsx`), au lieu
  de six cartes pleine largeur ; même élément ajouté qu'avant.
- Formes : UNE grille de six tuiles — cinq formes et le QR code fixe — puis la
  couleur sur une ligne (`AssetsPanel.jsx`). Plus de sous-onglets :
  `ShapeTemplates.jsx` et `QRCodeTemplates.jsx` y sont fondus et supprimés.
  Mêmes éléments ajoutés (`QR_PAR_DEFAUT`, mêmes tailles de forme). Un QR
  sélectionné ouvre toujours cet onglet (`ongletDe`, inchangé).
- L'onglet s'appelle « Formes » (en-tête : « Formes et QR code ») ; son `id`
  reste `shape`. Le reste de la barre d'icônes attend le lot 9.
- Les paragraphes « … : onglet Données produit » sont des liens orange qui
  ouvrent l'onglet (`ui/LienProduit.jsx`, par `onOpenTool`). Les aides qui
  renvoyaient à « la barre de propriétés » et aux « Propriétés (Contenu) »,
  disparues, sont retirées.

Les tests du module passent (354) ; `pnpm build:client` passe. Pas encore vu à
l'écran.

**Lot 2 — Données produit** (3 octobre 2026, à vérifier à l'écran).
`DonneesProduitPanel.jsx` seul.

- Ordre inversé : on AJOUTE d'abord (Textes, Images et codes, Fiche produit),
  la liste « Sur l'affiche » vient ensuite, en `Section` repliable.
- Plus de cartes `rounded-xl` ni de phrases d'aide : trois `TitreGroupe`. Le
  rangement dit ce que disaient les phrases — sous « Textes » le code-barres
  arrive en numéro, sous « Images et codes » en barres dessinées.
- Photo, logo de la marque et image de la catégorie sont trois `Vignette`
  orange ; la galerie, quatre par rangée ; QR et sections de la fiche, des
  lignes ; les dix champs texte, des tuiles de 40 px.
- Le logo de l'entreprise n'y est plus (il n'est lié à rien) : il reste dans
  Médias › PocketStock.
- Sans produit : une `Note` orange et « Ajouter des produits » ; les
  propositions restent visibles, désactivées — sauf les sections de la fiche,
  qui s'ajoutent en exemple, comme avant.
- Mêmes créations (`utils/ajoutsProduit.js`), même `LiaisonProduit` sous
  l'élément actif de la liste. L'onglet garde son nom jusqu'au lot 9.

Les tests du module passent (354) ; `pnpm build:client` passe. Pas encore vu à
l'écran.

**Lot 3 — Produits** (3 octobre 2026, à vérifier à l'écran).
`SheetPanel.jsx`, `TiragePanel.jsx`.

- Tirage : « À imprimer · N » et son bouton « Ajouter » ; une `LigneListe` par
  produit (point bleu = celui que la page montre), quantité en `ChampValide`
  — validée à Entrée ou en sortant, plus à chaque frappe ; format en
  `Segments`. Mêmes actions du store (`setQuantite`, `retirerDuTirage`,
  `goToProductIndex`, `setFormatTirage`), même `QUANTITE_MAX`.
- Planche : UNE `Section` repliable (~250 px, elle en faisait ~850) — feuille
  et grille en `Segments`, quatre champs, l'interrupteur « Page à la taille
  d'une étiquette », une ligne « Étiquette 63 × 38 mm · 24 par feuille ».
  **Les deux `useEffect` (`setSheetMeta` / `setCellPt`, page = case) restent
  au premier niveau de `SheetPanel`** : dans la section, ils s'arrêteraient
  quand on la replie.
- **Marge et écart se saisissent en MILLIMÈTRES** (`enMm` / `enPt`,
  `utils/formatsPage.js`). Le store garde des points entiers de 0 à 50 : les
  planches enregistrées ne changent pas. Avant, le libellé disait « mm » et
  le champ montrait des points. Un pas de flèche = 1 mm ≈ 3 pt.
- `tailleCase` (`utils/planche.js`) est branchée : même calcul.
- Parti : l'aperçu de la grille (la bande des pages montre les vraies
  planches), l'encadré ambre (« Document : … px », « Total »), l'indigo, le
  vert. « Échelle appliquée » ne s'affiche plus que si la page est réduite.
- « Exporter tout (PDF) » est un pied collant, en bleu principal.

Les tests du module passent (354) ; `pnpm build:client` passe. Pas encore vu à
l'écran.

**Lot 4 — Médias** (3 octobre 2026, à vérifier à l'écran).
`UploadTemplate.jsx`, `BibliothequeCatalogue.jsx`, `MediasPanel.jsx`.

- Mes images : un bouton « Importer des images » à la place de la zone en
  pointillés de 148 px (aucun glisser-déposer n'y était codé) ; grille à
  TROIS colonnes, image entière (`contain`), nom en infobulle.
- **La corbeille est dans le coin de la vignette**, au survol, et passe par
  `useConfirmModal` — elle était au centre, là où l'on clique pour ajouter,
  derrière un `confirm()` du navigateur.
- Parti : la coche « sélectionnée » (elle restait sur la dernière image
  cliquée, sans rien dire), la grille qui défilait dans le panneau
  (`max-h-[400px]`), trois `console.log`.
- PocketStock : `ChampRecherche`, le logo de l'entreprise en une rangée, les
  vignettes communes, le lien orange vers les données produit.
- Les deux sous-onglets défilent chacun pour soi (`h-full overflow-y-auto`) :
  la barre d'onglets reste en place.
- L'onglet garde son nom « Médias » jusqu'au lot 9.

Les tests du module passent (354) ; `pnpm build:client` passe. Pas encore vu à
l'écran.

**Lot 5 — Calques** (3 octobre 2026, à vérifier à l'écran). `LayersPanel.jsx`,
sur `utils/calques.js` (branché ici).

- **Un calque masqué ou verrouillé le montre SANS survol** : œil barré,
  cadenas fermé. Les deux emplacements sont fixes (le nom ne saute plus) ;
  l'état par défaut n'apparaît qu'au survol. L'icône dit l'état, l'infobulle
  l'action. Dupliquer et Supprimer restent au survol.
- Sélection en bleu léger, et TOUTE la sélection (`extraIds`), plus l'aplat.
- Un trombone orange marque un élément lié à la fiche. Un calque masqué a son
  nom en gris, plus toute la rangée à 50 %.
- Noms par `nomCalque` : « Code-barres », « QR code », « Image », « Fond ».
  Un tracé et une fiche ont leur icône.
- **Le fond est épinglé en bas**, sous un filet, hors de la liste qu'on
  réordonne : on ne peut plus glisser un élément dessous. C'est le seul
  changement de comportement du lot.
- NON CORRIGÉ : `moveElement` fait un pas d'historique à chaque rangée
  franchie pendant le glisser (lu dans le store). Un glisser de cinq crans
  demande cinq Ctrl+Z.

Les tests du module passent (355) ; `pnpm build:client` passe. Pas encore vu à
l'écran.

**Lot 6 — Page** (3 octobre 2026, à vérifier à l'écran). `PagePanel.jsx`,
`FormatPanel.jsx`, `FondPanel.jsx`.

- Un seul panneau, sans sous-onglets : la taille, puis le fond sous un filet.
  L'onglet s'appelle « Page » sous l'icône comme en en-tête.
- **Les deux champs sont la taille de la page** (`canvasSize`), en `ChampValide` :
  plus d'état local ni de bouton « Appliquer », donc plus de valeur périmée
  quand un modèle change la page.
- **En millimètres** : `mmAffiche` (le mm rond quand le papier y est à deux
  dixièmes près, sinon le dixième), `enPt` à l'écriture. Bornes : 1 mm à
  5000 pt. Les formats d'écran gardent leurs pixels sur leur tuile.
- Quatre tuiles de papier (A4, A5, portrait et paysage) ; les huit autres dans
  « Autres formats », repliée — ouverte si la page a l'un de ces formats.
  Libellés en français (« Publication Instagram »…) ; identifiants et
  dimensions inchangés (`utils/formatsPage.js`, branché ici).
- Page pilotée par la planche : tout désactivé, une note et le lien « Voir
  Produits » (l'ancien texte renvoyait à un onglet « Planche » disparu).
- Fond : une rangée — pastille, « Sélection en fond », réajuster, retirer.
- `ChampValide` gagne `desactive`.

Les tests du module passent (357) ; `pnpm build:client` passe. Pas encore vu à
l'écran.

Retour du propriétaire sur le lot 6 (« un peu trop cheap ») : chaque tuile de
format porte une MINIATURE à ses proportions (`miniatureFormat`,
`formatsPage.js`) — « A4 » ou « A5 » écrit dedans pour le papier, le logo du
réseau à sa couleur pour Instagram, Facebook et X (`reseau` dans
`FORMATS_PAGE`). Tuiles `haute` (84 px, `CarteProposition`). Instagram et
Facebook viennent de lucide ; le logo de X est un tracé en ligne dans
`FormatPanel.jsx`. Tests du module (359) et `pnpm build:client` passent ; pas
encore vu à l'écran.

**Lot 7 — Modèles** (3 octobre 2026, à vérifier à l'écran).
`TemplateManager.jsx`, `DesignTemplates.jsx`, `ui/TemplateGrid.jsx`,
`ModelesPanel.jsx`.

- L'onglet s'appelle « Modèles » partout ; ses deux vues, « Mes modèles » et
  « Modèles prêts ». Le mot « template » ne se lit plus à l'écran.
- En-tête de « Mes modèles » en deux rangées : recherche, importer,
  « Enregistrer » ; puis les catégories en `Segments` (Tous, Libres, Produits,
  Planches — `custom` s'appelait « Personnalisés »). Les aperçus commencent
  vers 125 px, plus 218.
- **Le menu « ⋯ » existe aussi sur un modèle SANS aperçu** (`TemplateGrid`) :
  il n'était rendu que dans la branche `thumbnail`. C'est une liste à
  libellés : Ouvrir, Modifier…, Dupliquer, Exporter (.json), Supprimer.
- « Modèles prêts » passe sur la même grille, à deux colonnes : plus de badge
  « USINE », de voile bleu, de pied de décompte. Sans aperçu, la carte montre
  l'icône de sa catégorie.
- Les deux fenêtres (enregistrer, modifier), copies l'une de l'autre, sont UNE
  `FenetreModele`, sur les classes du système.
- Messages sans émoji ; `alert()` → toast ; huit `console.log` retirés.
  `filtrerModeles` (`utils/modeles.js`) est branché des deux côtés.
- Inchangé : `applyTemplate`, l'écouteur `request-template-save`, les onglets
  qui restent montés.
- NON CORRIGÉ, hors présentation : ouvrir un modèle prêt ne demande aucune
  confirmation, ne remet pas l'historique à zéro et ne pose ni nom ni
  identifiant de modèle courant — `TemplateManager` fait les trois.

Les tests du module passent (359) ; `pnpm build:client` passe. Pas encore vu à
l'écran.

**Lot 8 — Dessin et fenêtres flottantes** (3 octobre 2026, à vérifier à
l'écran). `DessinPanel.jsx`, `TraceSelectionne.jsx`, `GradientColorPicker.jsx`,
`MasqueTexture.jsx`, `ReglagesMasque.jsx`, `FontSelector.jsx`,
`ReglagesFiche.jsx`, `utils/bruit.js` (libellés seuls).

- **Le pinceau se règle comme un tracé** : noyau (couleur, épaisseur,
  opacité) puis « Forme du trait », repliée — mêmes mots (« Adoucir »,
  « Variation », « Effiler début »), même disposition. ~260 px au lieu de
  ~670. Les champs numériques du pinceau ont disparu avec la disposition en
  bloc (`Reglage` supprimé) : on règle au curseur, comme pour un tracé.
- Sélecteur de couleur : « Uni / Dégradé » et « Linéaire / Radial / Texture »
  sont des `Segments` ; plus d'aplat bleu.
- **Texture, en mots de boutique** — les clés écrites ne changent pas :
  Grain doux, Grain fin, Nuages, Cellules (`value`, `white`, `perlin`,
  `voronoi`) ; « Variante » (`seed`) et son bouton « une autre au hasard » à
  la place de « Graine » et du dé ; « Détail » (`octaves`) ; « Motif :
  cellules pleines, cloisons larges, bords » (`distance`) ; « Coupure »
  (`threshold`). « Douceur » garde son nom : le masque a déjà un « Fondu ».
- Masque : tuiles sans bordure. Polices : `ChampRecherche`.
- « Style du tableau » de la fiche : interrupteurs, `Curseur`, `ChampValide`,
  `TitreGroupe` — c'était le dernier morceau « laissé tel quel ». Mêmes clés ;
  les nombres se valident à Entrée.
- « La variante » se valide aussi à Entrée (`ChampValide`), plus à chaque
  frappe.

Les tests du module passent (359) ; `pnpm build:client` passe. Pas encore vu à
l'écran.

**Champs numériques** (retour du propriétaire, 3 octobre 2026 : « beaucoup
d'inputs mal présentés pour l'incrémentation, et certains sans incrémentation »).
Un seul champ, `ui/ChampValide.jsx`, avec DEUX FLÈCHES À LUI dans le champ, à
droite (±`pas`, Maj : ×10 ; elles ne prennent pas le focus). Il n'y a plus
aucun `<input type="number">` dans le module : `ChampNombre` (X et Y de
l'ombre), `Curseur` (`champ`), taille et lignes max de la fiche y sont passés.
`sansPas` retire les flèches là où le champ est déjà encadré de « − » et
« + » : taille de la police, quantité du tirage. `className` porte la largeur,
sur le cadre. Conséquence : X et Y de l'ombre se valident à Entrée.

**Lot 9 — barre d'icônes, barre fine, barre du haut, « + Ajouter »**
(3 octobre 2026, à vérifier à l'écran). `ToolsSidebar.jsx`, `CanvasArea.jsx`,
`TopToolbar.jsx`, `LabelPage.jsx`, `ReglagesCommuns.jsx`.

- Ordre : Modèles, Page | Produits, Infos | Texte, Images, Formes, Dessin |
  Effets, Calques — un filet entre les groupes. « Médias » est « Images »,
  « Données produit » est « Infos produit ». AUCUN `id` ne change.
- Un point bleu sur l'icône de l'onglet qui porte les réglages de l'élément
  sélectionné, quand un autre onglet est ouvert.
- Le X de l'en-tête est retiré (recliquer l'icône ferme, le chevron replie).
- **« + Ajouter »**, dans l'en-tête de l'onglet quand il montre des réglages :
  les propositions reviennent sans désélectionner. On en sort par « Réglages »
  (au même endroit, ou celui de la barre fine — `reglagesDemandes`), en
  sélectionnant autre chose ou en changeant d'onglet.
- Barre fine : œil, « Réglages » et « Effets » sont trois `boutonBascule` —
  bleu léger quand l'œil masque le cadre, ou quand leur onglet est ouvert
  (`ongletOuvert`, passé par `LabelPage`). Plus d'ambre ni de violet.
- Barre du haut : « Exporter la page » en bleu principal, « Nouveau » en
  secondaire. Deux `console.log` retirés.
- Le « ⚠ » du bandeau commun est une `Note` d'avertissement.

Reste hors lots : « Ondes » du contour à main levée ; le pas d'historique par
cran du glisser des calques ; l'ouverture d'un modèle prêt sans confirmation.

Les tests du module passent (359) ; `pnpm build:client` passe. RIEN des lots 1
à 9 n'a encore été vu à l'écran.
