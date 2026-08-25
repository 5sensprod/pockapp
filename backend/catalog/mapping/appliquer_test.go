package mapping

import (
	"strings"
	"testing"

	"pocket-react/backend/catalog/normalize"
)

// ═══════════════════════════════════════════════════════════════════════════
// GARDIENS — ce que la transformation produit sera ÉCRIT
// ═══════════════════════════════════════════════════════════════════════════
//
// `Appliquer` est la dernière étape avant `load.Run`. Ce qu'elle rend part en
// base, dans une transaction qu'on ne relit pas ligne à ligne. Les invariants
// tenus ici sont donc ceux dont l'absence ne se verrait qu'après coup, sur la
// base de production.

func TestLaTransformationNeTouchePasLaSource(t *testing.T) {
	// `cat` est relu ensuite par la simulation et par le rapport. S'il était
	// modifié au passage, les chiffres affichés à l'opérateur ne décriraient
	// plus ce qu'on lui a montré avant d'écrire.
	cat, ct, bt := catalogueDeTest()
	avantCat := len(cat.Categories)
	avantRattachements := len(cat.Products[0].CategoryLegacyID)
	premiereCategorie := cat.Products[0].CategoryLegacyID[0]

	Appliquer(cat, ct, bt, nil)

	if len(cat.Categories) != avantCat ||
		len(cat.Products[0].CategoryLegacyID) != avantRattachements ||
		cat.Products[0].CategoryLegacyID[0] != premiereCategorie {
		t.Fatal("Appliquer a modifié le catalogue source")
	}
}

func TestLesRayonsRemplacentLArbreEtSontAPlat(t *testing.T) {
	// La forme cible : un niveau de rayons. Si un parent survivait, on aurait
	// reconstruit l'arbre qu'on voulait supprimer.
	cat, ct, bt := catalogueDeTest()
	out := avecRefonte(cat, ct, bt, nil)

	if len(out.Categories) != len(ct.Rayons()) {
		t.Fatalf("%d catégories en sortie, %d rayons déclarés",
			len(out.Categories), len(ct.Rayons()))
	}
	for _, c := range out.Categories {
		if c.ParentLegacyID != "" {
			t.Fatalf("le rayon %q a un parent : l'arbre a été reconstruit", c.Name)
		}
		if !strings.HasPrefix(c.LegacyID, prefixeRayon) {
			t.Fatalf("le rayon %q porte la clé %q, sans le préfixe attendu",
				c.Name, c.LegacyID)
		}
	}
}

func TestLaCleDunRayonNestPasCelleDuneEntiteNeeEnCaisse(t *testing.T) {
	// `pa_` signale à guard.go une entité irremplaçable. Un rayon se
	// reconstruit depuis categories.json, versionné : le marquer ainsi ferait
	// bloquer la garde sur une donnée qu'un `git checkout` retrouve.
	if strings.HasPrefix(CleRayon("Cordes & frettés"), "pa_") {
		t.Fatal("la clé d'un rayon ne doit pas se confondre avec « pa_… »")
	}
	if got := CleRayon("Cordes & frettés"); got != "rayon_cordes-frettes" {
		t.Fatalf("clé de rayon inattendue : %q", got)
	}
	// Deux rayons distincts ne doivent pas produire la même clé : ils
	// fusionneraient en base, silencieusement.
	vues := map[string]string{}
	for _, nom := range []string{
		"Cordes & frettés", "Cordes (consommable)", "Claviers",
		"Batterie & percussions", "Vents & harmonica", "Lutherie (quatuor)",
		"Sono, studio & micros", "Câbles & connectique", "Effets & amplification",
		"Accessoires & pièces", "Partitions & méthodes", "Prestations & frais",
	} {
		cle := CleRayon(nom)
		if autre, vu := vues[cle]; vu {
			t.Fatalf("« %s » et « %s » produisent la même clé %q", autre, nom, cle)
		}
		vues[cle] = nom
	}
}

func TestUnProduitEstRattacheAuRayonDeSaCategorie(t *testing.T) {
	cat, ct, bt := catalogueDeTest()
	out := avecRefonte(cat, ct, bt, nil)

	piano := trouver(t, out, "Piano")
	if len(piano.CategoryLegacyID) != 1 || piano.CategoryLegacyID[0] != CleRayon("Claviers") {
		t.Fatalf("« Piano » devait rejoindre le rayon Claviers, got %v",
			piano.CategoryLegacyID)
	}
	// Celui dont la catégorie est encore à arbitrer ne doit PAS être rangé au
	// hasard : sans rayon, il est visible ; rangé d'office, il est perdu.
	flou := trouver(t, out, "Chose floue")
	if len(flou.CategoryLegacyID) != 0 {
		t.Fatalf("une catégorie à arbitrer ne doit produire aucun rayon, got %v",
			flou.CategoryLegacyID)
	}
}

