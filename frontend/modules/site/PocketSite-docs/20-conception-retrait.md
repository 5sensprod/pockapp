# Retirer une entité du site — conception, puis mise en œuvre

> **ÉCRIT LE MÊME JOUR, 14 septembre 2026.** Ce qui suit était une conception ;
> le §5 dit maintenant ce qui existe. Ce qui a été fait : `catalog-delete.php`,
> le relais `POST /api/site/catalog/remove`, et le bouton par ligne sur les
> fiches disparues. Ce qui n'a PAS été fait : le §2 — la ré-exportation des
> produits et des sous-catégories qu'une suppression de catégorie déplace.
> Déclencheur : 21 fiches supprimées au comptoir dont la page restait servie.

*Ouvert le 14 septembre 2026, à côté de la mise en ligne automatique des
catégories et des marques (`frontend/lib/sync/relation-auto-sync.ts`) :
modifier et créer étaient automatisés, supprimer ne l'était pas. Les §1 à §4
disent pourquoi et comment ; le §5 dit ce qui tourne.*

---

## 1. Pourquoi ce n'est pas un travail React

Les trois autres gestes — renommer, changer une photo, mettre en avant —
n'avaient besoin de rien de neuf : la file `SyncJob` sait déjà envoyer une
entité pour elle-même, et `products-sync.php` sait déjà écraser une ligne. La
suppression n'a **aucun chemin**, et ce n'est pas côté navigateur qu'il manque :

* `server/api/products-sync.php:189-191` — le GET n'accepte **qu'une** action,
  `inventory`. Toute autre est refusée en 400.
* le POST écrit des lots (`INSERT … ON DUPLICATE KEY UPDATE`, lignes 386, 396,
  464). Il n'y a pas un `DELETE` dans le fichier.
* §46 du contrat ([`12-contrat-catalogue.md`](12-contrat-catalogue.md)) :
  « Rien n'est jamais supprimé côté SQL par l'export. » Ce n'est pas une
  limitation constatée, c'est une règle écrite.

Supprimer une catégorie dans PocketApp laisse donc aujourd'hui sa ligne, ses
images et sa page en ligne, **indéfiniment**. Le vendeur ne le voit nulle part :
l'écran `/site/catalogue` compare ce qui existe des deux côtés, il ne sait pas
nommer ce qui n'existe plus que d'un seul.

## 2. Ce que la suppression fait EN LOCAL, et que le site ignore

Lu dans `backend/migrations/catalog_v2.go:439` (relation `products.categories`) et
`:447` (`categories.parent`, avec son commentaire : « supprimer une catégorie
ne doit pas emporter sa descendance en silence »), rappelé dans le dialogue de
confirmation de l'arbre (`ProductCategoryFilterTree.tsx:642`) :

* `CascadeDelete: false` — les produits ne sont pas supprimés, **PocketBase leur
  retire la relation** ;
* les sous-catégories ne sont pas supprimées non plus : **elles remontent à la
  racine**.

Deux populations changent donc sans qu'on ait ouvert une seule fiche : les
produits directement rattachés (`counts.direct`), et les enfants de la branche.
Leur `checksum` d'export change — `categories` et `parent` en font partie (§4.4)
—, mais **rien ne les marque « modifiés » tant qu'on ne relit pas leur
checksum** : l'écran `/site/catalogue` le fera à sa prochaine visite, et c'est
précisément le filet qu'on ne veut plus être le seul chemin.

**Décision proposée : le retrait emporte ses conséquences dans le même geste.**
La file empile, dans cet ordre : (1) le retrait de l'entité, (2) un `SyncJob`
de données pour les produits qui la citaient et pour les sous-catégories
remontées. Sans (2), le site garde l'ancien rattachement et une page de
catégorie disparue reste citée par des fiches produit. Le nombre est connu
avant de cliquer — c'est celui qu'affiche déjà le dialogue de confirmation — et
il borne le travail : au-delà d'un seuil (à fixer, l'ordre de grandeur de
quelques centaines), on renvoie vers `/site/catalogue` plutôt que d'empiler un
export de masse derrière un clic.

## 3. L'ordre des opérations, et il n'est pas négociable

`server/api/images-sync.php:315-330` **refuse** un envoi d'images pour une
entité dont la ligne SQL n'existe pas (409, « Exporter l'entité avant ses
images »). Et le ménage du dossier distant n'a lieu qu'à la **fin** d'un envoi
réussi (`images-sync.php:441-500`).

Donc, pour retirer proprement :

1. **les images d'abord**, tant que la ligne existe : un envoi multipart avec
   une liste **vide**, qui fait exactement ce que le mécanisme sait déjà faire —
   les rangs absents de la nouvelle liste sont effacés, et le dossier de
   l'entité se vide ;
