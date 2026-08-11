// backend/catalog/load/loader.go
// ═══════════════════════════════════════════════════════════════════════════
// CHARGEMENT DANS POCKETBASE  (ticket T4)
// ═══════════════════════════════════════════════════════════════════════════
// Écrit le catalogue normalisé dans le PocketBase local, au schéma installé
// par backend/migrations/catalog_v2.go.
//
// C'est le SEUL point de ce chantier qui écrit. NeDB n'est jamais touchée : si
// le chargement se trompe, on relance, la source est intacte.
//
// ── Rejouabilité par purge, pas par convergence ───────────────────────────
//
// Le chargeur VIDE les quatre collections avant d'écrire. C'est la leçon
// directe du défaut trouvé au §9.5 du 09 : les ensure*Collection de catalog.go
// sont idempotentes par sortie anticipée, ce qui produit une convergence
// silencieusement fausse. Une migration qu'on ne peut lancer qu'une fois ne se
// met pas au point (§6.5.2 du rituel).
//
// ── Quarantaine, et pourquoi ce n'est pas un mode dégradé ─────────────────
//
// Les enregistrements porteurs d'une anomalie bloquante sont ÉCARTÉS et
// LISTÉS, pas corrigés, et ils n'empêchent pas les autres de se charger.
//
// Exiger une source propre reviendrait à exiger de modifier AppPos — interdit
// par CLAUDE.md, et la caisse en dépend. Une migration qui l'exige ne pourrait
// jamais tourner sur la production. Voir 10-plan-migration.md §2 bis.
package load

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/tools/filesystem"

	"pocket-react/backend/catalog/normalize"
)

// ── Copie des fichiers image ──────────────────────────────────────────────
//
// Les images d'AppServe sont copiées dans le stockage PocketBase — 2217
// fichiers distincts, 585 Mo. C'est la seule voie qui survive à la disparition
// d'AppServe : `image.src` est un chemin que seul AppServe sait servir, et
// 865 images sur 1710 n'ont aucune URL WordPress de repli.
//
// La copie n'est PAS transactionnelle : SQLite l'est, le disque non. Si la
// transaction est annulée, des fichiers orphelins subsistent dans le stockage.
// Sans conséquence — la purge les efface au rechargement suivant — mais il faut
// le savoir plutôt que de le découvrir.

// files porte le contexte de copie d'une exécution.
type files struct {
	// root est la racine d'AppServe, parent du répertoire `data`. Les `src`
	// sont relatifs à elle : /public/products/… → <root>/public/products/…
	root string
	fsys *filesystem.System
	res  *Result
}

// upload copie un fichier et rend le nom stocké par PocketBase.
// Rend "" si le chemin est vide ou le fichier introuvable — un fichier
// manquant ne doit pas interrompre le chargement, mais il se compte.
func (f *files) upload(record *models.Record, src string) string {
	if src == "" || f == nil {
		return ""
	}
	path := filepath.Join(f.root, filepath.FromSlash(strings.TrimPrefix(src, "/")))
	if _, err := os.Stat(path); err != nil {
		f.res.MissingFiles = append(f.res.MissingFiles, src)
		return ""
	}
	file, err := filesystem.NewFileFromPath(path)
	if err != nil {
		f.res.MissingFiles = append(f.res.MissingFiles, src)
		return ""
	}
	if err := f.fsys.UploadFile(file, record.BaseFilesPath()+"/"+file.Name); err != nil {
		f.res.MissingFiles = append(f.res.MissingFiles, src)
		return ""
	}
	f.res.FilesCopied++
	return file.Name
}

func (f *files) uploadAll(record *models.Record, srcs []string) []string {
	out := make([]string, 0, len(srcs))
	for _, s := range srcs {
		if name := f.upload(record, s); name != "" {
			out = append(out, name)
		}
	}
	return out
}

// purgeOrder — l'inverse des dépendances. external_refs pointe vers les trois
// entités, products vers brands/categories/suppliers, suppliers vers brands.
var purgeOrder = []string{"external_refs", "products", "suppliers", "categories", "brands"}

// Skipped décrit un enregistrement écarté.
type Skipped struct {
	Entity   string
	SourceID string
	Label    string
	Reason   string
}

// Result est le compte rendu du chargement.
type Result struct {
	CompanyID   string
	CompanyName string
	Purged      map[string]int
	Loaded      map[string]int
	Skipped     []Skipped
	// Dropped compte les relations perdues parce que leur cible a été écartée
	// ou n'existe pas. Une relation qui disparaît en silence est une donnée
	// fausse ; elle doit se compter.
	Dropped map[string]int
	// FilesCopied et MissingFiles rendent compte de la copie des images.
	FilesCopied  int
	MissingFiles []string
}

