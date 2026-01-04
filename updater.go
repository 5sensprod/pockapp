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
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	githubOwner    = "5sensprod" // Votre nom d'utilisateur GitHub
	githubRepo     = "pockapp"   // Nom de votre repo
	currentVersion = "1.0.9"     // Version actuelle (à synchroniser avec wails.json)
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
		// ✨ CORRIGÉ : Cherche directement l'installateur .exe (pas le ZIP)
		for _, asset := range release.Assets {
			// Cherche le fichier installer.exe
			if strings.Contains(asset.Name, "installer.exe") {
				info.DownloadURL = asset.BrowserDownloadURL
				log.Printf("Installateur trouvé : %s", asset.Name)
				break
			}
		}

		// Si pas d'installateur trouvé, logs pour debug
		if info.DownloadURL == "" {
			log.Println("⚠️ Aucun installateur trouvé. Assets disponibles :")
			for _, asset := range release.Assets {
				log.Printf("  - %s", asset.Name)
			}
		}
	}

	return info, nil
}

// downloadAndInstallUpdate télécharge et lance l'installateur NSIS
func downloadAndInstallUpdate(ctx context.Context, downloadURL string) error {
	log.Printf("Début de la mise à jour depuis : %s", downloadURL)

	// ✨ CORRIGÉ : Télécharge dans le dossier Téléchargements de l'utilisateur
	// pour que l'utilisateur puisse le retrouver en cas de problème
	userHomeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("impossible de trouver le dossier utilisateur: %w", err)
	}

	// Utilise le dossier Téléchargements (localisé selon la langue de Windows)
	downloadsDir := filepath.Join(userHomeDir, "Downloads")

	// Vérifier si le dossier existe, sinon essayer "Téléchargements" (français)
	if _, err := os.Stat(downloadsDir); os.IsNotExist(err) {
		downloadsDir = filepath.Join(userHomeDir, "Téléchargements")
	}

	installerPath := filepath.Join(downloadsDir, "PocketReact-Installer.exe")

	// Supprime l'ancien installateur s'il existe
	if _, err := os.Stat(installerPath); err == nil {
		os.Remove(installerPath)
	}

	// Télécharge l'installateur
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "downloading",
		"message": "Téléchargement de l'installateur...",
	})

	log.Printf("Téléchargement vers : %s", installerPath)
	if err := downloadFile(installerPath, downloadURL); err != nil {
		return fmt.Errorf("erreur téléchargement: %w", err)
	}

	log.Printf("✅ Téléchargement terminé : %s", installerPath)

	// Vérifie que le fichier est bien un .exe
	if !strings.HasSuffix(installerPath, ".exe") {
		return fmt.Errorf("le fichier téléchargé n'est pas un exécutable")
	}

	// ✨ Lance l'installateur et ferme l'application
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "ready",
		"message": "Lancement de l'installateur...",
	})

	// Lance l'installateur
	log.Printf("Lancement de l'installateur : %s", installerPath)

	// Option 1 : Mode normal (l'utilisateur voit l'installateur)
	cmd := exec.Command(installerPath)

	// Option 2 : Mode silencieux (décommentez si vous préférez)
	// cmd := exec.Command(installerPath, "/S")

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("erreur lancement installateur: %w", err)
	}

	log.Println("✅ Installateur lancé avec succès")

	// Informe l'utilisateur
	runtime.EventsEmit(ctx, "update:progress", map[string]interface{}{
		"status":  "completed",
		"message": "Installation en cours. L'application va se fermer.",
	})

	// ✨ IMPORTANT : Ferme l'application après 2 secondes
	go func() {
		time.Sleep(2 * time.Second)
		log.Println("Fermeture de l'application pour permettre l'installation...")
		runtime.Quit(ctx)
	}()

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

// downloadFile télécharge un fichier depuis une URL avec barre de progression
func downloadFile(filepath string, url string) error {
	// Crée le fichier de destination
	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	// Télécharge le fichier
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// Vérifie le statut HTTP
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("mauvais statut HTTP: %d", resp.StatusCode)
	}

	// Copie le contenu
	_, err = io.Copy(out, resp.Body)
	return err
}

// ============================================
// FONCTIONS NON UTILISÉES (gardées pour compatibilité)
// ============================================

// unzip extrait un fichier ZIP (non utilisé avec NSIS mais gardé au cas où)
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
