package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"pocket-react/backend"
	"pocket-react/backend/hooks"

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
	envPaths := []string{
		filepath.Join(baseDir, ".env"),
		".env",
		"I:/pockapp/.env",
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

	// Charge le fichier .env
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

	// Configure SMTP après le bootstrap
	configureMailSettings(pb)

	// Exécuter les migrations pour créer les collections
	if err := backend.RunMigrations(pb); err != nil {
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

		// Routes de setup
		backend.RegisterSetupRoutes(pb, e.Router)

		// 📧 Route envoi email devis
		backend.RegisterQuoteEmailRoutes(pb, e.Router)

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

// configureMailSettings configure le SMTP depuis les variables d'environnement
func configureMailSettings(pb *pocketbase.PocketBase) {
	smtpHost := os.Getenv("SMTP_HOST")
	if smtpHost == "" {
		log.Println("SMTP not configured (SMTP_HOST empty)")
		return
	}

	settings := pb.Settings()

	port, _ := strconv.Atoi(os.Getenv("SMTP_PORT"))
	if port == 0 {
		port = 587 // Default STARTTLS port
	}

	settings.Smtp.Enabled = true
	settings.Smtp.Host = smtpHost
	settings.Smtp.Port = port
	settings.Smtp.Username = os.Getenv("SMTP_USERNAME")
	settings.Smtp.Password = os.Getenv("SMTP_PASSWORD")

	// TLS settings selon le port
	// Port 465 = SSL direct, Port 587 = STARTTLS
	if port == 465 {
		settings.Smtp.Tls = true
	} else {
		settings.Smtp.Tls = true // STARTTLS pour 587
	}

	// Sender info
	senderName := os.Getenv("SMTP_FROM_NAME")
	if senderName == "" {
		senderName = "PocketReact"
	}
	settings.Meta.SenderName = senderName
	settings.Meta.SenderAddress = os.Getenv("SMTP_FROM_EMAIL")

	// Sauvegarde les settings
	if err := pb.Dao().SaveSettings(settings); err != nil {
		log.Println("SMTP config save error:", err)
	} else {
		log.Printf("SMTP configured: %s:%d (user: %s)", smtpHost, port, settings.Smtp.Username)
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