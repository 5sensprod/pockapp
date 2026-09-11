// backend/routes/jour_routes.go
//
// LE JOUR DU SERVEUR — la seule horloge qui décide si une promo est en cours.
//
// La caisse, les factures et les devis appliquent un prix promo selon sa
// période (`frontend/lib/pricing/promo-price.ts`). Ils ne lisent pas l'horloge
// du navigateur : le déploiement est multi-postes, et chaque poste aurait la
// sienne. Ils lisent celle-ci, donnée à Paris (`backend/promo/jour.go`).
//
// Pas de nouvelle sortie réseau : la route est locale, servie par le
// PocketBase embarqué (point 1 de CLAUDE.md).

package routes

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"

	"pocket-react/backend/promo"
)

func RegisterJourRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/time/today", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"today":    promo.JourParis(time.Now()),
			"timezone": promo.Fuseau,
		})
	}, apis.RequireAdminOrRecordAuth())
}
