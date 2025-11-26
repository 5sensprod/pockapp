// main.go - VERSION AVEC DEBUG
package main

import (
    "embed"
    "log"
    "net/http"
    "os"
    "path/filepath"
    "time"

    "pocket-react/backend"

    "github.com/pocketbase/pocketbase"
    "github.com/pocketbase/pocketbase/apis"
    "github.com/pocketbase/pocketbase/core"
    "github.com/wailsapp/wails/v2"
    "github.com/wailsapp/wails/v2/pkg/options"
    "github.com/wailsapp/wails/v2/pkg/options/assetserver"
    "github.com/wailsapp/wails/v2/pkg/options/windows"
    "github.com/labstack/echo/v5"
)

//go:embed all:dist
var assets embed.FS

var logFile *os.File

func initLogging(baseDir string) {
    var err error
    logPath := filepath.Join(baseDir, "debug.log")
    logFile, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
    if err == nil {
        log.SetOutput(logFile)
    }
    log.Println("=== App started ===")
    log.Println("Base dir:", baseDir)
}

func main() {
    exe, _ := os.Executable()
    baseDir := filepath.Dir(exe)
    os.Chdir(baseDir)
    
    initLogging(baseDir)

    // Données dans AppData, pas à côté de l'exe
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
    
    go startPocketBaseNoCobra(pb)
    waitForPocketBase()

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
}

func startPocketBaseNoCobra(pb *pocketbase.PocketBase) {
    log.Println("Starting PocketBase bootstrap...")
    
    if err := pb.Bootstrap(); err != nil {
        log.Println("Bootstrap ERROR:", err)
        return
    }
    log.Println("Bootstrap OK, DataDir:", pb.DataDir())

    pb.OnBeforeServe().Add(func(e *core.ServeEvent) error {
        log.Println("OnBeforeServe called")
        
        // Ajoute /api/health 
        e.Router.GET("/api/health", func(c echo.Context) error {
            return c.JSON(200, map[string]string{"status": "ok"})
        })
        
        backend.RegisterSetupRoutes(pb, e.Router)
        return nil
    })

    log.Println("Starting HTTP server...")
    _, err := apis.Serve(pb, apis.ServeConfig{
        HttpAddr:        "127.0.0.1:8090",
        ShowStartBanner: false,
    })
    if err != nil {
        log.Println("Serve ERROR:", err)
    }
}

func waitForPocketBase() {
    for i := 0; i < 50; i++ {
        resp, err := http.Get("http://127.0.0.1:8090/api/health")
        if err == nil && resp.StatusCode == 200 {
            resp.Body.Close()
            log.Println("PocketBase ready!")
            return
        }
        time.Sleep(100 * time.Millisecond)
    }
    log.Println("PocketBase timeout!")
}