// backend/smtp_settings.go
package backend

import (
	"net/mail"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/tools/mailer"
)

type SmtpSettingsRequest struct {
	Enabled      bool   `json:"enabled"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	SenderName   string `json:"senderName"`
	SenderEmail  string `json:"senderEmail"`
}

type SmtpSettingsResponse struct {
	Enabled      bool   `json:"enabled"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	Username     string `json:"username"`
	HasPassword  bool   `json:"hasPassword"` // Ne pas renvoyer le mot de passe en clair
	SenderName   string `json:"senderName"`
	SenderEmail  string `json:"senderEmail"`
}

func RegisterSmtpSettingsRoutes(pb *pocketbase.PocketBase, e *echo.Echo) {
	// GET - Récupérer les settings actuels
	e.GET("/api/settings/smtp", func(c echo.Context) error {
		// Vérifier l'authentification admin
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifié", nil)
		}

		// Vérifier si c'est un admin (optionnel mais recommandé)
		// Tu peux ajouter une vérification de rôle ici si tu as un champ "role" sur users

		settings := pb.Settings()

		response := SmtpSettingsResponse{
			Enabled:     settings.Smtp.Enabled,
			Host:        settings.Smtp.Host,
			Port:        settings.Smtp.Port,
			Username:    settings.Smtp.Username,
			HasPassword: settings.Smtp.Password != "",
			SenderName:  settings.Meta.SenderName,
			SenderEmail: settings.Meta.SenderAddress,
		}

		return c.JSON(200, response)
	}, apis.ActivityLogger(pb))

	// POST - Sauvegarder les settings
	e.POST("/api/settings/smtp", func(c echo.Context) error {
		// Vérifier l'authentification
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifié", nil)
		}

		var req SmtpSettingsRequest
		if err := c.Bind(&req); err != nil {
			return apis.NewBadRequestError("Données invalides", err)
		}

		settings := pb.Settings()

		settings.Smtp.Enabled = req.Enabled
		settings.Smtp.Host = req.Host
		settings.Smtp.Port = req.Port
		settings.Smtp.Username = req.Username

		// Ne mettre à jour le password que s'il est fourni (non vide)
		if req.Password != "" {
			settings.Smtp.Password = req.Password
		}

		// TLS selon le port
		if req.Port == 465 {
			settings.Smtp.Tls = true
		} else {
			settings.Smtp.Tls = true // STARTTLS pour 587
		}

		settings.Meta.SenderName = req.SenderName
		settings.Meta.SenderAddress = req.SenderEmail

		// Sauvegarder
		if err := pb.Dao().SaveSettings(settings); err != nil {
			return apis.NewBadRequestError("Erreur lors de la sauvegarde: "+err.Error(), err)
		}

		return c.JSON(200, map[string]interface{}{
			"success": true,
			"message": "Configuration SMTP sauvegardée",
		})
	}, apis.ActivityLogger(pb))

	// POST - Tester la connexion SMTP
	e.POST("/api/settings/smtp/test", func(c echo.Context) error {
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifié", nil)
		}

		var req struct {
			Email string `json:"email"`
		}
		if err := c.Bind(&req); err != nil {
			return apis.NewBadRequestError("Données invalides", err)
		}

		if req.Email == "" {
			return apis.NewBadRequestError("Email de test requis", nil)
		}

		settings := pb.Settings()
		if !settings.Smtp.Enabled || settings.Smtp.Host == "" {
			return apis.NewBadRequestError("SMTP non configuré", nil)
		}

		// Envoyer un email de test
		message := &mailer.Message{
			From: mail.Address{
				Address: settings.Meta.SenderAddress,
				Name:    settings.Meta.SenderName,
			},
			To:      []mail.Address{{Address: req.Email}},
			Subject: "Test de configuration SMTP - PocketReact",
			HTML: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
	<h2 style="color: #22c55e;">✅ Configuration SMTP réussie !</h2>
	<p>Si vous recevez cet email, votre configuration SMTP fonctionne correctement.</p>
	<hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
	<p style="color: #999; font-size: 12px;">Email envoyé depuis PocketReact</p>
</body>
</html>`,
		}

		if err := pb.NewMailClient().Send(message); err != nil {
			return apis.NewBadRequestError("Échec de l'envoi: "+err.Error(), err)
		}

		return c.JSON(200, map[string]interface{}{
			"success": true,
			"message": "Email de test envoyé à " + req.Email,
		})
	}, apis.ActivityLogger(pb))
}