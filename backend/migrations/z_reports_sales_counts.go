// backend/migrations/z_reports_sales_counts.go
// Ticket S-1 — le Z dit combien de documents de vente il agrège
// (frontend/modules/cash/PocketCash-docs/06-le-z-v4-et-les-compteurs.md).
//
// ⚠️ Même règle que AddCollectedToZReports : ensureZReportsCollection sort dès
// que la collection existe par son nom, elle ne met donc JAMAIS à niveau une
// base déjà installée. Cette migration doit être INSCRITE dans RunMigrations
// (migrations.go) — une migration non inscrite ne s'exécute jamais, sans erreur.

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddSalesCountsToZReports scinde invoice_count en ses deux populations.
//
// invoice_count vaut, et continue de valoir, le nombre de documents de la
// ligne 1 — les ventes du jour. Il mêlait deux choses que le commerçant compte
// séparément : les TICKETS passés en caisse (is_pos_ticket = true, rattachés à
// une session du Z) et les FACTURES hors caisse émises ET encaissées le même
// jour (is_pos_ticket = false, classées LigneVentesDuJour).
//
// Invariant, et il est testé : pos_ticket_count + external_invoice_count =
// invoice_count. Les avoirs n'entrent dans aucun des trois, les conversions de
// ticket non plus (z_lignes.go, estConversionDeTicket).
func AddSalesCountsToZReports(app *pocketbase.PocketBase) error {
	dao := app.Dao()

	collection, err := dao.FindCollectionByNameOrId("z_reports")
	if err != nil {
		log.Println("⚠️ Collection z_reports introuvable, AddSalesCountsToZReports ignorée")
		return nil
	}

	nombres := []string{
		"pos_ticket_count",       // tickets de caisse des sessions du Z
		"external_invoice_count", // factures hors caisse de la ligne 1
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

	if ajoutes == 0 {
		log.Println("✅ z_reports : compteurs de vente déjà présents")
		return nil
	}

	if err := dao.SaveCollection(collection); err != nil {
		return err
	}

	log.Printf("✅ z_reports : %d compteurs de vente ajoutés\n", ajoutes)
	return nil
}

// AddSalesDocumentsToZReports stocke, dans le rapport, la LISTE des documents
// de la ligne 1 — le détail derrière pos_ticket_count + external_invoice_count.
//
// Elle est stockée et non rechargée à l'affichage : jusqu'ici le PDF listait
// les tickets en interrogeant /api/pos/session/:id/tickets au moment de
// l'impression (usePrintReport.tsx). Un document modifié après la clôture
// changeait donc le PDF sans rompre le hash du Z — exactement ce que la chaîne
// d'intégrité existe pour interdire.
//
// 1 Mio, comme full_report : une pièce pèse ~200 octets, un Z étalé sur
// plusieurs journées en porte quelques dizaines.
func AddSalesDocumentsToZReports(app *pocketbase.PocketBase) error {
	dao := app.Dao()

	collection, err := dao.FindCollectionByNameOrId("z_reports")
	if err != nil {
		log.Println("⚠️ Collection z_reports introuvable, AddSalesDocumentsToZReports ignorée")
		return nil
	}

	if collection.Schema.GetFieldByName("sales_documents") != nil {
		log.Println("✅ z_reports : sales_documents déjà présent")
		return nil
	}

	collection.Schema.AddField(&schema.SchemaField{
		Name:    "sales_documents",
		Type:    schema.FieldTypeJson,
		Options: &schema.JsonOptions{MaxSize: 1048576},
	})

	if err := dao.SaveCollection(collection); err != nil {
		return err
	}

	log.Println("✅ z_reports : sales_documents ajouté")
	return nil
}
