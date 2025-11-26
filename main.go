package main

import (
	"log"
	"net/http"
	"os"
	"pocket-react/backend"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "pocket-react/migrations"
)

func main() {
	config := backend.LoadConfig()

	if err := os.MkdirAll(config.DataDir, 0755); err != nil {
		log.Fatal(err)
	}

	app := pocketbase.New()

	if err := app.RootCmd.PersistentFlags().Set("dir", config.DataDir); err != nil {
		log.Fatal(err)
	}

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// enable auto creation of migration files when making collection changes in the Admin UI
		// (the isGoRun check is to enable it only during development)
		Automigrate: isGoRun,
	})

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		e.Router.GET("/health", func(c echo.Context) error {
			return c.JSON(http.StatusOK, map[string]string{
				"status": "healthy",
			})
		})

		backend.RegisterSetupRoutes(app, e.Router)

		ServeViteAssets(e.Router)

		return nil
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
