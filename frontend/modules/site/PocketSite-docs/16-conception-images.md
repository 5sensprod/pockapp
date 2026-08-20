# Conception — mettre les images du catalogue en ligne

**Écrit le 19 août 2026.** Phase 1 de
[`15-prompt-sync-images.md`](15-prompt-sync-images.md) : l'écrit avant le code.
Aucune ligne de code n'accompagne ce document, et aucun octet n'est parti.
**La décision se consigne dans `docs/DECISIONS.md` par le propriétaire avant le
premier envoi.**

Ce qui était déjà tranché — source PocketBase et non WordPress, arborescence
distante nommée par `legacy_id`, marques et catégories d'abord, envoi manuel
entité par entité comme premier livrable — ne se rediscute pas ici.

---

## 1. Les mesures, refaites

Base `%LOCALAPPDATA%\PocketReact\pb_data\data.db`, ouverte en
`sqlite3 -readonly file:data.db?immutable=1`. Stockage mesuré par `find`, en
excluant les `.attrs` **et les sous-dossiers `thumbs_*`**.

| | marques | catégories | produits |
|---|---|---|---|
| enregistrements | 288 | 464 | 2999 (2563 `published`, 436 `draft`) |
| avec `image` non vide | **225** | **36** | 2640 (2412 publiés) |
| avec galerie non vide | — | — | 748 (1767 fichiers) ; **731 publiés / 1720 fichiers** |
| `legacy_id` vide | 0 | 0 | 0 |
| dossiers de stockage | 225 | **37** | 2640 |
| fichiers réels | 225 | 37 | 4407 |
| octets | 21 568 057 (20,6 Mio) | 38 056 950 (36,3 Mio) | 1 638 158 158 (1,53 Gio) |
| poids moyen · max | 96 Ko · 770 Ko | **1029 Ko · 2690 Ko** | 372 Ko · 4955 Ko |

### Ce qui a bougé depuis les mesures du prompt

- **Les « ~50 fichiers de marques que personne ne désigne » n'existent pas.**
  Le prompt annonçait « 275 fichiers pour 225 marques ». Refait : 225 fichiers
  réels, 225 dossiers, 225 enregistrements — exactement. Les 275 étaient les
  fichiers `.attrs` (225 originaux + 50 vignettes), et les 50 vignettes vivent
  dans des sous-dossiers `thumbs_*`. **Aucun orphelin côté marques.**
- **Une catégorie a perdu son image depuis** : 36 enregistrements portent une
  `image`, 37 dossiers existent. L'orphelin est
  `odvn2lqe02m6pn6/y746mmw9ivp37o1/logo_axe_neon_7RFjfnokJJ.png` — la catégorie
  « Accumulateurs & Chargeurs » (`legacy_id` `6Uwc6luOMaFnrxBn`), dont le champ
  `image` est désormais `[]`. **La règle du prompt est donc vraie, mais pour une
  autre raison que celle avancée : le `ls` n'est pas l'inventaire, le champ
  `image` fait foi.** C'est ce cas unique qui la démontre, pas les marques.
- Les produits : 2640 avec image (le prompt ne donnait que les publiés), et
  `image` vide + galerie non vide = **0 produit**. Toute galerie s'accompagne
  d'une principale. 2640 + 1767 = 4407, soit exactement les fichiers du disque :
  **aucun octet orphelin côté produits non plus**.
- Le poids moyen des produits, « à mesurer » au prompt : **372 Ko, 4,95 Mo au
  pire**.

Le fait dur du prompt tient et se durcit : **une image de catégorie pèse 1 Mo en
moyenne et 2,7 Mo au pire**. Le relais d'export actuel refuse au-delà de 1 Mio
(`backend/routes/site_catalog_routes.go:52`, `siteCatalogMaxBytes`), et le
découpage du front vise 800 Kio
(`frontend/modules/site/lib/catalog-export.ts:37`). **Les octets ne peuvent pas
voyager dans le lot d'entités**, et pas davantage par la route qui le porte.

### Ce que j'ai lu, et où

- Les images sont des champs fichier servis par `pb.files.getUrl`
  (`frontend/modules/site/lib/catalog-image.ts:33`) — inatteignables depuis
  axemusique.shop.
- **`catalog.php` ne rend aujourd'hui aucun champ image**, délibérément :
  `server/api/catalog.php:150-151` le dit en commentaire. Le site n'affiche donc
  rien, plutôt que des images cassées. C'est l'état de départ, et il est sûr.
- L'inventaire distant rend déjà `legacy_id → checksum` par une seule requête
  SQL par table (`server/api/products-sync.php:190-200`).
- Le checksum est un SHA-1 de la forme canonique de l'entité, `checksum` retiré,
  clés triées récursivement (`catalog-export.ts:96-118`). Les champs traduits
  sont énumérés à `catalog-export.ts:135-171` : **aucun ne parle d'image**.
- La clé `pa_…` est posée par la couche d'accès, pas par l'écran
  (`catalog-products.ts:321`, `categories.ts:160`, `brands.ts:91`).

### Ce que je n'ai pas mesuré, et le dis

- **L'état de la base SQL distante.** L'inventaire exige `X-API-Key` ; je n'ai
  pas lu la clé et ne l'ai pas utilisée. Seule la lecture publique a été faite :
  `GET catalog.php?action=categories` répond `200`, 23 944 octets, **199
  catégories portant au moins un produit**. Combien de marques et de produits
  sont en base, je l'ignore.
- **Les plafonds PHP du mutualisé** (`post_max_size`, `upload_max_filesize`,
  `max_execution_time`) : inconnus. Ils décident de la taille d'un envoi
  d'octets et je ne peux pas les deviner. Voir §6.
- **L'espace disque disponible sur le mutualisé** : inconnu. 1,6 Gio de produits
  n'est pas rien.

---

## 2. Les risques retenus

1. **Le checksum est aveugle aux images.** §4.4 du contrat couvre nom, slug,
   description, prix, stock, relations — rien d'autre. Promouvoir une image ou
   réordonner une galerie n'écrit aucun de ces champs : un export incrémental
   fondé sur ce checksum ne verrait **jamais** un changement d'image. C'est le
   risque central, tout le reste en découle.
2. **La promotion et le réordonnancement sont des changements d'ordre, pas de
   contenu.** Les mêmes octets, dans un autre rang. Toute détection fondée sur
   « l'ensemble des fichiers » les manquerait.
3. **Le retrait d'une image en local.** Le contrat pose que l'export ne supprime
   jamais (§2). Appliqué tel quel aux images, il laisserait en ligne une image
   qu'on a retirée — et la catégorie « Accumulateurs & Chargeurs » mesurée
   ci-dessus prouve que le cas est déjà arrivé, en une semaine d'usage.
