// backend/catalog/normalize/catalog.go
// ═══════════════════════════════════════════════════════════════════════════
// NORMALISATION VERS LE MODÈLE CIBLE  (ticket T3)
// ═══════════════════════════════════════════════════════════════════════════
// Traduit les documents NeDB bruts vers les structures du modèle cible arrêté
// le 10 août 2026 (09-modele-cible.md, docs/DECISIONS.md).
//
// N'ÉCRIT NULLE PART. Produit des structures en mémoire et un rapport
// d'anomalies. Le chargement est T4.
//
// ── Ce que « normaliser » veut dire ici, et ce que ça ne veut pas dire ────
//
// Normaliser, c'est TRADUIRE : `tax_rate: "20"` devient `20`, `meta_data`
// devient `barcode`, un champ mort n'est pas repris. C'est mécanique, et ça se
// rejoue à l'identique.
//
// Ce n'est PAS réparer : un SKU en doublon reste un doublon, un brand_id
// orphelin reste orphelin. Ces cas partent au rapport. Le rituel est explicite
// (§8 du 08) : « la migration est l'occasion de les identifier, pas de les
// corriger en silence ».
//
// ── Les champs qui ne passent pas, et pourquoi ────────────────────────────
//
// Le détail est dans catalog_v2.go et au §3.1 du 09. En résumé : les six champs
// à zéro document, les caches dénormalisés, les quatre champs WooCommerce (qui
// partent en external_refs, ticket T5), les statistiques de vente (aucun
// lecteur), le modèle promotionnel (fiction), et les marges (calculées).
package normalize

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"pocket-react/backend/catalog/nedb"
)

// ── Structures cibles ─────────────────────────────────────────────────────
// Elles reflètent le schéma installé par catalog_v2.go. `company` n'y figure
// pas : il est résolu au chargement (T4), pas à la normalisation.

type Product struct {
	LegacyID  string
	Name      string
	Designati string // designation
	SKU       string
	Barcode   string
	Slug      string
	Descripti string // description
	Type      string // simple | service
	Status    string // draft | published
	PriceTTC  float64
	PurchaseH float64 // purchase_price_ht
	TaxRate   float64
	Stock     float64
	ManageStk bool
	MinStock  float64

	// Images. `Src` est un chemin AppServe relatif (« /public/products/… ») ;
	// c'est le seul champ toujours présent. `WPURL` est l'URL WordPress, et
	// elle manque sur 865 des 1710 images. Voir l'en-tête de catalog_v2.go.
	ImageSrc   string
	ImageWPURL string
	// GallerySrc exclut l'image principale : les galeries la répètent presque
	// toujours en première position (3554 références pour 2217 fichiers
	// distincts). La stocker deux fois doublerait l'espace pour rien.
	GallerySrc []string

	// Relations, en identifiants NeDB. La résolution vers les identifiants
	// PocketBase se fait au chargement, par la table de correspondance.
	BrandLegacyID    string
	SupplierLegacyID string
	CategoryLegacyID []string

	// Correspondance WooCommerce, mise de côté pour external_refs (T5).
	// Elle ne fait PAS partie du produit : c'est tout l'intérêt du modèle.
	WooID  string
	WooURL string
}

type Category struct {
	LegacyID       string
	Name           string
	Slug           string
	Description    string
	ImageSrc       string
	ImageWPURL     string
	IsFeatured     bool
	ParentLegacyID string
	WooID          string
	WooURL         string
}

type Brand struct {
	LegacyID    string
	Name        string
	Slug        string
	Description string
	ImageSrc    string
	ImageWPURL  string
	WooID       string
	WooURL      string
}

type Supplier struct {
	LegacyID       string
	Name           string
	SupplierCode   string
	Siren          string
	ContactName    string
	ContactEmail   string
	ContactPhone   string
	ContactAddress string
	Banking        map[string]any
	PaymentTerms   map[string]any
	BrandLegacyIDs []string
}

// Catalog est le résultat de la normalisation.
type Catalog struct {
	Products   []Product
	Categories []Category
	Brands     []Brand
	Suppliers  []Supplier
}

// ── Point d'entrée ────────────────────────────────────────────────────────

// Run normalise les quatre collections et produit le rapport d'anomalies.
//
// L'ordre importe : marques et catégories d'abord, pour que les produits
// puissent vérifier leurs relations contre des ensembles déjà connus.
func Run(products, categories, brands, suppliers *nedb.Collection) (*Catalog, *Report) {
	rep := NewReport()
	cat := &Catalog{}

	brandIDs := normalizeBrands(brands, cat, rep)
	categoryIDs := normalizeCategories(categories, cat, rep)
	normalizeSuppliers(suppliers, cat, rep, brandIDs)
	normalizeProducts(products, cat, rep, brandIDs, categoryIDs)

	return cat, rep
}

