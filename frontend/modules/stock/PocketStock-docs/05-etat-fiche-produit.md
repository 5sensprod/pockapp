# La fiche produit et le studio de rédaction — état au 4 septembre 2026

Écrit pour qu'un autre agent puisse **reprendre l'interface dans une autre
logique** sans avoir à relire tout l'historique. Ce document dit ce qui existe,
pourquoi c'est ainsi, et ce qui est fragile. Il ne prescrit aucune direction.

---

## 1. Les écrans concernés

| Rôle | Fichier |
|---|---|
| Page produit | `frontend/modules/stock/ProductDetailPage.tsx` |
| État, écriture, images | `frontend/modules/stock/components/detail/useProductDetailEditor.ts` |
| Colonne de droite | `frontend/modules/stock/components/detail/ProductSitePanel.tsx` |
| Cartes de gauche | `ProductIdentityCard`, `ProductLinksCard`, `ProductPricingCard`, `ProductStockCard` |
| Contenu éditorial | `frontend/modules/stock/components/detail/ProductDescriptionCard.tsx` |
| Images | `frontend/modules/stock/components/detail/ProductMediaPanel.tsx` → `frontend/components/ui/gallery-field.tsx` |
| **Studio de rédaction** | `frontend/modules/site/components/online-catalog/ProductSheetStudio.tsx` |
| Découpage en blocs | `frontend/modules/site/lib/sheet-blocks.ts` (+ `.test.ts`) |
| Pièces jointes IA | `frontend/modules/site/lib/sheet-files.ts` |
| Routes IA | `backend/routes/gemini_routes.go` |

La page est organisée en **cartes éditables par section**
(`EditableDetailCard`) : `identity`, `pricing`, `stock`, `content`, `visuals`.
Une seule est ouverte à la fois (`activeSection`), un `pointerdown` en dehors la
referme.

---

## 2. Les règles qui ne sont pas négociables

Elles ne viennent pas d'un goût d'interface : chacune a coûté un incident.

1. **Un seul chemin d'écriture.** Tout passe par `submit` de
   `useProductDetailEditor` : c'est là que vivent l'ajustement de stock
   (`/api/stock/adjust`, transaction serveur), la réparation du slug, et la
   proposition de synchronisation vers le site. Le studio n'écrit PAS
   lui-même : il pose ses valeurs dans le formulaire, puis appelle `saveNow()`.
   Toute nouvelle interface doit faire pareil.
2. **`saveNow()` rend un booléen.** `handleSubmit` rend `void` ; sans ce
   retour, on ne distingue pas un enregistrement d'un refus PocketBase, et on
   referme une modale sur un travail perdu.
3. **La description est UNE chaîne HTML**, en base comme au contrat d'export.
   `sheet-blocks.ts` la découpe pour l'édition et la recompose — un test
   garantit l'aller-retour **à l'octet près**, sinon le checksum d'export
   réécrirait la page publique pour rien.
