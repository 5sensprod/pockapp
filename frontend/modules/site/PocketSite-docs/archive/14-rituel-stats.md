# Rituel — rebrancher le bandeau de statistiques sur notre catalogue

> **EXÉCUTÉ LE 20 AOÛT 2026. Archivé : il ne fait plus foi sur l'état.**
>
> L'autorité est passée à [`../12-contrat-catalogue.md`](../12-contrat-catalogue.md)
> §6 bis, qui liste les actions de `catalog.php`. Ce fichier garde sa valeur de
> méthode : il a été suivi tel quel, du SQL à la vérification.
>
> **Ce qui a été fait au-delà du rituel**, dans la même session :
>
> - **`action=brands`** — non prévue ici. Le §« Ce que ce ticket ne fait pas »
>   annonçait que `BrandCarousel` ne reviendrait pas faute de logos. Le miroir
>   d'images les a publiés entre-temps : **179 marques sur 218 portent un logo**
>   au 20 août 2026, et le carrousel est revenu sur l'accueil le jour même.
> - **`action=latest`** — non prévue ici non plus. Voir
>   [`../13-dates-produits.md`](../13-dates-produits.md) : le tri porte sur
>   `exported_at`, ce n'est pas une date d'arrivée, et le libellé le dit.
> - **Le comptage des marques est celui du rituel**, sans le garde
>   `p.brand <> ''` proposé en cours de route puis écarté.
>
> **Ce qui a été mesuré et qui n'était pas prévu :** `stats.categories` (199) ne
> s'accorde PAS avec `action=categories`, qui ne filtre pas sur `status` —
> l'étape 4 demandait cette cohérence, elle n'est pas atteignable en l'état.
> C'est `action=categories` qui est en cause, pas `stats`.

**Écrit le 13 août 2026.** Petit ticket, entièrement décrit ici : le SQL, la
forme JSON, les modifications du site, la vérification. Exécutable par un agent
ou à la main, sans rien deviner.

**Ce n'est pas urgent.** Le bandeau est aujourd'hui masqué sous le drapeau, ce
qui est un état correct — pas une panne.

## Pourquoi le bandeau est masqué

`AnimatedStats.jsx` (dépôt du site) affiche trois nombres :

| Nombre | Source actuelle | Ligne |
|---|---|---|
| **Produits** | `getTotalProductsCount()` — WooCommerce | `:147` |
| **Marques partenaires** | `getBrands().length` — WooCommerce | `:170` |
| **Années d'existence** | `26`, écrit en dur | `:193` |

Sous `VITE_USE_AXE_CATALOG=true`, les deux premiers annonceraient au visiteur le
volume d'un catalogue qui n'est plus celui que le site lui montre. Le composant
est donc retiré de `Home.jsx` sous le drapeau, le 13 août 2026.

## Pourquoi l'API actuelle ne suffit pas

`server/api/catalog.php` expose `categories`, `category`, `product`, `search`.
Aucune ne rend ce qu'il faut :

- **aucune action `brands`** — la table `ax_brands` existe pourtant ;
- **aucun total de produits.** Additionner les `product_count` de
  `action=categories` donnerait un chiffre **faux dans les deux sens** : un
  produit rattaché à deux catégories serait compté deux fois, un produit sans
  catégorie ne serait pas compté du tout. Ne pas prendre ce raccourci.

## La décision à prendre AVANT d'écrire

**Compte-t-on toutes les marques, ou seulement celles qui portent un produit en
ligne ?** Le catalogue en porte 287 (`CLAUDE.md`), mais le site n'en montre
qu'une partie — celles rattachées à un produit exporté.

Afficher « 287 marques partenaires » quand le site n'en expose qu'une fraction
serait le même défaut que celui qui a fait masquer le bandeau. **Le rituel
retient donc les marques ayant au moins un produit publié**, et la même logique
vaut pour les catégories. Si l'arbitrage commercial est différent, il se tranche
ici, pas dans le code.

## Étape 1 — l'action `stats` dans `catalog.php`

À insérer avec les autres actions, avant le `fail(400, 'Action inconnue…')`.
Trois `COUNT`, aucun paramètre d'entrée, donc aucune valeur à lier.