func TestLaMarquePerdanteDisparaitEtSesProduitsSuivent(t *testing.T) {
	// L'invariant qui compte : aucun produit ne doit pointer vers une marque
	// que la transformation vient de supprimer — la relation tomberait au
	// chargement, sans autre trace qu'un compteur.
	cat, ct, bt := catalogueDeTest()
	out := Appliquer(cat, ct, bt, nil)

	if len(out.Brands) != 1 {
		t.Fatalf("une marque devait être absorbée, il en reste %d", len(out.Brands))
	}
	restantes := map[string]bool{}
	for _, b := range out.Brands {
		restantes[b.LegacyID] = true
	}
	for _, p := range out.Products {
		if p.BrandLegacyID != "" && !restantes[p.BrandLegacyID] {
			t.Fatalf("« %s » pointe vers la marque supprimée %q",
				p.Name, p.BrandLegacyID)
		}
	}
}

func TestLEtatCommercialRemplaceLaCategorieEtNePasseJamaisPourUnRayon(t *testing.T) {
	cat, ct, bt := catalogueDeTest()
	ct.Categories = append(ct.Categories, CategoryRule{
		Chemin: "Occasion", Action: ActionChampProduit,
		ChampProduit: &struct {
			Champ  string `json:"champ"`
			Valeur string `json:"valeur"`
		}{Champ: "commercial_state", Valeur: "used"},
	})
	_ = ct.index()
	cat.Categories = append(cat.Categories, normalize.Category{LegacyID: "c3", Name: "Occasion"})
	cat.Products = append(cat.Products, normalize.Product{
		LegacyID: "p5", Name: "Guitare d'occasion", CategoryLegacyID: []string{"c3"},
	})

	out := avecRefonte(cat, ct, bt, nil)
	g := trouver(t, out, "Guitare d'occasion")

	if g.CommercialState != "used" {
		t.Fatalf("l'état commercial devait être posé, got %q", g.CommercialState)
	}
	if len(g.CategoryLegacyID) != 0 {
		t.Fatalf("« Occasion » ne doit produire AUCUN rayon — c'est un champ, "+
			"pas un rangement. got %v", g.CategoryLegacyID)
	}
}

func TestLaCleStableEstReprisePourLesProduitsConnus(t *testing.T) {
	// Le cœur de la décision du 24/08 : conserver la clé, pour que le miroir
	// d'images distant reste valide. Un produit inconnu garde la sienne.
	cat, ct, bt := catalogueDeTest()
	cat.Products[0].SKU = "PIANO-1"
	kt := &KeyTable{ParSKU: map[string]string{"PIANO-1": "cle_historique"}}

	out := Appliquer(cat, ct, bt, kt)

	if got := trouver(t, out, "Piano").LegacyID; got != "cle_historique" {
		t.Fatalf("la clé stable devait être reprise, got %q", got)
	}
	if got := trouver(t, out, "Orphelin").LegacyID; got != "p4" {
		t.Fatalf("un produit inconnu de la table garde sa clé NeDB, got %q", got)
	}
}

func TestLaFusionDeLApplicationEstCelleDeLaSimulation(t *testing.T) {
	// Si les deux divergeaient, l'opérateur validerait une fusion et l'outil
	// en écrirait une autre — sans qu'aucun message ne le dise.
	cat, ct, bt := catalogueDeTest()
	plan := Build(cat, ct, bt, nil)
	out := Appliquer(cat, ct, bt, nil)

	if got := len(cat.Brands) - len(out.Brands); got != plan.MarquesFusionnees {
		t.Fatalf("la simulation annonce %d fusion(s), l'application en fait %d",
			plan.MarquesFusionnees, got)
	}
}

func trouver(t *testing.T, cat *normalize.Catalog, nom string) normalize.Product {
	t.Helper()
	for _, p := range cat.Products {
		if p.Name == nom {
			return p
		}
	}
	t.Fatalf("produit %q absent du catalogue transformé", nom)
	return normalize.Product{}
}

