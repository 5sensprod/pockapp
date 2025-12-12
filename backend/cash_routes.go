package backend

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/models"
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
		existing, _ := dao.FindFirstRecordByFilter(
			"cash_sessions",
			"cash_register = {:reg} && status = 'open'",
			dbx.Params{"reg": payload.CashRegister},
		)

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
			return apis.NewApiError(500, "Impossible d’ouvrir la session", err)
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
		params := dbx.Params{}

		if registerId != "" {
			filter = "cash_register = {:reg} && status = 'open'"
			params["reg"] = registerId
		}

		rec, _ := dao.FindFirstRecordByFilter("cash_sessions", filter, params)

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
}
