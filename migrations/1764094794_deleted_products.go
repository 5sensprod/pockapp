package migrations

import (
	"encoding/json"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/daos"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
)

func init() {
	m.Register(func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("pbc_products_001")
		if err != nil {
			return err
		}

		return dao.DeleteCollection(collection)
	}, func(db dbx.Builder) error {
		jsonData := `{
			"id": "pbc_products_001",
			"created": "2025-11-25 17:51:49.640Z",
			"updated": "2025-11-25 17:51:49.640Z",
			"name": "products",
			"type": "base",
			"system": false,
			"schema": [
				{
					"system": false,
					"id": "text_name_001",
					"name": "name",
					"type": "text",
					"required": true,
					"presentable": true,
					"unique": false,
					"options": {
						"min": 1,
						"max": 200,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_barcode_001",
					"name": "barcode",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": 50,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "number_price_001",
					"name": "price",
					"type": "number",
					"required": true,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": null,
						"noDecimal": false
					}
				},
				{
					"system": false,
					"id": "number_stock_001",
					"name": "stock",
					"type": "number",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": null,
						"noDecimal": true
					}
				},
				{
					"system": false,
					"id": "relation_category_001",
					"name": "category",
					"type": "relation",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"collectionId": "pbc_categories_001",
						"cascadeDelete": false,
						"minSelect": null,
						"maxSelect": 1,
						"displayFields": [
							"name"
						]
					}
				},
				{
					"system": false,
					"id": "file_image_001",
					"name": "image",
					"type": "file",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"mimeTypes": [
							"image/jpeg",
							"image/png",
							"image/webp"
						],
						"thumbs": [
							"80x80"
						],
						"maxSelect": 1,
						"maxSize": 1048576,
						"protected": false
					}
				},
				{
					"system": false,
					"id": "bool_active_001",
					"name": "active",
					"type": "bool",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {}
				}
			],
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_products_name` + "`" + ` ON ` + "`" + `products` + "`" + ` (` + "`" + `name` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_products_barcode` + "`" + ` ON ` + "`" + `products` + "`" + ` (` + "`" + `barcode` + "`" + `)"
			],
			"listRule": "@request.auth.id != ''",
			"viewRule": "@request.auth.id != ''",
			"createRule": "@request.auth.id != ''",
			"updateRule": "@request.auth.id != ''",
			"deleteRule": "@request.auth.id != ''",
			"options": {}
		}`

		collection := &models.Collection{}
		if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
			return err
		}

		return daos.New(db).SaveCollection(collection)
	})
}
