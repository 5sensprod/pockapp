// backend/migrations/orders.go
// Collection "orders" — Bons de commande (BC-YYYY-XXXX)
// Numérotation générée par hook OnRecordBeforeCreate (voir order_hooks.go)

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

func ensureOrdersCollection(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("orders")
	if err != nil {
		// ── Récupérer les collections liées ──────────────────────────────────
		companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
		if err != nil {
			return err
		}
		customersCol, err := app.Dao().FindCollectionByNameOrId("customers")
		if err != nil {
			return err
		}

		log.Println("📦 Création de la collection 'orders' (bons de commande)...")

		collection = &models.Collection{
			Name:       "orders",
			Type:       models.CollectionTypeBase,
			ListRule:   types.Pointer("@request.auth.id != ''"),
			ViewRule:   types.Pointer("@request.auth.id != ''"),
			CreateRule: types.Pointer("@request.auth.id != ''"),
			UpdateRule: types.Pointer("@request.auth.id != ''"),
			DeleteRule: types.Pointer("@request.auth.id != ''"),
			Schema: schema.NewSchema(

				// ── Identification ──────────────────────────────────────────
				// number = NOT Required : généré automatiquement par le hook
				&schema.SchemaField{
					Name:     "number",
					Type:     schema.FieldTypeText,
					Required: false,
					Unique:   true,
					Options:  &schema.TextOptions{Max: types.Pointer(50)},
				},

				// fiscal_year stocké pour filtres et génération du numéro
				&schema.SchemaField{
					Name:    "fiscal_year",
					Type:    schema.FieldTypeNumber,
					Options: &schema.NumberOptions{},
				},

				// ── Statut workflow ─────────────────────────────────────────
				&schema.SchemaField{
					Name:     "status",
					Type:     schema.FieldTypeSelect,
					Required: true,
					Options: &schema.SelectOptions{
						MaxSelect: 1,
						Values: []string{
							"draft",       // Brouillon
							"confirmed",   // Confirmé (contrat formé)
							"in_progress", // En cours d'exécution
							"delivered",   // Livré / prestation réalisée
							"billed",      // Facturé
							"cancelled",   // Annulé
						},
					},
				},

				// ── Relations ───────────────────────────────────────────────
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

				// Vendeur / commercial émetteur
				&schema.SchemaField{
					Name: "issued_by",
					Type: schema.FieldTypeRelation,
					Options: &schema.RelationOptions{
						CollectionId:  "_pb_users_auth_",
						MaxSelect:     types.Pointer(1),
						CascadeDelete: false,
					},
				},

				// ── Snapshot contractuel ────────────────────────────────────
				// On stocke le nom du client au moment de la création
				// pour éviter les problèmes si le client est renommé
				&schema.SchemaField{
					Name:    "customer_name",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(255)},
				},

				// ── Lignes (JSON, même pattern que invoices/quotes) ─────────
				&schema.SchemaField{
					Name:     "items",
					Type:     schema.FieldTypeJson,
					Required: true,
					Options:  &schema.JsonOptions{MaxSize: 1048576}, // 1MB
				},

				// ── Totaux ──────────────────────────────────────────────────
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

				// ── Conditions ──────────────────────────────────────────────
				&schema.SchemaField{
					Name:    "payment_conditions",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(500)},
				},
				&schema.SchemaField{
					Name:    "delivery_conditions",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(500)},
				},
				&schema.SchemaField{
					Name:    "notes",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(2000)},
				},

				// ── Traçabilité (relations vers d'autres documents) ─────────
				// Devis d'origine si le bon a été généré depuis un devis
				&schema.SchemaField{
					Name:    "source_quote_id",
					Type:    schema.FieldTypeText, // Text simple (pas Relation) pour éviter les dépendances circulaires
					Options: &schema.TextOptions{Max: types.Pointer(50)},
				},
				// Facture liée si le bon a été facturé
				&schema.SchemaField{
					Name:    "invoice_id",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(50)},
				},
				// Motif d'annulation
				&schema.SchemaField{
					Name:    "cancellation_reason",
					Type:    schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(500)},
				},

				// ── Dates métier ────────────────────────────────────────────
				&schema.SchemaField{
					Name: "confirmed_at",
					Type: schema.FieldTypeDate,
				},
				&schema.SchemaField{
					Name: "delivered_at",
					Type: schema.FieldTypeDate,
				},
				&schema.SchemaField{
					Name: "billed_at",
					Type: schema.FieldTypeDate,
				},
				&schema.SchemaField{
					Name: "cancelled_at",
					Type: schema.FieldTypeDate,
				},
			),
		}

		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'orders' créée")
		return nil
	}

	// ── Collection existante : vérification / mise à jour du schéma ──────────
	log.Println("📦 Collection 'orders' existe déjà, vérification du schéma...")
	changed := false

	// S'assurer que number n'est pas Required (généré par hook)
	if f := collection.Schema.GetFieldByName("number"); f != nil && f.Required {
		f.Required = false
		changed = true
		log.Println("🛠 Fix orders.number.Required -> false")
	}

	// Ajouter issued_by si absent
	if f := collection.Schema.GetFieldByName("issued_by"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name: "issued_by",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  "_pb_users_auth_",
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		})
		changed = true
		log.Println("🛠 Ajout orders.issued_by -> users")
	}

	// Ajouter customer_name si absent
	if f := collection.Schema.GetFieldByName("customer_name"); f == nil {
		collection.Schema.AddField(&schema.SchemaField{
			Name:    "customer_name",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(255)},
		})
		changed = true
		log.Println("🛠 Ajout orders.customer_name")
	}

	if changed {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'orders' mise à jour")
	} else {
		log.Println("✅ Collection 'orders' OK")
	}

	return nil
}
