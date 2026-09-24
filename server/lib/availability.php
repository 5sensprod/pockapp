<?php
/**
 * Le message de disponibilité — ce que le site dit quand le stock est à zéro.
 *
 * Inclus par `api/products-sync.php` (ce qu'on accepte d'écrire) et par
 * `api/catalog.php` (ce qu'on rend au site). Fonctions pures, sans base ni
 * sortie : vérifiées par `tests/availability-test.php`, en ligne de commande.
 *
 * Contrat : §4.1 septies de PocketSite-docs/12-contrat-catalogue.md.
 *
 * ─── POURQUOI LE SERVEUR REVALIDE CE QUE POCKETAPP A DÉJÀ NORMALISÉ ───────
 * `frontend/lib/catalog/availability.ts` remet le message au propre avant
 * d'envoyer. Ce n'est pas une garantie : un poste sur un vieux build n'est pas
 * une hypothèse — celui du client en est un. Un message de 4000 caractères, ou
 * bourré de sauts de ligne, finirait dans le DOM du site et déformerait la
 * carte. On ne s'en remet donc pas au client.
 *
 * ⚠️ Ce fichier n'échappe RIEN pour le HTML : le site est un bundle React, qui
 * échappe le texte qu'il rend. La seule chose dont ce fichier répond est la
 * FORME : un texte, d'une seule ligne, borné.
 *
 * ─── LE SERVEUR JUGE « STOCK À ZÉRO », PAS LE SITE ────────────────────────
 * Le message n'est rendu que lorsque le stock neuf est nul ou négatif. Le
 * vendeur qui écrit « Sur commande » sur une fiche à 12 unités ne fait pas
 * mentir la vitrine, et n'a pas à retirer le message quand le stock revient :
 * il reste en base, muet, jusqu'à la prochaine rupture. Même esprit que la
 * période d'une promo, jugée ici au jour de Paris et non par le client.
 *
 * ─── CE QUI N'EST PAS ICI ────────────────────────────────────────────────
 * Le message PAR DÉFAUT. « Réappro » ne s'écrit ni ici, ni en base, ni dans
 * PocketApp : il se décide au SEUL endroit qui l'affiche, le bundle du site
 * (`StockBadge.jsx` et `axeAvailability.js`). Le poser ici en ferait une
 * deuxième copie à tenir d'accord avec la première.
 *
 * PHP 7.4+.
 */

declare(strict_types=1);

// Ce fichier ne répond à rien : appelé directement en HTTP, il se tait.
if (count(get_included_files()) === 1) {
    http_response_code(404);
    exit;
}

/** La longueur du message, EN CARACTÈRES. Même borne que `MAX_MESSAGE`
 *  (`frontend/lib/catalog/availability.ts`) et `AvailabilityLabelMaxLength`
 *  (`backend/migrations/add_availability_to_products.go`). La colonne, elle, est
 *  en VARCHAR(120) : de la place pour les octets d'un texte accentué. */
const AVAILABILITY_LABEL_MAX = 60;

/**
 * Le message remis au propre, ou `null` s'il ne reste rien.
 *
 * Les sauts de ligne, tabulations et suites d'espaces sont réduits à une
 * espace : le message est une ligne, et un texte collé depuis un tableur en
 * porte. La longueur est COUPÉE, pas refusée — un message trop long est une
 * maladresse de saisie, pas une donnée dangereuse, contrairement à une URL où
 * le refus est la bonne réponse.
 *
 * `null` et non `''` : la colonne est `DEFAULT NULL`, et l'absence veut dire
 * « le défaut du site ».
 *
 * @param mixed $valeur
 */
function availability_label_normalise($valeur): ?string
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
        // valide. On ne devine pas : on refuse le message, le site prendra son
        // défaut.
        return null;
    }
    $propre = trim($propre);
    if ($propre === '') {
        return null;
    }

    // mb_substr et non substr : couper au milieu d'un caractère accentué
    // produirait une chaîne que `json_encode` refuserait ensuite.
    $propre = function_exists('mb_substr')
        ? mb_substr($propre, 0, AVAILABILITY_LABEL_MAX)
        : substr($propre, 0, AVAILABILITY_LABEL_MAX);

    return $propre === '' ? null : $propre;
}

/**
 * Ce que le SITE reçoit : `null` tant que le produit est en stock, ou quand le
 * magasin n'a rien écrit — le site affiche alors son défaut —, sinon un objet
 * portant le message.
 *
 * Un objet et non une chaîne, pour la même raison que `promo`, `stock_b` et
 * `featured` en sont : le message gagnera peut-être une couleur ou une icône, et
 * une clé de plus dans un objet ne casse aucun consommateur, alors que changer
 * une chaîne en objet les casse tous.
 *
 * `$stock` est le stock NEUF. Stock B ne compte pas : « Réappro » se dit du
 * neuf, et le site affiche déjà ses unités B à part (`AxePrice`).
 *
 * ⚠️ Cette fonction ne croise RIEN avec `status` : `catalog.php` ne sert que
 * les produits publiés, la question ne se pose pas.
 *
 * @param mixed $stock
 * @param mixed $label
 * @return array{label: string}|null
 */
function availability_affiche($stock, $label): ?array
{
    // Un stock qui n'est pas un nombre n'est pas « à zéro » : on ne devine pas,
    // et le site garde son affichage habituel.
    if (!is_numeric($stock) || (int) $stock > 0) {
        return null;
    }

    $propre = availability_label_normalise($label);
    if ($propre === null) {
        return null;
    }

    return ['label' => $propre];
}
