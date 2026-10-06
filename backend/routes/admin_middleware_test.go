// backend/routes/admin_middleware_test.go
// ═══════════════════════════════════════════════════════════════════════════
// GARDIEN — un jeton FABRIQUÉ n'ouvre aucune route d'administration
// ═══════════════════════════════════════════════════════════════════════════
//
// Jusqu'au 6 octobre 2026, `createAdminMiddleware` (secrets, sauvegarde,
// export du site) et ses copies (entreprises, présence) lisaient le jeton par
// `security.ParseUnverifiedJWT`, qui ne vérifie PAS la signature : il suffisait
// de connaître l'id d'un administrateur pour lire, écrire ou supprimer les
// secrets depuis n'importe quel poste du réseau.
//
// Ce test passe par le VRAI routeur de PocketBase (`apis.InitApi`), donc par
// `LoadAuthContext` : c'est lui qui vérifie la signature, et c'est sur lui que
// le middleware s'appuie désormais.

package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v4"
	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/models"
	"github.com/pocketbase/pocketbase/models/schema"
	"github.com/pocketbase/pocketbase/tokens"
	"github.com/pocketbase/pocketbase/tools/migrate"
	"github.com/pocketbase/pocketbase/tools/security"
)

type appAdmin struct {
	app     *pocketbase.PocketBase
	routeur *echo.Echo
	admin   *models.Record
	vendeur *models.Record
}

func nouvelleAppAdmin(t *testing.T) *appAdmin {
	t.Helper()
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	t.Cleanup(func() { app.ResetBootstrapState() })

	runner, err := migrate.NewRunner(app.DB(), migrations.AppMigrations)
	if err != nil {
		t.Fatalf("runner: %v", err)
	}
	if _, err := runner.Up(); err != nil {
		t.Fatalf("migrations système: %v", err)
	}

	// La collection `users` vient des migrations système ; le rôle est à nous.
	users, err := app.Dao().FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatalf("collection users: %v", err)
	}
	users.Schema.AddField(&schema.SchemaField{Name: "role", Type: schema.FieldTypeText})
	if err := app.Dao().SaveCollection(users); err != nil {
		t.Fatalf("champ role: %v", err)
	}

	utilisateur := func(email, role string) *models.Record {
		rec := models.NewRecord(users)
		rec.Set("email", email)
		rec.Set("username", strings.Split(email, "@")[0])
		rec.Set("role", role)
		if err := rec.SetPassword("motdepasse-de-test"); err != nil {
			t.Fatalf("mot de passe %s: %v", email, err)
		}
		if err := app.Dao().SaveRecord(rec); err != nil {
			t.Fatalf("utilisateur %s: %v", email, err)
		}
		return rec
	}

	routeur, err := apis.InitApi(app)
	if err != nil {
		t.Fatalf("routeur: %v", err)
	}
	// Une route nue derrière le middleware, puis les vraies routes.
	routeur.GET("/api/test/admin", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}, createAdminMiddleware(app))
	RegisterSecretsRoutes(app, routeur)
	RegisterCompanyManagementRoutes(app, routeur)
	RegisterPresenceRoutes(app, routeur)
	RegisterCreditsRoutes(app, routeur)

	return &appAdmin{
		app:     app,
		routeur: routeur,
		admin:   utilisateur("admin@test.local", "admin"),
		vendeur: utilisateur("vendeur@test.local", "vendeur"),
	}
}

func (a *appAdmin) appel(methode, chemin, jeton string) int {
	req := httptest.NewRequest(methode, chemin, strings.NewReader(`{"sessionId":"s1"}`))
	req.Header.Set("Content-Type", "application/json")
	if jeton != "" {
		req.Header.Set("Authorization", "Bearer "+jeton)
	}
	rec := httptest.NewRecorder()
	a.routeur.ServeHTTP(rec, req)
	return rec.Code
}

func (a *appAdmin) vraiJeton(t *testing.T, rec *models.Record) string {
	t.Helper()
	jeton, err := tokens.NewRecordAuthToken(a.app, rec)
	if err != nil {
		t.Fatalf("jeton: %v", err)
	}
	return jeton
}

