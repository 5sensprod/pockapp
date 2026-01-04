// updater.go — Version corrigée avec gestion HTTP robuste

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
	currentVersion = "1.1.3" // ⚠️ CHANGEZ selon votre version actuelle
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

// httpClient avec timeout configuré
var httpClient = &http.Client{
	Timeout: 5 * time.Minute, // Timeout long pour les gros fichiers
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		// Suivre jusqu'à 10 redirections (GitHub en utilise plusieurs)
		if len(via) >= 10 {
			return fmt.Errorf("trop de redirections")
		}
		// ✅ Conserver le User-Agent lors des redirections
		req.Header.Set("User-Agent", "PocketReact-Updater/1.0")
		return nil
	},
}

func checkForUpdates() (*UpdateInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", githubOwner, githubRepo)

	log.Printf("🔍 Vérification des mises à jour: %s", url)

	// ✅ Créer une requête avec headers appropriés
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("erreur création requête: %w", err)
	}

	// ✅ Headers requis par GitHub API
	req.Header.Set("User-Agent", "PocketReact-Updater/1.0")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("❌ Erreur HTTP: %v", err)
		return nil, fmt.Errorf("erreur lors de la vérification des mises à jour: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("❌ Statut HTTP: %d - Body: %s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("erreur API GitHub: status %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		log.Printf("❌ Erreur décodage JSON: %v", err)
		return nil, fmt.Errorf("erreur de décodage JSON: %w", err)
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")
	updateAvailable := compareVersions(latestVersion, currentVersion) > 0

	log.Printf("📦 Version actuelle: %s, Dernière version: %s, MAJ disponible: %v",
		currentVersion, latestVersion, updateAvailable)

	info := &UpdateInfo{
		Available:      updateAvailable,
		Version:        latestVersion,
		ReleaseNotes:   release.Body,
		PublishedAt:    release.PublishedAt,
		CurrentVersion: currentVersion,
	}

	// ✅ Chercher l'installateur dans les assets
	log.Printf("🔎 Recherche de l'installateur parmi %d assets...", len(release.Assets))

	for _, asset := range release.Assets {
		log.Printf("   Asset: %s (%.2f MB)", asset.Name, float64(asset.Size)/1024/1024)

		nameLower := strings.ToLower(asset.Name)
		if strings.HasSuffix(nameLower, ".exe") && strings.Contains(nameLower, "installer") {
			info.DownloadURL = asset.BrowserDownloadURL
			info.AssetName = asset.Name
			log.Printf("✅ Installateur sélectionné: %s", asset.Name)
			log.Printf("   URL: %s", asset.BrowserDownloadURL)
			break
		}
	}

	if info.DownloadURL == "" && updateAvailable {
		log.Printf("⚠️ Aucun installateur trouvé dans les assets!")
	}

	return info, nil
}

func downloadAndInstallUpdate(ctx context.Context, downloadURL string) error {
	log.Printf("🚀 Début de la mise à jour")
	log.Printf("📥 URL de téléchargement: %s", downloadURL)

	// ✅ Extraire le nom du fichier depuis l'URL
	assetName := extractAssetName(downloadURL)
	if assetName == "" {
		assetName = "PocketReact-windows-amd64-installer.exe"
	}
	log.Printf("📄 Nom du fichier: %s", assetName)

	// Trouver le dossier de téléchargement
	userHomeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("impossible de trouver le dossier utilisateur: %w", err)
	}

	downloadsDir := filepath.Join(userHomeDir, "Downloads")
	if _, err := os.Stat(downloadsDir); os.IsNotExist(err) {
		downloadsDir = filepath.Join(userHomeDir, "Téléchargements")
		if _, err := os.Stat(downloadsDir); os.IsNotExist(err) {
			// Fallback sur le dossier utilisateur
			downloadsDir = userHomeDir
		}
	}
	log.Printf("📁 Dossier de téléchargement: %s", downloadsDir)

	installerPath := filepath.Join(downloadsDir, assetName)

	// Supprimer l'ancien fichier si présent
	if _, err := os.Stat(installerPath); err == nil {
		log.Printf("🗑️ Suppression de l'ancien fichier...")
		_ = os.Remove(installerPath)
	}

	// ✅ Notifier le frontend
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Téléchargement de l'installateur...",
	})

	// ✅ Télécharger avec gestion robuste
	if err := downloadFileWithProgress(ctx, installerPath, downloadURL); err != nil {
		log.Printf("❌ Erreur téléchargement: %v", err)
		return fmt.Errorf("erreur téléchargement: %w", err)
	}

	// Vérifier le fichier téléchargé
	fileInfo, err := os.Stat(installerPath)
	if err != nil {
		return fmt.Errorf("fichier non trouvé après téléchargement: %w", err)
	}

	fileSizeMB := float64(fileInfo.Size()) / 1024 / 1024
	log.Printf("✅ Fichier téléchargé: %.2f MB", fileSizeMB)

	if fileSizeMB < 10 {
		// Lire le contenu pour debug si c'est trop petit (probablement une erreur HTML)
		content, _ := os.ReadFile(installerPath)
		if len(content) < 1000 {
			log.Printf("⚠️ Contenu du fichier (trop petit): %s", string(content))
		}
		return fmt.Errorf("fichier téléchargé trop petit (%.1f MB) - téléchargement échoué", fileSizeMB)
	}

	// ✅ Notifier prêt à installer
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "ready",
		"message": fmt.Sprintf("Téléchargement terminé (%.1f MB). Lancement de l'installateur...", fileSizeMB),
	})

	// Lancer l'installateur
	log.Printf("🚀 Lancement de l'installateur: %s", installerPath)
	cmd := exec.Command(installerPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("erreur lancement installateur: %w", err)
	}

	// ✅ Notifier installation lancée
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "completed",
		"message": "Installation en cours. L'application va se fermer.",
	})

	// Fermer l'application après un délai
	go func() {
		time.Sleep(2 * time.Second)
		runtime.Quit(ctx)
	}()

	return nil
}

