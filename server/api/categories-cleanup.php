<?php
/**
 * Nettoyage des catégories ORPHELINES de la base SQL Axemusique.
 *
 * Deux opérations :
 *
 *   GET                     → relève les orphelines, ne touche à rien
 *   POST ?confirm=1         → les supprime
 *
 * ── Pourquoi cet outil existe ──────────────────────────────────────────────
 *
 * Constaté le 2026-09-09 : « /categorie-produit/piano-numerique » affichait
 * 0 produit. Deux lignes portent ce slug — la vraie catégorie
 * (`riJ7azU6q0YRnVy5`, 25 produits) et un rayon vide
 * (`rayon_claviers__pianonumerique`) —, et catalog.php rendait celle que MySQL
 * sortait en premier. Six des vingt-trois rubriques catégorie du menu
 * tombaient ainsi sur un rayon vide.
 *
 * Ces rayons sont les restes d'un essai de REFONTE de l'arbre, exporté vers le
 * site puis abandonné : `RefondreCategories` est faux par défaut depuis le
 * 25 août 2026 (backend/catalog/mapping/appliquer.go). Ils ne portent aucun
 * produit, aucun enfant, et rien ne les recréera tant que la refonte n'est pas
 * décidée. Ils n'ont donc pas leur place en base.
 *
 * catalog.php sait désormais les départager, et c'est le correctif qui fait
 * disparaître le symptôme. Celui-ci retire la cause. **Les deux vont
 * ensemble** : ce script ne doit pas être le seul rempart, un rayon pourrait
 * revenir le jour où la refonte est appliquée.
 *
 * ── Ce que ce script REFUSE de supprimer ───────────────────────────────────
 *
 * Une catégorie n'est orpheline que si les TROIS conditions tiennent :
 *
 *   1. sa clé stable commence par le préfixe visé (`rayon_` par défaut) ;
 *   2. aucun produit ne lui est rattaché — quel que soit son `status`, un
 *      brouillon compte : il sera republié un jour ;
 *   3. aucune catégorie ne la déclare pour parent.
 *
 * Et il refuse en plus toute ligne portant des `image_paths` : le miroir
 * d'images (images-sync.php) tient un dossier `categories/<legacy_id>/`, que
 * supprimer la ligne SQL laisserait orphelin sur le disque du mutualisé. Ces
 * lignes-là sont RELEVÉES et non supprimées, à traiter à la main.
 *
 * Aucun secret ici : identifiants de base et clé API vivent dans
 * ../config/config.php, non versionné. La clé est celle du catalogue
 * (`catalog_api_key`) — même base, même portée d'écriture.
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

function reject(int $status, string $message): void
{
    respond($status, ['ok' => false, 'error' => $message]);
}

/** @param array<string,mixed> $config */
function cleanup_log(array $config, string $line): void
{
    if (empty($config['log_file'])) {
        return;
    }
    @file_put_contents(
        $config['log_file'],
        sprintf("%s\tcleanup\t%s\n", gmdate('c'), $line),
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
// Même garde que products-sync.php, et pour la même raison.
if (preg_match('/^[A-Za-z0-9_]*$/', $prefix) !== 1) {
    reject(500, 'Configuration invalide sur le serveur : table_prefix.');
}

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
    cleanup_log($config, 'refus auth');
    reject(401, 'Clé API absente ou invalide.');
}

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

// Le préfixe de clé stable visé. `rayon_` par défaut : c'est le seul préfixe
// que la refonte fabrique (mapping/appliquer.go:45). Il est contraint, parce
// qu'il part dans un LIKE — et parce qu'un préfixe vide viserait TOUT le
// catalogue.
$target = isset($_REQUEST['prefix']) ? (string) $_REQUEST['prefix'] : 'rayon_';
if (preg_match('/^[A-Za-z0-9_-]{3,32}$/', $target) !== 1) {
    reject(400, 'Préfixe invalide. Attendu : 3 à 32 caractères [A-Za-z0-9_-].');
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'POST') {
    header('Allow: GET, POST');
    reject(405, 'Méthode non autorisée. GET ou POST.');
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
    cleanup_log($config, 'connexion SQL impossible : ' . $e->getMessage());
    reject(500, 'Connexion à la base impossible.');
}

$T_CATEGORIES = $prefix . 'categories';
$T_PRODCAT    = $prefix . 'product_categories';

// ---------------------------------------------------------------------------
// Le relevé
// ---------------------------------------------------------------------------
//
// Une seule requête, et les trois conditions y sont lisibles. `LIKE` avec un
// préfixe lié : `_` est un joker en SQL, il est échappé, faute de quoi
// `rayon_` viserait aussi `rayonX`.

try {
    $st = $pdo->prepare(sprintf(
        'SELECT c.legacy_id, c.name, c.slug, c.parent, c.image_paths,
                (SELECT COUNT(*) FROM `%s` pc
                  WHERE pc.category_legacy_id = c.legacy_id) AS produits,
                (SELECT COUNT(*) FROM `%s` e
                  WHERE e.parent = c.legacy_id) AS enfants
           FROM `%s` c
          WHERE c.legacy_id LIKE ? ESCAPE \'!\'
          ORDER BY c.legacy_id ASC',
        $T_PRODCAT,
        $T_CATEGORIES,
        $T_CATEGORIES
    ));
    $st->execute([str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $target) . '%']);
    $rows = $st->fetchAll();
} catch (PDOException $e) {
    cleanup_log($config, 'relevé impossible : ' . $e->getMessage());
    reject(500, 'Lecture des catégories impossible.');
}

