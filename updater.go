// updater_windows.go — version "clean" : aucun PowerShell, lancement UAC via ShellExecuteW (runas)
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows"
)

const (
	githubOwner    = "5sensprod"
	githubRepo     = "pockapp"
	currentVersion = "1.2.7" // bump-version.ps1
)

type UpdateInfo struct {
	Available      bool   `json:"available"`
	Version        string `json:"version"`
	DownloadURL    string `json:"downloadUrl"`
	AssetName      string `json:"assetName"`
	ReleaseNotes   string `json:"releaseNotes"`
	PublishedAt    string `json:"publishedAt"`
	CurrentVersion string `json:"currentVersion"`
}

type GitHubRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	PublishedAt string `json:"published_at"`
	Assets      []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
		Size               int64  `json:"size"`
	} `json:"assets"`
}

func checkForUpdates() (*UpdateInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", githubOwner, githubRepo)
	log.Printf("🔍 [UPDATE] Vérification: %s", url)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("erreur création requête: %w", err)
	}

	req.Header.Set("User-Agent", "PocketReact-Updater/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("❌ [UPDATE] Erreur HTTP: %v", err)
		return nil, fmt.Errorf("erreur réseau: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("❌ [UPDATE] Statut %d: %s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("erreur API GitHub: status %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		log.Printf("❌ [UPDATE] Erreur JSON: %v", err)
		return nil, fmt.Errorf("erreur décodage: %w", err)
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")
	updateAvailable := compareVersions(latestVersion, currentVersion) > 0

	log.Printf("📦 [UPDATE] Actuelle: %s, Disponible: %s, MAJ: %v",
		currentVersion, latestVersion, updateAvailable)

	info := &UpdateInfo{
		Available:      updateAvailable,
		Version:        latestVersion,
		ReleaseNotes:   release.Body,
		PublishedAt:    release.PublishedAt,
		CurrentVersion: currentVersion,
	}

	for _, asset := range release.Assets {
		log.Printf("   📎 Asset: %s (%.2f MB)", asset.Name, float64(asset.Size)/1024/1024)

		nameLower := strings.ToLower(asset.Name)
		if strings.HasSuffix(nameLower, "-installer.exe") && strings.HasPrefix(nameLower, "pocketreact") {
			info.DownloadURL = asset.BrowserDownloadURL
			info.AssetName = asset.Name
			log.Printf("✅ [UPDATE] Installateur trouvé: %s", asset.Name)
			break
		}
	}

	if info.DownloadURL == "" && updateAvailable {
		log.Printf("⚠️ [UPDATE] Aucun installateur trouvé!")
	}

	return info, nil
}

/*
   =========================
   ShellExecuteW (runas) — no PowerShell, no console window
   =========================
*/

var (
	shell32       = windows.NewLazySystemDLL("shell32.dll")
	shellExecuteW = shell32.NewProc("ShellExecuteW")
)

func runInstallerAsAdmin(installerPath string, args string) error {
	abs, err := filepath.Abs(installerPath)
	if err == nil {
		installerPath = abs
	}

	verb, err := windows.UTF16PtrFromString("runas")
	if err != nil {
		return err
	}
	file, err := windows.UTF16PtrFromString(installerPath)
	if err != nil {
		return err
	}
	params, err := windows.UTF16PtrFromString(args)
	if err != nil {
		return err
	}
	dir, err := windows.UTF16PtrFromString(filepath.Dir(installerPath))
	if err != nil {
		return err
	}

	const SW_SHOWNORMAL = 1

	r, _, callErr := shellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(file)),
		uintptr(unsafe.Pointer(params)),
		uintptr(unsafe.Pointer(dir)),
		uintptr(SW_SHOWNORMAL),
	)

	if r <= 32 {
		// Si l’utilisateur annule l’UAC, code typique: 1223 (ERROR_CANCELLED)
		if callErr != nil && callErr != windows.ERROR_SUCCESS {
			return fmt.Errorf("ShellExecuteW failed: code=%d err=%v", r, callErr)
		}
		return fmt.Errorf("ShellExecuteW failed: code=%d", r)
	}

	return nil
}

