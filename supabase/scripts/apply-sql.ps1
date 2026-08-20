# Applies a SQL file to the cloud Supabase project via the Management API.
# Used when outbound Postgres ports (5432/6543) are blocked by the network
# but HTTPS (443) is available. Reads SUPABASE_ACCESS_TOKEN from .env.
#
# Usage:
#   powershell -File supabase\scripts\apply-sql.ps1 supabase\migrations\0001_schema.sql

param(
    [Parameter(Mandatory = $true)][string]$SqlFile
)

$envFile = Join-Path $PSScriptRoot "..\..\.env"
$pat = (Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_ACCESS_TOKEN=' }) -replace '^SUPABASE_ACCESS_TOKEN=', ''
$ref = (Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_PROJECT_REF=' }) -replace '^SUPABASE_PROJECT_REF=', ''
if (-not $ref) { $ref = "rfemgzedvjpwaeivfjhn" }

if (-not $pat) { throw "SUPABASE_ACCESS_TOKEN missing from .env" }

$sql = [System.IO.File]::ReadAllText((Resolve-Path $SqlFile), [System.Text.Encoding]::UTF8)
$body = @{ query = $sql } | ConvertTo-Json

$headers = @{
    Authorization = "Bearer $pat"
    apikey        = $pat
}

try {
    $resp = Invoke-RestMethod -Method Post `
        -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
        -Headers $headers -Body $body -ContentType "application/json" -TimeoutSec 120
    "OK: $SqlFile"
} catch {
    $detail = $_.Exception.Message
    if ($_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }
    "FAIL: $SqlFile`n$detail"
    exit 1
}