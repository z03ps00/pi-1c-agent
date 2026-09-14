# execute_query к toolkit КД 2.0.
# Использование: kd2_query.ps1 "ВЫБРАТЬ ... ИЗ Справочник.Конвертации" [out.json]
# Порт: KD2_PORT (по умолчанию 7003).
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Query,
    [Parameter(Position = 1)][string]$OutFile = ''
)
$ErrorActionPreference = 'Stop'
$Port = if ($env:KD2_PORT) { $env:KD2_PORT } else { '7003' }
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
