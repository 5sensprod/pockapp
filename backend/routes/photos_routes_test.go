package routes

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
)

// fauxPhotos monte UN serveur TLS qui joue Gemini (`/gemini`) et le mini-SaaS
// (`/photos`), et compte les appels à chacun.
type fauxPhotos struct {
	deps          photosDeps
	gemini, saas  int32
	entree, sorti int
	declares      int
}

func monterFauxPhotos(t *testing.T, gemini, saas http.HandlerFunc) *fauxPhotos {
	t.Helper()
	f := &fauxPhotos{}
	mux := http.NewServeMux()
	mux.HandleFunc("/gemini", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&f.gemini, 1)
		gemini(w, r)
	})
	mux.HandleFunc("/photos", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&f.saas, 1)
		saas(w, r)
	})
	srv := httptest.NewTLSServer(mux)
	t.Cleanup(srv.Close)
	f.deps = photosDeps{
		cle:          func() (string, error) { return "cle-test", nil },
		endpoint:     srv.URL + "/photos",
		client:       srv.Client(),
		cleGemini:    func() string { return "cle-gemini" },
		geminiURL:    srv.URL + "/gemini",
		geminiClient: srv.Client(),
		declarer: func(entree, sortie int) {
			f.declares++
			f.entree, f.sorti = entree, sortie
		},
	}
	return f
}

func appelPhotos(t *testing.T, corps string, traiter func(echo.Context) error) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/ai/photos-chat", strings.NewReader(corps))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	if err := traiter(echo.New().NewContext(req, rec)); err != nil {
		t.Fatalf("route: %v", err)
	}
	return rec
}

func chat(t *testing.T, f *fauxPhotos, corps string) *httptest.ResponseRecorder {
	return appelPhotos(t, corps, func(c echo.Context) error { return traiterPhotosChat(c, f.deps) })
}

// Ce que Gemini rend : un appel de l'outil (avec une signature de pensée), ou du texte.
func geminiAppelle(args string) string {
	return `{"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"name":"chercher_photos","args":` + args + `},"thoughtSignature":"SIG-1"}]}}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":10}}`
}

func geminiDit(texte string) string {
	raw, _ := json.Marshal(texte)
	return `{"candidates":[{"content":{"role":"model","parts":[{"text":` + string(raw) + `}]}}],"usageMetadata":{"promptTokenCount":150,"candidatesTokenCount":20}}`
}

const quatrePhotos = `{"resultats":[
 {"id":"a","miniature":"m1.sig","image":"i1.sig","largeur":2400,"hauteur":1600,"couleur":"#0c2640","description":"frozen lake"},
 {"id":"b","miniature":"m2.sig","image":"i2.sig","largeur":2400,"hauteur":1600},
 {"id":"c","miniature":"m3.sig","image":"i3.sig","largeur":1600,"hauteur":2400},
 {"id":"d","miniature":"m4.sig","image":"i4.sig","largeur":2400,"hauteur":2400}],"page":1,"suite":true}`

const demande = `{"message":"  ajoute une photo de forêt avec un lac gelé ","page":{"orientation":"paysage","largeur_mm":297,"hauteur_mm":210}}`

