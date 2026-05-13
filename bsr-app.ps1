# BSR App launcher — starts the local server if needed and opens it as an app window
# Run silently on Windows startup.

$ErrorActionPreference = 'SilentlyContinue'
$serverDir = 'C:\Users\avraham\meatfish-app'
$port = 3031
$url  = "http://localhost:$port/"

# 1. Ensure node server is running on port 3031
$listening = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).Count
if ($listening -eq 0) {
  Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $serverDir -WindowStyle Hidden
  # Wait until port is up (max 15s)
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if ((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).Count -gt 0) { break }
  }
}

# 2. Find Chrome / Edge — open in app mode so it looks like a real app (no address bar, own icon)
$chrome = $null
foreach ($p in @(
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)) {
  if (Test-Path $p) { $chrome = $p; break }
}

if ($chrome) {
  # --app mode: own window, no tabs, no address bar
  $profileDir = "$env:LOCALAPPDATA\BSR-App\BrowserProfile"
  if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }
  $args = @(
    "--app=$url",
    "--user-data-dir=$profileDir",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,820",
    "--disable-features=Translate"
  )
  Start-Process -FilePath $chrome -ArgumentList $args
} else {
  # Fallback — open default browser
  Start-Process $url
}
