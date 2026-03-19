@echo off
cd /d C:\Users\yakub\kaizenboard\backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --no-access-log
