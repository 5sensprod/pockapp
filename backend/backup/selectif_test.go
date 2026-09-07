// backend/backup/selectif_test.go
//
// Gardiens de la restauration sélective. Quatre affirmations portent tout le
// mécanisme, et aucune ne se démontre par la lecture du code :
//
//  1. seuls les champs de la liste blanche sont écrits — même quand le
//     snapshot porte les autres, ce qui est TOUJOURS le cas, un snapshot étant
//     la base entière ;
//  2. `slug` et `legacy_id` survivent. Le slug nomme une page en ligne, et
//     `SaveRecord` réécrit la ligne entière : la propriété ne va pas de soi ;
//  3. rien n'est créé, rien n'est effacé. En particulier, un produit né en
//     caisse chez le client — absent du snapshot de développement — n'est pas
//     dépublié par omission ;
//  4. la simulation n'écrit rien. C'est le mode par défaut ; s'il écrivait,
//     l'aperçu serait un dégât.
//
// Les tests montent DEUX PocketBase réelles : l'une joue la base en service,
// l'autre le snapshot. Le snapshot est un vrai fichier SQLite produit par
// `VACUUM INTO`, comme en production — un faux en mémoire ne prouverait rien
// de l'ouverture en lecture seule.

package backup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ═══════════════════════════════════════════════════════════════════════════
// LE DÉCOR
// ═══════════════════════════════════════════════════════════════════════════

// monterCatalogue crée `categories`, `products` et `site_menu` avec les champs
// que la restauration sélective lit ou protège.
//
// Le schéma est volontairement réduit à ces champs-là : ce qui est testé, ce
// n'est pas la migration (elle a ses propres gardiens), c'est la règle
// d'écriture. Mais `slug`, `legacy_id` et `price_ttc` y sont, PARCE QUE ce sont
// eux qui ne doivent pas bouger.
func monterCatalogue(t *testing.T, app *pocketbase.PocketBase) {
	t.Helper()

	cats := &models.Collection{
		Name: "categories",
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			&schema.SchemaField{Name: "name", Type: schema.FieldTypeText, Required: true},
			&schema.SchemaField{Name: "slug", Type: schema.FieldTypeText},
			&schema.SchemaField{Name: "legacy_id", Type: schema.FieldTypeText},
			&schema.SchemaField{Name: "company", Type: schema.FieldTypeText},
		),
	}
	if err := app.Dao().SaveCollection(cats); err != nil {
		t.Fatalf("collection categories : %v", err)
	}

	produits := &models.Collection{
		Name: "products",
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			&schema.SchemaField{Name: "name", Type: schema.FieldTypeText, Required: true},
			&schema.SchemaField{Name: "designation", Type: schema.FieldTypeText},
			&schema.SchemaField{Name: "slug", Type: schema.FieldTypeText},
			&schema.SchemaField{Name: "legacy_id", Type: schema.FieldTypeText},
			&schema.SchemaField{Name: "price_ttc", Type: schema.FieldTypeNumber},
			&schema.SchemaField{
				Name: "status",
				Type: schema.FieldTypeSelect,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"draft", "published"},
				},
			},
			&schema.SchemaField{
				Name: "categories",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  cats.Id,
					MaxSelect:     nil,
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{Name: "company", Type: schema.FieldTypeText},
		),
	}
	if err := app.Dao().SaveCollection(produits); err != nil {
		t.Fatalf("collection products : %v", err)
	}

	menu := &models.Collection{
		Name: "site_menu",
		Type: models.CollectionTypeBase,
		Schema: schema.NewSchema(
			&schema.SchemaField{Name: "title", Type: schema.FieldTypeText, Required: true},
			&schema.SchemaField{Name: "position", Type: schema.FieldTypeNumber},
			&schema.SchemaField{Name: "visible", Type: schema.FieldTypeBool},
			&schema.SchemaField{
				Name:     "link_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"none", "manual", "category", "brand", "product", "page"},
				},
			},
			&schema.SchemaField{Name: "link_url", Type: schema.FieldTypeText},
			&schema.SchemaField{Name: "ref_id", Type: schema.FieldTypeText},
		),
	}
	if err := app.Dao().SaveCollection(menu); err != nil {
		t.Fatalf("collection site_menu : %v", err)
	}
	menu.Schema.AddField(&schema.SchemaField{
		Name: "parent",
		Type: schema.FieldTypeRelation,
		Options: &schema.RelationOptions{
			CollectionId:  menu.Id,
			MaxSelect:     types.Pointer(1),
			CascadeDelete: true,
		},
	})
	if err := app.Dao().SaveCollection(menu); err != nil {
		t.Fatalf("site_menu.parent : %v", err)
	}
}