$orphelines = [];
$retenues   = [];

foreach ($rows as $row) {
    $legacyId = (string) $row['legacy_id'];
    $entree = [
        'id'        => $legacyId,
        'name'      => (string) $row['name'],
        'slug'      => $row['slug'] !== null ? (string) $row['slug'] : null,
        'produits'  => (int) $row['produits'],
        'enfants'   => (int) $row['enfants'],
    ];

    $images = $row['image_paths'] !== null ? trim((string) $row['image_paths']) : '';

    if ((int) $row['produits'] > 0) {
        $entree['raison'] = 'porte des produits';
        $retenues[] = $entree;
        continue;
    }
    if ((int) $row['enfants'] > 0) {
        $entree['raison'] = 'porte des sous-catégories';
        $retenues[] = $entree;
        continue;
    }
    if ($images !== '' && $images !== '[]') {
        // Le miroir d'images tiendrait un dossier sans ligne SQL pour le
        // désigner. À traiter à la main, dossier compris.
        $entree['raison'] = 'porte des images sur le miroir';
        $retenues[] = $entree;
        continue;
    }

    $orphelines[] = $entree;
}

// Les slugs que ces orphelines disputent à une autre ligne : c'est ce qui
// motive le nettoyage, et ça se lit dans le relevé plutôt que dans un ticket.
$collisions = [];
if ($orphelines !== []) {
    $slugs = [];
    foreach ($orphelines as $entree) {
        if ($entree['slug'] !== null && $entree['slug'] !== '') {
            $slugs[] = $entree['slug'];
        }
    }
    if ($slugs !== []) {
        $st = $pdo->prepare(sprintf(
            'SELECT legacy_id, name, slug FROM `%s`
              WHERE slug IN (%s)
              ORDER BY slug ASC, legacy_id ASC',
            $T_CATEGORIES,
            implode(',', array_fill(0, count($slugs), '?'))
        ));
        $st->execute($slugs);

        $parSlug = [];
        foreach ($st->fetchAll() as $row) {
            $parSlug[(string) $row['slug']][] = [
                'id'   => (string) $row['legacy_id'],
                'name' => (string) $row['name'],
            ];
        }
        foreach ($parSlug as $slug => $lignes) {
            if (count($lignes) > 1) {
                $collisions[$slug] = $lignes;
            }
        }
    }
}

$releve = [
    'ok'         => true,
    'prefix'     => $target,
    'counts'     => [
        'examinees'  => count($rows),
        'orphelines' => count($orphelines),
        'retenues'   => count($retenues),
        'collisions' => count($collisions),
    ],
    'orphelines' => $orphelines,
    // Ce que le script a refusé de toucher, avec la raison. Une liste vide est
    // une information, pas un silence.
    'retenues'   => $retenues,
    'collisions' => (object) $collisions,
];

if ($method === 'GET') {
    respond(200, $releve + ['supprimees' => 0, 'dry_run' => true]);
}

// ---------------------------------------------------------------------------
// POST — la suppression
// ---------------------------------------------------------------------------
//
// `confirm=1` est obligatoire, et son absence n'est PAS une erreur : c'est le
// mode par défaut. Un POST sans confirmation rend le même relevé qu'un GET, de
// sorte qu'on puisse lire ce qui partirait avec la requête même qui le ferait
// partir.

$confirm = isset($_REQUEST['confirm']) && (string) $_REQUEST['confirm'] === '1';
if (!$confirm) {
    respond(200, $releve + [
        'supprimees' => 0,
        'dry_run'    => true,
        'note'       => 'Rien n\'a été supprimé. Repasser avec confirm=1.',
    ]);
}

if ($orphelines === []) {
    respond(200, $releve + ['supprimees' => 0, 'dry_run' => false]);
}

$ids = array_map(static function (array $entree): string {
    return $entree['id'];
}, $orphelines);

// Une transaction : soit les lignes partent ensemble, soit aucune. Un
// nettoyage à moitié fait laisserait une base dont on ne sait plus dire l'état.
$pdo->beginTransaction();
try {
    $st = $pdo->prepare(sprintf(
        'DELETE FROM `%s` WHERE legacy_id IN (%s)',
        $T_CATEGORIES,
        implode(',', array_fill(0, count($ids), '?'))
    ));
    $st->execute($ids);
    $supprimees = $st->rowCount();
    $pdo->commit();
} catch (PDOException $e) {
    $pdo->rollBack();
    cleanup_log($config, 'suppression impossible : ' . $e->getMessage());
    reject(500, 'Suppression impossible. Rien n\'a été écrit.');
}

cleanup_log($config, sprintf(
    'purge %s : %d ligne(s) — %s',
    $target,
    $supprimees,
    implode(', ', $ids)
));

respond(200, $releve + ['supprimees' => $supprimees, 'dry_run' => false]);
