// backend/catalog/nedb/reader.go
// ═══════════════════════════════════════════════════════════════════════════
// LECTEUR NeDB — RECONSTRUCTION EN LECTURE SEULE  (ticket T2)
// ═══════════════════════════════════════════════════════════════════════════
// Reconstruit l'état courant d'un fichier NeDB d'AppServe. Ce paquet n'écrit
// nulle part : ni dans NeDB, ni dans PocketBase. Il lit, il compte, il rend.
//
// Plan : frontend/modules/site/PocketSite-docs/10-plan-migration.md, ticket T2.
//
// ── Le format, et ses trois pièges ─────────────────────────────────────────
//
// Un fichier .db NeDB est un journal append-only : une ligne = un document
// JSON. L'état courant se reconstruit en rejouant le fichier du début à la
// fin. Trois choses ne se devinent pas à la lecture d'une seule ligne :
//
//  1. RÉÉCRITURE — une ligne portant un _id déjà vu REMPLACE la précédente.
//     Le fichier contient donc plusieurs versions du même document ; seule la
//     dernière compte.
//
//  2. SUPPRESSION — une ligne {"$$deleted":true,"_id":…} retire le document.
//     Elle peut arriver après plusieurs versions, et un _id supprimé peut être
//     réinséré plus loin.
//
//  3. MÉTADONNÉES — NeDB intercale des lignes {"$$indexCreated":…} SANS _id.
//     Ce ne sont pas des documents. Constaté le 10 août 2026 sur la base dev :
//     3 dans products.db, 2 dans categories.db, 1 dans brands.db et
//     suppliers.db. Les compter comme documents fausse le total — c'est
//     exactement l'erreur qui avait produit un décompte de 2307 produits au
//     lieu de 2306.
//
// Le lecteur compte séparément chacun de ces cas : un rapport qui dit
// seulement « 2306 documents » ne permet pas de vérifier qu'on a bien lu.
package nedb

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// maxLineBytes — un document produit peut porter une description HTML longue.
// Le tampon par défaut de bufio.Scanner (64 Kio) les tronquerait, et l'erreur
// se présenterait comme un JSON invalide, ce qui envoie chercher au mauvais
// endroit. 16 Mio : large au point que l'atteindre signalerait un fichier
// corrompu, pas un gros produit.
const maxLineBytes = 16 * 1024 * 1024

// Doc est un document NeDB brut, non typé. Le typage vers le modèle cible est
// le travail de T3 ; T2 ne présume rien de la forme des données.
type Doc map[string]any

// ID rend l'identifiant NeDB du document, ou "" s'il n'en a pas.
func (d Doc) ID() string {
	if v, ok := d["_id"].(string); ok {
		return v
	}
	return ""
}

// Stats est la comptabilité de la lecture. Elle existe pour que le rapport
// puisse être VÉRIFIÉ, pas seulement lu :
//
//	LinesTotal = LinesBlank + LinesMeta + LinesData + LinesUnreadable
//	Documents  = LinesData − Overwrites − Deletions (réinsertions comprises)
//
// Un écart dans cette arithmétique signifie que le lecteur s'est trompé.
type Stats struct {
	LinesTotal      int // lignes du fichier
	LinesBlank      int // lignes vides
	LinesMeta       int // $$indexCreated et consorts — sans _id, pas des documents
	LinesData       int // lignes portant un _id
	LinesUnreadable int // JSON invalide — doit rester à 0
	Overwrites      int // réécritures d'un _id déjà vu
	Deletions       int // marqueurs $$deleted appliqués
	DeletionsNoop   int // $$deleted sur un _id absent — anomalie douce
	Documents       int // documents finaux
}

// Collection est le résultat d'une lecture.
type Collection struct {
	Name  string
	Path  string
	Docs  []Doc
	Stats Stats
}

