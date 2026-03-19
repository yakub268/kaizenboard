@echo off
cd /d C:\Users\yakub\kaizenboard\backend
start /b "" "C:\Users\yakub\AppData\Local\Programs\Python\Python311\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000 --no-access-log
