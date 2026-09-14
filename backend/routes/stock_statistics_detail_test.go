package routes

import "testing"

// Le rapport détaillé doit dire la MÊME chose que la synthèse : c'est ce que
// ces cas gardent. Un sous-total qui ne fait pas le total, ou un total qui ne
// fait pas la valorisation, sont deux pages du même PDF qui se contredisent.

func produitDetail(id, sku, designation string, stock, achat, ttc, taux float64, categories string) ligneProduitDetail {
	ligne := ligneProduitDetail{
		ID:                id,
		Designation:       designation,
		ligneProduitStats: produitStat(stock, achat, ttc, taux, categories),
	}
	ligne.SKU = texteStat(sku)
	return ligne
}

func jeuDeDetail() ([]ligneProduitDetail, []ligneCategorieNommee) {
	categories := []ligneCategorieNommee{
		{ID: "gui", Name: texteStat("Guitares")},
		{ID: "bat", Name: texteStat("Batteries")},
	}
	produits := []ligneProduitDetail{
		produitDetail("p1", "GTR-2", "Stratocaster", 2, 300, 720, 20, `["gui"]`),
		produitDetail("p2", "GTR-1", "Telecaster", 1, 400, 960, 20, `["gui"]`),
		produitDetail("p3", "BAT-1", "Caisse claire", 3, 100, 240, 20, `["bat"]`),
		produitDetail("p4", "DIV-1", "Médiator", 10, 1, 2.4, 20, ""),
		produitDetail("p5", "VIDE", "Sans stock", 0, 50, 120, 20, `["gui"]`),
	}
	return produits, categories
}

// Sans groupement : un seul groupe, et son sous-total EST le total.
func TestDetailStockUnSeulGroupe(t *testing.T) {
	produits, categories := jeuDeDetail()

	sortie := agregerDetailStock(produits, categories, optionsDetail{})

	if len(sortie.Groups) != 1 {
		t.Fatalf("groupes : %d, attendu 1", len(sortie.Groups))
	}
	if sortie.Groups[0].ProductCount != 4 {
		t.Errorf("lignes : %d, attendu 4 (la fiche sans stock sort)",
			sortie.Groups[0].ProductCount)
	}
	if sortie.Totals.ProductCount != 4 {
		t.Errorf("total : %d", sortie.Totals.ProductCount)
	}
	presqueStat(t, "coût d'achat", sortie.Totals.InventoryValue, 2*300+400+3*100+10*1)
	presqueStat(t, "vente HT", sortie.Totals.RetailValue, 2*600+800+3*200+10*2)
	presqueStat(t, "marge", sortie.Totals.Margin,
		sortie.Totals.RetailValue-sortie.Totals.InventoryValue)
}

// Le détail et la synthèse valorisent les MÊMES fiches, par les mêmes règles.
func TestDetailStockConcordeAvecLaSynthese(t *testing.T) {
	produits, categories := jeuDeDetail()

	var pourSynthese []ligneProduitStats
	for _, produit := range produits {
		pourSynthese = append(pourSynthese, produit.ligneProduitStats)
	}

	detail := agregerDetailStock(produits, categories, optionsDetail{GroupByCategory: true})
	synthese := agregerStatistiquesStock(pourSynthese, categories)

	if detail.Totals.ProductCount != synthese.Summary.ProductsInStock {
		t.Errorf("fiches : détail %d, synthèse %d",
			detail.Totals.ProductCount, synthese.Summary.ProductsInStock)
	}
	presqueStat(t, "coût d'achat", detail.Totals.InventoryValue,
		synthese.Financial.InventoryValue)
	presqueStat(t, "vente HT", detail.Totals.RetailValue, synthese.Financial.RetailValue)
	presqueStat(t, "marge", detail.Totals.Margin, synthese.Financial.PotentialMargin)
}

// Groupé : un groupe par catégorie d'impression, les sans-catégorie en dernier,
// et la somme des sous-totaux fait le total.
func TestDetailStockGroupeParCategorie(t *testing.T) {
	produits, categories := jeuDeDetail()

	sortie := agregerDetailStock(produits, categories, optionsDetail{GroupByCategory: true})

	if len(sortie.Groups) != 3 {
		t.Fatalf("groupes : %d, attendu 3", len(sortie.Groups))
	}
	if sortie.Groups[0].CategoryName != "Batteries" {
		t.Errorf("premier groupe : %q, attendu « Batteries » (tri par nom)",
			sortie.Groups[0].CategoryName)
	}
	dernier := sortie.Groups[len(sortie.Groups)-1]
	if dernier.CategoryName != libelleSansCategorie {
		t.Errorf("dernier groupe : %q, attendu « %s »", dernier.CategoryName, libelleSansCategorie)
	}

	var somme float64
	var fiches int
	for _, groupe := range sortie.Groups {
		somme += groupe.InventoryValue
		fiches += groupe.ProductCount
		if len(groupe.Lines) != groupe.ProductCount {
			t.Errorf("groupe %q : %d lignes pour %d fiches",
				groupe.CategoryName, len(groupe.Lines), groupe.ProductCount)
		}
	}
	presqueStat(t, "somme des sous-totaux", somme, sortie.Totals.InventoryValue)
	if fiches != sortie.Totals.ProductCount {
		t.Errorf("somme des fiches : %d, total %d", fiches, sortie.Totals.ProductCount)
	}
}