4. **`legacy_id` est la fondation, et rien ne la garde.** L'arborescence
   distante est nommée par lui. Il est non vide partout aujourd'hui (mesuré, 0
   sur trois collections), mais **aucun test ne vérifie que les trois `create`
   le posent** (`catalog-products.ts:321`, `categories.ts:160`,
   `brands.ts:91`) : une régression y produirait des dossiers distants nommés
   par une chaîne vide, sans erreur.
5. **Deux postes exportent en même temps** (multi-postes depuis le 19 août). Il
   n'y a ni verrou ni transaction couvrant un export.
6. **Le site lit pendant qu'on écrit.** `catalog.php` n'a ni clé ni verrou : un
   visiteur peut tomber au milieu d'une écriture.
7. **L'octet et la ligne SQL sont deux écritures.** Entre les deux, il existe un
   instant où l'un existe sans l'autre.

## 3. Les risques écartés, et pourquoi

- **Le renommage PocketBase** (`…_PiDxAYvQfC.jpg` : réimporter la même photo
  donne un autre nom) — écarté : le nom local ne voyage pas. Le nom distant est
  calculé, jamais recopié (§4).
- **Les doublons au rechargement par purge** — écarté : c'est précisément
  pourquoi l'arborescence est nommée par `legacy_id`, qui survit (§1 du
  contrat).
- **La collision de noms entre deux entités** — écartée : le dossier distant est
  nommé par une clé unique par collection.
- **La divergence entre le `ls` distant et la base SQL** — écartée comme
  bénigne : le site lit la ligne SQL, jamais le répertoire. Un octet que plus
  personne ne désigne est invisible et sans coût, sauf l'espace disque. C'est
  déjà l'état local, mesuré.
- **`wp_image_url` divergeant de PocketBase** — écarté : décision du 19 août,
  WordPress n'est pas la source. Au mieux un repli d'affichage.
- **La dérive de `product_events` vers l'identifiant PocketBase**
  (`frontend/lib/queries/stock-adjust.ts:220`) — écartée **du périmètre** : ce
  journal n'alimente pas l'export et n'entre dans aucun chemin d'image. Le
  manque reste réel et reste à traiter ailleurs.
- **Les 436 produits `draft`** — écartés : `status` n'admet que `published`
  (§4.1), un brouillon ne s'exporte pas, donc ses images non plus.
- **Le vol de bande passante par appel direct aux octets** — écarté : le site
  est déjà public sans clé (§6 bis), les images le sont aussi par nature.

---

## 4. Le mécanisme — un seul

> **Un miroir d'octets nommé par `legacy_id` et par le rang, plus une seconde
> empreinte qui ne couvre que les images.**

Trois pièces, pas une de plus.

### 4.1 Le nom distant est calculé, jamais transporté

```
<racine média>/<marques|categories|produits>/<legacy_id>/<rang>.<ext>
```

Le rang `0` est l'image principale ; `1, 2, …` sont la galerie, dans son ordre.

**Ce qui identifie une image est donc le couple (entité, rang)**, pas son nom et
pas un hachage de son contenu. Motif : c'est la forme qui a **le moins d'états**
— un emplacement par (entité, rang), un réenvoi écrase, rien à réconcilier. Un
nom porté par le contenu (`0-<sha16>.jpg`) créerait un fichier de plus à chaque
retouche et rouvrirait la question du ménage ; le nom PocketBase, lui, change
sans que l'image change.

Le hachage du contenu existe quand même, mais il **détecte**, il ne **nomme**
pas (§4.2).

Un changement d'extension (`0.jpg` devenu `0.png`) laisse l'ancien octet en
place : invisible, puisque la ligne SQL porte le nom qui fait foi. Le §3 l'a
accepté.

### 4.2 Une empreinte d'images, séparée de celle du contrat

Le checksum §4.4 **ne change pas**. Le toucher marquerait les 2563 produits
« modifiés » et déclencherait un réexport complet du catalogue pour rien.

À côté, une seconde valeur par entité :

> `image_checksum` = SHA-1 de la **liste ordonnée** des SHA-256 des octets de
> l'entité, principale en tête.

Elle règle d'un coup les risques 1, 2 et 3 : le contenu change → la liste
change ; on promeut ou on réordonne → l'ordre change ; on retire une image → la
liste raccourcit. Elle est stockée telle quelle côté SQL et **réémise sans être
recalculée**, exactement comme le checksum d'entité (§3 du contrat) — le
serveur continue de ne rien décider.

L'inventaire d'images est le même geste que l'inventaire d'entités, et rend
`legacy_id → image_checksum`. L'interface y lit les **mêmes trois états** —
absent, modifié, à jour — par la même fonction (`catalog-export.ts:186`,
`syncStateOf`).

### 4.3 Un envoi par entité, entier, idempotent

Une requête = **toutes les images d'une entité**, plus son `image_checksum`.
Jamais une image seule.

Motif : c'est la même règle que la galerie locale, où « la liste s'envoie
toujours ENTIÈRE » (CLAUDE.md). Envoyer entité par entité rend le retrait
possible sans violer §2 : on ne supprime pas une entité, on **réécrit l'état
d'une entité**. Les rangs au-delà de la nouvelle longueur disparaissent de la
ligne SQL ; leurs octets restent sur le disque, inertes.

**L'ordre d'écriture : les octets d'abord, la ligne SQL ensuite**, dans la même
requête. Motif mesuré : `catalog.php:150-151` ne rend aujourd'hui aucun champ
image — tant que la ligne SQL est vide, le site n'affiche rien, ce qu'il fait
déjà. Une interruption entre les deux laisse des octets que personne ne désigne,
invisibles, et le rejeu répare. L'ordre inverse afficherait des images cassées à
un visiteur, ce qui est le seul état vraiment coûteux.

La ligne SQL est mise à jour par **un seul `UPDATE` par entité** : un visiteur
lit l'ancien état ou le nouveau, jamais un état mi-écrit. Risque 6 traité.

Deux postes qui envoient la même entité écrivent la même chose ou, s'ils
divergent, le dernier gagne — et l'inventaire dit ensuite lequel a gagné.
Aucun verrou, aucune file. Risque 5 traité par l'idempotence, pas par un
mécanisme.

### 4.4 Ce que ça donne, dans l'ordre

1. Le contrat gagne un §8 « images » : un `image_checksum` par entité, un
   inventaire d'images, et un champ image rendu par `catalog.php` — ce que §7
   interdisait tant que le point n'était pas conçu.
2. Une sixième sortie réseau, distincte de l'export d'entités parce que son
   plafond de corps n'a rien à voir avec 1 Mio, à inscrire dans `CLAUDE.md`, et
   posant un `User-Agent` explicite.
