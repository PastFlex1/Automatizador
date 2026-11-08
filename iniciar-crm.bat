@echo off
REM ============================================================
REM  MetaCloser CRM - APM Inox: inicio local
REM  Abre el CRM y el tunel de webhooks (WhatsApp / Messenger).
REM  Para que arranque solo al prender la PC: crea un acceso
REM  directo a este archivo en  shell:startup  (Win+R).
REM ============================================================

REM Tu dominio fijo gratuito de ngrok (ej. apm-inox.ngrok-free.app).
REM Dejalo vacio si todavia no configuras WhatsApp.
set NGROK_DOMAIN=

REM Debe coincidir con WEBHOOK_PORT en tu .env
set WEBHOOK_PORT=3100

cd /d "%~dp0"

start "MetaCloser CRM" cmd /k npm run dev

if "%NGROK_DOMAIN%"=="" (
  echo [Aviso] NGROK_DOMAIN vacio: el tunel de WhatsApp no se inicio. Ver LOCAL.md
) else (
  start "Tunel webhooks Meta" cmd /k ngrok http %WEBHOOK_PORT% --url=%NGROK_DOMAIN%
)

timeout /t 8 /nobreak >nul
start "" http://localhost:3000
