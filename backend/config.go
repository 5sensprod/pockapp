package backend

import (
	"log"
	"os"
	"path/filepath"
)

type Config struct {
	ViteDevServerURL string
	Environment      string
	Port             string
	DataDir          string
}

func LoadConfig() Config {
	// Get the absolute path of the current working directory
	absCurrentDir, err := filepath.Abs(".")
	if err != nil {
		log.Fatal(err)
	}

	config := Config{
		ViteDevServerURL: "",
		Environment:      "development",
		Port:             "8090",
		DataDir:          filepath.Join(absCurrentDir, "pb_data"), // Use absolute path
	}

	if env := os.Getenv("GO_ENV"); env != "" {
		config.Environment = env
	}

	if url := os.Getenv("VITE_DEV_URL"); url != "" {
		config.ViteDevServerURL = url
	}

	if port := os.Getenv("PORT"); port != "" {
		config.Port = port
	}

	if dataDir := os.Getenv("PB_DATA_DIR"); dataDir != "" {
		// Convert any provided data directory to absolute path
		absDataDir, err := filepath.Abs(dataDir)
		if err != nil {
			log.Fatal(err)
		}
		config.DataDir = absDataDir
	}

	return config
}
