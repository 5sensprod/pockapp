// backend/routes/product_duplicates_routes.go
//
// LES DOUBLONS DE PRODUIT, SIGNALÉS AVANT L'ÉCRITURE.
//
// Trois écrans créent ou modifient une fiche produit : la fiche détail
// (`/stock/produits`), la création rapide en caisse (`CreateProductDialog`) et
// la fiche d'occasion d'un dépôt (`ConsignmentCatalogProductDialog`). Chacun
// demande ici, pendant la saisie puis à la validation, si une AUTRE fiche porte
// déjà la même désignation, la même référence ou le même code-barres.
//
// ── CE QUE LA ROUTE NE FAIT PAS ───────────────────────────────────────────
// Elle ne refuse rien. Les trois champs AVERTISSENT seulement — décision du
// 11 septembre 2026 : deux fiches au même code-barres ou à la même référence
// peuvent être voulues, et c'est le vendeur qui tranche dans le dialogue.
// Aucun hook d'écriture n'est posé : une création par un autre chemin reste
// possible, comme avant.
//
// ── POURQUOI ICI ET PAS DANS LE NAVIGATEUR ────────────────────────────────
// La première version lisait les 2999 produits par `getFullList` — six
// allers-retours en série, à chaque validation (voir l'en-tête de
// `catalog_counts_routes.go`). Ici, une requête SQL locale sur cinq colonnes.
//
// ── LA COMPARAISON ────────────────────────────────────────────────────────
// Deux étages. IDENTIQUE : la désignation ignore la casse et les espaces
// répétés ; la référence et le code-barres ne perdent que les espaces de bord.
// Accents, ponctuation et zéros de tête restent significatifs : un code-barres
// `0123` n'est pas `123`. Référence et code-barres n'ont PAS de second étage —
// un code-barres approché ne désigne rien.
//
// RESSEMBLANT (depuis le 11 septembre 2026) : la désignation seule, par
// jetons normalisés — voir `product_similarity.go`. Les identiques passent
// devant, puis les ressemblants par score décroissant, dix au plus en tout.
//
// Pas de nouvelle sortie réseau : la route est locale (point 1 de CLAUDE.md).

package routes

import (
	"database/sql"
	"math"
	"net/http"
	"sort"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"golang.org/x/text/unicode/norm"
)

// doublonsMax — au-delà, la liste n'aide plus à décider : dix fiches
// identiques disent déjà qu'il faut aller voir le catalogue.
const doublonsMax = 10

type IdentiteProduit struct {
	Designation string
	Sku         string
	Barcode     string
	// Ce que porte le formulaire, même non modifié : sert seulement à ÉCARTER
	// une fiche signalée par sa seule désignation. La fiche détail ne compare
	// que ses champs modifiés (`Sku`, `Barcode` vides), mais sa référence
	// suffit à dire qu'il s'agit d'un autre produit. Vides : `Sku` et `Barcode`.
	SkuSaisi     string
	BarcodeSaisi string
}

