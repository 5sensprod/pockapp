<?php
/**
 * Endpoint d'export du catalogue vers la base SQL Axemusique.
 *
 * Deux opérations, décrites par
 * frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md :
 *
 *   GET  ?action=inventory  → ce que la base contient déjà (legacy_id → checksum)
 *   POST                    → upsert d'un lot d'entités
 *
 * **Le contrat fait autorité.** Toute divergence entre ce fichier et lui est un
 * bogue de ce fichier.
 *
 * Ce script ne DÉCIDE de rien : il n'interprète pas `status`, ne calcule pas ce
 * qui est publiable, ne recalcule pas les checksums. La règle de mise en ligne
 * vit dans PocketApp ; ici on écrit ce qu'on reçoit (§2 du contrat).
 *
 * Aucun secret ici : identifiants de base et clé API vivent dans
 * ../config/config.php, non versionné.
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
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** @param string[] $errors */
function reject(int $status, string $message, array $errors = []): void
{
    respond($status, ['ok' => false, 'error' => $message, 'errors' => $errors]);
}

/** @param array<string,mixed> $config */
function sync_log(array $config, string $line): void
{
    if (empty($config['log_file'])) {
        return;
    }
    @file_put_contents(
        $config['log_file'],
        sprintf("%s\t%s\n", gmdate('c'), $line),
        FILE_APPEND | LOCK_EX
    );
}

/**
 * PHP 7.4 n'a pas array_is_list().
 * @param array<mixed> $value
 */
function is_list_compat(array $value): bool
{
    if ($value === []) {
        return true;
    }
    return array_keys($value) === range(0, count($value) - 1);
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

$configFile = __DIR__ . '/../config/config.php';

if (!is_file($configFile)) {
    reject(500, 'Configuration absente sur le serveur.');
}

/** @var array<string,mixed> $config */
$config = require $configFile;

$defaults = [
    'catalog_api_key'             => '',
    'db'                          => [],
    'table_prefix'                => 'ax_',
    // Clé DISTINCTE de `max_body_bytes`, qui appartient à publish-menu.php et
    // vaut 256 Kio : les deux endpoints partagent config.php, et un lot de 200
    // produits dépasse largement le plafond d'un menu.
    'catalog_max_body_bytes'      => 1048576, // 1 Mio — §6 du contrat
    'max_entities_per_batch'      => 200,     // §6 du contrat
    'supported_contract_versions' => [1],
    'log_file'                    => null,
];
$config = array_merge($defaults, is_array($config) ? $config : []);

if (!is_string($config['catalog_api_key']) || strlen($config['catalog_api_key']) < 16) {
    reject(500, 'Configuration invalide sur le serveur : catalog_api_key.');
}

$db = is_array($config['db']) ? $config['db'] : [];
foreach (['host', 'name', 'user', 'pass'] as $needed) {
    if (!isset($db[$needed]) || !is_string($db[$needed])) {
        reject(500, sprintf('Configuration invalide sur le serveur : db.%s.', $needed));
    }
}

$prefix = (string) $config['table_prefix'];
// Le préfixe entre dans des noms de table, donc dans du SQL non paramétrable.
// Il vient de la configuration et non de la requête, mais on le contraint tout
// de même : une valeur fantaisiste ici serait une injection à porte ouverte.
if (preg_match('/^[A-Za-z0-9_]*$/', $prefix) !== 1) {
    reject(500, 'Configuration invalide sur le serveur : table_prefix.');
}

// ---------------------------------------------------------------------------
// Authentification
// ---------------------------------------------------------------------------

/**
 * Certains mutualisés Apache/CGI ne propagent pas les en-têtes non standard
 * dans $_SERVER. Les trois formes connues sont regardées — même contournement
 * que publish-menu.php, et pour la même raison.
 */
function read_api_key(): string
{
    if (isset($_SERVER['HTTP_X_API_KEY'])) {
        return (string) $_SERVER['HTTP_X_API_KEY'];
    }
    if (isset($_SERVER['REDIRECT_HTTP_X_API_KEY'])) {
        return (string) $_SERVER['REDIRECT_HTTP_X_API_KEY'];
    }
    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $name => $value) {
            if (strcasecmp($name, 'X-API-Key') === 0) {
                return (string) $value;
            }
        }
    }
    return '';
}

