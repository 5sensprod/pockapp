// backend/quotes_email.go
package backend

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/mail"
	"strings"

	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/tools/mailer"
)

type SendQuoteEmailRequest struct {
	QuoteID        string `json:"quoteId"`
	RecipientEmail string `json:"recipientEmail"`
	RecipientName  string `json:"recipientName"`
	Subject        string `json:"subject"`
	Message        string `json:"message"`
	PdfBase64      string `json:"pdfBase64"`
	PdfFilename    string `json:"pdfFilename"`
}

func RegisterQuoteEmailRoutes(pb *pocketbase.PocketBase, e *echo.Echo) {
	e.POST("/api/quotes/send-email", func(c echo.Context) error {
		// Vérifier l'authentification
		info := apis.RequestInfo(c)
		if info.AuthRecord == nil {
			return apis.NewForbiddenError("Non authentifié", nil)
		}

		var req SendQuoteEmailRequest
		if err := c.Bind(&req); err != nil {
			return apis.NewBadRequestError("Données invalides", err)
		}

		// Validation
		if req.QuoteID == "" {
			return apis.NewBadRequestError("quoteId requis", nil)
		}
		if req.RecipientEmail == "" {
			return apis.NewBadRequestError("recipientEmail requis", nil)
		}

		// Valider l'email
		if _, err := mail.ParseAddress(req.RecipientEmail); err != nil {
			return apis.NewBadRequestError("Email invalide", err)
		}

		// Récupérer le devis
		quote, err := pb.Dao().FindRecordById("quotes", req.QuoteID)
		if err != nil {
			return apis.NewNotFoundError("Devis introuvable", err)
		}

		// Préparer le sujet
		subject := req.Subject
		if subject == "" {
			subject = "Devis " + quote.GetString("number")
		}

		// Convertir les sauts de ligne en <br> pour le HTML
		messageHTML := strings.ReplaceAll(req.Message, "\n", "<br>")

		// Préparer le message HTML
		htmlBody := `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
	<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
		<p>` + messageHTML + `</p>
		<hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
		<p style="color: #999; font-size: 12px;">
			Ce message a été envoyé automatiquement depuis notre système de gestion.
		</p>
	</div>
</body>
</html>`

		// Préparer l'email
		message := &mailer.Message{
			From: mail.Address{
				Address: pb.Settings().Meta.SenderAddress,
				Name:    pb.Settings().Meta.SenderName,
			},
			To:      []mail.Address{{Address: req.RecipientEmail, Name: req.RecipientName}},
			Subject: subject,
			HTML:    htmlBody,
		}

		// Ajouter le PDF en pièce jointe si fourni
		if req.PdfBase64 != "" {
			pdfData, err := base64.StdEncoding.DecodeString(req.PdfBase64)
			if err != nil {
				return apis.NewBadRequestError("PDF invalide (erreur de décodage base64)", err)
			}

			filename := req.PdfFilename
			if filename == "" {
				filename = "Devis_" + quote.GetString("number") + ".pdf"
			}

			message.Attachments = map[string]io.Reader{
				filename: bytes.NewReader(pdfData),
			}
		}

		// Envoyer l'email
		if err := pb.NewMailClient().Send(message); err != nil {
			return apis.NewBadRequestError("Erreur lors de l'envoi de l'email: "+err.Error(), err)
		}

		// Mettre à jour le statut du devis si c'était un brouillon
		if quote.GetString("status") == "draft" {
			quote.Set("status", "sent")
			if err := pb.Dao().SaveRecord(quote); err != nil {
				// Log mais ne pas bloquer
				pb.Logger().Error("Erreur mise à jour statut devis", "error", err)
			}
		}

		return c.JSON(200, map[string]interface{}{
			"success": true,
			"message": "Email envoyé avec succès",
		})
	}, apis.ActivityLogger(pb))
}