4. **L'image principale se DÉSIGNE, elle ne s'écrase pas.** Tout fichier entre
   par `gallery` ; promouvoir un fichier déjà en base passe par
   `POST /api/catalog/products/:id/promote-image` (l'API REST refuse un nom venu
   d'un autre champ). Une image pas encore envoyée ne peut être que *désignée*,
   et sa promotion part après l'enregistrement, son nom étant déduit du rang.
5. **La liste `gallery` s'envoie ENTIÈRE** : une entrée omise supprime le
   fichier, sans confirmation.
6. **Radix : `role="alertdialog"` n'est pas `role="dialog"`.** Le
   `closeOutside` de `ProductDetailPage` doit exclure les deux — l'oubli rendait
   la suppression de l'unique image impossible, sans message.

---

## 3. Le studio de rédaction (`ProductSheetStudio`)

Remplace un parcours de **sept gestes** (carte → assistant → format → source →
générer → valider → appliquer → enregistrer) par **trois** : ouvrir, cliquer une
suggestion, enregistrer.

**Deux règles tiennent l'assistant** :

- **les suggestions décident** — chacune porte `webSearch` et
  `descriptionFormat`, un clic lance la génération ;
- **le texte libre instruit** — il part dans `instructions`. Déduire « courte »
  ou « d'après le PDF » de ses mots casserait au premier « pas trop courte » et
  pourrait déclencher une recherche Google non demandée (quota séparé). Seul
  l'ÉTAT sert de repli : fichiers joints → documents, sinon → web.

**L'assistant lit le BROUILLON, pas la base** (4 septembre 2026). Désignation,
référence, code-barres, marque, catégories, prix et stock viennent de
`form.watch()`, donc **avant tout enregistrement**. C'est la seule forme
cohérente : « Enregistrer la fiche » écrit le formulaire entier (`saveNow`), ce
que l'assistant lit est donc exactement ce qui partira en base. La marque et les
catégories sont résolues en NOMS par l'appelant — le formulaire porte des
identifiants PocketBase, qui ne disent rien à un modèle de langue. `product` ne
sert plus qu'à l'identité de la fiche et à ses images déjà en base.

**Structure** : à gauche l'aperçu (images, titre éditable + IA, prix, badge
stock, marque, catégories, SKU), puis les blocs de description — titre
modifiable, éditeur HTML, régénérer, supprimer, ajouter. À droite l'assistant.

**Dette assumée** : régénérer une section **coûte une génération complète**.
`/api/ai/product-sheet` ne sait produire qu'une fiche entière ; on n'en retient
que la section visée (`blocCorrespondant`). Une route dédiée serait le bon
geste.

---

## 4. Ce que sait le serveur IA

`backend/routes/gemini_routes.go` — deux routes authentifiées,
`/api/ai/product-title` et `/api/ai/product-sheet`. La clé reste dans le
processus Go (secret chiffré `gemini_api_key`, repli `GEMINI_API_KEY`).

- Le titre et les documents utilisent `gemini-3.1-flash-lite` ; **le mode Web
  utilise `gemini-2.5-flash-lite`**, seul à conserver un quota gratuit avec
  Google Search. Ce modèle **n'accepte pas `ResponseSchema` avec l'outil** :
  le JSON est exigé par le prompt et validé après réception, d'où un plafond de
  sortie plus large (2400 jetons contre 1400) — à 1400 le JSON se faisait
  couper et l'extraction rendait « fiche non structurée ».
- **Web et documents s'excluent** dans une même requête (garde serveur).
- Le HTML produit a une forme fixe (`renderProductSheetDescription`) : deux
  `<p>`, puis `<h2>Points forts</h2><ul>`, `<h2>Caractéristiques
  techniques</h2><table>`, `<h2>Conseils d’utilisation</h2>`. C'est ce qui rend
  le découpage aux `<h2>` fiable.
- **Le code-barres est une piste de recherche**, mais seulement s'il en est
  une : `codeBarresMondial` ne retient que 8, 12, 13 ou 14 chiffres (EAN/UPC/
  GTIN). Le champ `barcode` porte aussi des codes internes, qui ne désignent
  rien dehors. Un GTIN passe **en tête** de `preferred_web_query`.
- **`contexteProduitMaigre`** : ni marque, ni catégorie, ni GTIN, ni source. Le
  message d'échec dit alors ce qui manque au lieu de « réessaie dans un
  instant » — la même demande échouerait autant de fois qu'on la relance. La
  modale l'annonce AVANT le clic (encart ambre).
- Les échecs remontent un `detail` **affiché** (motif + `finishReason`
  traduit) : sur un poste client, personne ne lit les journaux de l'exécutable.
