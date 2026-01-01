package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"pocket-react/backend"
	"pocket-react/backend/hooks"
	"pocket-react/backend/migrations"
	"pocket-react/backend/routes" // ✅ NOUVEAU : import du package routes

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:dist
var assets embed.FS

var logFile *os.File

const (
	appPort     = 8090
	serviceName = "PocketReact"
)

func initLogging(baseDir string) {
	var err error
	logPath := filepath.Join(baseDir, "debug.log")
	logFile, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err == nil {
		log.SetOutput(logFile)
	}
	log.Println("=== App started ===")
}

func loadEnvFile(baseDir string) {
	// Essaie de charger .env depuis plusieurs emplacements
	// Note: Le .env n'est plus nécessaire pour SMTP (configuré via l'interface)
	envPaths := []string{
		filepath.Join(baseDir, ".env"),
		".env",
	}

	for _, path := range envPaths {
		if err := godotenv.Load(path); err == nil {
			log.Println("Loaded .env from:", path)
			return
		}
	}
	log.Println("No .env file found, using environment variables")
}

func main() {
	// On se place dans le dossier de l'exécutable
	exe, _ := os.Executable()
	baseDir := filepath.Dir(exe)
	_ = os.Chdir(baseDir)

	// Charge le fichier .env (optionnel maintenant)
	loadEnvFile(baseDir)

	initLogging(baseDir)

	// Répertoire de données PocketBase (dans %LOCALAPPDATA%/PocketReact/pb_data)
	appDataDir := os.Getenv("LOCALAPPDATA")
	if appDataDir == "" {
		// fallback simple pour éviter un chemin vide sur d'autres OS
		appDataDir = "."
	}
	dataDir := filepath.Join(appDataDir, "PocketReact", "pb_data")
	log.Println("Data dir:", dataDir)

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Println("MkdirAll error:", err)
	}

	// Instance PocketBase
	pb := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: dataDir,
	})

	// Enregistre les hooks personnalisés sur PocketBase
	hooks.RegisterAllHooks(pb)

	// Wrapper Wails qui utilise pb
	app := NewApp(pb)

	// Lance PocketBase (bootstrap + migrations + routes + HTTP) dans une goroutine
	go startPocketBaseNoCobra(pb, assets)

	// Attend que l'API PocketBase réponde sur /api/health
	waitForPocketBase()

	// mDNS pour découvrir l'app sur le réseau local (optionnel)
	if err := backend.StartMDNS(appPort, serviceName); err != nil {
		log.Println("mDNS error:", err)
	}

	// Lancement de l'UI Wails
	wails.Run(&options.App{
		Title:  "Pocket App",
		Width:  1280,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: NewAPIProxy("http://127.0.0.1:8090"),
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind:             []interface{}{app},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
	})

	backend.StopMDNS()
}

func startPocketBaseNoCobra(pb *pocketbase.PocketBase, embeddedAssets embed.FS) {
	log.Println("Starting PocketBase bootstrap...")

	if err := pb.Bootstrap(); err != nil {
		log.Println("Bootstrap ERROR:", err)
		return
	}
	log.Println("Bootstrap OK, DataDir:", pb.DataDir())

	// SMTP est maintenant configuré via l'interface utilisateur
	// Les settings sont stockés dans PocketBase (pb_data/data.db)
	logSmtpStatus(pb)

	// Exécuter les migrations pour créer les collections
	if err := migrations.RunMigrations(pb); err != nil {
		log.Println("Migrations ERROR:", err)
		// On continue quand même, l'erreur n'est pas fatale
	}

	// Extraire le sous-dossier "dist" de l'embed
	distFS, err := fs.Sub(embeddedAssets, "dist")
	if err != nil {
		log.Println("fs.Sub error:", err)
		return
	}

	pb.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		log.Println("OnBeforeServe called")
		migrations.MigrateAuditLogsAddTicketEntityType(pb)

		// API routes
		e.Router.GET("/api/health", func(c echo.Context) error {
			return c.JSON(200, map[string]string{"status": "ok"})
		})

		e.Router.GET("/api/network/info", func(c echo.Context) error {
			ip := backend.GetLocalIP()
			return c.JSON(200, map[string]interface{}{
				"ip":   ip,
				"port": appPort,
				"url":  "http://" + ip + ":8090",
			})
		})

		// ✅ MODIFIÉ : Routes de setup
		routes.RegisterSetupRoutes(pb, e.Router)

		// ✅ MODIFIÉ : Routes settings SMTP
		routes.RegisterSmtpSettingsRoutes(pb, e.Router)

		// ✅ MODIFIÉ : Route envoi email devis
		routes.RegisterQuoteEmailRoutes(pb, e.Router)

		// ✅ MODIFIÉ : Route envoi email factures
		routes.RegisterInvoiceEmailRoutes(pb, e.Router)

		// 🔹 MODIFIÉ : routes caisse depuis le nouveau package routes
		routes.RegisterCashRoutes(pb, e.Router)

		// ✅ MODIFIÉ : routes remboursement factures (B2B)
		routes.RegisterInvoiceRefundRoutes(pb, e.Router)

		// ✅ MODIFIÉ : routes POS
		routes.RegisterPosRoutes(pb, e.Router)

		routes.RegisterPosPrintRoutes(pb, e.Router)

		routes.RegisterScannerRoutes(pb, e.Router)

		routes.RegisterDisplayRoutes(pb, e.Router)

		// SPA handler avec assets embarqués (doit rester en dernier)
		e.Router.GET("/*", StaticSPAHandler(distFS))

		return nil
	})

	log.Println("Starting HTTP server on 0.0.0.0:8090...")
	_, err = apis.Serve(pb, apis.ServeConfig{
		HttpAddr:        "0.0.0.0:8090",
		ShowStartBanner: false,
	})
	if err != nil {
		log.Println("Serve ERROR:", err)
	}
}

// logSmtpStatus affiche le statut SMTP dans les logs (sans révéler le password)
func logSmtpStatus(pb *pocketbase.PocketBase) {
	settings := pb.Settings()
	if settings.Smtp.Enabled && settings.Smtp.Host != "" {
		log.Printf("SMTP configured: %s:%d (user: %s)",
			settings.Smtp.Host,
			settings.Smtp.Port,
			settings.Smtp.Username)
	} else {
		log.Println("SMTP not configured - configure via Settings in the app")
	}
}

// StaticSPAHandler sert les fichiers statiques avec fallback SPA vers index.html
func StaticSPAHandler(fsys fs.FS) echo.HandlerFunc {
	fileServer := http.FileServer(http.FS(fsys))

	return func(c echo.Context) error {
		path := c.Request().URL.Path
		if path == "/" {
			path = "/index.html"
		}

		// Essaie d'ouvrir le fichier
		f, err := fsys.Open(path[1:]) // Enlève le "/" initial
		if err != nil {
			// Fichier non trouvé → SPA fallback vers index.html
			f, err = fsys.Open("index.html")
			if err != nil {
				return c.String(404, "Not found")
			}
			f.Close()
			c.Request().URL.Path = "/index.html"
		} else {
			f.Close()
		}

		fileServer.ServeHTTP(c.Response(), c.Request())
		return nil
	}
}

func waitForPocketBase() {
	for i := 0; i < 50; i++ {
		resp, err := http.Get("http://127.0.0.1:8090/api/health")
		if err == nil {
			resp.Body.Close()
			log.Println("PocketBase ready!")
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	log.Println("PocketBase timeout!")
}
