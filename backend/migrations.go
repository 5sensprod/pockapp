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

	// Ordre important : les collections référencées doivent exister avant celles qui les référencent
	migrations := []func(*pocketbase.PocketBase) error{
		ensureCompaniesCollection,
		ensureBrandsCollection,
		ensureCategoriesCollection,
		ensureSuppliersCollection,
		ensureCustomersCollection,
		ensureProductsCollection,
	}

	for _, migrate := range migrations {
		if err := migrate(app); err != nil {
			log.Printf("⚠️ Erreur migration: %v", err)
			// On continue les autres migrations
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

	// Récupérer l'ID de la collection companies
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
		log.Println("⚠️ Collection 'companies' non trouvée, skip 'categories'")
		return err
	}

	log.Println("📦 Création de la collection 'categories'...")

	// Créer d'abord sans la relation parent (self-reference)
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
				Options:  &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "description",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(1000)},
			},
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
				Name: "order",
				Type: schema.FieldTypeNumber,
				Options: &schema.NumberOptions{
					Min: types.Pointer(0.0),
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
		),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}

	// Maintenant ajouter la relation parent (self-reference)
	categoriesCol, _ := app.Dao().FindCollectionByNameOrId("categories")
	categoriesCol.Schema.AddField(&schema.SchemaField{
		Name: "parent",
		Type: schema.FieldTypeRelation,
		Options: &schema.RelationOptions{
			CollectionId:  categoriesCol.Id,
			MaxSelect:     types.Pointer(1),
			CascadeDelete: false,
		},
	})

	if err := app.Dao().SaveCollection(categoriesCol); err != nil {
		log.Printf("⚠️ Erreur ajout champ parent: %v", err)
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
		log.Println("⚠️ Collection 'brands' non trouvée, skip relation brands")
	}

	log.Println("📦 Création de la collection 'suppliers'...")

	schemaFields := []*schema.SchemaField{
		{
			Name:     "name",
			Type:     schema.FieldTypeText,
			Required: true,
			Options:  &schema.TextOptions{Max: types.Pointer(255)},
		},
		{
			Name:    "code",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(50)},
		},
		{
			Name: "email",
			Type: schema.FieldTypeEmail,
		},
		{
			Name:    "phone",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(30)},
		},
		{
			Name: "website",
			Type: schema.FieldTypeUrl,
		},
		{
			Name:    "address",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(500)},
		},
		{
			Name:    "city",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(100)},
		},
		{
			Name:    "zip_code",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(20)},
		},
		{
			Name:    "country",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(100)},
		},
		{
			Name:    "contact_name",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(255)},
		},
		{
			Name:    "notes",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(2000)},
		},
		{
			Name:     "company",
			Type:     schema.FieldTypeRelation,
			Required: true,
			Options: &schema.RelationOptions{
				CollectionId:  companiesCol.Id,
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		},
	}

	// Ajouter la relation brands si la collection existe
	if brandsCol != nil {
		schemaFields = append(schemaFields, &schema.SchemaField{
			Name: "brands",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  brandsCol.Id,
				CascadeDelete: false,
			},
		})
	}

	collection := &models.Collection{
		Name:       "suppliers",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema:     schema.NewSchema(schemaFields...),
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
				Name:    "company",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(255)},
			},
			&schema.SchemaField{
				Name:    "address",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(500)},
			},
			&schema.SchemaField{
				Name:    "city",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},
			&schema.SchemaField{
				Name:    "zip_code",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(20)},
			},
			&schema.SchemaField{
				Name:    "country",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(100)},
			},
			&schema.SchemaField{
				Name:    "notes",
				Type:    schema.FieldTypeText,
				Options: &schema.TextOptions{Max: types.Pointer(2000)},
			},
			&schema.SchemaField{
				Name: "tags",
				Type: schema.FieldTypeJson,
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

	brandsCol, _ := app.Dao().FindCollectionByNameOrId("brands")
	suppliersCol, _ := app.Dao().FindCollectionByNameOrId("suppliers")
	categoriesCol, _ := app.Dao().FindCollectionByNameOrId("categories")

	log.Println("📦 Création de la collection 'products'...")

	schemaFields := []*schema.SchemaField{
		{
			Name:     "name",
			Type:     schema.FieldTypeText,
			Required: true,
			Options:  &schema.TextOptions{Max: types.Pointer(255)},
		},
		{
			Name:    "sku",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(100)},
		},
		{
			Name:    "barcode",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(50)},
		},
		{
			Name:    "description",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(5000)},
		},
		{
			Name:    "price_ht",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		{
			Name:    "price_ttc",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		{
			Name:    "cost_price",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		{
			Name: "tva_rate",
			Type: schema.FieldTypeNumber,
			Options: &schema.NumberOptions{
				Min: types.Pointer(0.0),
				Max: types.Pointer(100.0),
			},
		},
		{
			Name:    "stock_quantity",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		{
			Name:    "stock_min",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		{
			Name:    "stock_max",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		{
			Name:    "unit",
			Type:    schema.FieldTypeText,
			Options: &schema.TextOptions{Max: types.Pointer(20)},
		},
		{
			Name:    "weight",
			Type:    schema.FieldTypeNumber,
			Options: &schema.NumberOptions{Min: types.Pointer(0.0)},
		},
		{
			Name: "images",
			Type: schema.FieldTypeFile,
			Options: &schema.FileOptions{
				MaxSelect: 10,
				MaxSize:   5242880,
				MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
			},
		},
		{
			Name: "active",
			Type: schema.FieldTypeBool,
		},
		{
			Name:     "company",
			Type:     schema.FieldTypeRelation,
			Required: true,
			Options: &schema.RelationOptions{
				CollectionId:  companiesCol.Id,
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		},
	}

	// Relations optionnelles
	if brandsCol != nil {
		schemaFields = append(schemaFields, &schema.SchemaField{
			Name: "brand",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  brandsCol.Id,
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		})
	}

	if suppliersCol != nil {
		schemaFields = append(schemaFields, &schema.SchemaField{
			Name: "supplier",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  suppliersCol.Id,
				MaxSelect:     types.Pointer(1),
				CascadeDelete: false,
			},
		})
	}

	if categoriesCol != nil {
		schemaFields = append(schemaFields, &schema.SchemaField{
			Name: "categories",
			Type: schema.FieldTypeRelation,
			Options: &schema.RelationOptions{
				CollectionId:  categoriesCol.Id,
				CascadeDelete: false,
			},
		})
	}

	collection := &models.Collection{
		Name:       "products",
		Type:       models.CollectionTypeBase,
		ListRule:   types.Pointer("@request.auth.id != ''"),
		ViewRule:   types.Pointer("@request.auth.id != ''"),
		CreateRule: types.Pointer("@request.auth.id != ''"),
		UpdateRule: types.Pointer("@request.auth.id != ''"),
		DeleteRule: types.Pointer("@request.auth.id != ''"),
		Schema:     schema.NewSchema(schemaFields...),
	}

	if err := app.Dao().SaveCollection(collection); err != nil {
		return err
	}
	log.Println("✅ Collection 'products' créée")
	return nil
}