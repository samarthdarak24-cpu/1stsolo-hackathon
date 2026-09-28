@echo off
cd /d "%~dp0"
npm run dev > frontend.out.log 2>&1
