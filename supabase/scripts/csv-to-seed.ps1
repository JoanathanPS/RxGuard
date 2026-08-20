# Generates supabase/migrations/0002_seed_data.sql from data/*.csv.
# Run from the repo root:
#   powershell -File supabase\scripts\csv-to-seed.ps1
#
# Keeps the grounding tables in Postgres in sync with the committed CSVs
# (single source of truth for the rule engine + benchmark ground truth).

param(
    [string]$DataDir = "data",
    [string]$OutFile = "supabase/migrations/0002_seed_data.sql"
)

function Esc([string]$v) {
    if ($null -eq $v) { return "NULL" }
    return "'" + ($v -replace "'", "''") + "'"
}

function TableInserts([string]$csvPath, [string]$table, [string[]]$cols, [string[]]$lowerCols = @()) {
    $rows = Import-Csv -LiteralPath $csvPath
    $sb = New-Object System.Text.StringBuilder
    foreach ($row in $rows) {
        $values = foreach ($c in $cols) {
            $v = $row.$c
            if ($lowerCols -contains $c) { $v = $v.ToLowerInvariant() }
            Esc $v
        }
        [void]$sb.AppendLine("insert into public.$table ($($cols -join ', ')) values ($($values -join ', '));")
    }
    $sb.ToString()
}

$header = @"
-- Auto-generated from data/*.csv by supabase/scripts/csv-to-seed.ps1 - do not edit by hand.
-- Regenerate when the CSVs change.

"@

$sql = New-Object System.Text.StringBuilder
[void]$sql.AppendLine($header)

[void]$sql.AppendLine("-- grounding: drug_mapping (drug -> RXCUI -> class -> flags)")
[void]$sql.AppendLine((TableInserts (Join-Path $DataDir "drug_mapping.csv") "drug_mapping" @("drug_name", "rxcui", "drug_class", "mechanism_flag", "risk_factor_flag")))

[void]$sql.AppendLine("-- grounding: interactions_seed (drug pair -> severity/mechanism/action)")
[void]$sql.AppendLine((TableInserts (Join-Path $DataDir "interactions_seed.csv") "interactions_seed" @("drug_a", "drug_b", "severity", "mechanism", "action") @("severity")))

[void]$sql.AppendLine("-- grounding: drug_patient_risk_rules (drug + patient factor -> verdict)")
[void]$sql.AppendLine((TableInserts (Join-Path $DataDir "drug_patient_risk_rules.csv") "drug_patient_risk_rules" @("drug_name", "trigger_type", "trigger_condition", "risk_level", "effect", "recommended_action") @("risk_level")))

Set-Content -LiteralPath $OutFile -Value $sql.ToString() -Encoding UTF8
"wrote $OutFile ($((Get-Item $OutFile).Length) bytes)"