# release-local-upload.ps1
# Version avec numéro de version dans le nom de l'asset

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,
    
    [Parameter(Mandatory=$true)]
    [string]$GithubToken
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Release locale + Upload GitHub" -ForegroundColor Cyan
Write-Host "  Version: $Version" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
$Owner = "5sensprod"
$Repo = "pockapp"
$TagName = "v$Version"

# ✅ Noms des fichiers avec version
$installerName = "PocketReact-$Version-windows-amd64-installer.exe"
$zipName = "PocketReact-$Version-windows-amd64.zip"

# Ajouter NSIS au PATH
$env:PATH += ";C:\Program Files (x86)\NSIS"

# Étape 1 : Bump version
Write-Host "[1/6] Mise a jour des versions..." -ForegroundColor Yellow
.\bump-version.ps1 $Version

# Étape 2 : Build avec NSIS
Write-Host ""
Write-Host "[2/6] Compilation NSIS (30-40 sec)..." -ForegroundColor Yellow
$startTime = Get-Date
wails build -platform windows/amd64 -nsis

if ($LASTEXITCODE -ne 0) {
    Write-Host "Erreur lors de la compilation" -ForegroundColor Red
    exit 1
}

$buildTime = ((Get-Date) - $startTime).TotalSeconds
Write-Host "OK Compilation terminee en $([math]::Round($buildTime, 1))s" -ForegroundColor Green

# Étape 3 : Vérifier les fichiers créés
Write-Host ""
Write-Host "[3/6] Verification des fichiers..." -ForegroundColor Yellow

# Lister tous les .exe pour debug
Write-Host "Fichiers dans build\bin:" -ForegroundColor Gray
Get-ChildItem -Path "build\bin" -Filter "*.exe" | ForEach-Object {
    $sizeMB = [math]::Round($_.Length / 1MB, 1)
    Write-Host "  - $($_.Name) ($sizeMB MB)" -ForegroundColor Gray
}

# Chercher le vrai installateur NSIS
$nsisInstaller = Get-ChildItem -Path "build\bin" -Filter "pocket-react-amd64-installer.exe" -ErrorAction SilentlyContinue

if (-not $nsisInstaller) {
    $nsisInstaller = Get-ChildItem -Path "build\bin" -Filter "*-installer.exe" | 
        Where-Object { $_.Name -notlike "PocketReact-*" } | 
        Select-Object -First 1
}

if (-not $nsisInstaller) {
    Write-Host "Erreur: Installateur NSIS non trouve!" -ForegroundColor Red
    Get-ChildItem "build\bin" -Filter "*.exe"
    exit 1
}

$installerSizeMB = [math]::Round($nsisInstaller.Length / 1MB, 1)
Write-Host "OK Installateur NSIS trouve: $($nsisInstaller.Name) - $installerSizeMB MB" -ForegroundColor Green

# Chemin final avec version
$installerPath = "build\bin\$installerName"
$zipPath = "build\bin\$zipName"

# Supprimer les anciens fichiers
if (Test-Path $installerPath) { Remove-Item $installerPath -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Copier le vrai installateur NSIS avec le nouveau nom
Write-Host "Copie vers: $installerName" -ForegroundColor Gray
Copy-Item $nsisInstaller.FullName $installerPath -Force
Write-Host "OK $installerName - $installerSizeMB MB" -ForegroundColor Green

# Créer le ZIP
Write-Host ""
Write-Host "[4/6] Creation du ZIP..." -ForegroundColor Yellow

Compress-Archive -Path $installerPath -DestinationPath $zipPath -Force
$zipSizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "OK $zipName - $zipSizeMB MB" -ForegroundColor Green

# Étape 4 : Git commit et tag
Write-Host ""
Write-Host "[5/6] Git commit et tag..." -ForegroundColor Yellow

git add updater.go wails.json package.json app.go
if (Test-Path "index.html") { git add index.html }

git commit -m "chore: bump version to $Version"
git tag -f $TagName

Write-Host "OK Tag $TagName cree" -ForegroundColor Green

git push origin main
git push -f origin $TagName
Write-Host "OK Pousse vers GitHub" -ForegroundColor Green

# Étape 5 : Upload sur GitHub
Write-Host ""
Write-Host "[6/6] Upload sur GitHub..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "token $GithubToken"
    "Accept" = "application/vnd.github.v3+json"
}

# Test du token
Write-Host "Test du token GitHub..." -ForegroundColor Gray
try {
    $user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers
    Write-Host "OK Token valide (user: $($user.login))" -ForegroundColor Green
}
catch {
    Write-Host "ERREUR: Token GitHub invalide !" -ForegroundColor Red
    exit 1
}

$releaseUrl = "https://api.github.com/repos/$Owner/$Repo/releases/tags/$TagName"

# Supprimer release existante si présente
try {
    $existingRelease = Invoke-RestMethod -Uri $releaseUrl -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "INFO Release existante trouvee, suppression..." -ForegroundColor Cyan
    Invoke-RestMethod -Uri $existingRelease.url -Headers $headers -Method Delete | Out-Null
    Write-Host "OK Ancienne release supprimee" -ForegroundColor Green
}
catch {
    Write-Host "INFO Nouvelle release" -ForegroundColor Cyan
}

# Créer la release
$releaseBody = @"
## Installation Windows

Telechargez : **$installerName**

### Installation
1. Double-cliquez sur le fichier
2. Suivez l'assistant d'installation
3. L'app sera installee dans Program Files

## Mise a jour automatique

L'application detectera automatiquement cette version.
"@

$releaseData = @{
    tag_name = $TagName
    name = "Release $TagName"
    body = $releaseBody
    draft = $false
    prerelease = $false
} | ConvertTo-Json

$createUrl = "https://api.github.com/repos/$Owner/$Repo/releases"
$release = Invoke-RestMethod -Uri $createUrl -Headers $headers -Method Post -Body $releaseData -ContentType "application/json"
Write-Host "OK Release creee (ID: $($release.id))" -ForegroundColor Green

# Fonction upload
function Upload-Asset {
    param($Path, $Release, $Headers)
    
    $name = Split-Path $Path -Leaf
    $size = [math]::Round((Get-Item $Path).Length / 1MB, 1)
    
    Write-Host "  Upload: $name ($size MB)..." -ForegroundColor Gray
    
    $uploadUrl = $Release.upload_url -replace '\{\?name,label\}', "?name=$name"
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    
    $uploadHeaders = $Headers.Clone()
    $uploadHeaders["Content-Type"] = "application/octet-stream"
    
    Invoke-RestMethod -Uri $uploadUrl -Headers $uploadHeaders -Method Post -Body $bytes | Out-Null
    Write-Host "    OK $name" -ForegroundColor Green
}

# Upload fichiers
Upload-Asset -Path $installerPath -Release $release -Headers $headers
Upload-Asset -Path $zipPath -Release $release -Headers $headers

# Récap
$totalTime = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Release $TagName publiee !" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Assets:" -ForegroundColor White
Write-Host "  - $installerName ($installerSizeMB MB)" -ForegroundColor Gray
Write-Host "  - $zipName ($zipSizeMB MB)" -ForegroundColor Gray
Write-Host ""
Write-Host "URL: https://github.com/$Owner/$Repo/releases/tag/$TagName" -ForegroundColor Cyan
Write-Host "Temps: $totalTime secondes" -ForegroundColor White
Write-Host ""

Start-Process "https://github.com/$Owner/$Repo/releases/tag/$TagName"

Write-Host "Termine !" -ForegroundColor Green