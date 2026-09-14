package routes

import (
	"database/sql"
	"math"
	"testing"
	"time"
)

// Ce test garde la RÈGLE de valorisation, pas la base : `agregerStatistiquesStock`
// est pure, on lui donne des lignes et on lit ce qu'elle en fait.

func texteStat(valeur string) sql.NullString {
	return sql.NullString{String: valeur, Valid: true}
}

func nombreStat(valeur float64) sql.NullFloat64 {
	return sql.NullFloat64{Float64: valeur, Valid: true}
}

func presqueStat(t *testing.T, quoi string, obtenu, attendu float64) {
	t.Helper()
	if math.Abs(obtenu-attendu) > 0.005 {
		t.Errorf("%s : %.4f, attendu %.4f", quoi, obtenu, attendu)
	}
}

func produitStat(stock, achat, ttc, taux float64, categories string) ligneProduitStats {
	return ligneProduitStats{
		Type:            texteStat("simple"),
		SKU:             texteStat("REF"),
		Name:            texteStat("Un produit"),
		Stock:           nombreStat(stock),
		PurchasePriceHT: nombreStat(achat),
		PriceTTC:        nombreStat(ttc),
		TaxRate:         nombreStat(taux),
		Categories:      texteStat(categories),
	}
}

// Le cas de référence : un produit à 120 € TTC / 20 % vaut 100 € HT, acheté
// 60 €. Deux unités : 120 € de stock, 200 € de vente HT, 40 € de TVA.
func TestStatistiquesStockValorisationHT(t *testing.T) {
	sortie := agregerStatistiquesStock(
		[]ligneProduitStats{produitStat(2, 60, 120, 20, "")},
		nil,
	)

	presqueStat(t, "coût d'achat", sortie.Financial.InventoryValue, 120)
	presqueStat(t, "vente HT", sortie.Financial.RetailValue, 200)
	presqueStat(t, "vente TTC", sortie.Financial.RetailValueTTC, 240)
	presqueStat(t, "marge", sortie.Financial.PotentialMargin, 80)
	presqueStat(t, "taux de marge", sortie.Financial.MarginPct, 66.67)
	presqueStat(t, "TVA", sortie.Financial.TaxAmount, 40)

	// La TVA de la ventilation doit faire le total, sinon l'écran affiche deux
	// nombres qui se contredisent.
	tranche, connue := sortie.Financial.TaxBreakdown["rate_20"]
	if !connue {
		t.Fatalf("pas de tranche rate_20 : %v", sortie.Financial.TaxBreakdown)
	}
	presqueStat(t, "TVA de la tranche", tranche.TaxAmount, sortie.Financial.TaxAmount)
	if tranche.ProductCount != 1 {
		t.Errorf("produits de la tranche : %d", tranche.ProductCount)
	}
}

// Les exclusions — stock nul, prix d'achat nul, prix de vente nul, service —
// et ce qu'elles font aux décomptes. Une fiche exclue ne vaut rien, mais elle
// reste COMPTÉE : c'est l'écart que l'écran affiche.
func TestStatistiquesStockExclusions(t *testing.T) {
	service := produitStat(5, 10, 20, 20, "")
	service.Type = texteStat("service")

	sortie := agregerStatistiquesStock([]ligneProduitStats{
		produitStat(2, 60, 120, 20, ""), // retenu
		produitStat(0, 60, 120, 20, ""), // stock nul
		produitStat(3, 0, 120, 20, ""),  // sans prix d'achat
		produitStat(3, 60, 0, 20, ""),   // sans prix de vente
		service,                         // pas un produit simple
	}, nil)

	if sortie.Summary.TotalProducts != 5 {
		t.Errorf("total : %d, attendu 5", sortie.Summary.TotalProducts)
	}
	if sortie.Summary.SimpleProducts != 4 {
		t.Errorf("produits simples : %d, attendu 4 (le service sort)", sortie.Summary.SimpleProducts)
	}
	if sortie.Summary.ProductsInStock != 1 {
		t.Errorf("valorisés : %d, attendu 1", sortie.Summary.ProductsInStock)
	}
	if sortie.Summary.ExcludedProducts != 3 {
		t.Errorf("exclus : %d, attendu 3", sortie.Summary.ExcludedProducts)
	}
	presqueStat(t, "coût d'achat", sortie.Financial.InventoryValue, 120)
}

// Un taux à 0 ne produit aucune TVA, et le prix TTC est alors le prix HT. La
// tranche existe quand même : l'écran doit pouvoir montrer ce qui n'est pas
// taxé.
func TestStatistiquesStockTauxZero(t *testing.T) {
	sortie := agregerStatistiquesStock(
		[]ligneProduitStats{produitStat(1, 40, 100, 0, "")},
		nil,
	)

	presqueStat(t, "vente HT", sortie.Financial.RetailValue, 100)
	presqueStat(t, "vente TTC", sortie.Financial.RetailValueTTC, 100)
	presqueStat(t, "TVA", sortie.Financial.TaxAmount, 0)
	if _, connue := sortie.Financial.TaxBreakdown["rate_0"]; !connue {
		t.Errorf("la tranche rate_0 manque : %v", sortie.Financial.TaxBreakdown)
	}
}

