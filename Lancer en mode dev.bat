@echo off
REM Mode developpement : lance "npm run tauri dev" depuis le dossier du projet.
REM Compile en mode debug (1-2 min en initial, instantane apres) et active
REM le hot-reload des modifications du code.
REM Le terminal reste ouvert pour afficher les logs Vite et Cargo.

cd /d "%~dp0"
npm run tauri dev

REM Si tauri dev quitte (fermeture de la fenetre), garde le terminal
REM ouvert pour qu'on puisse lire les eventuelles erreurs.
pause
