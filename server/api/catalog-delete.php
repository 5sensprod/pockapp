<?php
/**
 * RETRAIT D'UNE ENTITÉ DE LA BASE SQL DU SITE.
 *
 *   GET  ?kind=products&legacy_id=…   → ce que la suppression emporterait
 *   POST  kind=…&legacy_id=…          → la supprime, images comprises
 *
 * ── Pourquoi ce fichier existe ─────────────────────────────────────────────
 *
 * `products-sync.php` n'a AUCUNE opération de retrait, et le §2 du contrat
 * l'écrit noir sur blanc : « Rien n'est jamais supprimé côté SQL par l'export. »
 * Pour un produit, dépublier suffit — on l'exporte en `draft`, `catalog.php` ne
 * sert que `published`, la page disparaît et la ligne reste avec son
 * `first_seen_at`.
 *
 * Mais une fiche SUPPRIMÉE dans PocketApp n'a plus rien à exporter : ni en
 * `draft`, ni autrement. Sa ligne restait donc en ligne indéfiniment, avec ses
 * images, et sa page continuait d'être servie. Mesuré le 14 septembre 2026 :
 * 21 fiches dans ce cas.
 *
 * ── Pourquoi un fichier à part, et pas une action de products-sync.php ─────
 *
 * `products-sync.php` ne contient pas un seul `DELETE`, et c'est une propriété
 * qui vaut d'être gardée : quel que soit le bug, un lot d'export ne peut pas
 * effacer une ligne. Le geste destructeur reste donc dehors, dans un fichier
 * qu'on appelle exprès, une entité à la fois.
 *
 * ── Ce qu'il REFUSE de supprimer ───────────────────────────────────────────
 *
 * Même posture que categories-cleanup.php :
 *
 *   • une catégorie encore citée par un produit, quel que soit son `status` —
 *     un brouillon compte, il sera republié ;
 *   • une catégorie déclarée pour parent par une autre ;
 *   • une marque encore citée par un produit.
 *
 * Un produit, lui, n'a pas de dépendant : ses rattachements sont dans le pivot,
 * et ils partent avec lui.
 *
 * ── L'ordre, et il n'est pas négociable ────────────────────────────────────
 *
 * Les OCTETS d'abord, la LIGNE ensuite — l'inverse de l'envoi d'images, et pour
 * la même raison : `image_paths` fait foi pour le site. Tant que la ligne
 * existe, un fichier qu'on efface peut être celui qu'un visiteur charge ; une
 * fois la ligne partie, plus personne ne désigne le dossier et il devient
 * invisible, donc introuvable. On efface donc pendant qu'on sait encore à quoi
 * il appartient, et la ligne suit immédiatement.
 *
 * Si l'effacement des octets échoue, on N'ARRÊTE PAS : la ligne part quand
 * même, et les fichiers restants sont rapportés (`orphelins`). Une page servie
 * à tort est un défaut visible ; quelques kilo-octets inertes ne le sont pas.
 *
 * Aucun secret ici : identifiants de base, clé API et `media_root` vivent dans
 * ../config/config.php, non versionné. La clé est celle du catalogue
 * (`catalog_api_key`) — même base, même portée d'écriture.
 *
 * PHP 7.4+.
 */

declare(strict_types=1);

/** @param array<string,mixed> $payload */
function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function reject(int $status, string $message): void
{
    respond($status, ['ok' => false, 'error' => $message]);
}

