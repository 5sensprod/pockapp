// backend/catalog/mapping/plan.go
// ═══════════════════════════════════════════════════════════════════════════
// LE PLAN — ce que la reprise ÉCRIRAIT, calculé sans rien écrire
// ═══════════════════════════════════════════════════════════════════════════
//
// `Build` prend le catalogue normalisé depuis NeDB (normalize.Run) et les deux
// tables, et rend un `Plan` : les rayons à créer, les catégories qui
// disparaissent, les marques fusionnées, les produits reclassés, l'état
// commercial posé — et surtout ce qui CLOCHE.
//
// ── Pourquoi le plan est un objet, et pas un affichage ─────────────────────
//
// Un rapport imprimé au fil de l'eau ne se teste pas, et c'est justement ce
// qu'il faudrait vérifier : qu'aucun produit ne se perd, que les comptes
// tombent juste. Le plan est donc une valeur, la commande l'imprime, et les
// tests l'interrogent.
//
// ── Ce que le plan NE fait pas ─────────────────────────────────────────────
//
// Il ne reprend pas les `legacy_id` de la base de dév. C'est le point resté
// ouvert au §6 de l'état des lieux — conserver les clés existantes pour que le
// miroir d'images distant reste valide — et il demande de lire une seconde
// base. Tant qu'il n'est pas tranché, le plan compte les produits et se tait
// là-dessus plutôt que de laisser croire qu'il l'a résolu.
package mapping

import (
	"fmt"
	"sort"
	"strings"

	"pocket-react/backend/catalog/normalize"
)

// Plan est le résultat d'une simulation.
type Plan struct {
	// Rayons à créer, dans l'ordre du fichier de tables.
	Rayons []string

	// Catégories, par sort.
	Rattachees   int
	Supprimees   int
	VersChamp    int
	SansRegle    []string // chemins présents dans NeDB, absents de la table
	AArbitrer    []CategoryRule
	CheminsVides int // catégories supprimées qui portaient encore des produits

	// Marques.
	MarquesFusionnees  int
	MarquesInconnues   []string // perdantes de la table absentes de NeDB
	ImagesAVider       []string
	ProduitsReaffectes int // produits dont la marque change

	// Produits.
	ProduitsTotal     int
	ProduitsReclasses int
	ProduitsSansRayon []string // ceux qui n'atterrissent nulle part
	// SansRayonParCause ventile ProduitsSansRayon. Un total ne dit pas quoi
	// faire ; la cause, si : « aucune catégorie » est une dette d'avant la
	// reprise, « catégorie à arbitrer » se résout en remplissant la table, et
	// les deux ne se traitent pas au même endroit.
	SansRayonParCause  map[string]int
	EtatCommercial     map[string]int
	RattachementsAvant int
	RattachementsApres int

	// Répartition finale par rayon.
	ParRayon map[string]int

	// Natures — les catégories de niveau 1 créées sous les rayons. C'est ce
	// qui rend le catalogue cherchable : « Guitares électriques » sous
	// « Cordes & frettés ». La première version de la reprise n'en créait
	// aucune, et le catalogue en était devenu inutilisable.
	Natures int

	// EnQuarantaine — produits que la NORMALISATION écarte, en amont des
	// tables : `load.Run` ne les écrit pas. Le plan les exclut de tous ses
	// comptes, parce qu'il décrit ce qui sera ÉCRIT, pas ce qui a été lu.
	EnQuarantaine int

	// Clés stables. Décision du 24/08/2026 : on conserve celles qui sont déjà
	// en service, le miroir d'images distant étant nommé par `legacy_id`.
	ClesGardees        int // le produit portait déjà sa clé : rien à faire
	ClesReprisesParSKU int
	ClesReprisesParNom int
	ClesNeuves         []string // produits qui n'ont aucune correspondance sûre
	// ClesPerdues — produits dont la clé historique était DÉJÀ retenue par un
	// autre. Ils reçoivent une clé neuve.
	//
	// Ce n'est pas une erreur, c'est une information métier : deux articles
	// NeDB distincts n'étaient qu'un seul produit en base de dév (« Penta Harp
	// A mineur » et « E mineur » sous une même fiche). Une seule clé existe
	// pour les deux ; elle va à celui qui garde le SKU d'origine, et l'autre
	// **partira en ligne comme un produit nouveau**. C'est correct, et il faut
	// le voir venir.
	ClesPerdues []string

	// ClesEnCollision — deux produits ÉCRITS porteraient le même `legacy_id`.
	//
	// Par construction, `AttribuerCles` ne retient une clé qu'une fois : cette
	// liste doit rester vide. Elle est le contrôle de SORTIE — si elle se
	// remplit, c'est un défaut de l'attribution, pas une donnée douteuse. Deux
	// produits de même clé partageraient leur dossier d'images distant et leur
	// ligne SQL sur le site.
	ClesEnCollision []string
}

