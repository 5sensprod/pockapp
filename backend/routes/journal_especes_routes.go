// backend/routes/journal_especes_routes.go
//
// Le journal des espèces, servi par le PocketBase embarqué.
//
// Pas de nouvelle sortie réseau : la route est locale (point 1 de CLAUDE.md).
// Lecture seule — elle n'écrit rien, nulle part.
//
// Le calcul est dans backend/reports/journal_especes.go. L'écran ne recalcule
// rien : le sens d'un mouvement et la composition du solde n'existent qu'à un
// seul endroit, et c'est le même signe qu'applique aggregateZ.

package routes

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"

	"pocket-react/backend/reports"
)

type journalEspecesReponse struct {
	Du     string                   `json:"du"`
	Au     string                   `json:"au"`
	Jours  []reports.JourneeEspeces `json:"jours"`
	Totaux reports.TotauxEspeces    `json:"totaux"`
}

// RegisterJournalEspecesRoutes expose
// GET /api/reports/journal-especes?du=&au=&company=
//
// Par défaut : les 30 derniers jours, jusqu'à aujourd'hui — mêmes bornes que le
// journal des ventes, pour que les deux écrans se lisent côte à côte.
func RegisterJournalEspecesRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/reports/journal-especes", func(c echo.Context) error {
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

		jours, totaux, err := reports.JournalDesEspeces(app, ownerCompany, du, au)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), err)
		}

		return c.JSON(http.StatusOK, journalEspecesReponse{
			Du:     du,
			Au:     au,
			Jours:  jours,
			Totaux: totaux,
		})
	}, apis.RequireRecordAuth())
}
