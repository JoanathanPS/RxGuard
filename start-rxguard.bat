@echo off
setlocal
REM ============================================================================
REM  RxGuard one-click launcher (Windows) - Phase 2+ architecture.
REM  Starts the Next.js app in `web/` (cloud Supabase + Edge Functions are
REM  already live - no local backend needed) and opens the browser.
REM ============================================================================

cd /d "%~dp0"

REM ---- 1. Node present? -------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found on PATH. Install it from:
    echo         https://nodejs.org/
    pause
    exit /b 1
)

REM ---- 2. Env files present? --------------------------------------------------
if not exist "web\.env.local" (
    echo [WARNING] web\.env.local is missing.
    echo            Copy web\.env.example to web\.env.local and fill in:
    echo              NEXT_PUBLIC_SUPABASE_URL      = https://rfemgzedvjpwaeivfjhn.supabase.co
    echo              NEXT_PUBLIC_SUPABASE_ANON_KEY = your anon key
    echo              SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY = server-side eval creds
    echo.
)
if not exist ".env" (
    echo [WARNING] .env is missing at the repo root ^(Management API token for
    echo            supabase scripts^). The app still runs without it.
    echo.
)

REM ---- 3. Dependencies --------------------------------------------------------
echo [1/3] Checking web dependencies...
if not exist "web\node_modules" (
    echo        Installing web dependencies ^(first run only^)...
    pushd web
    call npm install
    popd
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

REM ---- 4. Dev server ----------------------------------------------------------
echo [2/3] Starting Next.js dev server (new window)...
start "RxGuard Dev Server" cmd /k "cd /d %~dp0web && npm run dev"

REM ---- 5. Browser + done ------------------------------------------------------
echo [3/3] Waiting for the dev server, then opening the browser...
timeout /t 8 /nobreak >nul
start "" http://localhost:3000

echo.
echo ============================================================================
echo  RxGuard is up!
echo    Web UI:    http://localhost:3000
echo    Login:     dev.clinician@rxguard.dev / DevTest123!
echo    Eval:      http://localhost:3000/eval  (researcher/admin only)
echo.
echo  Useful commands:
echo    cd web ^&^& npm run dev        - start the dev server
echo    cd web ^&^& npm run lint       - lint
echo    cd web ^&^& npm run build      - production build
echo ============================================================================
echo.
pause
endlocal