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
		jsonData := `{
			"id": "pbc_categories_001",
			"created": "2025-11-25 17:32:14.942Z",
			"updated": "2025-11-25 17:32:14.942Z",
			"name": "categories",
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
						"max": 100,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "relation_parent_001",
					"name": "parent",
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
					"id": "number_order_001",
					"name": "order",
					"type": "number",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": null,
						"noDecimal": true
					}
				},
				{
					"system": false,
					"id": "text_icon_001",
					"name": "icon",
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
					"id": "text_color_001",
					"name": "color",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": 20,
						"pattern": ""
					}
				}
			],
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_categories_name` + "`" + ` ON ` + "`" + `categories` + "`" + ` (` + "`" + `name` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_categories_parent` + "`" + ` ON ` + "`" + `categories` + "`" + ` (` + "`" + `parent` + "`" + `)"
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
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("pbc_categories_001")
		if err != nil {
			return err
		}

		return dao.DeleteCollection(collection)
	})
}
