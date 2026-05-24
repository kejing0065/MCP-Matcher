@echo off
title Global Treasury Agent - Optimized Starter
cls

echo =====================================================================
echo           GLOBAL TREASURY AGENT - OPTIMIZED STACK LAUNCHER
echo =====================================================================
echo.
echo This script starts both the FastAPI backend and Next.js frontend
echo with configurations optimized to prevent memory spikes and crashes.
echo.
echo Choose your launch mode:
echo [1] Development Mode (Runs "npm run dev", slower startup, enables live reloading)
echo [2] Production Mode (Pre-builds and runs "npm run start", extremely low RAM, recommended)
echo [3] Exit
echo.

set /p choice="Enter choice (1, 2, or 3): "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto exit
echo Invalid choice. Please try again.
pause
goto start

:dev
echo.
echo === STARTING IN DEVELOPMENT MODE ===
echo.
start "FastAPI Backend" cmd /c "echo Starting Backend... && cd backend && call venv\Scripts\activate && uvicorn main:app --reload --port 8000"
start "Next.js Dev Frontend" cmd /c "echo Starting Frontend... && cd frontend && npm run dev"
echo.
echo FastAPI Backend is running at: http://localhost:8000
echo Next.js Frontend is running at: http://localhost:3000
echo.
goto end

:prod
echo.
echo === STARTING IN PRODUCTION MODE (OPTIMIZED) ===
echo.
echo [1/3] Starting FastAPI Backend in background...
start "FastAPI Backend" cmd /c "echo Starting Backend... && cd backend && call venv\Scripts\activate && uvicorn main:app --reload --port 8000"

echo [2/3] Building Next.js production bundle...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo Error: Next.js build failed. Unable to run in production mode.
    cd ..
    pause
    goto exit
)

echo [3/3] Starting Next.js Production server...
start "Next.js Prod Frontend" cmd /c "echo Starting Production Frontend... && cd frontend && npm run start"
cd ..

echo.
echo FastAPI Backend is running at: http://localhost:8000
echo Next.js Frontend is running at: http://localhost:3000
echo.
goto end

:end
echo Stack launched! Feel free to close this window. Keep the others open.
pause
exit

:exit
exit