// ── Marques ───────────────────────────────────────────────────────────────

func normalizeBrands(src *nedb.Collection, out *Catalog, rep *Report) map[string]bool {
	ids := make(map[string]bool, len(src.Docs))
	slugs := NewSlugAllocator()

	for _, d := range src.Docs {
		id := d.ID()
		name := strings.TrimSpace(str(d["name"]))
		if name == "" {
			rep.Add(Blocking, "nom manquant", "brands", id, "la marque n'a pas de nom ; `name` est requis au schéma")
			continue
		}
		ids[id] = true
		imgSrc, imgURL := image(d["image"])
		if imgSrc != "" {
			rep.Count("logos de marque")
		}
		out.Brands = append(out.Brands, Brand{
			LegacyID:    id,
			Name:        name,
			Slug:        slugs.Allocate(id, name, ""),
			Description: strings.TrimSpace(str(d["description"])),
			ImageSrc:    imgSrc,
			ImageWPURL:  imgURL,
			WooID:       numOrStr(d["woo_id"]),
			WooURL:      str(d["website_url"]),
		})
	}
	reportSlugs(rep, "brands", slugs)
	return ids
}

// ── Catégories ────────────────────────────────────────────────────────────

func normalizeCategories(src *nedb.Collection, out *Catalog, rep *Report) map[string]bool {
	ids := make(map[string]bool, len(src.Docs))
	for _, d := range src.Docs {
		ids[d.ID()] = true
	}

	// Le nom du parent sert de contexte de désambiguïsation : « Accessoires »
	// existe deux fois dans l'arbre, et un slug bâti sur le seul nom
	// entrerait en collision.
	nameByID := make(map[string]string, len(src.Docs))
	for _, d := range src.Docs {
		nameByID[d.ID()] = str(d["name"])
	}

	slugs := NewSlugAllocator()
	for _, d := range src.Docs {
		id := d.ID()
		name := strings.TrimSpace(str(d["name"]))
		if name == "" {
			rep.Add(Blocking, "nom manquant", "categories", id, "la catégorie n'a pas de nom ; `name` est requis au schéma")
			continue
		}

		parent := str(d["parent_id"])
		if parent != "" && !ids[parent] {
			rep.Add(Declarative, "parent orphelin", "categories", id,
				fmt.Sprintf("« %s » référence le parent %q, absent du jeu — la relation sera laissée vide", name, parent))
			parent = ""
		}

		imgSrc, imgURL := image(d["image"])
		if imgSrc != "" {
			rep.Count("images de catégorie")
		}
		out.Categories = append(out.Categories, Category{
			LegacyID:       id,
			Name:           name,
			Slug:           slugs.Allocate(id, name, nameByID[parent]),
			Description:    strings.TrimSpace(str(d["description"])),
			ImageSrc:       imgSrc,
			ImageWPURL:     imgURL,
			IsFeatured:     boolean(d["is_featured"]),
			ParentLegacyID: parent,
			WooID:          numOrStr(d["woo_id"]),
			WooURL:         str(d["website_url"]),
		})
	}
	reportSlugs(rep, "categories", slugs)
	return ids
}

// ── Fournisseurs ──────────────────────────────────────────────────────────

func normalizeSuppliers(src *nedb.Collection, out *Catalog, rep *Report, brandIDs map[string]bool) {
	for _, d := range src.Docs {
		id := d.ID()
		name := strings.TrimSpace(str(d["name"]))
		if name == "" {
			rep.Add(Blocking, "nom manquant", "suppliers", id, "le fournisseur n'a pas de nom ; `name` est requis au schéma")
			continue
		}

		s := Supplier{
			LegacyID:     id,
			Name:         name,
			SupplierCode: str(d["supplier_code"]),
			Banking:      object(d["banking"]),
			PaymentTerms: object(d["payment_terms"]),
		}
		// Le contact est mis à plat : le code l'aplatit déjà, et le formulaire
		// le consomme ainsi. Un objet imbriqué serait une régression.
		if c := object(d["contact"]); c != nil {
			s.ContactName = str(c["name"])
			s.ContactEmail = str(c["email"])
			s.ContactPhone = str(c["phone"])
			s.ContactAddress = str(c["address"])
		}
		// `siren` n'existe pas dans NeDB : c'est le seul champ créé par le
		// modèle cible. Il restera vide à la migration, et se saisira ensuite.

		for _, b := range strSlice(d["brands"]) {
			if !brandIDs[b] {
				rep.Add(Declarative, "marque orpheline", "suppliers", id,
					fmt.Sprintf("« %s » référence la marque %q, absente du jeu", name, b))
				continue
			}
			s.BrandLegacyIDs = append(s.BrandLegacyIDs, b)
		}
		out.Suppliers = append(out.Suppliers, s)
	}
}