// poser écrit un enregistrement SOUS UN IDENTIFIANT IMPOSÉ. C'est ce qui
// permet aux deux bases de partager des identifiants, comme le font une base
// de développement et celle dont elle est la restauration.
func poser(t *testing.T, dao *daos.Dao, collection, id string, valeurs map[string]any) {
	t.Helper()

	col, err := dao.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatalf("collection %s : %v", collection, err)
	}
	rec := models.NewRecord(col)
	rec.SetId(id)
	rec.MarkAsNew()
	for champ, valeur := range valeurs {
		rec.Set(champ, valeur)
	}
	if err := dao.SaveRecord(rec); err != nil {
		t.Fatalf("écriture de %s/%s : %v", collection, id, err)
	}
}

// figerEnSnapshot produit un fichier SQLite à partir d'une app, exactement
// comme la sauvegarde le fait en production (`VACUUM INTO`).
func figerEnSnapshot(t *testing.T, app *pocketbase.PocketBase) string {
	t.Helper()

	chemin := filepath.Join(t.TempDir(), "snapshot.db")
	if _, err := app.DB().NewQuery(
		"VACUUM INTO '" + filepath.ToSlash(chemin) + "'",
	).Execute(); err != nil {
		t.Fatalf("VACUUM INTO : %v", err)
	}
	return chemin
}

func lireFiche(t *testing.T, app *pocketbase.PocketBase, collection, id string) *models.Record {
	t.Helper()
	rec, err := app.Dao().FindRecordById(collection, id)
	if err != nil {
		t.Fatalf("%s/%s introuvable : %v", collection, id, err)
	}
	return rec
}

// ═══════════════════════════════════════════════════════════════════════════
// LA LISTE BLANCHE
// ═══════════════════════════════════════════════════════════════════════════

// TestChampHorsListeBlancheRefuse est le gardien le plus direct : la garde ne
// se contente pas de ne pas produire de champ interdit, elle REFUSE d'en
// écrire un qu'on lui présenterait.
//
// C'est la différence entre « le code actuel ne le fait pas » et « le code ne
// peut pas le faire ». La seconde survit à une modification distraite.
func TestChampHorsListeBlancheRefuse(t *testing.T) {
	app := nouvelleAppDeTest(t)
	monterCatalogue(t, app)
	poser(t, app.Dao(), "products", "prod000000000a", map[string]any{
		"name": "Guitare", "slug": "guitare", "price_ttc": 990.0,
	})

	poser(t, app.Dao(), "categories", "cat00000000001", map[string]any{"name": "Guitares"})

	for collection, champs := range ChampsProteges {
		rec := lireFiche(t, app, collection, map[string]string{
			"products":   "prod000000000a",
			"categories": "cat00000000001",
		}[collection])

		for _, champ := range champs {
			err := appliquerChamps(rec, collection, map[string]any{champ: "valeur-du-snapshot"})
			if err == nil {
				t.Fatalf("%s : le champ protégé %q a été accepté à l'écriture", collection, champ)
			}
			if !strings.Contains(err.Error(), "hors liste blanche") {
				t.Fatalf("%s, champ %q : message inattendu — %v", collection, champ, err)
			}
		}
	}

	rec := lireFiche(t, app, "products", "prod000000000a")

	// Et l'inverse : ce qui est autorisé passe.
	if err := appliquerChamps(rec, "products", map[string]any{
		"status": "draft", "designation": "GTR-01",
	}); err != nil {
		t.Fatalf("un champ de la liste blanche a été refusé : %v", err)
	}
}

