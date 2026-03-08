// backend/migrations/deposit_migration.go
// Migration pour la gestion des acomptes (factures de type "deposit")
// ⚠️  Safe pour les clients en prod :
//   - Champs number nullable → les enregistrements existants auront 0
//   - Ajout d'une valeur dans un select → non-breaking pour les données existantes

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models/schema"
)

// AddDepositFieldsToInvoices ajoute les champs nécessaires aux acomptes
// sur la collection "invoices" et met à jour les selects concernés.
func AddDepositFieldsToInvoices(app *pocketbase.PocketBase) error {
	log.Println("🏦 Migration: AddDepositFieldsToInvoices...")

	dao := app.Dao()

	// =========================================================================
	// ÉTAPE 1 : Ajouter les 3 champs number sur invoices
	// =========================================================================
	invoicesCol, err := dao.FindCollectionByNameOrId("invoices")
	if err != nil {
		return err
	}

	newFields := []string{
		"deposit_percentage",
		"deposits_total_ttc",
		"balance_due",
	}

	for _, fieldName := range newFields {
		if invoicesCol.Schema.GetFieldByName(fieldName) != nil {
			log.Printf("  ℹ️  Champ %s déjà présent, skip", fieldName)
			continue
		}
		invoicesCol.Schema.AddField(&schema.SchemaField{
			Name:     fieldName,
			Type:     schema.FieldTypeNumber,
			Required: false,
			Options:  &schema.NumberOptions{},
		})
		log.Printf("  ✅ Champ %s ajouté à invoices", fieldName)
	}

	// =========================================================================
	// ÉTAPE 2 : Ajouter "deposit" dans invoice_type (select)
	// =========================================================================
	invoiceTypeField := invoicesCol.Schema.GetFieldByName("invoice_type")
	if invoiceTypeField != nil {
		if err := invoiceTypeField.InitOptions(); err == nil {
			if opts, ok := invoiceTypeField.Options.(*schema.SelectOptions); ok {
				hasDeposit := false
				for _, v := range opts.Values {
					if v == "deposit" {
						hasDeposit = true
						break
					}
				}
				if !hasDeposit {
					opts.Values = append(opts.Values, "deposit")
					log.Println("  ✅ 'deposit' ajouté à invoice_type")
				} else {
					log.Println("  ℹ️  'deposit' déjà présent dans invoice_type")
				}
			}
		}
	}

	if err := dao.SaveCollection(invoicesCol); err != nil {
		return err
	}
	log.Println("  ✅ Collection invoices sauvegardée")

	// =========================================================================
	// ÉTAPE 3 : Mettre à jour audit_logs
	// =========================================================================
	auditCol, err := dao.FindCollectionByNameOrId("audit_logs")
	if err != nil {
		log.Println("  ⚠️  Collection audit_logs introuvable, skip")
		return nil
	}

	// Ajouter les nouvelles actions
	actionField := auditCol.Schema.GetFieldByName("action")
	if actionField != nil {
		if err := actionField.InitOptions(); err == nil {
			if opts, ok := actionField.Options.(*schema.SelectOptions); ok {
				for _, action := range []string{"deposit_created", "balance_invoice_created"} {
					found := false
					for _, v := range opts.Values {
						if v == action {
							found = true
							break
						}
					}
					if !found {
						opts.Values = append(opts.Values, action)
						log.Printf("  ✅ Action '%s' ajoutée à audit_logs.action", action)
					} else {
						log.Printf("  ℹ️  Action '%s' déjà présente", action)
					}
				}
			}
		}
	}

	// Ajouter "deposit" dans entity_type
	entityTypeField := auditCol.Schema.GetFieldByName("entity_type")
	if entityTypeField != nil {
		if err := entityTypeField.InitOptions(); err == nil {
			if opts, ok := entityTypeField.Options.(*schema.SelectOptions); ok {
				hasDeposit := false
				for _, v := range opts.Values {
					if v == "deposit" {
						hasDeposit = true
						break
					}
				}
				if !hasDeposit {
					opts.Values = append(opts.Values, "deposit")
					log.Println("  ✅ 'deposit' ajouté à audit_logs.entity_type")
				}
			}
		}
	}

	if err := dao.SaveCollection(auditCol); err != nil {
		return err
	}
	log.Println("  ✅ Collection audit_logs sauvegardée")

	log.Println("✅ Migration AddDepositFieldsToInvoices terminée")
	return nil
}
