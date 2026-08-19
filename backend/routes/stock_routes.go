// backend/routes/stock_routes.go
//
// LE MOUVEMENT DE STOCK, CÔTÉ SERVEUR — la partie qui doit être atomique.
//
// ── LE DÉFAUT QUE CE FICHIER CORRIGE ──────────────────────────────────────
// `frontend/lib/queries/stock-adjust.ts` lisait le stock puis le réécrivait,
// en deux appels REST. Entre les deux, un autre poste pouvait faire la même
// chose : les deux lisaient 10, les deux écrivaient 9, deux ventes ne
// retiraient qu'une unité. Tenable tant qu'un seul poste vendait ; le
// déploiement est multi-postes depuis le 19 août 2026 — un poste sur
// l'application bureau, les autres au navigateur (docs/DECISIONS.md).
//
// ── POURQUOI C'EST ATOMIQUE ICI, ET PAS AILLEURS ──────────────────────────
// Ce n'est pas la transaction seule qui protège : c'est le fait que PocketBase
// n'ouvre **qu'une seule connexion d'écriture**. Vérifié dans la bibliothèque,
// v0.22.22 : `core/base.go:1035` pose `nonconcurrentDB.SetMaxOpenConns(1)`, et
// `daos/base.go:130` fait tourner `RunInTransaction` sur cette connexion. Deux
// requêtes concurrentes se sérialisent donc à la connexion, et la lecture d'un
// stock ne peut pas être doublée par l'écriture d'un autre poste.
//
// C'est aussi pourquoi le correctif ne pouvait pas être écrit côté client :
// une garde dans le navigateur ne voit pas l'autre poste.
//
// ── CE QUE CETTE ROUTE NE FAIT PAS ────────────────────────────────────────
// Elle ne journalise pas. Le journal (`product_events`) reste écrit par le
// client, au même endroit qu'avant, et reste « best-effort » : une trace ratée
// ne défait pas un mouvement appliqué. La route ne porte que le nombre, qui
// est la seule chose qui avait besoin d'être atomique.
//
// Elle n'écarte pas non plus un lot entier sur une ligne fautive : chaque
// mouvement a sa propre transaction, comme le client traitait chaque produit
// séparément. Un produit introuvable est rendu dans le résultat, pas levé.
//
// Pas de nouvelle sortie réseau : la route est locale, servie par le
// PocketBase embarqué (point 1 de CLAUDE.md).

package routes

import (
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/daos"
)

// StockMovementInput — un mouvement, dans la forme que le client tient déjà.
type StockMovementInput struct {
	// Identifiant PocketBase OU clé stable NeDB (`legacy_id`). Résolu ici,
	// jamais supposé : le pont entre les deux bases est encore nécessaire en
	// lecture (CLAUDE.md).
	ProductID string `json:"product_id"`
	// Mouvement relatif : -1 pour une vente, +2 pour un retour.
	Delta *float64 `json:"delta"`
	// Valeur absolue : ce que l'inventaire a compté. Prime sur `delta` —
	// l'inventaire ne corrige pas, il constate.
	Absolute *float64 `json:"absolute"`
}

type StockAdjustInput struct {
	Movements []StockMovementInput `json:"movements"`
}

// StockMovementResult reprend les champs de `StockAdjustResult` côté client.
type StockMovementResult struct {
	ProductID string `json:"product_id"`
	RecordID  string `json:"record_id"`
	// Le nom et le code au moment du mouvement. Rendus parce que le client en a
	// besoin pour le journal et qu'il ne lit plus le produit lui-même : sans
	// eux, une entrée d'inventaire serait journalisée sans nom.
	ProductName string   `json:"product_name"`
	ProductSku  string   `json:"product_sku"`
	StockBefore *float64 `json:"stock_before"`
	StockAfter  *float64 `json:"stock_after"`
	Applied     bool     `json:"applied"`
	Error       string   `json:"error,omitempty"`
}

type StockAdjustOutput struct {
	Results []StockMovementResult `json:"results"`
}

// La borne existe pour qu'un corps mal formé ne tienne pas la connexion
// d'écriture unique : chaque mouvement la prend à son tour, et la caisse
// attend derrière. Un ticket réel dépasse rarement quelques dizaines de
// lignes ; un inventaire s'envoie déjà entrée par entrée.
const maxStockMovements = 500

func RegisterStockRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.POST("/api/stock/adjust", func(c echo.Context) error {
		var payload StockAdjustInput
		if err := c.Bind(&payload); err != nil {
			return apis.NewBadRequestError("Corps invalide", err)
		}

		if len(payload.Movements) == 0 {
			return c.JSON(http.StatusOK, StockAdjustOutput{
				Results: []StockMovementResult{},
			})
		}

		if len(payload.Movements) > maxStockMovements {
			return apis.NewBadRequestError("trop de mouvements dans un seul lot", nil)
		}

		results := make([]StockMovementResult, 0, len(payload.Movements))

		for _, mouvement := range payload.Movements {
			results = append(results, applyOneMovement(app, mouvement))
		}

		return c.JSON(http.StatusOK, StockAdjustOutput{Results: results})
	}, apis.RequireRecordAuth())
}

// applyOneMovement fait tenir la lecture et l'écriture dans une seule
// transaction. C'est tout l'objet du fichier.
func applyOneMovement(app *pocketbase.PocketBase, mouvement StockMovementInput) StockMovementResult {
	res := StockMovementResult{ProductID: mouvement.ProductID}

	if mouvement.ProductID == "" {
		res.Error = "product_id requis"
		return res
	}

	err := app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		produit, err := tx.FindFirstRecordByFilter(
			"products",
			"id = {:cle} || legacy_id = {:cle}",
			dbx.Params{"cle": mouvement.ProductID},
		)
		if err != nil {
			return err
		}

		avant := produit.GetFloat("stock")
		apres := NextStock(avant, mouvement)

		res.RecordID = produit.Id
		res.ProductName = produit.GetString("name")
		res.ProductSku = produit.GetString("sku")
		res.StockBefore = &avant
		res.StockAfter = &apres

		// Un comptage conforme n'est pas un mouvement : on ne réécrit pas, et le
		// client ne journalise pas non plus (`applied` reste faux).
		if apres == avant {
			return nil
		}

		produit.Set("stock", apres)
		if err := tx.SaveRecord(produit); err != nil {
			return err
		}

		res.Applied = true
		return nil
	})

	if err != nil {
		// L'échec annule la transaction : les deux bornes rendues seraient
		// mensongères.
		res.StockBefore = nil
		res.StockAfter = nil
		res.Applied = false
		res.Error = err.Error()
	}

	return res
}

// NextStock — le stock après mouvement. Aucun plafonnement à zéro : un stock
// négatif est une information, l'écraser masquerait la cause. Exportée pour
// être testée seule, la règle étant la même que côté client
// (`nextStock` dans `frontend/lib/queries/stock-adjust.ts`).
func NextStock(avant float64, mouvement StockMovementInput) float64 {
	if mouvement.Absolute != nil {
		return *mouvement.Absolute
	}
	if mouvement.Delta != nil {
		return avant + *mouvement.Delta
	}
	return avant
}
