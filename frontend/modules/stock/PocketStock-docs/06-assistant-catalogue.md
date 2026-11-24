# 06 — L'assistant du catalogue

6 octobre 2026. Première pierre d'un assistant qui exécute des opérations avec
les outils de l'application. Cette étape pose la **mécanique des outils, en
lecture seule**, sur `/stock/produits`.

Deux demandes marchent de bout en bout :

- « affiche-moi les guitares classiques Prodipe entre 0 et 500 € » → la liste
  se filtre, et une ligne dit ce qui est posé et combien de produits ;
- « combien ai-je de produits de la marque Yamaha ? » → un nombre, la liste ne
  bouge pas.

## 1. Le principe : l'assistant règle les filtres, l'écran compte

Le modèle **ne connaît pas le catalogue et ne le reçoit jamais**. Il traduit
la demande en *réglages des filtres de l'écran* — ce que le vendeur ferait à
la main s'il connaissait l'application par cœur — en appelant un outil.

```
vendeur ──demande──▶ POST /api/assistant/catalogue
                        │  Gemini : functionCall(regler_les_filtres, {marque:"prodipe", …})
                        │  Go : valide les arguments, cherche la marque et la catégorie
                        ▼
                     { effet: { action, criteres, libelles, reglages } }
                        │
écran ◀─────────────────┘  pose les critères par SES setters (ProductsPage)
        compte par buildCatalogProductsFilter + totalItems
        écrit la phrase (phraseAssistant)
```

Conséquences, toutes voulues :

- **un seul filtre** : `buildCatalogProductsFilter`. Le Go n'en a pas de copie ;
- **un seul décompte** : le `totalItems` de la liste pour ce filtre
  (`compterProduitsDuFiltre`). « Combien » et la liste filtrée ne peuvent pas
  annoncer deux nombres ;
- **le modèle ne dit aucun nombre** : la phrase est écrite par
  `phraseAssistant` (`frontend/lib/catalog/assistant-catalogue.ts`) à partir
  des critères validés. Une phrase du modèle qui porte un nombre absent de la
  conversation est remplacée (`phraseSansNombreInvente`) ;
- **un seul appel à Gemini** dans le cas courant : un outil qui aboutit CLÔT
  la demande, le modèle n'est pas rappelé.

Ce que cela coûte : le modèle ne voit pas les résultats. Il ne sait pas
répondre à « lequel est le moins cher ? » autrement qu'en triant la liste.

## 2. Le registre d'outils (`backend/assistant/`)

`registre.go` — un outil a un nom, une description, un schéma d'arguments, un
**niveau** et une fonction Go. `boucle.go` — la boucle Gemini générique
(tours, appels, contenu brut du modèle renvoyé tel quel pour sa signature de
pensée). C'est la généralisation de `photos_routes.go`, qui reste inchangé.

| Niveau | État | Règle |
|---|---|---|
| `lecture` | codé | exécuté par la boucle |
| `ecriture` | **prévu, pas codé** | exigera une confirmation du vendeur |
| `envoi` | **prévu, pas codé** | idem |

`Enregistrer` **refuse** tout outil qui n'est pas `lecture`, et la boucle
refuse de l'exécuter même s'il y entrait. Pour ajouter un outil d'écriture :
les quatre étapes sont en tête de `registre.go` (un `Preparer` qui rend un
récapitulatif sans rien écrire, une proposition rendue au renderer, une
seconde route d'exécution sur identifiant à usage unique, puis la levée du
refus). MCP viendra quand plusieurs assistants devront accéder aux mêmes
outils ; pas avant.

