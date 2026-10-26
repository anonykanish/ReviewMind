param([switch]$Production)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot 'frontend')
try {
    if ($Production) { & npm.cmd run start } else { & npm.cmd run dev }
    if ($LASTEXITCODE -ne 0) { throw 'Frontend exited with an error.' }
} finally { Pop-Location }
