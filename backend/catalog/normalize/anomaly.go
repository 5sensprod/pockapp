// backend/catalog/normalize/anomaly.go
// ═══════════════════════════════════════════════════════════════════════════
// LE RAPPORT D'ANOMALIES  (ticket T3)
// ═══════════════════════════════════════════════════════════════════════════
// C'est la sortie principale de T3, et c'est LUI qui autorise T4 — pas
// l'absence d'erreur à la normalisation. Voir 10-plan-migration.md §2 et §6.
//
// Deux niveaux, et la distinction est le cœur du ticket :
//
//	BLOQUANT     le chargement échouerait, ou écrirait une donnée fausse.
//	             À régler AVANT T4, et la plupart du temps dans AppPos, pas ici.
//
//	DÉCLARATIF   la donnée est chargeable telle quelle, mais elle porte une
//	             incohérence qu'il faut avoir VUE. Le rituel l'exige : « la
//	             migration est l'occasion de les identifier, pas de les
//	             corriger en silence » (§8 du 08).
//
// Rien dans ce paquet ne corrige quoi que ce soit. Normaliser un type, c'est
// traduire ; réparer une donnée, c'est décider — et la décision n'appartient
// pas à l'outil.
package normalize

import "sort"

// Severity distingue ce qui arrête de ce qui s'observe.
type Severity int

const (
	// Declarative : à connaître, ne bloque pas T4.
	Declarative Severity = iota
	// Blocking : T4 ne doit pas tourner tant que ce n'est pas réglé.
	Blocking
)

func (s Severity) String() string {
	if s == Blocking {
		return "BLOQUANT"
	}
	return "déclaratif"
}

// Anomaly est un constat, jamais une correction.
type Anomaly struct {
	Severity Severity
	// Kind regroupe les anomalies de même nature dans le rapport.
	Kind string
	// Entity est la collection concernée : products, categories, …
	Entity string
	// SourceID est le _id NeDB, pour qu'on puisse aller voir dans AppPos.
	SourceID string
	// Detail décrit le cas précis. Rédigé pour être lu seul.
	Detail string
}

// Report accumule les anomalies d'une normalisation.
type Report struct {
	Anomalies []Anomaly
	// Counters porte les mesures qui ne sont pas des anomalies mais qui
	// permettent de vérifier que la normalisation a fait son travail.
	Counters map[string]int
}

func NewReport() *Report {
	return &Report{Counters: map[string]int{}}
}

func (r *Report) Add(sev Severity, kind, entity, sourceID, detail string) {
	r.Anomalies = append(r.Anomalies, Anomaly{sev, kind, entity, sourceID, detail})
}

func (r *Report) Count(key string) { r.Counters[key]++ }

// HasBlocking dit si T4 peut tourner. C'est la seule question que le plan
// pose à ce rapport.
func (r *Report) HasBlocking() bool {
	for _, a := range r.Anomalies {
		if a.Severity == Blocking {
			return true
		}
	}
	return false
}

// Group est un ensemble d'anomalies de même nature, prêt à l'affichage.
type Group struct {
	Kind     string
	Severity Severity
	Items    []Anomaly
}

// Grouped rend les anomalies regroupées par nature, les bloquantes d'abord,
// puis par effectif décroissant. L'ordre est stable d'une exécution à l'autre :
// un rapport qui change d'ordre sans que les données changent ne se compare pas.
func (r *Report) Grouped() []Group {
	byKind := map[string]*Group{}
	var order []string
	for _, a := range r.Anomalies {
		g, ok := byKind[a.Kind]
		if !ok {
			g = &Group{Kind: a.Kind, Severity: a.Severity}
			byKind[a.Kind] = g
			order = append(order, a.Kind)
		}
		// Une nature est bloquante dès qu'un de ses cas l'est.
		if a.Severity == Blocking {
			g.Severity = Blocking
		}
		g.Items = append(g.Items, a)
	}

	out := make([]Group, 0, len(order))
	for _, k := range order {
		out = append(out, *byKind[k])
	}
	sort.SliceStable(out, func(i, j int) bool {
		if (out[i].Severity == Blocking) != (out[j].Severity == Blocking) {
			return out[i].Severity == Blocking
		}
		if len(out[i].Items) != len(out[j].Items) {
			return len(out[i].Items) > len(out[j].Items)
		}
		return out[i].Kind < out[j].Kind
	})
	return out
}