// ✅ Fonction de téléchargement robuste avec headers appropriés
func downloadFileWithProgress(ctx context.Context, dstPath string, url string) error {
	log.Printf("📥 Début du téléchargement vers: %s", dstPath)

	// Créer la requête avec headers
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("erreur création requête: %w", err)
	}

	// ✅ Headers essentiels pour GitHub
	req.Header.Set("User-Agent", "PocketReact-Updater/1.0")
	req.Header.Set("Accept", "application/octet-stream")

	// Exécuter la requête
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("erreur HTTP: %w", err)
	}
	defer resp.Body.Close()

	log.Printf("📡 Statut HTTP: %d", resp.StatusCode)
	log.Printf("📡 Content-Type: %s", resp.Header.Get("Content-Type"))
	log.Printf("📡 Content-Length: %s", resp.Header.Get("Content-Length"))

	// ✅ Vérifier le statut HTTP
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("mauvais statut HTTP: %d - %s", resp.StatusCode, string(body))
	}

	// ✅ Vérifier que ce n'est pas une page HTML (erreur GitHub)
	contentType := resp.Header.Get("Content-Type")
	if strings.Contains(contentType, "text/html") {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("⚠️ Réponse HTML reçue au lieu du binaire: %s", string(body)[:min(500, len(body))])
		return fmt.Errorf("réponse HTML reçue au lieu du fichier binaire")
	}

	// Créer le fichier de destination
	out, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("impossible de créer le fichier: %w", err)
	}
	defer out.Close()

	// Copier les données
	written, err := io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("erreur lors de l'écriture: %w", err)
	}

	log.Printf("✅ Téléchargement terminé: %d bytes écrits", written)
	return nil
}

// ✅ Extraire le nom de l'asset depuis l'URL
func extractAssetName(url string) string {
	parts := strings.Split(url, "/")
	if len(parts) > 0 {
		name := parts[len(parts)-1]
		// Retirer les paramètres de query si présents
		if idx := strings.Index(name, "?"); idx != -1 {
			name = name[:idx]
		}
		if strings.HasSuffix(strings.ToLower(name), ".exe") {
			return name
		}
	}
	return ""
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

// Helper function pour min (Go < 1.21)
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