func TestOnNeJointPasParUnNomPorteParPlusieursProduits(t *testing.T) {
	// Découvert en exerçant l'écriture sur une copie, le 24 août 2026 : après
	// avoir écarté les 33 SKU en double, TROIS collisions subsistaient — toutes
	// venues du nom. NeDB porte 28 noms partagés par 67 fiches (sept
	// « Baguettes Hotstick », trois « Ukulélé US-TIKI »).
	//
	// La table des clés écartait déjà les noms ambigus CÔTÉ DÉV ; l'ambiguïté
	// venait de l'autre bout. Sans cette règle, sept fiches recevraient la même
	// clé, donc le même dossier d'images distant.
	cat, ct, bt := catalogueDeTest()
	kt := &KeyTable{ParNom: map[string]string{"variante": "cle_unique"}}
	cat.Products = []normalize.Product{
		{LegacyID: "v1", Name: "Variante", CategoryLegacyID: []string{"c1"}},
		{LegacyID: "v2", Name: "variante", CategoryLegacyID: []string{"c1"}},
	}

	out := Appliquer(cat, ct, bt, kt)

	for _, p := range out.Products {
		if p.LegacyID == "cle_unique" {
			t.Fatalf("« %s » a repris une clé alors que son nom désigne deux "+
				"produits : les deux se seraient partagé le même dossier d'images", p.Name)
		}
	}
	// Et la simulation doit dire la même chose, sinon elle annoncerait une
	// reprise de clé que l'application ne fait pas.
	plan := Build(cat, ct, bt, kt)
	if plan.ClesReprisesParNom != 0 || len(plan.ClesNeuves) != 2 {
		t.Fatalf("la simulation doit compter 2 clés neuves et 0 reprise par nom, "+
			"got %d neuves / %d par nom", len(plan.ClesNeuves), plan.ClesReprisesParNom)
	}
}

func TestLeNiveau1ExisteEtPorteLesProduits(t *testing.T) {
	// La première reprise n'a créé que les 12 rayons. Le catalogue est devenu
	// inutilisable : « Cordes & frettés » dit dans quelle allée on va, pas si
	// l'on cherche une guitare électrique ou un jeu de cordes folk.
	//
	// Ce test tient les quatre règles du niveau 1, chacune répondant à une
	// scorie observée sur les données réelles.
	cat, ct, bt := catalogueDeTest()
	ct.RayonsCibles = []string{"Claviers"}
	ct.Categories = []CategoryRule{
		{Chemin: "Piano numérique", Action: ActionRattacher, RayonCible: "Claviers"},
		{Chemin: "PIANO NUMERIQUE", Action: ActionRattacher, RayonCible: "Claviers"},
		{Chemin: "Claviers", Action: ActionRattacher, RayonCible: "Claviers"},
		{Chemin: "* Claviers vides", Action: ActionRattacher, RayonCible: "Claviers"},
	}
	_ = ct.index()
	cat.Categories = []normalize.Category{
		{LegacyID: "n1", Name: "Piano numérique"},
		{LegacyID: "n2", Name: "PIANO NUMERIQUE"},  // même nature, casse et accent
		{LegacyID: "n3", Name: "Claviers"},         // porte le nom du rayon
		{LegacyID: "n4", Name: "* Claviers vides"}, // aucun produit
	}
	cat.Products = []normalize.Product{
		{LegacyID: "a", Name: "P-125", CategoryLegacyID: []string{"n1"}},
		{LegacyID: "b", Name: "FP-30", CategoryLegacyID: []string{"n2"}},
		{LegacyID: "c", Name: "Divers", CategoryLegacyID: []string{"n3"}},
	}

	out := avecRefonte(cat, ct, bt, nil)

	parNom := map[string]normalize.Category{}
	for _, c := range out.Categories {
		parNom[c.Name] = c
	}
	// Règle 1 : une catégorie sans produit ne devient pas une nature.
	if _, existe := parNom["Claviers vides"]; existe {
		t.Fatal("une catégorie sans produit ne doit pas devenir une nature")
	}
	// Règle 2 : celle qui porte le nom du rayon n'en crée pas une seconde.
	if len(out.Categories) != 2 {
		t.Fatalf("attendu 1 rayon + 1 nature, got %d : %v",
			len(out.Categories), noms(out.Categories))
	}
	// Règles 3 et 4 : « PIANO NUMERIQUE » a fusionné avec « Piano numérique ».
	nature, existe := parNom["Piano numérique"]
	if !existe {
		t.Fatalf("la nature « Piano numérique » manque : %v", noms(out.Categories))
	}
	if nature.ParentLegacyID != CleRayon("Claviers") {
		t.Fatalf("la nature doit pendre au rayon, got parent %q", nature.ParentLegacyID)
	}

	// Un produit va à sa NATURE, jamais aussi au rayon : sinon chaque comptage
	// serait doublé.
	p125 := trouver(t, out, "P-125")
	if len(p125.CategoryLegacyID) != 1 || p125.CategoryLegacyID[0] != nature.LegacyID {
		t.Fatalf("« P-125 » doit être rattaché à sa seule nature, got %v",
			p125.CategoryLegacyID)
	}
	// Celui dont la catégorie portait le nom du rayon y va directement.
	divers := trouver(t, out, "Divers")
	if len(divers.CategoryLegacyID) != 1 || divers.CategoryLegacyID[0] != CleRayon("Claviers") {
		t.Fatalf("« Divers » doit tomber dans le rayon, got %v", divers.CategoryLegacyID)
	}
}

