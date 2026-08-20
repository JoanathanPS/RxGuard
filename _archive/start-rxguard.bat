@echo off
setlocal
REM ============================================================================
REM  RxGuard one-click launcher (Windows).
REM  Builds/starts the backend stack (Postgres + Redis + 4 microservices),
REM  starts the Vite frontend dev server, and opens the browser.
REM ============================================================================

cd /d "%~dp0"

REM ---- 1. Docker present? ----------------------------------------------------
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker was not found on PATH. Install Docker Desktop:
    echo         https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

REM ---- 2. Docker daemon running? --------------------------------------------
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is installed but not running.
    echo         Start Docker Desktop and wait until the whale icon is steady, then re-run.
    pause
    exit /b 1
)

REM ---- 3. Bring up the backend stack ----------------------------------------
echo [1/3] Starting backend services (Postgres, Redis, user/patient/prescription/interaction)...
if exist ".env" (
    docker compose --env-file .env -f infra\docker-compose.yml up -d --build
) else (
    docker compose -f infra\docker-compose.yml up -d --build
)
if errorlevel 1 (
    echo [ERROR] docker compose failed. Scroll up for details.
    pause
    exit /b 1
)

REM ---- 4. Frontend ----------------------------------------------------------
echo [2/3] Preparing frontend...
cd frontend
if not exist "node_modules" (
    echo        Installing frontend dependencies (first run only)...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)
echo        Starting Vite dev server in a new window...
start "RxGuard Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

REM ---- 5. Browser + done ----------------------------------------------------
echo [3/3] Waiting for services, then opening the browser...
timeout /t 6 /nobreak >nul
start "" http://localhost:5173

echo.
echo ============================================================================
echo  RxGuard is up!
echo    Web UI:      http://localhost:5173
echo    API health:  http://localhost:8001/health
echo    Login:       admin@rxguard.dev / admin12345
echo.
echo  Useful commands:
echo    docker compose -f infra\docker-compose.yml ps      - container status
echo    docker compose -f infra\docker-compose.yml logs -f - stream logs
echo    docker compose -f infra\docker-compose.yml down    - stop everything
echo ============================================================================
echo.
pause
endlocal