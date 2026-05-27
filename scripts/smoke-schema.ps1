# ============================================================
# smoke-schema.ps1
# ------------------------------------------------------------
# Smoke test focalizado del modulo Schemas (Entrega 1+2).
# Crea un reto efimero y prueba los 4 caminos del modulo:
#   - PUT schema valido (parsea, persiste parsedTables, devuelve version)
#   - GET schema (lee parsedTables persistidos)
#   - PUT schema con DROP prohibido (rechaza 400)
#   - PUT schema con sintaxis invalida (rechaza 400)
# Requiere docker compose arriba + seed corrido.
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

function Invoke-JsonExpect400 {
    param([string]$Method, [string]$Url, [object]$Body, [string]$Token, [string]$Label)
    try {
        Invoke-Json $Method $Url $Body $Token | Out-Null
        Write-Host "    [FAIL] $Label NO lanzo error como se esperaba"
        exit 1
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 400) {
            Write-Host "    [OK]   $Label rechazado con 400"
        } else {
            Write-Host "    [FAIL] $Label devolvio $code en lugar de 400"
            exit 1
        }
    }
}

Write-Host "==> 1) Login admin (del seed)"
$adminToken = (Invoke-Json POST "$Base/auth/login" @{ email='admin@sqljudge.local'; password='Admin123!' }).accessToken

$stamp = [int][double]::Parse((Get-Date -UFormat %s))
$profEmail = "smoke.schema.prof.$stamp@univ.edu"

Write-Host "==> 2) Crear profesor temporal"
Invoke-Json POST "$Base/users" @{ email=$profEmail; password='Profe123!'; fullName='Prof Schema Smoke'; role='PROFESSOR' } $adminToken | Out-Null

Write-Host "==> 3) Login profesor"
$profToken = (Invoke-Json POST "$Base/auth/login" @{ email=$profEmail; password='Profe123!' }).accessToken

Write-Host "==> 4) Crear curso temporal"
$course = Invoke-Json POST "$Base/courses" @{
    name = 'Curso Schema Smoke'
    code = "SCHEMA-SMOKE-$stamp"
    period = '2026-1'
    group = '1'
} $profToken
$courseId = $course.id

Write-Host "==> 5) Crear reto draft"
$challenge = Invoke-Json POST "$Base/challenges" @{
    title = "Reto Schema Smoke $stamp"
    description = 'Reto temporal para probar carga de schema.'
    difficulty = 'EASY'
    tags = @('SELECT')
    databaseEngine = 'postgresql'
    timeLimit = 3000
    courseId = $courseId
} $profToken
$challengeId = $challenge.id
Write-Host "    challenge=$challengeId status=$($challenge.status)"

Write-Host "==> 6) PUT schema valido (customers + orders con FK)"
$validDdl = @'
CREATE TABLE customers (
  id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  city VARCHAR(80)
);

CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  total DECIMAL(10,2)
);
'@
$schema = Invoke-Json PUT "$Base/challenges/$challengeId/schema" @{ ddl = $validDdl } $profToken
Write-Host "    schema.id=$($schema.id) version=$($schema.version)"
Write-Host "    parsedTables.count=$($schema.parsedTables.Count)"

Write-Host "==> 7) GET schema (verificar parsedTables persistidos)"
$schemaRead = Invoke-Json GET "$Base/challenges/$challengeId/schema" $null $profToken
$tableNames = $schemaRead.parsedTables | ForEach-Object { $_.name }
Write-Host "    tablas: $($tableNames -join ', ')"
$totalCols = ($schemaRead.parsedTables | ForEach-Object { $_.columns.Count } | Measure-Object -Sum).Sum
Write-Host "    total columnas parseadas: $totalCols"

Write-Host "==> 8) PUT schema con DROP (debe rechazar 400)"
Invoke-JsonExpect400 PUT "$Base/challenges/$challengeId/schema" @{
    ddl = 'CREATE TABLE x (id INT); DROP TABLE x;'
} $profToken 'DROP en schema'

Write-Host "==> 9) PUT schema con DELETE (debe rechazar 400)"
Invoke-JsonExpect400 PUT "$Base/challenges/$challengeId/schema" @{
    ddl = 'CREATE TABLE y (id INT); DELETE FROM y;'
} $profToken 'DELETE en schema'

Write-Host "==> 10) PUT schema con sintaxis invalida (debe rechazar 400)"
Invoke-JsonExpect400 PUT "$Base/challenges/$challengeId/schema" @{
    ddl = 'CREATE TABLE bad ( ??? VARCHAR );'
} $profToken 'DDL invalido'

Write-Host ""
Write-Host "[smoke-schema OK] parseo + persist + bloqueo de sentencias prohibidas funcionando"
