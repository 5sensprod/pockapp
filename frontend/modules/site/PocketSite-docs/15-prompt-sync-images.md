# Prompt de reprise — synchroniser les images vers axemusique.shop

**Écrit le 19 août 2026, à la clôture de la session « galerie ».** Il remplace
[`13-prompt-images-site.md`](13-prompt-images-site.md) comme point d'entrée —
13 reste utile pour ses mesures et pour les trois voies qu'il pose, mais il a
été écrit **avant** que la galerie existe, et l'unité à synchroniser a changé
depuis.

---

Tu travailles dans `I:\pockapp` (PocketApp : Wails, Go + React/TypeScript,
PocketBase embarqué), et ta mission traverse **trois dépôts** :

| Où | Quoi | Ton rôle |
|---|---|---|
| `I:\pockapp` | PocketBase, la route Go d'export | tu écris |
| `I:\pockapp\server\` | le PHP du mutualisé — **versionné ici, déposé par FTP à la main**, ne s'exécute pas dans PocketApp | tu écris ; lis `server/README.md` avant |
| `I:\divi-child\frontend-wp` | le bundle React devant WordPress | tu écris — c'est lui qui affichera les images |

Lis d'abord `CLAUDE.md` à la racine — les points 4, 5 et 6 des « points
d'entrée réseau », et la section « Contraintes à ne pas franchir » —, puis
[`12-contrat-catalogue.md`](12-contrat-catalogue.md), qui **fait autorité** sur
ce qui part vers le site.

## Ta mission

**Faire arriver les images des produits sur le site, et les y garder justes.**

C'est le §7 du contrat, le seul point qu'il déclare explicitement non couvert :

> **Les images.** […] Aucun champ image ne figure au contrat **tant que ce
> point n'est pas conçu** : en mettre un qui porterait une URL locale
> produirait 2562 images cassées sur le site.

La chaîne complète, et elle est entièrement de ton ressort :

```
PocketBase (pb_data/storage)
   → backend/routes/site_catalog_routes.go   (POST, X-API-Key, User-Agent explicite)
      → server/api/products-sync.php          (écrit MySQL)
         → server/sql/schema.sql              (aucune colonne d'image, aujourd'hui)
            → server/api/catalog.php          (lecture publique, sans clé)
               → frontend-wp                  (affiche)
