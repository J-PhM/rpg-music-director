@echo off
REM Raccourci de lancement pour RPG Music Director.
REM Lance l'exe release (compilé via "npm run tauri build").
REM Si l'exe n'existe pas encore, affiche un message d'aide.

setlocal

set "EXE=%~dp0src-tauri\target\release\rpg-music-director.exe"

if not exist "%EXE%" (
    echo.
    echo === RPG Music Director : binaire introuvable ===
    echo.
    echo Le fichier %EXE%
    echo n'existe pas encore. Il faut le compiler une premiere fois :
    echo.
    echo   cd /d "%~dp0"
    echo   npm run tauri build
    echo.
    echo Cela prend 3 a 5 minutes. Apres compilation, ce raccourci
    echo lancera l'application en moins d'une seconde.
    echo.
    pause
    exit /b 1
)

start "" "%EXE%"
endlocal