func TestPhotosChatSucces(t *testing.T) {
	var corpsGemini []map[string]any
	var formulaire map[string][]string
	f := monterFauxPhotos(t,
		func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("x-goog-api-key") != "cle-gemini" || r.Header.Get("User-Agent") != photosGeminiUserAgent {
				t.Errorf("en-têtes Gemini: %q / %q", r.Header.Get("x-goog-api-key"), r.Header.Get("User-Agent"))
			}
			if strings.Contains(r.URL.String(), "cle-gemini") {
				t.Errorf("la clé Gemini est dans l'adresse")
			}
			var corps map[string]any
			json.NewDecoder(r.Body).Decode(&corps)
			corpsGemini = append(corpsGemini, corps)
			if len(corpsGemini) == 1 {
				io.WriteString(w, geminiAppelle(`{"requete_en":" frozen lake  forest ","orientation":"paysage","page":1}`))
				return
			}
			io.WriteString(w, geminiDit("Voici quatre photos de lac gelé en forêt."))
		},
		func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost || r.Header.Get("X-API-Key") != "cle-test" || r.Header.Get("User-Agent") != photosUserAgent {
				t.Errorf("mini-SaaS: %s, clé %q, agent %q", r.Method, r.Header.Get("X-API-Key"), r.Header.Get("User-Agent"))
			}
			// Rien dans l'adresse : ni clé, ni requête (les journaux d'accès la garderaient)
			if r.URL.RawQuery != "" {
				t.Errorf("paramètres dans l'adresse: %q", r.URL.RawQuery)
			}
			r.ParseForm()
			formulaire = r.PostForm
			io.WriteString(w, quatrePhotos)
		})

	rec := chat(t, f, demande)
	if rec.Code != 200 {
		t.Fatalf("code %d: %s", rec.Code, rec.Body.String())
	}
	var rendu photosChatReponse
	if err := json.Unmarshal(rec.Body.Bytes(), &rendu); err != nil {
		t.Fatal(err)
	}
	if rendu.Texte != "Voici quatre photos de lac gelé en forêt." || len(rendu.Resultats) != 4 || !rendu.Suite {
		t.Fatalf("réponse: %+v", rendu)
	}
	if rendu.Recherche == nil || *rendu.Recherche != (photosRecherche{"frozen lake forest", "paysage", 1}) {
		t.Fatalf("recherche: %+v", rendu.Recherche)
	}
	if got := formulaire; got["action"][0] != "recherche" || got["requete"][0] != "frozen lake forest" || got["orientation"][0] != "paysage" || got["page"][0] != "1" {
		t.Fatalf("formulaire: %v", got)
	}
	// Le poste ne reçoit aucune adresse
	if strings.Contains(rec.Body.String(), "http") {
		t.Fatalf("une adresse est sortie: %s", rec.Body.String())
	}
	if f.gemini != 2 || f.saas != 1 {
		t.Fatalf("%d appels Gemini, %d mini-SaaS", f.gemini, f.saas)
	}
	// Les jetons des DEUX tours, déclarés une fois
	if f.declares != 1 || f.entree != 250 || f.sorti != 30 {
		t.Fatalf("déclaré %d fois: %d / %d", f.declares, f.entree, f.sorti)
	}

	// Premier tour : l'outil est déclaré, la demande et le contexte partent
	premier, _ := json.Marshal(corpsGemini[0])
	for _, attendu := range []string{"chercher_photos", "lac gelé", "page au format paysage", "297 × 210 mm"} {
		if !strings.Contains(string(premier), attendu) {
			t.Errorf("premier tour sans %q", attendu)
		}
	}
	// Second tour : le contenu du modèle revient TEL QUEL (signature de pensée),
	// suivi de la réponse de l'outil, et l'outil est fermé.
	second, _ := json.Marshal(corpsGemini[1])
	for _, attendu := range []string{`"thoughtSignature":"SIG-1"`, `"functionResponse"`, `"nombre":4`, `"mode":"NONE"`} {
		if !strings.Contains(string(second), attendu) {
			t.Errorf("second tour sans %s", attendu)
		}
	}
	// Gemini ne voit ni la clé de la banque ni les références
	if strings.Contains(string(second), "cle-test") || strings.Contains(string(second), "m1.sig") {
		t.Errorf("clé ou référence envoyée à Gemini")
	}
}

func TestPhotosChatRefusAvantEnvoi(t *testing.T) {
	cas := []struct {
		nom, corps, code string
		modifier         func(*photosDeps)
	}{
		{"message vide", `{"message":"  "}`, "demande_absente", nil},
		{"message trop long", `{"message":"` + strings.Repeat("é", photosDemandeMax+1) + `"}`, "demande_trop_longue", nil},
		{"orientation inventée", `{"message":"x","page":{"orientation":"landscape"}}`, "orientation_inconnue", nil},
		{"clé Gemini absente", demande, "gemini_absent", func(d *photosDeps) { d.cleGemini = func() string { return " " } }},
		{"clé PocketApp absente", demande, "cle_absente", func(d *photosDeps) { d.cle = func() (string, error) { return "", nil } }},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			f := monterFauxPhotos(t,
				func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, geminiDit("x")) },
				func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, quatrePhotos) })
			if c.modifier != nil {
				c.modifier(&f.deps)
			}
			rec := chat(t, f, c.corps)
			if codeDe(t, rec) != c.code {
				t.Fatalf("code %q (HTTP %d)", codeDe(t, rec), rec.Code)
			}
			if f.gemini != 0 || f.saas != 0 || f.declares != 0 {
				t.Fatalf("un appel est parti: gemini %d, mini-SaaS %d", f.gemini, f.saas)
			}
		})
	}
}

