$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Join-Path $env:USERPROFILE ".config\opencode"
$plugins = Join-Path $config "plugins"
$commands = Join-Path $config "commands"
$packageFile = Join-Path $config "package.json"

New-Item -ItemType Directory -Force $plugins | Out-Null
New-Item -ItemType Directory -Force $commands | Out-Null

Copy-Item -Force (Join-Path $repo "plugins\paste-image.js") (Join-Path $plugins "paste-image.js")
Copy-Item -Force (Join-Path $repo "commands\paste-image.md") (Join-Path $commands "paste-image.md")

if (Test-Path $packageFile) {
  $package = Get-Content $packageFile -Raw -Encoding UTF8 | ConvertFrom-Json
} else {
  $package = [pscustomobject]@{}
}

if ($package.PSObject.Properties.Name -contains "type") {
  $package.type = "module"
} else {
  $package | Add-Member -MemberType NoteProperty -Name type -Value "module"
}

$package | ConvertTo-Json -Depth 20 | Set-Content -Path $packageFile -Encoding UTF8

Write-Host "Installed opencode-clipboard-ocr to $config"
Write-Host "Restart OpenCode, copy a screenshot, then run /paste-image"
