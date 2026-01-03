package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	githubOwner    = "5sensprod" // Votre nom d'utilisateur GitHub
	githubRepo     = "pockapp"   // Nom de votre repo
	currentVersion = "1.0.0"     // Version actuelle (à synchroniser avec wails.json)
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
		// Trouve l'asset approprié pour la plateforme
		assetName := getAssetNameForPlatform()
		for _, asset := range release.Assets {
			if strings.Contains(asset.Name, assetName) {
				info.DownloadURL = asset.BrowserDownloadURL
				break
			}
		}
	}

	return info, nil
}

// downloadAndInstallUpdate télécharge et installe la mise à jour
func downloadAndInstallUpdate(ctx context.Context, downloadURL string) error {
	// Crée un dossier temporaire pour le téléchargement
	tempDir, err := os.MkdirTemp("", "pocket-react-update-")
	if err != nil {
		return fmt.Errorf("erreur création dossier temporaire: %w", err)
	}
	defer os.RemoveAll(tempDir)

	// Télécharge le fichier
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Téléchargement en cours...",
	})

	zipPath := filepath.Join(tempDir, "update.zip")
	if err := downloadFile(zipPath, downloadURL); err != nil {
		return fmt.Errorf("erreur téléchargement: %w", err)
	}

	// Extrait le fichier
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "extracting",
		"message": "Extraction en cours...",
	})

	extractDir := filepath.Join(tempDir, "extracted")
	if err := unzip(zipPath, extractDir); err != nil {
		return fmt.Errorf("erreur extraction: %w", err)
	}

	// Installe la mise à jour
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "installing",
		"message": "Installation en cours...",
	})

	if err := installUpdate(extractDir); err != nil {
		return fmt.Errorf("erreur installation: %w", err)
	}

	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "completed",
		"message": "Mise à jour terminée. Redémarrage nécessaire.",
	})

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

// unzip extrait un fichier ZIP
func unzip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	os.MkdirAll(dest, 0755)

	for _, f := range r.File {
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

// installUpdate installe la mise à jour
func installUpdate(extractDir string) error {
	// Trouve le nouvel exécutable
	var newExePath string
	filepath.Walk(extractDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.Contains(info.Name(), "PocketReact") {
			if goruntime.GOOS == "windows" && strings.HasSuffix(info.Name(), ".exe") {
				newExePath = path
			} else if goruntime.GOOS != "windows" {
				newExePath = path
			}
		}
		return nil
	})

	if newExePath == "" {
		return fmt.Errorf("exécutable non trouvé dans l'archive")
	}

	// Chemin de l'exécutable actuel
	currentExe, err := os.Executable()
	if err != nil {
		return err
	}

	// Sur Windows, renomme l'ancien exe et copie le nouveau
	if goruntime.GOOS == "windows" {
		oldExe := currentExe + ".old"

		// Supprime l'ancien backup s'il existe
		os.Remove(oldExe)

		// Renomme l'exe actuel
		if err := os.Rename(currentExe, oldExe); err != nil {
			return fmt.Errorf("erreur renommage: %w", err)
		}

		// Copie le nouvel exe
		if err := copyFile(newExePath, currentExe); err != nil {
			// Restaure l'ancien en cas d'erreur
			os.Rename(oldExe, currentExe)
			return fmt.Errorf("erreur copie: %w", err)
		}

		// Crée un script batch pour supprimer l'ancien exe au prochain démarrage
		batchScript := fmt.Sprintf(`@echo off
timeout /t 2 /nobreak > nul
del "%s"
del "%%~f0"
`, oldExe)

		batchPath := filepath.Join(filepath.Dir(currentExe), "cleanup.bat")
		os.WriteFile(batchPath, []byte(batchScript), 0755)
	} else {
		// Sur Unix, remplace directement
		if err := copyFile(newExePath, currentExe); err != nil {
			return fmt.Errorf("erreur copie: %w", err)
		}
		os.Chmod(currentExe, 0755)
	}

	return nil
}

// copyFile copie un fichier
func copyFile(src, dst string) error {
	source, err := os.Open(src)
	if err != nil {
		return err
	}
	defer source.Close()

	destination, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destination.Close()

	_, err = io.Copy(destination, source)
	return err
}