// TestListesBlancheEtProtegeeNeSeCroisentPas : dans UNE MÊME collection, un
// champ ne peut pas être à la fois autorisé et protégé. Sans ce test, ajouter
// `slug` à la liste blanche « pour essayer » passerait inaperçu.
//
// La comparaison est par collection, pas globale : `name` est autorisé sur
// `categories` et protégé sur `products`, et c'est exact — voir le commentaire
// de `ChampsProteges`.
func TestListesBlancheEtProtegeeNeSeCroisentPas(t *testing.T) {
	for collection, champs := range ChampsAutorises {
		for _, champ := range champs {
			for _, protege := range ChampsProteges[collection] {
				if champ == protege {
					t.Fatalf("%q est à la fois autorisé et protégé pour %q", champ, collection)
				}
			}
		}
	}

	// Toute collection qui a une liste blanche doit avoir une liste protégée :
	// sans elle, le test précédent ne vérifierait rien pour cette collection —
	// et il passerait quand même.
	for collection := range ChampsAutorises {
		if len(ChampsProteges[collection]) == 0 {
			t.Fatalf("la collection %q n'a aucun champ protégé déclaré", collection)
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// LE CŒUR : CE QUI PASSE, ET CE QUI NE PASSE PAS
// ═══════════════════════════════════════════════════════════════════════════

// prepareDeuxBases monte la cible et la source, et rend le chemin du snapshot.
//
// Le décor est le scénario de recette : la source porte le travail
// d'organisation (rangement, dépublication, désignation), et TOUS les autres
// champs y ont été salis — nom, slug, prix — pour vérifier qu'ils ne passent
// pas.
func prepareDeuxBases(t *testing.T) (cible *pocketbase.PocketBase, snapshot string) {
	t.Helper()

	// ── La base en service ─────────────────────────────────────────────────
	cible = nouvelleAppDeTest(t)
	monterCatalogue(t, cible)
	poser(t, cible.Dao(), "categories", "cat00000000001", map[string]any{
		"name": "Guitares", "slug": "guitares", "legacy_id": "ned_cat_1",
	})
	poser(t, cible.Dao(), "categories", "cat00000000002", map[string]any{
		"name": "Accessoires", "slug": "accessoires", "legacy_id": "ned_cat_2",
	})
	poser(t, cible.Dao(), "products", "prod000000000a", map[string]any{
		"name": "Guitare folk", "designation": "GTR-FOLK", "slug": "guitare-folk",
		"legacy_id": "ned_p_a", "price_ttc": 299.0, "status": "published",
		"categories": []string{"cat00000000001"},
	})
	// Le produit né en caisse chez le client : il n'existe QUE dans la cible.
	poser(t, cible.Dao(), "products", "prod000000000c", map[string]any{
		"name": "Médiator vendu au comptoir", "slug": "mediator",
		"legacy_id": "pa_1725000000_x", "price_ttc": 1.5, "status": "published",
	})

	// ── La source, mêmes identifiants, autres valeurs ──────────────────────
	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "categories", "cat00000000001", map[string]any{
		// renommée : dans la liste blanche
		"name": "Guitares acoustiques", "slug": "slug-sali", "legacy_id": "ned_cat_1",
	})
	poser(t, source.Dao(), "categories", "cat00000000002", map[string]any{
		"name": "Accessoires", "slug": "accessoires", "legacy_id": "ned_cat_2",
	})
	poser(t, source.Dao(), "products", "prod000000000a", map[string]any{
		// name, slug et price_ttc SALIS : ils ne doivent pas passer.
		"name": "NOM-DU-SNAPSHOT", "slug": "SLUG-DU-SNAPSHOT", "price_ttc": 1.0,
		"legacy_id": "AUTRE_LEGACY",
		// les trois champs qui doivent passer :
		"designation": "GTR-FOLK-2026", "status": "draft",
		"categories": []string{"cat00000000001", "cat00000000002"},
	})
	// Une fiche qui n'existe que dans le snapshot : comptée, jamais créée.
	poser(t, source.Dao(), "products", "prod000000000b", map[string]any{
		"name": "Produit du dév", "slug": "produit-du-dev",
		"legacy_id": "ned_p_b", "status": "published",
	})

	return cible, figerEnSnapshot(t, source)
}

// TestSeulsLesChampsBlancsSontEcrits — l'affirmation centrale, sur une
// écriture réelle.
func TestSeulsLesChampsBlancsSontEcrits(t *testing.T) {
	cible, snapshot := prepareDeuxBases(t)

	rapport, err := RestaurerSelectivement(cible, snapshot, "snap-test",
		OptionsSelectif{Appliquer: true, DossierSauvegarde: t.TempDir()})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}

	produit := lireFiche(t, cible, "products", "prod000000000a")

	// Ce qui devait passer.
	if got := produit.GetString("designation"); got != "GTR-FOLK-2026" {
		t.Errorf("designation = %q, attendu GTR-FOLK-2026", got)
	}
	if got := produit.GetString("status"); got != "draft" {
		t.Errorf("status = %q, attendu draft", got)
	}
	if got := produit.GetStringSlice("categories"); len(got) != 2 {
		t.Errorf("categories = %v, attendu deux rattachements", got)
	}

	// Ce qui ne devait PAS passer. Le slug d'abord : il nomme une page en
	// ligne, et c'est le seul de ces champs dont l'écrasement se paie chez des
	// visiteurs.
	if got := produit.GetString("slug"); got != "guitare-folk" {
		t.Errorf("LE SLUG A BOUGÉ : %q (attendu guitare-folk)", got)
	}
	if got := produit.GetString("legacy_id"); got != "ned_p_a" {
		t.Errorf("LE LEGACY_ID A BOUGÉ : %q (attendu ned_p_a)", got)
	}
	if got := produit.GetString("name"); got != "Guitare folk" {
		t.Errorf("name = %q, il ne devait pas bouger", got)
	}
	if got := produit.GetFloat("price_ttc"); got != 299.0 {
		t.Errorf("price_ttc = %v, il ne devait pas bouger", got)
	}

	// La catégorie renommée est passée, son slug non.
	categorie := lireFiche(t, cible, "categories", "cat00000000001")
	if got := categorie.GetString("name"); got != "Guitares acoustiques" {
		t.Errorf("nom de catégorie = %q", got)
	}
	if got := categorie.GetString("slug"); got != "guitares" {
		t.Errorf("LE SLUG DE CATÉGORIE A BOUGÉ : %q", got)
	}

	// Le rapport dit ce qu'il a fait.
	if rapport.Ecrites != 2 {
		t.Errorf("écritures = %d, attendu 2 (un produit, une catégorie)", rapport.Ecrites)
	}
	if rapport.SauvegardeAvant == "" {
		t.Error("aucune sauvegarde d'avant n'a été déposée")
	}
	if _, err := os.Stat(filepath.Join(rapport.SauvegardeAvant, "data.db")); err != nil {
		t.Errorf("la sauvegarde d'avant est introuvable : %v", err)
	}
}

// TestRienNestCreeNiEfface — les deux sens de l'absence.
func TestRienNestCreeNiEfface(t *testing.T) {
	cible, snapshot := prepareDeuxBases(t)

	rapport, err := RestaurerSelectivement(cible, snapshot, "snap-test",
		OptionsSelectif{Appliquer: true, DossierSauvegarde: t.TempDir()})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}

	// Présent dans le snapshot, absent de la cible : compté, listé, PAS créé.
	if _, err := cible.Dao().FindRecordById("products", "prod000000000b"); err == nil {
		t.Fatal("un produit du snapshot a été CRÉÉ dans la base cible")
	}
	if rapport.Produits.NbAbsentesCible != 1 {
		t.Errorf("absents de la cible = %d, attendu 1", rapport.Produits.NbAbsentesCible)
	}
	if len(rapport.Produits.AbsentesCible) != 1 ||
		rapport.Produits.AbsentesCible[0].Nom != "Produit du dév" {
		t.Errorf("l'absent n'est pas nommé : %+v", rapport.Produits.AbsentesCible)
	}

	// Présent dans la cible, absent du snapshot : INTACT. C'est le produit né
	// en caisse — il ne doit surtout pas être dépublié par omission.
	comptoir := lireFiche(t, cible, "products", "prod000000000c")
	if got := comptoir.GetString("status"); got != "published" {
		t.Fatalf("LE PRODUIT NÉ EN CAISSE A ÉTÉ DÉPUBLIÉ PAR OMISSION : status = %q", got)
	}
	if got := comptoir.GetString("name"); got != "Médiator vendu au comptoir" {
		t.Errorf("le produit né en caisse a été modifié : %q", got)
	}
	if rapport.Produits.NbIntactes != 1 {
		t.Errorf("intacts = %d, attendu 1", rapport.Produits.NbIntactes)
	}
}

