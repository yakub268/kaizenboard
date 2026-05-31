# start_kaizen_detached.ps1
# Launches KaizenBoard in a detached background process using Python312.
# Use this from Claude Code or Task Scheduler instead of start_kaizen.bat
# because Start-Process properly detaches on Windows (bat 'start' from bash does not).

$PYTHON = "C:\Users\yakub\AppData\Local\Programs\Python\Python312\python.exe"
$BACKEND = "C:\dev\projects\kaizenboard\backend"

# Kill any existing process on port 8000
$conn = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    Write-Host "Killed existing process on :8000"
}

Start-Process `
    -FilePath $PYTHON `
    -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--no-access-log" `
    -WorkingDirectory $BACKEND `
    -WindowStyle Hidden

Start-Sleep -Seconds 4

# -UseBasicParsing avoids the IE engine security prompt
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:8000/" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-Host "KaizenBoard started successfully at http://127.0.0.1:8000/"
    }
} catch {
    Write-Host "WARNING: KaizenBoard did not respond -- check Python312 install"
}
