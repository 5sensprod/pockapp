// backend/routes/polices_routes.go
//
// GET /api/fonts/file?family=Roboto&weight=700 — le fichier TTF d'une police,
// pour le contour vectoriel des lettres de PocketStick. Mécanisme et sortie
// réseau : backend/polices/polices.go, point 9 de CLAUDE.md.
//
// En-tête de réponse `X-Font-Weight` : la graisse RÉELLEMENT servie. Une
// famille sans gras rend son 400 ; le navigateur, lui, fabrique alors un gras
// que le renderer doit reproduire.

package routes

import (
	"errors"
	"net/http"
	"path/filepath"
	"strconv"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"

	"pocket-react/backend/polices"
)

func RegisterPolicesRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	fournisseur := polices.Nouveau(filepath.Join(app.DataDir(), "polices"))

	router.GET("/api/fonts/file", func(c echo.Context) error {
		graisse, err := strconv.Atoi(c.QueryParam("weight"))
		if err != nil {
			graisse = 400
		}
		p, err := fournisseur.Lire(c.Request().Context(), c.QueryParam("family"), graisse)
		if err != nil {
			statut := http.StatusBadRequest
			if errors.Is(err, polices.ErrInconnue) {
				statut = http.StatusNotFound
			}
			return c.JSON(statut, map[string]string{"error": err.Error()})
		}
		h := c.Response().Header()
		h.Set("X-Font-Weight", strconv.Itoa(p.Graisse))
		h.Set("X-Font-Source", p.Source)
		h.Set("Access-Control-Expose-Headers", "X-Font-Weight, X-Font-Source")
		h.Set("Cache-Control", "private, max-age=86400")
		return c.Blob(http.StatusOK, "font/ttf", p.Octets)
	}, apis.RequireAdminOrRecordAuth())
}
