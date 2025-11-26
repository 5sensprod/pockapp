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

		collection, err := dao.FindCollectionByNameOrId("pbc_brands_001")
		if err != nil {
			return err
		}

		// remove
		collection.Schema.RemoveField("kn0szvlb")

		return dao.SaveCollection(collection)
	}, func(db dbx.Builder) error {
		dao := daos.New(db);

		collection, err := dao.FindCollectionByNameOrId("pbc_brands_001")
		if err != nil {
			return err
		}

		// add
		del__system_false_id_relation_company_name_company_type_relation_required_true_presentable_false_unique_false_options_collectionId_pbc_companies_001_cascadeDelete_false_minSelect_null_maxSelect_1_displayFields_name_ := &schema.SchemaField{}
		if err := json.Unmarshal([]byte(`{
			"system": false,
			"id": "kn0szvlb",
			"name": "_system_false_id_relation_company_name_company_type_relation_required_true_presentable_false_unique_false_options_collectionId_pbc_companies_001_cascadeDelete_false_minSelect_null_maxSelect_1_displayFields_name_",
			"type": "json",
			"required": false,
			"presentable": false,
			"unique": false,
			"options": {
				"maxSize": 2000000
			}
		}`), del__system_false_id_relation_company_name_company_type_relation_required_true_presentable_false_unique_false_options_collectionId_pbc_companies_001_cascadeDelete_false_minSelect_null_maxSelect_1_displayFields_name_); err != nil {
			return err
		}
		collection.Schema.AddField(del__system_false_id_relation_company_name_company_type_relation_required_true_presentable_false_unique_false_options_collectionId_pbc_companies_001_cascadeDelete_false_minSelect_null_maxSelect_1_displayFields_name_)

		return dao.SaveCollection(collection)
	})
}
