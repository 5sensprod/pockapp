package polices

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

var faussePolice = append([]byte{0, 1, 0, 0}, []byte("glyphes")...)

func TestNormaliserFamille(t *testing.T) {
	ok := map[string]string{"Roboto": "Roboto", "  Open   Sans ": "Open Sans", "Source Sans 3": "Source Sans 3"}
	for entree, attendu := range ok {
		got, err := NormaliserFamille(entree)
		if err != nil || got != attendu {
			t.Errorf("%q → %q, %v", entree, got, err)
		}
	}
	for _, mauvais := range []string{"", "../etc", "Roboto:wght@900", "a&family=b", strings.Repeat("a", 70)} {
		if _, err := NormaliserFamille(mauvais); err == nil {
			t.Errorf("%q aurait dû être refusé", mauvais)
		}
	}
}

func TestExtraireURL(t *testing.T) {
	css := `@font-face { src: url(https://fonts.gstatic.com/s/roboto/v51/abc.ttf) format('truetype'); }`
	got, err := ExtraireURL(css)
	if err != nil || got != "https://fonts.gstatic.com/s/roboto/v51/abc.ttf" {
		t.Fatalf("%q, %v", got, err)
	}
	if _, err := ExtraireURL(`src: url(https://evil.example/x.ttf) format('truetype')`); err == nil {
		t.Fatal("un hôte autre que fonts.gstatic.com doit être refusé")
	}
	if _, err := ExtraireURL(`src: url(https://fonts.gstatic.com/x.woff2) format('woff2')`); err == nil {
		t.Fatal("du WOFF2 doit être refusé")
	}
}

// Faux Google : la CSS pointe vers gstatic ; on redirige le transport vers le
// serveur de test pour ne jamais sortir sur le réseau.
func fauxGoogle(t *testing.T, sansGras bool, appels *int32) *Fournisseur {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(appels, 1)
		if r.Header.Get("User-Agent") != agentUtilisateur {
			http.Error(w, "agent", http.StatusForbidden)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/css2") {
			if sansGras && strings.Contains(r.URL.Query().Get("family"), "@700") {
				http.Error(w, "absent", http.StatusBadRequest)
				return
			}
			fmt.Fprint(w, `src: url(https://fonts.gstatic.com/s/x.ttf) format('truetype');`)
			return
		}
		w.Write(faussePolice)
	}))
	t.Cleanup(srv.Close)
	f := Nouveau(t.TempDir())
	f.BaseCSS = srv.URL + "/css2"
	f.Client = &http.Client{Transport: redirigeVers{srv.URL}}
	return f
}

type redirigeVers struct{ base string }

func (r redirigeVers) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Host == "fonts.gstatic.com" {
		req2 := req.Clone(req.Context())
		u := *req.URL
		u.Scheme, u.Host = "http", strings.TrimPrefix(r.base, "http://")
		req2.URL = &u
		req2.Host = u.Host
		return http.DefaultTransport.RoundTrip(req2)
	}
	return http.DefaultTransport.RoundTrip(req)
}

func TestGoogleTelechargeUneFoisPuisCache(t *testing.T) {
	var appels int32
	f := fauxGoogle(t, false, &appels)
	p, err := f.Lire(context.Background(), "Roboto", 700)
	if err != nil || p.Graisse != 700 || p.Source != "google" {
		t.Fatalf("%+v, %v", p, err)
	}
	p, err = f.Lire(context.Background(), "Roboto", 700)
	if err != nil || p.Source != "cache" || p.Graisse != 700 {
		t.Fatalf("second appel : %+v, %v", p, err)
	}
	if appels != 2 { // css + fichier, une seule fois
		t.Fatalf("appels réseau : %d", appels)
	}
}

func TestFamilleSansGrasRendLe400(t *testing.T) {
	var appels int32
	f := fauxGoogle(t, true, &appels)
	for _, attendu := range []string{"google", "cache"} {
		p, err := f.Lire(context.Background(), "Bebas Neue", 700)
		if err != nil || p.Graisse != 400 || p.Source != attendu {
			t.Fatalf("%s : %+v, %v", attendu, p, err)
		}
	}
}

func TestPoliceSysteme(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "arial.ttf"), faussePolice, 0o644)
	os.WriteFile(filepath.Join(dir, "arialbd.ttf"), faussePolice, 0o644)
	f := Nouveau(t.TempDir())
	f.DossierSystem = dir
	for _, fam := range []string{"Arial", "Helvetica"} {
		p, err := f.Lire(context.Background(), fam, 700)
		if err != nil || p.Source != "systeme" || p.Graisse != 700 {
			t.Fatalf("%s : %+v, %v", fam, p, err)
		}
	}
	if _, err := f.Lire(context.Background(), "Verdana", 400); err == nil {
		t.Fatal("un fichier système absent doit être une erreur")
	}
	if _, err := f.Lire(context.Background(), "Arial", 900); err == nil {
		t.Fatal("graisse 900 non servie")
	}
}