$providedKey = read_api_key();
if ($providedKey === '' || !hash_equals((string) $config['catalog_api_key'], $providedKey)) {
    sync_log($config, 'refus auth');
    reject(401, 'Clé API absente ou invalide.');
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

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
    // Le message de PDO peut contenir l'utilisateur et l'hôte : il part au
    // journal, jamais dans la réponse HTTP.
    sync_log($config, 'connexion SQL impossible : ' . $e->getMessage());
    reject(500, 'Connexion à la base impossible.');
}

$T_PRODUCTS   = $prefix . 'products';
$T_CATEGORIES = $prefix . 'categories';
$T_BRANDS     = $prefix . 'brands';
$T_PRODCAT    = $prefix . 'product_categories';

$method = $_SERVER['REQUEST_METHOD'] ?? '';

// ---------------------------------------------------------------------------
// GET — inventaire  (§3 du contrat)
// ---------------------------------------------------------------------------

if ($method === 'GET') {
    $action = isset($_GET['action']) ? (string) $_GET['action'] : '';
    if ($action !== 'inventory') {
        reject(400, 'Action inconnue. Attendu : action=inventory.');
    }

    /**
     * legacy_id → checksum. Le checksum est celui qui avait été REÇU, réémis
     * tel quel : le serveur ne connaît pas la règle de calcul et n'a pas à
     * l'apprendre (§3).
     *
     * @return array<string,string>
     */
    $inventory = static function (PDO $pdo, string $table): array {
        $out = [];
        $rows = $pdo->query(sprintf('SELECT legacy_id, checksum FROM `%s`', $table));
        foreach ($rows as $row) {
            $out[(string) $row['legacy_id']] = (string) $row['checksum'];
        }
        return $out;
    };

    try {
        $products   = $inventory($pdo, $T_PRODUCTS);
        $categories = $inventory($pdo, $T_CATEGORIES);
        $brands     = $inventory($pdo, $T_BRANDS);
    } catch (PDOException $e) {
        sync_log($config, 'inventaire impossible : ' . $e->getMessage());
        reject(500, 'Lecture de l\'inventaire impossible. Le schéma est-il en place ?');
    }

    respond(200, [
        'ok'              => true,
        'contractVersion' => 1,
        'counts'          => [
            'products'   => count($products),
            'categories' => count($categories),
            'brands'     => count($brands),
        ],
        // Objets vides encodés en objets, pas en tableaux : le consommateur
        // indexe par legacy_id, un `[]` casserait sa lecture.
        'products'   => (object) $products,
        'categories' => (object) $categories,
        'brands'     => (object) $brands,
        'readAt'     => gmdate('Y-m-d\TH:i:s\Z'),
    ]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    reject(405, 'Méthode non autorisée. GET ou POST.');
}

// ---------------------------------------------------------------------------
// POST — export  (§4 du contrat)
// ---------------------------------------------------------------------------

$maxBytes = (int) $config['catalog_max_body_bytes'];

$declaredLength = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
if ($declaredLength > $maxBytes) {
    reject(413, sprintf('Corps trop volumineux : maximum %d octets.', $maxBytes));
}

$body = file_get_contents('php://input');
if ($body === false || strlen($body) === 0) {
    reject(400, 'Corps de requête vide ou illisible.');
}
if (strlen($body) > $maxBytes) {
    reject(413, sprintf('Corps trop volumineux : maximum %d octets.', $maxBytes));
}

$document = json_decode($body, true, 64);
if (json_last_error() !== JSON_ERROR_NONE) {
    reject(400, 'JSON invalide : ' . json_last_error_msg());
}
if (!is_array($document) || is_list_compat($document)) {
    reject(422, 'Le document doit être un objet JSON.');
}

// ── Enveloppe ───────────────────────────────────────────────────────────────
// Une enveloppe invalide est un refus SEC : rien n'est écrit (§5).

$supported = (array) $config['supported_contract_versions'];
if (!isset($document['contractVersion']) || !is_int($document['contractVersion'])) {
    reject(422, 'contractVersion : entier attendu.');
}
if (!in_array($document['contractVersion'], $supported, true)) {
    reject(422, sprintf(
        'contractVersion %d inconnue de ce script (connues : %s).',
        $document['contractVersion'],
        implode(', ', $supported)
    ));
}

$kinds = ['products', 'categories', 'brands'];
$batches = [];
$total = 0;

foreach ($kinds as $kind) {
    $value = $document[$kind] ?? [];
    if (!is_array($value) || !is_list_compat($value)) {
        reject(422, sprintf('%s : tableau attendu.', $kind));
    }
    $batches[$kind] = $value;
    $total += count($value);
}

if ($total === 0) {
    reject(422, 'Lot vide : aucune entité à écrire.');
}
if ($total > (int) $config['max_entities_per_batch']) {
    reject(413, sprintf(
        'Lot trop grand : %d entités pour un maximum de %d. Découper côté client.',
        $total,
        (int) $config['max_entities_per_batch']
    ));
}

// ── Validation d'une entité ─────────────────────────────────────────────────

/**
 * Chaîne non vide, ou null si le champ est facultatif.
 * @param mixed $value
 */
function opt_string($value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    return is_scalar($value) ? (string) $value : null;
}

/**
 * Vérifie les champs communs. Retourne la raison du refus, ou null.
 * @param mixed $entity
 */
function common_reason($entity): ?string
{
    if (!is_array($entity) || is_list_compat($entity)) {
        return 'objet attendu';
    }
    if (!isset($entity['legacy_id']) || !is_string($entity['legacy_id']) || $entity['legacy_id'] === '') {
        return 'legacy_id : chaîne non vide attendue';
    }
    if (strlen($entity['legacy_id']) > 64) {
        return 'legacy_id : 64 caractères maximum';
    }
    if (!isset($entity['checksum']) || !is_string($entity['checksum']) || $entity['checksum'] === '') {
        return 'checksum : chaîne non vide attendue';
    }
    if (!isset($entity['name']) || !is_string($entity['name']) || trim($entity['name']) === '') {
        return 'name : chaîne non vide attendue';
    }
    return null;
}

// ── Écriture ────────────────────────────────────────────────────────────────
// Upsert, jamais insert : la clé est legacy_id et l'opération doit être
// idempotente (§1 et §6). Réexporter le même lot deux fois produit le même
// état.

$now = gmdate('Y-m-d H:i:s');
$written  = ['products' => 0, 'categories' => 0, 'brands' => 0];
$received = ['products' => count($batches['products']), 'categories' => count($batches['categories']), 'brands' => count($batches['brands'])];
$rejected = [];

// ── L'URL EST FIGÉE AU PREMIER ENVOI ──────────────────────────────────────
// Décision du 11 août 2026. Un slug publié vit dans les favoris et dans
// l'index des moteurs : le recalculer parce que le nom a changé casserait
// silencieusement des liens qu'on ne contrôle pas.
//
// Le serveur est le SEUL à pouvoir tenir cette règle. PocketBase est rechargé
// par purge et ne sait pas ce qui est déjà en ligne ; lui seul sait qu'une
// ligne existe déjà. D'où le `IF(slug IS NULL OR CHAR_LENGTH(slug) = 0, …)`
// des trois requêtes ci-dessous : un slug déjà en base n'est JAMAIS remplacé.
// (Pas de chaîne vide littérale dans le SQL : elle vit dans une chaîne PHP à
// guillemets simples, où elle demanderait un échappement de plus.)
//
// Renommer une URL sera donc une opération explicite, pas un effet de bord
// d'export. Elle n'existe pas encore.

$sqlBrand = sprintf(
    'INSERT INTO `%s` (legacy_id, checksum, name, slug, description, exported_at)
     VALUES (:legacy_id, :checksum, :name, :slug, :description, :exported_at)
     ON DUPLICATE KEY UPDATE
        checksum = VALUES(checksum), name = VALUES(name),
        slug = IF(slug IS NULL OR CHAR_LENGTH(slug) = 0, VALUES(slug), slug),
        description = VALUES(description), exported_at = VALUES(exported_at)',
    $T_BRANDS
);

$sqlCategory = sprintf(
    'INSERT INTO `%s` (legacy_id, checksum, name, slug, description, parent, is_featured, exported_at)
     VALUES (:legacy_id, :checksum, :name, :slug, :description, :parent, :is_featured, :exported_at)
     ON DUPLICATE KEY UPDATE
        checksum = VALUES(checksum), name = VALUES(name),
        slug = IF(slug IS NULL OR CHAR_LENGTH(slug) = 0, VALUES(slug), slug),
        description = VALUES(description), parent = VALUES(parent),
        is_featured = VALUES(is_featured), exported_at = VALUES(exported_at)',
    $T_CATEGORIES
);

$sqlProduct = sprintf(
    'INSERT INTO `%s` (legacy_id, checksum, name, site_title, sku, slug, description,
                       price_ttc, tax_rate, stock, status, brand, exported_at)
     VALUES (:legacy_id, :checksum, :name, :site_title, :sku, :slug, :description,
             :price_ttc, :tax_rate, :stock, :status, :brand, :exported_at)
     ON DUPLICATE KEY UPDATE
        checksum = VALUES(checksum), name = VALUES(name), site_title = VALUES(site_title),
        sku = VALUES(sku),
        slug = IF(slug IS NULL OR CHAR_LENGTH(slug) = 0, VALUES(slug), slug),
        description = VALUES(description),
        price_ttc = VALUES(price_ttc), tax_rate = VALUES(tax_rate), stock = VALUES(stock),
        status = VALUES(status), brand = VALUES(brand), exported_at = VALUES(exported_at)',
    $T_PRODUCTS
);

