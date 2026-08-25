// backend/catalog/mapping/cles.go
// ═══════════════════════════════════════════════════════════════════════════
// LES CLÉS STABLES — on garde celles qui existent
// ═══════════════════════════════════════════════════════════════════════════
//
// Décision du propriétaire, 24 août 2026 : la reprise CONSERVE les `legacy_id`
// déjà en service plutôt que d'en générer de neufs.
//
// ── Ce que coûterait une clé neuve ─────────────────────────────────────────
//
// Le miroir d'images distant nomme son arborescence `<kind>/<legacy_id>/…`.
// Régénérer les clés rendrait orphelin TOUT ce qui est en ligne — marques,
// catégories et 2412 produits, ~1,5 Gio — et le ménage distant, qui n'efface
// que dans le dossier d'une entité qu'on lui envoie, ne pourrait jamais les
// reprendre. On aurait payé un ré-envoi complet pour laisser un doublon
// permanent sur le mutualisé.
//
// Conserver les clés annule ce coût entier : rien ne repart, le miroir reste
// valide, et le pont `legacy_id` des lignes de facture survit à 90 %.
//
// ── Pourquoi une table figée, et pas une lecture de la base de dév ─────────
//
// La correspondance est EXTRAITE UNE FOIS et versionnée, comme les autres
// tables. Lire la base de dév à chaque exécution ferait dépendre le résultat
// d'une base qui n'est pas dans le dépôt, que personne ne relit et qui peut
// bouger entre la simulation et l'application — c'est-à-dire exactement entre
// le moment où l'on vérifie et le moment où l'on écrit.
//
// ── Ce que cette table vaut réellement ─────────────────────────────────────
//
// **Beaucoup moins qu'il n'y paraît, et c'est une bonne nouvelle.** Les `_id`
// NeDB SONT les clés stables dans 2981 cas sur 3027 : le chargeur écrit
// `legacy_id = <_id NeDB>` depuis toujours, et cela suffit. Cette table ne sert
// qu'aux 46 restants — 18 retrouvés par leur SKU, 28 réellement nouveaux.
//
// C'est un filet, pas le pont. Une version antérieure de ce fichier la
// présentait comme indispensable, sur la foi d'une mesure fausse (voir
// docs/DECISIONS.md, 2026-08-25).
//
// ── La jointure, et le cas où elle doit REFUSER de joindre ─────────────────
//
// Le nom ne sert qu'en dernier recours, et **seulement s'il est unique des deux
// côtés**. 25 noms désignent plusieurs produits en base de dév et sont écartés
// de la table ; 28 en désignent plusieurs dans NeDB et sont écartés à
// l'exécution (voir nomsAmbigusDe).
//
// Ce n'est pas de la prudence de principe. Joindre sur un nom ambigu
// donnerait à un produit la clé d'un AUTRE, donc son dossier d'images : la
// fiche afficherait les photos du voisin, en ligne, sans qu'aucune erreur ne
// soit levée. **Une clé neuve est un moindre mal ; une clé fausse est un
// dégât.** En cas de doute, on ne joint pas.
package mapping

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"

	"pocket-react/backend/catalog/normalize"
)

//go:embed cles-stables.json
var clesJSON []byte

// KeyTable porte la correspondance vers les clés stables déjà en service.
type KeyTable struct {
	GenereLe           string            `json:"genere_le"`
	Source             string            `json:"source"`
	NomsAmbigusEcartes []string          `json:"noms_ambigus_ecartes"`
	ParSKU             map[string]string `json:"par_sku"`
	ParNom             map[string]string `json:"par_nom"`
}

// LoadKeys lit la table embarquée et la contrôle.
func LoadKeys() (*KeyTable, error) {
	var kt KeyTable
	if err := json.Unmarshal(clesJSON, &kt); err != nil {
		return nil, fmt.Errorf("cles-stables.json: %w", err)
	}
	if len(kt.ParSKU) == 0 && len(kt.ParNom) == 0 {
		return nil, fmt.Errorf("cles-stables.json: aucune correspondance — " +
			"la reprise génèrerait 3000 clés neuves et orphelinerait le miroir d'images")
	}
	// Un nom déclaré ambigu ne doit pas AUSSI figurer dans la table : ce serait
	// annoncer qu'on ne joint pas, puis joindre.
	for _, n := range kt.NomsAmbigusEcartes {
		if _, present := kt.ParNom[n]; present {
			return nil, fmt.Errorf("cles-stables.json: le nom %q est déclaré ambigu "+
				"et figure pourtant dans `par_nom`", n)
		}
	}
	return &kt, nil
}

