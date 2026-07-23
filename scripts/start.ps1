$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Url = "http://127.0.0.1:5173"
$Port = 5173

Set-Location $Root

Write-Host "Web Craft - modo offline localhost" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js nao encontrado. Instale em https://nodejs.org" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules\three\build\three.module.js")) {
  Write-Host "Instalando dependencias (npm install)..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1

if ($existing) {
  Write-Host "Servidor ja ativo na porta $Port." -ForegroundColor Green
} else {
  Write-Host "Iniciando servidor em $Url ..." -ForegroundColor Yellow
  # chama o node direto: Start-Process com "npm" falha silenciosamente no Windows
  Start-Process -FilePath "node" `
    -ArgumentList "node_modules\serve\build\main.js", "-l", "tcp://127.0.0.1:$Port" `
    -WorkingDirectory $Root -WindowStyle Minimized
  Start-Sleep -Seconds 2
  $ok = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $ok) {
    Write-Host "Falha ao iniciar o servidor na porta $Port." -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "  Jogo:  $Url" -ForegroundColor Green
Write-Host "  Parar: feche a janela do servidor ou encerre o processo na porta $Port" -ForegroundColor DarkGray
Write-Host ""

Start-Process $Url
