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
			"id": "pbc_companies_001",
			"created": "2025-11-25 23:34:13.588Z",
			"updated": "2025-11-25 23:34:13.588Z",
			"name": "companies",
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
						"max": 150,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_trade_name_001",
					"name": "trade_name",
					"type": "text",
					"required": false,
					"presentable": true,
					"unique": false,
					"options": {
						"min": 0,
						"max": 150,
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
					"id": "bool_active_001",
					"name": "active",
					"type": "bool",
					"required": false,
					"presentable": true,
					"unique": false,
					"options": {}
				},
				{
					"system": false,
					"id": "bool_is_default_001",
					"name": "is_default",
					"type": "bool",
					"required": false,
					"presentable": true,
					"unique": false,
					"options": {}
				},
				{
					"system": false,
					"id": "text_siren_001",
					"name": "siren",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 20,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_siret_001",
					"name": "siret",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 25,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_vat_001",
					"name": "vat_number",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 32,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_legal_form_001",
					"name": "legal_form",
					"type": "text",
					"required": false,
					"presentable": true,
					"unique": false,
					"options": {
						"min": 0,
						"max": 50,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_rcs_001",
					"name": "rcs",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 100,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_ape_naf_001",
					"name": "ape_naf",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 10,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "num_share_capital_001",
					"name": "share_capital",
					"type": "number",
					"required": false,
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
					"id": "text_address1_001",
					"name": "address_line1",
					"type": "text",
					"required": false,
					"presentable": true,
					"unique": false,
					"options": {
						"min": 0,
						"max": 255,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_address2_001",
					"name": "address_line2",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 255,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_zip_001",
					"name": "zip_code",
					"type": "text",
					"required": false,
					"presentable": true,
					"unique": false,
					"options": {
						"min": 0,
						"max": 20,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_city_001",
					"name": "city",
					"type": "text",
					"required": false,
					"presentable": true,
					"unique": false,
					"options": {
						"min": 0,
						"max": 100,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_country_001",
					"name": "country",
					"type": "text",
					"required": false,
					"presentable": true,
					"unique": false,
					"options": {
						"min": 0,
						"max": 100,
						"pattern": ""
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
						"min": 0,
						"max": 30,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "email_001",
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
					"id": "url_website_001",
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
					"id": "text_bank_name_001",
					"name": "bank_name",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 100,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_iban_001",
					"name": "iban",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 50,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_bic_001",
					"name": "bic",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 20,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_account_holder_001",
					"name": "account_holder",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 150,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "num_payment_terms_001",
					"name": "default_payment_terms_days",
					"type": "number",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 365,
						"noDecimal": true
					}
				},
				{
					"system": false,
					"id": "select_payment_method_001",
					"name": "default_payment_method",
					"type": "select",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"maxSelect": 1,
						"values": [
							"virement",
							"cb",
							"especes",
							"cheque",
							"autre"
						]
					}
				},
				{
					"system": false,
					"id": "text_invoice_footer_001",
					"name": "invoice_footer",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 1000,
						"pattern": ""
					}
				},
				{
					"system": false,
					"id": "text_invoice_prefix_001",
					"name": "invoice_prefix",
					"type": "text",
					"required": false,
					"presentable": false,
					"unique": false,
					"options": {
						"min": 0,
						"max": 20,
						"pattern": ""
					}
				}
			],
			"indexes": [
				"CREATE INDEX ` + "`" + `idx_companies_name` + "`" + ` ON ` + "`" + `companies` + "`" + ` (` + "`" + `name` + "`" + `)"
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

		collection, err := dao.FindCollectionByNameOrId("pbc_companies_001")
		if err != nil {
			return err
		}

		return dao.DeleteCollection(collection)
	})
}