// Les échecs du mini-SaaS sortent avec leur code ; les jetons dépensés sont déclarés quand même.
func TestPhotosChatEchecsDuMiniSaaS(t *testing.T) {
	cas := []struct {
		nom    string
		saas   http.HandlerFunc
		status int
		code   string
	}{
		{"quota", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(429)
			io.WriteString(w, `{"error":"x","code":"quota_atteint"}`)
		}, 429, "quota_atteint"},
		{"fournisseur en panne", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(502)
			io.WriteString(w, `{"error":"x","code":"fournisseur_en_echec"}`)
		}, 502, "fournisseur_en_echec"},
		{"clé refusée : pas un 401 pour le renderer", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(401)
			io.WriteString(w, `{"error":"x","code":"cle_invalide"}`)
		}, 503, "cle_invalide"},
		{"code inconnu", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(500)
			io.WriteString(w, `{"code":"erreur_interne"}`)
		}, 502, "fournisseur_en_echec"},
		{"page anti-bot en HTML", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(503)
			io.WriteString(w, "<html>temporarily unavailable</html>")
		}, 502, "fournisseur_en_echec"},
		{"réponse mal formée", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `<html>`) }, 502, "reponse_invalide"},
		{"résultats vides en 200", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `{"resultats":[]}`) }, 502, "reponse_invalide"},
		{"plus de quatre résultats", func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, `{"resultats":[`+strings.TrimSuffix(strings.Repeat(`{"id":"a","miniature":"m","image":"i","largeur":1,"hauteur":1},`, 5), ",")+`]}`)
		}, 502, "reponse_invalide"},
		{"une adresse à la place d'une référence", func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, `{"resultats":[{"id":"a","miniature":"https://images.example/a.jpg","image":"i","largeur":1,"hauteur":1}]}`)
		}, 502, "reponse_invalide"},
		{"réponse démesurée", func(w http.ResponseWriter, r *http.Request) {
			w.Write(bytes.Repeat([]byte(" "), photosReponseMaxBytes+10))
		}, 502, "reponse_invalide"},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			f := monterFauxPhotos(t,
				func(w http.ResponseWriter, r *http.Request) {
					io.WriteString(w, geminiAppelle(`{"requete_en":"lake","orientation":"paysage"}`))
				}, c.saas)
			rec := chat(t, f, demande)
			if rec.Code != c.status || codeDe(t, rec) != c.code {
				t.Fatalf("HTTP %d, code %q", rec.Code, codeDe(t, rec))
			}
			if f.saas != 1 || f.gemini != 1 {
				t.Fatalf("appels: gemini %d, mini-SaaS %d (jamais de second essai)", f.gemini, f.saas)
			}
			if f.declares != 1 {
				t.Fatalf("les jetons dépensés ne sont pas déclarés")
			}
		})
	}
}

