@echo off
chcp 65001 >nul
title Lead CRM - serwer lokalny
cd /d "%~dp02-web-crm-app"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [BLAD] Nie znaleziono Node.js.
  echo Zainstaluj wersje LTS ze strony https://nodejs.org i uruchom ten plik ponownie.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instaluje zaleznosci - tylko za pierwszym razem, chwile to potrwa...
  call npm install
  if errorlevel 1 (
    echo [BLAD] Instalacja nie powiodla sie.
    pause
    exit /b 1
  )
)

echo.
echo Uruchamiam panel CRM: http://localhost:5173
echo Aby zatrzymac serwer, zamknij to okno albo nacisnij Ctrl+C.
echo.
call npm run dev -- --open
pause
