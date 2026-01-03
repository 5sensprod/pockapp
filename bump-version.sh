#!/bin/bash
# bump-version.sh
# Script pour mettre à jour automatiquement la version dans tous les fichiers

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
    echo "Usage: ./bump-version.sh 1.0.1"
    exit 1
fi

NEW_VERSION=$1

# Valider le format de la version
if ! [[ $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}❌ Format de version invalide. Utilisez le format X.Y.Z (ex: 1.0.1)${NC}"
    exit 1
fi

echo -e "${CYAN}🔄 Mise à jour de la version vers $NEW_VERSION...${NC}"

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
        echo -e "  ${GREEN}✅ $file mis à jour${NC}"
    else
        echo -e "  ${YELLOW}⚠️  $file introuvable${NC}"
    fi
}

# 1. updater.go
echo -e "\n${CYAN}📝 Mise à jour updater.go...${NC}"
update_file "updater.go" \
    'currentVersion[[:space:]]*=[[:space:]]*"[^"]*"' \
    "currentVersion = \"$NEW_VERSION\""

# 2. wails.json
echo -e "${CYAN}📝 Mise à jour wails.json...${NC}"
update_file "wails.json" \
    '"productVersion":[[:space:]]*"[^"]*"' \
    "\"productVersion\": \"$NEW_VERSION\""

# 3. package.json
echo -e "${CYAN}📝 Mise à jour package.json...${NC}"
update_file "package.json" \
    '"version":[[:space:]]*"[^"]*"' \
    "\"version\": \"$NEW_VERSION\""

# 4. app.go
echo -e "${CYAN}📝 Mise à jour app.go...${NC}"
update_file "app.go" \
    'return[[:space:]]*"[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"' \
    "return \"$NEW_VERSION\""

echo -e "\n${GREEN}✨ Version mise à jour vers $NEW_VERSION dans tous les fichiers !${NC}"

# Proposer de créer un commit
echo -e "\n${CYAN}💡 Voulez-vous créer un commit et un tag ? (o/N)${NC}"
read -r response

if [[ "$response" =~ ^[Oo]$ ]]; then
    echo -e "\n${CYAN}📦 Création du commit et du tag...${NC}"
    git add updater.go wails.json package.json app.go
    git commit -m "chore: bump version to $NEW_VERSION"
    git tag "v$NEW_VERSION"
    
    echo -e "${GREEN}✅ Commit créé et tag v$NEW_VERSION ajouté${NC}"
    echo -e "\n${CYAN}💡 Pour publier, exécutez :${NC}"
    echo -e "  git push origin main"
    echo -e "  git push origin v$NEW_VERSION"
else
    echo -e "\n${CYAN}💡 Pensez à commit et push manuellement :${NC}"
    echo -e "  git add updater.go wails.json package.json app.go"
    echo -e "  git commit -m 'chore: bump version to $NEW_VERSION'"
    echo -e "  git tag v$NEW_VERSION"
    echo -e "  git push origin main"
    echo -e "  git push origin v$NEW_VERSION"
fi
