// backend/routes/catalog_search_test.go
// ═══════════════════════════════════════════════════════════════════════════
// GARDIEN — la recherche du catalogue : marque, catégories, casse, accents
// ═══════════════════════════════════════════════════════════════════════════
//
// `buildCatalogProductsFilter` (TypeScript) construit un filtre où chaque mot
// doit se retrouver dans le texte du produit, sa marque OU l'une de ses
// catégories. Ce test rejoue ce filtre contre un vrai PocketBase, par le MÊME
// chemin que l'API REST (`search.Provider` + `RecordFieldResolver`), parce que
// ce que TypeScript ne peut pas savoir, c'est comment PocketBase 0.22 résout
// `brand.name_sort` et `categories.name_sort ?~` :
//
//   • une jointure sur une relation MULTIPLE peut DUPLIQUER les lignes — un
//     produit rangé dans deux catégories qui contiennent toutes deux le mot ne
//     doit compter qu'UNE fois, dans la liste comme dans `totalItems` ;
//   • `?~` (l'une d'elles) et non `~` (toutes) : sinon un produit dans deux
//     catégories, dont une seule contient le mot, disparaîtrait.
//
// Les chaînes de filtre ci-dessous sont celles que produit
// `buildCatalogProductsFilter` ; les changer d'un côté sans l'autre, c'est
// tester autre chose que ce que l'écran envoie.

package routes

import (
	"net/url"
	"testing"

	"pocket-react/backend/catalog/searchkey"
	"pocket-react/backend/catalog/sortkey"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/resolvers"
	"github.com/pocketbase/pocketbase/tools/migrate"
	"github.com/pocketbase/pocketbase/tools/search"
	"github.com/pocketbase/pocketbase/tools/types"
)

type appRecherche struct {
	app      *pocketbase.PocketBase
	produits *models.Collection
	marques  map[string]string
	rayons   map[string]string
}

func nouvelleAppRecherche(t *testing.T) *appRecherche {
	t.Helper()
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })

	runner, err := migrate.NewRunner(app.DB(), migrations.AppMigrations)
	if err != nil {
		t.Fatalf("runner: %v", err)
	}
	if _, err := runner.Up(); err != nil {
		t.Fatalf("migrations système: %v", err)
	}

	simple := func(nom string) *models.Collection {
		c := &models.Collection{Name: nom, Type: models.CollectionTypeBase}
		c.Schema = schema.NewSchema(
			&schema.SchemaField{Name: "name", Type: schema.FieldTypeText},
			&schema.SchemaField{Name: "name_sort", Type: schema.FieldTypeText},
		)
		if err := app.Dao().SaveCollection(c); err != nil {
			t.Fatalf("collection %s: %v", nom, err)
		}
		return c
	}
	marques := simple("brands")
	rayons := simple("categories")

	produits := &models.Collection{Name: "products", Type: models.CollectionTypeBase}
	produits.Schema = schema.NewSchema(
		&schema.SchemaField{Name: "name", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "designation", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "sku", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "barcode", Type: schema.FieldTypeText},
		&schema.SchemaField{Name: "search_text", Type: schema.FieldTypeText},
		&schema.SchemaField{
			Name: "brand", Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{CollectionId: marques.Id, MaxSelect: types.Pointer(1)},
		},
		&schema.SchemaField{
			Name: "categories", Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{CollectionId: rayons.Id, MaxSelect: types.Pointer(10)},
		},
	)
	if err := app.Dao().SaveCollection(produits); err != nil {
		t.Fatalf("collection products: %v", err)
	}

	return &appRecherche{app: app, produits: produits, marques: map[string]string{}, rayons: map[string]string{}}
}

func (a *appRecherche) libelle(t *testing.T, collection, nom string, ids map[string]string) string {
	t.Helper()
	col, _ := a.app.Dao().FindCollectionByNameOrId(collection)
	rec := models.NewRecord(col)
	rec.Set("name", nom)
	rec.Set("name_sort", sortkey.Cle(nom)) // ce que pose le hook `name_sort`
	if err := a.app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("%s %q: %v", collection, nom, err)
	}
	ids[nom] = rec.Id
	return rec.Id
}

func (a *appRecherche) produit(t *testing.T, nom, marque string, rayons ...string) {
	t.Helper()
	rec := models.NewRecord(a.produits)
	rec.Set("name", nom)
	// Ce que pose le hook `search_text`, sur les champs propres seulement.
	rec.Set("search_text", searchkey.Texte(nom))
	if marque != "" {
		rec.Set("brand", a.marques[marque])
	}
	ids := make([]string, 0, len(rayons))
	for _, r := range rayons {
		ids = append(ids, a.rayons[r])
	}
	rec.Set("categories", ids)
	if err := a.app.Dao().SaveRecord(rec); err != nil {
		t.Fatalf("produit %q: %v", nom, err)
	}
}

// chercher rejoue un filtre par le chemin de l'API REST et rend les noms.
func (a *appRecherche) chercher(t *testing.T, filtre string) (noms []string, total int) {
	t.Helper()
	resolver := resolvers.NewRecordFieldResolver(a.app.Dao(), a.produits, nil, true)
	var records []*models.Record
	requete := url.Values{"filter": {filtre}, "perPage": {"100"}, "sort": {"name"}}.Encode()
	res, err := search.NewProvider(resolver).
		Query(a.app.Dao().RecordQuery(a.produits)).
		ParseAndExec(requete, &records)
	if err != nil {
		t.Fatalf("filtre %q refusé : %v", filtre, err)
	}
	for _, r := range records {
		noms = append(noms, r.GetString("name"))
	}
	return noms, int(res.TotalItems)
}

