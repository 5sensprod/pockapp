<?php
/**
 * Le produit mis en avant — la pastille de vitrine et son texte.
 *
 * Inclus par `api/products-sync.php` (ce qu'on accepte d'écrire) et par
 * `api/catalog.php` (ce qu'on rend au site). Fonctions pures, sans base ni
 * sortie : vérifiées par `tests/featured-test.php`, en ligne de commande.
 *
 * Contrat : §4.1 quinquies de PocketSite-docs/12-contrat-catalogue.md.
 *
 * ─── POURQUOI LE SERVEUR REVALIDE CE QUE POCKETAPP A DÉJÀ NORMALISÉ ───────
 * `frontend/lib/catalog/featured.ts` remet le libellé au propre avant
 * d'envoyer. Ce n'est pas une garantie : un poste sur un vieux build n'est pas
 * une hypothèse — celui du client en est un. Un libellé de 4000 caractères, ou
 * bourré de sauts de ligne, finirait dans le DOM du site et déformerait la
 * carte. On ne s'en remet donc pas au client.
 *
 * ⚠️ Ce fichier n'échappe RIEN pour le HTML : le site est un bundle React, qui
 * échappe le texte qu'il rend. Ajouter un `htmlspecialchars` ici afficherait
 * « Coup de c&oelig;ur » en toutes lettres sur la pastille. La seule chose dont
 * ce fichier répond est la FORME : un texte, d'une seule ligne, borné.
 *
 * ─── CE QUI N'EST PAS ICI ────────────────────────────────────────────────
 * Le libellé PAR DÉFAUT. « Coup de cœur » ne s'écrit ni ici, ni en base, ni
 * dans PocketApp : il se décide au SEUL endroit qui l'affiche, le bundle du
 * site (`AxeFeaturedBadge.jsx`). Le poser ici en ferait une deuxième copie à
 * tenir d'accord avec la première — c'est exactement ce que la règle de promo
 * a coûté, en trois exemplaires.
 *
 * PHP 7.4+.
 */

declare(strict_types=1);

// Ce fichier ne répond à rien : appelé directement en HTTP, il se tait.
if (count(get_included_files()) === 1) {
    http_response_code(404);
    exit;
}

/** La longueur du libellé, EN CARACTÈRES. Même borne que `MAX_LIBELLE`
 *  (`frontend/lib/catalog/featured.ts`) et `FeaturedLabelMaxLength`
 *  (`backend/migrations/add_featured_to_products.go`). La colonne, elle, est en
 *  VARCHAR(60) : de la place pour les octets d'un texte accentué. */
const FEATURED_LABEL_MAX = 40;

/**
 * Le libellé remis au propre, ou `null` s'il ne reste rien.
 *
 * Les sauts de ligne, tabulations et suites d'espaces sont réduits à une
 * espace : une pastille est une ligne, et un texte collé depuis un tableur en
 * porte. La longueur est COUPÉE, pas refusée — un libellé trop long est une
 * maladresse de saisie, pas une donnée dangereuse, contrairement à une URL où
 * le refus est la bonne réponse.
 *
 * `null` et non `''` : la colonne est `DEFAULT NULL`, et l'absence veut dire
 * « le défaut du site ».
 *
 * @param mixed $valeur
 */
function featured_label_normalise($valeur): ?string
{
    if (!is_string($valeur)) {
        return null;
    }

    // `\s` couvre les sauts de ligne et les tabulations ; `\x{00A0}` l'espace
    // insécable, que les copier-coller depuis un traitement de texte trimballent
    // et que `trim` ne connaît pas.
    $propre = preg_replace('/[\s\x{00A0}]+/u', ' ', $valeur);
    if (!is_string($propre)) {
        // `preg_replace` rend null sur une chaîne qui n'est pas de l'UTF-8
        // valide. On ne devine pas : on refuse le libellé, la pastille prendra
        // le défaut du site.
        return null;
    }
    $propre = trim($propre);
    if ($propre === '') {
        return null;
    }

    // mb_substr et non substr : couper 40 OCTETS au milieu d'un caractère
    // accentué produirait une chaîne que `json_encode` refuserait ensuite.
    $propre = function_exists('mb_substr')
        ? mb_substr($propre, 0, FEATURED_LABEL_MAX)
        : substr($propre, 0, FEATURED_LABEL_MAX);

    return $propre === '' ? null : $propre;
}

/**
 * Ce que le SITE reçoit : `null` quand la fiche n'est pas en vitrine, sinon un
 * objet portant le libellé — lequel peut être `null`, et le site affiche alors
 * son défaut.
 *
 * Un objet et non une chaîne, pour la même raison que `promo` et `stock_b` en
 * sont : la pastille gagnera peut-être une couleur ou une icône, et une clé de
 * plus dans un objet ne casse aucun consommateur, alors que changer une chaîne
 * en objet les casse tous.
 *
 * ⚠️ Cette fonction ne croise RIEN avec `status` : `catalog.php` ne sert que
 * les produits publiés, la question ne se pose pas.
 *
 * @param mixed $featured
 * @param mixed $label
 * @return array{label: ?string}|null
 */
function featured_affiche($featured, $label): ?array
{
    if (!$featured) {
        return null;
    }
    return ['label' => featured_label_normalise($label)];
}
