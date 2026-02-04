// updater.go — Mise à jour automatique depuis GitHub

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	githubOwner    = "5sensprod"
	githubRepo     = "pockapp"
	currentVersion = "1.4.5" // ⚠️ Mis à jour par bump-version.ps1
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

	// Chercher l'installateur dans les assets
	// Format attendu: PocketReact-X.Y.Z-windows-amd64-installer.exe
	for _, asset := range release.Assets {
		log.Printf("   📎 Asset: %s (%.2f MB)", asset.Name, float64(asset.Size)/1024/1024)

		nameLower := strings.ToLower(asset.Name)
		// ✅ Accepte les deux formats :
		// - Ancien: PocketReact-windows-amd64-installer.exe
		// - Nouveau: PocketReact-X.Y.Z-windows-amd64-installer.exe
		if strings.HasSuffix(nameLower, "-installer.exe") &&
			strings.HasPrefix(nameLower, "pocketreact") {
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

func downloadAndInstallUpdate(ctx context.Context, downloadURL string) error {
	log.Println("═══════════════════════════════════════════════════")
	log.Println("🚀 [DOWNLOAD] DÉBUT DU TÉLÉCHARGEMENT")
	log.Printf("📥 [DOWNLOAD] URL: %s", downloadURL)

	// Notifier le frontend
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Connexion au serveur GitHub...",
	})

	// Extraire le nom du fichier depuis l'URL
	assetName := extractAssetName(downloadURL)
	log.Printf("📄 [DOWNLOAD] Nom fichier: %s", assetName)

	// Trouver le dossier Downloads
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

	// Supprimer l'ancien fichier si présent
	if _, err := os.Stat(installerPath); err == nil {
		log.Println("🗑️ [DOWNLOAD] Suppression ancien fichier...")
		os.Remove(installerPath)
	}

	// Notifier progression
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Téléchargement en cours...",
	})

	// Télécharger
	if err := downloadFile(installerPath, downloadURL); err != nil {
		log.Printf("❌ [DOWNLOAD] Erreur: %v", err)
		return fmt.Errorf("erreur téléchargement: %w", err)
	}

	// Vérifier la taille
	fileInfo, err := os.Stat(installerPath)
	if err != nil {
		return fmt.Errorf("fichier non trouvé: %w", err)
	}

	fileSizeMB := float64(fileInfo.Size()) / 1024 / 1024
	log.Printf("✅ [DOWNLOAD] Téléchargé: %.2f MB", fileSizeMB)

	if fileSizeMB < 10 {
		return fmt.Errorf("fichier trop petit (%.1f MB)", fileSizeMB)
	}

	// Notifier prêt
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "ready",
		"message": fmt.Sprintf("Téléchargement terminé (%.1f MB). Lancement...", fileSizeMB),
	})

	// Lancer l'installateur
	log.Printf("🚀 [DOWNLOAD] Lancement: %s", installerPath)
	cmd := exec.Command("powershell", "-Command",
		fmt.Sprintf("Start-Process -FilePath '%s' -Verb RunAs", installerPath))
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("erreur lancement installateur: %w", err)
	}

	log.Println("✅ [DOWNLOAD] Installateur lancé!")

	// Notifier terminé
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "completed",
		"message": "Installation en cours. Fermeture de l'application...",
	})

	// Fermer l'app après un délai
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