func newResult() *Result {
	return &Result{
		Purged:  map[string]int{},
		Loaded:  map[string]int{},
		Dropped: map[string]int{},
	}
}

func (r *Result) drop(kind string) { r.Dropped[kind]++ }

// SkippedByEntity regroupe les rejets pour l'affichage.
func (r *Result) SkippedByEntity() map[string][]Skipped {
	out := map[string][]Skipped{}
	for _, s := range r.Skipped {
		out[s.Entity] = append(out[s.Entity], s)
	}
	for k := range out {
		sort.Slice(out[k], func(i, j int) bool { return out[k][i].SourceID < out[k][j].SourceID })
	}
	return out
}

// Run charge le catalogue. Tout se fait dans UNE transaction : au moindre
// échec, les quatre collections restent vides plutôt qu'à moitié pleines.
// nedbDir est le répertoire des fichiers .db ; la racine d'AppServe en est le
// parent, et les `src` des images lui sont relatifs.
func Run(app *pocketbase.PocketBase, cat *normalize.Catalog, rep *normalize.Report, nedbDir string) (*Result, error) {
	res := newResult()

	companyID, companyName, err := resolveCompany(app.Dao())
	if err != nil {
		return nil, err
	}
	res.CompanyID, res.CompanyName = companyID, companyName

	fsys, err := app.NewFilesystem()
	if err != nil {
		return nil, fmt.Errorf("ouverture du stockage PocketBase: %w", err)
	}
	defer fsys.Close()
	fl := &files{root: filepath.Dir(nedbDir), fsys: fsys, res: res}

	quarantine := rep.Quarantined()

	err = app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		if err := purge(tx, res, fsys); err != nil {
			return err
		}
		// L'ordre suit les dépendances : une relation ne peut pointer que vers
		// un enregistrement déjà écrit.
		brandIDs, err := loadBrands(tx, cat, res, companyID, quarantine["brands"])
		if err != nil {
			return err
		}
		categoryIDs, err := loadCategories(tx, cat, res, companyID, quarantine["categories"], fl)
		if err != nil {
			return err
		}
		if err := loadSuppliers(tx, cat, res, companyID, quarantine["suppliers"], brandIDs); err != nil {
			return err
		}
		supplierIDs, err := supplierMap(tx, companyID)
		if err != nil {
			return err
		}
		return loadProducts(tx, cat, res, companyID, quarantine["products"], brandIDs, categoryIDs, supplierIDs, fl)
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

// resolveCompany applique la règle du §9.2a du modèle cible : une entreprise et
// une seule. Zéro, c'est un prérequis manquant ; plusieurs, c'est une ambiguïté
// que l'outil ne tranche pas — « choisir la première » mêlerait deux catalogues
// sans bruit. Le cas est impossible aujourd'hui ; il ne le restera pas.
func resolveCompany(dao *daos.Dao) (id, name string, err error) {
	col, err := dao.FindCollectionByNameOrId("companies")
	if err != nil {
		return "", "", fmt.Errorf("collection 'companies' introuvable: %w", err)
	}
	records, err := dao.FindRecordsByExpr(col.Name)
	if err != nil {
		return "", "", err
	}
	switch len(records) {
	case 1:
		return records[0].Id, records[0].GetString("name"), nil
	case 0:
		return "", "", fmt.Errorf("aucune entreprise en base : le catalogue est multi-entreprise " +
			"et `company` est requis. Créer l'entreprise avant de charger")
	default:
		names := make([]string, 0, len(records))
		for _, r := range records {
			names = append(names, fmt.Sprintf("%s (%s)", r.GetString("name"), r.Id))
		}
		return "", "", fmt.Errorf("%d entreprises en base : %v.\n"+
			"   La migration ne choisit pas — préciser laquelle rattacher",
			len(records), names)
	}
}

// purge vide les quatre collections, plus external_refs. Suppression directe :
// c'est une remise à zéro, pas une opération métier, et 2306 suppressions
// unitaires par le DAO coûteraient sans rien apporter.
func purge(tx *daos.Dao, res *Result, fsys *filesystem.System) error {
	for _, name := range purgeOrder {
		col, err := tx.FindCollectionByNameOrId(name)
		if err != nil {
			continue // external_refs peut ne pas exister sur une base ancienne
		}
		// Les fichiers d'une collection vivent sous <collectionId>/. Les
		// effacer avec les enregistrements évite d'accumuler 585 Mo à chaque
		// rechargement.
		if fsys != nil {
			_ = fsys.DeletePrefix(col.Id + "/")
		}
		var n int
		if err := tx.DB().Select("count(*)").From(name).Row(&n); err != nil {
			return fmt.Errorf("purge: comptage de %q: %w", name, err)
		}
		if n == 0 {
			continue
		}
		if _, err := tx.DB().Delete(name, dbx.NewExp("1=1")).Execute(); err != nil {
			return fmt.Errorf("purge de %q: %w", name, err)
		}
		res.Purged[name] = n
	}
	return nil
}

// ── Marques ───────────────────────────────────────────────────────────────

func loadBrands(tx *daos.Dao, cat *normalize.Catalog, res *Result, companyID string, quarantine map[string]string) (map[string]string, error) {
	col, err := tx.FindCollectionByNameOrId("brands")
	if err != nil {
		return nil, err
	}
	ids := make(map[string]string, len(cat.Brands))

	for _, b := range cat.Brands {
		if reason, blocked := quarantine[b.LegacyID]; blocked {
			res.Skipped = append(res.Skipped, Skipped{"brands", b.LegacyID, b.Name, reason})
			continue
		}
		r := models.NewRecord(col)
		r.Set("name", b.Name)
		r.Set("slug", b.Slug)
		r.Set("description", b.Description)
		r.Set("legacy_id", b.LegacyID)
		r.Set("company", companyID)
		if err := tx.SaveRecord(r); err != nil {
			return nil, fmt.Errorf("brands/%s (%s): %w", b.LegacyID, b.Name, err)
		}
		ids[b.LegacyID] = r.Id
		res.Loaded["brands"]++
	}
	return ids, nil
}

// ── Catégories ────────────────────────────────────────────────────────────

func loadCategories(tx *daos.Dao, cat *normalize.Catalog, res *Result, companyID string, quarantine map[string]string, fl *files) (map[string]string, error) {
	col, err := tx.FindCollectionByNameOrId("categories")
	if err != nil {
		return nil, err
	}
	ids := make(map[string]string, len(cat.Categories))
	records := make(map[string]*models.Record, len(cat.Categories))

	// Premier temps : les enregistrements, sans parent. Un arbre ne se charge
	// pas dans l'ordre d'un fichier — un enfant peut précéder son parent.
	for _, c := range cat.Categories {
		if reason, blocked := quarantine[c.LegacyID]; blocked {
			res.Skipped = append(res.Skipped, Skipped{"categories", c.LegacyID, c.Name, reason})
			continue
		}
		r := models.NewRecord(col)
		// L'identifiant doit exister avant la copie : le chemin de stockage
		// d'un fichier est <collectionId>/<recordId>/<nom>.
		r.RefreshId()
		r.Set("name", c.Name)
		r.Set("slug", c.Slug)
		r.Set("description", c.Description)
		r.Set("image", fl.upload(r, c.ImageSrc))
		r.Set("wp_image_url", c.ImageWPURL)
		r.Set("is_featured", c.IsFeatured)
		r.Set("legacy_id", c.LegacyID)
		r.Set("company", companyID)
		if err := tx.SaveRecord(r); err != nil {
			return nil, fmt.Errorf("categories/%s (%s): %w", c.LegacyID, c.Name, err)
		}
		ids[c.LegacyID] = r.Id
		records[c.LegacyID] = r
		res.Loaded["categories"]++
	}

	// Second temps : les parents, toutes les correspondances étant connues.
	for _, c := range cat.Categories {
		if c.ParentLegacyID == "" {
			continue
		}
		r, ok := records[c.LegacyID]
		if !ok {
			continue // écartée
		}
		parentID, ok := ids[c.ParentLegacyID]
		if !ok {
			// Le parent a été écarté : l'enfant remonte à la racine plutôt que
			// de disparaître. Compté, jamais tu.
			res.drop("categories.parent (parent écarté)")
			continue
		}
		r.Set("parent", parentID)
		if err := tx.SaveRecord(r); err != nil {
			return nil, fmt.Errorf("categories/%s parent: %w", c.LegacyID, err)
		}
	}
	return ids, nil
}

// ── Fournisseurs ──────────────────────────────────────────────────────────

func loadSuppliers(tx *daos.Dao, cat *normalize.Catalog, res *Result, companyID string, quarantine map[string]string, brandIDs map[string]string) error {
	col, err := tx.FindCollectionByNameOrId("suppliers")
	if err != nil {
		return err
	}
	for _, s := range cat.Suppliers {
		if reason, blocked := quarantine[s.LegacyID]; blocked {
			res.Skipped = append(res.Skipped, Skipped{"suppliers", s.LegacyID, s.Name, reason})
			continue
		}
		r := models.NewRecord(col)
		r.Set("name", s.Name)
		r.Set("supplier_code", s.SupplierCode)
		r.Set("siren", s.Siren) // vide : le champ n'existe pas dans NeDB
		r.Set("contact_name", s.ContactName)
		r.Set("contact_email", s.ContactEmail)
		r.Set("contact_phone", s.ContactPhone)
		r.Set("contact_address", s.ContactAddress)
		if s.Banking != nil {
			r.Set("banking", s.Banking)
		}
		if s.PaymentTerms != nil {
			r.Set("payment_terms", s.PaymentTerms)
		}
		r.Set("brands", resolve(s.BrandLegacyIDs, brandIDs, res, "suppliers.brands"))
		r.Set("legacy_id", s.LegacyID)
		r.Set("company", companyID)
		if err := tx.SaveRecord(r); err != nil {
			return fmt.Errorf("suppliers/%s (%s): %w", s.LegacyID, s.Name, err)
		}
		res.Loaded["suppliers"]++
	}
	return nil
}

// supplierMap relit les fournisseurs écrits pour obtenir leurs identifiants.
func supplierMap(tx *daos.Dao, companyID string) (map[string]string, error) {
	records, err := tx.FindRecordsByExpr("suppliers", dbx.HashExp{"company": companyID})
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(records))
	for _, r := range records {
		if lid := r.GetString("legacy_id"); lid != "" {
			out[lid] = r.Id
		}
	}
	return out, nil
}

