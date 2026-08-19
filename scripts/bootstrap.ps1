# RxGuard development bootstrap (Windows / PowerShell 5.1)
#
# Creates a single root virtual environment that installs the shared package
# and every service as editable packages, plus the dev toolchain (ruff, pytest).
# Services are then started from their own directories with run-dev.ps1, or —
# for the full stack — with `docker compose up`.
#
# Usage:
#   .\scripts\bootstrap.ps1
#   .\scripts\run-dev.ps1 user-service
#
# Note: needs Python 3.11 on PATH (the spec pins 3.11+).

param(
    [switch]$Recreate
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3.0
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root ".venv"
$py = "python"  # change to python3.11 if that is your launcher name

if ($Recreate -and (Test-Path -LiteralPath $venv)) {
    Write-Host "Removing existing $venv"
    Remove-Item -LiteralPath $venv -Recurse -Force
}

if (-not (Test-Path -LiteralPath $venv)) {
    Write-Host "Creating virtual environment at $venv"
    & $py -m venv $venv
    if ($LASTEXITCODE -ne 0) { throw "failed to create venv" }
}

$pyexe = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pyexe)) {
    throw "expected interpreter not found at $pyexe"
}

Write-Host "Upgrading pip"
& $pyexe -m pip install --upgrade pip

Write-Host "Installing shared package"
& $pyexe -m pip install -e (Join-Path $root "shared")

Write-Host "Installing services (editable)"
Get-ChildItem -Path (Join-Path $root "services") -Directory -Filter "*-service" | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    & $pyexe -m pip install -e $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "failed to install $($_.Name)" }
}

Write-Host "Installing dev toolchain"
& $pyexe -m pip install ruff pytest

Write-Host "Done. Run .\scripts\run-dev.ps1 <service-name> to start a service."