// Aucun résultat : Gemini l'apprend, réessaie UNE fois, puis le dit.
func TestPhotosChatAucunResultat(t *testing.T) {
	requetes := []string{}
	// Un Gemini qui s'entête à appeler l'outil
	f2 := monterFauxPhotos(t,
		func(w http.ResponseWriter, r *http.Request) {
			io.WriteString(w, geminiAppelle(`{"requete_en":"essai","orientation":"portrait","page":2}`))
		},
		func(w http.ResponseWriter, r *http.Request) {
			r.ParseForm()
			requetes = append(requetes, r.PostForm.Get("requete")+"|"+r.PostForm.Get("orientation")+"|"+r.PostForm.Get("page"))
			w.WriteHeader(404)
			io.WriteString(w, `{"error":"x","code":"aucun_resultat"}`)
		})
	rec := chat(t, f2, demande)
	if rec.Code != 200 {
		t.Fatalf("code %d: %s", rec.Code, rec.Body.String())
	}
	var rendu photosChatReponse
	json.Unmarshal(rec.Body.Bytes(), &rendu)
	if len(rendu.Resultats) != 0 || rendu.Recherche != nil || !strings.Contains(rendu.Texte, "aucune photo") {
		t.Fatalf("réponse: %+v", rendu)
	}
	if !strings.Contains(rec.Body.String(), `"resultats":[]`) {
		t.Fatalf("resultats doit être un tableau: %s", rec.Body.String())
	}
	// Deux recherches au plus, trois appels à Gemini au plus : la boucle est bornée
	if len(requetes) != photosRecherchesMax || f2.gemini != photosToursMax {
		t.Fatalf("%d recherches, %d appels Gemini", len(requetes), f2.gemini)
	}
	if requetes[0] != "essai|portrait|2" {
		t.Fatalf("recherche: %q", requetes[0])
	}
}

// Ce que Gemini demande est borné par le Go.
func TestPhotosRechercheDemandee(t *testing.T) {
	appel := func(nom, requete, orientation string, page float64) *photosAppelOutil {
		a := &photosAppelOutil{Name: nom}
		a.Args.RequeteEn, a.Args.Orientation, a.Args.Page = requete, orientation, page
		return a
	}
	cas := []struct {
		nom     string
		appel   *photosAppelOutil
		attendu photosRecherche
		valide  bool
	}{
		{"ordinaire", appel(photosOutil, " frozen  lake ", "portrait", 3), photosRecherche{"frozen lake", "portrait", 3}, true},
		{"orientation absente : celle de la page", appel(photosOutil, "lake", "", 0), photosRecherche{"lake", "paysage", 1}, true},
		{"orientation inventée : celle de la page", appel(photosOutil, "lake", "landscape", 1), photosRecherche{"lake", "paysage", 1}, true},
		{"libre : sans filtre", appel(photosOutil, "lake", "libre", 1), photosRecherche{"lake", "", 1}, true},
		{"page bornée", appel(photosOutil, "lake", "carre", 99), photosRecherche{"lake", "carre", photosPageMax}, true},
		{"requête vide", appel(photosOutil, "  ", "paysage", 1), photosRecherche{}, false},
		{"requête trop longue", appel(photosOutil, strings.Repeat("a", photosRequeteMax+1), "paysage", 1), photosRecherche{}, false},
		{"autre outil", appel("supprimer_tout", "lake", "paysage", 1), photosRecherche{}, false},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			r, ok := rechercheDemandee(c.appel, "paysage")
			if ok != c.valide || r != c.attendu {
				t.Fatalf("%+v, %v", r, ok)
			}
		})
	}
}

func TestPhotosChatEchecsDeGemini(t *testing.T) {
	cas := []struct {
		nom    string
		gemini http.HandlerFunc
		code   string
	}{
		{"quota", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(429)
			io.WriteString(w, `{"error":{"message":"q"}}`)
		}, "gemini_quota"},
		{"clé refusée", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(403); io.WriteString(w, `{}`) }, "gemini_cle_refusee"},
		{"panne", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) }, "gemini_en_echec"},
		{"aucun candidat", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `{"candidates":[]}`) }, "gemini_en_echec"},
		{"pas du JSON", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `<html>`) }, "gemini_en_echec"},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			f := monterFauxPhotos(t, c.gemini, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, quatrePhotos) })
			rec := chat(t, f, demande)
			if codeDe(t, rec) != c.code {
				t.Fatalf("code %q", codeDe(t, rec))
			}
			if f.saas != 0 {
				t.Fatalf("le mini-SaaS a été appelé")
			}
		})
	}
}