try {
    $stBrand    = $pdo->prepare($sqlBrand);
    $stCategory = $pdo->prepare($sqlCategory);
    $stProduct  = $pdo->prepare($sqlProduct);
    $stClearCat = $pdo->prepare(sprintf('DELETE FROM `%s` WHERE product_legacy_id = ?', $T_PRODCAT));
    $stAddCat   = $pdo->prepare(sprintf(
        'INSERT IGNORE INTO `%s` (product_legacy_id, category_legacy_id) VALUES (?, ?)',
        $T_PRODCAT
    ));
} catch (PDOException $e) {
    sync_log($config, 'préparation impossible : ' . $e->getMessage());
    reject(500, 'Préparation des requêtes impossible. Le schéma est-il en place ?');
}

// Une transaction par LOT, pas par entité : sur un mutualisé, 200 commits
// séparés coûtent plus cher que l'écriture elle-même. Le lot est l'unité
// d'atomicité, et le contrat le dit (§6).
$pdo->beginTransaction();

try {
    foreach ($batches['brands'] as $index => $brand) {
        $reason = common_reason($brand);
        if ($reason !== null) {
            $rejected[] = ['kind' => 'brand', 'legacy_id' => (string) ($brand['legacy_id'] ?? "#$index"), 'reason' => $reason];
            continue;
        }
        $stBrand->execute([
            ':legacy_id'   => $brand['legacy_id'],
            ':checksum'    => $brand['checksum'],
            ':name'        => $brand['name'],
            ':slug'        => opt_string($brand['slug'] ?? null),
            ':description' => opt_string($brand['description'] ?? null),
            ':exported_at' => $now,
        ]);
        $written['brands']++;
    }

    foreach ($batches['categories'] as $index => $category) {
        $reason = common_reason($category);
        if ($reason !== null) {
            $rejected[] = ['kind' => 'category', 'legacy_id' => (string) ($category['legacy_id'] ?? "#$index"), 'reason' => $reason];
            continue;
        }
        $stCategory->execute([
            ':legacy_id'   => $category['legacy_id'],
            ':checksum'    => $category['checksum'],
            ':name'        => $category['name'],
            ':slug'        => opt_string($category['slug'] ?? null),
            ':description' => opt_string($category['description'] ?? null),
            ':parent'      => opt_string($category['parent'] ?? null),
            ':is_featured' => !empty($category['is_featured']) ? 1 : 0,
            ':exported_at' => $now,
        ]);
        $written['categories']++;
    }

    foreach ($batches['products'] as $index => $product) {
        $reason = common_reason($product);

        // `status` n'admet que `published` : envoyer un brouillon serait
        // demander au serveur d'appliquer la règle de publication, ce que le
        // contrat lui interdit (§4.1).
        if ($reason === null && (($product['status'] ?? '') !== 'published')) {
            $reason = 'status : seul "published" est accepté à l\'export';
        }

        if ($reason !== null) {
            $rejected[] = ['kind' => 'product', 'legacy_id' => (string) ($product['legacy_id'] ?? "#$index"), 'reason' => $reason];
            continue;
        }

        $stProduct->execute([
            ':legacy_id'   => $product['legacy_id'],
            ':checksum'    => $product['checksum'],
            ':name'        => $product['name'],
            ':site_title'  => opt_string($product['site_title'] ?? null),
            ':sku'         => opt_string($product['sku'] ?? null),
            ':slug'        => opt_string($product['slug'] ?? null),
            ':description' => opt_string($product['description'] ?? null),
            ':price_ttc'   => is_numeric($product['price_ttc'] ?? null) ? (float) $product['price_ttc'] : 0.0,
            ':tax_rate'    => is_numeric($product['tax_rate'] ?? null) ? (float) $product['tax_rate'] : 0.0,
            ':stock'       => is_numeric($product['stock'] ?? null) ? (int) $product['stock'] : 0,
            ':status'      => 'published',
            ':brand'       => opt_string($product['brand'] ?? null),
            ':exported_at' => $now,
        ]);

        // Les rattachements sont REMPLACÉS, pas complétés : sinon une catégorie
        // retirée dans PocketApp resterait attachée ici indéfiniment.
        $stClearCat->execute([$product['legacy_id']]);
        $categories = $product['categories'] ?? [];
        if (is_array($categories)) {
            foreach ($categories as $categoryId) {
                if (is_string($categoryId) && $categoryId !== '') {
                    $stAddCat->execute([$product['legacy_id'], $categoryId]);
                }
            }
        }

        $written['products']++;
    }

    $pdo->commit();
} catch (PDOException $e) {
    $pdo->rollBack();
    sync_log($config, 'écriture impossible : ' . $e->getMessage());
    reject(500, 'Écriture impossible : le lot a été annulé en entier.');
}

sync_log($config, sprintf(
    'export ok — %d produits, %d catégories, %d marques, %d refus',
    $written['products'],
    $written['categories'],
    $written['brands'],
    count($rejected)
));

// Un lot dont TOUTES les entités sont refusées répond quand même 200 : le
// transport a fonctionné, c'est la donnée qui est en cause, et confondre les
// deux fait chercher au mauvais endroit (§5).
respond(200, [
    'ok'              => true,
    'contractVersion' => 1,
    'received'        => $received,
    'written'         => $written,
    'rejected'        => $rejected,
    'receivedAt'      => gmdate('Y-m-d\TH:i:s\Z'),
]);
