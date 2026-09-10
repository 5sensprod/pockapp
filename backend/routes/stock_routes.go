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
// ── LE JOURNAL EST DANS LA MÊME TRANSACTION ───────────────────────────────
// Depuis le 10 septembre 2026, la route écrit aussi l'événement
// `product_events`, dans la transaction du stock. Avant, le client l'écrivait
// APRÈS, en « best-effort » : un événement refusé laissait un stock modifié
// sans trace, et l'historique affiché sur la fiche produit mentait par
// omission. Désormais les deux passent ensemble ou pas du tout — un journal
// refusé ANNULE le mouvement, et l'erreur est rendue sur la ligne.
//
// ⚠️ `Dao.SaveRecord` ne valide PAS les valeurs d'un select (seul le
// formulaire REST le fait) : `event_type` et `source` sont donc vérifiés ici,
// contre le schéma réel. Sans cela, une base sans la migration des motifs
// accepterait des valeurs qu'aucun filtre ne retrouverait.
//
// Sans bloc `journal` dans le corps, rien n'est journalisé : c'est à
// l'appelant de le demander, pas à la route de deviner un motif.
//
// Elle n'écarte pas non plus un lot entier sur une ligne fautive : chaque
// mouvement a sa propre transaction, comme le client traitait chaque produit
// séparément. Un produit introuvable est rendu dans le résultat, pas levé.
//
// Pas de nouvelle sortie réseau : la route est locale, servie par le
// PocketBase embarqué (point 1 de CLAUDE.md).

package routes

import (
	"fmt"
	"math"
	"net/http"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
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
	// Le compteur que visent `delta` et `absolute` : "" ou "stock" pour le
	// neuf, "stock_b" pour le Stock B (10 septembre 2026).
	Counter string `json:"counter"`
	// Unités à passer du neuf au Stock B, dans CE mouvement : une transaction,
	// un événement, deux deltas. Prime sur `delta`, `absolute` et `counter`.
	TransferToB *float64 `json:"transfer_to_b"`
	// Pour le journal : le libellé que l'appelant connaît (une ligne de
	// facture), sinon celui du produit. Et ce qui n'appartient qu'à cette
	// ligne — la quantité vendue, la destination d'un retour.
	ProductName string         `json:"product_name"`
	ProductSku  string         `json:"product_sku"`
	Metadata    map[string]any `json:"metadata"`
}

// StockJournalInput — ce que le lot entier a en commun : le motif.
type StockJournalInput struct {
	EventType string         `json:"event_type"`
	Source    string         `json:"source"`
	SourceID  string         `json:"source_id"`
	Operator  string         `json:"operator"`
	Metadata  map[string]any `json:"metadata"`
}

type StockAdjustInput struct {
	Movements []StockMovementInput `json:"movements"`
	Journal   *StockJournalInput   `json:"journal"`
}

// StockMovementResult reprend les champs de `StockAdjustResult` côté client.
type StockMovementResult struct {
	ProductID string `json:"product_id"`
	RecordID  string `json:"record_id"`
	// Le nom et le code au moment du mouvement. Rendus parce que le client en a
	// besoin pour le journal et qu'il ne lit plus le produit lui-même : sans
	// eux, une entrée d'inventaire serait journalisée sans nom.
	ProductName  string   `json:"product_name"`
	ProductSku   string   `json:"product_sku"`
	StockBefore  *float64 `json:"stock_before"`
	StockAfter   *float64 `json:"stock_after"`
	StockBBefore *float64 `json:"stock_b_before"`
	StockBAfter  *float64 `json:"stock_b_after"`
	Applied      bool     `json:"applied"`
	Error        string   `json:"error,omitempty"`
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
			results = append(results, applyOneMovement(app, mouvement, payload.Journal))
		}

		return c.JSON(http.StatusOK, StockAdjustOutput{Results: results})
	}, apis.RequireRecordAuth())
}

// applyOneMovement fait tenir la lecture et l'écriture dans une seule
// transaction. C'est tout l'objet du fichier.
func applyOneMovement(app *pocketbase.PocketBase, mouvement StockMovementInput, journal *StockJournalInput) StockMovementResult {
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
		avantB := produit.GetFloat("stock_b")
		apres, apresB, err := NextCounters(avant, avantB, mouvement)
		if err != nil {
			return err
		}

		res.RecordID = produit.Id
		res.ProductName = produit.GetString("name")
		res.ProductSku = produit.GetString("sku")
		res.StockBefore = &avant
		res.StockAfter = &apres
		res.StockBBefore = &avantB
		res.StockBAfter = &apresB

		// Un comptage conforme n'est pas un mouvement : on ne réécrit pas, et on
		// ne journalise pas non plus (`applied` reste faux).
		if apres == avant && apresB == avantB {
			return nil
		}

		produit.Set("stock", apres)
		if apresB != avantB {
			// ⚠️ Sur une base sans la migration, `Set` sur un champ absent du
			// schéma n'est PAS persisté — et sans erreur. On refuse plutôt que
			// d'annoncer un Stock B qui n'existe pas.
			if produit.Collection().Schema.GetFieldByName("stock_b") == nil {
				return fmt.Errorf("stock_b absent du schéma products — migration manquante")
			}
			produit.Set("stock_b", apresB)
		}
		if err := tx.SaveRecord(produit); err != nil {
			return err
		}

		if journal != nil {
			if err := journaliserMouvement(tx, produit, [2]float64{avant, apres}, [2]float64{avantB, apresB}, mouvement, journal); err != nil {
				return err
			}
		}

		res.Applied = true
		return nil
	})

	if err != nil {
		// L'échec annule la transaction : les deux bornes rendues seraient
		// mensongères.
		res.StockBefore = nil
		res.StockAfter = nil
		res.StockBBefore = nil
		res.StockBAfter = nil
		res.Applied = false
		res.Error = err.Error()
	}

	return res
}

