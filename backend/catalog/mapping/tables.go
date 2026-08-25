// backend/catalog/mapping/tables.go
// ═══════════════════════════════════════════════════════════════════════════
// LES TABLES DE CORRESPONDANCE — chargement et contrôles
// ═══════════════════════════════════════════════════════════════════════════
//
// `categories.json` et `brands.json` sont décrits dans README.md. Ce fichier
// les charge et refuse ce qui ne tient pas debout ; `plan.go` s'en sert.
//
// ── Elles sont EMBARQUÉES, et c'est délibéré ───────────────────────────────
//
// `go:embed` les met dans le binaire. Une reprise lancée depuis n'importe quel
// répertoire emporte donc les tables qui ont été relues et arbitrées, et il
// devient impossible d'en appliquer une version qui traîne à côté de
// l'exécutable — le genre d'écart qu'on ne découvre qu'après l'écriture.
//
// ── La clé d'une CATÉGORIE est son CHEMIN, pas son identifiant ─────────────
//
// Le chemin — « Racine / Enfant » — décrit un rangement : il se relit, se
// vérifie, et une erreur s'y voit. Un identifiant opaque ne dit rien et se
// contrôle encore moins. `nedb_id` figure dans les fichiers pour retrouver une
// ligne à la main, et pour rien d'autre.
//
// (Une version antérieure justifiait ce choix par une prétendue régénération
// des `_id` NeDB. C'était une erreur de mesure — voir docs/DECISIONS.md,
// 2026-08-25. Le choix, lui, reste le bon.)
package mapping

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

//go:embed categories.json
var categoriesJSON []byte

//go:embed brands.json
var brandsJSON []byte

// Les actions possibles pour une catégorie. Voir README.md.
const (
	ActionRattacher    = "rattacher"     // devient / rejoint un rayon cible
	ActionSupprimer    = "supprimer"     // aucun produit ne la porte, ni sous elle
	ActionArbitrer     = "arbitrer"      // la règle automatique n'a pas tranché
	ActionChampProduit = "champ_produit" // ce n'était pas une catégorie
)

// CategoryRule est une ligne de categories.json.
type CategoryRule struct {
	Chemin                  string `json:"chemin"`
	Nom                     string `json:"nom"`
	Racine                  string `json:"racine"`
	NedbID                  string `json:"nedb_id"`
	ProduitsDirects         int    `json:"produits_directs"`
	ProduitsAvecDescendance int    `json:"produits_avec_descendance"`
	Action                  string `json:"action"`
	RayonCible              string `json:"rayon_cible"`
	AArbitrer               bool   `json:"a_arbitrer"`
	Note                    string `json:"note"`
	ChampProduit            *struct {
		Champ  string `json:"champ"`
		Valeur string `json:"valeur"`
	} `json:"champ_produit"`
}

// CategoryTable est categories.json.
type CategoryTable struct {
	GenereLe     string         `json:"genere_le"`
	Source       string         `json:"source"`
	RayonsCibles []string       `json:"rayons_cibles"`
	Categories   []CategoryRule `json:"categories"`
	parChemin    map[string]*CategoryRule
	rayonsConnus map[string]bool
	// CheminsDoubls — les chemins rencontrés plus d'une fois, convergés.
	// Conservés pour que la simulation puisse les nommer : ce sont des
	// doublons de la source, et ils méritent d'être vus.
	CheminsDoubls []string
}

// BrandGroup est un groupe de doublons de brands.json.
type BrandGroup struct {
	Cle                   string   `json:"cle"`
	ProduitsTotal         int      `json:"produits_total"`
	SurvivantPropose      string   `json:"survivant_propose"`
	SurvivantNedbID       string   `json:"survivant_nedb_id"`
	Perdants              []string `json:"perdants"`
	AArbitrer             bool     `json:"a_arbitrer"`
	Note                  string   `json:"note"`
	ImagesPerdantesAVider []string `json:"images_perdantes_a_vider"`
}

// BrandTable est brands.json.
type BrandTable struct {
	GenereLe string       `json:"genere_le"`
	Groupes  []BrandGroup `json:"groupes"`
	parCle   map[string]*BrandGroup
}

