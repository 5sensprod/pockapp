package mapping

import (
	"testing"

	"pocket-react/backend/catalog/normalize"
)

// ═══════════════════════════════════════════════════════════════════════════
// GARDIENS — la simulation doit tenir ses comptes
// ═══════════════════════════════════════════════════════════════════════════
//
// Une simulation qui se trompe est pire que pas de simulation : elle autorise
// une écriture. Ce qui est gardé ici, c'est donc l'arithmétique — aucun produit
// ne s'évapore, aucun n'est compté deux fois — et les deux règles de départage
// qui ne peuvent pas se lire dans les tables.

func TestLesTablesEmbarqueesSeChargent(t *testing.T) {
	// Le fichier JSON est édité à la main. Une virgule de trop, un rayon mal
	// orthographié, une action inconnue : ce test le dit avant que la reprise
	// ne les découvre.
	ct, bt, err := LoadTables()
	if err != nil {
		t.Fatalf("les tables embarquées ne se chargent pas : %v", err)
	}
	if len(ct.Categories) == 0 {
		t.Fatal("categories.json est vide")
	}
	if len(bt.Groupes) == 0 {
		t.Fatal("brands.json est vide")
	}
	if len(ct.Rayons()) == 0 {
		t.Fatal("aucun rayon cible déclaré : tout produit tomberait sans rangement")
	}
}

func TestUneDestinationLEmporteSurUneSuppression(t *testing.T) {
	// NeDB porte des catégories strictement homonymes sous le même parent.
	// L'une range, l'autre efface : ranger ne perd rien, effacer perdrait.
	ranger := &CategoryRule{Chemin: "A / B", Action: ActionRattacher, RayonCible: "Claviers"}
	effacer := &CategoryRule{Chemin: "A / B", Action: ActionSupprimer}

	for _, ordre := range [][2]*CategoryRule{{ranger, effacer}, {effacer, ranger}} {
		got, err := converger(ordre[0], ordre[1])
		if err != nil {
			t.Fatalf("convergence refusée à tort : %v", err)
		}
		if got.Action != ActionRattacher {
			t.Fatalf("la suppression l'a emporté sur la destination (ordre %s puis %s)",
				ordre[0].Action, ordre[1].Action)
		}
	}
}

func TestDeuxDestinationsDifferentesNeSeDepartagentPas(t *testing.T) {
	// Ici aucun choix n'est défendable, et le gagnant dépendrait de l'ordre du
	// fichier — exactement le genre de silence qu'on refuse.
	a := &CategoryRule{Chemin: "A / B", Action: ActionRattacher, RayonCible: "Claviers"}
	b := &CategoryRule{Chemin: "A / B", Action: ActionRattacher, RayonCible: "Lutherie (quatuor)"}
	if _, err := converger(a, b); err == nil {
		t.Fatal("deux rayons différents pour un même chemin doivent remonter en erreur")
	}
}

// catalogueDeTest construit un petit catalogue : deux marques homonymes dont
// l'une porte plus de produits, une catégorie rangeable, une à arbitrer, et un
// produit sans catégorie du tout.
func catalogueDeTest() (*normalize.Catalog, *CategoryTable, *BrandTable) {
	cat := &normalize.Catalog{
		Categories: []normalize.Category{
			{LegacyID: "c1", Name: "Claviers"},
			{LegacyID: "c2", Name: "Flou"},
		},
		Brands: []normalize.Brand{
			{LegacyID: "b_petite", Name: "K&M"},
			{LegacyID: "b_grosse", Name: "K&M"},
		},
		Products: []normalize.Product{
			{LegacyID: "p1", Name: "Piano", CategoryLegacyID: []string{"c1"}, BrandLegacyID: "b_grosse"},
			{LegacyID: "p2", Name: "Pupitre", CategoryLegacyID: []string{"c1"}, BrandLegacyID: "b_grosse"},
			{LegacyID: "p3", Name: "Chose floue", CategoryLegacyID: []string{"c2"}, BrandLegacyID: "b_petite"},
			{LegacyID: "p4", Name: "Orphelin"},
		},
	}
	ct := &CategoryTable{
		RayonsCibles: []string{"Claviers"},
		Categories: []CategoryRule{
			{Chemin: "Claviers", Action: ActionRattacher, RayonCible: "Claviers"},
			{Chemin: "Flou", Action: ActionArbitrer, AArbitrer: true},
		},
	}
	bt := &BrandTable{Groupes: []BrandGroup{{Cle: "km", SurvivantPropose: "K&M", Perdants: []string{"K&M"}}}}
	_ = ct.index()
	_ = bt.index()
	return cat, ct, bt
}

