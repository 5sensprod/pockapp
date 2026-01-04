# bump-version.ps1
# Version simplifiée et corrigée

param(
    [Parameter(Mandatory=$true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"

# Validation du format
if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host ""
    Write-Host "Erreur: Format invalide" -ForegroundColor Red
    Write-Host "Usage: .\bump-version.ps1 1.0.4" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Mise a jour vers v$Version" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Fonction pour mettre à jour un fichier
function Update-VersionFile {
    param(
        [string]$FilePath,
        [string]$Pattern,
        [string]$Replacement
    )
    
    if (Test-Path $FilePath) {
        try {
            $content = Get-Content $FilePath -Raw
            $newContent = $content -replace $Pattern, $Replacement
            Set-Content $FilePath -Value $newContent -NoNewline
            Write-Host "  OK $FilePath" -ForegroundColor Green
            return $true
        }
        catch {
            Write-Host "  ERREUR $FilePath : $_" -ForegroundColor Red
            return $false
        }
    }
    else {
        Write-Host "  SKIP $FilePath (non trouve)" -ForegroundColor Yellow
        return $false
    }
}

Write-Host "Mise a jour des fichiers..." -ForegroundColor Yellow
Write-Host ""

# 1. updater.go
Update-VersionFile -FilePath "updater.go" `
    -Pattern 'currentVersion\s*=\s*"[^"]*"' `
    -Replacement "currentVersion = `"$Version`""

# 2. app.go
Update-VersionFile -FilePath "app.go" `
    -Pattern 'return\s*"[\d]+\.[\d]+\.[\d]+"' `
    -Replacement "return `"$Version`""

# 3. wails.json
Update-VersionFile -FilePath "wails.json" `
    -Pattern '"productVersion"\s*:\s*"[^"]*"' `
    -Replacement "`"productVersion`": `"$Version`""

# 4. package.json
Update-VersionFile -FilePath "package.json" `
    -Pattern '"version"\s*:\s*"[^"]*"' `
    -Replacement "`"version`": `"$Version`""

# 5. index.html (optionnel)
if (Test-Path "index.html") {
    Update-VersionFile -FilePath "index.html" `
        -Pattern '<title>Pocket App - v[\d]+\.[\d]+\.[\d]+</title>' `
        -Replacement "<title>Pocket App - v$Version</title>"
}
elseif (Test-Path "frontend\index.html") {
    Update-VersionFile -FilePath "frontend\index.html" `
        -Pattern '<title>Pocket App - v[\d]+\.[\d]+\.[\d]+</title>' `
        -Replacement "<title>Pocket App - v$Version</title>"
}

Write-Host ""
Write-Host "OK Version $Version synchronisee !" -ForegroundColor Green
Write-Host ""