type ProduitCandidat struct {
	ID          string `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	Designation string `db:"designation" json:"designation"`
	Sku         string `db:"sku" json:"sku"`
	Barcode     string `db:"barcode" json:"barcode"`
	Status      string `db:"status" json:"status"`
	// Affichés dans le dépliant de l'avertissement, pour décider sans ouvrir
	// la fiche dans une autre fenêtre. Non comparés.
	PriceTTC float64 `json:"price_ttc"`
	Stock    float64 `json:"stock"`
	StockB   float64 `json:"stock_b"`
	Brand    string  `json:"brand"`
	Image    string  `json:"image"`
}

type DoublonProduit struct {
	Product ProduitCandidat `json:"product"`
	// `designation`, `sku`, `barcode` — dans cet ordre, sans répétition.
	Fields []string `json:"fields"`
	// `identical` : un champ au moins est identique (la règle exacte).
	// `similar` : seule la désignation ressemble (product_similarity.go).
	Kind string `json:"kind"`
	// 1 pour un identique ; sinon dans [seuilSemblable, 1].
	Score float64 `json:"score"`
	// Ouvre le dialogue de validation. Décidé ici pour que le seuil n'existe
	// qu'en Go : identique, ou ressemblant au-dessus de `seuilFort`.
	Strong bool `json:"strong"`
}

type ligneCandidat struct {
	ID          string          `db:"id"`
	Name        sql.NullString  `db:"name"`
	Designation sql.NullString  `db:"designation"`
	Sku         sql.NullString  `db:"sku"`
	Barcode     sql.NullString  `db:"barcode"`
	Status      sql.NullString  `db:"status"`
	PriceTTC    sql.NullFloat64 `db:"price_ttc"`
	Stock       sql.NullFloat64 `db:"stock"`
	StockB      sql.NullFloat64 `db:"stock_b"`
	BrandName   sql.NullString  `db:"brand_name"`
	Image       sql.NullString  `db:"image"`
}

func RegisterProductDuplicatesRoutes(app *pocketbase.PocketBase, router *echo.Echo) {
	router.GET("/api/catalog/products/duplicates", func(c echo.Context) error {
		identite := IdentiteProduit{
			Designation:  c.QueryParam("designation"),
			Sku:          c.QueryParam("sku"),
			Barcode:      c.QueryParam("barcode"),
			SkuSaisi:     c.QueryParam("entered_sku"),
			BarcodeSaisi: c.QueryParam("entered_barcode"),
		}
		if identiteVide(identite) {
			return c.JSON(http.StatusOK, map[string]any{"matches": []DoublonProduit{}})
		}

		var lignes []ligneCandidat
		requete := app.Dao().DB().
			Select("p.id", "p.name", "p.designation", "p.sku", "p.barcode", "p.status",
				"p.price_ttc", "p.stock", "p.stock_b", "p.image", "b.name AS brand_name").
			From("products p").
			LeftJoin("brands b", dbx.NewExp("b.id = p.brand"))
		if companyID := c.QueryParam("company"); companyID != "" {
			requete = requete.Where(dbx.HashExp{"p.company": companyID})
		}
		if err := requete.All(&lignes); err != nil {
			return apis.NewApiError(http.StatusInternalServerError,
				"vérification des doublons indisponible", err)
		}

		candidats := make([]ProduitCandidat, len(lignes))
		for i, l := range lignes {
			candidats[i] = ProduitCandidat{
				ID: l.ID, Name: l.Name.String, Designation: l.Designation.String,
				Sku: l.Sku.String, Barcode: l.Barcode.String, Status: l.Status.String,
				PriceTTC: l.PriceTTC.Float64, Stock: l.Stock.Float64, StockB: l.StockB.Float64,
				Brand: l.BrandName.String, Image: l.Image.String,
			}
		}

		return c.JSON(http.StatusOK, map[string]any{
			"matches": trouverDoublons(candidats, identite, c.QueryParam("exclude")),
		})
	}, apis.RequireRecordAuth())
}

func identiteVide(identite IdentiteProduit) bool {
	return normaliserDesignation(identite.Designation) == "" &&
		normaliserCode(identite.Sku) == "" &&
		normaliserCode(identite.Barcode) == ""
}

func normaliserDesignation(valeur string) string {
	return strings.ToLower(strings.Join(strings.Fields(norm.NFC.String(valeur)), " "))
}

func normaliserCode(valeur string) string {
	return strings.TrimSpace(norm.NFC.String(valeur))
}

// trouverDoublons — la RÈGLE, séparée de la base pour être testée seule.
func trouverDoublons(candidats []ProduitCandidat, identite IdentiteProduit, exclure string) []DoublonProduit {
	designation := normaliserDesignation(identite.Designation)
	sku := normaliserCode(identite.Sku)
	barcode := normaliserCode(identite.Barcode)

	saisie := analyserSaisie(designation)
	skuSaisi := normaliserCode(identite.SkuSaisi)
	if skuSaisi == "" {
		skuSaisi = sku
	}
	barcodeSaisi := normaliserCode(identite.BarcodeSaisi)
	if barcodeSaisi == "" {
		barcodeSaisi = barcode
	}
	// autreCode — la saisie ET la fiche portent une référence (ou un
	// code-barres), et ce n'est pas la même : la désignation seule ne suffit
	// plus à signaler la fiche. Une fiche sans code reste signalée.
	autreCode := func(produit ProduitCandidat) bool {
		ref := normaliserCode(produit.Sku)
		code := normaliserCode(produit.Barcode)
		return skuSaisi != "" && ref != "" && skuSaisi != ref ||
			barcodeSaisi != "" && code != "" && barcodeSaisi != code
	}

	identiques := []DoublonProduit{}
	semblables := []DoublonProduit{}
	for _, produit := range candidats {
		if produit.ID == exclure {
			continue
		}
		var champs []string
		// Une fiche importée peut n'avoir que `name` : c'est alors lui qui
		// tient lieu de désignation (`backfill_product_name_from_designation.go`).
		existante := produit.Designation
		if strings.TrimSpace(existante) == "" {
			existante = produit.Name
		}
		if designation != "" && designation == normaliserDesignation(existante) {
			champs = append(champs, "designation")
		}
		if sku != "" && sku == normaliserCode(produit.Sku) {
			champs = append(champs, "sku")
		}
		if barcode != "" && barcode == normaliserCode(produit.Barcode) {
			champs = append(champs, "barcode")
		}
		if len(champs) == 1 && champs[0] == "designation" && autreCode(produit) {
			continue
		}
		if len(champs) > 0 {
			identiques = append(identiques, DoublonProduit{
				Product: produit, Fields: champs, Kind: "identical", Score: 1, Strong: true,
			})
			continue
		}
		if len(saisie.jetons) > 0 && !autreCode(produit) {
			if score := similariteDesignation(saisie, jetonsDesignation(existante), true); score > 0 {
				semblables = append(semblables, DoublonProduit{
					Product: produit, Fields: []string{"designation"}, Kind: "similar",
					Score: math.Round(score*100) / 100, Strong: score >= seuilFort,
				})
			}
		}
	}

	sort.SliceStable(semblables, func(i, j int) bool { return semblables[i].Score > semblables[j].Score })
	doublons := append(identiques, semblables...)
	if len(doublons) > doublonsMax {
		doublons = doublons[:doublonsMax]
	}
	return doublons
}
