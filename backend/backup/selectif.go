// backend/backup/selectif.go
// ═══════════════════════════════════════════════════════════════════════════
// RESTAURATION SÉLECTIVE — RAMENER TROIS CHAMPS, ET RIEN D'AUTRE
// ═══════════════════════════════════════════════════════════════════════════
// La restauration de `restauration.go` est TOUT OU RIEN : elle remplace
// `data.db` en entier au démarrage suivant. Sur la base d'un client en
// service, elle effacerait ses ventes, ses factures et ses Z. Elle est donc,
// et doit rester, un geste de développement (docs/SAUVEGARDE.md §6).
//
// Ce fichier est l'inverse exact : un snapshot est ouvert EN LECTURE SEULE à
// côté de la base en service, et seule une LISTE BLANCHE de champs en sort.
//
//	products    → categories, status, designation
//	categories  → name
//	site_menu   → la structure entière (voir plus bas, c'est le cas à part)
//
// Tout le reste — `image`, `gallery`, `stock`, `price_ttc`,
// `purchase_price_ht`, `sku`, `slug`, `legacy_id`, `barcode`, `brand`,
// `supplier`, et TOUTES les autres collections — est hors périmètre et ne peut
// pas être écrit : `ChampsAutorises` est la seule porte, et `appliquerChamps`
// refuse ce qui n'y figure pas, même si le snapshot le porte.
//
// ─── Pourquoi la simulation est le mode par défaut ─────────────────────────
// L'écart se calcule sans rien écrire, se montre, et n'est appliqué qu'après
// un geste explicite. C'est le même principe que `catalog-rattraper` : un
// outil qui écrit avant d'avoir montré ce qu'il écrit est un outil qu'on
// n'ose pas lancer.
//
// ─── SUR QUELLE CLÉ APPARIER LES DEUX BASES ────────────────────────────────
// **`id` PocketBase d'abord, `legacy_id` en repli, jamais le nom ni le slug.**
//
// Les deux bases descendent du même snapshot : la base de développement EST
// une restauration de celle du client. Les identifiants PocketBase y sont donc
// les mêmes, et ils sont la clé EXACTE — deux fiches de même `id` sont la même
// fiche, sans interprétation.
//
// `legacy_id` sert de repli parce qu'il survit à une réimportation : une fiche
// rechargée par `catalog-import` reçoit un `id` neuf mais garde sa clé stable
// (CLAUDE.md, « le pont est `legacy_id` »). Sans ce repli, une base rechargée
// d'un côté ne s'apparierait plus du tout.
//
// Le nom et le slug sont EXCLUS délibérément : deux catégories « Accessoires »
// existent dans l'arbre (`catalog_v2.go:394`), et apparier sur un homonyme
// écrirait sur la mauvaise fiche — silencieusement, ce qui est le pire cas.
//
// ─── CE QUI N'EST PAS DANS LE SNAPSHOT RESTE INTACT ────────────────────────
// C'est la règle qui protège le client, et elle mérite d'être écrite plutôt
// que déduite. Le sens est snapshot → cible, et UNIQUEMENT pour les fiches
// appariées :
//
//   - une fiche présente dans le snapshot et absente de la cible est COMPTÉE
//     et LISTÉE, jamais créée. On n'invente pas de produit dans la base d'un
//     magasin ;
//   - une fiche présente dans la cible et absente du snapshot n'est PAS
//     touchée. C'est le cas du produit né en caisse chez le client — clé
//     `pa_…`, jamais passé par le poste de développement. Il n'a aucune raison
//     d'exister dans mon snapshot, et il ne doit surtout pas en être déduit
//     qu'il faut le dépublier. **Une absence n'est pas une instruction.**
//
// Aucun enregistrement n'est donc créé ni effacé — à une exception nommée,
// `site_menu`, ci-dessous.
//
// ─── LE MENU EST LE CAS À PART, ET C'EST ASSUMÉ ────────────────────────────
// `site_menu` n'est pas un jeu de champs, c'est un ARBRE ORDONNÉ. Un menu
// restauré à moitié n'est pas un demi-menu, c'est un menu cassé : une entrée
// manquante emporte sa descendance, un `parent` non résolu produit un orphelin
// que le contrat de publication interdit (§4 du 05-contrat-menu.md).
//
// Le ramener signifie donc CRÉER et SUPPRIMER des entrées. C'est le seul
// endroit de ce fichier qui le fait, il est optionnel (case à cocher
// distincte), et il ne porte aucune donnée commerciale : le menu se réédite de
// zéro, contrairement à une facture. Les entrées sont recréées SOUS LEUR
// IDENTIFIANT D'ORIGINE, ce qui rend l'opération idempotente et conserve les
// rattachements `parent`.
//
// ─── CE QUE ÇA DÉCLENCHE AILLEURS, ET QU'IL FAUT DIRE ──────────────────────
// `status` ET `categories` entrent dans le checksum d'export du site
// (`catalog-export.ts`, `CHAMPS_PRODUIT_EXPORTES`), et `name` entre dans celui
// des catégories (`toExportCategory`). Une fiche dont l'un de ces champs
// change devient donc `modified` et repartira au prochain export du catalogue.
//
// **Ce n'est pas un défaut, c'est la conséquence** : le site doit apprendre
// qu'une fiche a changé de rangement ou d'état de publication. Mais elle doit
// être ANNONCÉE avec son nombre, sinon un export inattendu de plusieurs
// centaines de fiches surprend au pire moment. D'où `EffetExport`.
//
// `designation` est le seul des trois champs produits qui n'a AUCUN effet en
// ligne — il est nommément exclu de l'export (`catalog-export.ts:412`).
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/daos"
	"github.com/pocketbase/pocketbase/models"
)

// ═══════════════════════════════════════════════════════════════════════════
// LA LISTE BLANCHE
// ═══════════════════════════════════════════════════════════════════════════

// ChampsAutorises est la SEULE porte d'écriture de ce mécanisme.
//
// Ajouter une entrée ici, c'est décider d'écrire ce champ dans la base d'un
// magasin en service. Le faire sciemment — et jamais pour « pendant qu'on y
// est » : chaque champ ajouté est un champ que la restauration sélective peut
// écraser sans que personne ne l'ait demandé sur cette fiche-là.
//
// Gardien : `TestChampHorsListeBlancheRefuse`.
var ChampsAutorises = map[string][]string{
	"products":   {"categories", "status", "designation"},
	"categories": {"name"},
}