// BuildAvecQuarantaine calcule le plan. Il ne touche à aucune base. `quarantaine` est `rep.Quarantined()["products"]` —
// les produits que la normalisation écarte, indexés par `legacy_id`.
//
// ⚠️ La passer est ce qui rend le plan HONNÊTE. Sans elle, il annonçait 3055
// produits quand l'écriture en posait 3020, et surtout il comptait des
// collisions de clé entre une fiche écrite et une fiche qui ne le serait
// jamais — un refus pour une raison fausse. Mesuré le 24 août 2026 : sur les
// 33 SKU en double, exactement UNE fiche survit à la quarantaine, donc AUCUNE
// collision n'était réelle.
func BuildAvecQuarantaine(cat *normalize.Catalog, ct *CategoryTable, bt *BrandTable,
	kt *KeyTable, quarantaine map[string]string,
) *Plan {
	p := &Plan{
		Rayons:            append([]string(nil), ct.Rayons()...),
		EtatCommercial:    map[string]int{},
		SansRayonParCause: map[string]int{},
		ParRayon:          map[string]int{},
		AArbitrer:         ct.AArbitrer(),
	}

	chemins := cheminsDesCategories(cat.Categories)

	// ── Catégories ────────────────────────────────────────────────────────
	// On parcourt NeDB, pas la table : c'est la donnée réelle qui décide si
	// une règle sert, et une règle qui ne rencontre jamais sa catégorie est
	// une table périmée qu'il faut voir.
	regleDe := make(map[string]*CategoryRule, len(cat.Categories))
	for _, c := range cat.Categories {
		chemin := chemins[c.LegacyID]
		r := ct.Rule(chemin)
		if r == nil {
			p.SansRegle = append(p.SansRegle, chemin)
			continue
		}
		regleDe[c.LegacyID] = r
		switch r.Action {
		case ActionRattacher:
			p.Rattachees++
		case ActionSupprimer:
			p.Supprimees++
		case ActionChampProduit:
			p.VersChamp++
		}
	}
	sort.Strings(p.SansRegle)

	// ── Marques ───────────────────────────────────────────────────────────
	//
	// La table dit quels noms forment un doublon ; c'est ICI qu'on désigne la
	// survivante, en comptant. Voir l'en-tête de `index()` dans tables.go :
	// deux groupes sur huit sont strictement homonymes, aucun nom ne peut donc
	// désigner l'un plutôt que l'autre.
	produitsParMarque := map[string]int{}
	for _, prod := range cat.Products {
		if prod.BrandLegacyID != "" {
			produitsParMarque[prod.BrandLegacyID]++
		}
	}

	groupes := map[string][]normalize.Brand{}
	for _, b := range cat.Brands {
		if g, doublon := bt.GroupeDe(b.Name); doublon {
			groupes[g.Cle] = append(groupes[g.Cle], b)
		}
	}

	survivanteDe := make(map[string]string) // legacy_id perdante -> nom survivante
	for cle, membres := range groupes {
		g := bt.Groupe(cle)
		// Un groupe déclaré dans la table mais dont NeDB ne porte plus qu'un
		// seul membre n'est plus un doublon : la fusion a déjà eu lieu, ou une
		// marque a disparu. On le signale plutôt que de fusionner dans le vide.
		if len(membres) < 2 {
			p.MarquesInconnues = append(p.MarquesInconnues,
				g.SurvivantPropose+" (groupe "+cle+" : "+plur(len(membres))+" dans NeDB)")
			continue
		}
		sort.SliceStable(membres, func(i, j int) bool {
			pi, pj := produitsParMarque[membres[i].LegacyID], produitsParMarque[membres[j].LegacyID]
			if pi != pj {
				return pi > pj
			}
			return membres[i].ImageSrc != "" && membres[j].ImageSrc == ""
		})
		survivante := membres[0]
		for _, perdante := range membres[1:] {
			survivanteDe[perdante.LegacyID] = survivante.Name
			p.MarquesFusionnees++
			if perdante.ImageSrc != "" {
				p.ImagesAVider = append(p.ImagesAVider,
					perdante.Name+" ("+perdante.LegacyID+")")
			}
		}
	}
	sort.Strings(p.MarquesInconnues)
	sort.Strings(p.ImagesAVider)

	// Le niveau 1, calculé par la MÊME fonction que l'application.
	_, creees := NaturesDe(cat, ct, regleDe)
	p.Natures = len(creees)

	// ── Produits ──────────────────────────────────────────────────────────
	// Les clés sont attribuées pour TOUT le catalogue d'abord, SKU prioritaire :
	// une clé ne peut être retenue qu'une fois (voir AttribuerCles).
	ecrits := make([]normalize.Product, 0, len(cat.Products))
	for _, prod := range cat.Products {
		if _, ecarte := quarantaine[prod.LegacyID]; !ecarte {
			ecrits = append(ecrits, prod)
		}
	}
	clesRetenues := AttribuerCles(ecrits, kt)
	reclamants := map[string]string{} // clé stable -> premier produit qui la réclame
	for _, prod := range cat.Products {
		// Écarté par la normalisation : il ne sera pas écrit, il n'a donc rien
		// à faire dans les comptes — ni comme produit rangé, ni comme
		// réclamant d'une clé.
		if _, ecarte := quarantaine[prod.LegacyID]; ecarte {
			p.EnQuarantaine++
			continue
		}
		p.ProduitsTotal++
		if _, perdante := survivanteDe[prod.BrandLegacyID]; perdante {
			p.ProduitsReaffectes++
		}

		// ── Clé stable ────────────────────────────────────────────────────
		// Une clé neuve n'est pas une erreur : c'est le sort normal d'un
		// produit apparu depuis l'extraction. C'est son VOLUME qui doit
		// rester petit — s'il explose, la table est périmée et le miroir
		// d'images partirait en double.
		if kt != nil {
			cle, trouve := clesRetenues[prod.LegacyID]
			par := ""
			if trouve {
				par = kt.ParQuelMoyen(prod, cle)
			}
			switch {
			case !trouve:
				p.ClesNeuves = append(p.ClesNeuves, prod.Name)
			case par == "identité":
				p.ClesGardees++
			case par == "sku":
				p.ClesReprisesParSKU++
			default:
				p.ClesReprisesParNom++
			}
			if !trouve && kt.AuraitPuPretendre(prod) {
				// Sa clé existait, mais un autre l'a prise : il part en ligne
				// comme un produit neuf.
				p.ClesPerdues = append(p.ClesPerdues, prod.Name)
			}

			// ── Contrôle de SORTIE ────────────────────────────────────────
			// Sur le `legacy_id` FINAL, pas sur la clé attribuée : un produit
			// devancé garde son `_id`, qui peut heurter la clé d'un autre.
			// L'index unique de `products.legacy_id` ne pardonne pas, et la
			// transaction entière est annulée — mesuré le 25/08/2026.
			final := LegacyIDFinal(prod, clesRetenues)
			if premier, deja := reclamants[final]; deja {
				p.ClesEnCollision = append(p.ClesEnCollision,
					final+" : «"+premier+"» et «"+prod.Name+"»")
			} else {
				reclamants[final] = prod.Name
			}
		}

		p.RattachementsAvant += len(prod.CategoryLegacyID)

		rayons := map[string]bool{}
		etat := ""
		var causes []string
		for _, catID := range prod.CategoryLegacyID {
			r := regleDe[catID]
			if r == nil {
				causes = append(causes, "catégorie sans règle")
				continue
			}
			switch r.Action {
			case ActionRattacher:
				// Le comptage suit le RAYON même quand le produit ira sous une
				// nature : c'est le rayon qui intéresse à ce niveau de lecture,
				// et la nature en est un enfant.
				rayons[r.RayonCible] = true
			case ActionSupprimer:
				causes = append(causes, "catégorie supprimée")
			case ActionArbitrer:
				causes = append(causes, "catégorie à arbitrer")
			case ActionChampProduit:
				causes = append(causes, "état commercial seul")
				// L'état commercial n'est PAS un rayon : le produit sort de
				// l'arbre par là, et doit être rangé ailleurs. S'il n'a que
				// cette catégorie, il tombe dans ProduitsSansRayon — c'est le
				// cas des 18 produits sur 19 mesurés le 24/08/2026, et c'est
				// exactement ce qu'on veut voir apparaître.
				etat = r.ChampProduit.Valeur
			}
		}
		if etat != "" {
			p.EtatCommercial[etat]++
		}
		if len(rayons) == 0 {
			p.ProduitsSansRayon = append(p.ProduitsSansRayon, prod.Name)
			if len(causes) == 0 {
				causes = []string{"aucune catégorie"}
			}
			// Une seule cause par produit : la première rencontrée suffit à
			// dire où aller le chercher, et un produit compté dans deux causes
			// ferait un total supérieur au nombre de produits perdus.
			p.SansRayonParCause[causes[0]]++
			continue
		}
		p.ProduitsReclasses++
		p.RattachementsApres += len(rayons)
		for r := range rayons {
			p.ParRayon[r]++
		}
	}
	sort.Strings(p.ProduitsSansRayon)
	sort.Strings(p.ClesNeuves)
	sort.Strings(p.ClesPerdues)
	sort.Strings(p.ClesEnCollision)

	return p
}