3. **Le premier livrable : un bouton par fiche marque et par fiche catégorie**,
   plus la colonne d'état à trois valeurs. 225 marques et 36 catégories, soit
   57 Mio : de quoi mesurer la vitesse réelle avant d'envisager 1,6 Gio de
   produits.
4. Le test manquant sur les trois `create` (risque 4) s'écrit **avant** le
   premier envoi : c'est la règle dont dépend le nommage de toute
   l'arborescence.

### 4.5 Le budget, vérifié

| Exigence | Comment |
|---|---|
| idempotent | rejouer un envoi d'entité donne le même état |
| réparable par rejeu | aucun SQL à la main ; on renvoie l'entité |
| détectable | l'inventaire d'images dit ce que le distant a |
| sans état intermédiaire | aucune table de suivi, aucun drapeau « en cours » |

États possibles pour une entité : **absent, modifié, à jour**. Les trois du
contrat, pas un de plus.

---

## 5. Écartés d'emblée

- **File de travaux** — impossible : aucun processus persistant sur le mutualisé.
- **Processus résident** — même motif, et rien à surveiller n'est un objectif.
- **Webhooks** — le mutualisé ne peut pas rappeler PocketApp, qui est en poste.
- **Différentiel temps réel** — l'envoi est manuel et déclenché ; le temps réel
  de PocketBase s'arrête au réseau local.
- **Table d'état de synchro en double** — l'état est déjà dans l'inventaire ; le
  doubler, c'est créer une divergence à réconcilier.
- **Service tiers** — une dépendance de plus pour déplacer 57 Mio.
- **CDN** — problème d'échelle qu'on n'a pas, et une couche de cache à invalider.
- **Stockage objet** — le disque du mutualisé fait l'affaire ; le contrat
  n'aurait plus de destination unique.

---

## 6. Ce que je laisse ouvert au propriétaire

1. **Où vivent les octets sur le mutualisé, et sous quelle URL publique ?**
   Sous `server/`, ou un dossier média à la racine web ? Ce choix touche le
   `.htaccess`, où `wp-admin` et `wp-json` ne se touchent pas.
2. **Quel plafond de corps accepte l'hébergeur ?** `post_max_size`,
   `upload_max_filesize`, `max_execution_time` : non mesurés, et une catégorie
   à 2,7 Mo peut déjà en dépasser un. À relever sur place avant de fixer le
   découpage.
3. **Redimensionne-t-on à l'envoi ?** 1 Mo en moyenne pour un visuel de
   catégorie est lourd pour une vitrine. Envoyer l'original est plus simple et
   plus fidèle ; envoyer une version réduite divise le volume et la durée. C'est
   une décision de qualité, pas de technique — je ne la prends pas.
4. **1,6 Gio de produits tient-il sur le mutualisé ?** Espace disque inconnu.
   Si non, la question 3 devient obligatoire.
5. **Le champ image rendu par `catalog.php`** : une URL complète, ou un chemin
   relatif que le bundle compose ? Le bundle est public et déjà en production.
6. **Rouvre-t-on §7 du contrat maintenant, ou après l'essai sur les marques ?**
   Je conseille : essai d'abord, contrat ensuite — « ne rien mettre au contrat
   qu'on n'a pas mesuré ».

**Je m'arrête ici.** Aucun code, aucun octet, aucun commit.

---

## 7. Ce qui a été écrit — 19 août 2026

Phase 2. Le mécanisme du §4, implémenté pour les **marques et les catégories
seules**. **Aucun octet n'est encore parti** : rien n'a été déposé par FTP, le
schéma SQL distant n'a pas été modifié, et les réglages ne sont pas renseignés.
Ce qui suit est lu dans le code de ce dépôt, pas mesuré en ligne.

| Pièce | Fichier |
|---|---|
| l'empreinte d'images (§4.2) | `frontend/modules/site/lib/image-checksum.ts` |
| inventaire, empreintes locales, envoi | `frontend/modules/site/hooks/use-image-sync.ts` |
| le bouton par fiche + l'état à trois valeurs (§4.4.3) | `frontend/modules/site/components/online-catalog/ImageSyncPanel.tsx`, onglet « Images » de `CatalogueEnLignePage.tsx` |
| la sixième sortie réseau (§4.4.2) | `backend/routes/site_images_routes.go`, réglage `site_images_url` |
| le serveur | `server/api/images-sync.php`, colonnes `server/sql/images.sql` |
| le test manquant (§4.4.4) | `frontend/lib/queries/create-legacy-key.test.ts` |

### Le test du §4.4.4 a trouvé quelque chose

Écrit **avant** le reste, comme prévu. Il a montré que la clé était posée
**avant** l'étalement des données de l'appelant —
`{ legacy_id: newLegacyKey(), ...data }` —, donc qu'un `legacy_id` vide venu
d'un écran l'aurait écrasée en silence. Le type l'interdisait pour les marques
et les catégories, rien ne l'interdisait à l'exécution, et PocketBase accepte
la chaîne vide sans un mot : des dossiers distants nommés par du vide.

Les trois `create` passent désormais par `withLegacyKey`
(`frontend/lib/queries/legacy-key.ts`), qui pose la clé **après** l'étalement.

### Les choix que j'ai faits, faute de réponse au §6

Ils sont tous configurables, et aucun n'est en dur :

1. **Où vivent les octets** — un `media_root` de configuration, hors du dépôt,
   avec `media_base_url` en regard. Le `.htaccess` n'est pas touché.
2. **Le plafond de corps** — 24 Mio côté Go, 8 Mio par fichier côté PHP. Ce ne
   sont pas des mesures : `post_max_size` et `upload_max_filesize` restent
   inconnus, et c'est l'hébergeur qui refusera. Le script le **dit
   explicitement** dans ce cas plutôt que de rendre « erreur 1 ».
3. **Le redimensionnement** — aucun. L'original part tel quel. C'est une
   décision de qualité, elle reste ouverte ; la changer se fait côté envoi,
   sans toucher au mécanisme.
4. **Ce que rend `catalog.php`** — rien pour l'instant : il ne rend toujours
   aucun champ image (`catalog.php:150-151`). La ligne SQL porte le **chemin
   relatif** et `media_base_url` est renvoyé à côté ; ce que le bundle recevra
   se tranche au §8 du contrat, après l'essai.
5. **Les produits** — refusés par le serveur (`kind` n'admet que `brands` et
   `categories`), mais leurs colonnes SQL sont créées d'avance : ajouter une
   colonne à 2999 lignes plus tard coûte un verrou de table sur un mutualisé.

### Ce qu'il reste à faire avant le premier octet

1. Consigner la décision dans `docs/DECISIONS.md` — **le propriétaire**.
2. Exécuter `server/sql/images.sql` dans phpMyAdmin.
3. Créer le répertoire média et le renseigner dans `config.php`
   (`media_root`, `media_base_url`, `image_max_bytes`).
