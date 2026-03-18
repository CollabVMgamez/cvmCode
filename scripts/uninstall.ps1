param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\cvmCode",
  [string]$BinDir = "$env:USERPROFILE\.cvmcode\bin"
)

$ErrorActionPreference = "Stop"

if (Test-Path $InstallRoot) {
  Remove-Item $InstallRoot -Recurse -Force
}

foreach ($name in @("cvmcode.cmd", "cvmCode.cmd")) {
  $target = Join-Path $BinDir $name
  if (Test-Path $target) {
    Remove-Item $target -Force
  }
}

$current = [Environment]::GetEnvironmentVariable("Path", "User")
if ($current) {
  $parts = $current.Split(";", [System.StringSplitOptions]::RemoveEmptyEntries) |
    Where-Object { $_.TrimEnd("\") -ne $BinDir.TrimEnd("\") }
  [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")
}

Write-Host "cvmCode uninstalled."
