package backend

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

// RunMigrations crée les collections nécessaires si elles n'existent pas
func RunMigrations(app *pocketbase.PocketBase) error {
	log.Println("🚀 Démarrage des migrations...")

	migrations := []func(*pocketbase.PocketBase) error{
		ensureCompaniesCollection,
		ensureBrandsCollection,
		ensureCategoriesCollection,
		ensureSuppliersCollection,
		ensureCustomersCollection,
		ensureProductsCollection,
		ensureInvoicesCollection,
		ensureClosuresCollection,
		ensureAuditLogsCollection,
	}

	for _, migrate := range migrations {
		if err := migrate(app); err != nil {
			log.Printf("⚠️ Erreur migration: %v", err)
		}
	}

	log.Println("✅ Migrations terminées")
	return nil
}

// ============================================
// COMPANIES
// ============================================
func ensureCompaniesCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("companies"); err == nil {
		log.Println("📦 Collection 'companies' existe déjà")
		return nil
	}

	log.Println("📦 Création de la collection 'companies'...")

	collection := &models.Collection{
		Name:       "companies",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "trade_name",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name: "logo",
				Type: schema.FieldTypeFile,
				Options: &schema.FileOptions{
					MaxSelect: 1,
					MaxSize:   5242880,
					MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
				},
			},
			&schema.SchemaField{
				Name: "active",
				Type: schema.FieldTypeBool,
			},
			&schema.SchemaField{
				Name: "is_default",
				Type: schema.FieldTypeBool,
			},
			&schema.SchemaField{
				Name:    "siren",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(9)},
			},
			&schema.SchemaField{
				Name:    "siret",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(14)},
			},
			&schema.SchemaField{
				Name:    "vat_number",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
			&schema.SchemaField{
				Name:    "legal_form",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "rcs",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "ape_naf",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(10)},
			},
			&schema.SchemaField{
				Name:    "share_capital",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
			},
			&schema.SchemaField{
				Name:    "address_line1",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "address_line2",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "zip_code",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
			&schema.SchemaField{
				Name:    "city",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},
			&schema.SchemaField{
				Name:    "country",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},
			&schema.SchemaField{
				Name:    "phone",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(30)},
			},
			&schema.SchemaField{
				Name: "email",
				Type: schema.FieldTypeEmail,
			},
			&schema.SchemaField{
				Name: "website",
				Type: schema.FieldTypeUrl,
			},
			&schema.SchemaField{
				Name:    "bank_name",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},
			&schema.SchemaField{
				Name:    "iban",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(34)},
			},
			&schema.SchemaField{
				Name:    "bic",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(11)},
			},
			&schema.SchemaField{
				Name:    "account_holder",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name: "default_payment_terms_days",
				Type: schema.FieldTypeNumber,
				Options: &schema.NumberOptions{
					Min: types.Pointer(0.0),
					Max: types.Pointer(365.0),
				},
			},
			&schema.SchemaField{
				Name: "default_payment_method",
				Type: schema.FieldTypeSelect,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"virement", "cb", "especes", "cheque", "autre"},
				},
			},
			&schema.SchemaField{
				Name:    "invoice_footer",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},
			&schema.SchemaField{
				Name:    "invoice_prefix",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'companies' créée")
	return nil
}

// ============================================
// BRANDS
// ============================================
func ensureBrandsCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("brands"); err == nil {
		log.Println("📦 Collection 'brands' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		log.Println("⚠️ Collection 'companies' non trouvée, skip 'brands'")
		return err
	}

	log.Println("📦 Création de la collection 'brands'...")

	collection := &models.Collection{
		Name:       "brands",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name: "logo",
				Type: schema.FieldTypeFile,
				Options: &schema.FileOptions{
					MaxSelect: 1,
					MaxSize:   2097152,
					MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
				},
			},
			&schema.SchemaField{
				Name:    "description",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(1000)},
			},
			&schema.SchemaField{
				Name: "website",
				Type: schema.FieldTypeUrl,
			},
			&schema.SchemaField{
				Name:     "company",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  companiesCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'brands' créée")
	return nil
}