// Load reconstruit l'état courant d'un fichier NeDB.
//
// L'ordre des documents rendus est celui de la PREMIÈRE apparition de leur
// _id, et non celui du fichier : c'est le seul ordre stable quand un document
// est réécrit plusieurs fois. Aucune logique métier ne doit en dépendre — mais
// un ordre stable rend les rapports comparables d'une exécution à l'autre.
func Load(name, path string) (*Collection, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("nedb: ouverture de %s: %w", path, err)
	}
	defer f.Close()

	col := &Collection{Name: name, Path: path}

	byID := make(map[string]Doc)
	order := make([]string, 0, 4096)

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), maxLineBytes)

	for sc.Scan() {
		col.Stats.LinesTotal++

		line := strings.TrimSpace(sc.Text())
		if line == "" {
			col.Stats.LinesBlank++
			continue
		}

		var doc Doc
		if err := json.Unmarshal([]byte(line), &doc); err != nil {
			// On ne s'arrête pas : le rapport doit pouvoir dire COMBIEN de
			// lignes sont illisibles. Une seule suffit à invalider la
			// migration, mais il faut le savoir en une lecture, pas en dix.
			col.Stats.LinesUnreadable++
			continue
		}

		id := doc.ID()
		if id == "" {
			// $$indexCreated, $$indexRemoved… — métadonnées du moteur.
			col.Stats.LinesMeta++
			continue
		}
		col.Stats.LinesData++

		if deleted, _ := doc["$$deleted"].(bool); deleted {
			if _, existed := byID[id]; existed {
				delete(byID, id)
				col.Stats.Deletions++
			} else {
				// Suppression d'un document jamais vu : sans conséquence, mais
				// c'est le signe d'un journal remanié. À rapporter, pas à taire.
				col.Stats.DeletionsNoop++
			}
			continue
		}

		if _, existed := byID[id]; existed {
			col.Stats.Overwrites++
		} else {
			order = append(order, id)
		}
		byID[id] = doc
	}

	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("nedb: lecture de %s: %w", path, err)
	}

	col.Docs = make([]Doc, 0, len(byID))
	for _, id := range order {
		if d, ok := byID[id]; ok { // absent = supprimé depuis
			col.Docs = append(col.Docs, d)
		}
	}
	col.Stats.Documents = len(col.Docs)

	return col, nil
}

// ── Recensement des champs ────────────────────────────────────────────────
//
// Le §6.1 du rituel demande, pour chaque entité, « les champs réellement
// présents (pas ceux déclarés), les types, les taux de remplissage ». C'est ce
// que produit FieldReport — et c'est ce qui a permis d'établir que six champs
// produit sont à zéro document, et que meta_data ne contient qu'un code-barres.

// FieldStat décrit un champ tel qu'il existe dans les données.
type FieldStat struct {
	Name string
	// Present : le champ existe dans le document, même à null.
	Present int
	// Filled : le champ porte une valeur exploitable — ni null, ni "", ni
	// tableau ou objet vide. C'est le taux qui compte pour décider du sort
	// d'un champ : un champ présent partout et vide partout est un champ mort.
	Filled int
	// Types observés, triés. Plusieurs types sur un même champ est une
	// anomalie à traiter en T3 : PocketBase est typé, NeDB ne l'est pas.
	Types []string
}

// FillRate rend le taux de remplissage sur l'effectif donné.
func (f FieldStat) FillRate(total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(f.Filled) * 100 / float64(total)
}

// FieldReport recense tous les champs rencontrés, triés par nom.
func (c *Collection) FieldReport() []FieldStat {
	present := map[string]int{}
	filled := map[string]int{}
	types := map[string]map[string]bool{}

	for _, doc := range c.Docs {
		for k, v := range doc {
			present[k]++
			if isFilled(v) {
				filled[k]++
			}
			if types[k] == nil {
				types[k] = map[string]bool{}
			}
			types[k][jsonType(v)] = true
		}
	}

	out := make([]FieldStat, 0, len(present))
	for name, p := range present {
		ts := make([]string, 0, len(types[name]))
		for t := range types[name] {
			ts = append(ts, t)
		}
		sort.Strings(ts)
		out = append(out, FieldStat{Name: name, Present: p, Filled: filled[name], Types: ts})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// isFilled distingue « le champ existe » de « le champ porte une valeur ».
// Un `description: ""` ou un `categories: []` est présent et vide : le
// confondre avec une donnée réelle ferait garder des champs morts.
func isFilled(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case string:
		return strings.TrimSpace(t) != ""
	case []any:
		return len(t) > 0
	case map[string]any:
		return len(t) > 0
	default:
		return true // nombres et booléens : false et 0 sont des valeurs
	}
}

func jsonType(v any) string {
	switch t := v.(type) {
	case nil:
		return "null"
	case bool:
		return "bool"
	case float64:
		return "number"
	case string:
		return "string"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		_ = t
		return "?"
	}
}
