@echo off
REM KaizenBoard startup — uses Python312 explicitly to avoid PATH confusion
set PYTHON=C:\Users\yakub\AppData\Local\Programs\Python\Python312\python.exe
cd /d C:\dev\projects\kaizenboard\backend
"%PYTHON%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --no-access-log
