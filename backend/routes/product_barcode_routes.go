// backend/routes/product_barcode_routes.go
//
// GÉNÉRATION D'UN EAN-13 INTERNE, CÔTÉ SERVEUR.
//
// Le préfixe 200 appartient à la plage d'usage interne. Le navigateur ne tire
// jamais le numéro lui-même : il demande une proposition à cette route, qui
// vérifie d'abord son absence dans `products.barcode`.
//
// Le verrou protège aussi l'intervalle entre « Générer » et « Enregistrer » :
// une proposition est gardée en mémoire jusqu'à l'arrêt du serveur. Deux
// postes servis par le même PocketBase ne peuvent donc pas recevoir le même
// numéro, même si le premier n'a pas encore enregistré sa fiche.
//
// Ce n'est délibérément PAS une contrainte sur `products.barcode`. Une saisie
// manuelle en doublon continue d'avertir sans bloquer, conformément à la règle
// de `product_duplicates_routes.go`.

package routes

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net/http"
	"sync"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
)

const (
	prefixeEAN13Interne = "200"
	maxTentativesEAN13  = 100
)

type generateurEAN13 struct {
	mu       sync.Mutex
	proposes map[string]struct{}
	prochain func() (string, error)
}

var generateurCodeBarres = &generateurEAN13{
	proposes: make(map[string]struct{}),
	prochain: nouvelEAN13Interne,
}

func RegisterProductBarcodeRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.POST("/api/catalog/products/barcode/generate", func(c echo.Context) error {
		code, err := generateurCodeBarres.proposer(func(candidat string) (bool, error) {
			var nombre int
			err := app.Dao().DB().
				Select("COUNT(*)").
				From("products").
				// Même règle que le garde-fou des doublons : les espaces de bord
				// ne rendent pas deux codes différents.
				Where(dbx.NewExp("TRIM(barcode) = {:barcode}", dbx.Params{
					"barcode": candidat,
				})).
				Row(&nombre)
			return nombre > 0, err
		})
		if err != nil {
			return apis.NewApiError(
				http.StatusInternalServerError,
				"génération du code-barres indisponible",
				err,
			)
		}
		return c.JSON(http.StatusOK, map[string]string{"barcode": code})
	}, apis.RequireRecordAuth())
}

// proposer tient la génération, la vérification en base et la réservation
// locale sous le même verrou. `existe` reste injecté pour tester la règle sans
// démarrer PocketBase.
func (g *generateurEAN13) proposer(existe func(string) (bool, error)) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	for tentative := 0; tentative < maxTentativesEAN13; tentative++ {
		candidat, err := g.prochain()
		if err != nil {
			return "", err
		}
		if _, dejaPropose := g.proposes[candidat]; dejaPropose {
			continue
		}
		pris, err := existe(candidat)
		if err != nil {
			return "", err
		}
		if pris {
			continue
		}
		g.proposes[candidat] = struct{}{}
		return candidat, nil
	}

	return "", fmt.Errorf("aucun EAN-13 libre après %d tentatives", maxTentativesEAN13)
}

// nouvelEAN13Interne tire les neuf chiffres disponibles après le préfixe 200.
// L'aléatoire ne porte pas la garantie d'unicité : celle-ci vient de
// `proposer`, qui contrôle la base et les propositions en attente.
func nouvelEAN13Interne() (string, error) {
	borne := big.NewInt(1_000_000_000)
	nombre, err := rand.Int(rand.Reader, borne)
	if err != nil {
		return "", err
	}
	base := fmt.Sprintf("%s%09d", prefixeEAN13Interne, nombre.Int64())
	return base + fmt.Sprint(CalculerCleEAN13(base)), nil
}

// CalculerCleEAN13 calcule le treizième chiffre depuis les douze premiers.
// L'appelant garantit une chaîne de douze chiffres ; la fonction reste petite
// et exportée pour que la règle arithmétique soit testée directement.
func CalculerCleEAN13(base string) int {
	somme := 0
	for i := 0; i < len(base); i++ {
		chiffre := int(base[i] - '0')
		if i%2 == 0 {
			somme += chiffre
		} else {
			somme += chiffre * 3
		}
	}
	return (10 - somme%10) % 10
}

func EAN13Valide(code string) bool {
	if len(code) != 13 {
		return false
	}
	for i := range code {
		if code[i] < '0' || code[i] > '9' {
			return false
		}
	}
	return int(code[12]-'0') == CalculerCleEAN13(code[:12])
}
