$ErrorActionPreference = "Stop"

$config = Join-Path $env:USERPROFILE ".config\opencode"
$plugin = Join-Path $config "plugins\paste-image.js"
$command = Join-Path $config "commands\paste-image.md"

if (Test-Path $plugin) {
  Remove-Item -Force $plugin
}

if (Test-Path $command) {
  Remove-Item -Force $command
}

Write-Host "Removed opencode-clipboard-ocr plugin and command from $config"
