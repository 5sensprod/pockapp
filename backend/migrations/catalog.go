package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tools/types"
)

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
					CollectionId:  "", // Self-reference, fixé après création
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
					MaxSelect:     nil, // Multiple brands
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
			// === Identification ===
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

			// === Prix ===
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

			// === Stock ===
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

			// === Statut ===
			&schema.SchemaField{
				Name: "active",
				Type: schema.FieldTypeBool,
			},

			// === Images ===
			&schema.SchemaField{
				Name: "images",
				Type: schema.FieldTypeFile,
				Options: &schema.FileOptions{
					MaxSelect: 10,
					MaxSize:   5242880,
					MimeTypes: []string{"image/jpeg", "image/png", "image/webp"},
				},
			},

			// === Relations ===
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
					MaxSelect:     nil, // Multiple categories
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