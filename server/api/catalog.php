<?php
/**
 * Lecture PUBLIQUE du catalogue, pour le site.
 *
 * C'est l'endpoint que consomme le frontend React d'axemusique.shop. Il lit
 * les tables `ax_*` remplies par products-sync.php.
 *
 * ─── SANS CLÉ, ET C'EST LE POINT CENTRAL ───────────────────────────────────
 * Ce script n'attend AUCUN `X-API-Key`, et il ne doit jamais en attendre.
 *
 * Le consommateur est un bundle JavaScript public : tout secret qu'il porterait
 * serait lisible par n'importe quel visiteur. C'est exactement la faille 3.1 —
 * les clés WooCommerce en lecture-écriture dans le bundle du site, déclarée
 * prioritaire depuis le premier jour. On ne la reproduit pas ici.
 *
 * La protection n'est donc pas une clé, c'est la PORTÉE : ce script ne fait que
 * des SELECT, sur des données déjà destinées à être publiques — celles qu'on a
 * choisi de mettre en ligne. Il n'écrit rien, ne supprime rien, n'expose ni
 * prix d'achat, ni fournisseur, ni marge, ni identifiant interne autre que
 * `legacy_id`.
 *
 * L'écriture, elle, reste derrière products-sync.php et sa clé.
 *
 * PHP 7.4+.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Sortie
// ---------------------------------------------------------------------------

/** @param array<string,mixed> $payload */
function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');

    // Cache court côté navigateur ET côté proxy : le catalogue ne bouge qu'aux
    // exports, et le mutualisé n'aime pas les rafales. Cinq minutes suffisent à
    // absorber un pic sans donner l'impression d'un site figé.
    header('Cache-Control: public, max-age=300');

    // CORS ouvert en lecture. Ce n'est pas un relâchement : la ressource est
    // publique par construction, et sans cet en-tête le site en DÉVELOPPEMENT
    // (localhost:5174) ne peut pas la lire. En production, site et endpoint
    // partagent l'origine et l'en-tête ne sert à rien.
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, OPTIONS');

    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $status, string $message): void
{
    respond($status, ['ok' => false, 'error' => $message]);
}

// Requête préliminaire CORS : répondre et sortir, sans toucher la base.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    respond(204, []);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    fail(405, 'Méthode non autorisée. GET uniquement.');
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Le même config.php que les autres endpoints, dont on ne lit QUE le bloc `db`
// et le préfixe. La clé d'export est dans ce fichier ; elle n'est jamais lue
// ici, et encore moins renvoyée.

$configFile = __DIR__ . '/../config/config.php';
if (!is_file($configFile)) {
    fail(500, 'Configuration absente sur le serveur.');
}

/** @var array<string,mixed> $config */
$config = require $configFile;
$config = array_merge(['db' => [], 'table_prefix' => 'ax_'], is_array($config) ? $config : []);

$db = is_array($config['db']) ? $config['db'] : [];
foreach (['host', 'name', 'user', 'pass'] as $needed) {
    if (!isset($db[$needed]) || !is_string($db[$needed])) {
        fail(500, 'Configuration de base de données incomplète.');
    }
}

$prefix = (string) $config['table_prefix'];
if (preg_match('/^[A-Za-z0-9_]*$/', $prefix) !== 1) {
    fail(500, 'Préfixe de table invalide.');
}

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $db['host'], $db['name']),
        $db['user'],
        $db['pass'],
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    // Le message de PDO porte l'hôte et l'utilisateur : il ne sort jamais.
    fail(500, 'Base de données indisponible.');
}

$T_PRODUCTS = $prefix . 'products';
$T_CATEGORIES = $prefix . 'categories';
$T_BRANDS = $prefix . 'brands';
$T_PRODCAT = $prefix . 'product_categories';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Met en forme un produit pour le site.
 *
 * La liste des champs est EXHAUSTIVE et volontairement courte : ce qui n'y est
 * pas ne sort pas. `purchase_price_ht` n'existe même pas dans ces tables, mais
 * le principe vaut d'être posé — on énumère ce qu'on publie, on ne retire pas
 * ce qu'on cache.
 *
 * @param array<string,mixed> $row
 * @return array<string,mixed>
 */
