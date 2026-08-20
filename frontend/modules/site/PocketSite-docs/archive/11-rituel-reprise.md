# Rituel de reprise — migration du catalogue vers PocketBase

**Écrit le 11 août 2026.** Point d'entrée pour reprendre le travail. Il remplace
[`08-rituel-migration-pocketbase.md`](08-rituel-migration-pocketbase.md) comme
carte de départ : le 08 reste valable sur la démarche, il est **dépassé sur
l'état** — la phase qu'il ouvrait est en grande partie faite.

---

## 0. Ce que tu fais en premier, et rien d'autre

**Tu ne modifies rien avant d'avoir écrit ton résumé et qu'il ait été validé.**

Lis, dans cet ordre :

1. `CLAUDE.md` à la racine — carte du dépôt et contraintes ;
2. `docs/DECISIONS.md` — les blocs du 10 et du 11 août, en haut du fichier ;
3. [`10-plan-migration.md`](10-plan-migration.md) — **et son §9 en priorité**,
   qui dit l'état réel ;
4. ce fichier jusqu'au bout.

Puis **écris un résumé** de ce que tu as compris, en trois parties :

- **le contexte** — quel est ce dépôt, quelle est la mission, pourquoi ;
- **l'état actuel** — ce qui est fait, ce qui tourne, ce qui est en base ;
- **ce qu'il reste à faire** — et dans quel ordre.

**Ce résumé est soumis au propriétaire avant toute action.** Il sert à vérifier
que tu as le bon contexte, pas à te faire réciter. Sois bref et précis ; dis ce
dont tu n'es pas sûr plutôt que de combler au plausible.

**N'exécute aucune commande d'écriture avant validation.** Lire est autorisé.

---

## 1. Le contexte en dix lignes

PocketApp (`I:\pockapp`) est un logiciel de caisse Wails — Go + React —
embarquant PocketBase. Il remplacera à terme **AppPos**, une application
React/Express/NeDB sur `:3000` qui est aujourd'hui l'**autorité** sur le
catalogue : produits, catégories, marques, fournisseurs.

**La mission : s'affranchir d'AppServe.** PocketBase devient la source de vérité
du catalogue. Décision du 10 août 2026, `docs/DECISIONS.md`.

**Tout se fait en local.** Aucune synchronisation vers la production dans cette
phase — c'est le point le plus important de la décision : deux problèmes, deux
temps.

---

## 2. Les contraintes qui ne se franchissent pas

Elles sont dans `CLAUDE.md`, mais celles-ci comptent double ici :

- **Ne pas modifier AppPos.** La caisse en dépend. On lit AppPos ; l'inverse
  n'existe pas. Une migration qui *exige* de corriger la source ne pourra
  jamais tourner — c'est pourquoi le chargeur met en quarantaine.
- **Ne pas écrire dans les bases NeDB.** L'outil les lit, jamais.
- **Ne pas lancer `pnpm typegen`** tant que `apppos-transformers.ts` n'est pas
  aligné : 21 fichiers référencent des champs que le schéma n'a plus.
- **Ne pas créer un troisième chemin d'écriture** vers le catalogue. Il en
  existe déjà deux.
- **PocketApp doit être fermé** pour lancer le chargeur : SQLite n'accepte
  qu'un écrivain.

---

## 3. Les deux pièges qui ont déjà coûté cher

Ils ne sont pas théoriques : ils se sont produits, et ils ont été payés.

### 3.1 La mauvaise base

Il existe **deux bases NeDB**, et **deux bases PocketBase**.

| | Chemin | Statut |
|---|---|---|
| NeDB **référence** | `%APPDATA%\AppPOS\data` | 3034 / 463 / 287 / 43 |
| NeDB développement | `I:\AppPOS\AppServe\data` | **PÉRIMÉE** — 2306 / 219 / 224 / 34 |
| PocketBase **réelle** | `%LOCALAPPDATA%\PocketReact\pb_data` | 24 collections |
| PocketBase vestige | `I:\pockapp\pb_data` | **vestige** de nov. 2025, schéma incompatible |