// ── Produits ──────────────────────────────────────────────────────────────

// placeholderSKU — remplissages d'un champ obligatoire, à traiter comme
// l'absence de SKU. Constaté : « ----- » porté par 3 produits sans rapport
// entre eux (une méthode de batterie, un adaptateur jack, une alimentation).
var placeholderSKU = map[string]bool{
	"-----": true,
	"-":     true,
	"n/a":   true,
	"na":    true,
	".":     true,
}

func normalizeProducts(src *nedb.Collection, out *Catalog, rep *Report, brandIDs, categoryIDs map[string]bool) {
	slugs := NewSlugAllocator()
	skuOwner := map[string]string{} // sku normalisé → premier legacy_id

	for _, d := range src.Docs {
		id := d.ID()
		name := strings.TrimSpace(str(d["name"]))
		if name == "" {
			rep.Add(Blocking, "nom manquant", "products", id, "le produit n'a pas de nom ; `name` est requis au schéma")
			continue
		}

		p := Product{
			LegacyID:  id,
			Name:      name,
			Designati: strings.TrimSpace(str(d["designation"])),
			Descripti: strings.TrimSpace(str(d["description"])),
			WooID:     numOrStr(d["woo_id"]),
			WooURL:    str(d["website_url"]),
		}
		p.ImageSrc, p.ImageWPURL = image(d["image"])
		p.GallerySrc = gallery(d["gallery_images"], p.ImageSrc)
		if p.ImageSrc != "" {
			rep.Count("images principales")
		}
		if n := len(p.GallerySrc); n > 0 {
			rep.Counters["images de galerie (hors principale)"] += n
			rep.Count("produits avec galerie")
		}
		p.Slug = slugs.Allocate(id, name, p.Designati)

		// ── SKU ───────────────────────────────────────────────────────────
		sku := strings.TrimSpace(str(d["sku"]))
		if placeholderSKU[strings.ToLower(sku)] {
			rep.Add(Declarative, "SKU de remplissage", "products", id,
				fmt.Sprintf("« %s » porte le SKU %q, qui n'est pas une référence — normalisé en vide", trunc(name), sku))
			rep.Count("sku vidés")
			sku = ""
		}
		if sku == "" {
			rep.Count("sans SKU")
		} else if first, dup := skuOwner[sku]; dup {
			rep.Add(Blocking, "SKU en doublon", "products", id,
				fmt.Sprintf("SKU %q déjà porté par %s — l'index (company, sku) est unique", sku, first))
		} else {
			skuOwner[sku] = id
		}
		p.SKU = sku

		// ── Code-barres, extrait de meta_data ─────────────────────────────
		// meta_data ne contient qu'une clé, `barcode`, sur 1870 produits.
		// L'enveloppe disparaît, la donnée est promue.
		p.Barcode = extractBarcode(d["meta_data"], rep, id)

		// ── Type et statut, requis au schéma ──────────────────────────────
		p.Type = strings.TrimSpace(strings.ToLower(str(d["type"])))
		switch p.Type {
		case "simple", "service":
		case "":
			rep.Add(Blocking, "type manquant", "products", id, "`type` est requis au schéma (simple | service)")
		default:
			rep.Add(Blocking, "type inconnu", "products", id,
				fmt.Sprintf("`type` vaut %q ; le modèle n'admet que simple et service", p.Type))
		}

		p.Status = strings.TrimSpace(strings.ToLower(str(d["status"])))
		switch p.Status {
		case "draft", "published":
		case "":
			rep.Add(Blocking, "statut manquant", "products", id, "`status` est requis au schéma (draft | published)")
		default:
			rep.Add(Blocking, "statut inconnu", "products", id,
				fmt.Sprintf("`status` vaut %q ; le modèle n'admet que draft et published", p.Status))
		}

		// ── Prix ──────────────────────────────────────────────────────────
		// price est TTC, purchase_price est HT : mesuré sur 648 produits,
		// 636 cohérents avec cette hypothèse, 0 avec l'autre.
		p.PriceTTC = number(d["price"])
		p.PurchaseH = number(d["purchase_price"])

		tax, taxWasString, taxMissing := numberLoose(d["tax_rate"])
		if taxMissing {
			rep.Add(Declarative, "taux de TVA absent", "products", id,
				fmt.Sprintf("« %s » n'a pas de tax_rate — chargé à 0", trunc(name)))
		} else if taxWasString {
			rep.Count("tax_rate convertis depuis une chaîne")
		}
		p.TaxRate = tax

		checkMargin(d, p, rep)

		// ── Stock ─────────────────────────────────────────────────────────
		p.Stock = number(d["stock"])
		p.ManageStk = boolean(d["manage_stock"])
		p.MinStock = number(d["min_stock"])

		// ── Relations ─────────────────────────────────────────────────────
		if b := str(d["brand_id"]); b != "" {
			if brandIDs[b] {
				p.BrandLegacyID = b
			} else {
				rep.Add(Declarative, "marque orpheline", "products", id,
					fmt.Sprintf("« %s » référence la marque %q, absente du jeu — relation laissée vide", trunc(name), b))
			}
		}
		if s := str(d["supplier_id"]); s != "" {
			p.SupplierLegacyID = s // vérifié au chargement, T4
		}
		for _, c := range strSlice(d["categories"]) {
			if categoryIDs[c] {
				p.CategoryLegacyID = append(p.CategoryLegacyID, c)
			} else {
				rep.Add(Declarative, "catégorie orpheline", "products", id,
					fmt.Sprintf("« %s » référence la catégorie %q, absente du jeu — écartée", trunc(name), c))
			}
		}

		// ── Publication : ce que WooCommerce sait et que status ignore ────
		online := p.WooID != ""
		switch {
		case p.Status == "published" && !online:
			rep.Add(Declarative, "publié mais jamais mis en ligne", "products", id,
				fmt.Sprintf("« %s » est published sans woo_id", trunc(name)))
		case p.Status == "draft" && online:
			rep.Add(Declarative, "brouillon pourtant en ligne", "products", id,
				fmt.Sprintf("« %s » est draft mais porte le woo_id %s", trunc(name), p.WooID))
		}
		if online {
			rep.Count("correspondances WooCommerce (futur external_refs)")
		}

		out.Products = append(out.Products, p)
	}
	reportSlugs(rep, "products", slugs)
}