function present_product(array $row): array
{
    return [
        'id'          => (string) $row['legacy_id'],
        // Le titre du site prime quand il existe ; sinon le libellé de la caisse.
        'title'       => ($row['site_title'] ?? null) !== null && $row['site_title'] !== ''
            ? (string) $row['site_title']
            : (string) $row['name'],
        'slug'        => $row['slug'] !== null ? (string) $row['slug'] : null,
        'sku'         => $row['sku'] !== null ? (string) $row['sku'] : null,
        'description' => $row['description'] !== null ? (string) $row['description'] : null,
        'price_ttc'   => (float) $row['price_ttc'],
        'stock'       => (int) $row['stock'],
        'brand'       => ($row['brand_name'] ?? null) !== null
            ? ['id' => (string) $row['brand'], 'name' => (string) $row['brand_name']]
            : null,
        // Pas de champ image : les images ne sont PAS encore exportées (§7 du
        // contrat). Renvoyer une URL locale de PocketBase donnerait des images
        // cassées sur le site ; ne rien renvoyer laisse le composant afficher
        // une vignette de remplacement, ce qui est honnête.
    ];
}

$PRODUCT_COLUMNS = 'p.legacy_id, p.name, p.site_title, p.slug, p.sku, p.description,
                    p.price_ttc, p.stock, p.brand, b.name AS brand_name';

$action = isset($_GET['action']) ? (string) $_GET['action'] : 'category';

// `limit` vient de l'URL : il est borné, et jamais concaténé — même borné, il
// passe en paramètre lié.
$limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 8;
$limit = max(1, min(48, $limit));

// La pagination va avec : `per_page` prime sur `limit` quand il est fourni,
// pour que la page d'accueil (« montre-m'en 8 ») et la page catégorie
// (« page 3 sur 12 ») ne se disputent pas le même paramètre.
if (isset($_GET['per_page'])) {
    $limit = max(1, min(48, (int) $_GET['per_page']));
}
$page = isset($_GET['page']) ? max(1, (int) $_GET['page']) : 1;
$offset = ($page - 1) * $limit;