Tout ce qui a été mesuré avant le 11 août l'a été sur la base **périmée**. Cela
a produit quatre défauts, dont la suppression du champ image des marques — la
base dev n'en avait aucune, la référence en porte 225.

**Une mesure juste sur la mauvaise base est une mesure fausse.** Avant
d'affirmer un chiffre, dis sur quelle base il est pris.

### 3.2 Croire les documents plutôt que les données

Trois affirmations d'audit se sont révélées fausses en les vérifiant :

- « les URL d'images viennent du `source_url` WordPress » — **ce champ n'existe
  nulle part** ;
- « les marques n'ont aucune image » — vrai sur la dev, faux sur la référence ;
- « 43 fournisseurs » et « 2306 produits » dans le même paragraphe — deux bases
  différentes, mélangées sans le dire.

**Mesure avant d'affirmer.** L'outil `catalog-import` est fait pour ça et se
rejoue en lecture seule.

---

## 4. Ce qui existe, et comment s'en servir

```bash
# lecture seule — effectifs et comptabilité de lecture
go run ./backend/cmd/catalog-import

# lecture seule — recensement des champs, taux de remplissage, types mixtes
go run ./backend/cmd/catalog-import -fields

# lecture seule — normalisation et rapport d'anomalies
go run ./backend/cmd/catalog-import -normalize [-detail 0]

# ÉCRIT — met à niveau le schéma, purge, recharge   (PocketApp fermé)
go run ./backend/cmd/catalog-import -load
```

**Sans `-load`, rien n'est jamais écrit.** Le rechargement est **rejouable** :
il purge puis réécrit, images comprises.

| Fichier | Rôle |
|---|---|
| `backend/migrations/catalog_v2.go` | le schéma cible. Convergent, refuse d'agir si la donnée n'est pas reconstructible |
| `backend/catalog/nedb/` | lecture NeDB — **transitoire**, voir §6 |
| `backend/catalog/normalize/` | traduction vers le modèle cible + anomalies |
| `backend/catalog/load/` | écriture dans PocketBase + copie des images |
| `backend/cmd/catalog-import/` | la commande et ses rapports |

---

## 5. L'état, au 11 août 2026

**T1 à T4 faits, exécutés, vérifiés en base.** Le détail est au §9 de
[`10-plan-migration.md`](10-plan-migration.md).

En base : **2999 produits** (35 en quarantaine pour SKU en doublon),
**463 catégories** avec l'arbre reconstruit sans un parent manquant,
**287 marques**, **43 fournisseurs**, **4665 images** pour 1,7 Go.

**`external_refs` est vide** — c'est T5.

**Les écrans lisent toujours AppPos.** Rien n'a changé pour l'utilisateur, et
c'est voulu : la bascule est T7, derrière un drapeau par défaut sur AppPos.

---

## 6. Ce qu'il reste, dans l'ordre

**T5 — `external_refs`.** Y écrire les correspondances WooCommerce, une ligne
par entité en ligne, `platform = woocommerce`.

**Mesuré le 11 août sur la base de référence** — et non repris d'un document :

| Entité | `woo_id` | `website_url` |
|---|---:|---:|
| products | **2528** | 2528 |
| categories | **209** | **0** |
| brands | **237** | **0** |
| suppliers | 0 | 0 |
| **total** | **2974** | 2528 |

**Trois choses que ce tableau apprend, et qui ne sont écrites nulle part
ailleurs :**

1. **2974, pas 2528.** Le 2528 souvent cité ne compte que les **produits** —
   c'est un compteur de la normalisation, qui ne parcourt les correspondances
   que côté produit. Catégories et marques en portent 446 de plus.
2. **`external_url` sera vide pour les catégories et les marques** :
   `website_url` n'y est jamais renseigné. Seuls les produits en ont une.
3. **Les fournisseurs n'ont aucun `woo_id`** — cohérent avec le modèle, qui ne
   leur prévoit pas de relation dans `external_refs`.