// CleStable rend le `legacy_id` déjà en service pour ce produit, et par quel
// moyen il a été retrouvé. `trouve` vaut false quand aucune correspondance sûre
// n'existe : le produit recevra alors une clé neuve.
func (t *KeyTable) CleStable(sku, nom string) (cle string, par string, trouve bool) {
	if s := strings.TrimSpace(sku); s != "" {
		if c, ok := t.ParSKU[s]; ok {
			return c, "sku", true
		}
	}
	if n := strings.ToLower(strings.TrimSpace(nom)); n != "" {
		if c, ok := t.ParNom[n]; ok {
			return c, "nom", true
		}
	}
	return "", "", false
}

// nomsAmbigusDe rend les noms portés par PLUSIEURS produits du catalogue source.
//
// ── Pourquoi ce second filtre, alors que la table en a déjà un ─────────────
//
// `cles-stables.json` écarte déjà les noms qui désignaient plusieurs produits
// DANS LA BASE DE DÉV. Ce n'est pas suffisant : l'ambiguïté peut venir de
// l'autre bout. NeDB porte 28 noms partagés par 67 fiches — sept « Baguettes
// et maillets Hotstick », trois « Ukulélé Soprano US-TIKI » — qui joindraient
// tous vers la MÊME clé, unique côté dév.
//
// Découvert le 24 août 2026 en exerçant l'écriture sur une copie : trois
// collisions subsistaient après avoir écarté les 33 SKU en double, et elles
// venaient toutes du nom.
//
// La règle est donc symétrique : **on ne joint par nom que si le nom est
// unique des DEUX côtés.** Le produit reçoit sinon une clé neuve — un moindre
// mal, quand la clé fausse donnerait à sept fiches le même dossier d'images.
func nomsAmbigusDe(produits []normalize.Product) map[string]bool {
	compte := make(map[string]int, len(produits))
	for _, p := range produits {
		if n := strings.ToLower(strings.TrimSpace(p.Name)); n != "" {
			compte[n]++
		}
	}
	ambigus := map[string]bool{}
	for n, c := range compte {
		if c > 1 {
			ambigus[n] = true
		}
	}
	return ambigus
}

// cleStableSure applique CleStable en refusant la jointure par nom quand le nom
// est ambigu dans la source.
func cleStableSure(kt *KeyTable, p normalize.Product, ambigus map[string]bool) (string, string, bool) {
	if kt == nil {
		return "", "", false
	}
	cle, par, trouve := kt.CleStable(p.SKU, p.Name)
	if trouve && par == "nom" && ambigus[strings.ToLower(strings.TrimSpace(p.Name))] {
		return "", "", false
	}
	return cle, par, trouve
}

