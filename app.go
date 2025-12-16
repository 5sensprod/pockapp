package main

import (
	"context"
	"net/http"
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

	// Attend que PocketBase soit prêt
	a.waitForPocketBase()
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
	return "1.0.0"
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

	raw := pos.BuildReceipt(receipt)
	return pos.RawPrint(input.PrinterName, raw)
}

// OpenCashDrawer ouvre le tiroir caisse via commande ESC/POS
func (a *App) OpenCashDrawer(input OpenCashDrawerInput) error {
	cmd := pos.OpenDrawerCmd()
	return pos.RawPrint(input.PrinterName, cmd)
}