4. Déposer `server/api/images-sync.php` par FTP.
5. Régler l'URL du miroir dans Réglages > Clés API.
6. Envoyer **une** marque, et mesurer : durée, taille, ce qu'Apache sert.

### Ce que je n'ai pas vérifié, et le dis

Le PHP n'a pas de suite de tests dans ce dépôt et **n'a pas été exécuté** : il
est seulement passé au `php -l` (aucune erreur de syntaxe, PHP 8.2 en local).
L'écran n'a pas été ouvert : le mécanisme est gardé par
`image-checksum.test.ts` et `create-legacy-key.test.ts`, `npx tsc -b` et
`pnpm test` passent (195 tests), `go build ./...` et `go test ./backend/...`
aussi. Rien de tout cela ne dit qu'un octet arrive à destination.

---

## 8. Le logo de marque sur la page produit — 19 août 2026

Phase 3, et la **première fois que le miroir sert à quelque chose de visible**.

### Le §6.5 est tranché : URL COMPLÈTE

`catalog.php` rend `brand.image` — une URL absolue, composée côté serveur à
partir de `media_base_url` et du rang 0 de `image_paths`. Le bundle du site la
consomme **telle quelle** et ne la préfixe jamais.

Pourquoi pas le chemin relatif : le bundle est public et déjà en production.
Lui faire composer l'URL, c'est y poser le préfixe des médias — en dur ou par
une variable de build de plus — et transformer tout déménagement des médias en
rebuild + redéploiement du site, en plus du serveur. Le préfixe n'a qu'une
source de vérité, `config.php` ; le serveur est le seul à la connaître, il
compose. Le coût est de quelques dizaines d'octets par produit.

Le raisonnement complet est en commentaire au-dessus de `brand_image_url()`,
dans `server/api/catalog.php` — là où quelqu'un qui modifie le code le lira.

### Ce qui a été mesuré, en ligne, ce jour

| Mesure | Résultat |
|---|---|
| `images-sync.php?action=inventory` | **3 marques**, 0 catégorie (le prompt en annonçait deux) |
| Les trois | `8vAMv7T68F1K1wDL` ADAM HALL (`0.png`), `Y7CGJq5M6WBM0oyw` ADMIRA (`0.jpg`), `ZpBxd7powzo0MxTp` ACUS (`0.jpg`) |
| Leurs octets sous `media/catalog/brands/<id>/0.<ext>` | **200**, servis par Apache |
| `catalog.php` en production | rend encore `brand: {id, name}` — le patch n'est **pas déposé** |
| Marques distinctes vues dans le catalogue en ligne | 145 sur 288 (échantillon de recherche, non exhaustif) |

Trois sur 288 : **le repli est le cas normal**, pas le cas d'erreur. C'est la
règle qui a guidé l'écran.

### Ce qui a été vérifié dans le navigateur

Serveur de développement du site, `VITE_USE_AXE_CATALOG=true` (`.env:29`) :

- **Repli, en réel** — `/produit/guitare-classique-admira-malaga` contre la
  production non patchée : pastille « ADMIRA » seule, aucun `<img>`, hauteur
  37,6 px.
- **Avec logo** — même page, réponse du catalogue complétée à la volée dans la
  console (outil de debug, aucun code modifié) : `<img>` rendu sur l'URL
  absolue, image chargée depuis axemusique.shop, **929 × 929** affichée en
  24 × 24.
- **URL présente mais octets absents** (404 injecté) : `onError` retire l'image,
  la pastille reste, hauteur **37,6 px — identique au repli**. Aucune secousse
  de mise en page dans aucun des trois cas.

### Ce que je n'ai pas vérifié, et le dis

- **Le PHP n'a pas été exécuté sur des données réelles.** Pas de MySQL ici :
  seuls `php -l` (aucune erreur) et un test unitaire de `brand_image_url()`
  hors de son fichier — liste normale, `null`, `[]`, JSON invalide, chemin
  remontant : les quatre derniers rendent `null`. La colonne
  `b.image_paths` n'a jamais été lue par une vraie requête.
- **Aucune capture d'écran** : le volet navigateur n'était pas affiché, donc la
  page ne composait pas d'image. C'est aussi ce qui a démasqué le
  `loading="lazy"` initial — retiré : un logo de 24 px au-dessus de la ligne de
  flottaison n'a rien à différer.
- **Le contrat n'a pas été touché.** Son §8 « images » s'écrira quand cet écran
  aura tourné en production, pas avant.

### Ce qu'il reste à faire

1. Déposer `server/api/catalog.php` par FTP — **rien ne s'affiche avant.**
2. Rebâtir et redéployer le bundle du site.
3. Ouvrir une page produit ACUS, ADMIRA ou ADAM HALL et regarder.
4. Les logos pèsent lourd pour leur usage (929 px pour 24 px affichés) : la
   question 3 du §6 — redimensionner à l'envoi — se repose ici, avec un chiffre.

---

## 9. Les produits — 20 août 2026

Phase 4. Le mécanisme du §4 étendu aux produits, **images principales et
galeries**. Ce n'est pas un mécanisme de plus, c'est un cas de plus : le nom
distant est toujours calculé, l'empreinte est toujours la seconde, un envoi
porte toujours toutes les images d'une entité, les octets partent toujours
avant la ligne SQL, et il n'y a toujours qu'un `UPDATE`.

**Aucun octet n'est encore parti.** Le PHP n'est pas déposé.

### 9.1 Les mesures, refaites ce jour

Même méthode qu'au §1 : `sqlite3 -readonly file:data.db?immutable=1`, `find`
sans les `.attrs` ni les `thumbs_*`.

| | tous | `published` seuls |
|---|---|---|
| produits | 2999 | 2563 (436 `draft`) |
| avec `image` | 2640 | **2412** |
| avec galerie | 748 | 731 |
| fichiers de galerie | 1767 | **1720** |
| `legacy_id` vide | 0 | 0 |
| `image` vide + galerie non vide | 0 | 0 |
| fichiers sur disque | 4407 — **aucun orphelin** | **4132** |
| octets | 1 638 158 158 (1,526 Gio) | 1 613 774 987 — **1,503 Gio** |
| moyen · pire fichier | 363 Kio · 4,84 Mio | 381 Kio · 4,84 Mio |

Les chiffres du §1 tiennent. **Deux mesures neuves, et ce sont elles qui
décident**, parce que l'unité d'envoi est l'entité, pas le fichier :

| | |
|---|---|
| pire envoi d'une entité publiée | **15,92 Mio** — `iik6y8krect5bag`, 11 fichiers |
| entités > 1 Mio · > 8 Mio · > 24 Mio | 466 · **11** · 0 |
| fichier unitaire > 8 Mio | **0** |