// TestSimulationNEcritRien — le mode par défaut ne touche à rien.
func TestSimulationNEcritRien(t *testing.T) {
	cible, snapshot := prepareDeuxBases(t)

	avant := lireFiche(t, cible, "products", "prod000000000a")
	statutAvant := avant.GetString("status")
	designationAvant := avant.GetString("designation")

	rapport, err := RestaurerSelectivement(cible, snapshot, "snap-test",
		OptionsSelectif{}) // Appliquer non renseigné : c'est le point du test
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}
	if !rapport.Simulation {
		t.Fatal("le rapport ne se déclare pas comme une simulation")
	}
	if rapport.Ecrites != 0 {
		t.Fatalf("la simulation a écrit %d enregistrements", rapport.Ecrites)
	}
	if rapport.SauvegardeAvant != "" {
		t.Error("la simulation a déposé une sauvegarde : elle n'avait rien à protéger")
	}

	apres := lireFiche(t, cible, "products", "prod000000000a")
	if apres.GetString("status") != statutAvant ||
		apres.GetString("designation") != designationAvant {
		t.Fatal("la simulation a modifié la base")
	}

	// Mais elle a bien VU l'écart : c'est ce qu'on lui demande.
	if rapport.Produits.AChanger != 1 {
		t.Errorf("produits à changer = %d, attendu 1", rapport.Produits.AChanger)
	}
	if rapport.Categories.AChanger != 1 {
		t.Errorf("catégories à changer = %d, attendu 1", rapport.Categories.AChanger)
	}
	if rapport.Produits.ParChamp["status"] != 1 ||
		rapport.Produits.ParChamp["designation"] != 1 ||
		rapport.Produits.ParChamp["categories"] != 1 {
		t.Errorf("décompte par champ inattendu : %v", rapport.Produits.ParChamp)
	}
}

