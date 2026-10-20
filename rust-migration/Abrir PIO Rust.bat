@echo off
title PIO Nailo - Rust Launcher
cd /d "%~dp0src-tauri"
echo ===================================================
echo   PIO Nailo - Launcher Rust Nativo + Headless
echo ===================================================
echo.

echo "%*" | findstr /i "\-\-instance" >nul
if %ERRORLEVEL% EQU 0 goto :launch
if not "%PIO_INSTANCE%"=="" goto :launch

echo Fechando instancia anterior (se houver)...
taskkill /F /IM pio-nailo-rust.exe >nul 2>&1
ping 127.0.0.1 -n 2 >nul

echo Compilando e iniciando PIO Nailo Rust...
cargo build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Erro ao compilar.
    pause
    exit /b %ERRORLEVEL%
)

:launch
start "" "%~dp0src-tauri\target\debug\pio-nailo-rust.exe" %*
exit /b 0
