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
Non fait : `pnpm build:client`. Les tests du module passent (270).

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
- **Tout curseur est un `input[type=range]`** : le canvas masque le cadre
  tant qu'un curseur de la page est tenu.

Non fait : `pnpm build:client` ; cohérences de l'audit (sélection multiple
qui ne règle que le premier élément — annoncée dans le panneau, pas
corrigée ; alignement du texte qui fixe une largeur — annoncé ; les deux
« Ondulation » ; « Appliquer l'ombre à tous » qui fait un pas d'historique
par élément). Vérifié à l'écran par le propriétaire, étape par étape ; aucun
test de rendu de composant n'existe.