```php
if ($action === 'stats') {
    // Seuls les produits publiés : ce sont les seuls que le site affiche.
    $produits = (int) $pdo->query(sprintf(
        'SELECT COUNT(*) FROM `%s` WHERE status = %s',
        $T_PRODUCTS,
        $pdo->quote('published')
    ))->fetchColumn();

    // Marques et catégories PORTANT au moins un produit publié — voir la
    // décision ci-dessus. Une marque sans produit en ligne n'est pas une
    // marque que le visiteur peut trouver.
    $marques = (int) $pdo->query(sprintf(
        'SELECT COUNT(DISTINCT p.brand) FROM `%s` p
          WHERE p.brand IS NOT NULL AND p.status = %s',
        $T_PRODUCTS,
        $pdo->quote('published')
    ))->fetchColumn();

    $categories = (int) $pdo->query(sprintf(
        'SELECT COUNT(DISTINCT pc.category_legacy_id)
           FROM `%s` pc
           JOIN `%s` p ON p.legacy_id = pc.product_legacy_id
          WHERE p.status = %s',
        $T_PRODCAT,
        $T_PRODUCTS,
        $pdo->quote('published')
    ))->fetchColumn();

    respond(200, [
        'ok'         => true,
        'products'   => $produits,
        'brands'     => $marques,
        'categories' => $categories,
    ]);
}
```

Puis **mettre à jour le message de l'action inconnue**, qui énumère les actions
admises — il a déjà été oublié une fois lors de l'ajout de `search`.

**Redéposer le fichier par FTP.** Tant que ce n'est pas fait, l'endpoint répond
`Action inconnue` : ce n'est pas un bogue du site.

## Étape 2 — vérifier le serveur AVANT de toucher au site

```bash
curl -s "https://axemusique.shop/server/api/catalog.php?action=stats"
```

Attendu : `{"ok":true,"products":…,"brands":…,"categories":…}`.

**Si la réponse est `{"ok":false,"error":"Lecture du catalogue impossible."}`**,
c'est une `PDOException`, pas une action manquante — le SQL est en cause. C'est
exactement le symptôme du HY093 rencontré sur `search` le 13 août 2026 :
paramètre nommé réutilisé dans une requête préparée nativement. Le code
ci-dessus n'en utilise aucun, mais le réflexe de lecture reste le bon.

## Étape 3 — le côté site

Dépôt `I:\divi-child\frontend-wp`. Trois modifications, aucune sur les pages
WooCommerce.

1. **`src/services/axeCatalog.js`** — ajouter, sur le motif des autres
   fonctions, sans aucune clé :

   ```js
   /** Les décomptes du catalogue en ligne. */
   export async function fetchCatalogStats() {
     return await callCatalog({ action: "stats" });
   }
   ```

2. **`src/components/UI/AnimatedStats.jsx`** — dans le `useEffect` qui charge
   les chiffres (`:110`), brancher sur `fetchCatalogStats()` quand
   `API_CONFIG.useAxeCatalog` vaut `true`, et **ne plus importer WooCommerce
   dans ce cas** : l'import est dynamique (`await import(...)`), il suffit de ne
   pas l'exécuter. Le repli actuel (`products.length || 1000`, `50`) doit
   disparaître sous le drapeau : **un chiffre inventé est pire qu'un bandeau
   absent.** En cas d'échec, ne rien afficher.

3. **`src/pages/Home.jsx`** — sortir `AnimatedStats` du bloc
   `{!API_CONFIG.useAxeCatalog && (…)}` qui le masque aujourd'hui, en y laissant
   `BrandCarousel`, qui attend toujours ses logos.

## Étape 4 — la vérification, dans le navigateur

Pas en relisant le code. `npm run dev`, `VITE_USE_AXE_CATALOG=true` :

- le bandeau s'affiche sur l'accueil, avec trois nombres non nuls ;
- l'onglet réseau montre **`catalog.php?action=stats`** et **aucun appel
  `wp-json`** sur la page d'accueil — c'est le vrai test de la coupure ;
- les nombres sont cohérents avec la boutique : le nombre de catégories doit
  correspondre au « N rayons à parcourir » de `/shop`, qui lit
  `action=categories`. **Un écart ici signale que les deux comptages ne
  s'accordent pas**, et c'est le genre de divergence qui s'est déjà produite
  côté serveur (§6 bis du contrat) ;
- avec le drapeau à `false`, le bandeau doit rester **exactement** ce qu'il
  était, sur WooCommerce.

## Pièges connus

- **`Cache-Control: public, max-age=300`** sur toutes les réponses de
  `catalog.php` : un chiffre corrigé côté serveur peut mettre cinq minutes à
  apparaître. Ne pas conclure trop vite à un échec.
- **Le mode strict de React double chaque requête en développement.** Deux
  lignes identiques dans l'onglet réseau ne sont pas une boucle.
- **Ne pas ajouter de clé** dans `axeCatalog.js` : ce fichier part dans le
  bundle public. C'est le point central de l'endpoint de lecture
  ([`12-contrat-catalogue.md`](../12-contrat-catalogue.md) §6 bis).
- **Ne pas toucher aux pages WooCommerce** : elles restent le comportement par
  défaut tant que le drapeau vaut `false`.

## Ce que ce ticket ne fait pas

Il ne ramène pas `BrandCarousel`, qui a besoin des **logos** — non exportés
(§7 du contrat). Le décompte des marques et l'affichage des marques sont deux
sujets distincts ; celui-ci ne dépend pas de la session images.