// cheminsDesCategories reconstruit `Racine / Enfant / …` pour chaque catégorie.
//
// C'est la clé de jointure avec la table, et elle se recalcule ici plutôt que
// de se lire dans le fichier : si l'arbre NeDB a bougé depuis la génération, on
// veut que la jointure ÉCHOUE et remonte en `SansRegle`, pas qu'elle réussisse
// sur un chemin périmé transporté par la table.
func cheminsDesCategories(cats []normalize.Category) map[string]string {
	parID := make(map[string]normalize.Category, len(cats))
	for _, c := range cats {
		parID[c.LegacyID] = c
	}
	out := make(map[string]string, len(cats))
	for _, c := range cats {
		var parts []string
		x, vus := c, map[string]bool{}
		for {
			// Une boucle parent→enfant ferait tourner indéfiniment. Elle ne
			// devrait pas exister ; si elle existe, on s'arrête et le chemin
			// tronqué ne joindra pas — ce qui la rend visible.
			if vus[x.LegacyID] {
				break
			}
			vus[x.LegacyID] = true
			parts = append([]string{strings.TrimSpace(x.Name)}, parts...)
			parent, ok := parID[x.ParentLegacyID]
			if !ok {
				break
			}
			x = parent
		}
		out[c.LegacyID] = strings.Join(parts, " / ")
	}
	return out
}

