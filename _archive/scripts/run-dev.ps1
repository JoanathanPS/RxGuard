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

$port = 8000
if (Test-Path -LiteralPath (Join-Path $serviceDir "Dockerfile")) {
    $expose = (Get-Content -LiteralPath (Join-Path $serviceDir "Dockerfile") | Where-Object { $_ -match "^EXPOSE" })
    if ($expose) { $port = ($expose -replace "\D", "") }
}

# Package name mirrors the service name, e.g. user-service -> user_app.
$svcName = $Service -replace "-service$", ""
$module = "$svcName`_app.main:app"

Write-Host "Starting $Service on http://localhost:$port  (Ctrl+C to stop)"
Push-Location $serviceDir
try {
    & $pyexe -m uvicorn $module --host 0.0.0.0 --port $port --reload
}
finally {
    Pop-Location
}