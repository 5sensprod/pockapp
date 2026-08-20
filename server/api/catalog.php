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

/**
 * Préfixe d'URL publique des médias, ou chaîne vide s'il n'est pas configuré.
 *
 * `image_paths` en base ne porte que du RELATIF (« brands/pa_x/0.png ») ; ce
 * préfixe est ce qui en fait une URL. Il n'est lu QUE ici, et une barre finale
 * est garantie — config.php la porte déjà, mais rien ne l'impose.
 */
define('MEDIA_BASE_URL', is_string($config['media_base_url'] ?? null) && $config['media_base_url'] !== ''
    ? rtrim((string) $config['media_base_url'], '/') . '/'
    : '');

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
 * `$withGallery` n'est vrai que pour la FICHE produit — voir le bloc « Les
 * images du produit » plus bas, qui dit pourquoi. Les deux actions de liste
 * appellent par `array_map('present_product', …)`, qui ne passe qu'un seul
 * argument : le défaut `false` s'y applique de lui-même.
 *
 * @param array<string,mixed> $row
 * @return array<string,mixed>
 */
function present_product(array $row, bool $withGallery = false): array
{
    $product = [
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
        // `image` est presque toujours null, et c'est le cas NORMAL, pas une
        // erreur : trois marques sur 288 ont leurs octets en ligne au 19 août
        // 2026 (inventaire images-sync.php, mesuré). Le site doit traiter
        // l'absence comme la situation ordinaire.
        'brand'       => ($row['brand_name'] ?? null) !== null
            ? [
                'id'    => (string) $row['brand'],
                'name'  => (string) $row['brand_name'],
                'image' => brand_image_url(
                    ($row['brand_image_paths'] ?? null) !== null
                        ? (string) $row['brand_image_paths']
                        : null
                ),
            ]
            : null,
    ];

    // ── Les images du produit ───────────────────────────────────────────────
    //
    // Le commentaire qui tenait cette place disait « pas de champ image : les
    // images de produits ne sont pas exportées ». C'était vrai jusqu'au
    // 20 août 2026 ; le miroir accepte `products` depuis, et un produit est
    // en ligne (mesuré à l'inventaire). La décision a changé, donc le
    // commentaire aussi.
    //
    // `image` — le rang 0 — est rendu par les TROIS actions : les grilles de
    // `category` et les résultats de `search` en ont besoin, c'est même leur
    // seul usage d'image.
    //
    // `gallery` — les rangs 1..n — n'est rendu QUE par `product`, la fiche.
    // Ce n'est pas une économie d'octets (trois URL pèsent ~200 octets, à
    // comparer aux milliers de la description) : c'est qu'AUCUNE grille
    // n'affiche de galerie. Un champ publié sans consommateur est un champ
    // qu'il faut porter, faire évoluer et ne jamais casser, pour rien.
    //
    // Et il est ABSENT des listes, pas vide : un tableau vide affirmerait
    // « ce produit n'a pas de galerie », ce qui serait faux. L'absence dit
    // « non demandé ». Sur la fiche il est TOUJOURS là, éventuellement vide.
    $images = media_urls(($row['product_image_paths'] ?? null) !== null
        ? (string) $row['product_image_paths']
        : null);

    // Presque toujours null, et c'est le cas NORMAL, pas une panne : UN produit
    // sur 2412 publiés est en ligne au 20 août 2026 (inventaire images-sync.php,
    // mesuré). Ils partent un par un, à la main.
    $product['image'] = $images[0] ?? null;

    if ($withGallery) {
        // Le rang 0 n'y est PAS : il est déjà dans `image`, et l'y remettre
        // ferait afficher la principale deux fois. Un carrousel qui la veut en
        // tête compose `[image, ...gallery]` — c'est à lui de le dire.
        $product['gallery'] = array_slice($images, 1);
    }

    return $product;
}

/**
 * URL publique du LOGO d'une marque, ou null.
 *
 * §6.5 de la conception laissait ouvert : URL complète, ou chemin relatif que
 * le bundle compose avec media_base_url ? **Tranché ici : URL COMPLÈTE.**
 *
 * Trois raisons, dans cet ordre :
 *
 * 1. Le bundle du site est PUBLIC et DÉJÀ EN PRODUCTION. Lui faire composer
 *    l'URL veut dire y poser le préfixe — en dur, ou par une variable de build
 *    de plus. Déplacer les médias demanderait alors un rebuild ET un
 *    redéploiement du site, en plus du serveur.
 * 2. Le préfixe n'a qu'UNE source de vérité, `media_base_url` dans config.php,
 *    et le serveur est le seul à la connaître : la base ne porte que le chemin
 *    RELATIF (`image_paths`). Composer ici, c'est ne jamais avoir deux copies
 *    du préfixe à tenir d'accord.
 * 3. Le coût est de quelques dizaines d'octets par produit, sur une réponse
 *    qui en porte déjà des milliers de description.
 *
 * Corollaire, et il vaut des deux côtés : le site consomme cette valeur TELLE
 * QUELLE. Il ne la préfixe jamais.
 *
 * La lecture elle-même est dans `media_urls()`, partagée avec les images du
 * produit depuis le 20 août 2026 : `image_paths` fait foi, jamais le contenu
 * du répertoire, et l'absence de `media_base_url` rend null.
 */