Donc : `image_max_bytes` (8 Mio **par fichier**) passe, `siteImagesMaxBytes`
(24 Mio) passe. **Mais `post_max_size` n'est toujours pas mesuré**, et 11
entités demandent plus de 8 Mio de corps. Si l'hébergeur est à 8M — défaut
fréquent —, ce sont ces 11-là qui échoueront, en 413, et elles seules. Ce n'est
pas un défaut de conception, c'est un chiffre à relever.

### 9.2 Ce qui a été écrit

| Pièce | Fichier |
|---|---|
| la liste ordonnée, pure | `orderedImageNames`, `frontend/modules/site/lib/image-checksum.ts` |
| l'entité « produit » à envoyer | `toProductImageBearing`, `hooks/use-image-sync.ts` |
| le cache d'empreintes | `frontend/modules/site/lib/image-checksum-store.ts` |
| calcul borné, annulable | `useLocalImageChecksums`, `hooks/use-image-sync.ts` |
| l'écran | `components/online-catalog/ImageSyncPanel.tsx`, `CatalogueEnLignePage.tsx` |
| le serveur : `products`, le ménage, l'espace disque | `server/api/images-sync.php` |

Le relais Go n'a pas changé d'une ligne de code : il ne lit pas `kind`, il
relaie. Seuls ses commentaires portent les mesures neuves.

### 9.3 Le piège du §2 était armé, et il l'a été jusqu'ici

`frontend/lib/queries/site-catalog.ts` a sa **propre** chaîne `fields`, et elle
ne demandait pas `gallery`. Tel quel, chaque produit aurait paru n'avoir que
son image principale, **sans une erreur**, et 1767 fichiers ne seraient jamais
partis. C'est exactement le mécanisme qui a caché 747 galeries pendant une
semaine, au même endroit, une collection plus loin. Gardien étendu :
`frontend/lib/queries/catalog-fields.test.ts`, qui couvre désormais les deux
listes.

### 9.4 Les brouillons

Ils ne sont pas filtrés par une condition ajoutée pour l'occasion : l'écran lit
`usePublishedProducts`, donc les 436 `draft` n'y entrent jamais. C'est la seule
bonne façon de les écarter — le miroir répondrait 409 « Entité inconnue de la
base du site » (`images-sync.php`), et l'utilisateur croirait à une panne.

### 9.5 Le coût du calcul local, et la réponse

Le calcul d'une empreinte **lit les octets** : 57 Mio pour 261 marques et
catégories, **1,503 Gio pour 2412 produits**. Le bouton unique « comparer »
tel qu'il était les aurait tous lus, en série, sans arrêt possible.

Trois garde-fous, et les trois sont nécessaires :

1. **Un cache persistant dont la clé est la liste ordonnée des noms locaux**
   (`image-checksum-store.ts`). Il repose sur une propriété de PocketBase déjà
   énoncée et déjà exploitée dans ce dépôt : **le nom porte un jeton qui change
   dès que le fichier change**. Remplacer, promouvoir, réordonner, retirer :
   les quatre changent la liste de noms, donc ratent le cache. Le second
   passage est gratuit.
   **Ce n'est pas une empreinte de substitution** : ce qui part au serveur
   reste le SHA-1 des SHA-256 des octets. La clé décide seulement s'il faut les
   relire — un ratage coûte du temps, jamais une valeur fausse.
   Dans `localStorage`, par poste, et assumé comme un cache : le §5 écarte une
   table d'état de synchro, parce qu'un état doublé est un état à réconcilier.
   Le perdre coûte un recalcul, jamais une divergence.
2. **Un plafond**, `MAX_ENTITES_PAR_CALCUL` = 200, sur ce qui reste à lire
   APRÈS le cache. Ce qui déborde est **dit**, pas tronqué en silence.
3. **L'annulation.** Sans elle, la seule sortie d'un calcul long serait de
   fermer l'écran, ce qui perdrait aussi ce qui a été mesuré.

Et la règle qui les précède tous : **le calcul suit la sélection affichée**,
filtres compris, pas le catalogue. L'écran plafonne aussi son tableau à 300
lignes — bornage du DOM, sans rapport avec le précédent, et annoncé sous le
tableau.

### 9.6 Le §4.3 change sur un point : le ménage distant

> « leurs octets restent sur le disque, inertes » — §4.3
> « invisible et sans coût, sauf l'espace disque » — §3

Vrai pour 57 Mio de marques. **Faux pour 1,503 Gio de produits**, sur un
mutualisé dont l'espace est inconnu, quand chaque galerie qu'on raccourcit et
chaque extension qu'on change laisse un rang derrière elle. La parenthèse est
devenue le sujet, et la décision est du propriétaire (20 août 2026) : **un
dossier n'a pas à garder une photo inutile.**

`images-sync.php` efface donc, dans le dossier de l'entité, tout fichier que la
nouvelle liste ne désigne plus.

**L'ordre du §4.3 ne bouge pas** — octets, puis SQL — et le ménage vient
**après les deux** :

- après les octets, sinon on effacerait un rang avant de savoir si son
  remplaçant s'écrit ;
- après le SQL, parce que `image_paths` fait foi : tant que la ligne n'est pas
  à jour, un fichier que la nouvelle liste ignore peut être celui que l'ancienne
  désigne, donc celui qu'un visiteur charge.

Il **ne rejette jamais** : refuser après une réussite annoncerait un échec qui
n'en est pas un. S'il échoue, l'entité reste grasse et le prochain envoi
rattrape. Il est borné à `<media_root>/<kind>/<legacy_id>/`, sans récursion,
compare des noms de base à ceux qu'on vient d'écrire, et `$kind` comme
`$legacyId` sont contraints depuis le début du script. Ce qu'il a repris est
rendu dans la réponse (`cleaned`) et affiché : **le seul geste destructeur du
mécanisme ne se fait pas en silence.**

Effet de bord voulu : un `.tmp` laissé par un envoi interrompu n'est dans
aucune liste, donc il tombe.

### 9.7 L'espace disque — la mesure est là, la réponse n'y était pas

`?action=inventory` rend `disk.freeBytes` / `disk.totalBytes`
(`disk_free_space` sur `media_root`). C'est une **lecture** : le script ne
refuse aucun envoi sur cette base — ce serait décider, et le §3 le lui interdit.

⚠️ **Corrigé le 20 août 2026, mesuré en production : 356 Tio libres sur
386 Tio.** C'est le système de fichiers de l'hébergeur, partagé entre tous ses
clients — **pas le quota du compte**, qu'aucune fonction PHP ne sait lire sur un
mutualisé. J'avais écrit ici que le §6.4 « cessait d'être inconnu » : c'était
faux, et un badge rassurant qui mesure autre chose est pire que pas de badge.