func downloadAndInstallUpdate(ctx context.Context, downloadURL string) error {
	log.Println("═══════════════════════════════════════════════════")
	log.Println("🚀 [DOWNLOAD] DÉBUT DU TÉLÉCHARGEMENT")
	log.Printf("📥 [DOWNLOAD] URL: %s", downloadURL)

	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Connexion au serveur GitHub...",
	})

	assetName := extractAssetName(downloadURL)
	log.Printf("📄 [DOWNLOAD] Nom fichier: %s", assetName)

	userHomeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("impossible de trouver le dossier utilisateur: %w", err)
	}

	downloadsDir := filepath.Join(userHomeDir, "Downloads")
	if _, err := os.Stat(downloadsDir); os.IsNotExist(err) {
		downloadsDir = filepath.Join(userHomeDir, "Téléchargements")
		if _, err := os.Stat(downloadsDir); os.IsNotExist(err) {
			downloadsDir = userHomeDir
		}
	}
	log.Printf("📁 [DOWNLOAD] Dossier: %s", downloadsDir)

	installerPath := filepath.Join(downloadsDir, assetName)

	if _, err := os.Stat(installerPath); err == nil {
		log.Println("🗑️ [DOWNLOAD] Suppression ancien fichier...")
		_ = os.Remove(installerPath)
	}

	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Téléchargement en cours...",
	})

	if err := downloadFile(installerPath, downloadURL); err != nil {
		log.Printf("❌ [DOWNLOAD] Erreur: %v", err)
		return fmt.Errorf("erreur téléchargement: %w", err)
	}

	fileInfo, err := os.Stat(installerPath)
	if err != nil {
		return fmt.Errorf("fichier non trouvé: %w", err)
	}

	fileSizeMB := float64(fileInfo.Size()) / 1024 / 1024
	log.Printf("✅ [DOWNLOAD] Téléchargé: %.2f MB", fileSizeMB)

	if fileSizeMB < 10 {
		return fmt.Errorf("fichier trop petit (%.1f MB)", fileSizeMB)
	}

	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "ready",
		"message": fmt.Sprintf("Téléchargement terminé (%.1f MB). Lancement...", fileSizeMB),
	})

	log.Printf("🚀 [DOWNLOAD] Lancement (runas): %s", installerPath)
	if err := runInstallerAsAdmin(installerPath, ""); err != nil {
		return fmt.Errorf("erreur lancement installateur: %w", err)
	}

	log.Println("✅ [DOWNLOAD] Installateur lancé!")

	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "completed",
		"message": "Installation en cours. Fermeture de l'application...",
	})

	go func() {
		time.Sleep(2 * time.Second)
		runtime.Quit(ctx)
	}()

	return nil
}

func downloadFile(dstPath string, url string) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}

	req.Header.Set("User-Agent", "PocketReact-Updater/1.0")
	req.Header.Set("Accept", "application/octet-stream")

	client := &http.Client{
		Timeout: 10 * time.Minute,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			req.Header.Set("User-Agent", "PocketReact-Updater/1.0")
			return nil
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	out, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func extractAssetName(url string) string {
	parts := strings.Split(url, "/")
	if len(parts) > 0 {
		name := parts[len(parts)-1]
		if idx := strings.Index(name, "?"); idx != -1 {
			name = name[:idx]
		}
		if strings.HasSuffix(strings.ToLower(name), ".exe") {
			return name
		}
	}
	return "PocketReact-installer.exe"
}

func compareVersions(v1, v2 string) int {
	parts1 := strings.Split(v1, ".")
	parts2 := strings.Split(v2, ".")

	for i := 0; i < 3; i++ {
		var p1, p2 int
		if i < len(parts1) {
			fmt.Sscanf(parts1[i], "%d", &p1)
		}
		if i < len(parts2) {
			fmt.Sscanf(parts2[i], "%d", &p2)
		}

		if p1 > p2 {
			return 1
		} else if p1 < p2 {
			return -1
		}
	}
	return 0
}