// TestEffetExportEstAnnonce — la conséquence qu'il faut dire avant d'écrire.
//
// `status` et `categories` entrent dans le checksum d'export du site,
// `designation` non. Une fiche dont seule la désignation change ne doit donc
// PAS être comptée comme « repartira en ligne » : annoncer un ré-export qui
// n'aura pas lieu est aussi trompeur que de taire celui qui aura lieu.
func TestEffetExportEstAnnonce(t *testing.T) {
	cible, snapshot := prepareDeuxBases(t)

	rapport, err := RestaurerSelectivement(cible, snapshot, "snap-test", OptionsSelectif{})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}
	if rapport.Effet.ProduitsARepublier != 1 {
		t.Errorf("produits à republier = %d, attendu 1", rapport.Effet.ProduitsARepublier)
	}
	if rapport.Effet.CategoriesARepublier != 1 {
		t.Errorf("catégories à republier = %d, attendu 1", rapport.Effet.CategoriesARepublier)
	}
}

// TestDesignationSeuleNeRepubliePas — le pendant du test précédent, isolé.
func TestDesignationSeuleNeRepubliePas(t *testing.T) {
	cible := nouvelleAppDeTest(t)
	monterCatalogue(t, cible)
	poser(t, cible.Dao(), "products", "prod000000000a", map[string]any{
		"name": "Ampli", "designation": "AMP-1", "slug": "ampli", "status": "published",
	})

	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "products", "prod000000000a", map[string]any{
		"name": "Ampli", "designation": "AMP-2026", "slug": "ampli", "status": "published",
	})

	rapport, err := RestaurerSelectivement(cible, figerEnSnapshot(t, source),
		"snap-test", OptionsSelectif{})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}
	if rapport.Produits.AChanger != 1 {
		t.Fatalf("produits à changer = %d, attendu 1", rapport.Produits.AChanger)
	}
	if rapport.Effet.ProduitsARepublier != 0 {
		t.Errorf("une désignation seule a été annoncée comme republiée (%d)",
			rapport.Effet.ProduitsARepublier)
	}
}

// TestApparimentParLegacyID — le repli, quand les identifiants PocketBase ont
// divergé (une base rechargée par `catalog-import`).
func TestApparimentParLegacyID(t *testing.T) {
	cible := nouvelleAppDeTest(t)
	monterCatalogue(t, cible)
	poser(t, cible.Dao(), "products", "prodrechargee01", map[string]any{
		"name": "Basse", "slug": "basse", "legacy_id": "ned_p_z",
		"status": "published", "designation": "BSS-1",
	})

	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "products", "prodautreidenti", map[string]any{
		"name": "Basse", "slug": "basse", "legacy_id": "ned_p_z",
		"status": "draft", "designation": "BSS-2026",
	})

	rapport, err := RestaurerSelectivement(cible, figerEnSnapshot(t, source),
		"snap-test", OptionsSelectif{Appliquer: true, DossierSauvegarde: t.TempDir()})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}
	if rapport.Produits.ApparieesParLegacyID != 1 {
		t.Fatalf("appariements par legacy_id = %d, attendu 1",
			rapport.Produits.ApparieesParLegacyID)
	}
	if rapport.Produits.ApparieesParID != 0 {
		t.Errorf("appariements par id = %d, attendu 0", rapport.Produits.ApparieesParID)
	}

	produit := lireFiche(t, cible, "products", "prodrechargee01")
	if produit.GetString("status") != "draft" || produit.GetString("designation") != "BSS-2026" {
		t.Error("la fiche appariée par legacy_id n'a pas reçu les champs du snapshot")
	}
	if produit.GetString("legacy_id") != "ned_p_z" {
		t.Error("le legacy_id a bougé alors qu'il est la clé de l'appariement")
	}
}

// TestLegacyIDVideNAppariePas — PocketBase stocke ” et non NULL. Sans la
// garde, toutes les fiches sans clé stable s'apparieraient ENTRE ELLES, et la
// première du snapshot écraserait la première de la cible.
func TestLegacyIDVideNAppariePas(t *testing.T) {
	cible := nouvelleAppDeTest(t)
	monterCatalogue(t, cible)
	poser(t, cible.Dao(), "products", "prodsanslegacy1", map[string]any{
		"name": "Sans clé A", "status": "published",
	})

	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "products", "prodsanslegacy2", map[string]any{
		"name": "Sans clé B", "status": "draft",
	})

	rapport, err := RestaurerSelectivement(cible, figerEnSnapshot(t, source),
		"snap-test", OptionsSelectif{Appliquer: true, DossierSauvegarde: t.TempDir()})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}
	if rapport.Ecrites != 0 {
		t.Fatalf("%d écriture(s) sur un appariement qui ne devait pas avoir lieu", rapport.Ecrites)
	}
	if lireFiche(t, cible, "products", "prodsanslegacy1").GetString("status") != "published" {
		t.Fatal("une fiche sans legacy_id a été écrasée par une homonyme du snapshot")
	}

	// Et rien n'a été sauvegardé : une copie de la base entière pour protéger
	// de zéro écriture, c'est 15 Mio sur le disque d'un poste de magasin à
	// chaque clic.
	if rapport.SauvegardeAvant != "" {
		t.Errorf("une sauvegarde a été déposée alors qu'il n'y avait rien à écrire : %s",
			rapport.SauvegardeAvant)
	}
}

