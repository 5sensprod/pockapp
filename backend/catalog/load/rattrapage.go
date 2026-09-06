// backend/catalog/load/rattrapage.go
// ═══════════════════════════════════════════════════════════════════════════
// RATTRAPER DES FICHES OUBLIÉES — AJOUTER, SANS JAMAIS PURGER
// ═══════════════════════════════════════════════════════════════════════════
// `Run` recharge TOUT après avoir vidé les quatre collections. C'était juste
// tant que la base était une projection de NeDB ; ça ne l'est plus depuis le
// 19 août 2026 — elle porte des ventes, des comptages et des produits nés en
// caisse. Rattraper quinze fiches par un rechargement complet détruirait tout
// cela pour en récupérer quinze.
//
// D'où cette entrée : elle AJOUTE, et rien d'autre.
//
// ─── Pourquoi elle ne réécrit pas le chemin d'écriture ─────────────────────
// Elle appelle `ecrireProduit`, la même fonction que `loadProducts`. Un second
// code qui écrit `products` divergerait du premier — c'est déjà arrivé une
// fois entre les deux gardes de la reprise (voir mapping/appliquer.go). Ce qui
// diffère ici, c'est ce qu'on lui donne : les relations sont résolues contre
// la base EXISTANTE, pas contre un catalogue qu'on vient d'écrire.
//
// ─── Les quatre refus ──────────────────────────────────────────────────────
// Une fiche est écartée, jamais forcée, si :
//
//  1. son `legacy_id` est déjà en base — le produit existe, l'ajouter en
//     ferait un doublon, et `legacy_id` est la clé du pont vers NeDB ;
//  2. son SKU est déjà porté par un autre produit — c'est exactement la
//     collision qui a produit les fusions du 11 août ; on la signale au lieu
//     de la rejouer ;
//  3. son slug est déjà pris — le slug est figé et nomme une page en ligne
//     (CLAUDE.md, 20 août 2026). On en dérive un libre, et on le DIT ;
//  4. elle est en quarantaine de normalisation.
//
// ─── Ce qu'elle ne fait pas ────────────────────────────────────────────────
// Elle ne touche ni aux marques, ni aux catégories, ni aux fournisseurs :
// elle rattache aux existants par `legacy_id` et compte ce qui ne se résout
// pas. Créer une marque au passage, c'est décider à la place de l'opérateur.
package load

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"

	"pocket-react/backend/catalog/normalize"
)

// FicheRattrapee est le compte rendu d'une fiche, écrite ou non.
type FicheRattrapee struct {
	LegacyID string
	Nom      string
	SKU      string
	// ProduitID est vide en simulation, et quand la fiche est refusée.
	ProduitID string
	Slug      string
	// SlugAjuste dit que le slug voulu était pris et qu'un autre a été dérivé.
	SlugAjuste bool
	// Images attendues / retrouvées sur disque. Une fiche sans image n'est pas
	// un échec : c'est une fiche sans image.
	ImagesAttendues int
	ImagesTrouvees  int
	// Refus, vide si la fiche est retenue.
	Refus string
	// Marque, Categories, Fournisseur : ce qui n'a pas pu être rattaché.
	RelationsPerdues []string
}

// Retenue dit si la fiche a été (ou serait) écrite.
func (f FicheRattrapee) Retenue() bool { return f.Refus == "" }

// ResultatRattrapage est le compte rendu complet.
type ResultatRattrapage struct {
	Simulation bool
	Fiches     []FicheRattrapee
	// Compagnie rattachée, pour que l'opérateur vérifie qu'il vise la bonne.
	CompanyID, CompanyName string
	FilesCopied            int
	ResolvedByName         int
	ResolvedFromBackup     int
}

// Retenues rend les fiches écrites (ou écrivables en simulation).
func (r *ResultatRattrapage) Retenues() []FicheRattrapee {
	var out []FicheRattrapee
	for _, f := range r.Fiches {
		if f.Retenue() {
			out = append(out, f)
		}
	}
	return out
}

// Refusees rend les fiches écartées.
func (r *ResultatRattrapage) Refusees() []FicheRattrapee {
	var out []FicheRattrapee
	for _, f := range r.Fiches {
		if !f.Retenue() {
			out = append(out, f)
		}
	}
	return out
}

