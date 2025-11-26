package main

import (
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// APIProxy redirige les requêtes /api/* vers PocketBase
type APIProxy struct {
	target *url.URL
	proxy  *httputil.ReverseProxy
}

// NewAPIProxy crée un nouveau proxy vers PocketBase
func NewAPIProxy(targetURL string) *APIProxy {
	target, _ := url.Parse(targetURL)
	return &APIProxy{
		target: target,
		proxy:  httputil.NewSingleHostReverseProxy(target),
	}
}

// ServeHTTP implémente http.Handler
func (p *APIProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Route toutes les requêtes /api/* et /_/* vers PocketBase
	if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/_/") {
		p.proxy.ServeHTTP(w, r)
		return
	}

	// Les autres requêtes (assets) sont gérées par Wails AssetServer
	// Retourne 404 pour que Wails serve les fichiers statiques
	http.NotFound(w, r)
}

// Alternative: Handler plus flexible avec support WebSocket
type FullProxy struct {
	pbURL string
}

func NewFullProxy(pbURL string) *FullProxy {
	return &FullProxy{pbURL: pbURL}
}

func (p *FullProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Ne proxy que les chemins API
	if !strings.HasPrefix(r.URL.Path, "/api/") && !strings.HasPrefix(r.URL.Path, "/_/") {
		http.NotFound(w, r)
		return
	}

	// Construit l'URL cible
	targetURL := p.pbURL + r.URL.Path
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	// Crée la requête proxy
	proxyReq, err := http.NewRequest(r.Method, targetURL, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Copie les headers
	for key, values := range r.Header {
		for _, value := range values {
			proxyReq.Header.Add(key, value)
		}
	}

	// Exécute la requête
	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	// Copie les headers de réponse
	for key, values := range resp.Header {
		for _, value := range values {
			w.Header().Add(key, value)
		}
	}

	// Écrit le status et le body
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}