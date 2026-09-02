// backend/backup/apres_z_test.go
//
// Gardien du déclenchement après rapport Z.
//
// Ce que ce test vérifie, et qu'aucune relecture ne peut établir : que
// `OnModelAfterCreate("z_reports")` se déclenche RÉELLEMENT quand un Z est
// scellé par du Go — pas par l'API REST. C'est le chemin réel
// (`saveZReport`, backend/reports/cash_reports.go), et le hook de requête
// l'aurait manqué.
//
// Il vérifie aussi les deux règles qui protègent la caisse :
//   - l'amortisseur, sans lequel un rejeu de 60 rapports (`z-repair`)
//     déclencherait 60 sauvegardes ;
//   - le fait que la création du Z RÉUSSIT même quand la sauvegarde échoue —
//     un rapport Z est un document fiscal, il ne doit jamais dépendre d'un
//     mutualisé joignable.

package backup

import (
	"testing"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
)

// appAvecCollections monte une PocketBase de test portant les deux collections
// dont le planificateur a besoin : `app_settings` (où vivent les réglages) et
// `z_reports` (dont la création déclenche le hook).
func appAvecCollections(t *testing.T) *pocketbase.PocketBase {
	t.Helper()
	app := nouvelleAppDeTest(t)

	for nom, champs := range map[string]map[string]string{
		"app_settings": {
			"key":       schema.FieldTypeText,
			"value":     schema.FieldTypeText,
			"encrypted": schema.FieldTypeBool,
		},
		"z_reports": {
			"number": schema.FieldTypeText,
			"date":   schema.FieldTypeText,
		},
	} {
		col := &models.Collection{Name: nom, Type: models.CollectionTypeBase}
		for champ, typ := range champs {
			col.Schema.AddField(&schema.SchemaField{Name: champ, Type: typ})
		}
		if err := app.Dao().SaveCollection(col); err != nil {
			t.Fatalf("création de %s : %v", nom, err)
		}
	}
	return app
}

func scellerZ(t *testing.T, app *pocketbase.PocketBase, numero string) {
	t.Helper()
	col, err := app.Dao().FindCollectionByNameOrId("z_reports")
	if err != nil {
		t.Fatalf("collection z_reports : %v", err)
	}
	rec := models.NewRecord(col)
	rec.Set("number", numero)
	rec.Set("date", "2026-09-02")

	// SaveRecord, c'est-à-dire le chemin RÉEL : une écriture Go par Dao(),
	// exactement comme saveZReport. Un hook de requête ne la verrait pas.
	if err := app.Dao().SaveRecord(rec); err != nil {
		// La création d'un Z ne doit jamais échouer à cause de la sauvegarde.
		t.Fatalf("le rapport Z n'a pas pu être scellé : %v", err)
	}
}

// attendre laisse la goroutine du hook faire son travail.
func attendre(t *testing.T, condition func() bool, limite time.Duration) bool {
	t.Helper()
	echeance := time.Now().Add(limite)
	for time.Now().Before(echeance) {
		if condition() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return condition()
}

func TestSauvegardeDeclencheeParUnZ(t *testing.T) {
	// Délais raccourcis : on teste le déclenchement, pas la patience.
	delaiOriginal, amortiOriginal := delaiApresZ, amortiApresZ
	delaiApresZ, amortiApresZ = 10*time.Millisecond, 30*time.Minute
	t.Cleanup(func() { delaiApresZ, amortiApresZ = delaiOriginal, amortiOriginal })

	app := appAvecCollections(t)
	p := NouveauPlanificateur(app, "test")
	p.SurRapportZ(app)

	scellerZ(t, app, "Z-001")

	// Aucune URL de sauvegarde n'est configurée : la tentative ÉCHOUE, et
	// c'est précisément ce qui la rend observable. L'état porte alors une
	// erreur — preuve que le hook a bien atteint Executer().
	ok := attendre(t, func() bool {
		return p.LireEtat().DerniereErreur != ""
	}, 5*time.Second)

	if !ok {
		t.Fatal("le rapport Z n'a déclenché aucune tentative de sauvegarde")
	}
	t.Logf("tentative observée : %s", p.LireEtat().DerniereErreur)
}

// TestAmortisseurApresZ : c'est lui qui empêche qu'un rejeu de 60 rapports
// (backend/cmd/z-repair) déclenche 60 sauvegardes.
func TestAmortisseurApresZ(t *testing.T) {
	delaiOriginal, amortiOriginal := delaiApresZ, amortiApresZ
	delaiApresZ, amortiApresZ = 10*time.Millisecond, 30*time.Minute
	t.Cleanup(func() { delaiApresZ, amortiApresZ = delaiOriginal, amortiOriginal })

	app := appAvecCollections(t)
	p := NouveauPlanificateur(app, "test")

	// On feint une sauvegarde réussie à l'instant : l'amortisseur doit alors
	// refuser toute nouvelle tentative.
	p.ecrireEtat(EtatSauvegarde{
		DernierSucces: time.Now().UTC().Format(time.RFC3339),
		DernierIDSnap: "20260902T120000Z-aaaaaaaa",
	})

	p.SurRapportZ(app)
	scellerZ(t, app, "Z-002")

	// Si l'amortisseur ne jouait pas, une tentative aurait lieu et échouerait,
	// écrivant une erreur dans l'état.
	time.Sleep(300 * time.Millisecond)

	if err := p.LireEtat().DerniereErreur; err != "" {
		t.Fatalf("une sauvegarde a été tentée malgré une réussite récente : %s", err)
	}
	if p.LireEtat().DernierIDSnap != "20260902T120000Z-aaaaaaaa" {
		t.Fatal("l'état a été écrasé alors qu'aucune sauvegarde ne devait avoir lieu")
	}
}

// TestZScelleMemeSiLaSauvegardeEchoue : la règle la plus importante des trois.
// Un rapport Z est un document fiscal ; il ne doit jamais dépendre de la
// joignabilité d'un serveur.
func TestZScelleMemeSiLaSauvegardeEchoue(t *testing.T) {
	delaiOriginal := delaiApresZ
	delaiApresZ = time.Millisecond
	t.Cleanup(func() { delaiApresZ = delaiOriginal })

	app := appAvecCollections(t)
	p := NouveauPlanificateur(app, "test")
	p.SurRapportZ(app)

	// scellerZ échoue le test si SaveRecord rend une erreur : c'est l'assertion.
	scellerZ(t, app, "Z-003")

	relu, err := app.Dao().FindFirstRecordByFilter("z_reports", "number = 'Z-003'")
	if err != nil || relu == nil {
		t.Fatalf("le rapport Z n'est pas en base après la clôture : %v", err)
	}
}
