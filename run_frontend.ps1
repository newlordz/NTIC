# Start NTIC Platform Frontend Server
$Host.UI.RawUI.WindowTitle = "NTIC Platform Frontend"
$TargetDir = Join-Path $PSScriptRoot "NticPlatform.Frontend"

if (-not (Test-Path $TargetDir)) {
    Write-Host "[ERROR] Directory $TargetDir not found." -ForegroundColor Red
    Pause
    Exit 1
}

Set-Location -Path $TargetDir

# Check node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not found in PATH." -ForegroundColor Red
    Pause
    Exit 1
}

# Check node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Check dist build
if (-not (Test-Path "dist\ntic-frontend\browser\index.html")) {
    Write-Host "Building Angular frontend..." -ForegroundColor Yellow
    npm run build
}

Write-Host "Starting NTIC Platform Frontend on http://localhost:8080..." -ForegroundColor Cyan
node server.js