// LoadTables lit les deux tables embarquées et les contrôle.
func LoadTables() (*CategoryTable, *BrandTable, error) {
	var ct CategoryTable
	if err := json.Unmarshal(categoriesJSON, &ct); err != nil {
		return nil, nil, fmt.Errorf("categories.json: %w", err)
	}
	var bt BrandTable
	if err := json.Unmarshal(brandsJSON, &bt); err != nil {
		return nil, nil, fmt.Errorf("brands.json: %w", err)
	}
	if err := ct.index(); err != nil {
		return nil, nil, err
	}
	if err := bt.index(); err != nil {
		return nil, nil, err
	}
	return &ct, &bt, nil
}

func (t *CategoryTable) index() error {
	t.parChemin = make(map[string]*CategoryRule, len(t.Categories))
	t.rayonsConnus = make(map[string]bool, len(t.RayonsCibles))
	for _, r := range t.RayonsCibles {
		t.rayonsConnus[r] = true
	}

	for i := range t.Categories {
		c := &t.Categories[i]
		if c.Chemin == "" {
			return fmt.Errorf("categories.json: une ligne sans `chemin` (nom %q) — "+
				"le chemin est la clé de jointure, elle ne peut pas être vide", c.Nom)
		}
		switch c.Action {
		case ActionRattacher:
			if c.RayonCible == "" {
				return fmt.Errorf("categories.json: %q est à rattacher sans `rayon_cible`", c.Chemin)
			}
			if !t.rayonsConnus[c.RayonCible] {
				return fmt.Errorf("categories.json: %q vise le rayon %q, absent de `rayons_cibles`",
					c.Chemin, c.RayonCible)
			}
		case ActionChampProduit:
			if c.ChampProduit == nil || c.ChampProduit.Champ == "" || c.ChampProduit.Valeur == "" {
				return fmt.Errorf("categories.json: %q porte l'action `champ_produit` "+
					"sans dire quel champ ni quelle valeur", c.Chemin)
			}
		case ActionSupprimer, ActionArbitrer:
			// rien à exiger
		default:
			return fmt.Errorf("categories.json: %q porte l'action inconnue %q", c.Chemin, c.Action)
		}

		// ── Chemins en double : ils CONVERGENT, ils ne s'annulent pas ─────
		//
		// NeDB porte des catégories strictement homonymes sous le même parent
		// — deux « Prestation / Changement mécanique folk & electrique », deux
		// « Accessoires pour Batterie ». Ce sont deux enregistrements pour un
		// seul rangement : les traiter comme un conflit serait refuser une
		// donnée parfaitement compréhensible.
		//
		// La règle de convergence est celle du bon sens et elle est sûre :
		// **une destination l'emporte sur une suppression.** Si l'une des deux
		// lignes range quelque part et l'autre efface, c'est que l'une porte
		// des produits et l'autre non ; ranger ne perd rien, effacer perdrait.
		//
		// Ce qui reste refusé, c'est DEUX DESTINATIONS DIFFÉRENTES : là, aucun
		// choix n'est défendable, et le gagnant dépendrait de l'ordre du
		// fichier.
		if deja, vu := t.parChemin[c.Chemin]; vu {
			gagnant, err := converger(deja, c)
			if err != nil {
				return err
			}
			t.CheminsDoubls = append(t.CheminsDoubls, c.Chemin)
			t.parChemin[c.Chemin] = gagnant
			continue
		}
		t.parChemin[c.Chemin] = c
	}
	sort.Strings(t.CheminsDoubls)
	return nil
}

// converger tranche entre deux règles portant le même chemin.
//
// Une destination l'emporte sur une suppression ; deux destinations
// différentes ne se départagent pas et remontent en erreur.
func converger(a, b *CategoryRule) (*CategoryRule, error) {
	destination := func(r *CategoryRule) bool {
		return r.Action == ActionRattacher || r.Action == ActionChampProduit
	}
	switch {
	case destination(a) && destination(b):
		if a.Action == b.Action && a.RayonCible == b.RayonCible {
			return a, nil
		}
		return nil, fmt.Errorf("categories.json: le chemin %q est décrit deux fois avec "+
			"des destinations différentes (%s→%q et %s→%q) — aucun départage n'est "+
			"défendable, il faut trancher dans la table",
			a.Chemin, a.Action, a.RayonCible, b.Action, b.RayonCible)
	case destination(a):
		return a, nil
	case destination(b):
		return b, nil
	default:
		return a, nil // les deux effacent : le choix est sans conséquence
	}
}