```

## L'état mesuré — 19 août 2026, en fin de session galerie

Lu dans `%LOCALAPPDATA%\PocketReact\pb_data\data.db`, en `-readonly` :

| Mesure | Valeur |
|---|---|
| produits **publiés** (ceux qui partent au site) | **2563** |
| publiés avec une image principale | **2412** |
| publiés avec une **galerie** non vide | **731** |
| publiés portant une URL WordPress (`wp_image_url`) | **2395** |
| publiés **sans image ni URL WordPress** | **150** |
| stockage `pb_data/storage` | 1,7 Go, 4665 fichiers |

**Refais ces mesures.** Elles bougent : la base porte désormais des produits nés
en caisse, et ces chiffres ont changé entre le matin et le soir du 19 août.

**Le chiffre qui commande la conception : 2395 des 2412 images publiées ont déjà
une URL WordPress.** Elles sont donc probablement **déjà en ligne**. Une URL en
base n'est pas une image servie : **vérifie combien répondent en 200, et en
quelle taille**, avant de bâtir quoi que ce soit dessus. Cette seule mesure peut
faire passer la mission de « transférer 1,7 Go à travers un mutualisé » à
« publier des URL et téléverser 150 fichiers ».

## Ce que la session « galerie » t'a laissé — et qui n'existait pas hier

Elle s'est achevée le 19 août 2026 ; son compte rendu est au **§6 terdecies** de
[`../../stock/PocketStock-docs/00-rituel-migration-appstock.md`](../../stock/PocketStock-docs/00-rituel-migration-appstock.md).
Trois acquis, tous pour toi :

1. **L'ordre de la galerie est une donnée.** Le tableau `gallery` **est** l'ordre
   des vignettes. Ce n'est pas une convention de notre cru : PocketBase le
   prend en charge — `forms/record_upsert.go:461` (v0.22.22), « allow file key
   reasignments for file names sorting » ;
2. **L'image principale est une DÉSIGNATION**, pas un fichier à part. Tout
   fichier importé entre par `gallery` ; promouvoir échange les deux champs, par
   `POST /api/catalog/products/:id/promote-image`
   (`backend/routes/product_image_routes.go`). Aucun octet ne bouge : les deux
   champs partagent le dossier `storage/<collectionId>/<idProduit>/` — vérifié
   sur la donnée réelle ;
3. **`image` et `gallery` sont dans `PRODUCT_FIELDS`**, et un test le garde
   (`frontend/lib/queries/catalog-fields.test.ts`). Tu n'auras pas le piège du
   champ qui revient vide.

**Ce que ça change pour toi :** l'unité à synchroniser n'est pas « une image par
produit », c'est **une principale plus une liste ordonnée**. Le précédent est
dans `server/sql/schema.sql` : `ax_product_categories` existe parce qu'un
produit a un ENSEMBLE de catégories. Une galerie ordonnée appelle la même forme.
**Choisis — table de liaison avec position, ou colonne(s) sur `ax_products` — et
dis pourquoi.**

## PHASE 1 — LA RÉFLEXION SUR LA DÉSYNCHRONISATION. Elle passe avant le code.

**C'est la partie que le propriétaire attend en premier, et elle ne se fait pas
en écrivant.** Les trois dépôts tiendront chacun un morceau de la vérité, et
c'est là que naissent les désynchronisations. Tu dois les nommer **avant** de
choisir un mécanisme, sinon tu choisiras le mécanisme d'abord et tu nommeras les
risques qu'il traite — ce qui n'est pas la même chose.

Au minimum, ces axes. Pour chacun : **est-ce détectable ? est-ce réparable ? à
quel coût ?**

- **La ligne SQL dit une image que le fichier ne suit pas.** L'URL est publiée,
  l'octet n'est pas arrivé, ou l'inverse. Lequel des deux écrire en premier, et
  que voit un visiteur pendant l'intervalle ?
- **Le fichier change sans que le produit change.** Promouvoir une image
  n'écrit ni le nom, ni le prix : **le checksum du produit ne bouge pas** (§4.4
  du contrat : SHA-1 de l'entité, clés triées). Un export incrémental fondé sur
  ce checksum ne verrait donc **jamais** un changement d'image principale ni un
  réordonnancement de galerie. **C'est le piège central de ta mission** — le
  résoudre, c'est décider ce que le checksum couvre.
- **Une image retirée.** Le contrat pose que **rien n'est jamais supprimé côté
  SQL par l'export** (§2). Une image retirée dans PocketApp resterait donc en
  ligne indéfiniment. Est-ce tenable pour une image, comme ça l'est pour un
  produit dépublié ?
- **Le nom de fichier n'est pas stable.** PocketBase suffixe chaque fichier à
  l'enregistrement (`…_UgS5i46zUc.jpg`). Réimporter la même photo produit un
  nom différent. Qu'est-ce qui identifie une image, alors — le nom, un hachage
  du contenu, le couple (produit, rang) ?
- **Le lot est plafonné à 200 entités et 1 Mio** (§6). Une image ne tient pas
  dans ce budget. Les octets et les métadonnées voyagent-ils ensemble ou
  séparément ? (Poser la question, c'est déjà y répondre en partie.)
- **Un lot échoue au milieu.** Chaque lot est indépendant, il n'y a pas de
  transaction couvrant l'export (§6). **L'idempotence est ce qui rend cela sûr :
  rejouer le même lot doit produire exactement le même état.** Ta conception la
  garde-t-elle pour les images ?
- **Deux postes exportent en même temps.** Le déploiement est multi-postes
  depuis le 19 août (`docs/DECISIONS.md`).
- **Le site lit pendant qu'on écrit.** `catalog.php` sert sans clé, sans
  verrou, sans transaction couvrant l'ensemble.

**Livrable de la phase 1 :** un écrit court — les risques retenus, ceux que tu
écartes **et pourquoi**, le mécanisme choisi. Puis **tu t'arrêtes**.

## Robuste, sans usine à gaz — le budget est explicite

Le propriétaire a tranché la règle générale : **un système robuste, mais pas une
usine à gaz.** Voici comment la lire ici, pour que ce ne soit pas une question
de goût.

**« Robuste » veut dire, et ne veut dire que :**

- **idempotent** — rejouer produit le même état. C'est déjà la propriété qui
  tient l'export du catalogue, et c'est elle qui autorise à ne rien construire
  d'autre ;
- **réparable par rejeu** — la sortie de tout incident est « on relance », pas
  « on répare à la main en SQL » ;
- **détectable** — on peut demander à la base distante ce qu'elle a, et le
  comparer à ce qu'on a. `products-sync.php` sait déjà le faire pour les
  entités : `GET ?action=inventory` rend `legacy_id → checksum`
  (`server/api/products-sync.php:190-200`). **Le même geste pour les images est
  probablement la moitié de ta réponse** ;
- **sans état intermédiaire à surveiller** — pas de file d'attente à vider, pas
  de tâche qui doit tourner pour que le système soit correct.

**« Usine à gaz » veut dire, et c'est à écarter d'emblée :** file de travaux,
processus résident, webhooks, différentiel en temps réel, table d'état de
synchronisation à maintenir en double, service tiers, CDN, stockage objet. Le
mutualisé n'a **aucun processus persistant** — pas de Node, pas de Docker, pas
de WebSocket serveur : la moitié de cette liste est de toute façon impossible.
**Écarte-les explicitement plutôt qu'en silence**, une ligne chacune.

**Le juge, en cas de doute :** entre deux conceptions, préfère celle qui a moins
d'états possibles. Un système qui se répare en rejouant bat un système qui ne se
trompe jamais — parce que le second n'existe pas.

## Ce qui est décidé, et ne se rediscute pas

- **`legacy_id` est la clé de l'export**, jamais l'identifiant PocketBase (§1 du
  contrat). Une image se rattache à un produit par sa clé stable ;
- **le serveur ne décide de rien** (§2) : il ne calcule pas ce qui est
  publiable, il reçoit un résultat, pas une question. La règle de mise en ligne
  est dans `frontend/modules/site/lib/online-catalog.ts` ;
- **le slug est figé au premier envoi**, le serveur en est gardien (§4.5) ;
- **la lecture publique n'a pas de clé** (§6 bis) : son consommateur est un
  bundle public, où un secret serait lisible de tous ;
- **une couche anti-bot filtre axemusique.shop avant Apache** et rejette
  `Go-http-client/1.1` — 503 en HTML, le PHP jamais atteint. Tout appel Go pose
  un `User-Agent` explicite : `backend/routes/site_publish_routes.go` ;
- **l'hébergement est un mutualisé PHP/MySQL**, MySQL 5.7 — **pas de CTE
  récursive**, l'arbre des catégories est déjà parcouru en PHP pour cette
  raison (§6 bis) ;
- **`wp-admin` et `wp-json` ne se touchent pas** dans le `.htaccess` tant que
  WordPress sert le catalogue et la médiathèque.

## Les pièges déjà payés — ne pas les rejouer

- **une couche anti-bot répond 503 en HTML** à un `User-Agent` par défaut :
  clé, URL et corps identiques, seul l'en-tête changeait. Constaté le
  2026-08-10 ;
- **un champ absent de `fields` revient vide, sans erreur.** C'est ce qui a
  caché 747 galeries pendant une semaine ;
- **`getList(1, 50)` est une page, pas une liste** — a donné « 0 produit » sur
  205 marques ;
- **une chaîne vide dans `<img src>` recharge la page courante.** Tu vas écrire
  du rendu d'images dans `frontend-wp` : c'est exactement le terrain ;
- **deux comptages écrits séparément finissent par diverger** — le total d'une
  catégorie et le décompte de ses enfants passent par **la même fonction**
  (§6 bis), après un écart déjà constaté. La même prudence vaudra pour
  « combien d'images » ;
- **`pocketbase-types.ts` ment** sur `brands`, `categories` et `suppliers`, et
  `pnpm typegen` reste interdit.

## Ce que tu ne dois pas faire

- **ne pas déposer par FTP depuis PocketApp.** Le FTP sert à déposer un script
  PHP, une fois, à la main (`server/README.md`) ;
- **ne pas modifier AppPos** ;
- **ne pas toucher au module `stock`.** Il a fini sa migration le 19 août, et
  ses images sont servies par PocketBase. Si tu crois avoir besoin d'y toucher,
  c'est probablement que tu cherches à faire décider le site de ce que la caisse
  affiche : arrête-toi et dis-le ;
- **ne pas relancer `catalog-import -load`** : `backend/catalog/load/guard.go`
  refuse la purge depuis le 19 août, et `-force-purge` détruirait ventes,
  comptages et documents ;
- **ne rien mettre au contrat que tu n'as pas mesuré.** Une URL locale au
  contrat, ce sont 2563 images cassées en ligne.

## Contraintes de travail

- Français partout.
- Ce dépôt est volumineux : partir d'un fichier nommé et suivre ses imports.
- `npx tsc -b`, `pnpm biome check --write` **sur les fichiers que tu touches**
  — viser un répertoire reformate tout le module et rend le diff illisible ;
  `pnpm test`. Côté Go : `go build ./...`, `go test ./backend/...`, `gofmt`.
- **Écris un test pour toute règle qui n'a pas d'autre gardien.** Le PHP n'a pas
  de suite de tests dans ce dépôt : dis comment tu l'as vérifié, alors, et sur
  quelle base.
- **Distingue ce qui est lu dans le code — chemin et ligne — de ce qui est
  rapporté.** Mesure avant d'affirmer.
- **Vérifie dans l'application, dans la base ou en ligne**, pas en relisant ton
  code. La base PocketBase se lit en SQLite `-readonly`, le stockage au `ls`,
  et le site répond à `curl`.
- **Perdre le fil vaut mieux que deviner** : le dire.

## Avant de commencer

Fais la **phase 1** : mesure l'état réel — dont les URL WordPress, qui peuvent
tout changer —, nomme les risques de désynchronisation, propose UN mécanisme et
dis ce que tu écartes. Écris-le, **et arrête-toi**. La décision se consigne dans
`docs/DECISIONS.md` avant que le premier octet ne parte.
