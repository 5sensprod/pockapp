# Prompt de passage de main — étape 3 : la couche d'accès unique

**Écrit le 13 août 2026**, à la fin de la session qui a livré les étapes 1 et 2.
À donner tel quel à la session suivante.

---

Tu travailles dans `I:\pockapp`, module `frontend/modules/stock` (PocketApp :
Wails, Go + React/TypeScript, PocketBase embarqué). Lis d'abord `CLAUDE.md` à la
racine, puis
[`00-rituel-migration-appstock.md`](00-rituel-migration-appstock.md) — son §7
tient l'état, son §6 quater dit ce qui a été branché et vérifié, son §2 est une
mesure datée qu'on ne réécrit pas.

## Le contexte

**Les quatre entités du catalogue sont branchées sur PocketBase**, en lecture et
en écriture, vérifiées dans l'application avec AppPos éteint : `/stock/produits`,
`/stock/marques`, `/stock/categories`, `/stock/fournisseurs`.

**AppPos sort de la logique à la prochaine release** (`docs/DECISIONS.md`,
2026-08-13). L'écriture dans PocketBase est ouverte, la caisse et l'inventaire se
raccordent en dernier, les divergences NeDB ↔ PocketBase sont acceptées d'ici là.

## Ta mission — étape 3

**Faire disparaître les chemins d'accès mêlés.** Trois fichiers portent encore
les deux bases à la fois, et c'est tout ce qui reste entre l'état actuel et une
couche unique :

1. **`frontend/lib/queries/products.ts:179` — `useUpdateProductUniversal`.**
   Il route entre AppPos et PocketBase sur `source === 'apppos_products'`, un
   paramètre **optionnel** : l'oublier écrit dans l'autre base sans erreur.
   Son seul appelant restant est `components/ProductDialog.tsx:81`.
   `CLAUDE.md` demande de le **remplacer**, pas de le contourner.
2. **`components/ProductTable.tsx`.** Il affiche des données de forme AppPos
   venues de `useStockModule`, mais lit `useBrands`, `useCategories`,
   `useSuppliers` et `useDeleteProduct` — quatre requêtes PocketBase — et pointe
   `APPPOS_ASSETS_BASE_URL` pour les images. Un fichier, trois provenances.
3. **`useStockModule.ts`.** Il importe `@/lib/apppos` **et** `usePocketBase`.
   `selectedCategory` et `selectedSupplier` y sont typés avec des types
   `pocketbase-types.ts` alors qu'ils portent des données AppPos — le même
   défaut que `selectedBrand`, corrigé le 13 août, avec la note laissée sur
   place.

**L'ordre que je recommande, sans te l'imposer :** commencer par le point 1, qui
est petit et dont la disparition rend le reste plus lisible ; puis 3, qui décide
de ce que la table reçoit ; puis 2, qui en découle.

## Ce qui est décidé, et ne se rediscute pas

Six blocs du 13 août 2026 dans `docs/DECISIONS.md`. Les quatre qui te concernent :

- **source explicite, par entité** — typée, lisible au point d'appel ; ni
  drapeau `.env`, ni réglage en base ;
- **les composants convergent** — chaque paire traitée est réduite à UN
  composant dans la session qui la traite. **Une session qui ajoute un composant
  sans en retirer un a échoué**, même si son écran fonctionne ;
- **pas de double écriture** — une entité a une seule base de destination à un
  instant donné ;
- **`legacy_id` est la clé stable**, générée par la couche (`pa_…`) pour toute
  entité créée dans PocketApp. Les identifiants PocketBase et NeDB ne sont pas
  interchangeables : c'est le pont.

## Les pièges déjà payés — ne pas les rejouer

- **Un filtre AppPos ne peut pas manger des identifiants PocketBase.**
  `useStockModule` compare `p.brand` à `selectedBrand.id` ; brancher le panneau
  de filtre sur PocketBase donnerait **zéro produit, sans erreur**. Tant que les
  produits affichés viennent d'AppPos, leurs filtres doivent venir d'AppPos.
- **`getList(1, 50)` est une page, pas une liste.** C'est ce qui a affiché « 0
  produit » sur 205 marques. Si tu comptes ou agrèges, prends `getFullList` avec
  `fields` restreint, ou une requête de comptage.
- **`pocketbase-types.ts` ment sur `brands`, `categories` et `suppliers`**, et
  `pnpm typegen` reste interdit. La forme réelle est dans
  `frontend/lib/queries/catalog-shapes.ts`. **Ne le « corrige » pas** : ses types
  portent aussi des données AppPos, que la caisse consomme.
- **`error.message` de PocketBase ne dit rien.** Utilise
  `frontend/lib/queries/pb-error.ts`.
- **Un champ vidé part en chaîne vide, jamais `undefined`** : `undefined`
  disparaît du corps JSON et l'ancienne valeur reste en base.

## Ce que tu ne dois pas faire

- **Ne modifie pas AppPos.** PocketApp lit AppPos ; l'inverse n'existe pas.
- **Ne lance pas `pnpm typegen`.**
- **Ne touche pas à la caisse** (`modules/cash`, `backend/routes/cash_routes.go`,
  `pos_routes.go`) : elle se raccorde en dernier, et c'est le maillon le moins
  négociable. Un défaut connu y dort — trois champs JSON à `maxSize: 0`, dont
  `cash_movements.meta` sur 160 des 179 mouvements — **latent car rien ne met à
  jour un mouvement existant** ; il est décrit dans
  `backend/migrations/fix_json_max_size.go` et n'est pas de ton périmètre.
- **Ne touche pas aux images** — 4665 fichiers, 1,7 Go, session dédiée.
- **Ne change pas le slug** : figé au premier envoi, le serveur en est gardien.
- Toute évolution du schéma passe par une **nouvelle migration** inscrite dans
  `RunMigrations` — en modifier une existante ne change aucune base installée.

## Contraintes de travail

- Français partout.
- `npx tsc -b` (pas `tsc --noEmit -p tsconfig.json`), `pnpm biome check --write`
  sur ce que tu touches, `pnpm test`. Deux avertissements Biome préexistent dans
  `InventoryPageAppPos.tsx` : ils ne sont pas de toi, ne les corrige pas en
  passant.
- **Écris un test pour toute règle qui n'a pas d'autre gardien.**
- **Distingue ce qui est lu dans le code** — chemin et ligne — **de ce qui est
  rapporté.** Mesure avant d'affirmer, et dis sur quelle base.
- **Vérifie dans l'application ou la base, pas en relisant ton code.** La base
  est lisible en SQLite : `%LOCALAPPDATA%\PocketReact\pb_data\data.db`, en
  `-readonly`. C'est ainsi qu'ont été trouvés la plupart des défauts de la
  session précédente.
- **Perdre le fil vaut mieux que deviner** : le dire.

## Avant de commencer

Écris un résumé bref — ce que tu as lu, l'état que tu constates, ce que tu
comptes faire et dans quel ordre — puis **arrête-toi**. Ne modifie rien avant
validation.
