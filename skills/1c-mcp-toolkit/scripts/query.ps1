# execute_query к MCP Toolkit.
# Использование: query.ps1 "ВЫБРАТЬ 1 КАК Поле" [out.json]
# Порт: MCP_TOOLKIT_PORT (по умолчанию 6003).
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Query,
    [Parameter(Position = 1)][string]$OutFile = ''
)
$ErrorActionPreference = 'Stop'
$Port = if ($env:MCP_TOOLKIT_PORT) { $env:MCP_TOOLKIT_PORT } else { '6003' }
$payload = @{ query = $Query } | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
$uri = "http://localhost:$Port/api/execute_query"
try {
    $resp = Invoke-WebRequest -Uri $uri -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -UseBasicParsing -TimeoutSec 30
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
