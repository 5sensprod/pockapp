# bump-version.ps1
# Script pour mettre à jour automatiquement la version dans tous les fichiers

param(
    [Parameter(Mandatory=$true)]
    [string]$NewVersion
)

Write-Host "🔄 Mise à jour de la version vers $NewVersion..." -ForegroundColor Cyan

# Valider le format de la version (X.Y.Z)
if ($NewVersion -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "❌ Format de version invalide. Utilisez le format X.Y.Z (ex: 1.0.1)" -ForegroundColor Red
    exit 1
}

# Fonction pour mettre à jour un fichier
function Update-Version {
    param(
        [string]$FilePath,
        [string]$Pattern,
        [string]$Replacement
    )
    
    if (Test-Path $FilePath) {
        $content = Get-Content $FilePath -Raw
        $newContent = $content -replace $Pattern, $Replacement
        Set-Content $FilePath $newContent -NoNewline
        Write-Host "  ✅ $FilePath mis à jour" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  $FilePath introuvable" -ForegroundColor Yellow
    }
}

# 1. updater.go
Write-Host "`n📝 Mise à jour updater.go..."
Update-Version `
    -FilePath "updater.go" `
    -Pattern 'currentVersion\s*=\s*"[^"]*"' `
    -Replacement "currentVersion = `"$NewVersion`""

# 2. wails.json
Write-Host "📝 Mise à jour wails.json..."
Update-Version `
    -FilePath "wails.json" `
    -Pattern '"productVersion":\s*"[^"]*"' `
    -Replacement "`"productVersion`": `"$NewVersion`""

# 3. package.json
Write-Host "📝 Mise à jour package.json..."
Update-Version `
    -FilePath "package.json" `
    -Pattern '"version":\s*"[^"]*"' `
    -Replacement "`"version`": `"$NewVersion`""

# 4. app.go
Write-Host "📝 Mise à jour app.go..."
Update-Version `
    -FilePath "app.go" `
    -Pattern 'return\s*"[0-9]+\.[0-9]+\.[0-9]+"' `
    -Replacement "return `"$NewVersion`""

Write-Host "`n✨ Version mise à jour vers $NewVersion dans tous les fichiers !" -ForegroundColor Green

# Proposer de créer un commit
Write-Host "`n💡 Voulez-vous créer un commit et un tag ? (O/N)" -ForegroundColor Cyan
$response = Read-Host

if ($response -eq "O" -or $response -eq "o") {
    Write-Host "`n📦 Création du commit et du tag..."
    git add updater.go wails.json package.json app.go
    git commit -m "chore: bump version to $NewVersion"
    git tag "v$NewVersion"
    
    Write-Host "✅ Commit créé et tag v$NewVersion ajouté" -ForegroundColor Green
    Write-Host "`n💡 Pour publier, exécutez :" -ForegroundColor Cyan
    Write-Host "  git push origin main" -ForegroundColor White
    Write-Host "  git push origin v$NewVersion" -ForegroundColor White
} else {
    Write-Host "`n💡 Pensez à commit et push manuellement :" -ForegroundColor Cyan
    Write-Host "  git add updater.go wails.json package.json app.go" -ForegroundColor White
    Write-Host "  git commit -m 'chore: bump version to $NewVersion'" -ForegroundColor White
    Write-Host "  git tag v$NewVersion" -ForegroundColor White
    Write-Host "  git push origin main" -ForegroundColor White
    Write-Host "  git push origin v$NewVersion" -ForegroundColor White
}
