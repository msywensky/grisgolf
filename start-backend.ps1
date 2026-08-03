#!/usr/bin/env pwsh
# Starts the FastAPI backend dev server (uvicorn, port 8000).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $root "backend")

if (-not (Test-Path ".venv")) {
    Write-Host "No .venv found — creating one..."
    python -m venv .venv
}

$activate = Join-Path ".venv" "Scripts\Activate.ps1"
if (-not (Test-Path $activate)) {
    throw "Could not find venv activation script at $activate"
}
. $activate

if (-not (Test-Path ".env")) {
    Write-Warning "backend/.env not found — copy .env.example and fill in Supabase config before this will work."
}

pip install -q -r requirements.txt

uvicorn app.main:app --reload --port 8000