// ChampsProteges nomme ce qui ne doit JAMAIS bouger, pour que le test le dise
// explicitement plutôt que de le déduire de l'absence.
//
// **La protection est PAR COLLECTION, et ce n'est pas une subtilité inutile :**
// `name` est le champ à ramener sur une catégorie, et un champ à ne surtout pas
// toucher sur un produit — le nom d'un produit est celui de sa fiche en ligne
// (règle du 27 août 2026), `designation` étant celui du ticket. Une liste
// globale aurait forcé à choisir entre les deux, donc à se tromper d'un côté.
//
// `slug` et `legacy_id` sont dans les deux, pour deux raisons distinctes : le
// slug NOMME UNE PAGE EN LIGNE — il vit dans les favoris et l'index des
// moteurs, le retoucher déplace une adresse publique (CLAUDE.md, 20 août
// 2026) ; `legacy_id` est le pont entre les deux bases — le bouger casserait
// l'appariement de tout le reste, à commencer par le miroir des images, dont
// il nomme l'arborescence.
var ChampsProteges = map[string][]string{
	"products": {
		"slug", "legacy_id", "name", "image", "gallery", "stock", "stock_b", "price_ttc", "promo_price_ttc", "stock_b_price_ttc",
		"purchase_price_ht", "sku", "barcode", "brand", "supplier",
		"tax_rate", "min_stock", "manage_stock", "type", "commercial_state",
	},
	"categories": {
		"slug", "legacy_id", "image", "parent", "description", "is_featured",
	},
}

// autorise dit si `champ` peut être écrit dans `collection`.
func autorise(collection, champ string) bool {
	for _, c := range ChampsAutorises[collection] {
		if c == champ {
			return true
		}
	}
	return false
}

// ═══════════════════════════════════════════════════════════════════════════
// OUVRIR UN SNAPSHOT À CÔTÉ DE LA BASE EN SERVICE
// ═══════════════════════════════════════════════════════════════════════════

// OuvrirSnapshotLectureSeule ouvre une base SQLite en LECTURE SEULE.
//
// `mode=ro` n'est pas une politesse : c'est ce qui garantit que la règle
// « une seule connexion en écriture » de CLAUDE.md tient encore. SQLite refuse
// alors toute écriture au niveau du moteur (« attempt to write a readonly
// database », mesuré), et ne crée ni `-wal` ni `-shm` à côté du fichier — donc
// rien qui puisse être confondu avec la base en service.
//
// Le nom du driver est CHOISI et non écrit en dur. PocketBase enregistre
// `sqlite` (modernc) quand CGO est absent et `pb_sqlite3` (mattn) quand il est
// présent — `core/db_nocgo.go:16` et `core/db_cgo.go:22`. Le poste compile
// aujourd'hui sans CGO ; écrire « sqlite » en dur marcherait donc, et
// casserait le jour où la chaîne de compilation change, avec une erreur
// « unknown driver » que personne ne relierait à ce fichier.
func OuvrirSnapshotLectureSeule(chemin string) (*dbx.DB, error) {
	if _, err := os.Stat(chemin); err != nil {
		return nil, fmt.Errorf("snapshot introuvable : %w", err)
	}

	driver, err := driverSQLite()
	if err != nil {
		return nil, err
	}

	// URI SQLite : chemin en barres obliques, y compris sous Windows
	// (`file:C:/Users/…`). `busy_timeout` par prudence, bien que rien n'écrive
	// dans ce fichier.
	dsn := "file:" + filepath.ToSlash(chemin) + "?mode=ro&_pragma=busy_timeout(5000)"

	db, err := dbx.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("ouverture du snapshot en lecture seule : %w", err)
	}

	// Une lecture tout de suite : `dbx.Open` est paresseux, et un fichier qui
	// n'est pas une base SQLite ne se manifesterait qu'à la première requête,
	// c'est-à-dire au milieu du calcul d'écart.
	//
	// Et elle porte sur `sqlite_master`, PAS sur `SELECT 1` : mesuré, un
	// `SELECT 1` réussit sur un fichier texte, SQLite n'ouvrant réellement le
	// fichier qu'à la première lecture de son schéma. Le contrôle aurait donc
	// passé sur n'importe quoi.
	var tables int
	if err := db.NewQuery("SELECT count(*) FROM sqlite_master").Row(&tables); err != nil {
		db.Close()
		return nil, fmt.Errorf("snapshot illisible (n'est pas une base SQLite ?) : %w", err)
	}

	return db, nil
}

func driverSQLite() (string, error) {
	pilotes := map[string]bool{}
	for _, d := range sql.Drivers() {
		pilotes[d] = true
	}
	switch {
	case pilotes["sqlite"]:
		return "sqlite", nil
	case pilotes["pb_sqlite3"]:
		return "pb_sqlite3", nil
	case pilotes["sqlite3"]:
		return "sqlite3", nil
	}
	return "", fmt.Errorf("aucun pilote SQLite enregistré (drivers : %v)", sql.Drivers())
}

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE RAPPORT DIT
// ═══════════════════════════════════════════════════════════════════════════

// Changement — un champ, sa valeur d'avant et celle d'après.
//
// Tout est rendu EN CLAIR et EN FRANÇAIS, ici et pas dans l'écran : les
// catégories en noms plutôt qu'en identifiants, `draft` en « brouillon », et
// le champ sous son libellé métier. L'écran MONTRE ce qu'on lui donne, il ne
// traduit rien — sans quoi la même valeur finirait écrite de deux façons selon
// l'endroit, et c'est le genre d'écart qu'on ne remarque jamais.
//
// `Champ` reste le nom technique : il est la clé de `ParChamp`, et c'est lui
// qu'on cherche dans le code quand on veut comprendre une ligne.
type Changement struct {
	Champ   string `json:"champ"`
	Libelle string `json:"libelle"`
	Avant   string `json:"avant"`
	Apres   string `json:"apres"`
}

// libelleChamp donne le nom métier d'un champ. Les trois seuls qui existent.
func libelleChamp(champ string) string {
	switch champ {
	case "categories":
		return "catégories"
	case "status":
		return "publication"
	case "designation":
		return "désignation"
	case "name":
		return "nom"
	}
	return champ
}

// libelleStatut met `draft` / `published` en français. Une valeur inattendue
// est rendue telle quelle plutôt que masquée : mieux vaut voir un mot bizarre
// que croire à un mot juste.
func libelleStatut(valeur string) string {
	switch valeur {
	case "draft":
		return "brouillon"
	case "published":
		return "publié"
	case "":
		return "non renseigné"
	}
	return valeur
}

