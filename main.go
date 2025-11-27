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

func main() {
	exe, _ := os.Executable()
	baseDir := filepath.Dir(exe)
	os.Chdir(baseDir)

	initLogging(baseDir)

	appDataDir := os.Getenv("LOCALAPPDATA")
	dataDir := filepath.Join(appDataDir, "PocketReact", "pb_data")
	log.Println("Data dir:", dataDir)

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Println("MkdirAll error:", err)
	}

	pb := pocketbase.NewWithConfig(pocketbase.Config{
		DefaultDataDir: dataDir,
	})

	app := NewApp(pb)

	// Passe les assets embarqués
	go startPocketBaseNoCobra(pb, assets)
	waitForPocketBase()

	if err := backend.StartMDNS(appPort, serviceName); err != nil {
		log.Println("mDNS error:", err)
	}

	wails.Run(&options.App{
		Title:  "Pocket React",
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

	// 🆕 Exécuter les migrations pour créer les collections
	if err := backend.RunMigrations(pb); err != nil {
		log.Println("Migrations ERROR:", err)
		// On continue quand même, l'erreur n'est pas fatale
	}

	// Extrais le sous-dossier "dist" de l'embed
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

		backend.RegisterSetupRoutes(pb, e.Router)

		// SPA handler avec assets embarqués
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
		if resp, err := http.Get("http://127.0.0.1:8090/api/health"); err == nil {
			resp.Body.Close()
			log.Println("PocketBase ready!")
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	log.Println("PocketBase timeout!")
}