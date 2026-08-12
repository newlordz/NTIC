@echo off
echo Starting NTIC WhatsApp Gateway Service...
cd /d "%~dp0whatsapp-gateway"
node server.js
