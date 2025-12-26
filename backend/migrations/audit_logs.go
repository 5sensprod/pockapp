package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION - Ajouter "ticket" dans entity_type (pour bases existantes)
// ═══════════════════════════════════════════════════════════════════════════

// MigrateAuditLogsAddTicketEntityType ajoute "ticket" et les nouvelles actions
// dans la collection audit_logs existante. Fonction idempotente.
func MigrateAuditLogsAddTicketEntityType(app *pocketbase.PocketBase) error {
	log.Println("🔧 Migration: Vérification audit_logs...")

	collection, err := app.Dao().FindCollectionByNameOrId("audit_logs")
	if err != nil {
		log.Println("⚠️ Collection audit_logs introuvable, migration ignorée")
		return nil
	}

	modified := false

	// 1. Ajouter "ticket" dans entity_type
	entityTypeField := collection.Schema.GetFieldByName("entity_type")
	if entityTypeField != nil {
		if options, ok := entityTypeField.Options.(*schema.SelectOptions); ok {
			hasTicket := false
			for _, v := range options.Values {
				if v == "ticket" {
					hasTicket = true
					break
				}
			}
			if !hasTicket {
				options.Values = append(options.Values, "ticket")
				entityTypeField.Options = options
				modified = true
				log.Println("   ✅ 'ticket' ajouté à entity_type")
			}
		}
	}

	// 2. Ajouter les nouvelles actions
	actionField := collection.Schema.GetFieldByName("action")
	if actionField != nil {
		if options, ok := actionField.Options.(*schema.SelectOptions); ok {
			newActions := []string{"ticket_created", "ticket_validated", "z_report_generated"}
			for _, newAction := range newActions {
				found := false
				for _, v := range options.Values {
					if v == newAction {
						found = true
						break
					}
				}
				if !found {
					options.Values = append(options.Values, newAction)
					modified = true
					log.Printf("   ✅ '%s' ajouté aux actions", newAction)
				}
			}
			actionField.Options = options
		}
	}

	// Sauvegarder si modifié
	if modified {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Migration audit_logs terminée")
	} else {
		log.Println("✅ audit_logs déjà à jour")
	}

	return nil
}

// ═══════════════════════════════════════════════════════════════════════════
// CRÉATION DE LA COLLECTION (pour nouvelles installations)
// ═══════════════════════════════════════════════════════════════════════════

// ensureAuditLogsCollection crée la collection audit_logs si elle n'existe pas
// Les logs d'audit sont immuables (pas d'update/delete)
func ensureAuditLogsCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("audit_logs"); err == nil {
		log.Println("📦 Collection 'audit_logs' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'audit_logs'...")

	collection := &models.Collection{
		Name:       "audit_logs",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: nil, // Immuable
		DeleteRule: nil, // Immuable
		Schema: schema.NewSchema(
			// === Action effectuée ===
			&schema.SchemaField{
				Name:     "action",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values: []string{
						// Factures B2B
						"invoice_created",
						"invoice_validated",
						"invoice_sent",
						// Tickets POS
						"ticket_created",
						"ticket_validated",
						// Paiements
						"payment_recorded",
						// Avoirs
						"credit_note_created",
						// Clôtures et rapports
						"closure_performed",
						"z_report_generated",
						// Vérifications
						"integrity_check",
						// Exports
						"export_generated",
						"pdf_generated",
					},
				},
			},

			// === Entité concernée ===
			&schema.SchemaField{
				Name:     "entity_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"invoice", "ticket", "credit_note", "closure"},
				},
			},
			&schema.SchemaField{
				Name:     "entity_id",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "entity_number",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},

			// === Entreprise ===
			&schema.SchemaField{
				Name:     "owner_company",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  companiesCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},

			// === Utilisateur ===
			&schema.SchemaField{
				Name: "user_id",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  "_pb_users_auth_",
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name:    "user_email",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},

			// === Contexte technique ===
			&schema.SchemaField{
				Name:    "ip_address",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(45)},
			},
			&schema.SchemaField{
				Name:    "user_agent",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(500)},
			},

			// === Détails de l'action ===
			&schema.SchemaField{
				Name:    "details",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 102400},
			},
			&schema.SchemaField{
				Name:    "previous_values",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 102400},
			},
			&schema.SchemaField{
				Name:    "new_values",
				Type:    schema.FieldTypeJson,
				Options: &schema.JsonOptions{MaxSize: 102400},
			},

			// === Intégrité (chaînage des logs) ===
			&schema.SchemaField{
				Name:     "hash",
				Type:     schema.FieldTypeText,
				Required: false,
				Options:  &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name:     "previous_hash",
				Type:     schema.FieldTypeText,
				Required: false,
				Options:  &schema.TextOptions{Max: types.Pointer(64)},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'audit_logs' créée")
	return nil
}

// ═══════════════════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES POUR LES AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════

// GetEntityType détermine le entity_type pour les audit logs
// - "ticket" pour les tickets POS (is_pos_ticket = true)
// - "credit_note" pour les avoirs
// - "invoice" pour les factures B2B
func GetEntityType(record *models.Record) string {
	invoiceType := record.GetString("invoice_type")

	if invoiceType == "credit_note" {
		return "credit_note"
	}

	if record.GetBool("is_pos_ticket") {
		return "ticket"
	}

	return "invoice"
}

// GetAuditAction détermine l'action pour les audit logs
// baseAction = "created", "validated", "sent", etc.
func GetAuditAction(record *models.Record, baseAction string) string {
	invoiceType := record.GetString("invoice_type")

	if invoiceType == "credit_note" {
		return "credit_note_" + baseAction
	}

	if record.GetBool("is_pos_ticket") {
		return "ticket_" + baseAction
	}

	return "invoice_" + baseAction
}