2. **la ligne SQL ensuite**, par la nouvelle action.

Inverser, c'est laisser un dossier `categories/<legacy_id>/` que plus rien ne
désigne sur le disque du mutualisé, invisible et sans propriétaire — c'est
exactement ce que `categories-cleanup.php:39-45` refuse déjà de provoquer, en
relevant sans supprimer toute ligne portant des `image_paths`.

## 4. Le pendant serveur : un script à part, pas une action de plus

**Retenu : un nouveau fichier `server/api/catalog-delete.php`**, sur le modèle
de `categories-cleanup.php` — même clé (`catalog_api_key`), même posture : GET
qui relève, POST qui supprime.

**Écarté : `products-sync.php?action=delete`.** Ce fichier a une propriété qui
vaut d'être gardée — il ne contient pas un `DELETE`. Un lot d'export mal formé
ne peut pas, quel que soit le bug, effacer une ligne. Y ajouter la suppression,
c'est mettre le geste destructeur dans le chemin emprunté 2412 fois par
campagne.

Ce que le script **refuse** de supprimer, repris tel quel de
`categories-cleanup.php` :

* une catégorie encore citée par un produit, **quel que soit son `status`** — un
  brouillon compte, il sera republié ;
* une catégorie déclarée pour parent par une autre ;
* une marque citée par un produit.

Un refus n'est pas un échec : il dit ce qui retient, et c'est ce que le toast
doit rendre. En pratique l'étape (2) du §2 aura déjà dû passer — les produits
ré-exportés ne citent plus l'entité —, donc un refus signale une divergence
réelle, pas une gêne.

Le pendant Go va dans `backend/routes/site_catalog_routes.go`, comme relais
authentifié : même réglage `site_catalog_url` (le script est à côté), même clé
`site_catalog_api_key`, et le `User-Agent` explicite sans lequel la couche
anti-bot répond 503 avant Apache.

## 5. Ce qui existe, depuis le 14 septembre 2026

1. **`server/api/catalog-delete.php`** — `GET` relève, `POST` supprime : la
   ligne, ses rattachements du pivot et le dossier d'images de l'entité. Refus
   du §4 appliqués. **À déposer par FTP** ; il ne s'exécute pas dans PocketApp.
2. **`POST /api/site/catalog/remove`** (`site_catalog_routes.go`) — le relais,
   avec la clé et le `User-Agent` explicite. Son URL se **déduit** de
   `site_catalog_url` en remplaçant le dernier segment : les deux fichiers sont
   voisins, il n'y a pas un réglage de plus à saisir, et une URL qui ne désigne
   pas un `.php` est refusée plutôt que devinée. Gardiens :
   `site_catalog_remove_test.go`.
3. **Un bouton par ligne**, dans le groupe « En ligne, disparues d'ici » du
   détail. Il s'ARME avant d'agir — un clic affiche « Confirmer le retrait »,
   c'est le second qui part. Une seule ligne armée à la fois.

**L'ordre du §3 est tenu par le PHP lui-même** : il efface les octets pendant
que la ligne existe encore, puis la ligne. Le passage par un envoi d'images
vide, envisagé plus haut, n'a pas été retenu — il aurait demandé une entité
locale que, par définition, on n'a plus.

### Ce qui reste ouvert

* **Le §2** : quand une CATÉGORIE est retirée, les produits qui la citaient et
  les sous-catégories remontées ne sont pas ré-exportés. Le serveur refuse
  aujourd'hui de supprimer une catégorie encore citée — donc le cas ne peut pas
  produire d'incohérence, il produit un refus. C'est un garde-fou, pas la
  fonctionnalité.
* **§2 et §7 du contrat** : la ligne « Le retrait d'une entité, cf. §2 » n'est
  plus vraie pour ce chemin-là. À reprendre quand le mécanisme aura servi —
  le contrat décrit ce qui tourne, et celui-ci n'a pas encore tourné en
  production.

## 6. Ce que ce document ne tranche pas

* **Les produits.** Un produit ne se supprime pas depuis l'arbre, et il a déjà
  un retrait : l'exporter en `draft` (21 août 2026). Sa ligne SQL reste, avec
  son `first_seen_at` et ses images. Rien ici ne le concerne.
* **Le seuil** du §2, au-delà duquel on renvoie vers `/site/catalogue`.
* **Les dossiers d'images déjà orphelins** — ceux des entités supprimées
  localement avant ce chantier. Leur relevé est un GET sur le futur script ; les
  effacer est un geste manuel, une fois.
