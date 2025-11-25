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
			"id": "pbc_suppliers_001",
			"created": "2025-11-25 18:18:23.202Z",
			"updated": "2025-11-25 18:18:23.202Z",
			"name": "suppliers",
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
					"id": "email_field_001",
					"name": "email",
					"type": "email",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"exceptDomains": null,
						"onlyDomains": null
					}
				},
				{
					"system": false,
					"id": "text_phone_001",
					"name": "phone",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": 30,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_address_001",
					"name": "address",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": 500,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_contact_001",
					"name": "contact",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": 100,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "relation_brands_001",
					"name": "brands",
					"type": "relation",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"collectionId": "pbc_brands_001",
						"cascadeDelete": false,
						"minSelect": null,
						"maxSelect": null,
						"displayFields": [
							"name"
						]
					}
				},
				{
					"system": false,
					"id": "text_notes_001",
					"name": "notes",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": 1000,
						"pattern": ""
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
				"CREATE INDEX ` + "`" + `idx_suppliers_name` + "`" + ` ON ` + "`" + `suppliers` + "`" + ` (` + "`" + `name` + "`" + `)"
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

		collection, err := dao.FindCollectionByNameOrId("pbc_suppliers_001")
		if err != nil {
			return err
		}

		return dao.DeleteCollection(collection)
	})
}
