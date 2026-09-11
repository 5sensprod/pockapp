package routes

import "testing"

// casRessemblance — GARDIEN du rapprochement des désignations.
//
// Chaque `fiche` est une désignation RÉELLE du catalogue de dév (copie de
// `data.db` du 11 septembre 2026, 3051 produits), sauf mention « synthétique ».
// `saisie` est ce que tape le vendeur : une autre désignation réelle, ou une
// variante écrite à la main quand le cas l'exige.
//
// `oui` : la fiche doit être signalée. `non` : elle ne doit PAS l'être du tout.
// Retoucher un seuil ou une liste de mots vides, c'est rejouer ce tableau.
var casRessemblance = []struct {
	saisie, fiche string
	oui           bool
}{
	// ── Le défaut rapporté par le client ──────────────────────────────────
	{"Casio CDP110", "Bundle Casio CDP110", true},
	{"Casio CDP-110", "Bundle Casio CDP110", true},
	{"Casio CDP 110", "Bundle Casio CDP110", true},
	{"casio cdp110 noir", "Bundle Casio CDP110", true},
	{"Casio CPD110", "Bundle Casio CDP110", true}, // transposition

	// ── Bundle, pack, occasion, location ──────────────────────────────────
	{"Casio CDP-S110 : Piano Numérique Portable 88 Touches Pondérées", "Bundle Piano numerique CASIO CDP S110", true},
	{"Enceinte Bluetooth 200W/400W alimentée par batterie QSC CB10", "Bundle Enceinte Bluetooth 200w/400w alimentée par batterie avec housse de transport Water Proof QSC CB10", true},
	{"AMPLI Blackstar ID CORE 40 V4", "Location AMPLI Blackstar ID CORE 40 V4", true},
	{"Casio PX-S1100 Piano Numérique Compact", "BUNDLE Casio PX-S1100 + Stand CS68 +Bloc 3 pédales SP34", true},

	// ── Couleur en suffixe ────────────────────────────────────────────────
	{"Casio CDP-S110 : Piano Numérique Portable 88 Touches Pondérées", "Casio CDP-S110 : Piano Numérique Portable 88 Touches Pondérées BLANC", true},
	{"AMPLI MOOER HORNET BLACK 15W", "AMPLI MOOER HORNET WHITE 15W", true},
	{"Ampli pour guitare et basse MOOER F15ILI 15W Blanc", "Ampli pour guitare et basse MOOER F15ILI 15W NOIR", true},
	{"Anneau de renfort 5\" Blanc", "Anneau de renfort 5\" Noir", true},
	{"Casio PX-S1100 : Piano Numérique Compact & Performant Rouge", "Casio PX-S1100 : Piano Numérique Compact  Noir", true},
	{"Melodica MELOSTA 32 avec accessoires", "Melodica MELOSTA 32 avec accessoires Bleu", true},

	// ── Écriture, ponctuation, pluriel ────────────────────────────────────
	{"CHIMES SONIC ENERGY MOON 44\", BRONZE", "CHIMES SONIC ENERGY MOON 44\",BRONZE", true},
	{"Housse ukulélé TENOR 'MARRON' 12mm", "Housse ukulélé TENOR 'MARRON'12mm", true},
	{"Partsland Cadre cache pour capteur micro guitare electrique", "Partsland Cadre cache pour capteur micro guitare électrique", true},
	{"GEWA jeu de 4 Chevilles Violoncelle Ebène", "GEWA Jeux de 4 Chevilles Violoncelle Ebène", true},
	{"Jet Guitars JJ350 Green", "Guitare électrique JET JJ350 Green", true},
	{"DUNLOP - ADU 5400", "microfibre guitare DUNLOP - ADU 5400", true},
	{"Harmonica Lee Oskar 1910 Do majeur", "Harmonica Lee Oskar1910 Do majeur", true},

	// ── Fautes de frappe ──────────────────────────────────────────────────
	{"eartwood Ernie ball 11 52", "Jeu cordes folk Earthwood Ernie Ball 11/52", true},
	{"PAIE MAILLOCHES TONGUE SONIC ENERGY", "PAIRE MAILLOCHES TONGUE SONIC ENERGY", true},
	{"Ampli Blakstar ID CORE 40 V4", "AMPLI Blackstar ID CORE 40 V4", true},

	// ── Faux amis : codes modèle voisins ──────────────────────────────────
	{"Casio CDP130", "Bundle Casio CDP110", false},
	{"Casio CDP110", "Casio CDP-S110 : Piano Numérique Portable 88 Touches Pondérées", false},
	{"Casio CDP110", "Meuble pour Casio CDP", false},
	{"Yamaha P45", "Yamaha P145 Piano numérique", false}, // synthétique
	{"Yamaha P145", "Yamaha P45 Piano numérique", false}, // synthétique
	{"Yamaha P-45", "Yamaha P145", false},                // synthétique
	{"Shure MV7+ Microphone pour podcast", "Shure MV7X Microphone pour podcast", false},
	{"Cordes guitare Classique Knobloch EDC34.0", "Cordes guitare Classique Knobloch EDQ34.0", false},
	{"PB80 RA SUNB Guitare basse PRODIPE GUITARS 4 cordes Sunburst", "JB80 MA SUNB Guitare basse PRODIPE GUITARS 4 cordes Sunburst", false},
	{"PACK UHF DSP V2 CL21 LANEN Pack Système Prodipe UHF B210 DSP + Micro CL21", "PACK UHF DSP V2 GL21 LANEN Pack Système Prodipe UHF B210 DSP + Micro GL21", false},
	{"EXL110 Nickel Wound, Regular Light, 10-46", "EXL110-7 Nickel Wound, 7-String, Regular Light, 10-59", false},
	{"Potentiomètre Alpha ALP500-A37 pour Guitare Électrique", "Potentiomètre Alpha ALP500-B44 pour guitares électriques", false},

	// ── Faux amis : longueur, volume, taille, tonalité, genre ─────────────
	{"Câble jack 3 m", "Câble jack 6 m", false}, // synthétique
	{"GEWA Connexion audio symétrique Pro Line 1x Jack stéréo 6,3 mm  (M) - 1x XLR (F) 3M", "GEWA Connexion audio symétrique Pro Line 1x Jack stéréo 6,3 mm  (M) - 1x XLR (F) 6M", false},
	{"Dante Agostini Préparation au déchiffrage : étude de 600 partitions de batterie - Vol. 2", "Dante Agostini Préparation au déchiffrage : étude de 600 partitions de batterie - Vol. 3", false},
	{"GEWA Connecteur XLR (F)", "GEWA Connecteur XLR (M)", false},
	{"Penta Harp A Mineur", "Penta Harp E Mineur", false},
	{"Harmonica Bluesmaster SUZUKI en DO", "Harmonica Bluesmaster SUZUKI en LA", false},
	{"Baton de Pluie Sonic Energy Meinl L", "Baton de Pluie Sonic Energy Meinl S", false},
	{"Mib boite de 10 anches - Force 2", "Sib boîte de 10 anches - Force 2", false},
	{"Cordons - Cordon confort crochet à pompe taille S", "Cordons - Cordon confort crochet à pompe taille XL", false},

	// ── Faux amis : un seul mot commun ────────────────────────────────────
	{"Capo", "Capo Kyser Quick-Change", false}, // synthétique
	{"Câble jack", "CABLE JACK 6.35 D/D - 3M - NYLON TRESSÉ GRIS - GROOVIT®", true},
	{"Housse", "Housse pour sonorisation MOBILE AS10 Stagg", false},
}

