// backend/migrations/z_reports_collected.go
// Ticket Z-1 — le Z passe au modèle « un total, quatre lignes »
// (frontend/modules/cash/PocketCash-docs/04-refonte-du-z.md, §3 décision 1).
//
// ⚠️ Cette migration est INDISPENSABLE et distincte de ensureZReportsCollection :
// cette dernière sort dès que la collection existe par son nom, elle ne met donc
// jamais à niveau une base déjà installée. Toute évolution du schéma passe par
// une migration à part, INSCRITE dans RunMigrations (migrations.go) — une
// migration non inscrite ne s'exécute jamais, et sans erreur.

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddCollectedToZReports ajoute au rapport Z les champs du total encaissé.
//
// total_ht / total_tva / total_ttc ne changent PAS de nom mais changent de
// contenu : ils portent désormais la seule ligne 1 (ventes du jour), qui est la
// seule grandeur du Z qui soit du chiffre d'affaires. Le reste de l'argent entré
// se lit dans les champs ci-dessous, en TTC seul — c'est ce qui rend une
// addition accidentelle impossible.
//
// schema_version dit sous quelle règle un rapport a été produit : 1 = règle
// d'origine, 2 = contrat du 23 août 2026. Sans lui, un Z relu dans six mois ne
// dirait pas ce que son total_ht recouvre.
func AddCollectedToZReports(app *pocketbase.PocketBase) error {
	dao := app.Dao()

	collection, err := dao.FindCollectionByNameOrId("z_reports")
	if err != nil {
		log.Println("⚠️ Collection z_reports introuvable, AddCollectedToZReports ignorée")
		return nil
	}

	nombres := []string{
		"collected_ttc",                  // ligne 1 + 2 + 3 − 4
		"collected_from_receivables_ttc", // ligne 2 — règlements de factures antérieures
		"collected_deposits_ttc",         // ligne 3 — acomptes, soldes, parentes amputées
		"refunds_ttc",                    // ligne 4 — remboursements, en déduction
	}

	ajoutes := 0
	for _, nom := range nombres {
		if collection.Schema.GetFieldByName(nom) != nil {
			continue
		}
		collection.Schema.AddField(&schema.SchemaField{
			Name:    nom,
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		ajoutes++
	}

	if collection.Schema.GetFieldByName("collected_by_method") == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "collected_by_method",
			Type:    schema.FieldTypeJson,
			Options: &schema.JsonOptions{MaxSize: 65536},
		})
		ajoutes++
	}

	if collection.Schema.GetFieldByName("schema_version") == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "schema_version",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		ajoutes++
	}

	if ajoutes == 0 {
		log.Println("✅ z_reports : champs collected_* déjà présents")
		return nil
	}

	if err := dao.SaveCollection(collection); err != nil {
		return err
	}

	log.Printf("✅ z_reports : %d champs ajoutés (collected_*, refunds_ttc, schema_version)\n", ajoutes)
	return nil
}