func TestAucunProduitNeSEvapore(t *testing.T) {
	// L'invariant qui compte : tout produit est soit rangé, soit signalé.
	// Sans lui, une simulation « propre » pourrait cacher des disparitions.
	cat, ct, bt := catalogueDeTest()
	p := Build(cat, ct, bt, nil)

	if got := p.ProduitsReclasses + len(p.ProduitsSansRayon); got != p.ProduitsTotal {
		t.Fatalf("%d reclassés + %d sans rayon = %d, or il y a %d produits",
			p.ProduitsReclasses, len(p.ProduitsSansRayon), got, p.ProduitsTotal)
	}
}

func TestChaqueProduitPerduEstComptéUneFoisEtUneSeule(t *testing.T) {
	// La ventilation par cause sert à savoir OÙ aller corriger. Un produit
	// compté dans deux causes gonflerait le total et ferait chercher des
	// produits qui n'existent pas.
	cat, ct, bt := catalogueDeTest()
	p := Build(cat, ct, bt, nil)

	somme := 0
	for _, n := range p.SansRayonParCause {
		somme += n
	}
	if somme != len(p.ProduitsSansRayon) {
		t.Fatalf("la ventilation totalise %d, or %d produits sont sans rayon",
			somme, len(p.ProduitsSansRayon))
	}
	if p.SansRayonParCause["aucune catégorie"] != 1 {
		t.Fatalf("le produit sans aucune catégorie doit être classé comme tel, got %v",
			p.SansRayonParCause)
	}
	if p.SansRayonParCause["catégorie à arbitrer"] != 1 {
		t.Fatalf("le produit d'une catégorie non arbitrée doit être signalé, got %v",
			p.SansRayonParCause)
	}
}

func TestLaSurvivanteEstCelleQuiPorteLePlusDeProduits(t *testing.T) {
	// Deux marques STRICTEMENT homonymes : aucun nom ne peut désigner l'une
	// plutôt que l'autre, et c'est le comptage qui tranche. Si cette règle
	// cédait, la fusion pourrait déplacer 8 produits vers la marque qui n'en a
	// que 2 — sans que rien ne le signale.
	cat, ct, bt := catalogueDeTest()
	p := Build(cat, ct, bt, nil)

	if p.MarquesFusionnees != 1 {
		t.Fatalf("une seule marque doit être absorbée, got %d", p.MarquesFusionnees)
	}
	// b_grosse porte 2 produits, b_petite 1 : c'est b_petite qui est absorbée,
	// donc UN produit change de marque.
	if p.ProduitsReaffectes != 1 {
		t.Fatalf("la perdante doit être celle qui porte le MOINS de produits ; "+
			"attendu 1 produit réaffecté, got %d", p.ProduitsReaffectes)
	}
}

func TestUnGroupeDeMarqueDejaFusionneEstSignaleEtNonApplique(t *testing.T) {
	// La table décrit un doublon que NeDB ne porte plus. Fusionner « dans le
	// vide » ne ferait rien de visible ; on veut que la table périmée se voie.
	cat, ct, bt := catalogueDeTest()
	cat.Brands = cat.Brands[:1] // il ne reste qu'un « K&M »
	p := Build(cat, ct, bt, nil)

	if p.MarquesFusionnees != 0 {
		t.Fatalf("aucune fusion n'est possible avec un seul membre, got %d", p.MarquesFusionnees)
	}
	if len(p.MarquesInconnues) != 1 {
		t.Fatalf("le groupe périmé doit être signalé, got %v", p.MarquesInconnues)
	}
}

func TestUneCleNEstAttribueeQuAUnSeulProduit(t *testing.T) {
	// Avant le 25 août 2026, deux produits pouvaient réclamer la même clé et la
	// simulation REFUSAIT. C'était le bon réflexe mais le mauvais remède :
	// mieux vaut empêcher le conflit que le détecter.
	//
	// `AttribuerCles` retient donc chaque clé UNE fois, SKU prioritaire. Le
	// second produit reçoit une clé neuve — et il est signalé, parce qu'il
	// partira en ligne comme un article nouveau.
	cat, ct, bt := catalogueDeTest()
	kt := &KeyTable{ParSKU: map[string]string{"SKU-A": "cle_historique"}}
	kt.ParNom = map[string]string{"jumelle": "cle_historique"}
	cat.Products = []normalize.Product{
		{LegacyID: "a", Name: "Titulaire", SKU: "SKU-A", CategoryLegacyID: []string{"c1"}},
		{LegacyID: "b", Name: "Jumelle", SKU: "SKU-B", CategoryLegacyID: []string{"c1"}},
	}

	p := Build(cat, ct, bt, kt)

	if len(p.ClesEnCollision) != 0 || p.Bloquant() {
		t.Fatalf("l'attribution doit empêcher la collision, pas la subir : %v",
			p.ClesEnCollision)
	}
	if p.ClesReprisesParSKU != 1 {
		t.Fatalf("le porteur du SKU garde la clé, got %d", p.ClesReprisesParSKU)
	}
	if len(p.ClesPerdues) != 1 || p.ClesPerdues[0] != "Jumelle" {
		t.Fatalf("le devancé doit être signalé — il partira comme un produit "+
			"neuf. got %v", p.ClesPerdues)
	}

	// Et l'application doit attribuer EXACTEMENT la même chose.
	out := Appliquer(cat, ct, bt, kt)
	titulaire := trouver(t, out, "Titulaire")
	jumelle := trouver(t, out, "Jumelle")
	if titulaire.LegacyID != "cle_historique" {
		t.Fatalf("le porteur du SKU devait garder la clé, got %q", titulaire.LegacyID)
	}
	if jumelle.LegacyID == "cle_historique" {
		t.Fatal("deux produits écrits ne peuvent pas porter la même clé")
	}
}

