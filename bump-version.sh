#!/bin/bash
# bump-version.sh - Version améliorée
# Synchronise la version dans TOUS les fichiers du projet

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Vérifier qu'une version est fournie
if [ -z "$1" ]; then
    echo -e "${RED}❌ Erreur: Veuillez fournir une version${NC}"
    echo "Usage: ./bump-version.sh 1.0.4"
    exit 1
fi

NEW_VERSION=$1

# Valider le format de la version
if ! [[ $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}❌ Format de version invalide. Utilisez le format X.Y.Z (ex: 1.0.4)${NC}"
    exit 1
fi

echo ""
echo -e "${CYAN}=======================================${NC}"
echo -e "${CYAN}  🔄 Mise à jour vers v$NEW_VERSION${NC}"
echo -e "${CYAN}=======================================${NC}"
echo ""

# Fonction pour mettre à jour un fichier
update_file() {
    local file=$1
    local pattern=$2
    local replacement=$3
    
    if [ -f "$file" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS (BSD sed)
            sed -i '' "s|$pattern|$replacement|g" "$file"
        else
            # Linux (GNU sed)
            sed -i "s|$pattern|$replacement|g" "$file"
        fi
        echo -e "  ${GREEN}✅ $file${NC}"
    else
        echo -e "  ${YELLOW}⚠️  $file introuvable${NC}"
    fi
}

# Liste des fichiers à mettre à jour
echo -e "${YELLOW}📝 Fichiers à mettre à jour :${NC}"
echo ""

# 1. updater.go - Version pour le système de mise à jour
echo -e "${CYAN}Backend (Go):${NC}"
update_file "updater.go" \
    'currentVersion[[:space:]]*=[[:space:]]*"[^"]*"' \
    "currentVersion = \"$NEW_VERSION\""

# 2. app.go - Version exposée au frontend
update_file "app.go" \
    'return[[:space:]]*"[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"' \
    "return \"$NEW_VERSION\""

echo ""
echo -e "${CYAN}Configuration:${NC}"

# 3. wails.json - Version produit
update_file "wails.json" \
    '"productVersion":[[:space:]]*"[^"]*"' \
    "\"productVersion\": \"$NEW_VERSION\""

# 4. package.json - Version NPM
update_file "package.json" \
    '"version":[[:space:]]*"[^"]*"' \
    "\"version\": \"$NEW_VERSION\""

echo ""
echo -e "${CYAN}Frontend:${NC}"

# 5. index.html - Titre de la fenêtre (optionnel mais cohérent)
if [ -f "index.html" ]; then
    update_file "index.html" \
        '<title>Pocket App - v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*</title>' \
        "<title>Pocket App - v$NEW_VERSION</title>"
elif [ -f "frontend/index.html" ]; then
    update_file "frontend/index.html" \
        '<title>Pocket App - v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*</title>' \
        "<title>Pocket App - v$NEW_VERSION</title>"
fi

echo ""
echo -e "${GREEN}✨ Version $NEW_VERSION synchronisée dans tous les fichiers !${NC}"
echo ""

# Afficher un récapitulatif
echo -e "${CYAN}📊 Récapitulatif :${NC}"
echo -e "  • updater.go      → Version système de mise à jour"
echo -e "  • app.go          → Version API Go"
echo -e "  • wails.json      → Version produit"
echo -e "  • package.json    → Version NPM"
echo -e "  • index.html      → Titre de l'application"
echo ""

# Proposer de créer un commit
echo -e "${CYAN}💡 Créer un commit et un tag Git ? (o/N)${NC}"
read -r response

if [[ "$response" =~ ^[Oo]$ ]]; then
    echo ""
    echo -e "${CYAN}📦 Création du commit et du tag...${NC}"
    
    # Ajouter tous les fichiers modifiés
    FILES_TO_ADD="updater.go app.go wails.json package.json"
    
    # Ajouter index.html s'il existe
    if [ -f "index.html" ]; then
        FILES_TO_ADD="$FILES_TO_ADD index.html"
    elif [ -f "frontend/index.html" ]; then
        FILES_TO_ADD="$FILES_TO_ADD frontend/index.html"
    fi
    
    git add $FILES_TO_ADD
    git commit -m "chore: bump version to $NEW_VERSION"
    git tag "v$NEW_VERSION"
    
    echo -e "${GREEN}✅ Commit créé et tag v$NEW_VERSION ajouté${NC}"
    echo ""
    echo -e "${CYAN}💡 Pour publier la release :${NC}"
    echo ""
    echo -e "${YELLOW}Option 1 - GitHub Actions (automatique) :${NC}"
    echo -e "  ${GREEN}git push origin main${NC}"
    echo -e "  ${GREEN}git push origin v$NEW_VERSION${NC}"
    echo -e "  → La GitHub Action créera automatiquement la release"
    echo ""
    echo -e "${YELLOW}Option 2 - Manuel :${NC}"
    echo -e "  1. Poussez le code : ${GREEN}git push origin main && git push origin v$NEW_VERSION${NC}"
    echo -e "  2. Compilez : ${GREEN}wails build -platform windows/amd64 -clean${NC}"
    echo -e "  3. Créez le ZIP et uploadez sur GitHub Releases"
    echo ""
    
    # Demander si on pousse maintenant
    echo -e "${CYAN}Pousser vers GitHub maintenant ? (o/N)${NC}"
    read -r push_response
    
    if [[ "$push_response" =~ ^[Oo]$ ]]; then
        echo ""
        echo -e "${CYAN}📤 Push vers GitHub...${NC}"
        git push origin main
        git push origin "v$NEW_VERSION"
        echo ""
        echo -e "${GREEN}✅ Poussé vers GitHub !${NC}"
        echo -e "${CYAN}🎉 La GitHub Action va créer la release automatiquement${NC}"
        echo -e "${CYAN}📍 https://github.com/5sensprod/pockapp/actions${NC}"
        echo ""
    fi
else
    echo ""
    echo -e "${CYAN}💡 Pensez à commit et push manuellement :${NC}"
    echo ""
    
    FILES_TO_ADD="updater.go app.go wails.json package.json"
    if [ -f "index.html" ] || [ -f "frontend/index.html" ]; then
        FILES_TO_ADD="$FILES_TO_ADD index.html"
    fi
    
    echo -e "  ${GREEN}git add $FILES_TO_ADD${NC}"
    echo -e "  ${GREEN}git commit -m 'chore: bump version to $NEW_VERSION'${NC}"
    echo -e "  ${GREEN}git tag v$NEW_VERSION${NC}"
    echo -e "  ${GREEN}git push origin main${NC}"
    echo -e "  ${GREEN}git push origin v$NEW_VERSION${NC}"
    echo ""
fi

echo -e "${CYAN}=======================================${NC}"
echo -e "${GREEN}  ✅ Processus terminé !${NC}"
echo -e "${CYAN}=======================================${NC}"
echo ""