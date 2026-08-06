# Launch NTIC Platform Python Backend Server connected to PostgreSQL
Write-Host "Starting NTIC Platform Python Backend..." -ForegroundColor Cyan
Set-Location -Path $PSScriptRoot
if (Test-Path "$PSScriptRoot\.venv\Scripts\python.exe") {
    & "$PSScriptRoot\.venv\Scripts\python.exe" "NticPlatform.Backend\run.py"
} else {
    python "NticPlatform.Backend\run.py"
}