try {
    // ── Liste des catégories qui portent des produits ───────────────────────
    if ($action === 'categories') {
        $rows = $pdo->query(sprintf(
            'SELECT c.legacy_id, c.name, c.slug, c.parent, COUNT(pc.product_legacy_id) AS product_count
               FROM `%s` c
               LEFT JOIN `%s` pc ON pc.category_legacy_id = c.legacy_id
              GROUP BY c.legacy_id, c.name, c.slug, c.parent
             HAVING product_count > 0
              ORDER BY product_count DESC, c.name ASC',
            $T_CATEGORIES,
            $T_PRODCAT
        ))->fetchAll();

        respond(200, [
            'ok'         => true,
            'categories' => array_map(static function (array $row): array {
                return [
                    'id'            => (string) $row['legacy_id'],
                    'name'          => (string) $row['name'],
                    'slug'          => $row['slug'] !== null ? (string) $row['slug'] : null,
                    'parent'        => $row['parent'] !== null ? (string) $row['parent'] : null,
                    'product_count' => (int) $row['product_count'],
                ];
            }, $rows),
        ]);
    }

    // ── Recherche ───────────────────────────────────────────────────────────
    // Le site a une recherche ; sans cette action, elle continuerait à
    // interroger WooCommerce pendant que les pages affichent notre catalogue —
    // deux sources visibles côte à côte, avec des prix qui peuvent différer.
    //
    // Recherche volontairement simple : nom, référence, slug. Pas la
    // description, qui contient du HTML et ferait remonter n'importe quoi sur
    // un mot courant. Pas de pertinence pondérée non plus : MySQL 5.7 sans
    // index FULLTEXT sur ces colonnes ne saurait pas la calculer, et une
    // fausse pertinence est pire qu'un ordre alphabétique assumé.
    if ($action === 'search') {
        $query = isset($_GET['q']) ? trim((string) $_GET['q']) : '';

        // Deux caractères minimum : en dessous, la requête ramènerait une part
        // notable des 2562 produits pour rien.
        if (mb_strlen($query) < 2) {
            respond(200, [
                'ok'       => true,
                'query'    => $query,
                'products' => [],
                'total'    => 0,
                'page'     => 1,
                'per_page' => $limit,
            ]);
        }

        // `%` et `_` sont des jokers LIKE : échappés, sinon une recherche sur
        // « 100% » ramènerait tout. La valeur reste un paramètre lié.
        // Pas d'antislash litteral dans ce fichier : addcslashes fait le travail,
        // et chr(92) evite d'ecrire un echappement qui se relit mal.
        $escaped = addcslashes($query, '%_' . chr(92));
        $pattern = '%' . $escaped . '%';

        // TROIS paramètres nommés DISTINCTS pour la même valeur, et ce n'est
        // pas une coquetterie : le PDO est ouvert en préparation NATIVE
        // (ATTR_EMULATE_PREPARES => false, ligne 106), et MySQL n'admet pas
        // qu'un même paramètre nommé serve deux fois dans une requête — il
        // lève HY093, remonté ici en « Lecture du catalogue impossible ».
        // Constaté en production le 12 août 2026.
        $where = '(p.name LIKE :q1 OR p.sku LIKE :q2 OR p.slug LIKE :q3)
                  AND p.status = ' . $pdo->quote('published');

        $st = $pdo->prepare(sprintf(
            'SELECT %s
               FROM `%s` p
          LEFT JOIN `%s` b ON b.legacy_id = p.brand
              WHERE %s
              ORDER BY p.name ASC
              LIMIT :limit OFFSET :offset',
            $PRODUCT_COLUMNS,
            $T_PRODUCTS,
            $T_BRANDS,
            $where
        ));
        foreach (['q1', 'q2', 'q3'] as $name) {
            $st->bindValue(':' . $name, $pattern, PDO::PARAM_STR);
        }
        $st->bindValue(':limit', $limit, PDO::PARAM_INT);
        $st->bindValue(':offset', $offset, PDO::PARAM_INT);
        $st->execute();
        $found = $st->fetchAll();

        $stCount = $pdo->prepare(sprintf(
            'SELECT COUNT(*) AS total FROM `%s` p WHERE %s',
            $T_PRODUCTS,
            $where
        ));
        // Le comptage réutilise le MÊME $where : il porte donc les mêmes trois
        // paramètres, et les oublier ici aurait reproduit la panne à l'identique.
        foreach (['q1', 'q2', 'q3'] as $name) {
            $stCount->bindValue(':' . $name, $pattern, PDO::PARAM_STR);
        }
        $stCount->execute();

        respond(200, [
            'ok'       => true,
            'query'    => $query,
            'products' => array_map('present_product', $found),
            'total'    => (int) ($stCount->fetch()['total'] ?? 0),
            'page'     => $page,
            'per_page' => $limit,
        ]);
    }

    // ── Un produit, par son slug ────────────────────────────────────────────
    // Sert la page produit du site. Le slug est la clé d'adressage publique —
    // et il est figé au premier envoi (§4.5 du contrat d'export), ce qui est
    // exactement ce qui rend cette route stable.
    if ($action === 'product') {
        $slug = isset($_GET['slug']) ? (string) $_GET['slug'] : '';
        $id = isset($_GET['id']) ? (string) $_GET['id'] : '';

        if ($slug === '' && $id === '') {
            fail(400, 'Produit : slug ou id attendu.');
        }

        $st = $pdo->prepare(sprintf(
            'SELECT %s
               FROM `%s` p
          LEFT JOIN `%s` b ON b.legacy_id = p.brand
              WHERE %s = ?
                AND p.status = \'published\'
              LIMIT 1',
            $PRODUCT_COLUMNS,
            $T_PRODUCTS,
            $T_BRANDS,
            $slug !== '' ? 'p.slug' : 'p.legacy_id'
        ));
        $st->execute([$slug !== '' ? $slug : $id]);

        $row = $st->fetch();
        if (!$row) {
            fail(404, 'Produit introuvable.');
        }

        // Les catégories du produit, pour le fil d'Ariane. Sans elles, la page
        // produit n'a aucun moyen de dire d'où vient le visiteur.
        $st = $pdo->prepare(sprintf(
            'SELECT c.legacy_id, c.name, c.slug, c.parent
               FROM `%s` c
               JOIN `%s` pc ON pc.category_legacy_id = c.legacy_id
              WHERE pc.product_legacy_id = ?
              ORDER BY c.name ASC',
            $T_CATEGORIES,
            $T_PRODCAT
        ));
        $st->execute([$row['legacy_id']]);

        respond(200, [
            'ok'         => true,
            'product'    => present_product($row),
            'categories' => array_map(static function (array $c): array {
                return [
                    'id'     => (string) $c['legacy_id'],
                    'name'   => (string) $c['name'],
                    'slug'   => $c['slug'] !== null ? (string) $c['slug'] : null,
                    'parent' => $c['parent'] !== null ? (string) $c['parent'] : null,
                ];
            }, $st->fetchAll()),
        ]);
    }

    // ── Une catégorie et ses produits ───────────────────────────────────────
    if ($action === 'category') {
        $id = isset($_GET['id']) ? (string) $_GET['id'] : '';
        $slug = isset($_GET['slug']) ? (string) $_GET['slug'] : '';

        if ($id !== '') {
            $st = $pdo->prepare(sprintf(
                'SELECT legacy_id, name, slug, description FROM `%s` WHERE legacy_id = ?',
                $T_CATEGORIES
            ));
            $st->execute([$id]);
        } elseif ($slug !== '') {
            $st = $pdo->prepare(sprintf(
                'SELECT legacy_id, name, slug, description FROM `%s` WHERE slug = ?',
                $T_CATEGORIES
            ));
            $st->execute([$slug]);
        } else {
            // Sans désignation, on prend la catégorie la mieux fournie : c'est
            // ce que veut une page d'accueil qui montre « une » catégorie.
            $st = $pdo->query(sprintf(
                'SELECT c.legacy_id, c.name, c.slug, c.description
                   FROM `%s` c
                   JOIN `%s` pc ON pc.category_legacy_id = c.legacy_id
                  GROUP BY c.legacy_id, c.name, c.slug, c.description
                  ORDER BY COUNT(pc.product_legacy_id) DESC
                  LIMIT 1',
                $T_CATEGORIES,
                $T_PRODCAT
            ));
        }

        $category = $st->fetch();
        if (!$category) {
            fail(404, 'Catégorie introuvable.');
        }

        // ── La catégorie ET SA DESCENDANCE ──────────────────────────────
        //
        // Constaté à l'usage : une catégorie de pur classement ne porte aucun
        // produit en propre — « Guitares folk » affichait « 15 produits » alors
        // que ses cinq enfants en portent 78. Un visiteur qui clique une
        // rubrique du menu attend ce qu'elle CONTIENT, descendance comprise,
        // et c'est aussi ce que fait WooCommerce.
        //
        // Pas de requête récursive : MySQL 5.7 du mutualisé n'a pas de CTE.
        // L'arbre entier tient en une lecture — 463 catégories — et la
        // descendance se calcule ensuite en PHP, sans aller-retour par niveau.
        // `name` et `slug` sont lus au passage : ils servent au fil d'Ariane,
        // qui remonte la chaîne des parents. Les relire dans une seconde
        // requête pour trois ou quatre ancêtres serait payer un aller-retour
        // par niveau.
        $tree = $pdo->query(sprintf(
            'SELECT legacy_id, parent, name, slug FROM `%s`',
            $T_CATEGORIES
        ))->fetchAll();

        $childrenOf = [];
        $nodeById = [];
        foreach ($tree as $row) {
            $nodeById[(string) $row['legacy_id']] = $row;

            $parent = $row['parent'];
            if ($parent === null || $parent === '') {
                continue;
            }
            $childrenOf[(string) $parent][] = (string) $row['legacy_id'];
        }

        /**
         * Les ancêtres d'une catégorie, de la RACINE vers le parent direct —
         * l'ordre dans lequel un fil d'Ariane se lit. La catégorie elle-même
         * n'y figure pas : c'est à l'affichage de la poser en dernier.
         *
         * Garde-fou sur les visités, comme pour la descente : `parent` est une
         * colonne libre et un cycle ferait tourner la remontée sans fin.
         *
         * @return array<int,array<string,string|null>>
         */
        $ancestorsOf = static function (string $startId) use ($nodeById): array {
            $chain = [];
            $seen = [];
            $current = $nodeById[$startId]['parent'] ?? null;

            while ($current !== null && $current !== '' && isset($nodeById[(string) $current])) {
                $key = (string) $current;
                if (isset($seen[$key])) {
                    break;
                }
                $seen[$key] = true;

                $node = $nodeById[$key];
                array_unshift($chain, [
                    'id'   => (string) $node['legacy_id'],
                    'name' => (string) $node['name'],
                    'slug' => $node['slug'] !== null ? (string) $node['slug'] : null,
                ]);

                $current = $node['parent'];
            }

            return $chain;
        };

        /**
         * Identifiants d'une branche, racine comprise.
         *
         * Le jeu des visités n'est pas décoratif : `parent` est une colonne
         * libre, rien n'interdit un cycle, et sans lui la descente tournerait
         * indéfiniment.
         *
         * @return string[]
         */
        $branchOf = static function (string $rootId) use ($childrenOf): array {
            $seen = [$rootId => true];
            $stack = [$rootId];

            while ($stack !== []) {
                $current = array_pop($stack);
                foreach ($childrenOf[$current] ?? [] as $child) {
                    if (!isset($seen[$child])) {
                        $seen[$child] = true;
                        $stack[] = $child;
                    }
                }
            }

            return array_keys($seen);
        };

        $branch = $branchOf((string) $category['legacy_id']);

        $branchPlaceholders = implode(',', array_fill(0, count($branch), '?'));
        // DISTINCT, et non GROUP BY : un produit rattaché à deux catégories de
        // la même branche remonterait deux fois. Toutes les colonnes venant du
        // produit, les doublons sont des lignes identiques et DISTINCT suffit —
        // là où un GROUP BY buterait sur ONLY_FULL_GROUP_BY, actif par défaut
        // en MySQL 5.7.
        //
        // Paramètres tous positionnels : PDO refuse de mélanger nommés et
        // positionnels dans une même requête, et la liste de branche est de
        // longueur variable.
        $st = $pdo->prepare(sprintf(
            'SELECT DISTINCT %s
               FROM `%s` p
               JOIN `%s` pc ON pc.product_legacy_id = p.legacy_id
          LEFT JOIN `%s` b ON b.legacy_id = p.brand
              WHERE pc.category_legacy_id IN (%s)
                AND p.status = \'published\'
              ORDER BY p.name ASC
              LIMIT ? OFFSET ?',
            $PRODUCT_COLUMNS,
            $T_PRODUCTS,
            $T_PRODCAT,
            $T_BRANDS,
            $branchPlaceholders
        ));

        $position = 1;
        foreach ($branch as $branchId) {
            $st->bindValue($position++, $branchId, PDO::PARAM_STR);
        }
        $st->bindValue($position++, $limit, PDO::PARAM_INT);
        $st->bindValue($position, $offset, PDO::PARAM_INT);
        $st->execute();
        $products = $st->fetchAll();

        // ── Les sous-catégories, comptées SUR LEUR BRANCHE ──────────────
        //
        // Le décompte d'un enfant doit obéir à la même règle que celui du
        // parent, sans quoi la pastille « Folk 27 » mènerait à une page qui en
        // affiche 30 — et c'est l'interface qui aurait l'air fausse.
        //
        // Une seule requête pour tout le monde : les couples
        // (catégorie, produit) de la branche. Le parent en compte au plus
        // quelques centaines ; les regrouper en PHP coûte moins qu'une requête
        // de comptage par enfant.
        $pairsSt = $pdo->prepare(sprintf(
            'SELECT pc.category_legacy_id, pc.product_legacy_id
               FROM `%s` pc
               JOIN `%s` p ON p.legacy_id = pc.product_legacy_id
              WHERE pc.category_legacy_id IN (%s)
                AND p.status = \'published\'',
            $T_PRODCAT,
            $T_PRODUCTS,
            $branchPlaceholders
        ));
        $pairsSt->execute($branch);

        $productsByCategory = [];
        foreach ($pairsSt->fetchAll() as $pair) {
            $productsByCategory[(string) $pair['category_legacy_id']][] =
                (string) $pair['product_legacy_id'];
        }

        /** Produits d'une branche, dédoublonnés — un produit rattaché à deux
         *  catégories sœurs ne compte qu'une fois dans leur ancêtre. */
        $branchProductCount = static function (string $rootId) use ($branchOf, $productsByCategory): int {
            $seen = [];
            foreach ($branchOf($rootId) as $categoryId) {
                foreach ($productsByCategory[$categoryId] ?? [] as $productId) {
                    $seen[$productId] = true;
                }
            }
            return count($seen);
        };

        // Le total obéit à la MÊME règle que les pastilles d'enfants, et il
        // est calculé par la même fonction : deux comptages écrits séparément
        // finiraient par diverger, et c'est précisément l'incohérence qu'on
        // vient de corriger.
        $total = $branchProductCount((string) $category['legacy_id']);

        $childrenSt = $pdo->prepare(sprintf(
            'SELECT legacy_id, name, slug FROM `%s` WHERE parent = ? ORDER BY name ASC',
            $T_CATEGORIES
        ));
        $childrenSt->execute([$category['legacy_id']]);

        $children = [];
        foreach ($childrenSt->fetchAll() as $child) {
            $count = $branchProductCount((string) $child['legacy_id']);
            // Une branche vide est une impasse pour le visiteur : on ne la
            // propose pas.
            if ($count === 0) {
                continue;
            }
            $children[] = [
                'id'            => (string) $child['legacy_id'],
                'name'          => (string) $child['name'],
                'slug'          => $child['slug'] !== null ? (string) $child['slug'] : null,
                'product_count' => $count,
            ];
        }

        respond(200, [
            'ok'       => true,
            'category' => [
                'id'          => (string) $category['legacy_id'],
                'name'        => (string) $category['name'],
                'slug'        => $category['slug'] !== null ? (string) $category['slug'] : null,
                'description' => $category['description'] !== null ? (string) $category['description'] : null,
            ],
            // De la racine au parent direct. Vide pour une catégorie racine.
            'ancestors' => $ancestorsOf((string) $category['legacy_id']),
            'children' => $children,
            'products' => array_map('present_product', $products),
            'total'    => $total,
            'page'     => $page,
            'per_page' => $limit,
        ]);
    }

    fail(400, 'Action inconnue. Attendues : category, categories, product, search.');
} catch (PDOException $e) {
    fail(500, 'Lecture du catalogue impossible.');
}
