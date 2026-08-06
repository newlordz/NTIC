# Start NTIC Platform Frontend Server
Write-Host "Starting NTIC Platform Frontend on http://localhost:8080..." -ForegroundColor Cyan
$TargetDir = Join-Path $PSScriptRoot "NticPlatform.Frontend"
if (Test-Path $TargetDir) {
    Set-Location -Path $TargetDir
}
node server.js

