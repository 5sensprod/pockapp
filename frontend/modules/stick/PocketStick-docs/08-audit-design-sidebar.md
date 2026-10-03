# Prompt — audit et refonte visuelle de la barre latérale

## Pourquoi ce prompt

Constat du propriétaire, le 3 octobre 2026, après la refonte de l'interface et
la modernisation des réglages : les panneaux de la barre latérale sont « peu
harmonieux », « on dirait en vrac », « parfois vieillots ».

Ce qui a été refait (réglages d'un élément sélectionné, onglet Effets) suit un
petit système commun — voir [`06-reprise-ui.md`](06-reprise-ui.md). Ce qui ne
l'a PAS été : les panneaux qui PROPOSENT (Templates, Page, propositions de
texte, Médias, Assets, pinceau de l'onglet Dessin, Calques, Produits, Données
produit). Deux générations d'interface cohabitent dans la même barre.

Le prompt ci-dessous est à donner tel quel à un agent de design. Il produit un
audit et une proposition ; il ne code rien.

## Le prompt

```
Tu es un designer d'interface senior, spécialiste des outils de création
(Figma, Canva, Framer, Affinity, Linear pour la rigueur). Ta mission : AUDITER
et REPENSER la barre latérale d'un éditeur d'affiches et d'étiquettes, pour
qu'elle soit harmonieuse, lisible et actuelle. Tu ne modifies AUCUN fichier, tu
ne lances ni serveur, ni build, ni navigateur, ni `pnpm format`. Tu rends un
rapport en français, précis, exploitable par un développeur.

═══ LE PRODUIT ═══
PocketStick, module d'un logiciel de caisse (dépôt I:\pockapp, React +
Tailwind + Konva + zustand ; fichiers .jsx/.js non typés dans
`frontend/modules/stick/labels/`). L'utilisateur est un vendeur en boutique
d'instruments de musique : il fabrique des affiches de prix et des planches
d'étiquettes, entre deux clients, sans formation de graphiste. Il veut aller
vite et ne pas chercher.

L'écran : une barre du haut (titre du document, Exporter), une BARRE LATÉRALE
gauche de 400 px (64 px d'icônes à libellés + 335 px de panneau, ~311 px
utiles), une barre fine de 44 px au-dessus de la page (œil, Réglages, Effets,
quelques options rapides, zoom), la page au centre, une bande de pages en bas.

La barre latérale a dix onglets : Modèles (templates), Page (taille et fond),
Texte, Médias, Assets (formes, QR), Dessin, Effets, Calques, Produits (le
tirage), Données (éléments liés à la fiche produit). Principe : sélectionner
un élément affiche l'onglet de son type, avec ses RÉGLAGES à la place des
PROPOSITIONS de l'onglet ; désélectionner ramène les propositions.

═══ CE QUE TU DOIS LIRE D'ABORD ═══
1. `frontend/modules/stick/PocketStick-docs/06-reprise-ui.md` EN ENTIER : le
   principe, le système de composants, les règles visuelles et les règles
   techniques à ne pas défaire.
2. `I:\pockapp\CLAUDE.md`, le paragraphe PocketStick.
3. Le système commun : `labels/components/ui/` (`styles.js`, `Section.jsx`,
   `Interrupteur.jsx`, `Segments.jsx`, `Curseur.jsx`, `ChampValide.jsx`,
   `ChampNombre.jsx`, `Pave2D.jsx`, `PastilleCouleur.jsx`).
4. La barre : `labels/components/ToolsSidebar.jsx`, `templates/OngletsPanneau.jsx`.
5. TOUS les panneaux de `labels/components/templates/`, en entier :
   - déjà sur le système commun : `ReglagesPanel.jsx`, `ReglagesCommuns.jsx`,
     `ReglagesTexte.jsx`, `ReglagesImage.jsx`, `ReglagesCodes.jsx`,
     `ReglagesFiche.jsx`, `TraceSelectionne.jsx`, `EffectsTemplates.jsx`,
     `BlocOmbre.jsx`, `BibliothequeCatalogue.jsx` ;
   - PAS ENCORE : `ModelesPanel.jsx`, `TemplateManager.jsx`,
     `DesignTemplates.jsx`, `PagePanel.jsx`, `FormatPanel.jsx`,
     `FondPanel.jsx`, `TextTemplates.jsx`, `MediasPanel.jsx`,
     `UploadTemplate.jsx`, `AssetsPanel.jsx`, `ShapeTemplates.jsx`,
     `QRCodeTemplates.jsx`, `DessinPanel.jsx`, `LayersPanel.jsx`,
     `SheetPanel.jsx`, `TiragePanel.jsx`, `DonneesProduitPanel.jsx`.
6. Les fenêtres flottantes : `GradientColorPicker.jsx`, `FontSelector.jsx`,
   `MasqueTexture.jsx`, `ReglagesMasque.jsx`, `ReglagesContourStylise.jsx`,
   `LiaisonProduit.jsx`.
7. Autour : `CanvasArea.jsx` (barre fine), `ReglagesRapides.jsx`,
   `EtiquetteSelection.jsx` (barre flottante sous l'élément), `TopToolbar.jsx`,
   `BandeTirage.jsx`.

Tu ne peux pas voir l'écran. Reconstitue l'aspect à partir des classes
Tailwind, DIS quand une mesure est estimée, et liste en fin de rapport les
captures d'écran que le propriétaire devrait te fournir pour lever tes doutes.

═══ LE CONSTAT DU PROPRIÉTAIRE ═══
« Les panneaux sont peu harmonieux, on dirait en vrac, parfois vieillots. »
Avant lui, sur le seul panneau Texte : « les infos importantes sont noyées »,
« du texte inutile », « on est obligé d'utiliser l'ascenseur ».

═══ CE QUE J'ATTENDS ═══

A. INVENTAIRE VISUEL, panneau par panneau (les dix onglets, dans leurs deux
   états quand ils en ont deux : propositions / réglages). Pour chacun, avec
   `chemin:ligne` : structure (titres, cartes, grilles, listes), hauteur
   estimée déplié sur un écran de 768 px, et tout ce qui sort du système :
   tailles et graisses de texte, rayons, hauteurs de contrôle, bordures,
   fonds, ombres, espacements, couleurs d'accent (bleu, violet, orange,
   jaune, vert, sarcelle…), émojis dans les titres ou les commentaires
   visibles, encadrés d'information colorés, boutons pleins contre boutons
   discrets, `console.log` laissés, textes d'aide bavards.

B. DIAGNOSTIC D'HARMONIE, transversal. Dresse le tableau des VARIANTES
   réellement présentes pour chaque brique — et dis combien il y en a :
   - titre de panneau, titre de section, sous-titre, texte d'aide ;
   - carte de proposition (ex. « Titre Principal », « Prix », formes, QR) ;
   - vignette d'image (bibliothèque du poste, PocketStock, templates, galerie
     produit) : taille, rayon, bordure, état survolé, état sélectionné ;
   - bouton principal, secondaire, discret, destructif, à icône ;
   - champ texte, champ nombre, liste déroulante, recherche ;
   - onglets internes ; listes (calques, produits du tirage) ; états vides ;
     états de chargement et d'erreur ; messages d'avertissement.
   Pour chaque brique : la variante à garder, et pourquoi.
   Puis ce qui fait « vieillot » précisément (nomme les motifs : bordures
   partout, fonds gris en carte, gros rayons mélangés, boutons pleins
   saturés, encadrés d'info colorés, émojis, ombres portées lourdes,
   majuscules, densité irrégulière…), avec les lignes.

C. HIÉRARCHIE ET CONTENU. Pour chaque onglet : ce que le vendeur vient y
   chercher en premier, et si c'est bien ce qu'il voit en premier. Ce qui est
   redondant entre onglets (ex. la photo du produit dans Médias et dans
   Données ; les réglages d'un tracé et ceux du pinceau). Les textes à
   supprimer ou raccourcir, MOT POUR MOT, avec leur remplacement. Les
   libellés en jargon (« Assets », « Templates », « Graine », « Octaves »…) :
   propose des mots de boutique.

D. LE SYSTÈME. Étends le petit système existant (`ui/styles.js` et les
   composants de `ui/`) pour couvrir les panneaux de PROPOSITIONS. Donne :
   - l'échelle typographique (3 à 4 tailles, pas plus), l'échelle
     d'espacement, les rayons, les hauteurs, les bordures et les fonds, en
     clair ET en sombre ;
   - la palette : un accent bleu, l'orange RÉSERVÉ à ce qui vient de la fiche
     produit (c'est une convention du produit, à garder), ambre pour
     l'avertissement, rouge pour le destructif. Dis quoi faire du violet des
     designs d'usine et du bouton « Effets » ;
   - les composants à AJOUTER, nommés en français comme les autres, avec leurs
     props et leurs classes Tailwind : par exemple `ui/CarteProposition.jsx`,
     `ui/GrilleVignettes.jsx`, `ui/Vignette.jsx`, `ui/ChampRecherche.jsx`,
     `ui/EtatVide.jsx`, `ui/Bouton.jsx`, `ui/LigneListe.jsx`,
     `ui/TitreGroupe.jsx`. Peu de composants, très réutilisés.

E. LES PANNEAUX REDESSINÉS. Pour CHACUN des dix onglets, une maquette ASCII à
   l'échelle (311 px utiles) de l'état « propositions », avec la hauteur de
   chaque bloc et ce qui tient sans ascenseur sur 768 px. Montre comment le
   même onglet passe de « propositions » à « réglages » sans rupture visuelle
   (mêmes marges, même rythme). Traite à part les trois cas difficiles :
   Calques (liste longue, glisser-déposer, verrou, œil), Produits (tirage :
   liste, quantités, page ou planche), Données produit (cartes Texte, Médias,
   Éditorial + liste des éléments liés).

F. LA BARRE D'ICÔNES. Dix onglets, c'est beaucoup : l'ordre est-il le bon ?
   Faut-il des groupes (créer / régler / organiser / produit) séparés par un
   filet ? Les libellés courts sont-ils les bons ? L'onglet actif, l'onglet
   « produit » (orange), le survol. Ne propose PAS de supprimer un onglet sans
   dire où va ce qu'il contenait.

G. PLAN EN LOTS, du moins risqué au plus visible, chacun vérifiable à l'écran
   par le propriétaire en cinq minutes : fichiers touchés, effort, ce qui
   peut casser. Commence par un lot « socle » (composants et classes) qui ne
   change rien à l'écran, puis un panneau à la fois, le plus vu d'abord.

H. CINQ QUESTIONS AU PLUS pour le propriétaire, chacune avec ta
   recommandation et ce qu'elle change concrètement.

═══ CONTRAINTES (à vérifier dans le code, pas à supposer) ═══
- C'est une refonte de PRÉSENTATION : aucune clé d'élément, aucune borne,
  aucun pas ne change ; le rendu du canvas et des exports ne bouge pas.
- Aucun nouveau paquet npm sans le signaler explicitement et le justifier.
- Tout reste en .jsx / .js ; ne propose pas de passer à TypeScript ni de
  lancer `pnpm format` (le module n'est pas formaté par Biome).
- La logique testable va dans des modules purs (`utils/`), testés par Vitest.
- Règles techniques de `06-reprise-ui.md`, à ne pas défaire : un réglage qui
  se glisse est un `input[type=range]` ou porte `data-geste-reglage` ; un
  réglage passe par `useMajSelection` (toute la sélection, un pas
  d'historique) ; un tracé passe par `redessiner`, une forme libre par
  `relisser` ; les fenêtres flottantes passent par `useFlottant` ;
  `OngletsPanneau` garde tous ses onglets montés ; l'onglet suit la
  sélection, sauf depuis Calques, Effets et Données produit.
- AUCUNE COULEUR ni Dupliquer/Supprimer dans la barre fine du haut : décisions
  du propriétaire.
- L'orange a un sens (données de la fiche produit) : il ne devient pas
  décoratif.
- Les templates et la bibliothèque d'images sont locaux au poste
  (IndexedDB) ; les images PocketStock viennent de PocketBase.

═══ MÉTHODE ═══
- Distingue toujours ce que tu as LU (`chemin:ligne`) de ce que tu proposes
  ou estimes.
- Pas de généralités de design : chaque constat cite une ligne, chaque
  proposition donne des classes, des tailles, une maquette.
- Si un point n'a pas pu être vérifié, dis-le.
- Termine par la liste des fichiers lus en entier, lus partiellement, non lus.
```

## Après l'audit

Le rapport se discute avec le propriétaire avant tout code : il valide le
système (D), l'ordre des lots (G) et répond aux questions (H). Chaque lot se
vérifie à l'écran, puis `pnpm build:client`, puis cette doc et
`06-reprise-ui.md` sont mises à jour.