// ── Produits ──────────────────────────────────────────────────────────────

func loadProducts(tx *daos.Dao, cat *normalize.Catalog, res *Result, companyID string, quarantine map[string]string, brandIDs, categoryIDs, supplierIDs map[string]string, fl *files) error {
	col, err := tx.FindCollectionByNameOrId("products")
	if err != nil {
		return err
	}
	for _, p := range cat.Products {
		if reason, blocked := quarantine[p.LegacyID]; blocked {
			res.Skipped = append(res.Skipped, Skipped{"products", p.LegacyID, p.Name, reason})
			continue
		}
		r := models.NewRecord(col)
		r.RefreshId() // voir loadCategories : requis avant la copie des fichiers
		r.Set("name", p.Name)
		r.Set("designation", p.Designati)
		r.Set("sku", p.SKU)
		r.Set("barcode", p.Barcode)
		r.Set("slug", p.Slug)
		r.Set("description", p.Descripti)
		r.Set("type", p.Type)
		r.Set("status", p.Status)
		r.Set("price_ttc", p.PriceTTC)
		r.Set("purchase_price_ht", p.PurchaseH)
		r.Set("tax_rate", p.TaxRate)
		r.Set("stock", p.Stock)
		r.Set("manage_stock", p.ManageStk)
		r.Set("min_stock", p.MinStock)
		r.Set("image", fl.upload(r, p.ImageSrc))
		r.Set("gallery", fl.uploadAll(r, p.GallerySrc))
		r.Set("wp_image_url", p.ImageWPURL)

		if p.BrandLegacyID != "" {
			if id, ok := brandIDs[p.BrandLegacyID]; ok {
				r.Set("brand", id)
			} else {
				res.drop("products.brand (marque écartée ou absente)")
			}
		}
		if p.SupplierLegacyID != "" {
			if id, ok := supplierIDs[p.SupplierLegacyID]; ok {
				r.Set("supplier", id)
			} else {
				res.drop("products.supplier (fournisseur écarté ou absent)")
			}
		}
		r.Set("categories", resolve(p.CategoryLegacyID, categoryIDs, res, "products.categories"))

		r.Set("legacy_id", p.LegacyID)
		r.Set("company", companyID)

		if err := tx.SaveRecord(r); err != nil {
			return fmt.Errorf("products/%s (%s): %w", p.LegacyID, p.Name, err)
		}
		res.Loaded["products"]++
	}
	return nil
}

// resolve traduit une liste d'identifiants NeDB en identifiants PocketBase, et
// compte ce qui se perd en chemin.
func resolve(legacyIDs []string, m map[string]string, res *Result, kind string) []string {
	out := make([]string, 0, len(legacyIDs))
	for _, lid := range legacyIDs {
		if id, ok := m[lid]; ok {
			out = append(out, id)
		} else {
			res.drop(kind + " (cible écartée ou absente)")
		}
	}
	return out
}