function brand_image_url(?string $imagePaths): ?string
{
    // Une marque n'expose que son logo : le rang 0 de sa liste, et rien
    // d'autre. Une page produit veut un logo, pas la galerie de la marque.
    return media_urls($imagePaths)[0] ?? null;
}

/**
 * La liste ORDONNÉE des URL publiques d'une colonne `image_paths`, ou [].
 *
 * C'est la couche basse : `brand_image_url()` en prend le rang 0, la fiche
 * produit en prend tout. Elle a été extraite le 20 août 2026, quand les images
 * de produits sont arrivées — deux appelants voulaient la même lecture, l'un
 * d'un seul rang, l'autre de tous. Deux fonctions séparées auraient dupliqué
 * la validation ; c'est elle qui vaut d'être partagée, pas une abstraction sur
 * la notion d'entité.
 *
 * ─── `image_paths` FAIT FOI, JAMAIS LE RÉPERTOIRE ─────────────────────────
 * Les rangs abandonnés et les extensions périmées dorment sur le disque du
 * mutualisé : rien ne les efface (images-sync.php n'a pas de balayage). Un
 * `scandir` rendrait donc des images que plus personne ne désigne. On ne lit
 * que cette colonne, et le nom distant n'est jamais recomposé ici — il est
 * calculé à l'écriture, et transporté seulement dans ce JSON.
 *
 * L'ORDRE est le sens : rang 0 = image principale, rangs suivants = galerie
 * telle qu'elle a été rangée. Ne jamais trier cette liste.
 *
 * Sans `media_base_url` en configuration, on rend [] plutôt que des chemins
 * relatifs : mieux vaut pas d'image qu'une URL que personne ne sait résoudre.
 *
 * @return list<string>
 */
function media_urls(?string $imagePaths): array
{
    if ($imagePaths === null || $imagePaths === '' || MEDIA_BASE_URL === '') {
        return [];
    }

    $paths = json_decode($imagePaths, true);
    if (!is_array($paths)) {
        return [];
    }

    // Une LISTE, pas un objet : la clé EST le rang, et `{"a": "…"}` n'en a
    // pas. `array_is_list()` ferait ça en un mot, mais il demande PHP 8.1 et
    // ce fichier vise 7.4 (en-tête) — le mutualisé décide, pas nous.
    if (array_keys($paths) !== range(0, count($paths) - 1)) {
        return [];
    }

    $urls = [];
    foreach ($paths as $path) {
        if (!is_string($path) || $path === '') {
            // Un trou dans la liste décalerait tous les rangs suivants, et le
            // rang porte le SENS (0 = principale). On s'arrête au trou plutôt
            // que de le sauter — comme le fait images-sync.php à la lecture
            // des `image_<rang>` reçus, « en s'arrêtant au premier trou ».
            break;
        }

        // Le chemin vient de NOTRE base, écrit par images-sync.php, qui
        // n'accepte ni nom venu du client ni extension hors liste fermée.
        // Ceinture tout de même : rien qui remonte l'arborescence ne sort
        // d'ici, et on s'arrête plutôt que de renuméroter la suite.
        if (strpos($path, '..') !== false) {
            break;
        }

        $urls[] = MEDIA_BASE_URL . ltrim($path, '/');
    }

    return $urls;
}

// Deux colonnes `image_paths`, et il faut les distinguer : celle de la MARQUE
// (`b.`) et celle du PRODUIT (`p.`) portent le même nom dans leurs tables
// respectives. Sans alias, la seconde écraserait la première dans la ligne
// rendue par PDO, et le logo de marque disparaîtrait sans erreur.
//
// Chacune est la liste ORDONNÉE des chemins relatifs, en JSON, écrite par
// images-sync.php. Les trois requêtes qui utilisent ces colonnes joignent déjà
// `ax_brands` en LEFT JOIN — rien d'autre à changer.
$PRODUCT_COLUMNS = 'p.legacy_id, p.name, p.site_title, p.slug, p.sku, p.description,
                    p.price_ttc, p.stock, p.brand, b.name AS brand_name,
                    b.image_paths AS brand_image_paths,
                    p.image_paths AS product_image_paths';

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
            // Seul appel avec la galerie : c'est la fiche, le seul écran qui
            // l'affiche.
            'product'    => present_product($row, true),
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

    // ── Les décomptes du bandeau de statistiques ────────────────────────────
    //
    // Trois COUNT, aucun paramètre d'entrée : rien à lier, rien à échapper.
    //
    // Marques et catégories sont comptées PORTANT au moins un produit publié,
    // pas dans l'absolu : le catalogue en porte 287, le site n'en expose
    // qu'une part, et annoncer le volume de la caisse au visiteur serait le
    // défaut même qui a fait masquer le bandeau
    // (14-rituel-stats.md, « La décision à prendre AVANT d'écrire »).
    if ($action === 'stats') {
        // Seuls les produits publiés : ce sont les seuls que le site affiche.
        $produits = (int) $pdo->query(sprintf(
            'SELECT COUNT(*) FROM `%s` WHERE status = %s',
            $T_PRODUCTS,
            $pdo->quote('published')
        ))->fetchColumn();

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

    fail(400, 'Action inconnue. Attendues : category, categories, product, search, stats.');
} catch (PDOException $e) {
    fail(500, 'Lecture du catalogue impossible.');
}