func TestRessemblanceJeuDeCasReels(t *testing.T) {
	for _, c := range casRessemblance {
		catalogue := []ProduitCandidat{{ID: "x", Designation: c.fiche}}
		got := trouverDoublons(catalogue, IdentiteProduit{Designation: c.saisie}, "")
		if trouve := len(got) == 1; trouve != c.oui {
			score := similariteDesignation(analyserSaisie(c.saisie), jetonsDesignation(c.fiche), true)
			t.Errorf("%q ↔ %q : attendu %v, obtenu %v (score %.2f)", c.saisie, c.fiche, c.oui, trouve, score)
		}
	}
}

func TestRessemblanceOrdreEtPlafond(t *testing.T) {
	catalogue := []ProduitCandidat{
		{ID: "loin", Designation: "Housse de transport waterproof pour enceinte QSC CB10"},
		{ID: "pres", Designation: "Bundle QSC CB10"},
		{ID: "idem", Designation: "QSC CB10"},
		{ID: "sku", Designation: "Autre chose", Sku: "CB10"},
	}
	got := trouverDoublons(catalogue, IdentiteProduit{Designation: "qsc cb10", Sku: "CB10"}, "")
	var ordre []string
	for _, d := range got {
		ordre = append(ordre, d.Product.ID+":"+d.Kind)
	}
	want := []string{"idem:identical", "sku:identical", "pres:similar", "loin:similar"}
	if len(ordre) != len(want) {
		t.Fatalf("got %v", ordre)
	}
	for i := range want {
		if ordre[i] != want[i] {
			t.Fatalf("got %v, want %v", ordre, want)
		}
	}
	if !got[0].Strong || !got[2].Strong || got[3].Strong {
		t.Fatalf("fort attendu pour identique et « Bundle QSC CB10 », pas pour la housse : %+v", got)
	}

	// Onze ressemblants : dix rendus, et un identique n'est jamais évincé.
	var beaucoup []ProduitCandidat
	for i := 0; i < 11; i++ {
		beaucoup = append(beaucoup, ProduitCandidat{ID: string(rune('a' + i)), Designation: "Bundle QSC CB10"})
	}
	beaucoup = append(beaucoup, ProduitCandidat{ID: "z", Designation: "QSC CB10"})
	got = trouverDoublons(beaucoup, IdentiteProduit{Designation: "QSC CB10"}, "")
	if len(got) != doublonsMax || got[0].Product.ID != "z" {
		t.Fatalf("got %d, premier %q", len(got), got[0].Product.ID)
	}
}

