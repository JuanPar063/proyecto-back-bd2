# ============================================================
# smoke-ai-assistant.ps1
# ------------------------------------------------------------
# Smoke test del modulo AI Assistant (Entrega 2, items 9-12).
# Envia 3 queries con anti-patrones distintos al endpoint
# publico y verifica que cada una dispare las reglas esperadas:
#   Caso 1: SELECT * + UPPER(col) en WHERE  -> SELECT_STAR + FUNCTION_IN_WHERE
#   Caso 2: JOIN implicito por coma          -> JOIN_WITHOUT_ON
#   Caso 3: tiempo > umbral                  -> SLOW_QUERY (critical)
# Tambien imprime suggestedIndexes, rewriteSql y qualityScore
# para cada caso.
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

function Print-Analysis {
    param([string]$Label, [object]$Resp, [string[]]$ExpectedRules)
    Write-Host ""
    Write-Host "----- $Label -----"

    $ruleIds = @($Resp.warnings | ForEach-Object { $_.ruleId })
    Write-Host "  warnings (item 10):      $($ruleIds -join ', ')"
    foreach ($w in $Resp.warnings) {
        Write-Host "    [$($w.severity)] $($w.ruleId): $($w.message)"
    }

    Write-Host "  suggestedIndexes (item 11): $($Resp.suggestedIndexes.Count) indice(s)"
    foreach ($idx in $Resp.suggestedIndexes) {
        Write-Host "    - $idx"
    }

    $rewrite = if ($Resp.rewriteSql) { $Resp.rewriteSql } else { '(null)' }
    Write-Host "  rewriteSql (item 12):    $rewrite"

    if ($Resp.qualityScore) {
        $gp = $Resp.qualityScore.goodPractices
        $cl = $Resp.qualityScore.clarity
        $im = $Resp.qualityScore.improvement
        Write-Host "  qualityScore:            goodPractices=$gp clarity=$cl improvement=$im"
    }

    Write-Host "  impact:                  $($Resp.impact)"

    foreach ($expected in $ExpectedRules) {
        if ($ruleIds -notcontains $expected) {
            Write-Host "  [FAIL] Esperaba regla $expected y no aparecio"
            exit 1
        }
    }
    Write-Host "  [OK] Todas las reglas esperadas dispararon ($($ExpectedRules -join ', '))"
}

Write-Host "==> 1) Login profesor del seed (Carlos)"
$profToken = (Invoke-Json POST "$Base/auth/login" @{ email='carlos.profe@univ.edu'; password='Profe123!' }).accessToken

$schemaDdl = 'CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(100), city VARCHAR(80)); CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT REFERENCES customers(id), total DECIMAL(10,2));'

Write-Host ""
Write-Host "==> 2) Caso 1: SELECT * + UPPER(col) en WHERE + ORDER BY sin LIMIT"
$resp1 = Invoke-Json POST "$Base/ai-assistant/analyze" @{
    query = "SELECT * FROM customers WHERE UPPER(name) = 'ANA LOPEZ' ORDER BY name"
    schemaDdl = $schemaDdl
    executionTimeMs = 100
    status = 'ACCEPTED'
} $profToken
Print-Analysis 'Caso 1: anti-patrones combinados' $resp1 @('SELECT_STAR', 'FUNCTION_IN_WHERE')

Write-Host ""
Write-Host "==> 3) Caso 2: JOIN implicito por coma en FROM"
$resp2 = Invoke-Json POST "$Base/ai-assistant/analyze" @{
    query = 'SELECT c.name, o.total FROM customers c, orders o WHERE c.id = o.customer_id'
    schemaDdl = $schemaDdl
    executionTimeMs = 80
    status = 'ACCEPTED'
} $profToken
Print-Analysis 'Caso 2: join implicito (debe disparar JOIN_WITHOUT_ON)' $resp2 @('JOIN_WITHOUT_ON')

Write-Host ""
Write-Host "==> 4) Caso 3: query lenta (debe disparar SLOW_QUERY critical)"
$resp3 = Invoke-Json POST "$Base/ai-assistant/analyze" @{
    query = 'SELECT name FROM customers WHERE city = ''Cali'''
    schemaDdl = $schemaDdl
    executionTimeMs = 1500
    status = 'ACCEPTED'
} $profToken
Print-Analysis 'Caso 3: tiempo > 800ms umbral' $resp3 @('SLOW_QUERY')

# Validar severidad critical en caso 3
$critical = $resp3.warnings | Where-Object { $_.severity -eq 'critical' }
if (-not $critical) {
    Write-Host "[FAIL] caso 3 no genero warning de severidad critical"
    exit 1
}

Write-Host ""
Write-Host "[smoke-ai-assistant OK] rule engine + recommendation builder + LLM stub funcionando"