// La sélection de catégories retient une fiche par N'IMPORTE laquelle de ses
// catégories, pas seulement celle sous laquelle elle s'imprime.
func TestDetailStockSelectionDeCategories(t *testing.T) {
	categories := []ligneCategorieNommee{
		{ID: "promo", Name: texteStat("Promotions")},
		{ID: "gui", Name: texteStat("Guitares")},
	}
	produits := []ligneProduitDetail{
		// S'imprime sous « Promotions », mais appartient aussi à « Guitares ».
		produitDetail("p1", "A", "Une guitare soldée", 1, 100, 240, 20, `["promo","gui"]`),
		produitDetail("p2", "B", "Une batterie", 1, 100, 240, 20, `["bat"]`),
		produitDetail("p3", "C", "Rangée nulle part", 1, 100, 240, 20, ""),
	}

	options := optionsDetail{GroupByCategory: true, Categories: []string{"gui"}}
	sortie := agregerDetailStock(produits, categories, options)

	if sortie.Totals.ProductCount != 1 {
		t.Fatalf("fiches retenues : %d, attendu 1", sortie.Totals.ProductCount)
	}

	// Sans la case « inclure les non classés », la fiche p3 reste dehors ; avec
	// elle, elle entre.
	options.IncludeUncategorized = true
	avec := agregerDetailStock(produits, categories, options)
	if avec.Totals.ProductCount != 2 {
		t.Errorf("avec les non classés : %d, attendu 2", avec.Totals.ProductCount)
	}
}

// Le mode simplifié retire les lignes ET GARDE les sous-totaux : c'est le
// serveur qui les retire, pour ne pas transporter ce qui ne s'imprimera pas.
func TestDetailStockModeSimplifie(t *testing.T) {
	produits, categories := jeuDeDetail()

	sortie := agregerDetailStock(produits, categories,
		optionsDetail{GroupByCategory: true, Simplified: true})

	if !sortie.Simplified {
		t.Error("le drapeau simplifié ne remonte pas")
	}
	for _, groupe := range sortie.Groups {
		if len(groupe.Lines) != 0 {
			t.Errorf("groupe %q : %d lignes, attendu aucune",
				groupe.CategoryName, len(groupe.Lines))
		}
		if groupe.ProductCount == 0 {
			t.Errorf("groupe %q : le sous-total a disparu avec les lignes",
				groupe.CategoryName)
		}
	}
	presqueStat(t, "total conservé", sortie.Totals.InventoryValue, 2*300+400+3*100+10*1)
}

// Les quatre tris de l'écran d'export, et les deux ordres.
func TestDetailStockTris(t *testing.T) {
	produits, categories := jeuDeDetail()

	cas := []struct {
		critere, ordre string
		premier        string
	}{
		{"name", "asc", "Caisse claire"},
		{"name", "desc", "Telecaster"},
		{"sku", "asc", "Caisse claire"},   // BAT-1
		{"stock", "desc", "Médiator"},     // 10
		{"value", "desc", "Stratocaster"}, // 600 €
	}

	for _, c := range cas {
		sortie := agregerDetailStock(produits, categories,
			optionsDetail{SortBy: c.critere, SortOrder: c.ordre})
		obtenu := sortie.Groups[0].Lines[0].Designation
		if obtenu != c.premier {
			t.Errorf("tri %s/%s : première ligne %q, attendu %q",
				c.critere, c.ordre, obtenu, c.premier)
		}
	}
}

// La désignation imprimée est `designation`, `name` en repli. `name` est le
// titre de la page du site, pas le nom de l'article.
func TestDetailStockDesignationImprimee(t *testing.T) {
	produit := produitDetail("p1", "REF", "", 1, 10, 24, 20, "")
	produit.Name = texteStat("Guitare électrique 6 cordes pour débutant")

	sortie := agregerDetailStock([]ligneProduitDetail{produit}, nil, optionsDetail{})
	if sortie.Groups[0].Lines[0].Designation != "Guitare électrique 6 cordes pour débutant" {
		t.Errorf("repli sur `name` manquant : %q", sortie.Groups[0].Lines[0].Designation)
	}

	produit.Designation = "Guitare 6 cordes"
	sortie = agregerDetailStock([]ligneProduitDetail{produit}, nil, optionsDetail{})
	if sortie.Groups[0].Lines[0].Designation != "Guitare 6 cordes" {
		t.Errorf("`designation` doit primer : %q", sortie.Groups[0].Lines[0].Designation)
	}
}
