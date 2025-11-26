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

		collection, err := dao.FindCollectionByNameOrId("pbc_suppliers_001")
		if err != nil {
			return err
		}

		if err := json.Unmarshal([]byte(`[
			"CREATE INDEX ` + "`" + `idx_suppliers_name` + "`" + ` ON ` + "`" + `suppliers` + "`" + ` (` + "`" + `name` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_suppliers_company` + "`" + ` ON ` + "`" + `suppliers` + "`" + ` (` + "`" + `company` + "`" + `)"
		]`), &collection.Indexes); err != nil {
			return err
		}

		// add
		new_company := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
			"system": false,
			"id": "relation_company_suppliers",
			"name": "company",
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
		}`), new_company); err != nil {
			return err
		}
		collection.Schema.AddField(new_company)

		return dao.SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("pbc_suppliers_001")
		if err != nil {
			return err
		}

		if err := json.Unmarshal([]byte(`[
			"CREATE INDEX ` + "`" + `idx_suppliers_name` + "`" + ` ON ` + "`" + `suppliers` + "`" + ` (` + "`" + `name` + "`" + `)"
		]`), &collection.Indexes); err != nil {
			return err
		}

		// remove
		collection.Schema.RemoveField("relation_company_suppliers")

		return dao.SaveCollection(collection)
	})
}
