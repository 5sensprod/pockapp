package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensureInvoicesCollection crée ou met à jour la collection invoices (ISCA-compliant v2)
// Avec is_paid séparé du statut
// 🔢 MODIFIÉ: number n'est plus Required (généré par le hook backend)
// 🆕 AJOUT: Champs conversion TIK → Facture
// 🔧 FIX: Relations session/cash_register avec IDs corrects
func ensureInvoicesCollection(app *pocketbase.PocketBase) error {
	// On essaie d'abord de trouver la collection existante
	collection, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		// Elle n'existe pas encore : on la crée
		log.Println("📦 Création de la collection 'invoices' (ISCA v2)...")

		companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return err
		}

		customersCol, err := app.Dao().FindCollectionByNameOrId("customers")
		if err != nil {
			return err
		}

		// 🔧 FIX: Récupérer les IDs des collections de caisse AVANT la création
		var cashSessionsColId string
		var cashRegistersColId string

		if cashSessionsCol, err := app.Dao().FindCollectionByNameOrId("cash_sessions"); err == nil {
			cashSessionsColId = cashSessionsCol.Id
		}
		if cashRegistersCol, err := app.Dao().FindCollectionByNameOrId("cash_registers"); err == nil {
			cashRegistersColId = cashRegistersCol.Id
		}

		collection = &models.Collection{
			Name:       "invoices",
			Type:       models.CollectionTypeBase,
			ListRule:   types.Pointer("@request.auth.id != ''"),
			ViewRule:   types.Pointer("@request.auth.id != ''"),
			CreateRule: types.Pointer("@request.auth.id != ''"),
			UpdateRule: types.Pointer("@request.auth.id != ''"),
			DeleteRule: types.Pointer("@request.auth.id != ''"),
			Schema: schema.NewSchema(
				// === Identification ===
				&schema.SchemaField{
					Name:     "number",
					Type:     schema.FieldTypeText,
					Required: false, // 🔢 MODIFIÉ: généré par le hook backend
					Unique:   true,
					Options:  &schema.TextOptions{Max: types.Pointer(50)},
				},
				&schema.SchemaField{
					Name:     "invoice_type",
					Type:     schema.FieldTypeSelect,
					Required: true,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"invoice", "credit_note"},
					},
				},

				// === Dates ===
				&schema.SchemaField{
					Name:     "date",
					Type:     schema.FieldTypeDate,
					Required: true,
				},
				&schema.SchemaField{
					Name: "due_date",
					Type: schema.FieldTypeDate,
				},

				// === Relations ===
				&schema.SchemaField{
					Name:     "customer",
					Type:     schema.FieldTypeRelation,
					Required: true,
					Options: &schema.RelationOptions{
						CollectionId:  customersCol.Id,
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
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

				// === Statut workflow (SANS "paid") ===
				&schema.SchemaField{
					Name:     "status",
					Type:     schema.FieldTypeSelect,
					Required: true,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"draft", "validated", "sent"},
					},
				},

				// === Paiement (SÉPARÉ du statut) ===
				&schema.SchemaField{
					Name: "is_paid",
					Type: schema.FieldTypeBool,
				},
				&schema.SchemaField{
					Name: "paid_at",
					Type: schema.FieldTypeDate,
				},
				&schema.SchemaField{
					Name: "payment_method",
					Type: schema.FieldTypeSelect,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"virement", "cb", "especes", "cheque", "autre"},
					},
				},

				// === Contenu ===
				&schema.SchemaField{
					Name:     "items",
					Type:     schema.FieldTypeJson,
					Required: true,
					Options:  &schema.JsonOptions{MaxSize: 1048576},
				},
				&schema.SchemaField{
					Name:     "total_ht",
					Type:     schema.FieldTypeNumber,
					Required: true,
					Options:  &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:     "total_tva",
					Type:     schema.FieldTypeNumber,
					Required: true,
					Options:  &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:     "total_ttc",
					Type:     schema.FieldTypeNumber,
					Required: true,
					Options:  &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:     "currency",
					Type:     schema.FieldTypeText,
					Required: true,
					Options:  &schema.TextOptions{Max: types.Pointer(10)},
				},
				&schema.SchemaField{
					Name:    "notes",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(2000)},
				},

				// === ISCA - Traçabilité (générés par hooks) ===
				&schema.SchemaField{
					Name: "sequence_number",
					Type: schema.FieldTypeNumber,
				},
				&schema.SchemaField{
					Name: "fiscal_year",
					Type: schema.FieldTypeNumber,
				},
				&schema.SchemaField{
					Name:    "hash",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(64)},
				},
				&schema.SchemaField{
					Name:    "previous_hash",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(64)},
				},
				&schema.SchemaField{
					Name: "is_locked",
					Type: schema.FieldTypeBool,
				},

				// === Avoirs ===
				&schema.SchemaField{
					Name: "original_invoice_id",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						// CollectionId fixé juste après la création
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
				&schema.SchemaField{
					Name:    "cancellation_reason",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(500)},
				},

				// === Clôture ===
				&schema.SchemaField{
					Name: "closure_id",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						// CollectionId fixé plus tard quand closures existe
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},

				// === Caisse === 🔧 FIX: Utiliser les IDs, pas les noms !
				&schema.SchemaField{
					Name: "session",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						CollectionId:  cashSessionsColId, // 🔧 FIX: Utiliser l'ID
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
				&schema.SchemaField{
					Name: "cash_register",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						CollectionId:  cashRegistersColId, // 🔧 FIX: Utiliser l'ID
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},

				// === 🆕 Conversion TIK → Facture ===
				&schema.SchemaField{
					Name: "converted_to_invoice",
					Type: schema.FieldTypeBool,
				},
				&schema.SchemaField{
					Name: "converted_invoice_id",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						// Self-relation (fixé après création)
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},
				&schema.SchemaField{
					Name: "is_pos_ticket",
					Type: schema.FieldTypeBool,
				},
			),
		}

		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'invoices' créée (ISCA v2 + TIK→FAC)")
	} else {
		log.Println("📦 Collection 'invoices' existe déjà, vérification du schéma...")
	}

	// À partir de là, collection existe forcément.
	changed := false

	// 🔢 NOUVEAU: S'assurer que le champ number n'est pas Required
	if f := collection.Schema.GetFieldByName("number"); f != nil {
		if f.Required {
			f.Required = false
			changed = true
			log.Println("🛠 Fix number.Required -> false (généré par hook)")
		}
	}

	// 1) Fixer la self-relation original_invoice_id → invoices
	if f := collection.Schema.GetFieldByName("original_invoice_id"); f != nil {
		if opts, ok := f.Options.(*schema.RelationOptions); ok {
			if opts.CollectionId == "" {
				opts.CollectionId = collection.Id
				changed = true
				log.Println("🛠 Fix original_invoice_id.CollectionId -> invoices")
			}
		}
	}

	// 2) Fixer closure_id → closures (si la collection closures existe)
	if closuresCol, err := app.Dao().FindCollectionByNameOrId("closures"); err == nil {
		if f := collection.Schema.GetFieldByName("closure_id"); f != nil {
			if opts, ok := f.Options.(*schema.RelationOptions); ok {
				if opts.CollectionId == "" {
					opts.CollectionId = closuresCol.Id
					changed = true
					log.Println("🛠 Fix closure_id.CollectionId -> closures")
				}
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 🔧 FIX CRITIQUE: Corriger/Ajouter les relations session et cash_register
	// ═══════════════════════════════════════════════════════════════════════════

	// 3) Champ session → cash_sessions
	if cashSessionsCol, err := app.Dao().FindCollectionByNameOrId("cash_sessions"); err == nil {
		if f := collection.Schema.GetFieldByName("session"); f != nil {
			// Le champ existe → vérifier/corriger le CollectionId
			if opts, ok := f.Options.(*schema.RelationOptions); ok {
				if opts.CollectionId != cashSessionsCol.Id {
					log.Printf("🔧 FIX: session.CollectionId invalide (%s), correction vers %s",
						opts.CollectionId, cashSessionsCol.Id)
					opts.CollectionId = cashSessionsCol.Id
					changed = true
				}
			}
		} else {
			// Le champ n'existe pas → l'ajouter
			collection.Schema.AddField(&schema.SchemaField{
				Name: "session",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  cashSessionsCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			})
			changed = true
			log.Println("🛠 Ajout du champ session -> cash_sessions")
		}
	}

	// 4) Champ cash_register → cash_registers
	if cashRegistersCol, err := app.Dao().FindCollectionByNameOrId("cash_registers"); err == nil {
		if f := collection.Schema.GetFieldByName("cash_register"); f != nil {
			// Le champ existe → vérifier/corriger le CollectionId
			if opts, ok := f.Options.(*schema.RelationOptions); ok {
				if opts.CollectionId != cashRegistersCol.Id {
					log.Printf("🔧 FIX: cash_register.CollectionId invalide (%s), correction vers %s",
						opts.CollectionId, cashRegistersCol.Id)
					opts.CollectionId = cashRegistersCol.Id
					changed = true
				}
			}
		} else {
			// Le champ n'existe pas → l'ajouter
			collection.Schema.AddField(&schema.SchemaField{
				Name: "cash_register",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  cashRegistersCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			})
			changed = true
			log.Println("🛠 Ajout du champ cash_register -> cash_registers")
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 🆕 5) Champs conversion TIK → Facture
	// ═══════════════════════════════════════════════════════════════════════════

	// converted_to_invoice (bool) - Ticket converti en facture ?
	if f := collection.Schema.GetFieldByName("converted_to_invoice"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "converted_to_invoice",
			Type: schema.FieldTypeBool,
		})
		changed = true
		log.Println("🛠 Ajout du champ converted_to_invoice (bool)")
	}

	// converted_invoice_id (relation self) - ID de la facture générée
	if f := collection.Schema.GetFieldByName("converted_invoice_id"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "converted_invoice_id",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  collection.Id, // Self-relation
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		})
		changed = true
		log.Println("🛠 Ajout du champ converted_invoice_id -> invoices (self)")
	}

	// is_pos_ticket (bool) - Ticket POS (TIK-) ou facture standard (FAC-) ?
	if f := collection.Schema.GetFieldByName("is_pos_ticket"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "is_pos_ticket",
			Type: schema.FieldTypeBool,
		})
		changed = true
		log.Println("🛠 Ajout du champ is_pos_ticket (bool)")
	}

	// Sauvegarde si nécessaire
	if changed {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'invoices' mise à jour (schéma corrigé + TIK→FAC)")
	} else {
		log.Println("✅ Collection 'invoices' OK (aucune modification nécessaire)")
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 🆕 6) Mettre à jour les données existantes (une seule fois)
	// ═══════════════════════════════════════════════════════════════════════════

	// Marquer les tickets existants (TIK-*) comme tickets POS
	if _, err := app.Dao().DB().NewQuery(`
	UPDATE invoices 
	SET is_pos_ticket = TRUE 
	WHERE number LIKE 'TIK-%'
`).Execute(); err == nil {
		log.Println("🛠 Tickets TIK-* marqués comme is_pos_ticket=true")
	}

	// Marquer TOUTES les factures
	if _, err := app.Dao().DB().NewQuery(`
	UPDATE invoices 
	SET is_pos_ticket = FALSE 
	WHERE (number LIKE 'FAC-%' OR number LIKE 'DEV-%' OR number LIKE 'AVO-%')
`).Execute(); err == nil {
		log.Println("🛠 Factures FAC-* marquées comme is_pos_ticket=false")
	}

	return nil
}
