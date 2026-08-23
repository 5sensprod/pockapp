// backend/routes/journal_routes.go
//
// Le journal des ventes, servi par le PocketBase embarqué.
//
// Pas de nouvelle sortie réseau : la route est locale (point 1 de CLAUDE.md).
// Lecture seule — elle n'écrit rien, nulle part.
//
// Le calcul est dans backend/reports/journal.go, et il réutilise le
// classificateur du rapport Z. L'écran ne recalcule rien : les règles des quatre
// lignes n'existent qu'à un seul endroit.

package routes

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"

	"pocket-react/backend/reports"
)

type journalReponse struct {
	Du     string                `json:"du"`
	Au     string                `json:"au"`
	Jours  []reports.JournalJour `json:"jours"`
	Totaux reports.JournalTotaux `json:"totaux"`
}

// RegisterJournalRoutes expose GET /api/reports/journal?du=&au=&company=
//
// Par défaut : les 30 derniers jours, jusqu'à aujourd'hui.
func RegisterJournalRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/reports/journal", func(c echo.Context) error {
		ownerCompany := c.QueryParam("company")
		if ownerCompany == "" {
			return apis.NewBadRequestError("paramètre company requis", nil)
		}

		au := c.QueryParam("au")
		if au == "" {
			au = time.Now().Format("2006-01-02")
		}
		du := c.QueryParam("du")
		if du == "" {
			fin, err := time.Parse("2006-01-02", au)
			if err != nil {
				return apis.NewBadRequestError("paramètre au invalide", err)
			}
			du = fin.AddDate(0, 0, -29).Format("2006-01-02")
		}

		jours, totaux, err := reports.JournalDesVentes(app, ownerCompany, du, au)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), err)
		}

		return c.JSON(http.StatusOK, journalReponse{
			Du:     du,
			Au:     au,
			Jours:  jours,
			Totaux: totaux,
		})
	}, apis.RequireRecordAuth())
}