// ============================================
// CATEGORIES
// ============================================
func ensureCategoriesCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("categories"); err == nil {
		log.Println("📦 Collection 'categories' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'categories'...")

	collection := &models.Collection{
		Name:       "categories",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(100)},
			},
			&schema.SchemaField{
				Name:    "color",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(7)},
			},
			&schema.SchemaField{
				Name:    "icon",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name: "order",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name:     "company",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  companiesCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name: "parent",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  "",
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'categories' créée")
	return nil
}

// ============================================
// SUPPLIERS
// ============================================
func ensureSuppliersCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("suppliers"); err == nil {
		log.Println("📦 Collection 'suppliers' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	brandsCol, err := app.Dao().FindCollectionByNameOrId("brands")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'suppliers'...")

	collection := &models.Collection{
		Name:       "suppliers",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "contact",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name: "email",
				Type: schema.FieldTypeEmail,
			},
			&schema.SchemaField{
				Name:    "phone",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(30)},
			},
			&schema.SchemaField{
				Name:    "address",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(500)},
			},
			&schema.SchemaField{
				Name:    "notes",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},
			&schema.SchemaField{
				Name: "active",
				Type: schema.FieldTypeBool,
			},
			&schema.SchemaField{
				Name:     "company",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  companiesCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name: "brands",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  brandsCol.Id,
					MaxSelect:     nil,
					CascadeDelete: false,
				},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'suppliers' créée")
	return nil
}

