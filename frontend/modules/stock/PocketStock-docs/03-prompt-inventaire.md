# Prompt de passage de main — l'inventaire physique, dernier écran sur AppPos

**Écrit le 19 août 2026**, à la fin de la session qui a livré les fronts A à F
de la migration AppStock. À donner tel quel à la session suivante.

---

Tu travailles dans `I:\pockapp`, module `frontend/modules/stock` (PocketApp :
Wails, Go + React/TypeScript, PocketBase embarqué). Lis d'abord `CLAUDE.md` à la
racine, puis le §7 de
[`00-rituel-migration-appstock.md`](00-rituel-migration-appstock.md), qui tient
l'état, et le §6 nonies, qui décrit la couche de mouvement de stock que tu vas
utiliser.

## Le contexte, en une phrase

**Il ne reste qu'un écran qui parle à AppPos**, et c'est le tien :
`frontend/modules/stock/InventoryPageAppPos.tsx`. Tout le reste — catalogue,
caisse, factures, devis, commandes, mouvements de stock — est passé sur
PocketBase entre le 13 et le 19 août 2026.

## Ce qui est déjà fait, et que tu ne dois pas refaire

**L'inventaire ÉCRIT déjà dans PocketBase** (front D, §6 nonies du rituel) :

- `lib/inventory/useInventorySession.ts` appelle `setCountedStock`
  (`lib/queries/stock-adjust.ts`), qui pose le stock compté **et** journalise
  l'événement — un seul chemin, un seul journal ;
- `lib/inventory/inventory-pocketbase.ts` porte les sessions et les entrées,
  dans PocketBase depuis toujours : **196 sessions et 2465 entrées** en base
  (mesuré le 19 août 2026) ;
- `countAndAdjustProduct` reçoit sa fonction d'écriture **en paramètre**
  (`applyStock`) : c'est ce point d'injection qui a permis de changer de base en
  une ligne. Ne le supprime pas, il vaut mieux que ce qu'il coûte.

**Ce qui reste sur AppPos, et c'est tout :** la LECTURE du catalogue.

| Ligne | Ce qu'elle fait |
|---|---|
| `InventoryPageAppPos.tsx:166` | `appPosApi.getProducts()` — le snapshot d'ouverture de session |
| `InventoryPageAppPos.tsx:312` | `appPosApi.getProducts()` — un second chargement |
| `InventoryPageAppPos.tsx:325` | `getAppPosImageUrl(rawPath)` — les vignettes |
| `InventoryPageAppPos.tsx:437` | `useAppPosCategoriesWithCounts()` — le filtre par catégorie |
| `useInventorySession.ts:10` | `getAppPosCategories`, `getAppPosProducts` |

## Ta mission

**Faire lire l'inventaire dans PocketBase**, et supprimer le dernier import de
`@/lib/apppos` du module `stock`.

Ce que tu as à ta disposition, déjà écrit et éprouvé :

- **`useCatalogProducts`** (`lib/queries/catalog-products.ts`) — paginé côté
  serveur, filtres marque / catégorie / fournisseur, recherche ;
- **`useCatalogProductSearch`** — recherche avec anti-rebond, 25 résultats ;
- **`toStockRow`** (`lib/queries/catalog-rows.ts`) — du produit PocketBase à la
  ligne affichée, **image résolue par `pb.files.getUrl`** ;
- **`useCategories`** (`lib/queries/categories.ts`) et
  `useProductIdsByCategory` (`lib/queries/products.ts`) pour les compteurs.

## Le piège principal, celui qui décide de la difficulté

**Une session d'inventaire ouvre un SNAPSHOT du catalogue** — une entrée par
produit, avec son `stock_theorique` figé. Aujourd'hui ce snapshot vient
d'AppPos, et `entry.product_id` porte donc un **identifiant NeDB**.

Deux conséquences que tu dois trancher avant d'écrire :

1. **Les 2465 entrées existantes portent des identifiants NeDB.** Si tu changes
   la source du snapshot sans y penser, les anciennes sessions deviennent
   illisibles. `applyStockMovements` sait résoudre les deux formes — il
   interroge `id` ET `legacy_id` — mais l'affichage, lui, doit retrouver le
   produit pour montrer son nom et son image ;
2. **`getFullList` sur 2999 produits n'est pas `getList(1, 50)`.** Un snapshot
   doit prendre tout le catalogue. C'est le défaut qui a déjà donné « 0 produit »
   sur 205 marques (§6 quater du rituel) : mesure ce que tu ramènes.

## Ce qui est décidé, et ne se rediscute pas

- **on n'écrit jamais dans AppPos** (`CLAUDE.md`) ;
- **pas de double écriture** — une entité a une seule base de destination ;
- **la source est explicite au point d'appel, et typée** — ni drapeau `.env`,
  ni chaîne optionnelle ;
- **les composants convergent** : une session qui ajoute un composant sans en
  retirer un a échoué. Le module a perdu 12 fichiers en six jours.

## Les pièges déjà payés — ne pas les rejouer

- **`pocketbase-types.ts` ment** sur `brands`, `categories` et `suppliers`, et
  `pnpm typegen` reste interdit. Les formes réelles sont dans
  `lib/queries/catalog-shapes.ts` et `catalog-products.ts` ;
- **`error.message` de PocketBase ne dit rien** — utilise
  `lib/queries/pb-error.ts` ;
- **un champ vidé part en chaîne vide, jamais `undefined`** ;
- **le fichier fait 3230 lignes** et n'a jamais été lu autrement qu'en imports.
  Ne le réécris pas : trouve les cinq points d'entrée listés plus haut, et
  suis-les.

## Contraintes de travail

- Français partout.
- `npx tsc -b`, `pnpm biome check --write` **sur les fichiers que tu touches**
  (Biome reformate tout un module si tu vises un répertoire — le diff devient
  illisible), `pnpm test`.
- **Écris un test pour toute règle qui n'a pas d'autre gardien.**
  `frontend/modules/stock/single-source.test.ts` garde déjà « une seule
  provenance » écran par écran : ajoute-toi à sa liste plutôt que d'en créer une
  autre.
- **Distingue ce qui est lu dans le code — chemin et ligne — de ce qui est
  rapporté.** Mesure avant d'affirmer.
- **Vérifie dans l'application ou dans la base**, pas en relisant ton code. La
  base est lisible en SQLite : `%LOCALAPPDATA%\PocketReact\pb_data\data.db`, en
  `-readonly`. C'est ainsi qu'ont été trouvés la plupart des défauts des
  sessions précédentes.
- **Perdre le fil vaut mieux que deviner** : le dire.

## Avant de commencer

Écris un résumé bref — ce que tu as lu, l'état que tu constates, ce que tu
comptes faire et dans quel ordre — puis **arrête-toi**. Ne modifie rien avant
validation.

## Rituel de fin

Mettre à jour le §7 de `00-rituel-migration-appstock.md` et le tableau du §4 de
`02-plan-source-unique.md`. Les constats nouveaux vont dans une section datée du
rituel ; les décisions vont dans `docs/DECISIONS.md`. **On ne réécrit pas le
§2** : c'est une mesure datée.
