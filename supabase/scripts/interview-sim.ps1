# Drives the deployed interview-turn function through a full simulated
# interview and prints the question path. Used to demonstrate that the
# interview is adaptive (same drugs, different answers -> different paths).
#
# Usage:
#   powershell -File supabase\scripts\interview-sim.ps1 -PrescriptionId <id> -Variant <A|B>
#     Variant A: male, 72, denies everything else.
#     Variant B: female, 34, pregnant, reports CKD + diabetes, takes supplements.

param(
    [string]$PrescriptionId,
    [string]$Variant = "A",
    [int]$MaxTurns = 28,
    [string]$Email = "dev.clinician@rxguard.dev",
    [string]$Password = "DevTest123!"
)

$envFile = Join-Path $PSScriptRoot "..\..\.env"
$anon = (Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_ANON_KEY=' }) -replace '^SUPABASE_ANON_KEY=', ''
$url  = (Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_URL=' }) -replace '^SUPABASE_URL=', ''

$auth = @{ apikey = $anon; "Content-Type" = "application/json" }
$tok  = Invoke-RestMethod -Method Post -Uri "$url/auth/v1/token?grant_type=password" -Headers $auth -Body (@{ email = $Email; password = $Password } | ConvertTo-Json -Compress) -TimeoutSec 30
$h = @{ apikey = $anon; Authorization = "Bearer $($tok.access_token)"; "Content-Type" = "application/json" }

$profile = @{
    A = @{ age = "72"; gender = "male"; pregnant = $null }
    B = @{ age = "34"; gender = "female"; pregnant = "yes" }
}.$Variant

$path = @()
$sessionId = $null
$count = 0

for ($i = 0; $i -lt $MaxTurns; $i++) {
    $body = @{ prescription_id = $PrescriptionId }
    if ($sessionId) { $body.session_id = $sessionId }
    $q = Invoke-RestMethod -Method Post -Uri "$url/functions/v1/interview-turn" -Headers $h -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 90

    if ($q.done) {
        Write-Output "DONE after $count questions"
        Write-Output "summary: $($q.completion_summary)"
        Write-Output "PATH: $($path -join ' | ')"
        exit 0
    }

    $path += $q.field_name
    $count++

    # Build a deterministic answer for the returned question.
    $answer = ""
    $f = [string]$q.field_name
    switch ($q.question_type) {
        "number" {
            if ($f -match "age") { $answer = $profile.age }
            elseif ($f -match "weight") { $answer = if ($Variant -eq "A") { "80" } else { "62" } }
            elseif ($f -match "height") { $answer = if ($Variant -eq "A") { "178" } else { "165" } }
            elseif ($f -match "creatinine|egfr|kidney") { $answer = if ($Variant -eq "B") { "150" } else { "12" } }
            elseif ($f -match "inr|pt|coag") { $answer = if ($Variant -eq "A") { "2.1" } else { "1.0" } }
            else { $answer = "10" }
        }
        "boolean" {
            $answer = if ($f -match "pregnan") { if ($null -ne $profile.pregnant) { $profile.pregnant } else { "no" } }
                      elseif ($f -match "breastfeed") { "no" }
                      elseif ($f -match "smok") { "no" }
                      elseif ($f -match "alcohol") { if ($Variant -eq "A") { "no" } else { "yes" } }
                      else { "no" }
        }
        "single-select" {
            if ($f -match "sex|gender") { $answer = $profile.gender }
            elseif ($f -match "diabetes") { $answer = if ($Variant -eq "B") { "yes" } else { "no" } }
            elseif ($f -match "kidney|ckd|renal|chronic") { $answer = if ($Variant -eq "B") { "yes" } else { "no" } }
            elseif ($f -match "liver") { $answer = "no" }
            elseif ($f -match "heart|cardiac|hypertension|blood pressure") { $answer = "no" }
            elseif ($f -match "symptom|severity|urgent") { $answer = "mild" }
            elseif ($q.options.Count -gt 0) { $answer = $q.options[0] }
            else { $answer = "no" }
        }
        "multi-select" {
            if ($f -match "conditions|chronic") {
                $answer = if ($Variant -eq "B") { @("diabetes", "chronic kidney disease") } else { @() }
            }
            elseif ($f -match "allerg") { $answer = @() }
            elseif ($f -match "medication|supplement") { $answer = if ($Variant -eq "B") { @("vitamin D") } else { @() } }
            elseif ($f -match "surgery|hospital") { $answer = @() }
            elseif ($f -match "family") { $answer = @() }
            elseif ($q.options.Count -gt 0) { $answer = @($q.options[0]) }
            else { $answer = @() }
        }
        "text" {
            if ($f -match "reason|symptom|presenting") { $answer = "chest discomfort and shortness of breath" }
            elseif ($f -match "past.*reaction|bad reaction") { $answer = "none" }
            else { $answer = "none" }
        }
        default { $answer = "no" }
    }

    $sessionId = $q.session_id
    $resp = @{ session_id = $sessionId; field_name = $q.field_name; question_text = $q.question_text; answer = $answer } | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod -Method Post -Uri "$url/rest/v1/interview_responses" -Headers $h -Body $resp -TimeoutSec 30 | Out-Null
    } catch {
        Write-Output "ANSWER INSERT FAILED: $($_.ErrorDetails.Message)"
        exit 1
    }

    Write-Output ("Q{0,2} [{1,-3}] {2}  => {3}" -f $count, $q.question_type, $q.question_text, ($answer -join ","))
}

Write-Output "REACHED MAX TURNS ($MaxTurns) without completion"
Write-Output "PATH: $($path -join ' | ')"