// TestCategorieInconnueEcarteLaFiche — plutôt qu'un rattachement amputé, un
// refus nommé. Un produit à moitié rangé est un produit qu'on croit rangé.
func TestCategorieInconnueEcarteLaFiche(t *testing.T) {
	cible := nouvelleAppDeTest(t)
	monterCatalogue(t, cible)
	poser(t, cible.Dao(), "categories", "cat00000000001", map[string]any{"name": "Guitares"})
	poser(t, cible.Dao(), "products", "prod000000000a", map[string]any{
		"name": "Guitare", "slug": "guitare", "status": "published",
		"categories": []string{"cat00000000001"},
	})

	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "categories", "cat00000000001", map[string]any{"name": "Guitares"})
	// Cette catégorie-là n'existe QUE dans le snapshot.
	poser(t, source.Dao(), "categories", "cat00000000009", map[string]any{"name": "Nouveauté"})
	poser(t, source.Dao(), "products", "prod000000000a", map[string]any{
		"name": "Guitare", "slug": "guitare", "status": "draft",
		"categories": []string{"cat00000000001", "cat00000000009"},
	})

	rapport, err := RestaurerSelectivement(cible, figerEnSnapshot(t, source),
		"snap-test", OptionsSelectif{Appliquer: true, DossierSauvegarde: t.TempDir()})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}
	if rapport.Produits.NbEcartees != 1 {
		t.Fatalf("écartées = %d, attendu 1", rapport.Produits.NbEcartees)
	}
	// Le motif nomme la catégorie EN TOUTES LETTRES : « Nouveauté », pas
	// « cat00000000009 ». Un motif en identifiants ne se vérifie pas.
	if !strings.Contains(rapport.Produits.Ecartees[0].Motif, "Nouveauté") {
		t.Errorf("motif inattendu : %q", rapport.Produits.Ecartees[0].Motif)
	}
	// Et la fiche n'a rien reçu — pas même le `status`, qui aurait pu passer.
	if lireFiche(t, cible, "products", "prod000000000a").GetString("status") != "published" {
		t.Error("une fiche écartée a quand même été écrite")
	}
}

// TestOrdreDesCategoriesNEstPasUnChangement — l'ordre des catégories d'un
// produit n'a aucun lecteur. Le prendre pour un écart déclarerait des
// centaines de fiches modifiées, qui repartiraient à l'export pour rien.
func TestOrdreDesCategoriesNEstPasUnChangement(t *testing.T) {
	cible := nouvelleAppDeTest(t)
	monterCatalogue(t, cible)
	poser(t, cible.Dao(), "categories", "cat00000000001", map[string]any{"name": "A"})
	poser(t, cible.Dao(), "categories", "cat00000000002", map[string]any{"name": "B"})
	poser(t, cible.Dao(), "products", "prod000000000a", map[string]any{
		"name": "P", "status": "published",
		"categories": []string{"cat00000000001", "cat00000000002"},
	})

	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "categories", "cat00000000001", map[string]any{"name": "A"})
	poser(t, source.Dao(), "categories", "cat00000000002", map[string]any{"name": "B"})
	poser(t, source.Dao(), "products", "prod000000000a", map[string]any{
		"name": "P", "status": "published",
		"categories": []string{"cat00000000002", "cat00000000001"},
	})

	rapport, err := RestaurerSelectivement(cible, figerEnSnapshot(t, source),
		"snap-test", OptionsSelectif{})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}
	if rapport.Produits.AChanger != 0 {
		t.Fatalf("un simple réordonnancement a été compté comme un changement (%d)",
			rapport.Produits.AChanger)
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// LE RAPPORT TRAVERSE JSON SANS PIÈGE
// ═══════════════════════════════════════════════════════════════════════════

// TestAucunTableauNulDansLeRapport — le gardien d'un défaut qui n'existe QUE
// de l'autre côté du JSON, et qui a été rencontré en production le 6 septembre
// 2026 : « Cannot read properties of null (reading 'length') », au premier
// écart calculé.
//
// En Go, un slice nil et un slice vide se comportent pareil — `len()` rend 0
// sur les deux, `range` ne tourne pas, et aucun test Go ne les distingue. Mais
// `encoding/json` sérialise le premier en `null` et le second en `[]`, et
// l'écran fait `.length` dessus. Un cas parfaitement invisible d'ici, qui ne
// casse que chez l'utilisateur.
//
// Le test porte sur le cas le plus banal — deux bases identiques, donc AUCUN
// exemple à rendre —, parce que c'est justement celui où tous les slices sont
// vides d'un coup.
func TestAucunTableauNulDansLeRapport(t *testing.T) {
	cible := nouvelleAppDeTest(t)
	monterCatalogue(t, cible)
	poser(t, cible.Dao(), "products", "prod000000000a", map[string]any{
		"name": "Ampli", "slug": "ampli", "status": "published",
	})

	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "products", "prod000000000a", map[string]any{
		"name": "Ampli", "slug": "ampli", "status": "published",
	})

	rapport, err := RestaurerSelectivement(cible, figerEnSnapshot(t, source),
		"snap-test", OptionsSelectif{AvecMenu: true})
	if err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}

	brut, err := json.Marshal(rapport)
	if err != nil {
		t.Fatalf("sérialisation : %v", err)
	}

	// On relit le JSON tel que le navigateur le recevra, et on refuse tout
	// tableau nul, à n'importe quelle profondeur.
	var arbre any
	if err := json.Unmarshal(brut, &arbre); err != nil {
		t.Fatalf("relecture : %v", err)
	}

	var verifier func(chemin string, valeur any)
	verifier = func(chemin string, valeur any) {
		objet, ok := valeur.(map[string]any)
		if !ok {
			return
		}
		for cle, v := range objet {
			sous := chemin + "." + cle
			if v == nil {
				// Seuls les champs déclarés comme pouvant manquer ont le droit
				// d'être nuls. `menu` en fait partie : il vaut nil quand la
				// case n'est pas cochée, et l'écran teste sa présence.
				if cle == "menu" {
					continue
				}
				t.Errorf("%s est null — si c'est un tableau, l'écran fera .length dessus", sous)
				continue
			}
			verifier(sous, v)
			if liste, ok := v.([]any); ok {
				for i, element := range liste {
					verifier(fmt.Sprintf("%s[%d]", sous, i), element)
				}
			}
		}
	}
	verifier("rapport", arbre)
}