Un `Resultat` sépare ce qui **repart chez Google** (`PourModele`, borné par
l'outil) de ce qui va **au renderer** (`Effet`, `Question`, `Texte`).

## 3. Les deux outils du catalogue

`regler_les_filtres` (action `filtrer`) et `compter_produits` (action
`compter`) : même schéma, même fonction (`executerReglages`,
`backend/routes/assistant_catalogue_routes.go`).

Les arguments sont **les manettes de l'écran, une pour une** :

| Argument | Manette de l'écran |
|---|---|
| `texte` | Recherche |
| `publication` : `tous` \| `publies` \| `brouillons` | Tous / Publiés / Non publiés |
| `marque`, `sans_marque` | Marque |
| `categorie`, `sans_categorie` | Catégorie (branche entière) |
| `etat` : `neuf` \| `occasion` \| `location` | Neuf / Occasion / Location |
| `tarif` : `plein_tarif` \| `solde` \| `promotion` | Plein tarif / Soldé / Promotion |
| `sans_image`, `sans_description`, `sans_prix_achat`, `stock_vide` | Les quatre manques |
| `avec_stock_b`, `mis_en_avant` | Avec Stock B, Mis en avant |
| `prix_min`, `prix_max` | **Prix — filtre ajouté le 6 octobre 2026** |
| `tri` : `recents` \| `nom` \| `prix_croissant` \| `prix_decroissant` | Tri de la table |

- **Le fournisseur n'y est pas** : il ne part pas chez Google. Un réglage de
  l'assistant retire le filtre fournisseur de l'écran.
- `lireReglages` décode en structure typée, **champs inconnus refusés**,
  valeurs hors liste ou hors borne refusées — jamais corrigées. Le refus
  revient au modèle (`erreur`) **sans que la base soit lue**.
- « Promotion » lit l'étiquette `sale_state`, comme l'écran — pas la période.
- Le **prix** filtre `price_ttc`, bornes incluses : un article à 520 € en
  promotion à 480 € n'entre pas dans « jusqu'à 500 € ».
- Un réglage **remplace tous les filtres de l'écran** (recherche et statut
  compris). « Annuler » rend ceux d'avant (`avantAssistant`, `ProductsPage`).

## 4. Un nom dit → une marque ou une catégorie

`backend/routes/assistant_resolution.go`. Le modèle transmet les mots du
vendeur ; le Go cherche, en mémoire, sur les noms lus dans la base. Cinq
degrés, du plus strict au plus lâche, arrêt au premier qui trouve :

1. le nom plié (`searchkey.Cle` : casse, accents, œ) ;
2. les mêmes mots que le nom, au pluriel près ;
3. les mêmes mots que le chemin (« guitare classique » → « Guitares ›
   Classiques ») ;
4. chaque mot dit se retrouve dans le chemin (un début de mot suffit), dont un
   dans le nom lui-même ;
5. le degré 4, à une faute de frappe près par mot de quatre lettres ou plus.

Trois issues, jamais une quatrième :

- **une** entité : retenue ;
- **plusieurs au même degré** : une **question**, avec 5 candidates au plus
  (chemin et décompte). L'assistant ne choisit pas. Les candidates sont des
  boutons ; cliquer renvoie le chemin comme demande ;
- **aucune** : « Aucune marque ne correspond à « … ». »

Les entités qui portent des produits passent d'abord ; une marque ou une
catégorie vide est dite vide. Les décomptes viennent de
`computeCatalogCounts`, la fonction de `GET /api/catalog/counts`.

⚠️ Les seuils n'ont été réglés que sur des noms d'essai. Les rejouer sur les
287 marques et 463 catégories réelles : `TestResolutionDesNoms`.

## 5. Ce qui part chez Google

- la demande du vendeur (500 caractères) ;
- les demandes précédentes de la conversation (8 tours) ;
- les réglages posés au tour précédent, **noms de marque et de catégorie
  compris** ;
- quand l'assistant a posé une question, **les 5 noms candidats** qu'elle cite
  (ils sont dans l'historique).

Rien d'autre : ni produit, ni prix, ni stock, ni décompte, ni fournisseur, ni
prix d'achat. La phrase affichée porte le nombre de produits ; elle n'entre
**pas** dans l'historique (`TEXTE_EFFET_HISTORIQUE` : « Filtres réglés. »).

Le contexte, l'historique et les retours d'outil sont annoncés au modèle comme
des données non fiables. Les « réglages précédents » renvoyés par le renderer
repassent par `lireReglages` avant de partir.

Modèle : `gemini-3.1-flash-lite`, celui de l'assistant de fiche (constante
`assistantCatalogueURL`, à part pour pouvoir en changer). Même clé dans le
processus Go, jetons déclarés à `usage.php` (libellé « assistant catalogue »).
Ni la demande ni la réponse ne sont journalisées.

