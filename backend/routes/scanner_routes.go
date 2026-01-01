// backend/routes/scanner_routes.go
package routes

import (
	"net/http"
	"pocket-react/backend/pos"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"golang.org/x/net/websocket"
)

// RegisterScannerRoutes enregistre les routes pour la scanette
func RegisterScannerRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	// Groupe /api/scanner
	scannerGroup := router.Group("/api/scanner")

	// Status de la scanette
	scannerGroup.GET("/status", func(c echo.Context) error {
		return c.JSON(http.StatusOK, pos.Scanner.GetStatus())
	})

	// Démarrer l'écoute de la scanette
	scannerGroup.POST("/start", func(c echo.Context) error {
		var input struct {
			PortName string `json:"portName"`
			BaudRate int    `json:"baudRate"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if input.PortName == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "portName is required",
			})
		}

		// Valeur par défaut pour baudRate
		if input.BaudRate == 0 {
			input.BaudRate = 9600
		}

		if err := pos.Scanner.Start(input.PortName, input.BaudRate); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Scanner démarré",
			"status":  pos.Scanner.GetStatus(),
		})
	})

	// Arrêter l'écoute de la scanette
	scannerGroup.POST("/stop", func(c echo.Context) error {
		if err := pos.Scanner.Stop(); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Scanner arrêté",
		})
	})

	// Simuler un scan (pour les tests)
	scannerGroup.POST("/simulate", func(c echo.Context) error {
		var input struct {
			Barcode string `json:"barcode"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if input.Barcode == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "barcode is required",
			})
		}

		pos.Scanner.SimulateScan(input.Barcode)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Scan simulé envoyé",
		})
	})

	// Broadcaster un scan HID (mode clavier) aux autres appareils
	scannerGroup.POST("/broadcast", func(c echo.Context) error {
		var input struct {
			Barcode string `json:"barcode"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if input.Barcode == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "barcode is required",
			})
		}

		// Broadcaster à tous les clients WebSocket
		pos.Scanner.Broadcast(input.Barcode)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"barcode": input.Barcode,
		})
	})

	// WebSocket pour recevoir les scans en temps réel
	router.GET("/api/scanner/ws", func(c echo.Context) error {
		websocket.Handler(func(ws *websocket.Conn) {
			defer ws.Close()

			// S'abonner aux scans
			scanChan := pos.Scanner.Subscribe()
			defer pos.Scanner.Unsubscribe(scanChan)

			// Envoyer un message de bienvenue
			websocket.JSON.Send(ws, map[string]interface{}{
				"type":    "connected",
				"message": "Scanner WebSocket connecté",
				"status":  pos.Scanner.GetStatus(),
			})

			// Boucle de lecture/écriture
			done := make(chan bool)

			// Goroutine pour détecter la déconnexion
			go func() {
				for {
					var msg string
					err := websocket.Message.Receive(ws, &msg)
					if err != nil {
						done <- true
						return
					}
					// On peut traiter les messages entrants ici si besoin
					// Par exemple des commandes comme "ping"
					if msg == "ping" {
						websocket.JSON.Send(ws, map[string]string{
							"type": "pong",
						})
					}
				}
			}()

			// Boucle principale : envoyer les scans
			for {
				select {
				case barcode := <-scanChan:
					err := websocket.JSON.Send(ws, map[string]interface{}{
						"type":    "scan",
						"barcode": barcode,
					})
					if err != nil {
						return
					}
				case <-done:
					return
				}
			}
		}).ServeHTTP(c.Response(), c.Request())
		return nil
	})
}