// Le camembert range un produit sous la RACINE de sa première catégorie, et
// une fiche sans catégorie tombe dans « Sans catégorie ».
func TestStatistiquesStockRemonteALaRacine(t *testing.T) {
	categories := []ligneCategorieNommee{
		{ID: "racine", Name: texteStat("Guitares")},
		{ID: "fille", Name: texteStat("Électriques"), Parent: texteStat("racine")},
		{ID: "petite", Name: texteStat("Solid body"), Parent: texteStat(`["fille"]`)},
	}

	sortie := agregerStatistiquesStock([]ligneProduitStats{
		produitStat(1, 100, 240, 20, `["petite"]`),
		produitStat(1, 50, 120, 20, `["fille","racine"]`),
		produitStat(1, 10, 24, 20, ""),
	}, categories)

	parts := map[string]StockStatsRootCategory{}
	for _, part := range sortie.Categories.RootCategories {
		parts[part.Name] = part
	}

	guitares, connue := parts["Guitares"]
	if !connue {
		t.Fatalf("pas de part « Guitares » : %v", sortie.Categories.RootCategories)
	}
	if guitares.Products != 2 {
		t.Errorf("produits sous Guitares : %d, attendu 2", guitares.Products)
	}
	presqueStat(t, "valeur sous Guitares", guitares.Value, 150)
	if guitares.ID != "racine" {
		t.Errorf("identifiant de la racine : %q", guitares.ID)
	}

	sans, connue := parts[libelleSansCategorie]
	if !connue || sans.Products != 1 {
		t.Errorf("« Sans catégorie » : %+v", sans)
	}
	if sans.ID != "" {
		t.Errorf("« Sans catégorie » ne désigne aucune catégorie, or ID = %q", sans.ID)
	}

	// Le total du camembert EST la valeur du stock : c'est ce qui interdit de
	// répartir un produit sur plusieurs racines.
	presqueStat(t, "total du camembert", sortie.Categories.Totals.TotalValue,
		sortie.Financial.InventoryValue)
	if sortie.Categories.Totals.TotalProducts != sortie.Summary.ProductsInStock {
		t.Errorf("produits du camembert : %d, valorisés : %d",
			sortie.Categories.Totals.TotalProducts, sortie.Summary.ProductsInStock)
	}
}

// Les parts sortent triées par valeur décroissante : le camembert prend ses
// couleurs dans cet ordre.
func TestStatistiquesStockPartsTriees(t *testing.T) {
	categories := []ligneCategorieNommee{
		{ID: "a", Name: texteStat("Petite")},
		{ID: "b", Name: texteStat("Grosse")},
	}

	sortie := agregerStatistiquesStock([]ligneProduitStats{
		produitStat(1, 10, 24, 20, `["a"]`),
		produitStat(1, 900, 1200, 20, `["b"]`),
	}, categories)

	if len(sortie.Categories.RootCategories) != 2 {
		t.Fatalf("parts : %d", len(sortie.Categories.RootCategories))
	}
	if sortie.Categories.RootCategories[0].Name != "Grosse" {
		t.Errorf("première part : %q, attendu « Grosse »",
			sortie.Categories.RootCategories[0].Name)
	}
}

// Un cycle dans les catégories — un parent qui est son propre descendant —
// n'a jamais pendu la requête, et ne doit pas commencer.
func TestStatistiquesStockCycleDeCategories(t *testing.T) {
	categories := []ligneCategorieNommee{
		{ID: "a", Name: texteStat("A"), Parent: texteStat("b")},
		{ID: "b", Name: texteStat("B"), Parent: texteStat("a")},
	}

	fini := make(chan *StockStatisticsOutput, 1)
	go func() {
		fini <- agregerStatistiquesStock(
			[]ligneProduitStats{produitStat(1, 10, 24, 20, `["a"]`)},
			categories,
		)
	}()

	select {
	case sortie := <-fini:
		if len(sortie.Categories.RootCategories) != 1 {
			t.Errorf("parts : %d", len(sortie.Categories.RootCategories))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("la remontée de l'arbre ne s'arrête pas sur un cycle")
	}
}

// L'arrondi est posé en SORTIE, une fois. Trois fiches à 0,333 € valent
// 0,999 € — pas 0,99 € — et le total du camembert doit dire la même chose que
// le coût d'achat.
func TestStatistiquesStockArrondiEnSortie(t *testing.T) {
	var produits []ligneProduitStats
	for i := 0; i < 3; i++ {
		produits = append(produits, produitStat(1, 0.333, 1.2, 20, ""))
	}

	sortie := agregerStatistiquesStock(produits, nil)

	presqueStat(t, "coût d'achat", sortie.Financial.InventoryValue, 1.0)
	presqueStat(t, "total du camembert", sortie.Categories.Totals.TotalValue,
		sortie.Financial.InventoryValue)
}
