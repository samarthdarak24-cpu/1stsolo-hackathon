@echo off
cd /d "%~dp0"
set "PORT=5000"
npm start > backend.out.log 2>&1
