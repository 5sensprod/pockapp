# Prompt de reprise — mettre les images en ligne

**Réécrit le 19 août 2026**, après une phase 1 partielle qui a tranché trois
points. Remplace la version précédente et
[`13-prompt-images-site.md`](13-prompt-images-site.md).

Tu travailles dans `I:\pockapp`. Lis `CLAUDE.md` (points 4-5-6 des « points
d'entrée réseau », section « Contraintes »), puis
[`12-contrat-catalogue.md`](12-contrat-catalogue.md), qui fait autorité.

Trois dépôts : `I:\pockapp` (Go + PocketBase), `I:\pockapp\server\` (PHP du
mutualisé, versionné ici, **déposé par FTP à la main** — lis
`server/README.md`), `I:\divi-child\frontend-wp` (le bundle React qui affiche).

## Ce qui est déjà décidé — ne pas rediscuter

1. **La source est PocketBase, pas WordPress.** `wp_image_url` existe et
   répond (60 URL testées, 60 × `200`, ~259 Ko de moyenne), mais elle est
   écartée : elle ne couvre que l'image principale — les 1720 fichiers de
   galerie n'ont aucun équivalent WP —, elle ne suit pas la promotion d'une
   image (`product_image_routes.go` échange `image` et `gallery` sans la
   réécrire), et elle rendrait WordPress propriétaire de la moitié du
   catalogue au moment où on l'en sort. Elle peut servir de **repli
   d'affichage** pendant la transition ; jamais de source.
2. **On commence par les marques et les catégories.** Elles n'ont pas de
   galerie : un champ `image` scalaire (`.schema brands`, `.schema categories`).
   C'est la même chaîne de bout en bout, sans le problème de la liste ordonnée.
   Les produits viennent après, une fois la mécanique validée en ligne.
3. **La structure de dossiers distante reproduit la structure locale.** Une
   fois la mécanique validée, on doit pouvoir déverser le reste par copie de
   dossiers, sans transformation. C'est le critère qui départage les
   conceptions.
4. **Il faut un envoi manuel, entité par entité**, déclenché depuis
   l'interface, pour **mesurer la vitesse réelle** avant tout envoi en masse.
   Ce n'est pas un mode dégradé, c'est le premier livrable.

## L'état mesuré — 19 août 2026, SQLite `-readonly` + `find`

| | marques | catégories | produits |
|---|---|---|---|
| enregistrements | 288 | 464 | 2999 (2563 publiés) |
| avec `image` | **225** | **37** | 2412 publiés |
| avec galerie non vide | — | — | 731 (1720 fichiers) |
| `legacy_id` vide | 0 | 0 | 0 (publiés) |
| octets (hors `thumbs_` et `.attrs`) | 20 Mo / 275 fichiers | **36 Mo / 37 fichiers** | ~1,6 Go |
| poids moyen · max | 77 Ko · 752 Ko | **1004 Ko · 2627 Ko** | à mesurer |

**Refais ces mesures**, elles bougent.

Trois faits à ne pas manquer :

- **275 fichiers pour 225 marques** : ~50 fichiers ne sont désignés par aucun
  enregistrement. Le dossier local n'est donc pas l'inventaire de ce qui est
  utilisé. Ce qui fait foi est le champ `image`, pas le `ls`.
- **Une image de catégorie pèse 1 Mo en moyenne, 2,6 Mo au pire.** Le lot du
  contrat est plafonné à **200 entités et 1 Mio** (§6) : une seule image de
  catégorie le dépasse. Les octets ne peuvent pas voyager dans le lot
  d'entités.
- **Les dossiers de stockage sont nommés par l'identifiant PocketBase**, pas
  par `legacy_id` :
  `storage/<collectionId>/<recordId>/<nom_suffixé>.<ext>` — par exemple
  `f32dzjil2t50m5x/09399kf06jnjbx5/…_PiDxAYvQfC.jpg`. Or le contrat pose que
  **`legacy_id` est la clé, jamais l'identifiant PocketBase** (§1). La
  décision 3 (« même structure ») et le contrat (§1) se contredisent donc au
  premier pas. **C'est le point à trancher en premier, et à écrire.**
  Éléments : la purge qui régénérait les identifiants est désormais refusée
  (`backend/catalog/load/guard.go`), donc l'argument d'instabilité s'est
  affaibli — il n'a pas disparu.
  Collections : `brands=f32dzjil2t50m5x`, `categories=odvn2lqe02m6pn6`,
  `products=71wy9ngwa1b87sk`.

## Phase 1 — l'écrit, avant le code

Court. Les risques retenus, ceux que tu écartes **et pourquoi**, le mécanisme.
Puis **tu t'arrêtes** ; la décision se consigne dans `docs/DECISIONS.md` avant
le premier octet.

À trancher, au minimum :

- **l'arborescence distante** (le point ci-dessus) ;
- **qu'est-ce qui identifie une image ?** PocketBase suffixe chaque fichier à
  l'enregistrement (`…_PiDxAYvQfC.jpg`) : réimporter la même photo donne un
  autre nom. Le nom, un hachage du contenu, ou le couple (entité, rang) ?
- **l'ordre d'écriture** : l'octet d'abord ou la ligne SQL d'abord ? Que voit
  un visiteur dans l'intervalle ?
- **le checksum ne bouge pas quand l'image change** (§4.4 : SHA-1 de l'entité,
  clés triées). Promouvoir ou réordonner n'écrit ni nom ni prix. Un export
  incrémental fondé sur ce checksum ne verrait **jamais** un changement
  d'image. Le résoudre, c'est décider ce que le checksum couvre.
- **le retrait** : le contrat pose que l'export ne supprime jamais (§2). Une
  image retirée resterait en ligne. Tenable ?
- **la détection** : `products-sync.php` sait déjà rendre `legacy_id → checksum`
  (`server/api/products-sync.php:190-200`). Le même geste pour les images est
  probablement la moitié de la réponse.
- **deux postes exportent en même temps** (déploiement multi-postes depuis le
  19 août) ; **le site lit pendant qu'on écrit** (`catalog.php`, sans clé, sans
  verrou).

## Le budget : robuste, pas une usine à gaz

**Robuste** = idempotent (rejouer donne le même état) · réparable par rejeu
(pas de SQL à la main) · détectable (demander au distant ce qu'il a) · sans
état intermédiaire à surveiller.

**À écarter d'emblée, une ligne chacune, explicitement** : file de travaux,
processus résident, webhooks, différentiel temps réel, table d'état de synchro
en double, service tiers, CDN, stockage objet. Le mutualisé n'a **aucun
processus persistant** — la moitié de cette liste est de toute façon
impossible.

**Le juge :** entre deux conceptions, celle qui a le moins d'états possibles.

## Ce qui ne se rediscute pas

- `legacy_id` est la clé de l'export (§1) ;
- le serveur ne décide de rien (§2) ; la règle de mise en ligne est dans
  `frontend/modules/site/lib/online-catalog.ts` ;
- le slug est figé au premier envoi, le serveur en est gardien (§4.5) ;
- la lecture publique n'a pas de clé (§6 bis) — son consommateur est un bundle
  public ;
- **une couche anti-bot rejette `Go-http-client/1.1`** (503 en HTML, le PHP
  jamais atteint) : tout appel Go pose un `User-Agent` explicite, cf.
  `backend/routes/site_publish_routes.go` ;
- mutualisé PHP/**MySQL 5.7** : pas de CTE récursive ;
- `wp-admin` et `wp-json` ne se touchent pas dans le `.htaccess`.

## Interdits

- pas de FTP depuis PocketApp (le FTP dépose un script PHP, à la main) ;
- ne pas modifier AppPos ;
- ne pas toucher au module `stock` — s'il te le faut, c'est que tu fais décider
  au site ce que la caisse affiche : arrête-toi et dis-le ;
- ne pas relancer `catalog-import -load` (`guard.go` refuse ; `-force-purge`
  détruirait ventes et comptages) ;
- ne rien mettre au contrat que tu n'as pas mesuré.

## Pièges déjà payés

- un champ absent de `fields` revient **vide, sans erreur** — a caché 747
  galeries pendant une semaine ;
- `getList(1, 50)` est une page, pas une liste ;
- **une chaîne vide dans `<img src>` recharge la page courante** — tu vas
  écrire du rendu d'images dans `frontend-wp` ;
- deux comptages écrits séparément divergent : une seule fonction (§6 bis) ;
- `pocketbase-types.ts` ment sur `brands`, `categories`, `suppliers` ;
  `pnpm typegen` reste interdit.

## Méthode

- Français partout.
- Dépôt volumineux : partir d'un fichier nommé, suivre ses imports.
- `npx tsc -b` et `pnpm biome check --write` **sur les fichiers touchés** ;
  `pnpm test`. Go : `go build ./...`, `go test ./backend/...`, `gofmt`.
- **Un test pour toute règle sans autre gardien.** Le PHP n'a pas de suite ici :
  dis comment tu l'as vérifié, et sur quelle base.
- **Distingue ce qui est lu dans le code (chemin et ligne) de ce qui est
  rapporté.** Mesure avant d'affirmer.
- **Vérifie dans la base, dans l'app ou en ligne** — SQLite `-readonly`, `ls`,
  `curl` —, pas en relisant ton code.
- **Perdre le fil vaut mieux que deviner** : le dire.
