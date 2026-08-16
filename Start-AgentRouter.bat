@echo off
title AgentRouter Proxy
cd /d "%USERPROFILE%\agentrouter-proxy"
".\venv\Scripts\python.exe" proxy.py
pause
