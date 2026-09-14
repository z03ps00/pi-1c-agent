# execute_code к toolkit КД 3.1 из BSL-файла.
# Использование: kd31_exec.ps1 script.bsl [out.json]
# Серверный контекст: НЕ использовать Возврат, результат через переменную Результат.
# Порт: KD31_PORT (по умолчанию 6011).
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$BslPath,
    [Parameter(Position = 1)][string]$OutFile = ''
)
$ErrorActionPreference = 'Stop'
$Port = if ($env:KD31_PORT) { $env:KD31_PORT } else { '6011' }
$code = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $BslPath), [System.Text.Encoding]::UTF8)
$payload = @{ code = $code } | ConvertTo-Json -Compress -Depth 5
$bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$uri = "http://localhost:$Port/api/execute_code"
try {
    $resp = Invoke-WebRequest -Uri $uri -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -UseBasicParsing -TimeoutSec 60
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
$text = $resp.Content
if ($OutFile) {
    $full = if ([System.IO.Path]::IsPathRooted($OutFile)) { $OutFile } else { Join-Path (Get-Location) $OutFile }
    [System.IO.File]::WriteAllText($full, $text, [System.Text.UTF8Encoding]::new($false))
    Write-Output "saved -> $OutFile (читать через Read для корректной кириллицы)"
} else {
    Write-Output $text
}
