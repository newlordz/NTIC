# Start NTIC Platform Frontend Server
Write-Host "Starting NTIC Platform Frontend on http://localhost:8080..." -ForegroundColor Cyan
Set-Location -Path "NticPlatform.Frontend"
node server.js