Règle d'intégrité à tenir **par le chargeur** : **un seul** des trois champs
`product` / `category` / `brand` est rempli. Le schéma ne peut pas la porter,
les règles d'API PocketBase ne s'appliquant pas aux écritures par le DAO Go.

**T6 — contrôles de conformité.** Rejouables, en lecture seule. Comptages,
absence de relation orpheline, forme de l'arbre, et surtout : **la règle de
publication dérivée des catégories donne-t-elle le même ensemble qu'AppPos ?**

**T7 — le sélecteur AppPos ↔ PocketBase** dans le module stock, par défaut sur
AppPos. C'est le drapeau de bascule. Le module a **deux implémentations
parallèles de chaque écran** (`BrandList` / `BrandListAppPos`…) : la migration
est l'occasion d'en supprimer une, pas d'en ajouter.

**Alignement TypeScript** — à faire *avant* T7. Le schéma n'a plus `price_ht`,
`cost_price`, `active`, `stock_max`, `unit`, `weight` ; `apppos-transformers.ts`
les construit encore.

**La trajectoire annoncée**, qui change la nature du travail : PocketApp
importera à terme depuis **l'API AppPos**, pas depuis les fichiers NeDB. Le
lecteur `backend/catalog/nedb/` est donc transitoire ; le schéma, la
normalisation, la quarantaine et les contrôles se réutilisent tels quels.

---

## 7. Ce qui traîne, et qu'il ne faut pas perdre

- **35 SKU en doublon**, en quarantaine, jamais tranchés. Décision métier.
- **36 images** n'existent que sur WordPress. Les télécharger suppose un
  `User-Agent` explicite : la couche anti-bot rejette celui de Go.
- **261 homonymes** dans `public/` ; l'index par nom retient le premier, ce qui
  est arbitraire. **Non vérifié.**
- **97 brouillons pourtant en ligne** contre 5 sur la base dev — la publication
  a dérivé, à reprendre avec T5.
- **Faille 3.1** — clés WooCommerce en lecture-écriture dans le bundle public du
  site. **Prioritaire depuis le premier jour, jamais traitée**, et indépendante
  de cette mission.
- `GET /api/settings/pocketapp-key` renvoie une clé déchiffrée **sans garde
  admin** (`backend/routes/secrets_routes.go:125`).
- Les règles d'accès du catalogue sont `@request.auth.id != ''`, **sans
  filtrage par entreprise** : sans effet avec une seule entreprise, faille
  d'isolation dès la deuxième.
- Identifiants AppPos en dur dans huit fichiers.

---

## 8. La démarche — elle a tenu, on la garde

1. **Auditer avant de proposer**, en distinguant *lu dans le code* de
   *rapporté*. Donner le chemin et la ligne.
2. **Mesurer sur les données réelles avant d'affirmer** — et dire sur **quelle
   base**.
3. **Écrire le contrat avant le code** qui le produit ou le consomme.
4. **Découper en tickets mergeables seuls**, sans effet observable au début.
5. **Poser un drapeau de bascule, par défaut sur l'ancienne source.**
6. **Vérifier dans la base ou le navigateur, pas en lisant le code.** Chaque
   chargement de cette mission a été recontrôlé par une lecture SQL directe ;
   c'est ainsi que les quatre défauts ont été trouvés.
7. **Ne rien corriger en silence.** Une anomalie se constate et se rapporte.
   Normaliser c'est traduire ; réparer c'est décider, et la décision appartient
   au propriétaire.

---

## 9. Attentes de travail

- **Répondre en français.**
- Ce dépôt est volumineux : **partir d'un fichier nommé et suivre ses imports**,
  plutôt que d'explorer librement.
- Distinguer ce qui est **lu dans le code** de ce qui est **rapporté**. Ne pas
  présenter le second comme le premier.
- **Perdre le fil vaut mieux que deviner : le dire.**
- Commits en français, sur `main`, sans pousser sans demande.
