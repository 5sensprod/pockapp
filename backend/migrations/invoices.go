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
						// "multi" = paiement fractionné (split payment, tickets POS uniquement)
						Values: []string{"virement", "cb", "especes", "cheque", "autre", "multi"},
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
					Name:    "vat_breakdown",
					Type:    schema.FieldTypeJson,
					Options: &schema.JsonOptions{MaxSize: 65536}, // 64KB suffisant
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

				// ✅ AJOUT: Champs de remise (purement informatifs pour le PDF)
				&schema.SchemaField{
					Name: "cart_discount_mode",
					Type: schema.FieldTypeSelect,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"percent", "amount"},
					},
				},
				&schema.SchemaField{
					Name:    "cart_discount_value",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "cart_discount_ttc",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "line_discounts_total_ttc",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
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

				// === Remboursements (support partiel) ===
				&schema.SchemaField{
					Name: "refund_type",
					Type: schema.FieldTypeSelect,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"full", "partial"},
					},
				},
				&schema.SchemaField{
					Name:    "refunded_items",
					Type:    schema.FieldTypeJson,
					Options: &schema.JsonOptions{MaxSize: 1048576},
				},
				&schema.SchemaField{
					Name: "refund_method",
					Type: schema.FieldTypeSelect,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values:    []string{"virement", "cb", "especes", "cheque", "autre"},
					},
				},
				&schema.SchemaField{
					Name: "has_credit_note",
					Type: schema.FieldTypeBool,
				},
				&schema.SchemaField{
					Name:    "credit_notes_total",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},
				&schema.SchemaField{
					Name:    "remaining_amount",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
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

				&schema.SchemaField{
					Name: "sold_by",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						CollectionId:  "_pb_users_auth_",
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

	// 🔧 FIX split payment: ajouter "multi" aux valeurs autorisées de payment_method
	// "multi" = paiement fractionné (plusieurs moyens sur un même ticket POS)
	if f := collection.Schema.GetFieldByName("payment_method"); f != nil {
		if opts, ok := f.Options.(*schema.SelectOptions); ok {
			hasMulti := false
			for _, v := range opts.Values {
				if v == "multi" {
					hasMulti = true
					break
				}
			}
			if !hasMulti {
				opts.Values = append(opts.Values, "multi")
				changed = true
				log.Println("🛠 Fix payment_method: ajout de la valeur multi (split payment)")
			}
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

	// 5bis) sold_by -> users
	if f := collection.Schema.GetFieldByName("sold_by"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "sold_by",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  "_pb_users_auth_",
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		})
		changed = true
		log.Println("🛠 Ajout du champ sold_by -> users")
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 🆕 6) Champs de remise (si absents)
	// ═══════════════════════════════════════════════════════════════════════════

	// cart_discount_mode
	if f := collection.Schema.GetFieldByName("cart_discount_mode"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "cart_discount_mode",
			Type: schema.FieldTypeSelect,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values:    []string{"percent", "amount"},
			},
		})
		changed = true
		log.Println("🛠 Ajout du champ cart_discount_mode")
	}

	// cart_discount_value
	if f := collection.Schema.GetFieldByName("cart_discount_value"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "cart_discount_value",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		changed = true
		log.Println("🛠 Ajout du champ cart_discount_value")
	}

	// cart_discount_ttc
	if f := collection.Schema.GetFieldByName("cart_discount_ttc"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "cart_discount_ttc",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		changed = true
		log.Println("🛠 Ajout du champ cart_discount_ttc")
	}

	// line_discounts_total_ttc
	if f := collection.Schema.GetFieldByName("line_discounts_total_ttc"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "line_discounts_total_ttc",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		changed = true
		log.Println("🛠 Ajout du champ line_discounts_total_ttc")
	}

	// vat_breakdown (ventilation TVA par taux)
	if f := collection.Schema.GetFieldByName("vat_breakdown"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "vat_breakdown",
			Type:    schema.FieldTypeJson,
			Options: &schema.JsonOptions{MaxSize: 65536},
		})
		changed = true
		log.Println("🛠 Ajout du champ vat_breakdown (JSON)")
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// 🆕 7) Champs remboursements (support remboursement partiel)
	// ═══════════════════════════════════════════════════════════════════════════

	// refund_type (select: full|partial) - Type de remboursement (pour les avoirs)
	if f := collection.Schema.GetFieldByName("refund_type"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "refund_type",
			Type: schema.FieldTypeSelect,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values:    []string{"full", "partial"},
			},
		})
		changed = true
		log.Println("🛠 Ajout du champ refund_type")
	}

	// refunded_items (json) - Détail des items remboursés (si partiel)
	if f := collection.Schema.GetFieldByName("refunded_items"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "refunded_items",
			Type:    schema.FieldTypeJson,
			Options: &schema.JsonOptions{MaxSize: 1048576},
		})
		changed = true
		log.Println("🛠 Ajout du champ refunded_items")
	}

	// refund_method (select: mêmes valeurs que payment_method) - Méthode de remboursement
	if f := collection.Schema.GetFieldByName("refund_method"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "refund_method",
			Type: schema.FieldTypeSelect,
			Options: &schema.SelectOptions{
				MaxSelect: 1,
				Values:    []string{"virement", "cb", "especes", "cheque", "autre"},
			},
		})
		changed = true
		log.Println("🛠 Ajout du champ refund_method")
	}

	// has_credit_note (bool) - Indique si le document a un/des avoirs liés
	if f := collection.Schema.GetFieldByName("has_credit_note"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "has_credit_note",
			Type: schema.FieldTypeBool,
		})
		changed = true
		log.Println("🛠 Ajout du champ has_credit_note")
	}

	// credit_notes_total (number) - Somme des montants d'avoirs (valeur absolue)
	if f := collection.Schema.GetFieldByName("credit_notes_total"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "credit_notes_total",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		changed = true
		log.Println("🛠 Ajout du champ credit_notes_total")
	}

	// remaining_amount (number) - Montant restant après avoirs
	if f := collection.Schema.GetFieldByName("remaining_amount"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "remaining_amount",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{},
		})
		changed = true
		log.Println("🛠 Ajout du champ remaining_amount")
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
	if _, err := app.Dao().DB().NewQuery(`
    UPDATE invoices 
    SET remaining_amount = total_ttc,
        credit_notes_total = COALESCE(credit_notes_total, 0),
        has_credit_note = COALESCE(has_credit_note, FALSE)
    WHERE is_pos_ticket = TRUE 
      AND invoice_type = 'invoice'
      AND (remaining_amount IS NULL OR remaining_amount = 0)
      AND (credit_notes_total IS NULL OR credit_notes_total = 0)
`).Execute(); err == nil {
		log.Println("🛠 Fix remaining_amount = total_ttc sur tickets existants")
	}
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
