@echo off
REM One-click local launch: backend (FastAPI :8000) + dashboard (Vite :5173)
cd /d %~dp0

if not exist .venv\Scripts\python.exe (
  echo [setup] Creating Python virtual environment in .venv ...
  python -m venv .venv || goto :error
  .venv\Scripts\python -m pip install -r backend\requirements.txt || goto :error
)
if not exist frontend\node_modules (
  echo [setup] Installing frontend packages ...
  pushd frontend
  call npm install || goto :error
  popd
)

start "Dairy Twin API :8000" cmd /k "cd /d %~dp0backend && ..\.venv\Scripts\python -m uvicorn main:app --port 8000"
start "Dairy Twin UI :5173" cmd /k "cd /d %~dp0frontend && npm run dev"
echo Waiting for servers to start ...
timeout /t 8 >nul
start "" http://localhost:5173
exit /b 0

:error
echo Setup failed - see the message above.
exit /b 1
