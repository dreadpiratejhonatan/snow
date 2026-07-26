# Prepara e abre o pacote HostGator (gh62). O upload no cPanel é manual.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== Build ==" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build falhou" }

$zip = Join-Path $root "release\snow.zip"
$hostDir = Join-Path $root "release\hostgator-snow"
if (-not (Test-Path $zip)) { throw "Falta release\snow.zip" }

$html = Get-Content (Join-Path $hostDir "index.html") -Raw
if ($html -notmatch '\?v=gh62') {
  Write-Warning "index.html do pacote nao tem ?v=gh62 — confira scripts/build.mjs CACHE"
}

$must = @(
  "index.html",
  "src\js\bundle.js",
  "api\signal.php",
  "api\leaderboard.php",
  "api\tickets.php",
  "music\manifest.json",
  "LEIA-ME.txt"
)
foreach ($rel in $must) {
  $p = Join-Path $hostDir $rel
  if (-not (Test-Path $p)) { throw "Pacote incompleto: falta $rel" }
  Write-Host "OK $rel"
}

$backupDir = Join-Path $root "release\deploy-backup"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$instr = Join-Path $backupDir "LEIA-ME-BACKUP.txt"
if (-not (Test-Path $instr)) {
  Set-Content -Path $instr -Encoding UTF8 -Value @"
Baixe no cPanel (public_html/snow/data/) leaderboard.json e tickets.json para esta pasta antes do upload.
"@
}

Write-Host ""
Write-Host "== Proximo: cPanel ==" -ForegroundColor Yellow
Write-Host "1. Backup data/leaderboard.json + tickets.json"
Write-Host "2. Apague index.html, src/, api/, music/, faces/, tickets/, splash/sc*"
Write-Host "3. NAO apague data/"
Write-Host "4. Upload + Extract: $zip"
Write-Host "5. Permissoes data/ e data/rooms/ = 755 ou 775"
Write-Host "6. Site + Ctrl+F5 (gh62)"
Write-Host ""
Write-Host "Abrindo pasta do zip..."
Invoke-Item (Join-Path $root "release")
Write-Host "Abrindo LEIA-ME do pacote..."
Invoke-Item (Join-Path $hostDir "LEIA-ME.txt")
Write-Host "DONE — pacote pronto em release\snow.zip ($([math]::Round((Get-Item $zip).Length/1MB, 2)) MB)"
