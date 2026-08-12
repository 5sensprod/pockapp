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

        // Les produits de la catégorie ELLE-MÊME, sans descendance : la
        // hiérarchie est reconstruite côté site s'il en a besoin, et une
        // requête récursive sur un mutualisé en MySQL 5.7 n'est pas une bonne
        // idée.
        $st = $pdo->prepare(sprintf(
            'SELECT %s
               FROM `%s` p
               JOIN `%s` pc ON pc.product_legacy_id = p.legacy_id
          LEFT JOIN `%s` b ON b.legacy_id = p.brand
              WHERE pc.category_legacy_id = :category
                AND p.status = \'published\'
              ORDER BY p.name ASC
              LIMIT :limit',
            $PRODUCT_COLUMNS,
            $T_PRODUCTS,
            $T_PRODCAT,
            $T_BRANDS
        ));
        $st->bindValue(':category', $category['legacy_id'], PDO::PARAM_STR);
        $st->bindValue(':limit', $limit, PDO::PARAM_INT);
        $st->execute();

        respond(200, [
            'ok'       => true,
            'category' => [
                'id'          => (string) $category['legacy_id'],
                'name'        => (string) $category['name'],
                'slug'        => $category['slug'] !== null ? (string) $category['slug'] : null,
                'description' => $category['description'] !== null ? (string) $category['description'] : null,
            ],
            'products' => array_map('present_product', $st->fetchAll()),
        ]);
    }

    fail(400, 'Action inconnue. Attendues : category, categories.');
} catch (PDOException $e) {
    fail(500, 'Lecture du catalogue impossible.');
}