// jetonsFabriques rend ce qu'un poste du réseau peut écrire sans connaître le
// secret du serveur, pour l'id d'un administrateur.
func (a *appAdmin) jetonsFabriques(t *testing.T) map[string]string {
	t.Helper()
	revendications := jwt.MapClaims{
		"id":           a.admin.Id,
		"type":         tokens.TypeAuthRecord,
		"collectionId": a.admin.Collection().Id,
	}

	autreSecret, err := security.NewJWT(revendications, "un-secret-qui-n-est-pas-le-bon", 3600)
	if err != nil {
		t.Fatalf("jeton fabriqué: %v", err)
	}

	morceaux := strings.Split(a.vraiJeton(t, a.admin), ".")
	sansSignature := morceaux[0] + "." + morceaux[1] + "."
	signatureAlteree := morceaux[0] + "." + morceaux[1] + ".AAAA" + morceaux[2][4:]

	// Le vrai jeton du vendeur, dont on remplace le contenu par celui de l'admin.
	vendeur := strings.Split(a.vraiJeton(t, a.vendeur), ".")
	contenuEchange := vendeur[0] + "." + morceaux[1] + "." + vendeur[2]

	return map[string]string{
		"signé d'un autre secret":          autreSecret,
		"sans signature":                   sansSignature,
		"signature altérée":                signatureAlteree,
		"contenu admin, signature vendeur": contenuEchange,
	}
}

func TestAdminMiddleware_JetonFabriqueRefuse(t *testing.T) {
	a := nouvelleAppAdmin(t)

	routes := []struct{ methode, chemin string }{
		{http.MethodGet, "/api/test/admin"},
		{http.MethodGet, "/api/app-settings"},
		{http.MethodPost, "/api/settings/secret"},
		{http.MethodGet, "/api/settings/gemini/status"},
		{http.MethodDelete, "/api/settings/gemini"},
		{http.MethodGet, "/api/companies"},
		{http.MethodPost, "/api/presence/ping"},
		{http.MethodGet, "/api/presence/sessions"},
	}

	for nom, jeton := range a.jetonsFabriques(t) {
		for _, r := range routes {
			if code := a.appel(r.methode, r.chemin, jeton); code != http.StatusUnauthorized {
				t.Errorf("jeton %s sur %s %s : %d, attendu 401", nom, r.methode, r.chemin, code)
			}
		}
	}

	// Sans jeton du tout : pareil.
	for _, r := range routes {
		if code := a.appel(r.methode, r.chemin, ""); code != http.StatusUnauthorized {
			t.Errorf("sans jeton sur %s %s : %d, attendu 401", r.methode, r.chemin, code)
		}
	}
}

func TestAdminMiddleware_VraiJetonAdminPasse(t *testing.T) {
	a := nouvelleAppAdmin(t)
	jeton := a.vraiJeton(t, a.admin)

	if code := a.appel(http.MethodGet, "/api/test/admin", jeton); code != http.StatusOK {
		t.Fatalf("admin sur la route nue : %d, attendu 200", code)
	}
	// Sur les vraies routes, le middleware est franchi : ni 401 ni 403.
	for _, chemin := range []string{"/api/app-settings", "/api/settings/gemini/status", "/api/companies"} {
		code := a.appel(http.MethodGet, chemin, jeton)
		if code == http.StatusUnauthorized || code == http.StatusForbidden {
			t.Errorf("admin sur %s : %d, le middleware aurait dû laisser passer", chemin, code)
		}
	}
}

func TestAdminMiddleware_VraiJetonNonAdminInterdit(t *testing.T) {
	a := nouvelleAppAdmin(t)
	jeton := a.vraiJeton(t, a.vendeur)

	for _, chemin := range []string{"/api/test/admin", "/api/app-settings", "/api/settings/gemini/status", "/api/companies"} {
		if code := a.appel(http.MethodGet, chemin, jeton); code != http.StatusForbidden {
			t.Errorf("vendeur sur %s : %d, attendu 403", chemin, code)
		}
	}
	// La présence, elle, est ouverte à toute session vérifiée.
	if code := a.appel(http.MethodPost, "/api/presence/ping", jeton); code != http.StatusOK {
		t.Errorf("vendeur sur le ping de présence : %d, attendu 200", code)
	}
}

// Un administrateur rétrogradé perd l'accès avec le jeton qu'il a déjà.
func TestAdminMiddleware_RoleReluALaRequete(t *testing.T) {
	a := nouvelleAppAdmin(t)
	jeton := a.vraiJeton(t, a.admin)

	a.admin.Set("role", "vendeur")
	if err := a.app.Dao().SaveRecord(a.admin); err != nil {
		t.Fatalf("rétrogradation: %v", err)
	}
	if code := a.appel(http.MethodGet, "/api/test/admin", jeton); code != http.StatusForbidden {
		t.Errorf("admin rétrogradé : %d, attendu 403", code)
	}
}
