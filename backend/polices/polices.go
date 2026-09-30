// backend/polices/polices.go
//
// LES FICHIERS DE POLICE, pour le contour vectoriel des lettres de PocketStick
// (frontend/modules/stick/PocketStick-docs/07-contour-lettres.md).
//
// Le navigateur dessine les lettres sans jamais exposer leur géométrie ; pour
// en tracer le contour, le renderer lit le fichier de police lui-même
// (opentype.js). Ce paquet le lui fournit, en TTF :
//
//   - police système (Arial, Segoe UI…) : lue dans %WINDIR%\Fonts ;
//   - police Google : téléchargée UNE fois depuis fonts.googleapis.com /
//     fonts.gstatic.com, puis gardée sur disque — le poste Wails la retrouve
//     hors ligne. Google sert du TTF (et non du WOFF2) à un agent utilisateur
//     qui n'est pas un navigateur : c'est ce qui permet de se passer d'un
//     décompresseur WOFF2 côté renderer.
//
// Sortie réseau déclarée dans CLAUDE.md (point 9).

package polices

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Graisses servies : celles que `loadGoogleFont` demande au navigateur.
var graissesAdmises = map[int]bool{400: true, 700: true}

// Taille maximale d'un fichier de police accepté (les TTF Google font
// 50 à 800 Kio ; les CJK dépassent, et ne sont pas au catalogue).
const tailleMax = 8 << 20

const agentUtilisateur = "PocketApp/1.0 (polices)"

// ErrInconnue : ni police système connue, ni famille servie par Google.
var ErrInconnue = errors.New("police inconnue")

