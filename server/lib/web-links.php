<?php
/**
 * Les liens d'une fiche produit — pages web et vidéos YouTube.
 *
 * Inclus par `api/products-sync.php` (ce qu'on accepte d'écrire) et par
 * `api/catalog.php` (ce qu'on rend au site). Fonctions pures, sans base ni
 * sortie : vérifiées par `tests/web-links-test.php`, en ligne de commande.
 *
 * Contrat : §4.1 quater de PocketSite-docs/12-contrat-catalogue.md.
 *
 * ─── POURQUOI LE SERVEUR REVALIDE CE QUE POCKETAPP A DÉJÀ VALIDÉ ───────────
 * `frontend/lib/catalog/web-links.ts` normalise avant d'envoyer. Ce n'est pas
 * une garantie : un poste sur un vieux build n'est pas une hypothèse — celui
 * du client en est un, et il fabrique encore des doublons de numéro. Une
 * adresse arrivant ici en `javascript:` ou en `http://` finirait dans un
 * `href` du site ; on ne s'en remet donc pas au client.
 *
 * ─── CE QUI N'EST PAS ICI ─────────────────────────────────────────────────
 * L'identifiant d'une vidéo YouTube. Il se dérive de l'URL, et il se dérive au
 * SEUL endroit qui l'affiche : le bundle du site (`AxeProductLinks.jsx`). Le
 * calculer ici ferait une troisième copie de la même donnée, à tenir d'accord
 * avec les deux autres — c'est exactement ce que la règle de promo a coûté.
 *
 * PHP 7.4+.
 */

declare(strict_types=1);

// Ce fichier ne répond à rien : appelé directement en HTTP, il se tait.
if (count(get_included_files()) === 1) {
    http_response_code(404);
    exit;
}

/** Vingt liens par fiche, comme côté PocketApp (`MAX_LIENS`). */
const WEB_LINKS_MAX = 20;

/** Les hôtes qu'une vidéo peut porter. On compare l'HÔTE, jamais le texte de
 *  l'URL : `https://exemple.fr/?r=youtube.com` en contient le nom sans en
 *  être une. */
const WEB_LINKS_HOTES_YOUTUBE = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
    'www.youtube-nocookie.com',
    'youtube-nocookie.com',
];

/**
 * Une entrée mise au propre, ou `null` si elle ne passe pas.
 *
 * @param mixed $entree
 * @return array{kind:string,url:string,label:string}|null
 */
function web_link_normalise($entree): ?array
{
    if (!is_array($entree)) {
        return null;
    }

    $kind = (isset($entree['kind']) && $entree['kind'] === 'video') ? 'video' : 'link';
    $url  = isset($entree['url']) && is_string($entree['url']) ? trim($entree['url']) : '';
    if ($url === '' || strlen($url) > 2000) {
        return null;
    }

    // `parse_url` rend `false` sur une adresse gravement malformée, et un
    // tableau sans `scheme` sur un chemin relatif. Les deux sont refusés.
    $parts = parse_url($url);
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
        return null;
    }
    if (strtolower($parts['scheme']) !== 'https') {
        return null;
    }

    if ($kind === 'video'
        && !in_array(strtolower($parts['host']), WEB_LINKS_HOTES_YOUTUBE, true)) {
        return null;
    }

    $label = isset($entree['label']) && is_string($entree['label']) ? trim($entree['label']) : '';

    return [
        'kind'  => $kind,
        'url'   => $url,
        // mb_substr et non substr : couper 120 OCTETS au milieu d'un caractère
        // accentué produirait une chaîne que `json_encode` refuserait ensuite.
        'label' => function_exists('mb_substr') ? mb_substr($label, 0, 120) : substr($label, 0, 120),
    ];
}

/**
 * La liste reçue, remise au propre. Ce qui ne passe pas est ÉCARTÉ, l'entité
 * n'est PAS refusée : un lien tordu sur douze ne doit pas empêcher un produit
 * d'arriver en ligne — contrairement à une date de promo invalide, qui
 * désactiverait la promo en silence et mérite donc un rejet.
 *
 * @param mixed $valeur
 * @return array<int,array{kind:string,url:string,label:string}>
 */
function web_links_normalises($valeur): array
{
    if (!is_array($valeur)) {
        return [];
    }
    $liens = [];
    foreach ($valeur as $entree) {
        $lien = web_link_normalise($entree);
        if ($lien !== null) {
            $liens[] = $lien;
        }
        if (count($liens) >= WEB_LINKS_MAX) {
            break;
        }
    }
    return $liens;
}

/**
 * Ce qui s'écrit dans la colonne : du JSON, ou NULL quand il n'y a aucun lien.
 *
 * NULL et non `'[]'` : l'absence est le cas ordinaire de presque tout le
 * catalogue, et une clé absente doit EFFACER les liens précédents (c'est ainsi
 * qu'on retire un lien depuis PocketApp).
 *
 * @param mixed $valeur
 */
function web_links_pour_base($valeur): ?string
{
    $liens = web_links_normalises($valeur);
    if ($liens === []) {
        return null;
    }
    // JSON_UNESCAPED_* : la colonne se relit à l'œil en cas d'incident, et les
    // accents d'un libellé n'ont aucune raison d'y être en \uXXXX.
    return json_encode($liens, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

/**
 * Ce qui se rend au site : la liste relue depuis la colonne, revalidée.
 *
 * Revalidée parce que la colonne est un TEXT : une écriture antérieure à ce
 * fichier, ou faite à la main, n'a pas passé `web_links_pour_base`. Le site
 * pose ces adresses dans des `href` et dans une iframe.
 *
 * @param mixed $colonne  le contenu brut de `ax_products.web_links`
 * @return array<int,array{kind:string,url:string,label:string}>
 */
function web_links_affiches($colonne): array
{
    if (!is_string($colonne) || $colonne === '') {
        return [];
    }
    $decode = json_decode($colonne, true);
    return web_links_normalises($decode);
}