// FicheChangee — une fiche appariée dont au moins un champ diffère.
type FicheChangee struct {
	ID          string       `json:"id"`
	LegacyID    string       `json:"legacy_id"`
	Nom         string       `json:"nom"`
	ApparieePar string       `json:"appariee_par"` // "id" ou "legacy_id"
	Changements []Changement `json:"changements"`
}

// FicheNommee — une fiche qu'on ne touche pas, mais qu'on doit nommer.
type FicheNommee struct {
	ID       string `json:"id"`
	LegacyID string `json:"legacy_id"`
	Nom      string `json:"nom"`
	Motif    string `json:"motif"`
}

// EcartCollection — l'écart d'une collection, en compteurs et en exemples.
//
// Les compteurs sont calculés ICI et rendus tels quels. Ce n'est pas une
// commodité : c'est la même règle que pour les décomptes du catalogue et
// l'agrégation de la caisse (CLAUDE.md) — un chiffre recalculé côté React est
// un second calcul des mêmes règles, et deux calculs finissent par diverger.
type EcartCollection struct {
	Collection string `json:"collection"`

	LuesSnapshot int `json:"lues_snapshot"`
	LuesCible    int `json:"lues_cible"`

	ApparieesParID       int `json:"appariees_par_id"`
	ApparieesParLegacyID int `json:"appariees_par_legacy_id"`

	AChanger   int `json:"a_changer"`
	Identiques int `json:"identiques"`

	// Présentes dans le snapshot, absentes de la cible. Comptées, listées,
	// JAMAIS créées.
	NbAbsentesCible int           `json:"nb_absentes_cible"`
	AbsentesCible   []FicheNommee `json:"absentes_cible"`

	// Présentes dans la cible, absentes du snapshot. Intactes — c'est le
	// produit né en caisse chez le client.
	NbIntactes int `json:"nb_intactes"`

	// Appariées mais non écrites, avec le motif. Aujourd'hui : une catégorie
	// du snapshot que la cible ne connaît pas.
	NbEcartees int           `json:"nb_ecartees"`
	Ecartees   []FicheNommee `json:"ecartees"`

	// Combien de fiches changent, champ par champ.
	ParChamp map[string]int `json:"par_champ"`

	// Les premières fiches changées, nommées. Plafonnées : l'écran montre, il
	// n'a pas à recevoir 3000 lignes pour afficher un compteur.
	Exemples []FicheChangee `json:"exemples"`

	// Combien de fiches changées ne sont PAS dans la liste ci-dessus.
	// Compté ici plutôt que déduit côté écran : une liste plafonnée qui ne dit
	// pas qu'elle l'est ment par omission, et c'est précisément sur cette
	// liste qu'on décide d'écrire.
	ExemplesNonMontres int `json:"exemples_non_montres"`
}

// EcartMenu — le menu, qui se remplace en entier.
type EcartMenu struct {
	Snapshot     int           `json:"snapshot"`
	Cible        int           `json:"cible"`
	ACreer       int           `json:"a_creer"`
	AMettreAJour int           `json:"a_mettre_a_jour"`
	ASupprimer   int           `json:"a_supprimer"`
	Exemples     []FicheNommee `json:"exemples"`
}

// EffetExport — ce que cette restauration déclenchera vers le site.
//
// Annoncé AVANT d'écrire, avec ses nombres. Voir l'en-tête du fichier.
type EffetExport struct {
	ProduitsARepublier   int `json:"produits_a_republier"`
	CategoriesARepublier int `json:"categories_a_republier"`
}

// RapportSelectif — tout ce que l'écran affiche, et tout ce que l'écriture a
// fait quand elle a eu lieu.
type RapportSelectif struct {
	SnapshotID string `json:"snapshot_id"`
	Simulation bool   `json:"simulation"`

	Produits   EcartCollection `json:"produits"`
	Categories EcartCollection `json:"categories"`

	MenuDemande bool       `json:"menu_demande"`
	Menu        *EcartMenu `json:"menu"`

	Effet EffetExport `json:"effet_export"`

	// Renseignés seulement quand l'écriture a eu lieu.
	SauvegardeAvant string `json:"sauvegarde_avant"`
	Ecrites         int    `json:"ecrites"`
	DureeMs         int64  `json:"duree_ms"`
}

// MaxExemples plafonne ce qui remonte à l'écran. Assez pour reconnaître ce
// qu'on s'apprête à écrire, pas assez pour transporter le catalogue.
const MaxExemples = 40

// OptionsSelectif — ce que l'appelant décide.
type OptionsSelectif struct {
	// Appliquer à false (défaut) : rien n'est écrit. La simulation est le mode
	// par défaut, et c'est délibéré.
	Appliquer bool
	// AvecMenu à true : `site_menu` est remplacé en entier. Case distincte,
	// parce que c'est le seul geste qui crée et supprime.
	AvecMenu bool
	// CompanyID restreint le périmètre, quand il est renseigné.
	CompanyID string
	// DossierSauvegarde reçoit la copie d'avant écriture. Vide = `pb_data`.
	DossierSauvegarde string
}

// ═══════════════════════════════════════════════════════════════════════════
// LES LIGNES LUES DE PART ET D'AUTRE
// ═══════════════════════════════════════════════════════════════════════════

type ligneProduitSel struct {
	ID          string         `db:"id"`
	LegacyID    sql.NullString `db:"legacy_id"`
	Name        sql.NullString `db:"name"`
	Designation sql.NullString `db:"designation"`
	Status      sql.NullString `db:"status"`
	Categories  sql.NullString `db:"categories"`
	Company     sql.NullString `db:"company"`
}

type ligneCategorieSel struct {
	ID       string         `db:"id"`
	LegacyID sql.NullString `db:"legacy_id"`
	Name     sql.NullString `db:"name"`
	Company  sql.NullString `db:"company"`
}

type ligneMenuSel struct {
	ID       string         `db:"id"`
	Title    sql.NullString `db:"title"`
	Position sql.NullString `db:"position"`
	Visible  sql.NullString `db:"visible"`
	LinkType sql.NullString `db:"link_type"`
	LinkURL  sql.NullString `db:"link_url"`
	RefID    sql.NullString `db:"ref_id"`
	Parent   sql.NullString `db:"parent"`
}

func texte(v sql.NullString) string {
	if !v.Valid {
		return ""
	}
	return v.String
}