La mesure est gardée — un zéro resterait un signal — mais elle est étiquetée
« volume hôte » et refuse de rassurer. **L'espace réellement disponible se lit
au panneau de l'hébergement**, et c'est là que le propriétaire l'a confirmé
suffisant pour les 1,503 Gio.

### 9.8 Ce qui a été vérifié, et comment

**Sur de vrais enregistrements et de vrais octets**, lus dans
`%LOCALAPPDATA%\PocketReact\pb_data` en lecture seule — deux produits publiés,
4 et 5 fichiers, 994 et 815 Kio :

| | |
|---|---|
| promotion (`image` ↔ `gallery[0]`) | l'empreinte **change** |
| réordonnancement de la galerie, contenu identique | l'empreinte **change** |
| retrait de la dernière image | l'empreinte **change** |
| rejeu à l'identique | l'empreinte est **stable** |

`npx tsc -b`, `pnpm biome check`, `pnpm test` (**215 tests**), `go build ./...`,
`go test ./backend/...` passent. `php -l` sans erreur.

### 9.9 Ce que je n'ai PAS vérifié, et le dis

- **La promotion n'a pas été exécutée par sa route.** La permutation vérifiée
  ci-dessus est celle que `backend/routes/product_image_routes.go:136-137`
  applique — lue dans le code, pas jouée. La route elle-même a son gardien
  (`product_image_test.go`) ; ce qui n'a jamais été fait, c'est l'enchaînement
  « je promeus vraiment, puis l'écran me dit modifié ». Il suppose d'écrire dans
  la base réelle.
- **Le ménage distant n'a pas de gardien exécutable.** Le PHP n'a pas de suite
  de tests dans ce dépôt (déjà noté au §7) et n'a pas tourné : `php -l`
  seulement. C'est le seul geste destructeur du mécanisme et c'est celui dont la
  vérification manque — à faire à la main, sur une entité, au premier envoi.
- **Aucun octet n'est parti**, et l'écran n'a pas été ouvert.
- **`post_max_size` reste inconnu** (§9.1).

### 9.10 Ce qu'il reste à faire, et par qui

1. Déposer `server/api/images-sync.php` par FTP — **le propriétaire**. Rien
   n'accepte un produit avant.
2. Relever `post_max_size` et `upload_max_filesize`, et regarder
   `disk.freeBytes` que l'inventaire rend maintenant.
3. Envoyer **un** produit à galerie, et mesurer : durée, taille, `cleaned`.
4. Puis un des 11 produits au-dessus de 8 Mio, pour savoir si le plafond de
   l'hébergeur mord.
5. La question 3 du §6 — redimensionner à l'envoi — se repose une troisième
   fois, et cette fois avec 1,503 Gio en face.

### 9.11 Le bouton photos sur la carte produit — 20 août 2026, même jour

L'onglet « Images » a été ouvert sur des données réelles, et il ne tient pas :
**2674 fiches, 4394 images**, marques, catégories et produits confondus, avec un
bouton unique qui propose de tout comparer. Vérifier UN produit y est
impossible.

La demande du propriétaire est donc : l'action doit être **là où l'on regarde
le produit**, dans l'arborescence, à côté de ce qui permet déjà d'en modifier le
texte. Deux temps sur la carte :

| clic | effet | coût |
|---|---|---|
| « Vérifier les photos (n) » | lit les octets de **ce** produit, calcule son empreinte | quelques centaines de Kio |
| « Envoyer / Mettre à jour les photos » | envoie toutes ses images | l'entité entière |

Le bouton n'apparaît que si le produit **porte** des images et **est déjà en
ligne** : le miroir refuserait ses images en 409, les images étant un état de la
ligne SQL, pas une entité à part.

L'onglet « Images » reste en place et inchangé. Il mélange trois natures de
fiches et ce n'est pas défendable ; **sa refonte est ouverte et n'est pas
traitée ici** — la carte répond au besoin immédiat sans préjuger de ce que
deviendra l'onglet.

#### Ce que la demande a fait apparaître, et qui était un défaut

`useLocalImageChecksums` tenait un index `legacy_id → empreinte`, reconstruit à
chaque calcul. Deux défauts, dont le second est une panne silencieuse :

1. **il se remplaçait.** Mesurer un seul produit effaçait l'état de tous les
   autres — rédhibitoire pour une vérification fiche à fiche ;
2. **il pouvait mentir.** Une empreinte mesurée hier y restait valide même si la
   galerie avait changé depuis : la carte aurait dit « à jour » pour des images
   qui ne l'étaient pas, **sans jamais lever**. C'est exactement la panne que le
   miroir existe pour éviter.

Le cache est donc devenu l'index. Il retient l'empreinte **avec la liste de noms
qui l'a produite**, et toute lecture passe par `empreinteConnue`, qui compare la
clé : galerie modifiée → « non mesurée », jamais une valeur périmée. Le second
défaut est impossible par construction, et il est gardé par
`image-checksum-store.test.ts`, qui couvrait déjà les quatre cas — remplacement,
promotion, réordonnancement, retrait.

#### Ce que je n'ai pas vérifié

**L'écran n'a pas été vu.** Le volet navigateur atteint bien le serveur de
développement, mais s'arrête à l'authentification, et je n'ai pas saisi
d'identifiants. `npx tsc -b`, `biome`, `pnpm test` (215) passent ; rien de tout
cela ne dit que le bouton s'affiche là où il faut.

---

## 9. Les images du produit sur sa fiche — 20 août 2026

Phase 4. Le logo de marque avait ouvert la voie ; c'est le même chemin, avec
une galerie au bout.

### Ce qui a été mesuré avant d'écrire une ligne

`images-sync.php?action=inventory`, lu à `2026-08-20T11:21:26Z` :

| | en ligne |
|---|---|
| marques | 3 (inchangé depuis le 19) |
| catégories | 0 |
| **produits** | **1** — `c9lb1s84bQ3EGycc`, « 130.000 », marque Gewa |

Un produit sur 2412 publiés. **L'absence d'image est donc la vue ordinaire du
site**, à un facteur 2400 près, et c'est cette proportion qui a dicté l'écran
bien plus que le cas nominal.

Ce produit porte **quatre** fichiers — rangs 0 à 3, tous en `.jpg`, tous en
`200` (sondage direct des URL ; le code, lui, ne sonde jamais rien). Il sert de
cas de test complet : principale + galerie de trois, et une marque SANS logo,
ce qui fait cohabiter les deux replis sur la même page.

L'inventaire rend aussi l'espace disque du mutualisé, ce que le §1 disait
inconnu : **382 To libres sur 414**. La question 4 du §6 — « 1,6 Gio tient-il ? »
— est close.

### Ce que j'ai tranché, et pourquoi

