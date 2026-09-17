// backend/remise/plafond.go
// ═══════════════════════════════════════════════════════════════════════════
// LE PLAFOND DE REMISE D'UN VENDEUR — UNE RÈGLE, ÉCRITE UNE FOIS
// ═══════════════════════════════════════════════════════════════════════════
//
// L'administrateur fixe par utilisateur un pourcentage maximal de remise
// (`users.discount_limit_enabled`, `users.max_discount_percent` —
// `backend/migrations/add_discount_limit_to_users.go`). Trois chemins
// d'écriture le respectent : `POST /api/pos/ticket`, et les hooks de création
// et de modification de `invoices` et `quotes`. React borne la saisie pour le
// confort ; c'est ICI qu'on refuse, parce qu'un poste au navigateur ou un
// vieux build n'appliquerait pas une limite écrite seulement à l'écran.
//
// ── CE QUI N'EST PAS UNE REMISE DU VENDEUR ────────────────────────────────
// Le prix promo en vigueur et le prix Stock B sont fixés sur la fiche par
// l'administrateur, et posés en remise de ligne (`promo-price.ts`). Ils
// abaissent donc le PRIX DE RÉFÉRENCE de la ligne : le plafond du vendeur
// s'applique au-delà.
//
// ── LE PRIX DE RÉFÉRENCE VIENT DE LA FICHE ────────────────────────────────
// Pas du prix unitaire envoyé : sinon il suffirait de retaper un prix plus bas
// au lieu de poser une remise. Une ligne libre, sans produit, garde le prix
// saisi — elle n'a pas de fiche.
//
// ── DEUX CONTRÔLES ────────────────────────────────────────────────────────
//   - chaque ligne : total net ≥ référence × quantité × (1 − plafond) ;
//   - le document : total TTC ≥ Σ références × (1 − plafond).
//
// ── PAS DE REMISE GLOBALE ─────────────────────────────────────────────────
// Un vendeur limité ne pose AUCUNE remise sur le panier ou le document
// (demande du 17 septembre 2026) : seulement des remises de ligne, en %, en
// prix unitaire ou en prix retapé — toutes jugées sur leur montant net.
package remise

import (
	"fmt"
	"math"
	"strings"
	"time"

	"pocket-react/backend/promo"

	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

// tolerance absorbe les arrondis au centime des remises en pourcentage.
const tolerance = 0.011

// MarqueStockB est le suffixe que la caisse pose sur le nom d'une ligne vendue
// sur le compteur B (voir CLAUDE.md, « La caisse vend du B »).
const MarqueStockB = "(Stock B)"

// Plafond rend le pourcentage maximal de remise d'un utilisateur, et `false`
// quand il n'est pas limité — administrateur, plafond désactivé, ou aucun
// utilisateur authentifié (écriture interne).
func Plafond(user *models.Record) (float64, bool) {
	if user == nil || user.GetString("role") == "admin" {
		return 0, false
	}
	if !user.GetBool("discount_limit_enabled") {
		return 0, false
	}
	return math.Min(100, math.Max(0, user.GetFloat("max_discount_percent"))), true
}

// ErrRemiseGlobale est rendue quand un vendeur limité pose une remise globale.
var ErrRemiseGlobale = fmt.Errorf("remise globale refusée : votre compte n'autorise que des remises par ligne")

// VerifierRemiseGlobale refuse toute remise globale d'un vendeur limité.
func VerifierRemiseGlobale(valeur float64) error {
	if valeur > 0 {
		return ErrRemiseGlobale
	}
	return nil
}

// Ligne est une ligne de document, telle que la règle la juge.
type Ligne struct {
	Nom          string
	Quantite     float64
	PrixSaisiTTC float64 // prix unitaire TTC envoyé, avant remise
	NetTTC       float64 // total TTC de la ligne après sa remise
	Reference    float64 // prix unitaire de référence (0 = pas encore résolu)
}

// Verifier rend une erreur lisible par le vendeur si une ligne ou le document
// dépasse le plafond. Les lignes doivent porter leur Reference.
func Verifier(lignes []Ligne, totalTTC, plafond float64) error {
	facteur := 1 - plafond/100
	var plancherDocument float64

	for _, l := range lignes {
		if l.Quantite <= 0 || l.Reference <= 0 {
			continue
		}
		plancher := l.Reference * l.Quantite * facteur
		plancherDocument += plancher
		if l.NetTTC < plancher-tolerance {
			return fmt.Errorf(
				"remise refusée sur « %s » : %.1f %% accordés, votre maximum est %s %%",
				l.Nom, pourcent(l.NetTTC, l.Reference*l.Quantite), formatPlafond(plafond))
		}
	}

	if totalTTC < plancherDocument-tolerance {
		base := plancherDocument / facteur
		if facteur == 0 {
			base = 0
		}
		return fmt.Errorf(
			"remise refusée sur le total : %.1f %% accordés, votre maximum est %s %%",
			pourcent(totalTTC, base), formatPlafond(plafond))
	}
	return nil
}

// ResoudreReferences pose la Reference de chaque ligne depuis les fiches.
func ResoudreReferences(dao *daos.Dao, lignes []Ligne, produits []string) {
	jour := promo.JourParis(time.Now())
	cache := map[string]*models.Record{}

	for i := range lignes {
		ref := lignes[i].PrixSaisiTTC
		if lignes[i].Quantite > 0 && ref <= 0 && lignes[i].NetTTC > 0 {
			ref = lignes[i].NetTTC / lignes[i].Quantite
		}

		id := ""
		if i < len(produits) {
			id = produits[i]
		}
		if id != "" {
			fiche, vu := cache[id]
			if !vu {
				fiche, _ = dao.FindRecordById("products", id)
				cache[id] = fiche
			}
			if fiche != nil {
				ref = ReferenceFiche(fiche, lignes[i].Nom, jour, ref)
			}
		}
		lignes[i].Reference = ref
	}
}

// ReferenceFiche rend le prix unitaire de référence d'une ligne portant ce
// produit : le prix de la fiche, abaissé par la promo en vigueur ou, pour une
// ligne Stock B, par le prix B.
func ReferenceFiche(fiche *models.Record, nomLigne, jour string, repli float64) float64 {
	prix := fiche.GetFloat("price_ttc")
	if prix <= 0 {
		return repli
	}
	ref := prix

	if strings.Contains(nomLigne, MarqueStockB) {
		if b := fiche.GetFloat("stock_b_price_ttc"); b > 0 && b < ref {
			ref = b
		}
		return ref
	}

	etat := fiche.GetString("sale_state")
	if etat == "sale" || etat == "promo" {
		p := fiche.GetFloat("promo_price_ttc")
		if p > 0 && p < ref && promo.EnCours(fiche.GetString("promo_start"), fiche.GetString("promo_end"), jour) {
			ref = p
		}
	}
	return ref
}

func pourcent(net, base float64) float64 {
	if base <= 0 {
		return 0
	}
	return math.Max(0, (1-net/base)*100)
}

func formatPlafond(p float64) string {
	if p == math.Trunc(p) {
		return fmt.Sprintf("%.0f", p)
	}
	return fmt.Sprintf("%.1f", p)
}