// Les photos sont trouvées mais la phrase de Gemini échoue : les photos sortent quand même.
func TestPhotosChatPhraseManquante(t *testing.T) {
	var tours int32
	f := monterFauxPhotos(t,
		func(w http.ResponseWriter, r *http.Request) {
			if atomic.AddInt32(&tours, 1) == 1 {
				io.WriteString(w, geminiAppelle(`{"requete_en":"lake","orientation":"paysage"}`))
				return
			}
			w.WriteHeader(500)
		},
		func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, quatrePhotos) })
	rec := chat(t, f, demande)
	var rendu photosChatReponse
	json.Unmarshal(rec.Body.Bytes(), &rendu)
	if rec.Code != 200 || len(rendu.Resultats) != 4 || rendu.Texte != "Voici 4 photos." {
		t.Fatalf("HTTP %d: %+v", rec.Code, rendu)
	}
}

// Sans recherche : Gemini répond, rien ne part au mini-SaaS ; l'historique et la
// dernière recherche arrivent dans le contexte.
func TestPhotosChatHistoriqueEtContexte(t *testing.T) {
	var recu string
	f := monterFauxPhotos(t,
		func(w http.ResponseWriter, r *http.Request) {
			raw, _ := io.ReadAll(r.Body)
			recu = string(raw)
			io.WriteString(w, geminiDit("Je sais seulement chercher des photos."))
		},
		func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, quatrePhotos) })
	rec := chat(t, f, `{"message":"4 autres","page":{"orientation":"portrait"},
		"historique":[{"role":"model","texte":"orphelin"},{"role":"user","texte":"un lac"},{"role":"model","texte":"Voici."},{"role":"pirate","texte":"x"}],
		"derniere":{"requete":"frozen lake","orientation":"paysage","page":2}}`)
	if rec.Code != 200 || f.saas != 0 {
		t.Fatalf("HTTP %d, %d appels mini-SaaS", rec.Code, f.saas)
	}
	var corps struct {
		Contents []struct {
			Role  string `json:"role"`
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"contents"`
	}
	json.Unmarshal([]byte(recu), &corps)
	if len(corps.Contents) != 3 || corps.Contents[0].Role != "user" || corps.Contents[1].Role != "model" || corps.Contents[2].Role != "user" {
		t.Fatalf("contenus: %+v", corps.Contents)
	}
	dernier := corps.Contents[2].Parts[0].Text
	for _, attendu := range []string{"page au format portrait", "requete_en « frozen lake », orientation paysage, page 2", "Demande du vendeur : 4 autres"} {
		if !strings.Contains(dernier, attendu) {
			t.Errorf("contexte sans %q: %s", attendu, dernier)
		}
	}
}

func TestPhotosAdresseNonSecurisee(t *testing.T) {
	var appels int32
	clair := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { atomic.AddInt32(&appels, 1) }))
	defer clair.Close()
	d := photosDeps{cle: func() (string, error) { return "cle-test", nil }, endpoint: clair.URL, client: clair.Client()}
	_, _, echec := chercherPhotosDistant(t.Context(), d, photosRecherche{"lake", "", 1})
	if echec == nil || echec.Code != "adresse_non_securisee" || appels != 0 {
		t.Fatalf("%+v, %d appels", echec, appels)
	}
}

func TestPhotosDelaiDepasse(t *testing.T) {
	f := monterFauxPhotos(t, nil, func(w http.ResponseWriter, r *http.Request) { time.Sleep(300 * time.Millisecond) })
	f.deps.client.Timeout = 50 * time.Millisecond
	_, _, echec := chercherPhotosDistant(t.Context(), f.deps, photosRecherche{"lake", "", 1})
	if echec == nil || echec.Code != "delai_depasse" {
		t.Fatalf("%+v", echec)
	}
}

func fichier(t *testing.T, f *fauxPhotos, corps string) *httptest.ResponseRecorder {
	return appelPhotos(t, corps, func(c echo.Context) error { return traiterPhotosFichier(c, f.deps) })
}

func TestPhotosFichier(t *testing.T) {
	var formulaire map[string][]string
	f := monterFauxPhotos(t, nil, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "cle-test" || r.URL.RawQuery != "" {
			t.Errorf("clé %q, adresse %q", r.Header.Get("X-API-Key"), r.URL.RawQuery)
		}
		r.ParseForm()
		formulaire = r.PostForm
		// L'en-tête ment : le type se lit sur les octets
		w.Header().Set("Content-Type", "text/html")
		w.Write(jpegTest)
	})
	rec := fichier(t, f, `{"ref":"i1.sig"}`)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "image/jpeg" || !bytes.Equal(rec.Body.Bytes(), jpegTest) {
		t.Fatalf("HTTP %d, type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	if formulaire["action"][0] != "fichier" || formulaire["ref"][0] != "i1.sig" {
		t.Fatalf("formulaire: %v", formulaire)
	}
}

func TestPhotosFichierRefus(t *testing.T) {
	// Une adresse à la place d'une référence : rien ne part
	for _, ref := range []string{"", "https://images.example/a.jpg", "a b", strings.Repeat("a", photosRefMax+1)} {
		f := monterFauxPhotos(t, nil, func(w http.ResponseWriter, r *http.Request) { w.Write(jpegTest) })
		raw, _ := json.Marshal(map[string]string{"ref": ref})
		rec := fichier(t, f, string(raw))
		if codeDe(t, rec) != "reference_invalide" || f.saas != 0 {
			t.Fatalf("ref %.30q: code %q, %d appels", ref, codeDe(t, rec), f.saas)
		}
	}
	cas := []struct {
		nom  string
		saas http.HandlerFunc
		code string
	}{
		{"référence expirée", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(400)
			io.WriteString(w, `{"error":"x","code":"reference_invalide"}`)
		}, "reference_invalide"},
		{"pas une image", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "<html>") }, "reponse_invalide"},
		{"démesurée", func(w http.ResponseWriter, r *http.Request) {
			w.Write(append(append([]byte{}, jpegTest...), make([]byte, photosFichierMaxBytes)...))
		}, "reponse_invalide"},
	}
	for _, c := range cas {
		t.Run(c.nom, func(t *testing.T) {
			f := monterFauxPhotos(t, nil, c.saas)
			if rec := fichier(t, f, `{"ref":"i1.sig"}`); codeDe(t, rec) != c.code {
				t.Fatalf("code %q", codeDe(t, rec))
			}
		})
	}
}

// « Afficher plus » : la page suivante sans Gemini, donc sans rien déclarer.
func TestPhotosSuiteGratuite(t *testing.T) {
	var formulaire map[string][]string
	f := monterFauxPhotos(t,
		func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, geminiDit("x")) },
		func(w http.ResponseWriter, r *http.Request) {
			r.ParseForm()
			formulaire = r.PostForm
			io.WriteString(w, quatrePhotos)
		})
	suite := func(corps string) *httptest.ResponseRecorder {
		return appelPhotos(t, corps, func(c echo.Context) error { return traiterPhotosSuite(c, f.deps) })
	}
	rec := suite(`{"requete":" frozen  lake ","orientation":"paysage","page":2}`)
	var rendu photosChatReponse
	json.Unmarshal(rec.Body.Bytes(), &rendu)
	if rec.Code != 200 || len(rendu.Resultats) != 4 || *rendu.Recherche != (photosRecherche{"frozen lake", "paysage", 2}) {
		t.Fatalf("HTTP %d: %+v", rec.Code, rendu)
	}
	if formulaire["requete"][0] != "frozen lake" || formulaire["page"][0] != "2" {
		t.Fatalf("formulaire: %v", formulaire)
	}
	if f.gemini != 0 || f.declares != 0 {
		t.Fatalf("Gemini appelé %d fois, %d déclarations : « Afficher plus » doit être gratuit", f.gemini, f.declares)
	}
	for _, c := range []struct{ corps, code string }{
		{`{"requete":"","page":2}`, "aucun_resultat"},
		{`{"requete":"lake","page":0}`, "aucun_resultat"},
		{`{"requete":"lake","page":99}`, "aucun_resultat"},
		{`{"requete":"lake","orientation":"landscape","page":2}`, "orientation_inconnue"},
	} {
		avant := f.saas
		if rec := suite(c.corps); codeDe(t, rec) != c.code || f.saas != avant {
			t.Fatalf("%s: code %q", c.corps, codeDe(t, rec))
		}
	}
}
