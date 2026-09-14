# execute_code к MCP Toolkit из BSL-файла.
# Использование: exec.ps1 script.bsl [out.json]
# Результат через переменную Результат, не Возврат.
# Порт: MCP_TOOLKIT_PORT (по умолчанию 6003).
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$BslPath,
    [Parameter(Position = 1)][string]$OutFile = ''
)
$ErrorActionPreference = 'Stop'
$Port = if ($env:MCP_TOOLKIT_PORT) { $env:MCP_TOOLKIT_PORT } else { '6003' }
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
    if ([System.IO.Path]::IsPathRooted($OutFile)) {
        [System.IO.File]::WriteAllText($OutFile, $text, [System.Text.UTF8Encoding]::new($false))
    } else {
        $full = Join-Path (Get-Location) $OutFile
        [System.IO.File]::WriteAllText($full, $text, [System.Text.UTF8Encoding]::new($false))
    }
    Write-Output "saved -> $OutFile (читать через Read для корректной кириллицы)"
} else {
    Write-Output $text
}
