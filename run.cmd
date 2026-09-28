@echo off
REM LostLink AI - start the local web server and open the site in the default browser
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this machine.
  echo Install it from https://nodejs.org or open index.html directly in a browser.
  pause
  exit /b 1
)

start "" http://localhost:8080/index.html
echo Starting LostLink AI on http://localhost:8080 (press Ctrl+C to stop)
node server.js 8080
