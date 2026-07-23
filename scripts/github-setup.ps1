# Prepara git local e instrui push para GitHub Pages.
# Uso: powershell -ExecutionPolicy Bypass -File scripts/github-setup.ps1
# Opcional: -Repo "usuario/neve-selvagem"

param(
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"
# script vive em web-cs/scripts → root do projeto é web-cs
Set-Location (Split-Path $PSScriptRoot -Parent)

function Find-Git {
  $candidates = @(
    "git",
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe",
    "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
  )
  foreach ($c in $candidates) {
    try {
      if ($c -eq "git") {
        $cmd = Get-Command git -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
      } elseif (Test-Path $c) {
        return $c
      }
    } catch {}
  }
  return $null
}

$git = Find-Git
if (-not $git) {
  Write-Host "Git nao encontrado. Tentando instalar com winget..."
  try {
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  } catch {
    Write-Host "Instale o Git manualmente: https://git-scm.com/download/win"
    Write-Host "Depois rode este script de novo, ou siga GITHUB-PAGES.md"
    exit 1
  }
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $git = Find-Git
  if (-not $git) {
    Write-Host "Git instalado — feche e reabra o terminal, depois rode o script de novo."
    exit 1
  }
}

Write-Host "Usando git: $git"

if (-not (Test-Path .git)) {
  & $git init
  & $git branch -M main
}

$status = & $git status --porcelain
if ($status) {
  & $git add .
  & $git status
  & $git commit -m "Neve Selvagem: jogo + deploy GitHub Pages"
} else {
  Write-Host "Nada novo para commit."
}

Write-Host ""
Write-Host "=== Proximos passos ==="
Write-Host "1. Crie o repo em https://github.com/new (ex.: neve-selvagem)"
Write-Host "2. Rode:"
if ($Repo) {
  Write-Host "   git remote add origin https://github.com/$Repo.git"
  Write-Host "   git push -u origin main"
} else {
  Write-Host "   git remote add origin https://github.com/SEU_USER/neve-selvagem.git"
  Write-Host "   git push -u origin main"
}
Write-Host "3. Settings → Pages → Source: GitHub Actions"
Write-Host "4. Leia GITHUB-PAGES.md"
Write-Host ""

if ($Repo) {
  $remotes = & $git remote
  if ($remotes -notcontains "origin") {
    & $git remote add origin "https://github.com/$Repo.git"
  }
  Write-Host "Tentando push para $Repo ..."
  & $git push -u origin main
}