func TestUnPlanSainNeBloquePas(t *testing.T) {
	// Le corollaire, et il compte autant : les dettes connues — produits sans
	// rayon, lignes à arbitrer — ne bloquent PAS. Une garde qui refuse tout ne
	// protège de rien, elle se contourne.
	cat, ct, bt := catalogueDeTest()
	p := Build(cat, ct, bt, nil)

	if len(p.ProduitsSansRayon) == 0 {
		t.Fatal("le catalogue de test doit contenir des produits sans rayon")
	}
	if p.Bloquant() {
		t.Fatal("des produits sans rayon sont une dette chiffrée, pas un dégât : " +
			"ils ne doivent pas bloquer")
	}
}

func TestLesProduitsEnQuarantaineSortentDeTousLesComptes(t *testing.T) {
	// Le plan décrit ce qui sera ÉCRIT. `normalize` écarte en amont ce que le
	// schéma refuse — un SKU en double viole l'index unique (company, sku) —
	// et `load.Run` ne l'écrit pas.
	//
	// Sans cette exclusion, le plan annonçait 3055 produits quand l'écriture en
	// posait 3020 : un écart de 35 que rien n'expliquait.
	cat, ct, bt := catalogueDeTest()
	quarantaine := map[string]string{"p2": "SKU en doublon"}

	p := BuildAvecQuarantaine(cat, ct, bt, nil, quarantaine)

	if p.EnQuarantaine != 1 {
		t.Fatalf("la quarantaine doit être comptée à part, got %d", p.EnQuarantaine)
	}
	if p.ProduitsTotal != len(cat.Products)-1 {
		t.Fatalf("le total doit exclure les écartés : %d attendu, got %d",
			len(cat.Products)-1, p.ProduitsTotal)
	}
	if p.ProduitsReclasses+len(p.ProduitsSansRayon) != p.ProduitsTotal {
		t.Fatal("l'invariant « aucun produit ne s'évapore » doit tenir sur le " +
			"périmètre écrit, quarantaine exclue")
	}
}

func TestUneCollisionAvecUneFicheEcarteeNEstPasUneCollision(t *testing.T) {
	// Mesuré le 24 août 2026 : sur les 33 SKU en double, exactement UNE fiche
	// survit à la quarantaine. Les « 35 collisions » comptaient donc chaque
	// fois une fiche écrite contre une fiche qui ne le serait jamais — et
	// faisaient refuser la reprise pour une raison fausse.
	//
	// Une garde qui bloque à tort est aussi coûteuse qu'une garde qui laisse
	// passer : elle pousse à la contourner.
	cat, ct, bt := catalogueDeTest()
	kt := &KeyTable{ParSKU: map[string]string{"MEME-SKU": "cle_partagee"}}
	cat.Products = []normalize.Product{
		{LegacyID: "gardee", Name: "Fiche gardée", SKU: "MEME-SKU", CategoryLegacyID: []string{"c1"}},
		{LegacyID: "ecartee", Name: "MEME-SKU", SKU: "MEME-SKU", CategoryLegacyID: []string{"c1"}},
	}

	avec := BuildAvecQuarantaine(cat, ct, bt, kt, map[string]string{"ecartee": "SKU en doublon"})
	if len(avec.ClesEnCollision) != 0 || avec.Bloquant() {
		t.Fatalf("la fiche écartée ne réclame aucune clé : pas de collision. got %v",
			avec.ClesEnCollision)
	}

	// Et si les deux sont écrites, l'attribution empêche le conflit : la
	// seconde reçoit une clé neuve plutôt que de partager celle de la première.
	sans := BuildAvecQuarantaine(cat, ct, bt, kt, nil)
	if sans.Bloquant() {
		t.Fatal("l'attribution doit empêcher la collision, pas bloquer dessus")
	}
	if len(sans.ClesPerdues) != 1 {
		t.Fatalf("le second doit être signalé comme devancé, got %v", sans.ClesPerdues)
	}
}
