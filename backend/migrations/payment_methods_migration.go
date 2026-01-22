// backend/migrations/payment_methods_migration.go
// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION - COLLECTION payment_methods
// ═══════════════════════════════════════════════════════════════════════════
// Gestion des moyens de paiement par company avec support des customs
// (carte cadeau, pass culture, chorus, etc.)
// ═══════════════════════════════════════════════════════════════════════════

package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// ensurePaymentMethodsCollection crée la collection payment_methods
func ensurePaymentMethodsCollection(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("payment_methods")
	if err == nil {
		log.Println("✅ Collection 'payment_methods' existe déjà")
		return nil
	}

	log.Println("📦 Création de la collection 'payment_methods'...")

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	collection = &models.Collection{
		Name:       "payment_methods",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != '' && type = 'custom'"), // Seuls les customs peuvent être supprimés
		Schema: schema.NewSchema(
			// === Identification ===
			&schema.SchemaField{
				Name:     "company",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  companiesCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: true, // Si company supprimée, supprimer les moyens customs
				},
			},
			// Code unique par company (ex: "card", "cash", "gift_card")
			&schema.SchemaField{
				Name:     "code",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(50)},
			},
			// Nom affiché (ex: "Carte bancaire", "Pass Culture")
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(100)},
			},
			// Description/note (ex: "Encaissement via terminal Sumup")
			&schema.SchemaField{
				Name:    "description",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(500)},
			},

			// === Type et catégorie ===
			// Type: "default" (non supprimable) ou "custom" (modifiable)
			&schema.SchemaField{
				Name:     "type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"default", "custom"},
				},
			},
			// Catégorie comptable (mapping vers les standards)
			&schema.SchemaField{
				Name:     "accounting_category",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"cash", "card", "check", "transfer", "other"},
				},
			},

			// === État ===
			&schema.SchemaField{
				Name: "enabled",
				Type: schema.FieldTypeBool,
			},
			// Nécessite une session de caisse ouverte (pour espèces uniquement généralement)
			&schema.SchemaField{
				Name: "requires_session",
				Type: schema.FieldTypeBool,
			},

			// === Apparence UI ===
			&schema.SchemaField{
				Name:    "icon",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "color",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
			&schema.SchemaField{
				Name:    "text_color",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
			&schema.SchemaField{
				Name:    "display_order",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		log.Printf("❌ Erreur création collection payment_methods: %v", err)
		return err
	}

	log.Println("✅ Collection 'payment_methods' créée")

	// Créer un index unique sur company + code
	// Note: PocketBase gère cela via les contraintes de schéma
	// Pour forcer l'unicité company+code, on utilisera une validation dans les routes

	return nil
}

// AddPaymentMethodLabelToInvoices ajoute le champ payment_method_label sur invoices
// Ce champ stocke le nom du moyen custom quand payment_method = "autre"
func AddPaymentMethodLabelToInvoices(app *pocketbase.PocketBase) error {
	collection, err := app.Dao().FindCollectionByNameOrId("invoices")
	if err != nil {
		log.Println("⚠️ Collection invoices non trouvée")
		return nil
	}

	// Vérifier si le champ existe déjà
	if f := collection.Schema.GetFieldByName("payment_method_label"); f != nil {
		log.Println("✅ Champ payment_method_label déjà présent sur invoices")
		return nil
	}

	log.Println("🔄 Ajout du champ payment_method_label sur invoices...")

	collection.Schema.AddField(&schema.SchemaField{
		Name:    "payment_method_label",
		Type:    schema.FieldTypeText,
		Options: &schema.TextOptions{Max: types.Pointer(100)},
	})

	if err := app.Dao().SaveCollection(collection); err != nil {
		log.Printf("❌ Erreur ajout payment_method_label: %v", err)
		return err
	}

	log.Println("✅ Champ payment_method_label ajouté à invoices")
	return nil
}

// SeedDefaultPaymentMethods crée les moyens de paiement par défaut pour toutes les companies
func SeedDefaultPaymentMethods(app *pocketbase.PocketBase) error {
	log.Println("🌱 Création des moyens de paiement par défaut...")

	// Récupérer toutes les companies
	companies, err := app.Dao().FindRecordsByFilter("companies", "", "", 0, 0)
	if err != nil {
		log.Println("⚠️ Aucune company trouvée, skip seed")
		return nil
	}

	paymentMethodsCol, err := app.Dao().FindCollectionByNameOrId("payment_methods")
	if err != nil {
		return err
	}

	// Définition des moyens par défaut
	defaultMethods := []map[string]interface{}{
		{
			"code":                "card",
			"name":                "Carte bancaire",
			"description":         "Terminal CB connecté",
			"type":                "default",
			"accounting_category": "card",
			"enabled":             true,
			"requires_session":    false,
			"icon":                "CreditCard",
			"color":               "#1e293b",
			"text_color":          "#ffffff",
			"display_order":       1,
		},
		{
			"code":                "cash",
			"name":                "Espèces",
			"description":         "Rendue monnaie calculée automatiquement",
			"type":                "default",
			"accounting_category": "cash",
			"enabled":             true,
			"requires_session":    true, // Nécessite session ouverte
			"icon":                "Banknote",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       2,
		},
		{
			"code":                "check",
			"name":                "Chèque",
			"description":         "Paiement par chèque bancaire",
			"type":                "default",
			"accounting_category": "check",
			"enabled":             false,
			"requires_session":    false,
			"icon":                "Receipt",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       3,
		},
		{
			"code":                "transfer",
			"name":                "Virement",
			"description":         "Virement bancaire",
			"type":                "default",
			"accounting_category": "transfer",
			"enabled":             false,
			"requires_session":    false,
			"icon":                "ArrowRightLeft",
			"color":               "#f8fafc",
			"text_color":          "#475569",
			"display_order":       4,
		},
	}

	// Créer les moyens pour chaque company
	for _, company := range companies {
		for _, methodData := range defaultMethods {
			// Vérifier si existe déjà
			existing, _ := app.Dao().FindFirstRecordByFilter(
				"payment_methods",
				"company = {:company} && code = {:code}",
				map[string]interface{}{
					"company": company.Id,
					"code":    methodData["code"],
				},
			)
			if existing != nil {
				continue // Déjà créé
			}

			// Créer le record
			record := models.NewRecord(paymentMethodsCol)
			record.Set("company", company.Id)
			for key, value := range methodData {
				record.Set(key, value)
			}

			if err := app.Dao().SaveRecord(record); err != nil {
				log.Printf("⚠️ Erreur création moyen %s pour company %s: %v",
					methodData["code"], company.Id, err)
			}
		}
		log.Printf("✅ Moyens par défaut créés pour company %s", company.Id)
	}

	return nil
}
