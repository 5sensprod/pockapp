# La date de création des produits — état des lieux

**Écrit le 13 août 2026.** Note d'attente, pas un plan : le sujet n'est pas
urgent et rien n'est décidé. Elle existe pour que le constat ne soit pas refait
à zéro dans six mois.

Elle est née d'une demande précise — « afficher les 8 derniers produits du
site » — à laquelle il a fallu répondre que la donnée n'existe nulle part.

## Le problème, en une phrase

Le site ne peut pas afficher « les derniers produits » parce qu'aucune date
d'arrivée ne traverse la chaîne, et les produits venus de NeDB n'en auront de
toute façon jamais une qui leur soit propre.

## Ce qui a été vérifié, couche par couche

Tout ce qui suit est **lu**, avec le chemin. Rien n'est rapporté.

| Couche | Fichier | Date de création |
|---|---|---|
| Base NeDB de référence | `%APPDATA%\AppPOS\data\products.db` | **`dateSoumission`, partiellement** — voir ci-dessous |
| Lecture NeDB | `backend/catalog/nedb/reader.go` | non lue (les seules occurrences de « Created » sont `$$indexCreated`, métadonnée du moteur) |
| Modèle normalisé | `backend/catalog/normalize/catalog.go:43-65` | **absente** de `type Product struct` |
| Contrat d'export | [`12-contrat-catalogue.md`](12-contrat-catalogue.md) §4.1 et `frontend/modules/site/lib/catalog-export.ts:45-57` | **absente** — 13 champs, aucune date |
| Table SQL du site | `server/sql/schema.sql:51-69` | seulement `exported_at` |
| Lecture publique | `server/api/catalog.php`, `present_product()` | aucune date rendue, aucun `ORDER BY` par date |

## Ce que porte réellement NeDB

Mesuré sur la base de référence (`%APPDATA%\AppPOS\data`, **pas** la copie
périmée de `I:\AppPOS` — cf. `CLAUDE.md`), en lecture seule :

- **3034 produits** uniques ;
- **2084 portent un `dateSoumission`** non vide (69 %), **950 n'en ont pas** ;
- étendue : **11 décembre 2023 → 5 août 2026** ; par année : 66 en 2023, 364 en
  2024, 1546 en 2025, 108 en 2026 ;
- deux encodages coexistent dans le même fichier : chaîne ISO
  (`"2025-05-31T16:50:41.483Z"`) et forme NeDB (`{"$$date": 1749301385596}`).
  Tout code qui lira ce champ devra accepter les deux.

**Les 950 sans date ne sont pas les produits non publiés** : 758 d'entre eux
portent un `woo_id`. L'hypothèse la plus simple est que le champ a été introduit
vers décembre 2023 et que les produits antérieurs ne l'ont jamais reçu — mais
**ce n'est qu'une hypothèse**, non vérifiée.

**Ce que je n'ai pas pu établir :** si `dateSoumission` est réécrit à chaque
modification du produit. Le test aurait consisté à comparer la première et la
dernière écriture d'un même `_id` dans le fichier append-only ; il est
impossible ici, la base ayant été compactée — aucun `_id` n'y apparaît deux
fois. Tant que ce point n'est pas tranché, **on ne sait pas si c'est une date de
création ou une date de dernière soumission**, et le nom du champ ne suffit pas
à le dire.

## Le cas PocketBase

PocketBase remplit un champ `created` automatiquement (utilisé ailleurs dans le
dépôt, `backend/hash/hash.go:235`). Il ne sert à rien **tant que le catalogue
est rechargé par purge** : `catalog-import -load` efface les collections et les
réécrit, donc `created` est régénéré à chaque chargement — exactement la raison
qui a fait écarter l'identifiant PocketBase au profit de `legacy_id`
([`12-contrat-catalogue.md`](12-contrat-catalogue.md) §1).

La date ne devient donc fiable qu'au moment où la purge cesse, c'est-à-dire
quand PocketBase devient réellement la source de vérité (`docs/DECISIONS.md`).
Les produits saisis après ce basculement auront une vraie date ; ceux venus de
NeDB porteront tous celle du chargement.

## Les trois chemins possibles

Aucun n'est engagé.

1. **`first_seen_at` côté serveur.** Une colonne posée à l'`INSERT` et absente
   du `ON DUPLICATE KEY UPDATE` de `server/api/products-sync.php` — c'est ce qui
   la distingue d'`exported_at`, qui est écrasé à chaque export. Quelques
   lignes, aucune modification du contrat. Elle date **l'arrivée sur le site**,
   pas la mise en vente : tout l'existant porterait la même journée.
2. **Remonter `dateSoumission`.** Quatre couches à modifier — lecteur NeDB,
   `normalize.Product`, contrat + export, table SQL + `present_product` — et une
   version de contrat. À ne pas entreprendre avant d'avoir tranché la question
   « création ou dernière soumission ? », sous peine d'exposer publiquement une
   date qui ne veut pas ce qu'elle a l'air de vouloir dire. Laisse 950 produits
   sans date.
3. **Attendre la fin de la purge** et se contenter du `created` de PocketBase.
   Le plus propre, le plus tardif, et il ne rattrape pas l'historique.

**Le calendrier compte pour l'option 1** : chaque export qui passe d'ici sa mise
en place est un lot de produits dont on ne pourra jamais dire quand ils sont
arrivés.

## Ce que le site fait en attendant

Dans le dépôt du site (`I:\divi-child\frontend-wp`), la section « Notre
catalogue » de la page d'accueil
(`src/components/section/AxeCatalogSearchSection.jsx`) affiche au repos
**« Un aperçu du catalogue — *nom de la catégorie* »**, et non « Nouveautés ».
Le titre dit ce que la donnée permet de dire. Le jour où une vraie date existe,
seul le tri change ; la mise en page reste.
