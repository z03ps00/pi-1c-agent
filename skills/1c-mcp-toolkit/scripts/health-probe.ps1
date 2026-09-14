# Probe typical MCP Toolkit HTTP ports. Prints "порт N жив" for each hit.
# Extra ports: MCP_TOOLKIT_PORT, KD2_PORT, KD31_PORT (env).
# Windows: follow the profile powershell-windows skill (native HTTP, no &&).
$ErrorActionPreference = 'Stop'
$ports = @(6003, 6004, 6005, 6010, 6011, 6013, 6023, 6033, 7003)
foreach ($extra in @($env:MCP_TOOLKIT_PORT, $env:KD2_PORT, $env:KD31_PORT)) {
    if (-not [string]::IsNullOrWhiteSpace($extra)) {
        $ports += [int]$extra
    }
}
$seen = New-Object 'System.Collections.Generic.HashSet[int]'
$found = $false
foreach ($p in $ports) {
    if (-not $seen.Add($p)) { continue }
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:$p/health" -UseBasicParsing -TimeoutSec 2
        Write-Output "порт $p жив"
        $found = $true
    } catch {
        # down — skip
    }
}
if (-not $found) {
    Write-Error "ни один порт toolkit не ответил (откройте tools/mcp-toolkit/MCP_Toolkit.epf в клиенте 1С)"
    exit 1
}