// idsRelation décode une relation multiple, stockée en tableau JSON par
// PocketBase. Tolère la chaîne nue : les bases anciennes en portent.
//
// Même règle que `decodeRelationMultiple`
// (backend/routes/catalog_counts_routes.go:313) — elle vit là-bas dans le
// paquet `routes`, et la redire ici est le prix de ne pas créer une dépendance
// de `backup` vers `routes`.
func idsRelation(v sql.NullString) []string {
	brut := strings.TrimSpace(texte(v))
	if brut == "" {
		return nil
	}
	if brut[0] != '[' {
		return []string{brut}
	}
	var ids []string
	if err := json.Unmarshal([]byte(brut), &ids); err != nil {
		return nil
	}
	sortie := make([]string, 0, len(ids))
	for _, id := range ids {
		if strings.TrimSpace(id) != "" {
			sortie = append(sortie, id)
		}
	}
	return sortie
}

// ═══════════════════════════════════════════════════════════════════════════
// L'APPARIEMENT
// ═══════════════════════════════════════════════════════════════════════════

// index range les fiches de la cible par `id` et par `legacy_id`.
type index struct {
	parID     map[string]string // id → id (présence)
	parLegacy map[string]string // legacy_id → id
}

func (i index) resoudre(id, legacyID string) (cible string, par string) {
	if id != "" {
		if _, ok := i.parID[id]; ok {
			return id, "id"
		}
	}
	// Repli, et seulement en repli : un `legacy_id` vide n'apparie rien.
	// PocketBase stocke '' et non NULL (catalog_v2.go, index partiels), donc
	// sans ce test toutes les fiches sans clé stable s'apparieraient entre
	// elles.
	if legacyID != "" {
		if c, ok := i.parLegacy[legacyID]; ok {
			return c, "legacy_id"
		}
	}
	return "", ""
}

// ═══════════════════════════════════════════════════════════════════════════
// LE CALCUL, PUIS — ET SEULEMENT ALORS — L'ÉCRITURE
// ═══════════════════════════════════════════════════════════════════════════