// plur rend « 1 membre » ou « n membres ».
func plur(n int) string {
	if n <= 1 {
		return fmt.Sprintf("%d membre", n)
	}
	return fmt.Sprintf("%d membres", n)
}

// Bloquant dit si le plan interdit l'application.
//
// Une seule chose bloque aujourd'hui, et elle ne se discute pas : deux produits
// qui réclament la même clé stable. Leur donner le même `legacy_id` leur ferait
// partager un dossier d'images distant et une ligne SQL sur le site — la
// seconde fiche écraserait la première, en ligne, sans erreur.
//
// Ce qui NE bloque pas, et c'est délibéré : les produits sans rayon et les
// lignes à arbitrer. Ce sont des dettes connues, chiffrées, qu'une reprise peut
// assumer en les laissant visibles. Une collision, non : elle produit un dégât
// silencieux.
func (p *Plan) Bloquant() bool { return len(p.ClesEnCollision) > 0 }

// Build est BuildAvecQuarantaine sans quarantaine — pour les tests et pour un
// appelant qui n'a pas de rapport de normalisation sous la main.
func Build(cat *normalize.Catalog, ct *CategoryTable, bt *BrandTable, kt *KeyTable) *Plan {
	return BuildAvecQuarantaine(cat, ct, bt, kt, nil)
}
