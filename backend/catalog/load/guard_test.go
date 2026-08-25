package load

import "testing"

func TestFindingsBlocksSurUneBaseReconstructible(t *testing.T) {
	// Une base qui ne porte que la projection de NeDB peut être rechargée :
	// c'était le cas jusqu'au 19 août 2026, et ça reste celui d'une
	// installation neuve.
	var vide Findings
	if vide.Blocks() {
		t.Fatal("une base sans donnée locale ne doit pas bloquer le rechargement")
	}
	if got := vide.Explain(); got == "" {
		t.Fatal("Explain doit dire pourquoi il ne bloque pas, pas rester muet")
	}
}

func TestFindingsBlocksDesQuUneSeuleTraceExiste(t *testing.T) {
	cas := []struct {
		nom string
		f   Findings
	}{
		{
			// Un produit créé en caisse n'existe nulle part ailleurs.
			nom: "une entité née ici",
			f:   Findings{CreatedHere: map[string]int{"products": 1}},
		},
		{
			// Un comptage d'inventaire est un travail humain non reproductible.
			nom: "un mouvement de stock",
			f:   Findings{StockEvents: map[string]int{"inventory_session": 1}},
		},
		{
			// Purger laisserait les lignes de facture pointer vers le vide.
			nom: "un document citant des produits",
			f:   Findings{Documents: map[string]int{"invoices": 1}},
		},
	}

	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			if !c.f.Blocks() {
				t.Fatalf("%s doit bloquer la purge", c.nom)
			}
		})
	}
}

func TestFindingsIgnoreLesDecomptesNuls(t *testing.T) {
	// Une clé présente à zéro n'est pas une trace : sans cela, la garde
	// bloquerait toute base ayant les collections mais pas les données.
	f := Findings{
		CreatedHere: map[string]int{"products": 0, "brands": 0},
		StockEvents: map[string]int{"sale": 0},
		Documents:   map[string]int{"invoices": 0},
	}
	if f.Blocks() {
		t.Fatal("des décomptes à zéro ne doivent pas bloquer")
	}
}

func TestExplainNommeCeQuiSeraitPerdu(t *testing.T) {
	f := Findings{
		CreatedHere: map[string]int{"products": 53},
		StockEvents: map[string]int{"sale": 12, "inventory_session": 4},
		Documents:   map[string]int{"invoices": 7},
	}
	msg := f.Explain()

	for _, attendu := range []string{"53", "products", "sale", "inventory_session", "invoices", "-force-purge"} {
		if !contains(msg, attendu) {
			t.Fatalf("le message doit nommer %q ; il vaut :\n%s", attendu, msg)
		}
	}
}

func TestLeSoulignéEstÉchappéDansLaRechercheDeCléStable(t *testing.T) {
	// `LIKE 'pa_%'` sans ESCAPE traite le souligné comme un JOKER : une clé NeDB
	// telle que « PAz78WYfCpbSWJay » y répond, et la garde bloquerait une base
	// parfaitement reconstructible. Constaté le 19 août 2026 sur la base réelle.
	if !contains(legacyKeyExpr, "ESCAPE") {
		t.Fatalf("la recherche de clé stable doit échapper le souligné : %s", legacyKeyExpr)
	}
	if !contains(legacyKeyExpr, `pa\_%`) {
		t.Fatalf("le souligné doit être échappé dans le motif : %s", legacyKeyExpr)
	}
}

func TestSortStrings(t *testing.T) {
	// Le message doit être stable d'une exécution à l'autre : sans tri, l'ordre
	// des maps change à chaque lancement et deux sorties identiques semblent
	// différer.
	s := []string{"c", "a", "b"}
	sortStrings(s)
	if s[0] != "a" || s[1] != "b" || s[2] != "c" {
		t.Fatalf("tri incorrect : %v", s)
	}
}

func contains(haystack, needle string) bool {
	return len(needle) == 0 || indexOf(haystack, needle) >= 0
}

func indexOf(h, n string) int {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return i
		}
	}
	return -1
}

func TestUnCatalogueVideNeBloqueJamais(t *testing.T) {
	// Le cas de la reprise du 24 août 2026 : 1204 factures en base, et ZÉRO
	// produit. Purger ne peut rien détruire — une facture qui cite un produit
	// absent le cite déjà dans le vide.
	//
	// Sans cette règle, charger une telle base aurait exigé `-force-purge`,
	// c'est-à-dire prendre l'habitude d'écrire le drapeau qui détruit sans
	// retour pour charger une base où il n'y a rien à détruire.
	f := Findings{
		Documents:     map[string]int{"invoices": 1204, "orders": 16},
		CatalogueVide: true,
	}
	if f.Blocks() {
		t.Fatal("un catalogue vide ne doit jamais bloquer la purge")
	}
	if got := f.Explain(); got == "" {
		t.Fatal("Explain doit dire pourquoi il ne bloque pas")
	}
}

func TestUnCataloguePeupleBloqueMemeSansDocument(t *testing.T) {
	// Le corollaire : dès qu'il reste quelque chose à perdre, la garde
	// retrouve toute sa force. Si celui-ci cédait, `CatalogueVide` deviendrait
	// un interrupteur qui désarme la garde au lieu de la préciser.
	f := Findings{
		CreatedHere:   map[string]int{"products": 1},
		CatalogueVide: false,
	}
	if !f.Blocks() {
		t.Fatal("une entité née en caisse doit bloquer, documents ou pas")
	}
}
