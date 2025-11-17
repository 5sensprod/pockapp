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
			"id": "pbc_customers_001",
			"created": "2025-11-17 14:25:58.539Z",
			"updated": "2025-11-17 14:25:58.539Z",
			"name": "customers",
			"type": "base",
			"system": false,
			"schema": [
				{
					"system": false,
					"id": "text_name_001",
					"name": "name",
					"type": "text",
					"required": true,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 2,
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
						"max": null,
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
					"id": "text_company_001",
					"name": "company",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": null,
						"pattern": ""
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
						"max": null,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "select_tags_001",
					"name": "tags",
					"type": "select",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"maxSelect": 4,
						"values": [
							"vip",
							"prospect",
							"actif",
							"inactif"
						]
					}
				},
				{
					"system": false,
					"id": "file_avatar_001",
					"name": "avatar",
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
							"100x100"
						],
						"maxSelect": 1,
						"maxSize": 2097152,
						"protected": false
					}
				}
			],
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_customers_email` + "`" + ` ON ` + "`" + `customers` + "`" + ` (` + "`" + `email` + "`" + `)",
				"CREATE INDEX ` + "`" + `idx_customers_name` + "`" + ` ON ` + "`" + `customers` + "`" + ` (` + "`" + `name` + "`" + `)"
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

		collection, err := dao.FindCollectionByNameOrId("pbc_customers_001")
		if err != nil {
			return err
		}

		return dao.DeleteCollection(collection)
	})
}
