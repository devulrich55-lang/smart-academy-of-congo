# Copie / synchronise Evo-smartUni hors OneDrive vers C:\Dev
# Usage :
#   powershell -ExecutionPolicy Bypass -File ".\scripts\move-off-onedrive.ps1"
#   powershell -ExecutionPolicy Bypass -File ".\scripts\move-off-onedrive.ps1" -Force

param([switch]$Force)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Source = "C:\Users\1\OneDrive\Desktop\Evo-smartUni"
$Target = "C:\Dev\Smart-Academy-of-Congo"

function Test-CopyComplete {
    param([string]$Path)
    return (
        (Test-Path (Join-Path $Path "js\sac-api.js")) -and
        (Test-Path (Join-Path $Path "css\platform.css")) -and
        (Test-Path (Join-Path $Path "backend-python\app\main.py"))
    )
}

if (-not (Test-Path $Source)) {
    Write-Error "Source introuvable : $Source"
}

New-Item -ItemType Directory -Force -Path "C:\Dev" | Out-Null

if ((Test-Path $Target) -and (Test-CopyComplete $Target) -and -not $Force) {
    Write-Host "Copie deja complete : $Target"
    Write-Host "Ouvrez ce dossier dans Cursor. Supprimez OneDrive seulement apres verification."
    exit 0
}

if (Test-Path $Target) {
    Write-Host "Reprise / synchronisation vers : $Target"
} else {
    Write-Host "Copie initiale vers : $Target"
}

Write-Host "Source : $Source"
Write-Host "Patientez (OneDrive peut etre lent, 3-10 min)..."

# /Z = reprise si interrompu ; /MT:8 = plus rapide
robocopy $Source $Target /E /COPY:DAT /DCOPY:DAT /Z /MT:8 /R:3 /W:5 `
    /XD node_modules .venv __pycache__ .pytest_cache .mypy_cache `
    /NFL /NDL /NP

if ($LASTEXITCODE -ge 8) {
    Write-Error "Robocopy a echoue (code $LASTEXITCODE). Relancez le script pour reprendre."
}

if (-not (Test-CopyComplete $Target)) {
    Write-Warning "Copie encore incomplete. Relancez le meme script pour continuer."
    Write-Host "Manquant :"
    if (-not (Test-Path (Join-Path $Target "js\sac-api.js"))) { Write-Host "  - js\" }
    if (-not (Test-Path (Join-Path $Target "css\platform.css"))) { Write-Host "  - css\" }
    if (-not (Test-Path (Join-Path $Target "backend-python\app\main.py"))) { Write-Host "  - backend-python\" }
    exit 1
}

Write-Host "`n--- Verification ---"
Write-Host "js/sac-api.js        : OK"
Write-Host "css/platform.css     : OK"
Write-Host "backend-python       : OK"

if (Test-Path (Join-Path $Target ".git")) {
    Write-Host "`n--- Frontend git ---"
    git -C $Target status -sb
    git -C $Target remote -v
}

$apiPath = Join-Path $Target "backend-python"
if (Test-Path (Join-Path $apiPath ".git")) {
    Write-Host "`n--- API git ---"
    git -C $apiPath status -sb
    git -C $apiPath remote -v
}

Write-Host @"

========================================
Copie terminee : $Target

1. Cursor > Ouvrir le dossier > $Target
2. Tester git status
3. Supprimer OneDrive seulement si tout fonctionne :
   $Source
========================================
"@