// ============================================
// CUSTOMERS
// ============================================
func ensureCustomersCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("customers"); err == nil {
		log.Println("📦 Collection 'customers' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'customers'...")

	collection := &models.Collection{
		Name:       "customers",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name: "email",
				Type: schema.FieldTypeEmail,
			},
			&schema.SchemaField{
				Name:    "phone",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(30)},
			},
			&schema.SchemaField{
				Name:    "address",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(500)},
			},
			&schema.SchemaField{
				Name:    "company",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "notes",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},
			&schema.SchemaField{
				Name: "avatar",
				Type: schema.FieldTypeFile,
				Options: &schema.FileOptions{
					MaxSelect: 1,
					MaxSize:   2097152,
					MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
				},
			},
			&schema.SchemaField{
				Name: "tags",
				Type: schema.FieldTypeSelect,
				Options: &schema.SelectOptions{
					MaxSelect: 10,
					Values:    []string{"vip", "prospect", "actif", "inactif"},
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
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'customers' créée")
	return nil
}

// ============================================
// PRODUCTS
// ============================================
func ensureProductsCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("products"); err == nil {
		log.Println("📦 Collection 'products' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	brandsCol, err := app.Dao().FindCollectionByNameOrId("brands")
	if err != nil {
		return err
	}

	categoriesCol, err := app.Dao().FindCollectionByNameOrId("categories")
	if err != nil {
		return err
	}

	suppliersCol, err := app.Dao().FindCollectionByNameOrId("suppliers")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'products'...")

	collection := &models.Collection{
		Name:       "products",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema: schema.NewSchema(
			&schema.SchemaField{
				Name:     "name",
				Type:     schema.FieldTypeText,
				Required: true,
				Options:  &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "description",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},
			&schema.SchemaField{
				Name:    "sku",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "barcode",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(50)},
			},
			&schema.SchemaField{
				Name:    "price_ht",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
			},
			&schema.SchemaField{
				Name:    "price_ttc",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
			},
			&schema.SchemaField{
				Name:    "cost_price",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
			},
			&schema.SchemaField{
				Name: "tva_rate",
				Type: schema.FieldTypeNumber,
				Options: &schema.NumberOptions{
					Min: types.Pointer(0.0),
					Max: types.Pointer(100.0),
				},
			},
			&schema.SchemaField{
				Name:    "stock_quantity",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{},
			},
			&schema.SchemaField{
				Name:    "stock_min",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
			},
			&schema.SchemaField{
				Name:    "stock_max",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
			},
			&schema.SchemaField{
				Name:    "unit",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
			&schema.SchemaField{
				Name:    "weight",
				Type:    schema.FieldTypeNumber,
				Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
			},
			&schema.SchemaField{
				Name: "active",
				Type: schema.FieldTypeBool,
			},
			&schema.SchemaField{
				Name: "images",
				Type: schema.FieldTypeFile,
				Options: &schema.FileOptions{
					MaxSelect: 10,
					MaxSize:   5242880,
					MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
				},
			},
			&schema.SchemaField{
				Name:     "company",
				Type:     schema.FieldTypeRelation,
				Required: true,
				Options: &schema.RelationOptions{
					CollectionId:  companiesCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name: "brand",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  brandsCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name: "categories",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  categoriesCol.Id,
					MaxSelect:     nil,
					CascadeDelete: false,
				},
			},
			&schema.SchemaField{
				Name: "supplier",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  suppliersCol.Id,
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'products' créée")
	return nil
}

// ============================================
// INVOICES - Collection ISCA-compliant v2
// Avec is_paid séparé du statut
// ============================================
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
					Required: true,
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
					Name: "hash",
					Type: schema.FieldTypeText,
					Options: &schema.TextOptions{Max: types.Pointer(64)},
				},
				&schema.SchemaField{
					Name: "previous_hash",
					Type: schema.FieldTypeText,
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
			),
		}

		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'invoices' créée (ISCA v2)")
	} else {
		log.Println("📦 Collection 'invoices' existe déjà, vérification du schéma...")
	}

	// À partir de là, collection existe forcément.
	changed := false

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

	if changed {
		if err := app.Dao().SaveCollection(collection); err != nil {
			return err
		}
		log.Println("✅ Collection 'invoices' mise à jour (relations corrigées)")
	} else {
		log.Println("✅ Collection 'invoices' OK (aucune modification nécessaire)")
	}

	return nil
}
// ============================================
// CLOSURES - Clôtures périodiques
// ============================================
func ensureClosuresCollection(app *pocketbase.PocketBase) error {
	if _, err := app.Dao().FindCollectionByNameOrId("closures"); err == nil {
		log.Println("📦 Collection 'closures' existe déjà")
		return nil
	}

	companiesCol, err := app.Dao().FindCollectionByNameOrId("companies")
	if err != nil {
		return err
	}

	log.Println("📦 Création de la collection 'closures'...")

	collection := &models.Collection{
		Name:       "closures",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: nil,
		DeleteRule: nil,
		Schema: schema.NewSchema(
			&schema.SchemaField{
				Name:     "closure_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"daily", "monthly", "annual"},
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
			&schema.SchemaField{
				Name:     "period_start",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			&schema.SchemaField{
				Name:     "period_end",
				Type:     schema.FieldTypeDate,
				Required: true,
			},
			&schema.SchemaField{
				Name:     "fiscal_year",
				Type:     schema.FieldTypeNumber,
				Required: true,
			},
			&schema.SchemaField{
				Name: "invoice_count",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "credit_note_count",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "total_ht",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "total_tva",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "total_ttc",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "first_sequence",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name: "last_sequence",
				Type: schema.FieldTypeNumber,
			},
			&schema.SchemaField{
				Name:    "first_hash",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name:    "last_hash",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name:    "cumulative_hash",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name:    "closure_hash",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(64)},
			},
			&schema.SchemaField{
				Name: "closed_by",
				Type: schema.FieldTypeRelation,
				Options: &schema.RelationOptions{
					CollectionId:  "_pb_users_auth_",
					MaxSelect:     types.Pointer(1),
					CascadeDelete: false,
				},
			},
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'closures' créée")
	return nil
}

// ============================================
// AUDIT_LOGS
// ============================================
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
		UpdateRule: nil,
		DeleteRule: nil,
		Schema: schema.NewSchema(
			&schema.SchemaField{
				Name:     "action",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values: []string{
						"invoice_created",
						"invoice_validated",
						"invoice_sent",
						"payment_recorded",
						"credit_note_created",
						"closure_performed",
						"integrity_check",
						"export_generated",
						"pdf_generated",
					},
				},
			},
			&schema.SchemaField{
				Name:     "entity_type",
				Type:     schema.FieldTypeSelect,
				Required: true,
				Options: &schema.SelectOptions{
					MaxSelect: 1,
					Values:    []string{"invoice", "credit_note", "closure"},
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