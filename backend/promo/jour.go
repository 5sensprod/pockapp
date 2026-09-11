// backend/promo/jour.go
// ═══════════════════════════════════════════════════════════════════════════
// LE JOUR DE RÉFÉRENCE D'UNE PROMOTION
// ═══════════════════════════════════════════════════════════════════════════
//
// Une seule horloge décide si une promo est en cours : celle du serveur, lue à
// Paris. La caisse la reçoit par `GET /api/time/today`
// (`backend/routes/jour_routes.go`) et ne lit jamais celle du navigateur — le
// déploiement est multi-postes, et un poste mal réglé vendrait autrement une
// promo expirée, ou refuserait une promo commencée.
//
// La même règle est écrite trois fois, et c'est assumé : TypeScript pour la
// caisse (`frontend/lib/pricing/promo-price.ts`), Go ici pour l'expiration,
// PHP pour le site (`server/api/catalog.php`). Elle est donc réduite au strict
// minimum — deux dates calendaires, bornes incluses, comparées comme du texte —
// et chaque copie a ses cas de test.
package promo

import (
	"time"
	// Windows n'embarque pas la base des fuseaux horaires : sans ce paquet,
	// `LoadLocation("Europe/Paris")` échoue sur le poste du client et le jour
	// retomberait sur UTC — une promo finirait à 1 h ou 2 h du matin.
	_ "time/tzdata"
)

// Fuseau du magasin. Une constante et non un réglage : un seul magasin, et une
// valeur qu'on changerait par erreur décalerait toutes les promos d'un jour.
const Fuseau = "Europe/Paris"

var paris = func() *time.Location {
	loc, err := time.LoadLocation(Fuseau)
	if err != nil {
		// Impossible avec time/tzdata ; on garde un repli plutôt qu'une panique.
		return time.FixedZone("CET", 3600)
	}
	return loc
}()

// JourParis rend la date calendaire à Paris, au format « AAAA-MM-JJ ».
func JourParis(t time.Time) string {
	return t.In(paris).Format("2006-01-02")
}

// EnCours dit si une période [debut, fin] contient `jour`, bornes incluses.
// Une borne vide est ouverte. Les trois valeurs sont « AAAA-MM-JJ » : l'ordre
// lexicographique EST l'ordre des dates.
func EnCours(debut, fin, jour string) bool {
	if debut != "" && jour < debut {
		return false
	}
	if fin != "" && jour > fin {
		return false
	}
	return true
}

// Expiree dit si une opération commerciale doit repasser en « Plein tarif » :
// soldée ou en promotion, avec une fin STRICTEMENT antérieure au jour.
// Une promo programmée (début futur) n'expire pas : elle attend.
func Expiree(saleState, fin, jour string) bool {
	if saleState != "sale" && saleState != "promo" {
		return false
	}
	return fin != "" && fin < jour
}