// OptionsRattrapage règle ce que l'appelant décide.
type OptionsRattrapage struct {
	// RacineImages est la racine dont les `src` sont relatifs — le parent du
	// répertoire NeDB lu.
	RacineImages string
	// AutresRacines : racines supplémentaires. Une fiche que la base
	// d'installation n'a plus vit dans la base de développement, dont les
	// images sont ailleurs.
	AutresRacines []string
	// SecoursImages — `storage` d'une autre base PocketBase. Même repli que
	// pour le chargement complet.
	SecoursImages string
	// Simulation : ne rien écrire. C'est le défaut de l'appelant, pas d'ici —
	// mais une valeur nulle qui n'écrit pas est le bon sens par défaut.
	Simulation bool
}

// Rattraper ajoute au catalogue les produits de `cat` dont le `legacy_id`
// figure dans `legacyIDs`, et rend le compte rendu fiche par fiche.
//
// En simulation, elle fait TOUT sauf écrire : elle résout les relations,
// vérifie les collisions, et cherche les images sur le disque. Une simulation
// qui ne vérifierait pas les fichiers ne dirait rien de ce qui compte ici.
func Rattraper(
	app *pocketbase.PocketBase,
	cat *normalize.Catalog,
	rep *normalize.Report,
	legacyIDs []string,
	opts OptionsRattrapage,
) (*ResultatRattrapage, error) {
	voulus := make(map[string]bool, len(legacyIDs))
	for _, id := range legacyIDs {
		if s := strings.TrimSpace(id); s != "" {
			voulus[s] = true
		}
	}
	if len(voulus) == 0 {
		return nil, fmt.Errorf("aucun legacy_id demandé")
	}

	companyID, companyName, err := resolveCompany(app.Dao())
	if err != nil {
		return nil, err
	}
	out := &ResultatRattrapage{
		Simulation:  opts.Simulation,
		CompanyID:   companyID,
		CompanyName: companyName,
	}

	// ── Ce que la base contient déjà ────────────────────────────────────────
	dejaLegacy, err := indexTexte(app.Dao(), "products", "legacy_id")
	if err != nil {
		return nil, err
	}
	dejaSKU, err := indexTexte(app.Dao(), "products", "sku")
	if err != nil {
		return nil, err
	}
	dejaSlug, err := indexTexte(app.Dao(), "products", "slug")
	if err != nil {
		return nil, err
	}
	brandIDs, err := indexTexte(app.Dao(), "brands", "legacy_id")
	if err != nil {
		return nil, err
	}
	categoryIDs, err := indexTexte(app.Dao(), "categories", "legacy_id")
	if err != nil {
		return nil, err
	}
	supplierIDs, err := indexTexte(app.Dao(), "suppliers", "legacy_id")
	if err != nil {
		return nil, err
	}

	quarantaine := rep.Quarantined()["products"]

	// ── Sélection, dans l'ordre de la liste demandée ────────────────────────
	parLegacy := map[string]normalize.Product{}
	for _, p := range cat.Products {
		if voulus[p.LegacyID] {
			parLegacy[p.LegacyID] = p
		}
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return nil, fmt.Errorf("ouverture du stockage PocketBase: %w", err)
	}
	defer fsys.Close()

	res := newResult()
	fl := &files{
		root:          opts.RacineImages,
		autresRacines: opts.AutresRacines,
		fsys:          fsys,
		res:           res,
		secours:       opts.SecoursImages,
	}

	// slugsPris part de la base et grandit au fil des fiches : deux fiches
	// rattrapées peuvent vouloir le même slug.
	slugsPris := map[string]bool{}
	for s := range dejaSlug {
		slugsPris[s] = true
	}

	var aEcrire []normalize.Product
	for _, id := range legacyIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		p, connu := parLegacy[id]
		f := FicheRattrapee{LegacyID: id, Nom: p.Name, SKU: p.SKU}

		switch {
		case !connu:
			f.Refus = "introuvable dans la source NeDB lue"
		case dejaLegacy[id] != "":
			f.Refus = fmt.Sprintf("legacy_id déjà en base (produit %s)", dejaLegacy[id])
		case p.SKU != "" && dejaSKU[p.SKU] != "":
			f.Refus = fmt.Sprintf("SKU %q déjà porté par le produit %s", p.SKU, dejaSKU[p.SKU])
		case quarantaineDe(quarantaine, id) != "":
			f.Refus = "quarantaine de normalisation : " + quarantaineDe(quarantaine, id)
		}

		if f.Refus == "" {
			slug, ajuste := slugLibre(p.Slug, p.Name, slugsPris)
			slugsPris[slug] = true
			p.Slug = slug
			f.Slug, f.SlugAjuste = slug, ajuste

			f.RelationsPerdues = relationsPerdues(p, brandIDs, categoryIDs, supplierIDs)
			f.ImagesAttendues, f.ImagesTrouvees = compterImages(fl, p)
			aEcrire = append(aEcrire, p)
		}
		out.Fiches = append(out.Fiches, f)
	}

	if opts.Simulation || len(aEcrire) == 0 {
		return out, nil
	}

	// ── Écriture, dans UNE transaction ──────────────────────────────────────
	ecrits := map[string]string{}
	err = app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		col, err := tx.FindCollectionByNameOrId("products")
		if err != nil {
			return err
		}
		for _, p := range aEcrire {
			if err := ecrireProduit(tx, col, p, companyID,
				brandIDs, categoryIDs, supplierIDs, fl, res); err != nil {
				return err
			}
			ecrits[p.LegacyID] = res.ProduitEcrit()
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	for i := range out.Fiches {
		out.Fiches[i].ProduitID = ecrits[out.Fiches[i].LegacyID]
	}
	out.FilesCopied = res.FilesCopied
	out.ResolvedByName = res.ResolvedByName
	out.ResolvedFromBackup = res.ResolvedFromBackup
	return out, nil
}