// journaliserMouvement écrit l'événement dans la transaction du mouvement. Une
// erreur ici annule le stock écrit juste avant.
func journaliserMouvement(
	tx *daos.Dao,
	produit *models.Record,
	stock, stockB [2]float64, // {avant, après}
	mouvement StockMovementInput,
	journal *StockJournalInput,
) error {
	col, err := tx.FindCollectionByNameOrId("product_events")
	if err != nil {
		return fmt.Errorf("journal introuvable (product_events): %w", err)
	}
	if err := valeurDuSelect(col, "event_type", journal.EventType); err != nil {
		return err
	}
	if err := valeurDuSelect(col, "source", journal.Source); err != nil {
		return err
	}

	nom := mouvement.ProductName
	if nom == "" {
		nom = produit.GetString("name")
	}
	sku := mouvement.ProductSku
	if sku == "" {
		sku = produit.GetString("sku")
	}

	// La métadonnée du lot, puis celle de la ligne par-dessus.
	meta := map[string]any{}
	for k, v := range journal.Metadata {
		meta[k] = v
	}
	for k, v := range mouvement.Metadata {
		meta[k] = v
	}

	ev := models.NewRecord(col)
	ev.Set("product_id", produit.Id)
	ev.Set("product_name_snapshot", nom)
	ev.Set("product_sku_snapshot", sku)
	ev.Set("event_type", journal.EventType)
	ev.Set("source", journal.Source)
	ev.Set("source_id", journal.SourceID)
	ev.Set("operator", journal.Operator)
	ev.Set("occurred_at", types.NowDateTime())
	// Le journal porte le mouvement, pas seulement les deux bornes : c'est lui
	// qu'on additionne pour reconstituer une période. `stock_b` n'y figure que
	// s'il a bougé : les événements de vente restent tels qu'ils étaient.
	before := map[string]any{"stock": stock[0]}
	after := map[string]any{"stock": stock[1]}
	delta := map[string]any{"stock": stock[1] - stock[0]}
	if stockB[1] != stockB[0] {
		before["stock_b"] = stockB[0]
		after["stock_b"] = stockB[1]
		delta["stock_b"] = stockB[1] - stockB[0]
	}
	ev.Set("before", before)
	ev.Set("after", after)
	ev.Set("delta", delta)
	if len(meta) > 0 {
		ev.Set("metadata", meta)
	}

	return tx.SaveRecord(ev)
}

// valeurDuSelect refuse une valeur absente du select : `SaveRecord` ne le fait
// pas, et un événement au type inconnu serait écrit sans que rien ne le lise.
func valeurDuSelect(col *models.Collection, champ, valeur string) error {
	f := col.Schema.GetFieldByName(champ)
	if f == nil {
		return fmt.Errorf("product_events.%s introuvable", champ)
	}
	options, ok := f.Options.(*schema.SelectOptions)
	if !ok {
		return fmt.Errorf("product_events.%s n'est pas un select", champ)
	}
	for _, v := range options.Values {
		if v == valeur {
			return nil
		}
	}
	return fmt.Errorf("%s %q inconnu du journal — migration des motifs manquante ?", champ, valeur)
}

// NextCounters — les deux compteurs après mouvement.
//
// `counter` désigne celui que visent `delta` et `absolute`. `transfer_to_b`
// déplace des unités du neuf vers le B, et REFUSE de prendre au neuf ce qu'il
// n'a pas : une vente peut rendre le stock négatif (c'est une information), un
// transfert qui le ferait créerait une unité B à partir de rien.
func NextCounters(avant, avantB float64, m StockMovementInput) (float64, float64, error) {
	if m.TransferToB != nil {
		q := *m.TransferToB
		if q <= 0 || q != math.Trunc(q) {
			return avant, avantB, fmt.Errorf("quantité à passer en Stock B invalide : %v", q)
		}
		if avant < q {
			return avant, avantB, fmt.Errorf("stock neuf insuffisant : %v disponible(s), %v demandé(s)", avant, q)
		}
		return avant - q, avantB + q, nil
	}
	switch m.Counter {
	case "", "stock":
		return NextStock(avant, m), avantB, nil
	case "stock_b":
		return avant, NextStock(avantB, m), nil
	default:
		return avant, avantB, fmt.Errorf("compteur de stock inconnu : %q", m.Counter)
	}
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
