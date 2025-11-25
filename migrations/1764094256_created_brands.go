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
			"id": "pbc_brands_001",
			"created": "2025-11-25 18:10:56.719Z",
			"updated": "2025-11-25 18:10:56.719Z",
			"name": "brands",
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
					"id": "file_logo_001",
					"name": "logo",
					"type": "file",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"mimeTypes": [
							"image/jpeg",
							"image/png",
							"image/webp",
							"image/svg+xml"
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
					"id": "text_website_001",
					"name": "website",
					"type": "url",
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
					"id": "text_description_001",
					"name": "description",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": null,
						"max": 500,
						"pattern": ""
					}
				}
			],
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_brands_name` + "`" + ` ON ` + "`" + `brands` + "`" + ` (` + "`" + `name` + "`" + `)"
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

		collection, err := dao.FindCollectionByNameOrId("pbc_brands_001")
		if err != nil {
			return err
		}

		return dao.DeleteCollection(collection)
	})
}
