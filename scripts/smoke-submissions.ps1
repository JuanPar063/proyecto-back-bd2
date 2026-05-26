# ============================================================
# smoke-submissions.ps1
# ------------------------------------------------------------
# Smoke test end-to-end del módulo Submissions (Entrega 2).
# Requiere docker compose up con API + Worker + Postgres + Redis.
# No es parte de la prueba automatizada; está pensado para que
# el equipo lo corra a mano durante la demo / sustentación.
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

Write-Host "==> 1) Login admin"
$admin = Invoke-Json POST "$Base/auth/login" @{ email='admin@sqljudge.local'; password='Admin123!' }
$adminToken = $admin.accessToken

$stamp = [int][double]::Parse((Get-Date -UFormat %s))
$profEmail = "smoke.prof.$stamp@sqljudge.local"
$studEmail = "smoke.stud.$stamp@sqljudge.local"

Write-Host "==> 2) Crear profesor y estudiante"
$prof = Invoke-Json POST "$Base/users" @{ email=$profEmail; password='Profe123!'; fullName='Prof Smoke'; role='PROFESSOR' } $adminToken
$stud = Invoke-Json POST "$Base/users" @{ email=$studEmail; password='Stud123!';  fullName='Stud Smoke';  role='STUDENT'   } $adminToken
$profId = $prof.id; $studId = $stud.id

Write-Host "==> 3) Login PROFESSOR / STUDENT"
$profToken = (Invoke-Json POST "$Base/auth/login" @{ email=$profEmail; password='Profe123!' }).accessToken
$studToken = (Invoke-Json POST "$Base/auth/login" @{ email=$studEmail; password='Stud123!'  }).accessToken

Write-Host "==> 4) Crear escenario demo (curso + reto publicado + esquema + dataset)"
$demo = Invoke-Json POST "$Base/demo/customers-orders" @{
    courseName='Smoke BD2'; courseCode="SMOKE-$stamp"; customerCount=20; orderCount=100
} $profToken
$courseId    = $demo.course.id
$challengeId = $demo.challenge.id
Write-Host "    course=$courseId challenge=$challengeId"

Write-Host "==> 5) Inscribir STUDENT en el curso"
Invoke-Json POST "$Base/courses/$courseId/enrollments" @{ studentEmail=$studEmail } $profToken | Out-Null

Write-Host "==> 6) Cargar ExpectedResult"
$expectedBody = @'
{
  "columns": ["name", "total"],
  "rows": [["Ana", 8], ["Beto", 6], ["Carla", 4]],
  "orderSensitive": false,
  "floatTolerance": 0
}
'@
Invoke-Json PUT "$Base/challenges/$challengeId/expected-result" $expectedBody $profToken | Out-Null

Write-Host "==> 7) Enviar submission feliz (variante REST-ish)"
$happy = Invoke-Json POST "$Base/challenges/$challengeId/submissions" @{
    query = 'SELECT c.name, COUNT(o.id) AS total FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name HAVING COUNT(o.id) > 3'
} $studToken
Write-Host "    submissionId=$($happy.id) status=$($happy.status)"

Write-Host "==> 8) Polling hasta tener un estado terminal"
$final = $null
for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    $detail = Invoke-Json GET "$Base/submissions/$($happy.id)" $null $studToken
    if ($detail.status -ne 'QUEUED' -and $detail.status -ne 'RUNNING') {
        $final = $detail
        break
    }
}
if (-not $final) { throw "Timeout esperando estado terminal" }
Write-Host "    submission resuelta -> status=$($final.status) score=$($final.score) timeMs=$($final.executionTimeMs)"
Write-Host "    feedback: $($final.feedback)"

Write-Host "==> 9) Enviar submission forzada a WRONG (marcador en comentario)"
$wrong = Invoke-Json POST "$Base/challenges/$challengeId/submissions" @{
    query = 'SELECT 1 /* expect:WRONG */ FROM customers'
} $studToken
for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    $detail = Invoke-Json GET "$Base/submissions/$($wrong.id)" $null $studToken
    if ($detail.status -ne 'QUEUED' -and $detail.status -ne 'RUNNING') { break }
}
Write-Host "    submission forzada -> status=$($detail.status) score=$($detail.score)"

Write-Host "==> 10) Listar submissions del STUDENT (debería tener 2)"
$myList = Invoke-Json GET "$Base/submissions/my" $null $studToken
Write-Host "    total=$($myList.Count)"

Write-Host "==> 11) Listar como PROFESSOR con filtros (challengeId + studentId)"
$profList = Invoke-Json GET "$Base/submissions?challengeId=$challengeId&studentId=$studId" $null $profToken
Write-Host "    total=$($profList.Count)"

Write-Host ""
Write-Host "[smoke OK] flujo end-to-end funcional"
