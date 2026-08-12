Write-Host "Starting NTIC WhatsApp Gateway Service on http://localhost:3001..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\whatsapp-gateway"
node server.js