// mot rend la clause que `buildCatalogProductsFilter` écrit pour UN mot.
func mot(m string) string {
	return "(search_text ~ '" + m + "' || brand.name_sort ~ '" + m + "' || categories.name_sort ?~ '" + m + "')"
}

func garnir(t *testing.T) *appRecherche {
	a := nouvelleAppRecherche(t)
	a.libelle(t, "brands", "Lag", a.marques)
	a.libelle(t, "brands", "Yamaha", a.marques)
	a.libelle(t, "categories", "Guitares folk", a.rayons)
	a.libelle(t, "categories", "Guitares électriques", a.rayons)
	a.libelle(t, "categories", "Éclairage", a.rayons)

	a.produit(t, "Tramontane T100", "Lag", "Guitares folk") // « lag » n'est QUE dans la marque
	a.produit(t, "Basse fretless", "Lag")                   // marque seule, aucune catégorie
	a.produit(t, "Ampli Rouge", "Yamaha", "Éclairage")      // catégorie seule
	a.produit(t, "Éclat 12", "Yamaha")                      // nom accentué
	a.produit(t, "Duo mixte", "Yamaha", "Guitares folk", "Guitares électriques")
	return a
}

func TestLaRechercheTrouveLesProduitsDUneMarque(t *testing.T) {
	// L'exemple demandé : « lag » ramène aussi les produits de la marque Lag,
	// même quand le nom du produit ne contient pas « lag ».
	a := garnir(t)
	noms, total := a.chercher(t, mot("lag"))
	if total != 2 || len(noms) != 2 {
		t.Fatalf("« lag » = %v (total %d), attendu les 2 produits de la marque Lag", noms, total)
	}
}

func TestLaRechercheTrouveLesProduitsDUneCategorie(t *testing.T) {
	a := garnir(t)
	noms, total := a.chercher(t, mot("guitares"))
	// Tramontane (folk) et Duo mixte (folk ET électriques) : le second ne compte
	// QU'UNE fois malgré ses deux catégories qui contiennent le mot.
	if total != 2 || len(noms) != 2 {
		t.Fatalf("« guitares » = %v (total %d), attendu 2 produits, sans doublon", noms, total)
	}
}

func TestLaRechercheNeDepartagePasLaCasseNiLesAccents(t *testing.T) {
	a := garnir(t)

	// Le mot arrive PLIÉ du client (`cleDeRecherche`) : « ÉCLAT », « Éclat » et
	// « eclat » sont la même requête.
	for _, saisi := range []string{"ÉCLAT", "Éclat", "éclat", "eclat", "ECLAT"} {
		plie := searchkey.Cle(saisi)
		noms, _ := a.chercher(t, mot(plie))
		// « Éclat 12 » par son nom, « Ampli Rouge » par sa catégorie « Éclairage »
		// (« eclairage » ne contient pas « eclat », donc PAS lui).
		if len(noms) != 1 || noms[0] != "Éclat 12" {
			t.Errorf("recherche %q (pliée %q) = %v, attendu [Éclat 12]", saisi, plie, noms)
		}
	}

	// Une catégorie accentuée se trouve sans accent : « eclairage ».
	noms, _ := a.chercher(t, mot("eclairage"))
	if len(noms) != 1 || noms[0] != "Ampli Rouge" {
		t.Errorf("« eclairage » = %v, attendu [Ampli Rouge] par sa catégorie", noms)
	}
}

func TestChaqueMotPeutVenirDUnAutreChamp(t *testing.T) {
	// « lag folk » : « lag » vient de la marque, « folk » de la catégorie.
	a := garnir(t)
	noms, total := a.chercher(t, mot("lag")+" && "+mot("folk"))
	if total != 1 || len(noms) != 1 || noms[0] != "Tramontane T100" {
		t.Fatalf("« lag folk » = %v (total %d), attendu [Tramontane T100]", noms, total)
	}

	// Et un mot qui ne se trouve nulle part ferme la recherche.
	if noms, _ := a.chercher(t, mot("lag")+" && "+mot("piano")); len(noms) != 0 {
		t.Fatalf("« lag piano » = %v, attendu rien", noms)
	}
}

func TestUnProduitSansMarqueNiCategorieResteCherchableParSonNom(t *testing.T) {
	// La jointure ne doit pas écarter une ligne dont la relation est vide : sans
	// LEFT JOIN, « éclat » perdrait « Éclat 12 », qui n'a ni marque ni catégorie.
	a := garnir(t)
	noms, _ := a.chercher(t, mot("eclat"))
	if len(noms) != 1 {
		t.Fatalf("« eclat » = %v, attendu le produit sans marque ni catégorie", noms)
	}
}

func TestLAncienFiltreBrutNeTrouvaitNiLAccentNiLaMarque(t *testing.T) {
	// La PREUVE du défaut : l'ancien filtre, `name ~ terme` sur les champs bruts,
	// ne trouve « Éclat 12 » en tapant « eclat » (le LIKE de SQLite ne connaît pas
	// les accents) et ne voit pas la marque. Mesuré : ce build plie en revanche la
	// casse d'un « É » — on ne l'affirme pas ici, on n'en dépend pas non plus.
	// Si ce test passe au rouge, c'est SQLite qui a changé : la clé dérivée
	// (`backend/catalog/searchkey`) ne serait alors plus nécessaire.
	a := garnir(t)

	if noms, _ := a.chercher(t, "name ~ 'eclat'"); len(noms) != 0 {
		t.Errorf("`name ~ 'eclat'` = %v : le LIKE brut ne devrait pas plier l'accent", noms)
	}
	if noms, _ := a.chercher(t, "name ~ 'lag'"); len(noms) != 0 {
		t.Errorf("`name ~ 'lag'` = %v : aucun nom ne contient « lag », seule la marque le porte", noms)
	}
}