## 6. Bornes

| Borne | Valeur |
|---|---|
| Appels à Gemini par demande | 3 |
| Exécutions d'outil par demande | 2 |
| Demande | 500 caractères |
| Historique | 8 tours |
| Corps de la requête | 16 Kio |
| Candidates d'une question | 5 |
| Un seul `functionCall` par tour | le premier |

## 7. Session et entreprise

Session vérifiée par PocketBase (`AuthRecord`). **L'entreprise est celle que
l'écran affiche, envoyée par le renderer** ; la route vérifie qu'elle existe,
rien de plus — c'est le contrat de `GET /api/catalog/counts`. Aucune route du
dépôt ne lie aujourd'hui une session à une entreprise (`users.company` existe
mais n'est lu nulle part) : l'assistant n'est ni plus ni moins cloisonné que
l'écran qu'il pilote.

## 8. La conversation

Elle vit dans l'état du composant `AssistantCatalogue.tsx` : ni
`localStorage`, ni cache de requêtes. Quitter l'écran l'efface. Les FILTRES
qu'elle a posés, eux, sont ceux de l'écran et survivent comme les autres
(`useEtatPersistant`, identifiants seulement).

## 9. Gardiens

- `backend/assistant/registre_test.go` — refus de tout niveau hors `lecture`.
- `backend/routes/assistant_catalogue_routes_test.go` — faux Gemini : refus
  sans session ; argument hors schéma refusé sans lecture de la base ; marque
  ambiguë → question ; aucune correspondance dite ; un seul appel quand
  l'outil aboutit, rien du catalogue dans la requête ; bornes de tours et
  d'appels ; nombre inventé remplacé ; réglages précédents revalidés.
  `TestLeFiltreDeLEcranCompteCommeLesDecomptes` rejoue contre un vrai
  PocketBase les chaînes de filtre de l'écran (marque, branche) et exige le
  nombre de `par_marque` et de `par_categorie.total`.
- `frontend/lib/catalog/assistant-catalogue.test.ts` — critères → filtre de
  l'écran ; filtre de prix ; phrase ; historique sans nombre ; et **tous les
  champs de `CatalogProductQuery` dans la clé de cache** de
  `useCatalogProducts` (`featured` y manquait : cocher « Mis en avant » seul
  ne relançait pas la lecture — corrigé le même jour).

## 10. Ce qui n'a pas été vérifié dans l'application

Au 6 octobre 2026, seuls les tests et `pnpm build:client` ont tourné.

- **Aucun appel réel à Gemini.** Que `gemini-3.1-flash-lite` choisisse le bon
  outil, remplisse `marque` et `categorie` sans les mélanger avec `texte`, et
  redonne tous les filtres lors d'une suite (« et en dessous de 300 € ? »)
  n'est pas mesuré. Si l'API refuse le schéma des outils, c'est là que ça se
  verra.
- **Aucun essai à l'écran** : le champ, la ligne de réponse, les boutons de
  candidates, « Annuler », le tag de prix.
- **La résolution n'a pas tourné sur les vrais noms** de marques et de
  catégories (§4).
- **`referentielDuCatalogue`** (la lecture réelle des marques et catégories)
  n'a pas de test : les tests de la route passent par un faux référentiel.
- Le temps de réponse, et le coût en jetons d'une demande.

## 11. Suite prévue

- l'emplacement et l'allure du champ (provisoires) ;
- un champ de prix dans le panneau « Filtres » (aujourd'hui seul l'assistant
  pose le prix ; son tag se retire à la main) ;
- les outils d'écriture et d'envoi, avec confirmation (§2) ;
- des outils qui RENDENT des résultats au modèle (client, facture), bornés par
  `PourModele`.
