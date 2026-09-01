@echo off
cd /d "%~dp0"
echo.
echo ATENCION: esto borra TODOS los datos de FiestaControl.
set /p OK=Escriba BORRAR para continuar: 
if /I not "%OK%"=="BORRAR" goto :eof
if exist fiestacontrol.db del /f /q fiestacontrol.db
if exist fiestacontrol.db-wal del /f /q fiestacontrol.db-wal
if exist fiestacontrol.db-shm del /f /q fiestacontrol.db-shm
echo Base eliminada. Al iniciar FiestaControl se creara una nueva vacia.
pause
