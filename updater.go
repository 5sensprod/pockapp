package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	githubOwner    = "5sensprod" // Votre nom d'utilisateur GitHub
	githubRepo     = "pockapp"   // Nom de votre repo
	currentVersion = "1.0.5"     // Version actuelle (à synchroniser avec wails.json)
)

// UpdateInfo contient les informations sur une mise à jour disponible
type UpdateInfo struct {
	Available      bool   `json:"available"`
	Version        string `json:"version"`
	DownloadURL    string `json:"downloadUrl"`
	ReleaseNotes   string `json:"releaseNotes"`
	PublishedAt    string `json:"publishedAt"`
	CurrentVersion string `json:"currentVersion"`
}

// GitHubRelease représente une release GitHub
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

// checkForUpdates vérifie s'il y a une nouvelle version disponible sur GitHub
func checkForUpdates() (*UpdateInfo, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", githubOwner, githubRepo)

	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("erreur lors de la vérification des mises à jour: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("erreur API GitHub: status %d", resp.StatusCode)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, fmt.Errorf("erreur de décodage JSON: %w", err)
	}

	// Compare les versions
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
		// ✨ MODIFIÉ : Cherche l'installateur NSIS au lieu du ZIP
		assetName := getAssetNameForPlatform()
		for _, asset := range release.Assets {
			// Priorité 1 : Chercher l'installateur directement
			if strings.Contains(asset.Name, "installer.exe") && strings.Contains(asset.Name, assetName) {
				info.DownloadURL = asset.BrowserDownloadURL
				break
			}
			// Priorité 2 : Fallback sur le ZIP
			if strings.Contains(asset.Name, assetName) && strings.HasSuffix(asset.Name, ".zip") {
				info.DownloadURL = asset.BrowserDownloadURL
			}
		}
	}

	return info, nil
}

// downloadAndInstallUpdate télécharge et lance l'installateur
func downloadAndInstallUpdate(ctx context.Context, downloadURL string) error {
	// ✨ MODIFIÉ pour NSIS : Télécharge et lance l'installateur

	// Crée un dossier temporaire pour le téléchargement
	tempDir, err := os.MkdirTemp("", "pocket-react-update-")
	if err != nil {
		return fmt.Errorf("erreur création dossier temporaire: %w", err)
	}
	// ⚠️ Ne pas supprimer tempDir car l'installateur doit pouvoir y accéder

	// Télécharge le fichier
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Téléchargement en cours...",
	})

	var installerPath string

	// Détermine si c'est un installateur direct ou un ZIP
	if strings.HasSuffix(downloadURL, "-installer.exe") {
		// Télécharge directement l'installateur
		installerPath = filepath.Join(tempDir, "PocketReact-installer.exe")
		if err := downloadFile(installerPath, downloadURL); err != nil {
			return fmt.Errorf("erreur téléchargement: %w", err)
		}
		log.Println("Installateur téléchargé:", installerPath)
	} else if strings.HasSuffix(downloadURL, ".zip") {
		// Télécharge le ZIP et extrait l'installateur
		zipPath := filepath.Join(tempDir, "update.zip")
		if err := downloadFile(zipPath, downloadURL); err != nil {
			return fmt.Errorf("erreur téléchargement: %w", err)
		}
		log.Println("ZIP téléchargé:", zipPath)

		runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
			"status":  "extracting",
			"message": "Extraction en cours...",
		})

		// Extrait le ZIP
		extractDir := filepath.Join(tempDir, "extracted")
		if err := unzipInstaller(zipPath, extractDir); err != nil {
			return fmt.Errorf("erreur extraction: %w", err)
		}

		// Trouve l'installateur dans le ZIP
		installerPath, err = findInstaller(extractDir)
		if err != nil {
			return fmt.Errorf("installateur non trouvé: %w", err)
		}
		log.Println("Installateur extrait:", installerPath)
	} else {
		return fmt.Errorf("format de fichier non supporté: %s", downloadURL)
	}

	// ✨ NOUVEAU : Lance l'installateur et ferme l'app
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "launching",
		"message": "Lancement de l'installateur...",
	})

	// Lance l'installateur en mode silencieux ou normal
	if goruntime.GOOS == "windows" {
		// Option 1 : Lancement normal (l'utilisateur voit l'installateur)
		cmd := exec.Command(installerPath)

		// Option 2 : Lancement silencieux (décommentez si vous préférez)
		// cmd := exec.Command(installerPath, "/S") // /S = Silent mode pour NSIS

		if err := cmd.Start(); err != nil {
			return fmt.Errorf("erreur lancement installateur: %w", err)
		}

		log.Println("Installateur lancé avec succès")

		// ✨ IMPORTANT : Notifier que l'app va se fermer
		runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
			"status":  "completed",
			"message": "Installateur lancé. L'application va se fermer.",
		})

		// Attendre 2 secondes puis fermer l'app
		go func() {
			// time.Sleep(2 * time.Second)
			// runtime.Quit(ctx) // Décommentez pour fermer automatiquement
		}()
	}

	return nil
}

// compareVersions compare deux versions (format: X.Y.Z)
// Retourne: 1 si v1 > v2, -1 si v1 < v2, 0 si égales
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

// getAssetNameForPlatform retourne le nom de l'asset selon la plateforme
func getAssetNameForPlatform() string {
	switch goruntime.GOOS {
	case "windows":
		return "windows-amd64"
	case "darwin":
		return "darwin-universal"
	case "linux":
		return "linux-amd64"
	default:
		return ""
	}
}

// downloadFile télécharge un fichier depuis une URL
func downloadFile(filepath string, url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

// unzipInstaller extrait un fichier ZIP (version simplifiée pour l'installateur)
func unzipInstaller(src, dest string) error {
	// Utilise la bibliothèque archive/zip
	// (Code identique à l'ancien unzip mais simplifié)
	return unzip(src, dest)
}

// findInstaller trouve l'installateur NSIS dans un dossier
func findInstaller(dir string) (string, error) {
	var installerPath string

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			name := strings.ToLower(info.Name())
			// Cherche un fichier .exe qui ressemble à un installateur
			if strings.HasSuffix(name, ".exe") &&
				(strings.Contains(name, "installer") ||
					strings.Contains(name, "setup") ||
					strings.Contains(name, "pocketreact")) {
				installerPath = path
				return filepath.SkipDir // Arrête la recherche
			}
		}
		return nil
	})

	if err != nil {
		return "", err
	}

	if installerPath == "" {
		return "", fmt.Errorf("aucun installateur trouvé dans %s", dir)
	}

	return installerPath, nil
}

// ============================================
// FONCTIONS UTILITAIRES (gardées de l'ancien code)
// ============================================

// unzip extrait un fichier ZIP
func unzip(src, dest string) error {
	// Import nécessaire : "archive/zip"
	r, err := os.Open(src)
	if err != nil {
		return err
	}
	defer r.Close()

	stat, err := r.Stat()
	if err != nil {
		return err
	}

	zr, err := zip.NewReader(r, stat.Size())
	if err != nil {
		return err
	}

	os.MkdirAll(dest, 0755)

	for _, f := range zr.File {
		fpath := filepath.Join(dest, f.Name)

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, f.Mode())
			continue
		}

		if err = os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
			return err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}

		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()

		if err != nil {
			return err
		}
	}
	return nil
}