- **`/api/ai/product-images`** (4 septembre 2026) rend des **adresses** de
  photos du produit, jamais des octets : ni téléchargement, ni entrée dans la
  galerie, ni question de droits tranchée à la place du commerçant. Une URL
  d'image est ce qu'un modèle invente le mieux et le serveur ne les vérifie
  pas — **c'est le navigateur qui tranche** : la vignette qui ne charge pas est
  retirée de l'écran (`onError`). Il revient donc plus de propositions qu'il
  n'en reste affichées, et c'est normal. Filtre serveur : `https` seulement
  (le `http` serait bloqué comme contenu mixte), hôte réel, pas de `data:`,
  six au maximum. Gardien : `TestURLImageRetenue`.

---

## 5. Quitter sans enregistrer

Deux interceptions seulement (`ProductDetailPage`) : `useBlocker` du routeur —
qui couvre le menu **et** le bouton « Retour », lequel appelle `navigate()` —
et `beforeunload` pour la fermeture de fenêtre (texte imposé par le navigateur).
Intercepter « Retour » en plus rouvrait la question juste après y avoir
répondu.

⚠️ **Deux pièges mesurés dans `useBlocker`** (v1.76) :

- il retire son abonnement dès que `condition` repasse à `false`, **mais son
  `resolver` reste `blocked`**. « Enregistrer et quitter » faisait donc tomber
  la condition avant `proceed()` : navigation perdue, boîte restée à l'écran sur
  une fiche pourtant enregistrée. D'où le drapeau `sortieAmorcee`, qui tient la
  condition vraie pendant l'enregistrement ;
- la boîte propose **Rester / Quitter sans enregistrer / Enregistrer et
  quitter** ; la dernière ne quitte que si `saveNow()` a rendu `true`.

---

## 6. Ce qui reste ouvert

| Sujet | État |
|---|---|
| Champs séparés pour les blocs (ou tables) | **Décidé pour après la release.** Le découpage HTML est un choix de vitesse ; il vit dans un seul fichier, `sheet-blocks.ts`, pour n'avoir qu'un endroit à retirer. Coût du passage : migration PocketBase, contrat d'export, `products-sync.php`, `catalog.php`, rendu du site |
| Route IA « une seule section » | Pas écrite. Voir §3 |
| `ProductOnlineEditorialDialog.tsx` | **Supprimé le 4 septembre 2026** — il n'avait plus aucun appelant depuis que le studio a pris sa place. `tsc -b --force` et les 397 tests passent sans lui |
| `EditorialDialog` / `ProductSheetAssistant` | Toujours utilisés par `/site/catalogue`. Le studio ne les remplace QUE sur la fiche produit — deux interfaces coexistent, et **elles n'écrivent pas pareil** : `useUpdateCatalogEditorial` écrit `name` et `description` en direct dans PocketBase, sans l'ajustement de stock ni la proposition de synchronisation. Ce n'est pas dangereux (ce chemin ne touche ni `stock` ni `gallery`), mais aucun gardien ne le couvre |
| Slug réparé des deux côtés | **Fait le 4 septembre 2026.** `/site/catalogue` ne réparait pas le slug : un produit né en caisse avant le 20 août 2026 retouché là puis exporté partait avec une adresse vide et sa page rendait « Produit introuvable ». `frontend/modules/site/lib/slug-editorial.ts` (+ `.test.ts`) ne comble QUE le vide — une adresse en ligne ne se retouche jamais |
| Vérification à l'écran | Le studio, le garde-fou de sortie et la galerie n'ont **pas** été ouverts dans un navigateur par l'agent : `tsc -b --force`, 397 tests front et `go test ./backend/...` passent, c'est tout ce qui est prouvé |

---

## 7. Les gardiens à ne pas casser

- `frontend/modules/site/lib/sheet-blocks.test.ts` — aller-retour à l'identique.
- `backend/routes/gemini_routes_test.go` — GTIN, contexte maigre, plafond du
  mode Web, exclusion web/documents.
- `frontend/lib/queries/gallery-order.test.ts`, `image-upload.test.ts`,
  `backend/routes/product_image_test.go` — l'ordre et la promotion des images.
- `frontend/modules/stock/single-source.test.ts` — une seule provenance.
- `frontend/lib/queries/catalog-fields.test.ts` — les champs exportés.