**L'image principale sur les trois actions, la galerie sur la fiche seulement.**
Je confirme la préférence qui m'était soumise, mais pas pour la raison qu'on
pourrait croire : trois URL pèsent ~200 octets, à comparer aux milliers d'octets
de description que ces mêmes réponses portent déjà. **Le poids n'est pas
l'argument.** L'argument est qu'AUCUNE grille n'affiche de galerie : un champ
publié sans consommateur est un champ qu'il faut porter, faire évoluer et ne
jamais casser, pour rien.

Corollaire assumé : `gallery` est **absent** des listes, pas vide. Un tableau
vide affirmerait « ce produit n'a pas de galerie » — faux. L'absence dit « non
demandé ». Sur la fiche il est toujours là, éventuellement vide.

Et le rang 0 n'est **pas** répété dans `gallery` : il est déjà dans `image`.
Un carrousel qui le veut en tête compose `[image, ...gallery]` — c'est ce que
fait la fiche.

**Une seule fonction de lecture**, `media_urls()`, extraite ce jour :
`brand_image_url()` en prend le rang 0, la fiche en prend tout. C'est la
validation qui valait d'être partagée, pas une abstraction sur la notion
d'entité. Les URL restent absolues, pour les trois raisons du §8, inchangées.

### Un piège trouvé en écrivant

Les deux tables ont une colonne du MÊME NOM, `image_paths`. Sans alias distincts
(`brand_image_paths`, `product_image_paths`), la seconde écrase la première dans
la ligne rendue par PDO, et **le logo de marque disparaîtrait sans la moindre
erreur**. C'est noté au-dessus de `$PRODUCT_COLUMNS`.

### Ce qui a été vérifié dans le navigateur

`VITE_USE_AXE_CATALOG=true`, serveur de développement. La production ne rend pas
encore les nouveaux champs : le cas « avec images » est donc obtenu en
complétant la réponse dans la console avec les **URL réelles**, mesurées à 200.

| Cas | Résultat |
|---|---|
| Produit synchronisé, prod non patchée (réel) | « Image à venir », aucune image, aucune secousse |
| Fiche, 4 images | grande image = **rang 0**, chargée (2000×1333) ; 4 vignettes dans l'ordre 0-1-2-3 ; `aria-label` « Image 1 sur 4 » |
| Clic sur la 3ᵉ vignette | la grande devient `2.jpg`, `aria-current` suit |
| **Un rang en 404** | il disparaît de la liste (restent `0.jpg`, `2.jpg`), les autres tiennent |
| **Tous les rangs en 404** | retour à « Image à venir », zéro image cassée |
| Grille catégorie « Banquettes » | 1 carte avec image, 4 avec l'icône — **les 5 cadres font 248×248**, au pixel |
| Recherche « 130.000 » | la ligne de résultat porte son image dans son cadre 64×64 |

Le dernier point est le plus important de la liste : **la mise en page ne bouge
pas d'un pixel** entre une carte imagée et une carte qui ne l'est pas. Le cadre
préexistait, il n'a pas été inventé pour l'occasion.

### Ce que je n'ai PAS vérifié, et le dis

- **Le PHP n'a jamais tourné sur des données réelles.** Pas de MySQL ici :
  `php -l` et un test unitaire de `media_urls()` / `brand_image_url()` extraites
  de leur fichier — liste de 4 rangs, `null`, chaîne vide, `[]`, JSON invalide,
  chemin remontant (en rang 0 comme en rang 2), trou au milieu, objet JSON au
  lieu d'une liste, nombre, et `media_base_url` absente. La colonne
  `p.image_paths` n'a **jamais été lue par une vraie requête**, et l'alias qui
  la sépare de celle de la marque n'a donc jamais été éprouvé sur PDO.
