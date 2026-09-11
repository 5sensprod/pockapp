<?php
/**
 * La période d'une promo, et ce que le site montre d'un prix réduit.
 *
 * Inclus par `api/products-sync.php` (validation des dates reçues) et par
 * `api/catalog.php` (ce qui est rendu au site). Fonctions pures, sans base ni
 * sortie : vérifiées par `tests/promo-test.php`, en ligne de commande.
 *
 * ─── LA MÊME RÈGLE EXISTE TROIS FOIS ───────────────────────────────────────
 * En TypeScript pour la caisse (`frontend/lib/pricing/promo-price.ts`), en Go
 * pour l'expiration des fiches (`backend/promo/jour.go`), ici pour le site.
 * C'est assumé : le site doit retirer un prix barré à la date de fin SANS
 * attendre une synchronisation. La règle est donc réduite au minimum — deux
 * jours « AAAA-MM-JJ », bornes incluses, comparés comme du texte — et les
 * trois copies ont les mêmes cas de test.
 *
 * Le jour est celui de PARIS, pas celui du mutualisé : son fuseau est inconnu
 * et peut changer sans préavis.
 *
 * PHP 7.4+.
 */

declare(strict_types=1);

// Ce fichier ne répond à rien : appelé directement en HTTP, il se tait.
if (count(get_included_files()) === 1) {
    http_response_code(404);
    exit;
}

const PROMO_FUSEAU = 'Europe/Paris';

/** Le jour calendaire à Paris, « AAAA-MM-JJ ». `$maintenant` sert aux tests. */
function promo_jour_paris(?DateTimeInterface $maintenant = null): string
{
    $horodatage = $maintenant !== null ? $maintenant->getTimestamp() : time();
    return (new DateTimeImmutable('@' . $horodatage))
        ->setTimezone(new DateTimeZone(PROMO_FUSEAU))
        ->format('Y-m-d');
}

/**
 * Lit une borne de période reçue.
 *
 * @param mixed $valeur
 * @return string|false|null  la date telle quelle, `null` si absente ou vide,
 *                            `false` si elle n'est pas un jour réel
 */
function promo_date($valeur)
{
    if ($valeur === null || $valeur === '') {
        return null;
    }
    if (!is_string($valeur) || preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $valeur, $m) !== 1) {
        return false;
    }
    // Le motif laisse passer « 2026-02-30 » : checkdate le refuse.
    return checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? $valeur : false;
}

/** Le jour est-il dans la période ? Bornes incluses, borne vide = ouverte. */
function promo_en_cours(?string $debut, ?string $fin, string $jour): bool
{
    if ($debut !== null && $debut !== '' && $jour < $debut) {
        return false;
    }
    if ($fin !== null && $fin !== '' && $jour > $fin) {
        return false;
    }
    return true;
}

/**
 * Le prix promo à AFFICHER ce jour-là, ou null. Mêmes quatre conditions que
 * `prixPromoActif` côté caisse : opération soldée ou promo, prix promo saisi,
 * strictement inférieur au prix, jour dans la période.
 *
 * @return array{price_ttc: float, ends_on: ?string}|null
 */
function promo_active(string $saleState, float $prix, ?float $promo, ?string $debut, ?string $fin, string $jour): ?array
{
    if ($saleState !== 'sale' && $saleState !== 'promo') {
        return null;
    }
    if (!($prix > 0) || $promo === null || !($promo > 0) || $promo >= $prix) {
        return null;
    }
    if (!promo_en_cours($debut, $fin, $jour)) {
        return null;
    }
    return [
        'price_ttc' => round($promo, 2),
        'ends_on'   => ($fin !== null && $fin !== '') ? $fin : null,
    ];
}

/**
 * L'opération commerciale telle que le site doit la montrer : vidée hors de
 * sa période. Une promo finie repasse en « plein tarif » à la date de fin,
 * sans attendre que PocketApp réécrive la fiche et la renvoie ; une promo
 * programmée ne s'affiche pas avant son début.
 *
 * Sans période, la valeur reçue est rendue telle quelle — c'est l'état des
 * fiches soldées avant le 11 septembre 2026, qui n'ont pas de prix promo.
 */
function promo_etat_affiche(string $saleState, ?string $debut, ?string $fin, string $jour): string
{
    return promo_en_cours($debut, $fin, $jour) ? $saleState : '';
}

/**
 * Le Stock B à afficher, ou null s'il n'y en a pas. Le prix B n'est rendu que
 * s'il est une vraie baisse — même règle que `prixStockB` côté caisse. Le
 * Stock B n'a pas de période.
 *
 * @return array{quantity: int, price_ttc: ?float}|null
 */
function stock_b_affiche(int $quantite, float $prix, ?float $prixB): ?array
{
    if ($quantite <= 0) {
        return null;
    }
    $prixAffiche = ($prixB !== null && $prixB > 0 && $prix > 0 && $prixB < $prix)
        ? round($prixB, 2)
        : null;
    return ['quantity' => $quantite, 'price_ttc' => $prixAffiche];
}