// ── Pourquoi la survivante n'est pas désignée par son NOM ─────────────────
//
// Deux groupes sur huit sont STRICTEMENT homonymes : « WITTNER » et
// « WITTNER », « K&M » et « K&M » — deux enregistrements, un seul nom. Aucune
// table ne peut désigner l'un des deux par son nom sans désigner l'autre en
// même temps.
//
// Les autres discriminants ne tiennent pas davantage. Le `_id` NeDB est
// régénéré (voir l'en-tête). Le slug d'origine départagerait — la perdante l'a
// vide — mais `normalize` NE LE REPREND PAS : il le recalcule depuis le nom
// (`catalog.go:169`), si bien que le slug vu ici dépend de l'ordre de lecture.
// `woo_id` départage WITTNER et pas K&M.
//
// D'où le partage des rôles : **la table dit quels noms forment un doublon —
// c'est un jugement humain — et le code choisit la survivante en comptant.**
// La règle de survie est mécanique : le plus de produits, puis le logo. Un
// `survivant_propose` reste dans le fichier à titre indicatif, et
// `a_arbitrer` signale les cas que le comptage ne tranche pas.
func (t *BrandTable) index() error {
	t.parCle = make(map[string]*BrandGroup, len(t.Groupes))
	for i := range t.Groupes {
		g := &t.Groupes[i]
		if g.Cle == "" {
			return fmt.Errorf("brands.json: un groupe sans `cle`")
		}
		if autre, vu := t.parCle[g.Cle]; vu {
			return fmt.Errorf("brands.json: la clé %q décrit deux groupes (%q et %q)",
				g.Cle, autre.SurvivantPropose, g.SurvivantPropose)
		}
		t.parCle[g.Cle] = g
	}
	return nil
}

// CleMarque normalise un nom de marque en clé de groupe : minuscules, accents
// et ponctuation retirés. C'est la même normalisation que celle qui a produit
// brands.json — « K&M », « k&m » et « K & M » sont la même marque.
func CleMarque(nom string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(nom) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		default:
			if base, ok := accentsLatins[r]; ok {
				b.WriteRune(base)
			}
		}
	}
	return b.String()
}

// accentsLatins réduit les lettres accentuées à leur base. Suffisant pour des
// noms de marques ; on ne cherche pas une translittération générale.
var accentsLatins = map[rune]rune{
	'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
	'ç': 'c',
	'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
	'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
	'ñ': 'n',
	'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
	'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
	'ý': 'y', 'ÿ': 'y',
}

// Groupe rend le groupe portant cette clé, ou nil.
func (t *BrandTable) Groupe(cle string) *BrandGroup { return t.parCle[cle] }

// GroupeDe rend le groupe de doublons auquel `nom` appartient, s'il y en a un.
func (t *BrandTable) GroupeDe(nom string) (*BrandGroup, bool) {
	g, ok := t.parCle[CleMarque(nom)]
	return g, ok
}

// Rule rend la règle d'un chemin de catégorie, ou nil.
func (t *CategoryTable) Rule(chemin string) *CategoryRule { return t.parChemin[chemin] }

// Rayons rend les rayons cibles déclarés.
func (t *CategoryTable) Rayons() []string { return t.RayonsCibles }

// AArbitrer rend les lignes que la règle automatique n'a pas tranchées.
func (t *CategoryTable) AArbitrer() []CategoryRule {
	var out []CategoryRule
	for _, c := range t.Categories {
		if c.AArbitrer {
			out = append(out, c)
		}
	}
	return out
}

// rayonDe rend le nom du rayon portant cette clé, ou la clé elle-même.
func (t *CategoryTable) rayonDe(cleRayon string) string {
	for _, r := range t.RayonsCibles {
		if CleRayon(r) == cleRayon {
			return r
		}
	}
	return cleRayon
}
