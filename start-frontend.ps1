#!/usr/bin/env pwsh
# Starts the SvelteKit frontend dev server (Vite, port 5173).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $root "frontend")

if (-not (Test-Path ".env")) {
    Write-Warning "frontend/.env not found — copy .env.example and fill in Supabase/API config before this will work."
}

if (-not (Test-Path "node_modules")) {
    Write-Host "No node_modules found — running npm install..."
    npm install
}

npm run dev