// ═══════════════════════════════════════════════════════════════════════════
// LE SNAPSHOT NE S'ÉCRIT PAS
// ═══════════════════════════════════════════════════════════════════════════

// TestSnapshotOuvertEnLectureSeule — la règle « une seule connexion en
// écriture » de CLAUDE.md tient parce que SQLite refuse, pas parce qu'on
// s'abstient.
func TestSnapshotOuvertEnLectureSeule(t *testing.T) {
	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "categories", "cat00000000001", map[string]any{"name": "A"})

	chemin := figerEnSnapshot(t, source)

	db, err := OuvrirSnapshotLectureSeule(chemin)
	if err != nil {
		t.Fatalf("ouverture : %v", err)
	}
	defer db.Close()

	var nom string
	if err := db.NewQuery("SELECT name FROM categories LIMIT 1").Row(&nom); err != nil {
		t.Fatalf("lecture : %v", err)
	}
	if nom != "A" {
		t.Fatalf("nom lu = %q", nom)
	}

	if _, err := db.NewQuery("UPDATE categories SET name = 'piraté'").Execute(); err == nil {
		t.Fatal("le snapshot a accepté une écriture")
	}

	// Aucun journal à côté : rien qui puisse être confondu avec la base en
	// service, ni traîner après coup.
	for _, suffixe := range []string{"-wal", "-shm"} {
		if _, err := os.Stat(chemin + suffixe); err == nil {
			t.Errorf("le fichier %s a été créé à côté du snapshot", chemin+suffixe)
		}
	}
}

