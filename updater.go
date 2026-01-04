// updater.go — patch minimal pour utiliser le nom réel de l’asset GitHub

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
	currentVersion = "1.1.2" // ⚠️ CHANGEZ selon votre version actuelle
)

type UpdateInfo struct {
	Available      bool   `json:"available"`
	Version        string `json:"version"`
	DownloadURL    string `json:"downloadUrl"`
	AssetName      string `json:"assetName"` // ✅ AJOUT
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
	} `json:"assets"`
}

func checkForUpdates() (*UpdateInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", githubOwner, githubRepo)

	log.Printf("🔍 Vérification des mises à jour: %s", url)

	resp, err := http.Get(url)
	if err != nil {
		log.Printf("❌ Erreur HTTP: %v", err)
		return nil, fmt.Errorf("erreur lors de la vérification des mises à jour: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("❌ Statut HTTP: %d", resp.StatusCode)
		return nil, fmt.Errorf("erreur API GitHub: status %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		log.Printf("❌ Erreur décodage JSON: %v", err)
		return nil, fmt.Errorf("erreur de décodage JSON: %w", err)
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")
	updateAvailable := compareVersions(latestVersion, currentVersion) > 0

	info := &UpdateInfo{
		Available:      updateAvailable,
		Version:        latestVersion,
		ReleaseNotes:   release.Body,
		PublishedAt:    release.PublishedAt,
		CurrentVersion: currentVersion,
	}

	if updateAvailable {
		for _, asset := range release.Assets {
			// ✅ on capture le vrai nom de l'asset
			if strings.HasSuffix(strings.ToLower(asset.Name), ".exe") &&
				strings.Contains(strings.ToLower(asset.Name), "installer") {

				info.DownloadURL = asset.BrowserDownloadURL
				info.AssetName = asset.Name // ✅ IMPORTANT
				log.Printf("✅ Installateur sélectionné: %s", asset.Name)
				break
			}
		}
	}

	return info, nil
}

func downloadAndInstallUpdate(ctx context.Context, downloadURL string) error {
	log.Printf("🚀 Début de la mise à jour")
	log.Printf("📍 URL de téléchargement: %s", downloadURL)

	// ✅ récupérer l'UpdateInfo pour obtenir AssetName
	// (si tu as déjà l'info côté App et que tu l’envoies au frontend,
	// passe plutôt assetName en paramètre de DownloadAndInstallUpdate)
	info, err := checkForUpdates()
	if err != nil {
		return err
	}
	if info.AssetName == "" {
		return fmt.Errorf("assetName manquant (installateur non trouvé)")
	}

	userHomeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("impossible de trouver le dossier utilisateur: %w", err)
	}

	downloadsDir := filepath.Join(userHomeDir, "Downloads")
	if _, err := os.Stat(downloadsDir); os.IsNotExist(err) {
		downloadsDir = filepath.Join(userHomeDir, "Téléchargements")
	}

	// ✅ utiliser le vrai nom de l’asset GitHub
	installerPath := filepath.Join(downloadsDir, info.AssetName)

	if _, err := os.Stat(installerPath); err == nil {
		_ = os.Remove(installerPath)
	}

	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Téléchargement de l'installateur...",
	})

	if err := downloadFile(installerPath, downloadURL); err != nil {
		return fmt.Errorf("erreur téléchargement: %w", err)
	}

	fileInfo, err := os.Stat(installerPath)
	if err != nil {
		return fmt.Errorf("fichier non trouvé après téléchargement: %w", err)
	}

	fileSizeMB := float64(fileInfo.Size()) / 1024 / 1024
	if fileSizeMB < 10 {
		return fmt.Errorf("fichier téléchargé trop petit (%.1f MB)", fileSizeMB)
	}

	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "ready",
		"message": "Lancement de l'installateur...",
	})

	cmd := exec.Command(installerPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("erreur lancement installateur: %w", err)
	}

	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "completed",
		"message": "Installation en cours. L'application va se fermer.",
	})

	go func() {
		time.Sleep(2 * time.Second)
		runtime.Quit(ctx)
	}()

	return nil
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

func downloadFile(dstPath string, url string) error {
	out, err := os.Create(dstPath)
	if err != nil {
		return err
	}
	defer out.Close()

	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("mauvais statut HTTP: %d", resp.StatusCode)
	}

	_, err = io.Copy(out, resp.Body)
	return err
}
