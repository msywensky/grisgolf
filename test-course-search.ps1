#!/usr/bin/env pwsh
# Hits GolfCourseAPI's /v1/search directly with the key from backend/.env,
# bypassing our backend, to tell apart "our bug" from "their API is flaky".
#
# Usage: ./test-course-search.ps1 "Pebble Beach"

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Query,

    [switch]$Raw
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $root "backend/.env"

if (-not (Test-Path $envPath)) {
    throw "backend/.env not found — copy backend/.env.example and fill in GOLF_COURSE_API_KEY."
}

$line = Get-Content $envPath | Where-Object { $_ -match "^GOLF_COURSE_API_KEY=" }
if (-not $line) {
    throw "GOLF_COURSE_API_KEY not set in backend/.env."
}
$key = ($line -split "=", 2)[1].Trim()

$uri = "https://api.golfcourseapi.com/v1/search?search_query=$([uri]::EscapeDataString($Query))"
$response = Invoke-WebRequest -Uri $uri -Headers @{ Authorization = "Bearer $key" } -SkipHttpErrorCheck

Write-Host "HTTP $($response.StatusCode)" -ForegroundColor Cyan
$rateLimitHeaders = $response.Headers.GetEnumerator() | Where-Object { $_.Key -match "RateLimit" }
foreach ($h in $rateLimitHeaders) {
    Write-Host "$($h.Key): $($h.Value)" -ForegroundColor Cyan
}

$parsed = $response.Content | ConvertFrom-Json

if ($Raw) {
    $parsed | ConvertTo-Json -Depth 10
    return
}

$courses = @($parsed.courses)
Write-Host "$($courses.Count) course(s) returned`n" -ForegroundColor Cyan

$courses | ForEach-Object {
    [pscustomobject]@{
        id      = $_.id
        club    = $_.club_name
        course  = $_.course_name
        city    = $_.location.city
        state   = $_.location.state
        country = $_.location.country
    }
} | Format-Table -AutoSize

Write-Host "(pass -Raw for the full JSON payload including tees/holes)" -ForegroundColor DarkGray