// RestaurerSelectivement compare un snapshot à la base en service et, si on le
// lui demande, applique l'écart.
//
// Le calcul est le MÊME dans les deux modes : la simulation n'est pas un
// chemin de code parallèle, c'est le même chemin qui s'arrête avant d'écrire.
// C'est ce qui rend l'aperçu fiable — un aperçu calculé autrement que
// l'écriture est un aperçu qui ment tôt ou tard.
func RestaurerSelectivement(
	app *pocketbase.PocketBase,
	cheminSnapshot string,
	idSnapshot string,
	opts OptionsSelectif,
) (*RapportSelectif, error) {
	debut := time.Now()

	snap, err := OuvrirSnapshotLectureSeule(cheminSnapshot)
	if err != nil {
		return nil, err
	}
	defer snap.Close()

	rapport := &RapportSelectif{
		SnapshotID:  idSnapshot,
		Simulation:  !opts.Appliquer,
		MenuDemande: opts.AvecMenu,
	}

	// ── Les catégories d'abord : les produits ont besoin de leur index ─────
	catsCible, err := lireCategories(app.Dao().DB(), opts.CompanyID)
	if err != nil {
		return nil, fmt.Errorf("catégories de la base en service : %w", err)
	}
	catsSnap, err := lireCategories(snap, opts.CompanyID)
	if err != nil {
		return nil, fmt.Errorf("catégories du snapshot : %w", err)
	}
	idxCats := indexerCategories(catsCible)

	ecartCats, plansCats := comparerCategories(catsSnap, catsCible, idxCats)
	rapport.Categories = ecartCats

	// ── Les produits ───────────────────────────────────────────────────────
	produitsCible, err := lireProduits(app.Dao().DB(), opts.CompanyID)
	if err != nil {
		return nil, fmt.Errorf("produits de la base en service : %w", err)
	}
	produitsSnap, err := lireProduits(snap, opts.CompanyID)
	if err != nil {
		return nil, fmt.Errorf("produits du snapshot : %w", err)
	}

	// Les catégories du SNAPSHOT sont désignées par leurs identifiants ; il
	// faut les traduire vers ceux de la CIBLE avant d'écrire un rattachement.
	// Une catégorie que la cible ne connaît pas ne peut pas être inventée
	// (rien ne se crée) : la fiche est alors écartée et nommée, plutôt que
	// rattachée à moitié en silence.
	traduireCat := traducteurCategories(catsSnap, idxCats)

	// De quoi écrire l'écart EN NOMS et non en identifiants. Ce n'est pas du
	// confort : un écart annoncé « ["gaavzs5px299owy"] → ["gaavzs5px299owy",
	// "72c0cbdwld339gj"] » est illisible, donc invérifiable, donc on ne peut
	// que le croire sur parole — et c'est exactement ce qu'un écran qui
	// s'apprête à écrire dans la base d'un magasin ne doit pas demander.
	nomCat := nomsDeCategories(catsCible, catsSnap)

	ecartProduits, plansProduits := comparerProduits(produitsSnap, produitsCible, traduireCat, nomCat)
	rapport.Produits = ecartProduits

	// ── Le menu, si demandé ────────────────────────────────────────────────
	var planMenu *planMenuComplet
	if opts.AvecMenu {
		planMenu, err = comparerMenu(snap, app.Dao().DB())
		if err != nil {
			return nil, fmt.Errorf("menu : %w", err)
		}
		rapport.Menu = &planMenu.Ecart
	}

	// ── Ce que ça déclenchera vers le site ─────────────────────────────────
	rapport.Effet = effetExport(plansProduits, plansCats)

	if !opts.Appliquer {
		rapport.DureeMs = time.Since(debut).Milliseconds()
		return rapport, nil
	}

	// ── Rien à écrire : on ne sauvegarde pas pour rien ─────────────────────
	//
	// Une sauvegarde d'avant pèse la base entière (15 Mio sur celle du client).
	// Appliquer un écart vide en déposerait une à chaque clic, sur le disque
	// d'un poste de magasin, pour protéger de zéro écriture.
	if len(plansProduits) == 0 && len(plansCats) == 0 &&
		(planMenu == nil || (planMenu.Ecart.ACreer == 0 &&
			planMenu.Ecart.AMettreAJour == 0 && planMenu.Ecart.ASupprimer == 0)) {
		rapport.DureeMs = time.Since(debut).Milliseconds()
		return rapport, nil
	}

	// ── Sauvegarder AVANT d'écrire ─────────────────────────────────────────
	dossier := opts.DossierSauvegarde
	if dossier == "" {
		dossier = app.DataDir()
	}
	chemin, err := SauvegarderAvantEcriture(app.Dao().DB(), dossier)
	if err != nil {
		return nil, fmt.Errorf("SAUVEGARDE IMPOSSIBLE, rien n'a été écrit : %w", err)
	}
	rapport.SauvegardeAvant = chemin

	ecrites, err := appliquer(app, plansProduits, plansCats, planMenu)
	if err != nil {
		return nil, err
	}
	rapport.Ecrites = ecrites
	rapport.DureeMs = time.Since(debut).Milliseconds()

	log.Printf("♻️  restauration sélective %s : %d enregistrements écrits, base d'avant dans %s",
		idSnapshot, ecrites, chemin)
	return rapport, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// LECTURES
// ═══════════════════════════════════════════════════════════════════════════

func lireCategories(db dbx.Builder, companyID string) ([]ligneCategorieSel, error) {
	var lignes []ligneCategorieSel
	q := db.Select("id", "legacy_id", "name", "company").From("categories")
	if companyID != "" {
		q = q.Where(dbx.HashExp{"company": companyID})
	}
	if err := q.All(&lignes); err != nil {
		return nil, err
	}
	return lignes, nil
}

func lireProduits(db dbx.Builder, companyID string) ([]ligneProduitSel, error) {
	var lignes []ligneProduitSel
	// `slug` n'est PAS lu, et ce n'est pas un oubli : rien ici n'a de raison de
	// le connaître, et un champ qu'on ne lit pas est un champ qu'on ne peut pas
	// écrire par distraction.
	q := db.Select("id", "legacy_id", "name", "designation", "status", "categories", "company").
		From("products")
	if companyID != "" {
		q = q.Where(dbx.HashExp{"company": companyID})
	}
	if err := q.All(&lignes); err != nil {
		return nil, err
	}
	return lignes, nil
}

func indexerCategories(lignes []ligneCategorieSel) index {
	idx := index{
		parID:     make(map[string]string, len(lignes)),
		parLegacy: make(map[string]string, len(lignes)),
	}
	for _, l := range lignes {
		idx.parID[l.ID] = l.ID
		if legacy := strings.TrimSpace(texte(l.LegacyID)); legacy != "" {
			idx.parLegacy[legacy] = l.ID
		}
	}
	return idx
}

// nomsDeCategories rend une fonction « identifiant → nom lisible ».
//
// La cible d'abord — c'est la base où l'on écrit, donc la référence — et le
// snapshot en complément, pour pouvoir nommer une catégorie qu'elle ne connaît
// pas encore : c'est justement le cas qu'il faut afficher en clair, puisqu'il
// écarte la fiche.
func nomsDeCategories(cible, snap []ligneCategorieSel) func(string) string {
	noms := make(map[string]string, len(cible)+len(snap))
	for _, c := range snap {
		noms[c.ID] = texte(c.Name)
	}
	for _, c := range cible {
		noms[c.ID] = texte(c.Name)
	}
	return func(id string) string {
		if nom := noms[id]; nom != "" {
			return nom
		}
		// Jamais vide : un tiret ne dirait pas de quoi on parle, l'identifiant
		// au moins se recherche.
		return id
	}
}

// listerNoms met une liste d'identifiants en toutes lettres, dans l'ordre.
func listerNoms(ids []string, nomDe func(string) string) string {
	if len(ids) == 0 {
		return "aucune"
	}
	noms := make([]string, 0, len(ids))
	for _, id := range ids {
		noms = append(noms, nomDe(id))
	}
	return strings.Join(noms, ", ")
}

// traducteurCategories rend une fonction « id de catégorie côté snapshot → id
// côté cible », ou "" si la cible ne la connaît pas.
func traducteurCategories(catsSnap []ligneCategorieSel, idxCible index) func(string) string {
	legacyDe := make(map[string]string, len(catsSnap))
	for _, c := range catsSnap {
		legacyDe[c.ID] = strings.TrimSpace(texte(c.LegacyID))
	}
	return func(idSnap string) string {
		cible, _ := idxCible.resoudre(idSnap, legacyDe[idSnap])
		return cible
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// LES PLANS D'ÉCRITURE — ce qui sera écrit, calculé avant de savoir si on écrit
// ═══════════════════════════════════════════════════════════════════════════

// planFiche décrit UNE écriture : un enregistrement, et les champs à poser.
// `Valeurs` ne devrait contenir que des champs de `ChampsAutorises` — c'est
// vérifié À L'ÉCRITURE, et pas seulement à la construction.
type planFiche struct {
	Collection string
	IDCible    string
	Valeurs    map[string]any
	// Pour l'affichage et l'effet d'export.
	Nom          string
	ToucheExport bool
}

func comparerCategories(
	snap, cible []ligneCategorieSel,
	idx index,
) (EcartCollection, []planFiche) {
	ecart := EcartCollection{
		Collection:   "categories",
		LuesSnapshot: len(snap),
		LuesCible:    len(cible),
		ParChamp:     map[string]int{},
		// Slices NON NILLES, et c'est un point de CONTRAT, pas de style : un
		// slice nil se sérialise en JSON `null`, pas `[]`, et l'écran fait
		// `.length` dessus. Mesuré le 6 septembre 2026 — « Cannot read
		// properties of null (reading 'length') » sur le premier écart sans
		// exemple. C'est une faute qui ne se voit qu'en production, parce
		// qu'un test Go compare des slices et se moque de leur nullité.
		AbsentesCible: []FicheNommee{},
		Ecartees:      []FicheNommee{},
		Exemples:      []FicheChangee{},
	}
	var plans []planFiche

	parID := make(map[string]ligneCategorieSel, len(cible))
	for _, l := range cible {
		parID[l.ID] = l
	}

	// Ce que le snapshot a apparié, pour compter les intactes de la cible.
	appariees := map[string]bool{}

	for _, s := range snap {
		legacy := strings.TrimSpace(texte(s.LegacyID))
		idCible, par := idx.resoudre(s.ID, legacy)
		if idCible == "" {
			ecart.NbAbsentesCible++
			if len(ecart.AbsentesCible) < MaxExemples {
				ecart.AbsentesCible = append(ecart.AbsentesCible, FicheNommee{
					ID: s.ID, LegacyID: legacy, Nom: texte(s.Name),
					Motif: "absente de la base — comptée, jamais créée",
				})
			}
			continue
		}
		appariees[idCible] = true
		if par == "id" {
			ecart.ApparieesParID++
		} else {
			ecart.ApparieesParLegacyID++
		}

		actuelle := parID[idCible]
		nomSnap := texte(s.Name)
		nomCible := texte(actuelle.Name)
		if nomSnap == nomCible {
			ecart.Identiques++
			continue
		}

		ecart.AChanger++
		ecart.ParChamp["name"]++
		if len(ecart.Exemples) < MaxExemples {
			ecart.Exemples = append(ecart.Exemples, FicheChangee{
				ID: idCible, LegacyID: legacy, Nom: nomCible, ApparieePar: par,
				Changements: []Changement{{
					Champ:   "name",
					Libelle: libelleChamp("name"),
					Avant:   nomCible,
					Apres:   nomSnap,
				}},
			})
		}
		plans = append(plans, planFiche{
			Collection: "categories",
			IDCible:    idCible,
			Valeurs:    map[string]any{"name": nomSnap},
			Nom:        nomSnap,
			// `name` entre dans `toExportCategory` : la catégorie repartira.
			ToucheExport: true,
		})
	}

	ecart.NbIntactes = len(cible) - len(appariees)
	ecart.ExemplesNonMontres = ecart.AChanger - len(ecart.Exemples)
	return ecart, plans
}

func comparerProduits(
	snap, cible []ligneProduitSel,
	traduireCat func(string) string,
	nomCat func(string) string,
) (EcartCollection, []planFiche) {
	ecart := EcartCollection{
		Collection:   "products",
		LuesSnapshot: len(snap),
		LuesCible:    len(cible),
		ParChamp:     map[string]int{},
		// Slices NON NILLES, et c'est un point de CONTRAT, pas de style : un
		// slice nil se sérialise en JSON `null`, pas `[]`, et l'écran fait
		// `.length` dessus. Mesuré le 6 septembre 2026 — « Cannot read
		// properties of null (reading 'length') » sur le premier écart sans
		// exemple. C'est une faute qui ne se voit qu'en production, parce
		// qu'un test Go compare des slices et se moque de leur nullité.
		AbsentesCible: []FicheNommee{},
		Ecartees:      []FicheNommee{},
		Exemples:      []FicheChangee{},
	}
	var plans []planFiche

	idx := index{
		parID:     make(map[string]string, len(cible)),
		parLegacy: make(map[string]string, len(cible)),
	}
	parID := make(map[string]ligneProduitSel, len(cible))
	for _, l := range cible {
		idx.parID[l.ID] = l.ID
		parID[l.ID] = l
		if legacy := strings.TrimSpace(texte(l.LegacyID)); legacy != "" {
			idx.parLegacy[legacy] = l.ID
		}
	}

	appariees := map[string]bool{}

	for _, s := range snap {
		legacy := strings.TrimSpace(texte(s.LegacyID))
		idCible, par := idx.resoudre(s.ID, legacy)
		if idCible == "" {
			ecart.NbAbsentesCible++
			if len(ecart.AbsentesCible) < MaxExemples {
				ecart.AbsentesCible = append(ecart.AbsentesCible, FicheNommee{
					ID: s.ID, LegacyID: legacy, Nom: texte(s.Name),
					Motif: "absent de la base — compté, jamais créé",
				})
			}
			continue
		}
		appariees[idCible] = true
		if par == "id" {
			ecart.ApparieesParID++
		} else {
			ecart.ApparieesParLegacyID++
		}

		actuel := parID[idCible]

		// ── Les catégories, traduites avant d'être comparées ───────────────
		voulues := make([]string, 0, 4)
		var perdue string
		for _, idCat := range idsRelation(s.Categories) {
			trad := traduireCat(idCat)
			if trad == "" {
				perdue = idCat
				break
			}
			voulues = append(voulues, trad)
		}
		if perdue != "" {
			ecart.NbEcartees++
			if len(ecart.Ecartees) < MaxExemples {
				ecart.Ecartees = append(ecart.Ecartees, FicheNommee{
					ID: idCible, LegacyID: legacy, Nom: texte(actuel.Name),
					Motif: "la catégorie « " + nomCat(perdue) +
						" » n'existe pas dans cette base — fiche laissée telle quelle",
				})
			}
			continue
		}

		actuelles := idsRelation(actuel.Categories)

		var changements []Changement
		valeurs := map[string]any{}
		toucheExport := false

		if !memesIDs(voulues, actuelles) {
			changements = append(changements, Changement{
				Champ:   "categories",
				Libelle: libelleChamp("categories"),
				// EN NOMS. Voir `nomsDeCategories` : un écart en identifiants
				// ne se vérifie pas, il se croit.
				Avant: listerNoms(actuelles, nomCat),
				Apres: listerNoms(voulues, nomCat),
			})
			// L'ORDRE DU SNAPSHOT est conservé : PocketBase garde l'ordre d'une
			// relation multiple, et le trier ici changerait une donnée qu'on
			// n'a pas été autorisé à changer.
			valeurs["categories"] = voulues
			ecart.ParChamp["categories"]++
			toucheExport = true
		}

		statutSnap, statutCible := texte(s.Status), texte(actuel.Status)
		if statutSnap != statutCible && statutSnap != "" {
			changements = append(changements, Changement{
				Champ:   "status",
				Libelle: libelleChamp("status"),
				Avant:   libelleStatut(statutCible),
				Apres:   libelleStatut(statutSnap),
			})
			valeurs["status"] = statutSnap
			ecart.ParChamp["status"]++
			toucheExport = true
		}

		desSnap, desCible := texte(s.Designation), texte(actuel.Designation)
		if desSnap != desCible {
			changements = append(changements, Changement{
				Champ:   "designation",
				Libelle: libelleChamp("designation"),
				Avant:   desCible,
				Apres:   desSnap,
			})
			valeurs["designation"] = desSnap
			ecart.ParChamp["designation"]++
			// `designation` est nommément EXCLUE de l'export du site
			// (catalog-export.ts:412) : elle ne republie rien.
		}

		if len(valeurs) == 0 {
			ecart.Identiques++
			continue
		}

		ecart.AChanger++
		if len(ecart.Exemples) < MaxExemples {
			ecart.Exemples = append(ecart.Exemples, FicheChangee{
				ID: idCible, LegacyID: legacy, Nom: texte(actuel.Name),
				ApparieePar: par, Changements: changements,
			})
		}
		plans = append(plans, planFiche{
			Collection:   "products",
			IDCible:      idCible,
			Valeurs:      valeurs,
			Nom:          texte(actuel.Name),
			ToucheExport: toucheExport,
		})
	}

	ecart.NbIntactes = len(cible) - len(appariees)
	ecart.ExemplesNonMontres = ecart.AChanger - len(ecart.Exemples)
	return ecart, plans
}

// memesIDs compare deux listes de relations SANS tenir compte de l'ordre.
//
// L'ordre des catégories d'un produit n'a aucun lecteur — contrairement à celui
// de `gallery`, qui EST l'ordre des vignettes (CLAUDE.md, 19 août 2026).
// Comparer en tenant compte de l'ordre déclarerait « modifiées » des fiches
// dont rien n'a bougé, et ferait repartir des centaines de produits à l'export
// pour rien.
func memesIDs(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	x := append([]string{}, a...)
	y := append([]string{}, b...)
	sort.Strings(x)
	sort.Strings(y)
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}

func effetExport(produits, categories []planFiche) EffetExport {
	var e EffetExport
	for _, p := range produits {
		if p.ToucheExport {
			e.ProduitsARepublier++
		}
	}
	for _, c := range categories {
		if c.ToucheExport {
			e.CategoriesARepublier++
		}
	}
	return e
}

// ═══════════════════════════════════════════════════════════════════════════
// LE MENU
// ═══════════════════════════════════════════════════════════════════════════

type planMenuComplet struct {
	Ecart EcartMenu
	// Les entrées du snapshot, dans l'ordre de lecture.
	Entrees []ligneMenuSel
	// Les identifiants de la cible qui ne sont pas dans le snapshot.
	ASupprimer []string
}

func comparerMenu(snap, cible dbx.Builder) (*planMenuComplet, error) {
	lire := func(db dbx.Builder) ([]ligneMenuSel, error) {
		var lignes []ligneMenuSel
		err := db.Select("id", "title", "position", "visible", "link_type", "link_url", "ref_id", "parent").
			From("site_menu").All(&lignes)
		return lignes, err
	}

	entrees, err := lire(snap)
	if err != nil {
		return nil, err
	}
	actuelles, err := lire(cible)
	if err != nil {
		return nil, err
	}

	dansSnap := make(map[string]bool, len(entrees))
	for _, e := range entrees {
		dansSnap[e.ID] = true
	}
	dansCible := make(map[string]bool, len(actuelles))
	for _, a := range actuelles {
		dansCible[a.ID] = true
	}

	plan := &planMenuComplet{
		Ecart: EcartMenu{
			Snapshot: len(entrees),
			Cible:    len(actuelles),
			// Non nil : voir `comparerCategories`. Un slice nil part en JSON
			// `null`, et l'écran lit `.length` dessus.
			Exemples: []FicheNommee{},
		},
		Entrees: entrees,
	}

	for _, e := range entrees {
		if dansCible[e.ID] {
			plan.Ecart.AMettreAJour++
			continue
		}
		plan.Ecart.ACreer++
		if len(plan.Ecart.Exemples) < MaxExemples {
			plan.Ecart.Exemples = append(plan.Ecart.Exemples, FicheNommee{
				ID: e.ID, Nom: texte(e.Title), Motif: "à créer",
			})
		}
	}
	for _, a := range actuelles {
		if dansSnap[a.ID] {
			continue
		}
		plan.ASupprimer = append(plan.ASupprimer, a.ID)
		plan.Ecart.ASupprimer++
		if len(plan.Ecart.Exemples) < MaxExemples {
			plan.Ecart.Exemples = append(plan.Ecart.Exemples, FicheNommee{
				ID: a.ID, Nom: texte(a.Title), Motif: "à supprimer",
			})
		}
	}

	return plan, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ÉCRITURE — une seule transaction, par le DAO
// ═══════════════════════════════════════════════════════════════════════════

// appliquerChamps pose les valeurs sur un enregistrement APRÈS avoir vérifié
// que chacune est dans la liste blanche de sa collection.
//
// C'est la garde structurelle : même si un plan portait un champ interdit —
// parce que le snapshot le porte, parce qu'un appelant s'est trompé —, il ne
// peut pas être écrit. Le refus fait ÉCHOUER la transaction : écrire les champs
// légitimes et taire le refus laisserait une base à moitié restaurée que
// personne n'aurait demandée.
func appliquerChamps(rec *models.Record, collection string, valeurs map[string]any) error {
	// Ordre stable : une map Go s'itère au hasard, et un message d'erreur qui
	// change d'un essai à l'autre est un message qu'on ne croit pas.
	champs := make([]string, 0, len(valeurs))
	for c := range valeurs {
		champs = append(champs, c)
	}
	sort.Strings(champs)

	for _, champ := range champs {
		if !autorise(collection, champ) {
			return fmt.Errorf(
				"champ %q hors liste blanche pour %q : la restauration sélective n'écrit que %v",
				champ, collection, ChampsAutorises[collection])
		}
		rec.Set(champ, valeurs[champ])
	}
	return nil
}

func appliquer(
	app *pocketbase.PocketBase,
	produits, categories []planFiche,
	menu *planMenuComplet,
) (int, error) {
	var ecrites int

	// Les catégories d'abord : si l'une d'elles est renommée ET rattachée à un
	// produit dans la même passe, l'ordre ne change rien au résultat — mais il
	// rend le journal lisible, et un échec s'arrête toujours au même endroit.
	tout := append(append([]planFiche{}, categories...), produits...)

	err := app.Dao().RunInTransaction(func(tx *daos.Dao) error {
		for _, plan := range tout {
			rec, err := tx.FindRecordById(plan.Collection, plan.IDCible)
			if err != nil {
				return fmt.Errorf("%s %s introuvable : %w", plan.Collection, plan.IDCible, err)
			}

			// ── L'assertion qui protège l'adresse publique ─────────────────
			// `SaveRecord` réécrit la ligne ENTIÈRE, avec les valeurs lues
			// juste au-dessus dans la même transaction : le slug repart donc
			// identique. Mais « repart identique » est une propriété qu'on
			// vérifie, pas une qu'on espère — un `Set` malencontreux ailleurs
			// dans ce fichier ne se manifesterait autrement que par une page
			// en ligne qui rend « Produit introuvable ».
			slugAvant := rec.GetString("slug")
			legacyAvant := rec.GetString("legacy_id")

			if err := appliquerChamps(rec, plan.Collection, plan.Valeurs); err != nil {
				return err
			}

			if rec.GetString("slug") != slugAvant {
				return fmt.Errorf("REFUS : le slug de %s %s allait changer (%q → %q)",
					plan.Collection, plan.IDCible, slugAvant, rec.GetString("slug"))
			}
			if rec.GetString("legacy_id") != legacyAvant {
				return fmt.Errorf("REFUS : le legacy_id de %s %s allait changer (%q → %q)",
					plan.Collection, plan.IDCible, legacyAvant, rec.GetString("legacy_id"))
			}

			if err := tx.SaveRecord(rec); err != nil {
				return fmt.Errorf("écriture de %s %s : %w", plan.Collection, plan.IDCible, err)
			}
			ecrites++
		}

		if menu == nil {
			return nil
		}
		n, err := appliquerMenu(tx, menu)
		ecrites += n
		return err
	})

	if err != nil {
		return 0, err
	}
	return ecrites, nil
}

// appliquerMenu remplace `site_menu` par celui du snapshot.
//
// Trois passes, et l'ordre compte :
//
//  1. les nœuds, SANS leur `parent` — poser un parent qui n'existe pas encore
//     serait refusé par la relation ;
//  2. les `parent`, une fois que tous les nœuds existent ;
//  3. les surnuméraires, en dernier. `site_menu.parent` est en CascadeDelete
//     (backend/migrations/site_menu.go:151) : supprimer un parent emporte ses
//     enfants. C'est voulu ici — un enfant légitime a déjà été rerattaché à la
//     passe 2 —, mais cela veut dire qu'une suppression peut en avoir déjà
//     emporté une autre, d'où la tolérance à l'absence.
func appliquerMenu(tx *daos.Dao, plan *planMenuComplet) (int, error) {
	col, err := tx.FindCollectionByNameOrId("site_menu")
	if err != nil {
		return 0, err
	}

	var ecrites int

	for _, e := range plan.Entrees {
		rec, err := tx.FindRecordById("site_menu", e.ID)
		if err != nil {
			// Recréée SOUS SON IDENTIFIANT D'ORIGINE : c'est ce qui rend les
			// rattachements `parent` du snapshot utilisables tels quels, et
			// l'opération rejouable sans dupliquer l'arbre.
			rec = models.NewRecord(col)
			rec.SetId(e.ID)
			rec.MarkAsNew()
		}
		rec.Set("title", texte(e.Title))
		rec.Set("position", texte(e.Position))
		rec.Set("visible", texte(e.Visible))
		rec.Set("link_type", texte(e.LinkType))
		rec.Set("link_url", texte(e.LinkURL))
		rec.Set("ref_id", texte(e.RefID))
		if err := tx.SaveRecord(rec); err != nil {
			return ecrites, fmt.Errorf("menu, entrée %s : %w", e.ID, err)
		}
		ecrites++
	}

	for _, e := range plan.Entrees {
		parent := strings.TrimSpace(texte(e.Parent))
		rec, err := tx.FindRecordById("site_menu", e.ID)
		if err != nil {
			return ecrites, err
		}
		if rec.GetString("parent") == parent {
			continue
		}
		rec.Set("parent", parent)
		if err := tx.SaveRecord(rec); err != nil {
			return ecrites, fmt.Errorf("menu, rattachement de %s : %w", e.ID, err)
		}
	}

	for _, id := range plan.ASupprimer {
		rec, err := tx.FindRecordById("site_menu", id)
		if err != nil {
			continue // déjà emportée par la cascade d'un parent supprimé
		}
		if err := tx.DeleteRecord(rec); err != nil {
			return ecrites, fmt.Errorf("menu, suppression de %s : %w", id, err)
		}
		ecrites++
	}

	return ecrites, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// LA SAUVEGARDE D'AVANT
// ═══════════════════════════════════════════════════════════════════════════

// SauvegarderAvantEcriture dépose une copie horodatée de la base AVANT toute
// écriture, et rend son chemin.
//
// ─── Pourquoi VACUUM INTO et non la copie des trois fichiers ───────────────
// `sauvegarderBase` (backend/cmd/catalog-rattraper/main.go:404) copie
// `data.db`, `-wal` et `-shm`. C'est correct LÀ-BAS, parce que l'outil refuse
// de tourner tant que PocketApp est ouvert : personne n'écrit pendant la copie.
//
// Ici la base est EN SERVICE — c'est tout l'objet d'une restauration à chaud.
// Copier les trois fichiers pendant qu'une vente s'écrit donne une base
// incohérente, silencieusement : c'est le défaut que docs/SAUVEGARDE.md §2
// documente, et la raison pour laquelle la sauvegarde du dépôt passe déjà par
// `VACUUM INTO`. On fait donc ici ce que fait `Fabriquer` : une base neuve,
// complète et cohérente à l'instant du début, WAL replié dedans. Elle n'a ni
// `-wal` ni `-shm` — il n'y a rien à recoller, elle se remet en place seule.
//
// `storage/` n'est pas copié : la restauration sélective n'écrit aucun champ
// fichier (`image` et `gallery` sont hors liste blanche), donc aucun octet
// d'image ne peut bouger.
func SauvegarderAvantEcriture(db dbx.Builder, dossier string) (string, error) {
	dest := filepath.Join(dossier,
		"avant-restauration-selective-"+time.Now().Format("20060102-150405"))
	if _, err := os.Stat(dest); err == nil {
		return "", fmt.Errorf("%q existe déjà — refus d'écraser une sauvegarde", dest)
	}
	if err := os.MkdirAll(dest, 0o700); err != nil {
		return "", err
	}

	cible := filepath.Join(dest, "data.db")
	// Même précaution que `Fabriquer` : SQLite ne lie pas de paramètre dans un
	// VACUUM, le guillemet simple se double à la main.
	cheminSQL := strings.ReplaceAll(filepath.ToSlash(cible), "'", "''")
	if _, err := db.NewQuery("VACUUM INTO '" + cheminSQL + "'").Execute(); err != nil {
		return "", fmt.Errorf("VACUUM INTO : %w", err)
	}

	info, err := os.Stat(cible)
	if err != nil {
		return "", fmt.Errorf("sauvegarde illisible après VACUUM : %w", err)
	}
	log.Printf("💾 base sauvegardée avant restauration sélective : %s (%d Kio)",
		cible, info.Size()/1024)
	return dest, nil
}
