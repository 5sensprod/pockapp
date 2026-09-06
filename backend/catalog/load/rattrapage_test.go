package load

import (
	"os"
	"path/filepath"
	"testing"

	"pocket-react/backend/catalog/normalize"
)

func TestSlugLibreNeTouchePasUnSlugDisponible(t *testing.T) {
	// Le slug est figé et nomme une page en ligne : quand il est libre, il ne
	// doit surtout pas être « amélioré ».
	got, ajuste := slugLibre("sangle-pixie-cuir-simple", "Sangle Pixie Cuir Simple", map[string]bool{})
	if got != "sangle-pixie-cuir-simple" {
		t.Fatalf("slug modifié sans raison : %q", got)
	}
	if ajuste {
		t.Fatal("un slug libre n'est pas un slug ajusté")
	}
}

func TestSlugLibreDeriveEtLeDitQuandLeSlugEstPris(t *testing.T) {
	pris := map[string]bool{"pro-orca-5b": true}
	got, ajuste := slugLibre("pro-orca-5b", "Pro Orca 5B", pris)
	if got == "pro-orca-5b" {
		t.Fatal("le slug d'un produit existant a été réutilisé : deux fiches sur une page")
	}
	if !ajuste {
		t.Fatal("un slug dérivé doit être signalé, sinon personne ne sait que l'adresse a changé")
	}
	if got != "pro-orca-5b-2" {
		t.Fatalf("le suffixe doit être déterministe pour qu'une simulation vaille quelque chose, obtenu %q", got)
	}
}

func TestSlugLibreEstDeterministe(t *testing.T) {
	// Deux simulations successives doivent annoncer le même slug ; sinon la
	// simulation ne dit rien de ce que l'application fera.
	pris := map[string]bool{"x": true, "x-2": true}
	a, _ := slugLibre("x", "X", pris)
	b, _ := slugLibre("x", "X", pris)
	if a != b || a != "x-3" {
		t.Fatalf("suffixe non déterministe : %q puis %q", a, b)
	}
}

func TestSlugLibreDeriveDuNomQuandLaSourceNEnAPas(t *testing.T) {
	got, _ := slugLibre("", "Sangle Pixie Cuir Double", map[string]bool{})
	if got == "" {
		t.Fatal("un produit sans slug partirait en ligne sans adresse")
	}
}

func TestRelationsPerduesNommeChaqueRattachementImpossible(t *testing.T) {
	p := normalize.Product{
		BrandLegacyID:    "marqueX",
		SupplierLegacyID: "fournisseurY",
		CategoryLegacyID: []string{"catA", "catB"},
	}
	// Seule catA existe.
	perdues := relationsPerdues(p, map[string]string{}, map[string]string{"catA": "pb1"}, map[string]string{})
	if len(perdues) != 3 {
		t.Fatalf("attendu 3 relations perdues (marque, fournisseur, catB), obtenu %d : %v", len(perdues), perdues)
	}
}

func TestRelationsPerduesNeSignaleRienQuandToutSeResout(t *testing.T) {
	p := normalize.Product{BrandLegacyID: "m", CategoryLegacyID: []string{"c"}}
	perdues := relationsPerdues(p,
		map[string]string{"m": "pb1"}, map[string]string{"c": "pb2"}, map[string]string{})
	if len(perdues) != 0 {
		t.Fatalf("relations inventées : %v", perdues)
	}
}

func TestCompterImagesNeCompteQueCeQuiEstSurLeDisque(t *testing.T) {
	// C'est le contrôle qui distingue un rattrapage utile d'un rattrapage à
	// refaire : une fiche dont NeDB annonce trois visuels et dont aucun
	// fichier n'existe arrivera nue, et il faut le savoir AVANT d'écrire.
	racine := t.TempDir()
	rel := filepath.Join("public", "products", "abc")
	if err := os.MkdirAll(filepath.Join(racine, rel), 0o700); err != nil {
		t.Fatal(err)
	}
	present := filepath.Join(rel, "vrai.webp")
	if err := os.WriteFile(filepath.Join(racine, present), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	fl := &files{root: racine, res: newResult()}
	p := normalize.Product{
		ImageSrc:   "/" + filepath.ToSlash(present),
		GallerySrc: []string{"/public/products/abc/fantome.webp"},
	}
	attendues, trouvees := compterImages(fl, p)
	if attendues != 2 {
		t.Fatalf("attendu 2 images déclarées, obtenu %d", attendues)
	}
	if trouvees != 1 {
		t.Fatalf("attendu 1 image réellement présente, obtenu %d", trouvees)
	}
}

func TestResolveEssaieLesRacinesSupplementaires(t *testing.T) {
	// Les fiches que la base d'installation n'a plus vivent dans la base de
	// développement, dont les images sont sous une AUTRE racine. Sans ce
	// parcours, elles arriveraient toutes sans visuel.
	vide := t.TempDir()
	autre := t.TempDir()
	rel := filepath.Join("public", "products", "zz")
	if err := os.MkdirAll(filepath.Join(autre, rel), 0o700); err != nil {
		t.Fatal(err)
	}
	cible := filepath.Join(rel, "image.webp")
	if err := os.WriteFile(filepath.Join(autre, cible), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	fl := &files{root: vide, autresRacines: []string{autre}, res: newResult()}
	if got := fl.resolve("/" + filepath.ToSlash(cible)); got == "" {
		t.Fatal("une image présente sous une racine supplémentaire doit être retrouvée")
	}

	seul := &files{root: vide, res: newResult()}
	if got := seul.resolve("/" + filepath.ToSlash(cible)); got != "" {
		t.Fatalf("sans racine supplémentaire, rien ne doit être trouvé, obtenu %q", got)
	}
}

func TestRetenueEtRefuseeSeparentLesFiches(t *testing.T) {
	res := &ResultatRattrapage{Fiches: []FicheRattrapee{
		{LegacyID: "a"},
		{LegacyID: "b", Refus: "legacy_id déjà en base"},
		{LegacyID: "c"},
	}}
	if n := len(res.Retenues()); n != 2 {
		t.Fatalf("attendu 2 retenues, obtenu %d", n)
	}
	if n := len(res.Refusees()); n != 1 {
		t.Fatalf("attendu 1 refusée, obtenu %d", n)
	}
}
