@echo off
cd /d "%~dp0"
start "" http://localhost:8770
node tools/serve.mjs
pause