func TestUneAutreReferenceEcarteLaDesignation(t *testing.T) {
	catalogue := []ProduitCandidat{
		{ID: "ref", Designation: "Bundle Casio CDP110", Sku: "BND-110"},
		{ID: "code", Designation: "Casio CDP110", Barcode: "111"},
		{ID: "nu", Designation: "Casio CDP110 noir"},
		{ID: "meme", Designation: "Casio CDP110", Sku: "CDP110"},
	}
	ids := func(got []DoublonProduit) map[string]string {
		m := map[string]string{}
		for _, d := range got {
			m[d.Product.ID] = d.Kind
		}
		return m
	}

	// Sans code saisi : tout ressort.
	if got := ids(trouverDoublons(catalogue, IdentiteProduit{Designation: "Casio CDP110"}, "")); len(got) != 4 {
		t.Fatalf("got %v", got)
	}

	// Référence et code-barres saisis, différents : ne restent que la fiche
	// sans code et celle dont la référence est identique.
	got := ids(trouverDoublons(catalogue, IdentiteProduit{Designation: "Casio CDP110", Sku: "CDP110", Barcode: "222"}, ""))
	if len(got) != 2 || got["meme"] != "identical" || got["nu"] != "similar" {
		t.Fatalf("got %v", got)
	}

	// La fiche détail ne compare pas une référence inchangée, mais elle départage.
	got = ids(trouverDoublons(catalogue, IdentiteProduit{Designation: "Casio CDP110", SkuSaisi: "AUTRE"}, ""))
	if _, ok := got["ref"]; ok {
		t.Fatalf("référence différente, fiche encore signalée : %v", got)
	}
	if _, ok := got["meme"]; ok {
		t.Fatalf("référence différente, fiche encore signalée : %v", got)
	}
	if got["code"] != "identical" || got["nu"] != "similar" {
		t.Fatalf("got %v", got)
	}
}

func TestReferenceEtCodeBarresRestentExacts(t *testing.T) {
	catalogue := []ProduitCandidat{{ID: "a", Designation: "Rien à voir", Sku: "CDP-110", Barcode: "4971850361234"}}
	for _, identite := range []IdentiteProduit{{Sku: "CDP110"}, {Sku: "cdp-110"}, {Barcode: "4971850361235"}} {
		if got := trouverDoublons(catalogue, identite, ""); len(got) != 0 {
			t.Fatalf("%+v : aucune approximation attendue, got %v", identite, got)
		}
	}
}
