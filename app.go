package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pocket-react/backend"
	"pocket-react/backend/pos"

	"github.com/pocketbase/pocketbase"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct - exposée au frontend via bindings
type App struct {
	ctx context.Context
	pb  *pocketbase.PocketBase
}

// NewApp crée une nouvelle instance App
func NewApp(pb *pocketbase.PocketBase) *App {
	return &App{pb: pb}
}

// startup est appelé au démarrage de l'app
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// ✨ NOUVEAU : Définir le titre avec la version
	version := a.GetAppVersion()
	runtime.WindowSetTitle(ctx, fmt.Sprintf("Pocket App - v%s", version))

	// Attend que PocketBase soit prêt
	a.waitForPocketBase()

	// ✅ NOUVEAU : Vérification automatique des mises à jour au démarrage
	// Lance la vérification dans une goroutine pour ne pas bloquer le démarrage
	go a.AutoCheckUpdates()
	go a.StartRemoteNotificationPoller()
}

// shutdown est appelé à la fermeture
func (a *App) shutdown(ctx context.Context) {
	// Cleanup si nécessaire
}

// waitForPocketBase attend que le serveur soit accessible
func (a *App) waitForPocketBase() {
	for i := 0; i < 30; i++ {
		resp, err := http.Get("http://127.0.0.1:8090/api/health")
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// ============================================
// BINDINGS - Fonctions appelables depuis JS
// ============================================

// GetAppVersion retourne la version de l'app
func (a *App) GetAppVersion() string {
	return "1.4.2"
}

// OpenFileDialog ouvre un sélecteur de fichiers natif
func (a *App) OpenFileDialog(title string, filters []string) (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: title,
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Fichiers",
				Pattern:     "*.csv;*.xlsx",
			},
		},
	})
}

// ShowNotification affiche une notification système
func (a *App) ShowNotification(title, message string) {
	// Windows toast notification via Wails
	runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   title,
		Message: message,
	})
}

// MinimizeToTray minimise dans la barre système
func (a *App) MinimizeToTray() {
	runtime.WindowMinimise(a.ctx)
}

// Quit ferme l'application proprement
func (a *App) Quit() {
	runtime.Quit(a.ctx)
}

// GetDataPath retourne le chemin des données
func (a *App) GetDataPath() string {
	return a.pb.DataDir()
}

// CheckSetupStatus vérifie si le setup est nécessaire (binding direct)
func (a *App) CheckSetupStatus() (bool, error) {
	collection, err := a.pb.Dao().FindCollectionByNameOrId("users")
	if err != nil {
		return true, nil // Needs setup
	}

	var count int
	err = a.pb.Dao().DB().
		Select("COUNT(*)").
		From(collection.Name).
		Row(&count)

	if err != nil || count == 0 {
		return true, nil
	}

	return false, nil
}

func (a *App) GetNetworkInfo() map[string]interface{} {
	ip := backend.GetLocalIP()

	return map[string]interface{}{
		"ip":   ip,
		"port": 8090,
		"url":  "http://" + ip + ":8090",
	}
}

// ============================================
// BINDINGS POS - Impression et tiroir caisse
// ============================================

type PrintPosReceiptInput struct {
	PrinterName string          `json:"printerName"`
	Width       int             `json:"width"`
	CompanyId   string          `json:"companyId"`
	Receipt     pos.ReceiptData `json:"receipt"`
}

type OpenCashDrawerInput struct {
	PrinterName string `json:"printerName"`
	Width       int    `json:"width"`
}

// ListPrinters retourne la liste des imprimantes Windows disponibles
func (a *App) ListPrinters() ([]string, error) {
	return pos.ListPrinters()
}