- **`AxeCatalogSection`** (la section catalogue de la page d'accueil) : branchée
  sur le même composant, mais **pas ouverte** dans le navigateur.
- **Aucune capture d'écran** : le volet n'était pas affiché, la page ne compose
  pas de frames. Tout ci-dessus est lu dans le DOM, pas vu.
- **Le poids réel des images de produit en ligne** : 2000×1333 à l'affichage,
  mais je n'ai pas mesuré les octets servis. La question 3 du §6 —
  redimensionner à l'envoi — reste ouverte, et une fiche qui charge quatre
  originaux la rend plus pressante qu'avec un logo.
- **Rien n'est déposé.** `catalog.php` doit partir par FTP et le bundle être
  rebâti : deux gestes du propriétaire, sans lesquels rien de tout ceci ne
  s'affiche.

### 9.12 L'onglet Images distingue les natures, et envoie en lot — 20 août 2026

Le §9.11 notait la refonte de l'onglet comme « ouverte et non traitée ». Elle
l'est en partie, pour un besoin précis : **envoyer les images des 225 marques et
des 36 catégories rapidement**, ce qui était le premier livrable du miroir
(§4.4.3) et restait impossible fiche par fiche.

#### Le filtre par nature vient AVANT tout

Les trois natures n'ont rien à voir et n'ont pas le même geste :

| nature | volume | comment on l'envoie |
|---|---|---|
| marques | 225 fiches, 20,6 Mio | **en lot**, d'un geste |
| catégories | 36 fiches, 36,3 Mio | **en lot**, d'un geste |
| produits | 2412 fiches, 1,503 Gio | **à la pièce**, depuis la carte (§9.11) |

Les décomptes, la comparaison et l'envoi portent désormais sur la nature
affichée, et sur elle seule. Un bouton doit dire ce qu'il fait : « Comparer 225
fiches » le dit, « Comparer aux images en ligne » sur 2674 fiches mêlées ne le
disait pas.

#### L'envoi en lot est une boucle, pas un mécanisme

Une entité après l'autre, jamais autre chose. Grouper plusieurs entités dans une
requête ferait sauter l'idempotence par entité ET le plafond de corps : le §4.3
ne bouge pas.

Trois garde-fous, chacun contre une panne concrète :

1. **un échec n'arrête pas le lot** — une marque illisible ne doit pas empêcher
   les 224 autres de partir ;
2. **trois échecs de SUITE l'arrêtent** — une clé refusée ou un hébergeur à bout
   répond pareil 225 fois ; insister n'apprend rien et martèle le mutualisé ;
3. **l'inventaire n'est relu qu'une fois, à la fin.** C'est un défaut qui a été
   trouvé en écrivant ceci : `useSendEntityImages` invalidait l'inventaire à
   chaque succès. Invisible à un envoi, insupportable à 225 — autant de
   relectures de l'inventaire distant, sérialisées avec les envois. D'où le
   drapeau `skipInvalidate` sur l'entrée de la mutation.

#### Ce que le lot envoie, et pourquoi c'est gardé

`aSynchroniser` (`lib/catalog-export.ts`) écarte deux choses, de natures
différentes :

- **ce qui est `synced`, par économie.** L'envoi reste idempotent et rejouable à
  la pièce ; c'est le lot qui ne repousse pas 36,3 Mio pour aboutir au même
  état ;
- **ce qui n'a pas d'empreinte mesurée, par RÈGLE** — et c'est le cas délicat.
  `syncStateOf` rend `synced` quand l'empreinte n'est pas calculée et que
  l'entité est connue de l'inventaire : l'écran ne prétend pas savoir ce qu'il
  n'a pas mesuré. **Filtrer sur le seul état laisserait donc partir des fiches
  jamais mesurées sous l'étiquette « à jour »**, et il faudrait leur inventer
  une empreinte. On n'envoie jamais une empreinte qu'on n'a pas calculée.

Cette fonction décide de ce qui est ÉCRIT chez l'hébergeur : gardée par cinq cas
dans `catalog-export.test.ts`, dont le piège ci-dessus.

#### Le plafond de calcul passe de 200 à 300

Le nombre n'est pas rond par hasard : le plus grand ensemble qu'on veuille
mesurer d'un seul geste est **les 225 marques**. À 200, le lot se coupait en
deux pour rien. 300 reste très en dessous d'un balayage des produits — 2412
fiches, 1,503 Gio.

#### Ce qui n'est PAS fait, et reste ouvert

- **La boucle du lot n'a pas de gardien exécutable.** Les trois garde-fous
  vivent dans un `useCallback` de `CatalogueEnLignePage`, que rien ici ne peut
  exécuter — ce dépôt n'a pas d'infrastructure de test de composants. Seule la
  règle de sélection a été extraite, précisément parce qu'elle décide d'une
  écriture distante.
- **L'écran n'a pas été vu.** Le volet navigateur atteint le serveur de
  développement mais s'arrête à l'authentification.
- **Aucun lot n'a été envoyé.** `npx tsc -b`, `biome`, `pnpm test` (220) passent.
- La refonte d'ensemble de l'onglet reste ouverte : il porte maintenant un
  filtre, pas une organisation.

### 9.13 L'exclusion qui manquait : la ligne avant ses images — 20 août 2026

Premier lot réel, sur les catégories : **5 parties, 4 refusées**, et le lot
arrêté sur trois échecs de suite. Le serveur répondait 409 :

> Entité inconnue de la base du site : `categories/eBxssgjp5S4JFCtJ`. Exporter
> l'entité avant ses images.

**Le serveur avait raison, et le défaut était dans l'écran.** Les images sont un
ÉTAT de la ligne SQL, pas une entité à part (§4.3) : sans la ligne, l'envoi ne
peut pas aboutir. Or `CatalogueEnLignePage` porte déjà la règle, écrite pour les
textes et ignorée par moi pour les images :

> « une catégorie que le site ne connaît pas n'est pas modifiée, elle est
> absente — et elle partira d'elle-même avec le premier produit qui la cite »

Proposer les images d'une fiche qui n'est pas en ligne, c'est promettre un envoi
que le serveur refusera. `aSynchroniser` gagne donc une **troisième** exclusion,
et elle n'est ni de l'économie ni une règle de prudence : c'est une
impossibilité.

#### Combien de fiches sont concernées

Mesuré ce jour, `sqlite3 -readonly`, en comptant les entités citées par au moins
un produit `published` :

| | portent une image | citées par un produit publié |
|---|---|---|
| marques | 225 | **179** — 46 hors de portée |
| catégories | **37** | **23** — 14 hors de portée |

(37 et non 36 : une catégorie a retrouvé une image depuis le §1.)

Ce sont des **bornes hautes**, pas l'état réel : ce qui compte est la présence
dans l'inventaire d'ENTITÉS du site, qui dépend de ce qui a effectivement été
exporté. L'écran lit cet inventaire-là, pas ce comptage.

#### Ce que l'écran fait maintenant

- une quatrième étiquette, **« À exporter d'abord »**, qui **prime sur l'état
  des images** : dire « jamais envoyée » d'une fiche qu'on ne PEUT pas envoyer
  invite à un clic qui ne peut que rater ;
- son bouton d'envoi est désactivé, avec le motif en infobulle ;
- un décompte et une phrase qui disent où est le geste qui débloque — l'export
  de l'entité, dans l'onglet Arborescence, pas ici ;
- ces fiches sont **exclues de l'envoi en lot**.

`online === undefined` — l'inventaire d'entités pas encore lu — n'exclut rien :
**ne pas savoir n'est pas savoir que non**, et retenir tout un lot par ignorance
serait pire que laisser le serveur trancher.

#### Ce que l'incident dit du garde-fou

Les trois échecs de suite ont fonctionné exactement comme prévu : le lot s'est
arrêté au lieu de marteler le mutualisé 32 fois. Il a fait son travail — mais un
garde-fou qui se déclenche signale toujours que quelque chose aurait dû être
attrapé plus tôt. C'était le cas.

Gardien : `catalog-export.test.ts`, deux cas de plus — la fiche hors ligne est
écartée, l'inconnue passe.

### 9.14 Avant la campagne produits — 20 août 2026

Marques et catégories sont **envoyées et en ligne** (mesuré par le propriétaire,
après le correctif du §9.13). Restent les produits : 2412 fiches, 4132 fichiers,
**1,503 Gio**.

Deux manques de l'écran, comblés avant de lancer :

1. **L'espace disque du mutualisé est affiché.** Il dormait dans le JSON depuis
   le §9.7. Affiché, il a immédiatement montré qu'il ne répondait pas à la
   question — voir la correction au §9.7 : c'est le volume de l'hébergeur, pas
   le quota du compte. La capacité a été confirmée suffisante par le
   propriétaire, hors de l'application.
2. **Le bouton de comparaison annonce ce qu'il reste à LIRE**, pas le nombre de
   fiches affichées. Le cache rend gratuit ce qui a déjà été mesuré : sur 2412
   produits, la différence dit si le prochain clic coûte ~190 Mio ou rien.
   « Lire 300 fiches (sur 2412 à mesurer) » se comprend ; « Comparer 2412
   fiches » ne se comprenait pas.

Le plafond reste à 300. La campagne se fait donc en **neuf passes**, ou —
préférable — **branche par branche** en sélectionnant une catégorie dans
l'arborescence : l'avancement se lit alors en termes de catalogue, et l'on peut
commencer par ce qui se voit sur le site.

Rappel des deux chiffres qui peuvent mordre : **11 produits demandent un corps
de plus de 8 Mio** (pire cas 15,92 Mio), et `post_max_size` du mutualisé n'est
toujours pas mesuré. S'il est serré, ces onze-là échoueront en 413 — sans
arrêter le lot, sauf s'ils tombent trois de suite.

