param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\cvmCode",
  [string]$BinDir = "$env:USERPROFILE\.cvmcode\bin",
  [switch]$SkipPathUpdate
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Ensure-UserPathContains([string]$PathEntry) {
  $current = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($current) {
    $parts = $current.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries)
  }

  $normalized = $parts | ForEach-Object { $_.TrimEnd("\") }
  if ($normalized -contains $PathEntry.TrimEnd("\")) {
    return
  }

  $next = @($parts + $PathEntry) -join ";"
  [Environment]::SetEnvironmentVariable("Path", $next, "User")
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

Write-Step "Checking prerequisites"
Require-Command "node"

$packageManager = $null
if (Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue) {
  $packageManager = "pnpm.cmd"
} elseif (Get-Command "npm.cmd" -ErrorAction SilentlyContinue) {
  $packageManager = "npm.cmd"
} else {
  throw "Neither pnpm.cmd nor npm.cmd is available."
}

Push-Location $repoRoot
try {
  if (-not (Test-Path "node_modules")) {
    Write-Step "Installing repository dependencies"
    if ($packageManager -eq "pnpm.cmd") {
      & pnpm.cmd install
    } else {
      & npm.cmd install
    }
  }

  Write-Step "Building cvmCode"
  if ($packageManager -eq "pnpm.cmd") {
    & pnpm.cmd build
  } else {
    & npm.cmd run build
  }
} finally {
  Pop-Location
}

Write-Step "Preparing install directory"
if (Test-Path $InstallRoot) {
  Remove-Item $InstallRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null

Copy-Item (Join-Path $repoRoot "package.json") $InstallRoot -Force
Copy-Item (Join-Path $repoRoot "README.md") $InstallRoot -Force
Copy-Item (Join-Path $repoRoot "dist") $InstallRoot -Recurse -Force

Write-Step "Installing runtime dependencies"
Push-Location $InstallRoot
try {
  & npm.cmd install --omit=dev --ignore-scripts
} finally {
  Pop-Location
}

Write-Step "Creating command shims"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$launcher = @"
@echo off
node "$InstallRoot\dist\cli\index.js" %*
"@

Set-Content -Path (Join-Path $BinDir "cvmcode.cmd") -Value $launcher -Encoding ASCII
Set-Content -Path (Join-Path $BinDir "cvmCode.cmd") -Value $launcher -Encoding ASCII

if (-not $SkipPathUpdate) {
  Write-Step "Adding bin directory to user PATH"
  Ensure-UserPathContains $BinDir
}

Write-Host ""
Write-Host "cvmCode installed." -ForegroundColor Green
Write-Host "Install root: $InstallRoot"
Write-Host "Bin dir:      $BinDir"
Write-Host ""
Write-Host "Open a new terminal, then run:"
Write-Host "  cvmCode"