/** @param array<string,mixed> $config */
function delete_log(array $config, string $line): void
{
    if (empty($config['log_file'])) {
        return;
    }
    @file_put_contents(
        $config['log_file'],
        sprintf("%s\tdelete\t%s\n", gmdate('c'), $line),
        FILE_APPEND | LOCK_EX
    );
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

$configPath = __DIR__ . '/../config/config.php';
if (!is_file($configPath)) {
    reject(500, 'Configuration absente sur le serveur.');
}

/** @var array<string,mixed> $config */
$config = require $configPath;
if (!is_array($config)) {
    reject(500, 'Configuration illisible sur le serveur.');
}

if (empty($config['catalog_api_key']) || !is_string($config['catalog_api_key'])) {
    reject(500, 'Configuration invalide sur le serveur : catalog_api_key.');
}

$db = isset($config['db']) && is_array($config['db']) ? $config['db'] : [];
foreach (['host', 'name', 'user', 'pass'] as $needed) {
    if (!isset($db[$needed]) || !is_string($db[$needed])) {
        reject(500, sprintf('Configuration invalide sur le serveur : db.%s.', $needed));
    }
}

$prefix = isset($config['table_prefix']) ? (string) $config['table_prefix'] : '';
// Le préfixe entre dans des noms de table, donc dans du SQL non paramétrable.
if (preg_match('/^[A-Za-z0-9_]*$/', $prefix) !== 1) {
    reject(500, 'Configuration invalide sur le serveur : table_prefix.');
}

// `media_root` peut manquer : on sait alors supprimer la ligne, pas les octets.
// On le DIT dans la réponse plutôt que de refuser — la page fantôme est le
// problème, le dossier ne l'est pas.
$mediaRoot = isset($config['media_root']) && is_string($config['media_root'])
    ? rtrim($config['media_root'], '/\\')
    : '';

// ---------------------------------------------------------------------------
// Authentification — les trois formes d'en-tête, comme products-sync.php
// ---------------------------------------------------------------------------

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
    delete_log($config, 'refus auth');
    reject(401, 'Clé API absente ou invalide.');
}

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    reject(405, 'Méthode non autorisée. GET ou POST.');
}

$KINDS = ['products', 'categories', 'brands'];
$kind = isset($_REQUEST['kind']) ? (string) $_REQUEST['kind'] : '';
if (!in_array($kind, $KINDS, true)) {
    reject(400, 'kind inconnu. Attendu : products, categories ou brands.');
}

$legacyId = isset($_REQUEST['legacy_id']) ? trim((string) $_REQUEST['legacy_id']) : '';
// Même contrainte que le miroir d'images : ce jeton devient un nom de
// répertoire. Identifiants NeDB ou clés PocketApp `pa_…`, rien d'autre.
if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $legacyId) !== 1) {
    reject(422, 'legacy_id absent ou de forme inacceptable.');
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
    delete_log($config, 'connexion SQL impossible : ' . $e->getMessage());
    reject(500, 'Connexion à la base impossible.');
}

$T_PRODUCTS   = $prefix . 'products';
$T_CATEGORIES = $prefix . 'categories';
$T_BRANDS     = $prefix . 'brands';
$T_PRODCAT    = $prefix . 'product_categories';

$TABLES = [
    'products'   => $T_PRODUCTS,
    'categories' => $T_CATEGORIES,
    'brands'     => $T_BRANDS,
];
$TABLE = $TABLES[$kind];

// ---------------------------------------------------------------------------
// La ligne visée
// ---------------------------------------------------------------------------

try {
    $st = $pdo->prepare(sprintf(
        'SELECT legacy_id, name, slug, image_paths FROM `%s` WHERE legacy_id = ?',
        $TABLE
    ));
    $st->execute([$legacyId]);
    $ligne = $st->fetch();
} catch (PDOException $e) {
    delete_log($config, 'lecture impossible : ' . $e->getMessage());
    reject(500, "Lecture de l'entité impossible.");
}

if ($ligne === false) {
    // 404 et non 500 : l'appelant voulait cet état, il l'a. Une suppression
    // rejouée ne doit pas ressembler à une panne.
    respond(404, [
        'ok'        => false,
        'kind'      => $kind,
        'legacy_id' => $legacyId,
        'error'     => 'Entité inconnue de la base du site : rien à retirer.',
    ]);
}

// ---------------------------------------------------------------------------
// Ce qui retient — les refus
// ---------------------------------------------------------------------------

$retenues = [];

try {
    if ($kind === 'categories') {
        $st = $pdo->prepare(sprintf(
            'SELECT COUNT(*) FROM `%s` WHERE category_legacy_id = ?',
            $T_PRODCAT
        ));
        $st->execute([$legacyId]);
        $produits = (int) $st->fetchColumn();
        if ($produits > 0) {
            $retenues[] = sprintf('%d produit(s) rattaché(s) à cette catégorie', $produits);
        }

        $st = $pdo->prepare(sprintf(
            'SELECT COUNT(*) FROM `%s` WHERE parent = ?',
            $T_CATEGORIES
        ));
        $st->execute([$legacyId]);
        $enfants = (int) $st->fetchColumn();
        if ($enfants > 0) {
            $retenues[] = sprintf('%d sous-catégorie(s)', $enfants);
        }
    }

    if ($kind === 'brands') {
        $st = $pdo->prepare(sprintf(
            'SELECT COUNT(*) FROM `%s` WHERE brand = ?',
            $T_PRODUCTS
        ));
        $st->execute([$legacyId]);
        $produits = (int) $st->fetchColumn();
        if ($produits > 0) {
            $retenues[] = sprintf('%d produit(s) portent cette marque', $produits);
        }
    }
} catch (PDOException $e) {
    delete_log($config, 'lecture des dépendances impossible : ' . $e->getMessage());
    reject(500, 'Lecture des dépendances impossible.');
}

