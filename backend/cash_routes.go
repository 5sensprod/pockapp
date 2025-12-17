// backend/routes/cash_routes.go
// Version corrigée avec les 3 fixes

package backend

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/models"

	// ✅ FIX 1 : Import du package reports
	// IMPORTANT : Remplacer "votre-projet" par le nom de votre module (voir go.mod)
	"pocket-react/backend/reports"
)

// DTOs ---------------------------------------------------------

type OpenSessionInput struct {
	OwnerCompany string  `json:"owner_company"`
	CashRegister string  `json:"cash_register"`
	OpeningFloat float64 `json:"opening_float"`
}

type CloseSessionInput struct {
	CountedCashTotal float64 `json:"counted_cash_total"`
}

type CashMovementInput struct {
	Session      string         `json:"session"`
	MovementType string         `json:"movement_type"`
	Amount       float64        `json:"amount"`
	Reason       string         `json:"reason"`
	Meta         map[string]any `json:"meta"`
}

// ROUTES -------------------------------------------------------

func RegisterCashRoutes(app *pocketbase.PocketBase, router *echo.Echo) {

	// ----------------------------------------------------------------------
	// OUVERTURE SESSION
	// ----------------------------------------------------------------------
	router.POST("/api/cash/session/open", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		var payload OpenSessionInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if payload.OwnerCompany == "" || payload.CashRegister == "" {
			return apis.NewBadRequestError("Champs requis manquants", nil)
		}

		// Vérifier s'il existe déjà une session ouverte
		filter := fmt.Sprintf("cash_register = '%s' && status = 'open'", payload.CashRegister)
		existing, _ := dao.FindFirstRecordByFilter("cash_sessions", filter)

		if existing != nil {
			return apis.NewBadRequestError(
				"Une session est déjà ouverte pour cette caisse", nil)
		}

		collection, _ := dao.FindCollectionByNameOrId("cash_sessions")
		rec := models.NewRecord(collection)
		rec.Set("owner_company", payload.OwnerCompany)
		rec.Set("cash_register", payload.CashRegister)
		rec.Set("status", "open")
		rec.Set("opened_at", time.Now())
		rec.Set("opening_float", payload.OpeningFloat)

		if info.AuthRecord != nil {
			rec.Set("opened_by", info.AuthRecord.Id)
		}

		if err := dao.SaveRecord(rec); err != nil {
			return apis.NewApiError(500, "Impossible d'ouvrir la session", err)
		}

		return c.JSON(http.StatusCreated, rec)
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// SESSION ACTIVE
	// ----------------------------------------------------------------------
	router.GET("/api/cash/session/active", func(c echo.Context) error {
		dao := app.Dao()
		registerId := c.QueryParam("cash_register")

		filter := "status = 'open'"

		if registerId != "" {
			filter = fmt.Sprintf("cash_register = '%s' && status = 'open'", registerId)
		}

		rec, _ := dao.FindFirstRecordByFilter("cash_sessions", filter)

		return c.JSON(http.StatusOK, echo.Map{
			"session": rec,
		})
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// FERMETURE SESSION
	// ----------------------------------------------------------------------
	router.POST("/api/cash/session/:id/close", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()
		id := c.PathParam("id")

		rec, err := dao.FindRecordById("cash_sessions", id)
		if err != nil {
			return apis.NewNotFoundError("Session introuvable", err)
		}

		if rec.GetString("status") != "open" {
			return apis.NewBadRequestError("Session déjà fermée", nil)
		}

		var payload CloseSessionInput
		_ = c.Bind(&payload)

		rec.Set("closed_at", time.Now())
		rec.Set("status", "closed")

		if payload.CountedCashTotal > 0 {
			rec.Set("counted_cash_total", payload.CountedCashTotal)
		}
		if info.AuthRecord != nil {
			rec.Set("closed_by", info.AuthRecord.Id)
		}

		if err := dao.SaveRecord(rec); err != nil {
			return apis.NewApiError(500, "Impossible de fermer la session", err)
		}

		return c.JSON(http.StatusOK, rec)
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// MOUVEMENT DE CAISSE
	// ----------------------------------------------------------------------
	router.POST("/api/cash/movements", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		dao := app.Dao()

		var payload CashMovementInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if payload.Session == "" {
			return apis.NewBadRequestError("Session requise", nil)
		}

		// Charger la session
		sessionRec, err := dao.FindRecordById("cash_sessions", payload.Session)
		if err != nil {
			return apis.NewBadRequestError("Session inconnue", err)
		}

		col, _ := dao.FindCollectionByNameOrId("cash_movements")
		rec := models.NewRecord(col)

		rec.Set("owner_company", sessionRec.Get("owner_company"))
		rec.Set("session", payload.Session)
		rec.Set("movement_type", payload.MovementType)
		rec.Set("amount", payload.Amount)
		rec.Set("reason", payload.Reason)
		rec.Set("meta", payload.Meta)

		if info.AuthRecord != nil {
			rec.Set("created_by", info.AuthRecord.Id)
		}

		if err := dao.SaveRecord(rec); err != nil {
			return apis.NewApiError(500, "Impossible de créer le mouvement", err)
		}

		return c.JSON(http.StatusCreated, rec)
	},
		apis.RequireRecordAuth(),
	)

	// ======================================================================
	// ✅ NOUVELLES ROUTES (AJOUTÉES)
	// ======================================================================

	// ----------------------------------------------------------------------
	// RAPPORT X (Lecture intermédiaire)
	// ----------------------------------------------------------------------
	router.GET("/api/cash/reports/x", func(c echo.Context) error {
		sessionId := c.QueryParam("session")
		if sessionId == "" {
			return apis.NewBadRequestError("Paramètre 'session' requis", nil)
		}

		rapport, err := reports.GenerateRapportX(app, sessionId)
		if err != nil {
			return apis.NewApiError(500, err.Error(), err)
		}

		return c.JSON(http.StatusOK, rapport)
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// RAPPORT Z (Clôture journalière)
	// ----------------------------------------------------------------------
	router.GET("/api/cash/reports/z", func(c echo.Context) error {
		cashRegisterId := c.QueryParam("cash_register")
		date := c.QueryParam("date")

		if cashRegisterId == "" || date == "" {
			return apis.NewBadRequestError("Paramètres 'cash_register' et 'date' requis", nil)
		}

		rapport, err := reports.GenerateRapportZ(app, cashRegisterId, date)
		if err != nil {
			return apis.NewApiError(500, err.Error(), err)
		}

		return c.JSON(http.StatusOK, rapport)
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// DÉTAIL SESSION
	// ----------------------------------------------------------------------
	router.GET("/api/cash/session/:id/report", func(c echo.Context) error {
		dao := app.Dao()
		sessionId := c.PathParam("id")

		// 1. Charger la session
		session, err := dao.FindRecordById("cash_sessions", sessionId)
		if err != nil {
			return apis.NewNotFoundError("Session introuvable", err)
		}

		// 2. Charger les mouvements de caisse
		movementsFilter := fmt.Sprintf("session = '%s'", sessionId)
		movements, err := dao.FindRecordsByFilter(
			"cash_movements",
			movementsFilter,
			"created",
			0,
			0,
		)

		if err != nil {
			return apis.NewApiError(500, "Erreur chargement mouvements", err)
		}

		return c.JSON(http.StatusOK, echo.Map{
			"session":   session,
			"movements": movements,
		})
	},
		apis.RequireRecordAuth(),
	)

	// ----------------------------------------------------------------------
	// HISTORIQUE SESSIONS
	// ----------------------------------------------------------------------
	router.GET("/api/cash/sessions", func(c echo.Context) error {
		dao := app.Dao()

		// Paramètres de filtrage
		cashRegister := c.QueryParam("cash_register")
		status := c.QueryParam("status")
		dateFrom := c.QueryParam("date_from")
		dateTo := c.QueryParam("date_to")

		// Pagination
		page := 1
		if p := c.QueryParam("page"); p != "" {
			if parsed, err := strconv.Atoi(p); err == nil {
				page = parsed
			}
		}

		perPage := 50
		if pp := c.QueryParam("perPage"); pp != "" {
			if parsed, err := strconv.Atoi(pp); err == nil {
				perPage = parsed
			}
		}

		// Construire le filtre
		var filters []string

		if cashRegister != "" {
			filters = append(filters, fmt.Sprintf("cash_register = '%s'", cashRegister))
		}

		if status != "" {
			filters = append(filters, fmt.Sprintf("status = '%s'", status))
		}

		if dateFrom != "" {
			dateStart, err := time.Parse("2006-01-02", dateFrom)
			if err == nil {
				filters = append(filters, fmt.Sprintf("opened_at >= '%s'", dateStart.Format(time.RFC3339)))
			}
		}

		if dateTo != "" {
			dateEnd, err := time.Parse("2006-01-02", dateTo)
			if err == nil {
				dateEnd = dateEnd.Add(24 * time.Hour)
				filters = append(filters, fmt.Sprintf("opened_at < '%s'", dateEnd.Format(time.RFC3339)))
			}
		}

		var finalFilter string
		if len(filters) > 0 {
			finalFilter = strings.Join(filters, " && ")
		}

		// ✅ FIX 3 : Utiliser FindRecordsByFilter (pas FindRecordsByExpr)
		result, err := dao.FindRecordsByFilter(
			"cash_sessions",
			finalFilter,
			"-opened_at",
			perPage,
			(page-1)*perPage,
		)

		if err != nil {
			return apis.NewApiError(500, "Erreur chargement sessions", err)
		}

		// ✅ FIX 2 : Utiliser len(result) au lieu de dao.CountRecords
		return c.JSON(http.StatusOK, echo.Map{
			"sessions":   result,
			"page":       page,
			"perPage":    perPage,
			"totalItems": len(result),
		})
	},
		apis.RequireRecordAuth(),
	)
}
