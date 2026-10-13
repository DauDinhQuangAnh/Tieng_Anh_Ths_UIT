@echo off
chcp 65001 >nul
title App On Thi Tieng Anh Thac Si HCMUS 2026
cd /d "%~dp0"

if exist "%LOCALAPPDATA%\node-portable\node-v22.22.0-win-x64\node.exe" (
    start "" "http://localhost:8088"
    "%LOCALAPPDATA%\node-portable\node-v22.22.0-win-x64\node.exe" server.js
) else if exist "%LOCALAPPDATA%\node-portable\node.exe" (
    start "" "http://localhost:8088"
    "%LOCALAPPDATA%\node-portable\node.exe" server.js
) else (
    echo Dang mo App truc tiep tren trinh duyet...
    start "" "%~dp0index.html"
)