$chemins = [];
if (isset($ligne['image_paths']) && is_string($ligne['image_paths']) && $ligne['image_paths'] !== '') {
    $decode = json_decode($ligne['image_paths'], true);
    if (is_array($decode)) {
        foreach ($decode as $chemin) {
            if (is_string($chemin) && $chemin !== '') {
                $chemins[] = $chemin;
            }
        }
    }
}

// ── GET : le relevé, sans rien toucher ─────────────────────────────────────
if ($method === 'GET') {
    respond(200, [
        'ok'          => true,
        'kind'        => $kind,
        'legacy_id'   => $legacyId,
        'name'        => (string) ($ligne['name'] ?? ''),
        'slug'        => $ligne['slug'] !== null ? (string) $ligne['slug'] : null,
        'images'      => count($chemins),
        'supprimable' => count($retenues) === 0,
        'retenues'    => $retenues,
    ]);
}

if (count($retenues) > 0) {
    respond(409, [
        'ok'        => false,
        'kind'      => $kind,
        'legacy_id' => $legacyId,
        'error'     => 'Retrait refusé : ' . implode(', ', $retenues) . '.',
        'retenues'  => $retenues,
    ]);
}

// ---------------------------------------------------------------------------
// Les octets d'abord
// ---------------------------------------------------------------------------
//
// Il ne regarde QUE `<media_root>/<kind>/<legacy_id>/` : `glob` sans récursion,
// `is_file` écarte les répertoires, `$kind` vient d'une liste fermée et
// `$legacyId` est contraint à [A-Za-z0-9_-] — aucun des deux ne peut porter un
// `..`. Le dossier entier part, y compris les `.tmp` d'un envoi interrompu :
// l'entité disparaît, rien de ce qu'il contient n'a plus de propriétaire.

$imagesEffacees = 0;
$octetsLiberes = 0;
$orphelins = [];

if ($mediaRoot !== '') {
    $dir = $mediaRoot . '/' . $kind . '/' . $legacyId;
    foreach ((array) @glob($dir . '/*') as $trouve) {
        if (!is_string($trouve) || !is_file($trouve)) {
            continue;
        }
        $taille = (int) @filesize($trouve);
        if (@unlink($trouve)) {
            $imagesEffacees++;
            $octetsLiberes += $taille;
        } else {
            $orphelins[] = basename($trouve);
        }
    }
    // Le répertoire vidé part aussi ; s'il résiste, ce n'est pas un échec.
    @rmdir($dir);
}

// ---------------------------------------------------------------------------
// La ligne ensuite — pivot compris, dans une transaction
// ---------------------------------------------------------------------------

try {
    $pdo->beginTransaction();

    if ($kind === 'products') {
        $st = $pdo->prepare(sprintf(
            'DELETE FROM `%s` WHERE product_legacy_id = ?',
            $T_PRODCAT
        ));
        $st->execute([$legacyId]);
    }

    $st = $pdo->prepare(sprintf('DELETE FROM `%s` WHERE legacy_id = ?', $TABLE));
    $st->execute([$legacyId]);
    $supprimees = $st->rowCount();

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    delete_log($config, 'suppression impossible : ' . $e->getMessage());
    reject(500, 'Suppression impossible. Les octets, eux, sont peut-être déjà partis.');
}

delete_log($config, sprintf(
    '%s/%s retiré — %d ligne(s), %d image(s), %d octets',
    $kind,
    $legacyId,
    $supprimees,
    $imagesEffacees,
    $octetsLiberes
));

respond(200, [
    'ok'         => true,
    'kind'       => $kind,
    'legacy_id'  => $legacyId,
    'name'       => (string) ($ligne['name'] ?? ''),
    'deleted'    => $supprimees,
    'images'     => ['files' => $imagesEffacees, 'bytes' => $octetsLiberes],
    // Non vide : des fichiers n'ont pas pu être effacés. La ligne, elle, est
    // partie — la page ne sera plus servie.
    'orphelins'  => $orphelins,
    'media_root' => $mediaRoot !== '',
]);