// PrintPosReceipt imprime un ticket de caisse
func (a *App) PrintPosReceipt(input PrintPosReceiptInput) error {
	receipt := input.Receipt
	receipt.Width = input.Width

	// Enrichissement header depuis PocketBase
	if input.CompanyId != "" {
		rec, err := a.pb.Dao().FindRecordById("companies", input.CompanyId)
		if err == nil && rec != nil {
			// Adapte les champs exacts à ton schéma "companies"
			tradeName := rec.GetString("trade_name") // ou "commercial_name" selon ton schéma
			legalName := rec.GetString("name")

			if receipt.CompanyName == "" {
				if strings.TrimSpace(tradeName) != "" {
					receipt.CompanyName = tradeName
				} else {
					receipt.CompanyName = legalName
				}
			}

			// Exemple d'assemblage adresse sur 1-3 lignes
			line1 := rec.GetString("address_line1")
			line2 := rec.GetString("address_line2")
			zip := rec.GetString("zip_code")
			city := rec.GetString("city")

			if receipt.CompanyLine1 == "" {
				receipt.CompanyLine1 = line1
			}
			if receipt.CompanyLine2 == "" {
				receipt.CompanyLine2 = line2
			}
			if receipt.CompanyLine3 == "" {
				if zip != "" || city != "" {
					receipt.CompanyLine3 = strings.TrimSpace(zip + " " + city)
				}
			}

			if receipt.CompanyPhone == "" {
				receipt.CompanyPhone = rec.GetString("phone")
			}
			if receipt.CompanyEmail == "" {
				receipt.CompanyEmail = rec.GetString("email")
			}
			if receipt.CompanySiret == "" {
				receipt.CompanySiret = rec.GetString("siret")
			}
			if receipt.CompanyVat == "" {
				receipt.CompanyVat = rec.GetString("vat_number")
			}
		}
	}

	raw := pos.BuildReceipt(receipt)
	return pos.RawPrint(input.PrinterName, raw)
}

// OpenCashDrawer ouvre le tiroir caisse via commande ESC/POS
func (a *App) OpenCashDrawer(input OpenCashDrawerInput) error {
	cmd := pos.OpenDrawerCmd()
	return pos.RawPrint(input.PrinterName, cmd)
}

// ============================================
// BINDINGS CUSTOMER DISPLAY - Afficheur VFD
// ============================================

type SendDisplayTextInput struct {
	PortName   string `json:"portName"`
	BaudRate   string `json:"baudRate"`
	Protocol   string `json:"protocol"`
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
	ClearFirst bool   `json:"clearFirst"`
}

type TestDisplayInput struct {
	PortName string `json:"portName"`
	BaudRate string `json:"baudRate"`
	Protocol string `json:"protocol"`
}

// ListSerialPorts retourne la liste des ports série disponibles
func (a *App) ListSerialPorts() ([]string, error) {
	return pos.ListSerialPorts()
}

// SendDisplayText envoie du texte à l'afficheur VFD
func (a *App) SendDisplayText(input SendDisplayTextInput) error {
	baudRate := 9600
	if input.BaudRate == "19200" {
		baudRate = 19200
	}

	msg := pos.VFDMessage{
		Line1:      input.Line1,
		Line2:      input.Line2,
		ClearFirst: input.ClearFirst,
	}

	protocol := pos.VFDProtocol(input.Protocol)
	data := pos.BuildVFDCommand(msg, protocol, 100)

	return pos.SendToSerialPort(input.PortName, baudRate, data)
}

// TestDisplay envoie un message de test à l'afficheur
func (a *App) TestDisplay(input TestDisplayInput) error {
	baudRate := 9600
	if input.BaudRate == "19200" {
		baudRate = 19200
	}

	protocol := pos.VFDProtocol(input.Protocol)
	data := pos.BuildTestMessage(100, protocol)

	return pos.SendToSerialPort(input.PortName, baudRate, data)
}

// ============================================
// BINDINGS MISE À JOUR
// ============================================

// CheckForUpdates vérifie s'il y a une mise à jour disponible
func (a *App) CheckForUpdates() (map[string]interface{}, error) {
	info, err := checkForUpdates()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"available":      info.Available,
		"version":        info.Version,
		"downloadUrl":    info.DownloadURL,
		"releaseNotes":   info.ReleaseNotes,
		"publishedAt":    info.PublishedAt,
		"currentVersion": info.CurrentVersion,
	}, nil
}

// DownloadAndInstallUpdate télécharge et installe la mise à jour
func (a *App) DownloadAndInstallUpdate(downloadURL string) error {
	return downloadAndInstallUpdate(a.ctx, downloadURL)
}

// AutoCheckUpdates vérifie automatiquement au démarrage
func (a *App) AutoCheckUpdates() {
	time.Sleep(5 * time.Second)

	info, err := checkForUpdates()
	if err != nil {
		return
	}

	if info.Available {
		runtime.EventsEmit(a.ctx, "update:available", map[string]interface{}{
			"available":      info.Available,
			"version":        info.Version,
			"downloadUrl":    info.DownloadURL,
			"releaseNotes":   info.ReleaseNotes,
			"publishedAt":    info.PublishedAt,
			"currentVersion": info.CurrentVersion,
		})
	}
}