func TestLaSimulationAnnonceLArbreQueLApplicationEcrit(t *testing.T) {
	// Le même piège que pour les fusions de marques : annoncer un rangement et
	// en écrire un autre. Les deux passent par NaturesDe, ce test le vérifie.
	cat, ct, bt := catalogueDeTest()
	plan := Build(cat, ct, bt, nil)
	out := avecRefonte(cat, ct, bt, nil)

	if got := len(out.Categories) - len(ct.Rayons()); got != plan.Natures {
		t.Fatalf("la simulation annonce %d nature(s), l'application en écrit %d",
			plan.Natures, got)
	}
}

func noms(cats []normalize.Category) []string {
	out := make([]string, 0, len(cats))
	for _, c := range cats {
		out = append(out, c.Name)
	}
	return out
}

// avecRefonte demande explicitement la refonte en rayons, qui n'est plus le
// comportement par défaut depuis le 25 août 2026.
func avecRefonte(cat *normalize.Catalog, ct *CategoryTable, bt *BrandTable,
	kt *KeyTable,
) *normalize.Catalog {
	return AppliquerAvec(cat, ct, bt, kt, Options{RefondreCategories: true})
}

func TestParDefautLArbreDOrigineEstConserve(t *testing.T) {
	// La reprise rend au client SON catalogue. Mélanger reprise et refonte a
	// coûté deux allers-retours sur la base de production le 25 août 2026 :
	// les 463 catégories du magasin — 46 racines, 417 rattachements, 36
	// illustrées — avaient été remplacées par 12 rayons, et le catalogue était
	// devenu méconnaissable.
	cat, ct, bt := catalogueDeTest()
	out := Appliquer(cat, ct, bt, nil)

	if len(out.Categories) != len(cat.Categories) {
		t.Fatalf("l'arbre d'origine doit être conservé : %d catégories en entrée, "+
			"%d en sortie", len(cat.Categories), len(out.Categories))
	}
	for i, c := range out.Categories {
		if c.LegacyID != cat.Categories[i].LegacyID || c.Name != cat.Categories[i].Name {
			t.Fatalf("la catégorie %d a changé : %q/%q au lieu de %q/%q",
				i, c.LegacyID, c.Name, cat.Categories[i].LegacyID, cat.Categories[i].Name)
		}
	}
	// Et les produits gardent leur rattachement d'origine.
	piano := trouver(t, out, "Piano")
	if len(piano.CategoryLegacyID) != 1 || piano.CategoryLegacyID[0] != "c1" {
		t.Fatalf("le rattachement d'origine doit survivre, got %v", piano.CategoryLegacyID)
	}
}

func TestSansRefonteLEtatCommercialSortQuandMeme(t *testing.T) {
	// La décision du 24/08 ne dépend pas de la refonte : « Occasion » devient
	// un champ dans les deux modes, et la catégorie n'est pas reprise.
	cat, ct, bt := catalogueDeTest()
	ct.Categories = append(ct.Categories, CategoryRule{
		Chemin: "Occasion", Action: ActionChampProduit,
		ChampProduit: &struct {
			Champ  string `json:"champ"`
			Valeur string `json:"valeur"`
		}{Champ: "commercial_state", Valeur: "used"},
	})
	_ = ct.index()
	cat.Categories = append(cat.Categories, normalize.Category{LegacyID: "c3", Name: "Occasion"})
	cat.Products = append(cat.Products, normalize.Product{
		LegacyID: "p5", Name: "Guitare d'occasion", CategoryLegacyID: []string{"c1", "c3"},
	})

	out := Appliquer(cat, ct, bt, nil)

	for _, c := range out.Categories {
		if c.Name == "Occasion" {
			t.Fatal("« Occasion » est devenue un champ : elle ne doit pas être reprise " +
				"comme catégorie")
		}
	}
	g := trouver(t, out, "Guitare d'occasion")
	if g.CommercialState != "used" {
		t.Fatalf("l'état commercial doit être posé même sans refonte, got %q",
			g.CommercialState)
	}
	// Son autre rattachement, lui, survit intact.
	if len(g.CategoryLegacyID) != 1 || g.CategoryLegacyID[0] != "c1" {
		t.Fatalf("les autres rattachements doivent survivre, got %v", g.CategoryLegacyID)
	}
}