// extractBarcode sort le code-barres de meta_data, et signale tout ce que
// meta_data contiendrait d'autre — l'enveloppe est supprimée, donc une clé
// inattendue serait perdue en silence.
func extractBarcode(v any, rep *Report, id string) string {
	entries, ok := v.([]any)
	if !ok {
		return ""
	}
	var barcode string
	for _, e := range entries {
		m, ok := e.(map[string]any)
		if !ok {
			continue
		}
		key := str(m["key"])
		switch key {
		case "barcode", "ean":
			barcode = strings.TrimSpace(str(m["value"]))
		default:
			rep.Add(Declarative, "clé meta_data non reprise", "products", id,
				fmt.Sprintf("meta_data porte la clé %q, que le modèle cible ne conserve pas", key))
		}
	}
	return barcode
}

// checkMargin confronte les marges stockées aux deux hypothèses de prix, et
// signale les produits qui ne vérifient ni l'une ni l'autre.
//
// margin_rate et margin_amount sont SUPPRIMÉS par le modèle cible : ces
// produits disparaîtraient sans avoir été vus. C'est précisément pour ça que ce
// contrôle existe, et qu'il tourne AVANT le chargement.
func checkMargin(d nedb.Doc, p Product, rep *Report) {
	amount, _, missing := numberLoose(d["margin_amount"])
	if missing || p.PurchaseH == 0 || p.TaxRate < 0 {
		return
	}
	ht := p.PriceTTC / (1 + p.TaxRate/100)
	expectedTTCBase := ht - p.PurchaseH        // hypothèse retenue : price TTC
	expectedHTBase := p.PriceTTC - p.PurchaseH // hypothèse écartée : price HT

	const tol = 0.02
	if math.Abs(amount-expectedTTCBase) <= tol {
		rep.Count("marges cohérentes (price TTC)")
		return
	}
	if math.Abs(amount-expectedHTBase) <= tol {
		rep.Count("marges cohérentes (price HT)")
		return
	}
	rep.Add(Declarative, "marge incohérente avec les deux hypothèses", "products", p.LegacyID,
		fmt.Sprintf("« %s » : margin_amount=%.2f, attendu %.2f (TTC) ou %.2f (HT) — price=%.2f achat=%.2f tva=%g",
			trunc(p.Name), amount, expectedTTCBase, expectedHTBase, p.PriceTTC, p.PurchaseH, p.TaxRate))
}

