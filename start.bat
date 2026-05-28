@echo off
echo Iniciando WhatsApp Scheduler...

start "Backend" cmd /k "cd /d %~dp0backend && node src/server.js"
timeout /t 3 /nobreak >nul
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Aguarde alguns segundos e acesse: http://localhost:5173
