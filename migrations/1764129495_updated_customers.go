package migrations

import (
	"encoding/json"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/daos"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models/schema"
)

func init() {
	m.Register(func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("pbc_customers_001")
		if err != nil {
			return err
		}

		if err := json.Unmarshal([]byte(`[
			"CREATE INDEX ` + "`" + `idx_customers_email` + "`" + ` ON ` + "`" + `customers` + "`" + ` (` + "`" + `email` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_customers_name` + "`" + ` ON ` + "`" + `customers` + "`" + ` (` + "`" + `name` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_customers_owner_company` + "`" + ` ON ` + "`" + `customers` + "`" + ` (` + "`" + `owner_company` + "`" + `)"
		]`), &collection.Indexes); err != nil {
			return err
		}

		// add
		new_owner_company := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
			"system": false,
			"id": "relation_owner_company_customers",
			"name": "owner_company",
			"type": "relation",
			"required": true,
			"presentable": false,
			"unique": false,
			"options": {
				"collectionId": "pbc_companies_001",
				"cascadeDelete": false,
				"minSelect": null,
				"maxSelect": 1,
				"displayFields": [
					"name"
				]
			}
		}`), new_owner_company); err != nil {
			return err
		}
		collection.Schema.AddField(new_owner_company)

		return dao.SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("pbc_customers_001")
		if err != nil {
			return err
		}

		if err := json.Unmarshal([]byte(`[
			"CREATE INDEX ` + "`" + `idx_customers_email` + "`" + ` ON ` + "`" + `customers` + "`" + ` (` + "`" + `email` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_customers_name` + "`" + ` ON ` + "`" + `customers` + "`" + ` (` + "`" + `name` + "`" + `)"
		]`), &collection.Indexes); err != nil {
			return err
		}

		// remove
		collection.Schema.RemoveField("relation_owner_company_customers")

		return dao.SaveCollection(collection)
	})
}