func reportSlugs(rep *Report, entity string, a *SlugAllocator) {
	for _, adj := range a.Adjusted {
		rep.Add(Declarative, "slug désambiguïsé", entity, adj.SourceID,
			fmt.Sprintf("« %s » voulait %q, déjà pris par %s — attribué %q",
				trunc(adj.Label), adj.Wanted, adj.HeldBy, adj.Got))
	}
	for _, e := range a.Empty {
		// Ce n'est pas un problème de slug, c'est un problème de NOM : aucun
		// caractère exploitable signifie que le libellé lui-même est faux. Le
		// chargement ne planterait pas — un slug de repli est fabriqué depuis
		// l'identifiant — mais il écrirait une donnée fausse, ce qui est le
		// second critère de blocage du plan.
		rep.Add(Blocking, "nom inexploitable", entity, e.SourceID,
			fmt.Sprintf("`name` vaut %q : aucun caractère utilisable. À corriger dans AppPos, "+
				"la désignation porte souvent le vrai libellé", e.Label))
	}
}

// ── Conversions ───────────────────────────────────────────────────────────
// NeDB n'est pas typé, PocketBase l'est. Chacune de ces fonctions absorbe une
// incohérence mesurée sur les données réelles.

func str(v any) string {
	s, _ := v.(string)
	return s
}

func number(v any) float64 {
	n, _, _ := numberLoose(v)
	return n
}

// numberLoose accepte un nombre ou une chaîne — `tax_rate` vaut "20" sur
// 3 produits et "0" sur 4, `margin_rate` est de type mixte.
// Rend aussi : la valeur venait-elle d'une chaîne, et était-elle absente.
func numberLoose(v any) (val float64, fromString bool, missing bool) {
	switch t := v.(type) {
	case nil:
		return 0, false, true
	case float64:
		return t, false, false
	case string:
		s := strings.TrimSpace(strings.Replace(t, ",", ".", 1))
		if s == "" {
			return 0, true, true
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0, true, true
		}
		return f, true, false
	default:
		return 0, false, true
	}
}

func boolean(v any) bool {
	b, _ := v.(bool)
	return b
}

func object(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func strSlice(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, e := range arr {
		if s, ok := e.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

// numOrStr rend un identifiant externe sous forme de chaîne : woo_id est un
// nombre dans NeDB, mais external_refs le stocke en texte — la prochaine
// plateforme n'utilisera pas forcément des entiers.
func numOrStr(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case string:
		return strings.TrimSpace(t)
	default:
		return ""
	}
}

// image extrait le chemin AppServe et l'URL WordPress d'un objet image.
//
// ATTENTION — c'est ici que la première version se trompait sur les CATÉGORIES.
// Leur champ `image` a exactement la même forme que celui des produits : un
// OBJET {src, url, local_path, status, type, metadata}. Il était lu comme une
// chaîne, ce qui rendait "" pour les 22 catégories illustrées.
//
// La leçon vaut au-delà du cas : dans NeDB, un champ nommé « image » n'est
// jamais une URL. Ne pas présumer de la forme, la vérifier.
func image(v any) (src, wpURL string) {
	m, ok := v.(map[string]any)
	if !ok {
		return "", ""
	}
	src, wpURL = str(m["src"]), str(m["url"])
	// 93 images portent une URL absolue dans `src` au lieu d'un chemin local,
	// et n'ont pas de `url`. L'URL ne doit pas se perdre : elle est le seul
	// recours pour les 30 dont le fichier n'est pas non plus sous public/.
	if wpURL == "" && (strings.HasPrefix(src, "http://") || strings.HasPrefix(src, "https://")) {
		wpURL = src
	}
	return src, wpURL
}

// gallery rend les chemins de la galerie, en excluant l'image principale.
func gallery(v any, mainSrc string) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	seen := map[string]bool{mainSrc: true}
	out := make([]string, 0, len(arr))
	for _, e := range arr {
		src, _ := image(e)
		if src == "" || seen[src] {
			continue
		}
		seen[src] = true
		out = append(out, src)
	}
	return out
}

func trunc(s string) string {
	const n = 44
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
