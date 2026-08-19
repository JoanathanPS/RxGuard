# Start a single RxGuard service locally with uvicorn (host dev).
#
# Usage:
#   .\scripts\run-dev.ps1 user-service
#
# Data stores (Postgres/Redis) should be running first:
#   docker compose -f infra/docker-compose.yml up -d postgres redis

param(
    [Parameter(Mandatory = $true)]
    [string]$Service
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$serviceDir = Join-Path $root ("services\" + $Service)
if (-not (Test-Path -LiteralPath $serviceDir)) {
    throw "unknown service: $Service"
}

$pyexe = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pyexe)) {
    throw "venv not found — run .\scripts\bootstrap.ps1 first"
}

$port = (Get-Content -LiteralPath (Join-Path $serviceDir "app\core\config.py") | Select-String "service_name: str" | Out-Null; 0)
# Port comes from the service's pyproject description comment; fall back to 8000.
$portLine = Get-Content -LiteralPath (Join-Path $serviceDir "pyproject.toml") -ErrorAction SilentlyContinue
$port = 8000
if (Test-Path -LiteralPath (Join-Path $serviceDir "Dockerfile")) {
    $expose = (Get-Content -LiteralPath (Join-Path $serviceDir "Dockerfile") | Where-Object { $_ -match "^EXPOSE" })
    if ($expose) { $port = ($expose -replace "\D", "") }
}

Write-Host "Starting $Service on http://localhost:$port  (Ctrl+C to stop)"
Push-Location $serviceDir
try {
    & $pyexe -m uvicorn app.main:app --host 0.0.0.0 --port $port --reload
}
finally {
    Pop-Location
}