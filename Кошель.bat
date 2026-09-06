@echo off
cd /d "%~dp0"
title Кошель

if not exist "node_modules\electron\dist\electron.exe" (
  echo Первый запуск: устанавливаю зависимости, это займёт пару минут...
  call npm install
  if errorlevel 1 goto error
)

echo Собираю интерфейс...
call npm run build
if errorlevel 1 goto error

echo Запускаю Кошель...
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

:error
echo.
echo Не получилось. Прочитайте сообщение выше и нажмите любую клавишу.
pause >nul
exit /b 1