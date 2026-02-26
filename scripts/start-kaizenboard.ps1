# start-kaizenboard.ps1
# Launch KaizenBoard locally (backend + frontend dev server)
# Usage: .\scripts\start-kaizenboard.ps1

$root = Split-Path $PSScriptRoot

# Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; python -m uvicorn main:app --reload --port 8000" -WindowStyle Normal

# Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173/claude"
Write-Host "KaizenBoard started. Opening Claude Projects page..."