// indexTexte rend la table valeur → identifiant PocketBase pour un champ
// texte d'une collection. Les valeurs vides sont ignorées : elles ne
// désignent rien, et 368 produits sans SKU se collisionneraient tous.
func indexTexte(dao *daos.Dao, collection, champ string) (map[string]string, error) {
	records, err := dao.FindRecordsByExpr(collection)
	if err != nil {
		return nil, fmt.Errorf("lecture de %s: %w", collection, err)
	}
	out := make(map[string]string, len(records))
	for _, r := range records {
		v := strings.TrimSpace(r.GetString(champ))
		if v == "" {
			continue
		}
		if _, vu := out[v]; !vu {
			out[v] = r.Id
		}
	}
	return out, nil
}

func quarantaineDe(q map[string]string, id string) string { return q[id] }

// slugLibre rend un slug non pris, et dit s'il a fallu l'ajuster.
//
// Le suffixe est numérique et non aléatoire : deux exécutions de la même
// simulation doivent annoncer le même slug, sinon la simulation ne vaut rien.
func slugLibre(voulu, nom string, pris map[string]bool) (string, bool) {
	base := strings.TrimSpace(voulu)
	if base == "" {
		base = normalize.Slugify(nom)
	}
	if base == "" {
		base = "produit"
	}
	if !pris[base] {
		return base, false
	}
	for n := 2; n < 1000; n++ {
		candidat := fmt.Sprintf("%s-%d", base, n)
		if !pris[candidat] {
			return candidat, true
		}
	}
	return base, true
}

// relationsPerdues nomme les rattachements qui ne se résoudront pas.
func relationsPerdues(p normalize.Product, brandIDs, categoryIDs, supplierIDs map[string]string) []string {
	var out []string
	if p.BrandLegacyID != "" && brandIDs[p.BrandLegacyID] == "" {
		out = append(out, "marque "+p.BrandLegacyID)
	}
	if p.SupplierLegacyID != "" && supplierIDs[p.SupplierLegacyID] == "" {
		out = append(out, "fournisseur "+p.SupplierLegacyID)
	}
	for _, c := range p.CategoryLegacyID {
		if categoryIDs[c] == "" {
			out = append(out, "catégorie "+c)
		}
	}
	return out
}

// compterImages dit combien d'images la fiche déclare et combien sont
// RÉELLEMENT sur le disque — sans rien copier.
func compterImages(fl *files, p normalize.Product) (attendues, trouvees int) {
	srcs := make([]string, 0, 1+len(p.GallerySrc))
	if p.ImageSrc != "" {
		srcs = append(srcs, p.ImageSrc)
	}
	srcs = append(srcs, p.GallerySrc...)
	for _, s := range srcs {
		attendues++
		if fl.resolve(s) != "" {
			trouvees++
		}
	}
	return attendues, trouvees
}

// RacineDe rend la racine dont les `src` d'images sont relatifs, pour un
// répertoire NeDB donné : c'est son parent.
func RacineDe(nedbDir string) string { return filepath.Dir(nedbDir) }
