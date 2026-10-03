# Reprise — UI de l'éditeur, puis l'outil Dessin (deux missions terminées)

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

Aucune mission suivante n'est arrêtée.
