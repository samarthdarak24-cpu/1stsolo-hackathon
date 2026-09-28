@echo off
REM LostLink AI - start AI service (8100), backend (5000), frontend (5173)
cd /d "%~dp0"
start "lostlink-ai" /MIN cmd /c "mern\ai-service\start-server.cmd"
start "lostlink-backend" /MIN cmd /c "mern\backend\start-server.cmd"
start "lostlink-frontend" /MIN cmd /c "mern\frontend\start-server.cmd"
echo launched