// AttribuerCles décide, pour tout le catalogue, quel produit reçoit quelle clé
// stable. Rend `legacy_id NeDB -> clé retenue` et, pour chaque clé, par quel
// moyen elle a été trouvée.
//
// ── Trois passes, et l'ordre est TOUTE la règle ────────────────────────────
//
// **L'identité NeDB d'abord. Le SKU ensuite. Le nom en dernier.**
//
// Le `_id` NeDB d'un produit EST sa clé stable dans 2981 cas sur 3027 : c'est
// lui que l'import du 11 août a posé en `legacy_id`, lui qui nomme le dossier
// d'images en ligne. Un produit qui porte une clé connue la garde donc, sans
// discussion — la table ne sert qu'aux 46 autres, dont 18 se retrouvent par
// leur SKU.
//
// ⚠️ Cet ordre a été mis à l'endroit le 25 août 2026, après un échec de
// l'écriture sur copie : `UNIQUE constraint failed: products.legacy_id`. Le SKU
// passait en premier, or un SKU peut CHANGER DE PROPRIÉTAIRE — le
// dédoublonnage avait laissé « QSC CB10 » au Bundle et renuméroté l'Enceinte.
// La clé de l'Enceinte partait alors au Bundle, c'est-à-dire le dossier
// d'images de l'une à l'autre, pendant que l'Enceinte gardait ce même
// identifiant comme `_id`. Deux produits, une clé.
//
// Le SKU décrit ce qu'on vend ; l'identifiant décrit la fiche. Quand les deux
// se contredisent, c'est l'identifiant qui dit la vérité sur ce qui est déjà
// en ligne.
//
// Ce n'est pas un détail d'implémentation. Quand deux articles NeDB distincts
// n'étaient qu'un seul produit en base de dév — un « Penta Harp A mineur » et
// un « E mineur » vendus sous la même fiche —, une seule clé historique existe
// pour les deux. Elle doit aller à celui qui garde le SKU d'origine : c'est lui
// que le site connaît, dont les images sont en ligne sous ce nom de dossier.
// L'autre est un article NOUVEAU du point de vue du site, et reçoit une clé
// neuve.
//
// Constaté le 25 août 2026, après le dédoublonnage dans AppPos : les quatre
// dernières collisions venaient toutes de là — une fiche renumérotée retombait
// sur la jointure par nom et réclamait la clé de sa jumelle.
//
// En une seule passe, le gagnant aurait dépendu de l'ordre de lecture.
func AttribuerCles(produits []normalize.Product, kt *KeyTable) map[string]string {
	retenues := make(map[string]string, len(produits))
	if kt == nil {
		return retenues
	}
	prises := make(map[string]bool, len(produits))
	ambigus := nomsAmbigusDe(produits)

	connues := make(map[string]bool, len(kt.ParSKU)+len(kt.ParNom))
	for _, c := range kt.ParSKU {
		connues[c] = true
	}
	for _, c := range kt.ParNom {
		connues[c] = true
	}

	// Passe 1 — l'identité. Le produit porte déjà une clé en service.
	for _, p := range produits {
		if connues[p.LegacyID] && !prises[p.LegacyID] {
			retenues[p.LegacyID] = p.LegacyID
			prises[p.LegacyID] = true
		}
	}
	// Passe 2 — le SKU, pour ceux que la première n'a pas servis.
	for _, p := range produits {
		if _, deja := retenues[p.LegacyID]; deja {
			continue
		}
		if s := strings.TrimSpace(p.SKU); s != "" {
			if cle, ok := kt.ParSKU[s]; ok && !prises[cle] {
				retenues[p.LegacyID] = cle
				prises[cle] = true
			}
		}
	}
	// Passe 3 — le nom, en dernier recours et seulement s'il est sans ambiguïté.
	for _, p := range produits {
		if _, deja := retenues[p.LegacyID]; deja {
			continue
		}
		n := strings.ToLower(strings.TrimSpace(p.Name))
		if n == "" || ambigus[n] {
			continue
		}
		if cle, ok := kt.ParNom[n]; ok && !prises[cle] {
			retenues[p.LegacyID] = cle
			prises[cle] = true
		}
	}
	return retenues
}

// ParQuelMoyen dit si la clé retenue pour ce produit vient du SKU ou du nom.
func (t *KeyTable) ParQuelMoyen(p normalize.Product, cle string) string {
	if p.LegacyID == cle {
		return "identité"
	}
	if s := strings.TrimSpace(p.SKU); s != "" && t.ParSKU[s] == cle {
		return "sku"
	}
	return "nom"
}

// AuraitPuPretendre dit qu'une clé historique existe pour ce produit — par son
// SKU ou par son nom — indépendamment de savoir si un autre l'a déjà prise.
//
// Sert à distinguer les deux façons de n'avoir pas de clé : le produit
// réellement nouveau, et celui qui s'est fait devancer.
func (t *KeyTable) AuraitPuPretendre(p normalize.Product) bool {
	if s := strings.TrimSpace(p.SKU); s != "" {
		if _, ok := t.ParSKU[s]; ok {
			return true
		}
	}
	if n := strings.ToLower(strings.TrimSpace(p.Name)); n != "" {
		if _, ok := t.ParNom[n]; ok {
			return true
		}
	}
	return false
}

// LegacyIDFinal rend la clé qu'un produit portera RÉELLEMENT en base : celle
// que l'attribution lui a retenue, ou à défaut son identifiant NeDB.
//
// C'est cette valeur, et elle seule, qui doit être unique — `products.legacy_id`
// porte un index unique. Le contrôle de la simulation et l'écriture doivent
// donc raisonner dessus, pas sur les seules clés attribuées : un produit
// devancé conserve son `_id`, qui peut entrer en conflit avec la clé retenue
// par un autre. C'est exactement ce qui a fait échouer l'écriture d'essai du
// 25 août 2026.
func LegacyIDFinal(p normalize.Product, retenues map[string]string) string {
	if cle, ok := retenues[p.LegacyID]; ok {
		return cle
	}
	return p.LegacyID
}