// TestSnapshotInexistantEchoueTot — mieux vaut une erreur à l'ouverture qu'au
// milieu du calcul d'écart.
func TestSnapshotInexistantEchoueTot(t *testing.T) {
	if _, err := OuvrirSnapshotLectureSeule(filepath.Join(t.TempDir(), "absent.db")); err == nil {
		t.Fatal("un snapshot absent a été ouvert")
	}

	pasUneBase := filepath.Join(t.TempDir(), "faux.db")
	if err := os.WriteFile(pasUneBase, []byte("ceci n'est pas une base"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := OuvrirSnapshotLectureSeule(pasUneBase); err == nil {
		t.Fatal("un fichier qui n'est pas une base SQLite a été ouvert sans erreur")
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// LE MENU
// ═══════════════════════════════════════════════════════════════════════════

// TestMenuRemplaceEnEntier — le seul endroit qui crée et supprime, et il ne le
// fait QUE sur demande.
func TestMenuRemplaceEnEntier(t *testing.T) {
	cible := nouvelleAppDeTest(t)
	monterCatalogue(t, cible)
	poser(t, cible.Dao(), "site_menu", "menu0000000001", map[string]any{
		"title": "Accueil", "link_type": "manual", "link_url": "/", "position": 0,
	})
	poser(t, cible.Dao(), "site_menu", "menu0000000009", map[string]any{
		"title": "Entrée à retirer", "link_type": "none", "position": 1,
	})

	source := nouvelleAppDeTest(t)
	monterCatalogue(t, source)
	poser(t, source.Dao(), "site_menu", "menu0000000001", map[string]any{
		"title": "Accueil du magasin", "link_type": "manual", "link_url": "/", "position": 0,
	})
	poser(t, source.Dao(), "site_menu", "menu0000000002", map[string]any{
		"title": "Guitares", "link_type": "category", "ref_id": "cat00000000001", "position": 1,
	})
	// Un enfant, pour vérifier que le rattachement survit à la recréation.
	poser(t, source.Dao(), "site_menu", "menu0000000003", map[string]any{
		"title": "Acoustiques", "link_type": "none", "position": 0,
		"parent": "menu0000000002",
	})

	snapshot := figerEnSnapshot(t, source)

	// ── Sans la case cochée, le menu ne bouge pas ──────────────────────────
	if _, err := RestaurerSelectivement(cible, snapshot, "snap-test",
		OptionsSelectif{Appliquer: true, DossierSauvegarde: t.TempDir()}); err != nil {
		t.Fatalf("RestaurerSelectivement : %v", err)
	}
	if _, err := cible.Dao().FindRecordById("site_menu", "menu0000000009"); err != nil {
		t.Fatal("le menu a été touché sans que la case soit cochée")
	}

	// ── Avec la case cochée ────────────────────────────────────────────────
	rapport, err := RestaurerSelectivement(cible, snapshot, "snap-test",
		OptionsSelectif{Appliquer: true, AvecMenu: true, DossierSauvegarde: t.TempDir()})
	if err != nil {
		t.Fatalf("RestaurerSelectivement (menu) : %v", err)
	}
	if rapport.Menu == nil {
		t.Fatal("aucun écart de menu rendu")
	}
	if rapport.Menu.ACreer != 2 || rapport.Menu.ASupprimer != 1 || rapport.Menu.AMettreAJour != 1 {
		t.Errorf("écart de menu inattendu : %+v", *rapport.Menu)
	}

	if got := lireFiche(t, cible, "site_menu", "menu0000000001").GetString("title"); got != "Accueil du magasin" {
		t.Errorf("titre = %q", got)
	}
	enfant := lireFiche(t, cible, "site_menu", "menu0000000003")
	if got := enfant.GetString("parent"); got != "menu0000000002" {
		t.Errorf("le rattachement n'a pas survécu à la recréation : parent = %q", got)
	}
	if _, err := cible.Dao().FindRecordById("site_menu", "menu0000000009"); err == nil {
		t.Error("l'entrée surnuméraire n'a pas été retirée")
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// LE FICHIER DE TRAVAIL
// ═══════════════════════════════════════════════════════════════════════════

// TestCheminDeTravailRefuseUnIdentifiantQuiEstUnChemin — l'identifiant vient
// du serveur et nomme un fichier ; il ne doit pas pouvoir en désigner un autre.
func TestCheminDeTravailRefuseUnIdentifiantQuiEstUnChemin(t *testing.T) {
	dataDir := t.TempDir()
	for _, mauvais := range []string{"", "..", "../../data", `a\b`, "a/b", "C:evil"} {
		if _, err := CheminSnapshotDeTravail(dataDir, mauvais); err == nil {
			t.Errorf("identifiant %q accepté", mauvais)
		}
	}
	chemin, err := CheminSnapshotDeTravail(dataDir, "20260906T101500Z-a1b2c3d4")
	if err != nil {
		t.Fatalf("identifiant légitime refusé : %v", err)
	}
	if filepath.Dir(chemin) != filepath.Join(dataDir, DossierTravailSelectif) {
		t.Errorf("chemin hors du dossier de travail : %s", chemin)
	}
}

// TestPurgeDuTravail — un snapshot déchiffré est la base du client EN CLAIR :
// il ne doit pas rester sur le disque.
func TestPurgeDuTravail(t *testing.T) {
	dataDir := t.TempDir()
	racine := filepath.Join(dataDir, DossierTravailSelectif)
	if err := os.MkdirAll(racine, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, nom := range []string{"a.db", "b.db"} {
		if err := os.WriteFile(filepath.Join(racine, nom), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	n, err := PurgerTravailSelectif(dataDir, "")
	if err != nil {
		t.Fatalf("purge : %v", err)
	}
	if n != 2 {
		t.Fatalf("effacés = %d, attendu 2", n)
	}

	// Sur un dossier absent, la purge n'est pas une erreur : elle n'a rien à
	// faire, et ce n'est pas un incident.
	if _, err := PurgerTravailSelectif(t.TempDir(), ""); err != nil {
		t.Fatalf("purge sur dossier absent : %v", err)
	}
}
