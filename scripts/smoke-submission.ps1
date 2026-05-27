# ============================================================
# smoke-submission.ps1
# ------------------------------------------------------------
# Smoke test focalizado del modulo Submissions (Entrega 2).
# Asume que el seed ya esta corrido (npm run prisma:seed).
#
# Disparara una submission feliz contra el reto EASY del curso
# BD2-DEMO-2026 y verificara que el worker la procese:
#   - login Ana (estudiante inscrita por el seed)
#   - localiza el reto EASY dinamicamente
#   - POST submission con la query oficial
#   - polling hasta estado terminal
#   - imprime score, breakdown, executionTime y feedback
# ============================================================

$ErrorActionPreference = 'Stop'
$Base = 'http://localhost:3000/api'

function Invoke-Json {
    param([string]$Method, [string]$Url, [object]$Body, [string]$Token)
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    if ($Body) {
        $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 10 -Compress }
        Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -ContentType 'application/json' -Body $json
    } else {
        Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
    }
}

Write-Host "==> 1) Login profesor del seed (Carlos)"
$profToken = (Invoke-Json POST "$Base/auth/login" @{ email='carlos.profe@univ.edu'; password='Profe123!' }).accessToken

Write-Host "==> 2) Localizar el curso del seed (BD2-DEMO-2026)"
$courses = Invoke-Json GET "$Base/courses" $null $profToken
$courseBD2 = $courses | Where-Object { $_.code -eq 'BD2-DEMO-2026' } | Select-Object -First 1
if (-not $courseBD2) { throw "No se encontro el curso 'BD2-DEMO-2026'. Corre 'npm run prisma:seed' primero." }
Write-Host "    course=$($courseBD2.id)"

Write-Host "==> 3) Listar retos del curso y elegir el MEDIUM"
# Usamos el reto MEDIUM: la query y los datos son ASCII puros (IDs y montos numericos),
# lo que evita problemas de encoding UTF-8 entre PowerShell, Invoke-RestMethod y la API.
$challenges = Invoke-Json GET "$Base/challenges?courseId=$($courseBD2.id)" $null $profToken
$reto = $challenges | Where-Object { $_.difficulty -eq 'MEDIUM' -and $_.status -eq 'published' } | Select-Object -First 1
if (-not $reto) { throw "No se encontro reto MEDIUM publicado en BD2-DEMO-2026." }
Write-Host "    challenge=$($reto.id) difficulty=$($reto.difficulty) timeLimit=$($reto.timeLimit)"

Write-Host "==> 4) Login estudiante Ana (inscrita por el seed)"
$studToken = (Invoke-Json POST "$Base/auth/login" @{ email='ana.estudiante@univ.edu'; password='Stud123!' }).accessToken

Write-Host "==> 5) Enviar submission feliz"
# El reto MEDIUM pide top-3 ordenes por total. ExpectedResult del seed: [[10,300000],[2,250000],[7,200000]] (orderSensitive=true).
$body = @{ query = 'SELECT id, total FROM orders ORDER BY total DESC LIMIT 3' }
$sub = Invoke-Json POST "$Base/challenges/$($reto.id)/submissions" $body $studToken
Write-Host "    submission=$($sub.id) status=$($sub.status)"

Write-Host "==> 6) Polling hasta estado terminal (max 60s)"
$final = $null
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    $detail = Invoke-Json GET "$Base/submissions/$($sub.id)" $null $studToken
    if ($detail.status -ne 'QUEUED' -and $detail.status -ne 'RUNNING') {
        $final = $detail
        break
    }
}
if (-not $final) { throw "Timeout esperando estado terminal" }

Write-Host ""
Write-Host "==> 7) Resultado de la submission"
Write-Host "    status:          $($final.status)"
Write-Host "    score:           $($final.score)/100"
Write-Host "    executionTimeMs: $($final.executionTimeMs)"
if ($final.scoreBreakdown) {
    Write-Host "    breakdown:"
    $final.scoreBreakdown.PSObject.Properties | ForEach-Object {
        Write-Host "      $($_.Name)= $($_.Value)"
    }
}
if ($final.errorMessage) { Write-Host "    errorMessage:    $($final.errorMessage)" }
if ($final.feedback)     { Write-Host "    feedback:        $($final.feedback)" }

Write-Host ""
if ($final.status -eq 'ACCEPTED') {
    Write-Host "[smoke-submission OK] envio + worker + comparator + scorer => ACCEPTED"
} else {
    Write-Host "[smoke-submission FAIL] estado terminal inesperado: $($final.status)"
    exit 1
}