var familleValide = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$`)

// Famille normalisée (espaces simples), ou erreur si le nom est invalide.
func NormaliserFamille(famille string) (string, error) {
	f := strings.Join(strings.Fields(famille), " ")
	if !familleValide.MatchString(f) {
		return "", fmt.Errorf("nom de police invalide : %q", famille)
	}
	return f, nil
}

// Polices système : famille → fichiers [normal, gras, italique, gras
// italique] dans %WINDIR%\Fonts ; "" = le navigateur FABRIQUE ce style (le
// renderer le reproduit). Windows livre de vrais italiques : les servir, c'est
// ce qui aligne le contour sur « Arial gras italique » (0,64 px d'écart sans,
// mesuré le 30/09/2026 — PocketStick-docs/07-contour-lettres.md).
// Même liste que `SYSTEM_FONTS` (utils/loadGoogleFont.js), moins les
// génériques et les .ttc (collections, qu'opentype.js ne lit pas).
// Helvetica n'existe pas sous Windows : le navigateur la remplace par Arial.
var policesSysteme = map[string][4]string{
	"arial":                  {"arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"},
	"helvetica":              {"arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"},
	"times new roman":        {"times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"},
	"courier new":            {"cour.ttf", "courbd.ttf", "couri.ttf", "courbi.ttf"},
	"verdana":                {"verdana.ttf", "verdanab.ttf", "verdanai.ttf", "verdanaz.ttf"},
	"georgia":                {"georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf"},
	"trebuchet ms":           {"trebuc.ttf", "trebucbd.ttf", "trebucit.ttf", "trebucbi.ttf"},
	"tahoma":                 {"tahoma.ttf", "tahomabd.ttf", "", ""},
	"segoe ui":               {"segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"},
	"calibri":                {"calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf"},
	"consolas":               {"consola.ttf", "consolab.ttf", "consolai.ttf", "consolaz.ttf"},
	"candara":                {"Candara.ttf", "Candarab.ttf", "Candarai.ttf", "Candaraz.ttf"},
	"franklin gothic medium": {"framd.ttf", "", "framdit.ttf", ""},
}

// Police : les octets TTF et la graisse RÉELLEMENT servie — une famille sans
// gras (Bebas Neue) rend son 400, et c'est au renderer de savoir que le
// navigateur a alors fabriqué le gras.
type Police struct {
	Octets  []byte
	Graisse int
	// Italique : un VRAI fichier italique est servi. Faux quand l'italique
	// est demandé mais fabriqué par le navigateur (polices Google, chargées
	// en 400/700 seulement : `loadGoogleFont`).
	Italique bool
	Source   string // "systeme" | "google" | "cache"
}

// Fournisseur de polices, avec son dossier de cache.
type Fournisseur struct {
	Dossier       string // cache des polices Google
	DossierSystem string // %WINDIR%\Fonts
	Client        *http.Client
	BaseCSS       string // https://fonts.googleapis.com/css2 (remplacé en test)

	verrous sync.Map // clé → *sync.Mutex : un seul téléchargement par police
}

// Nouveau fournisseur : cache dans `dossier`.
func Nouveau(dossier string) *Fournisseur {
	windir := os.Getenv("WINDIR")
	if windir == "" {
		windir = `C:\Windows`
	}
	return &Fournisseur{
		Dossier:       dossier,
		DossierSystem: filepath.Join(windir, "Fonts"),
		Client:        &http.Client{Timeout: 20 * time.Second},
		BaseCSS:       "https://fonts.googleapis.com/css2",
	}
}

// Lire rend la police `famille` en `graisse` (400 ou 700), en italique si
// demandé ET si un vrai fichier existe (polices système seulement).
func (f *Fournisseur) Lire(ctx context.Context, famille string, graisse int, italique bool) (*Police, error) {
	fam, err := NormaliserFamille(famille)
	if err != nil {
		return nil, err
	}
	if !graissesAdmises[graisse] {
		return nil, fmt.Errorf("graisse non servie : %d", graisse)
	}

	if fichiers, ok := policesSysteme[strings.ToLower(fam)]; ok {
		// Le style le plus proche qui existe : sans gras, le navigateur le
		// fabrique sur le normal ; sans italique, il penche le droit.
		g, ita := graisse, italique
		indice := func() int {
			i := 0
			if g == 700 {
				i++
			}
			if ita {
				i += 2
			}
			return i
		}
		if fichiers[indice()] == "" && ita {
			ita = false
		}
		if fichiers[indice()] == "" && g == 700 {
			g = 400
		}
		octets, err := os.ReadFile(filepath.Join(f.DossierSystem, fichiers[indice()]))
		if err != nil {
			return nil, fmt.Errorf("%w : %s absente de ce poste", ErrInconnue, fam)
		}
		return &Police{Octets: octets, Graisse: g, Italique: ita, Source: "systeme"}, nil
	}

	return f.lireGoogle(ctx, fam, graisse)
}

// Nom du fichier en cache : famille sans espaces, graisse.
func nomCache(famille string, graisse int) string {
	return fmt.Sprintf("%s-%d.ttf", strings.ReplaceAll(strings.ToLower(famille), " ", "_"), graisse)
}

func (f *Fournisseur) lireGoogle(ctx context.Context, famille string, graisse int) (*Police, error) {
	// Le cache d'abord, pour les deux graisses : une famille sans gras a
	// son 400 enregistré sous la clé 700 (voir plus bas).
	chemin := filepath.Join(f.Dossier, nomCache(famille, graisse))
	if p := lireCache(chemin, graisse); p != nil {
		return p, nil
	}

	v, _ := f.verrous.LoadOrStore(chemin, &sync.Mutex{})
	mu := v.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()
	if p := lireCache(chemin, graisse); p != nil {
		return p, nil
	}

	octets, err := f.telecharger(ctx, famille, graisse)
	servie := graisse
	if err != nil && graisse == 700 {
		// Pas de gras chez Google : le navigateur fabrique le gras sur le 400.
		octets, err = f.telecharger(ctx, famille, 400)
		servie = 400
	}
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(f.Dossier, 0o755); err == nil {
		// Un 400 servi pour un 700 est rangé sous la clé 700, avec un
		// fichier témoin « .faux-gras » à côté (lu par `lireCache`).
		tmp := chemin + ".tmp"
		if os.WriteFile(tmp, octets, 0o644) == nil {
			_ = os.Rename(tmp, chemin)
			if servie != graisse {
				_ = os.WriteFile(chemin+".faux-gras", nil, 0o644)
			}
		}
	}
	return &Police{Octets: octets, Graisse: servie, Source: "google"}, nil
}

// lireCache : la police en cache, ou nil. Le témoin « .faux-gras » dit
// qu'un 700 demandé est en fait le 400 de la famille.
func lireCache(chemin string, graisse int) *Police {
	octets, err := os.ReadFile(chemin)
	if err != nil || !EstPolice(octets) {
		return nil
	}
	if _, err := os.Stat(chemin + ".faux-gras"); err == nil {
		graisse = 400
	}
	return &Police{Octets: octets, Graisse: graisse, Source: "cache"}
}

var urlPolice = regexp.MustCompile(`url\((https://fonts\.gstatic\.com/[^)\s]+)\)\s*format\('(truetype|opentype)'\)`)

// ExtraireURL : l'adresse du fichier TTF/OTF dans la feuille CSS de Google.
func ExtraireURL(css string) (string, error) {
	m := urlPolice.FindStringSubmatch(css)
	if m == nil {
		return "", fmt.Errorf("%w : aucune police TrueType dans la réponse de Google", ErrInconnue)
	}
	return m[1], nil
}

// EstPolice : signature TrueType (00010000, 'true') ou OpenType CFF ('OTTO').
func EstPolice(b []byte) bool {
	return len(b) >= 4 && (bytes.Equal(b[:4], []byte{0, 1, 0, 0}) ||
		string(b[:4]) == "true" || string(b[:4]) == "OTTO")
}

func (f *Fournisseur) get(ctx context.Context, adresse string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, adresse, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", agentUtilisateur)
	resp, err := f.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	corps, err := io.ReadAll(io.LimitReader(resp.Body, tailleMax+1))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w : %s a répondu %d", ErrInconnue, adresse, resp.StatusCode)
	}
	if len(corps) > tailleMax {
		return nil, fmt.Errorf("fichier trop lourd : %s", adresse)
	}
	return corps, nil
}

func (f *Fournisseur) telecharger(ctx context.Context, famille string, graisse int) ([]byte, error) {
	q := url.Values{}
	q.Set("family", fmt.Sprintf("%s:wght@%d", famille, graisse))
	css, err := f.get(ctx, f.BaseCSS+"?"+q.Encode())
	if err != nil {
		return nil, err
	}
	adresse, err := ExtraireURL(string(css))
	if err != nil {
		return nil, err
	}
	octets, err := f.get(ctx, adresse)
	if err != nil {
		return nil, err
	}
	if !EstPolice(octets) {
		return nil, fmt.Errorf("le fichier reçu n'est pas une police TrueType : %s", adresse)
	}
	return octets, nil
}
