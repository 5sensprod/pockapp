// backend/routes/display_routes.go
package routes

import (
	"net/http"
	"pocket-react/backend/pos"
	"strconv"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"golang.org/x/net/websocket"
)

// RegisterDisplayRoutes enregistre les routes pour l'affichage client
func RegisterDisplayRoutes(pb *pocketbase.PocketBase, router *echo.Echo) {
	// Groupe /api/display
	displayGroup := router.Group("/api/display")

	// Status de l'affichage
	displayGroup.GET("/status", func(c echo.Context) error {
		return c.JSON(http.StatusOK, pos.Display.GetStatus())
	})

	// Configurer l'affichage
	displayGroup.POST("/configure", func(c echo.Context) error {
		var input struct {
			PortName string `json:"portName"`
			BaudRate string `json:"baudRate"`
			Protocol string `json:"protocol"`
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

		// Parse baud rate
		baudRate, err := strconv.Atoi(input.BaudRate)
		if err != nil {
			baudRate = 9600 // Défaut
		}

		// Valider protocol
		protocol := pos.VFDProtocol(input.Protocol)
		if protocol == "" {
			protocol = pos.ProtocolEPSON_D101 // Défaut
		}

		pos.Display.Configure(input.PortName, baudRate, protocol)

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Display configuré",
			"status":  pos.Display.GetStatus(),
		})
	})

	// Mettre à jour l'affichage
	displayGroup.POST("/update", func(c echo.Context) error {
		var input struct {
			Line1      string `json:"line1"`
			Line2      string `json:"line2"`
			ClearFirst bool   `json:"clearFirst"`
			DeviceID   string `json:"deviceID"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if err := pos.Display.UpdateDisplay(input.Line1, input.Line2, input.ClearFirst, input.DeviceID); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"line1":   input.Line1,
			"line2":   input.Line2,
		})
	})

	// Effacer l'affichage
	displayGroup.POST("/clear", func(c echo.Context) error {
		var input struct {
			DeviceID string `json:"deviceID"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if err := pos.Display.Clear(input.DeviceID); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Display effacé",
		})
	})

	// Test de l'affichage (bypass contrôle pour les tests)
	displayGroup.POST("/test", func(c echo.Context) error {
		// Envoyer directement via UpdateDisplay avec deviceID vide (bypass contrôle)
		err := pos.Display.UpdateDisplay("TEST AFFICHEUR", "20 colonnes x 2", true, "")
		if err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Test envoyé",
		})
	})

	// Prendre le contrôle
	displayGroup.POST("/take-control", func(c echo.Context) error {
		var input struct {
			DeviceID string `json:"deviceID"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if input.DeviceID == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "deviceID is required",
			})
		}

		if err := pos.Display.TakeControl(input.DeviceID); err != nil {
			return c.JSON(http.StatusConflict, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success":      true,
			"message":      "Contrôle pris",
			"controllerID": input.DeviceID,
		})
	})

	// Libérer le contrôle
	displayGroup.POST("/release-control", func(c echo.Context) error {
		var input struct {
			DeviceID string `json:"deviceID"`
		}

		if err := c.Bind(&input); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "Invalid request body",
			})
		}

		if input.DeviceID == "" {
			return c.JSON(http.StatusBadRequest, map[string]string{
				"error": "deviceID is required",
			})
		}

		if err := pos.Display.ReleaseControl(input.DeviceID); err != nil {
			return c.JSON(http.StatusForbidden, map[string]string{
				"error": err.Error(),
			})
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Contrôle libéré",
		})
	})

	// Désactiver l'affichage
	displayGroup.POST("/deactivate", func(c echo.Context) error {
		pos.Display.Deactivate()

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Display désactivé",
		})
	})

	// WebSocket pour recevoir les updates en temps réel
	router.GET("/api/display/ws", func(c echo.Context) error {
		websocket.Handler(func(ws *websocket.Conn) {
			defer ws.Close()

			// S'abonner aux updates
			updateChan := pos.Display.Subscribe()
			defer pos.Display.Unsubscribe(updateChan)

			// Envoyer un message de bienvenue
			websocket.JSON.Send(ws, map[string]interface{}{
				"type":    "connected",
				"message": "Display WebSocket connecté",
				"status":  pos.Display.GetStatus(),
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
					// Ping/pong
					if msg == "ping" {
						websocket.JSON.Send(ws, map[string]string{
							"type": "pong",
						})
					}
				}
			}()

			// Boucle principale : envoyer les updates
			for {
				select {
				case update := <-updateChan:
					err := websocket.JSON.Send(ws, map[string]interface{}{
						"type":  "display_update",
						"line1": update.Line1,
						"line2": update.Line2,
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
