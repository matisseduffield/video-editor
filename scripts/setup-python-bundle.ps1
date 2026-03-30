# setup-python-bundle.ps1
# Downloads Python embeddable distribution and installs faster-whisper + edge-tts
# Result: src-tauri/binaries/python/ directory ready for Tauri bundling

$ErrorActionPreference = "Stop"

$PythonVersion = "3.12.7"
$PythonZipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$TargetDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") "src-tauri") (Join-Path "binaries" "python")
$TempZip = Join-Path $env:TEMP "python-embed.zip"
$TempGetPip = Join-Path $env:TEMP "get-pip.py"

Write-Host "=== Python Embeddable Bundle Setup ===" -ForegroundColor Cyan
Write-Host "Python version: $PythonVersion"
Write-Host "Target: $TargetDir"

# Clean existing
if (Test-Path $TargetDir) {
    Write-Host "Removing old python bundle..."
    Remove-Item -Recurse -Force $TargetDir
}

# Download Python embeddable
Write-Host "Downloading Python embeddable ($PythonVersion)..."
Invoke-WebRequest -Uri $PythonZipUrl -OutFile $TempZip -UseBasicParsing
Write-Host "Downloaded: $((Get-Item $TempZip).Length / 1MB) MB"

# Extract
Write-Host "Extracting to $TargetDir..."
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
Expand-Archive -Path $TempZip -DestinationPath $TargetDir -Force
Remove-Item $TempZip

# Enable import site in ._pth file (required for pip/packages to work)
$PthFile = Get-ChildItem -Path $TargetDir -Filter "python*._pth" | Select-Object -First 1
if ($PthFile) {
    Write-Host "Enabling site-packages in $($PthFile.Name)..."
    $content = Get-Content $PthFile.FullName
    $content = $content -replace "^#import site", "import site"
    # Also add Lib\site-packages explicitly
    $content += "Lib\site-packages"
    Set-Content $PthFile.FullName $content
} else {
    Write-Error "Could not find python*._pth file!"
}

$PythonExe = Join-Path $TargetDir "python.exe"

# Download and install pip
Write-Host "Installing pip..."
Invoke-WebRequest -Uri $GetPipUrl -OutFile $TempGetPip -UseBasicParsing
& $PythonExe $TempGetPip --no-warn-script-location 2>&1 | Write-Host
Remove-Item $TempGetPip

# Install required packages
Write-Host "Installing faster-whisper and edge-tts..."
& $PythonExe -m pip install --no-warn-script-location faster-whisper edge-tts 2>&1 | Write-Host

# Verify installations
Write-Host "`nVerifying installations..."
& $PythonExe -c "import faster_whisper; print(f'faster-whisper {faster_whisper.__version__}')" 2>&1
& $PythonExe -c "import edge_tts; print('edge-tts OK')" 2>&1

# Clean up to reduce bundle size
Write-Host "Cleaning up to reduce size..."
$SitePackages = Join-Path (Join-Path $TargetDir "Lib") "site-packages"

# Remove pip cache
$PipCache = Join-Path $SitePackages "pip"
if (Test-Path $PipCache) { Remove-Item -Recurse -Force $PipCache }

# Remove setuptools if present
$Setuptools = Join-Path $SitePackages "setuptools"
if (Test-Path $Setuptools) { Remove-Item -Recurse -Force $Setuptools }

# Remove __pycache__ directories recursively
Get-ChildItem -Path $TargetDir -Directory -Recurse -Filter "__pycache__" |
    Remove-Item -Recurse -Force

# Remove .dist-info directories (keep only packages)
# Actually keep dist-info as some packages need them for importlib.metadata

# Remove pip executables from Scripts (we only need python.exe)
$ScriptsDir = Join-Path $TargetDir "Scripts"
if (Test-Path $ScriptsDir) {
    Get-ChildItem $ScriptsDir -Filter "pip*" | Remove-Item -Force
}

# Calculate final size
$Size = (Get-ChildItem -Path $TargetDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "Bundle size: $([math]::Round($Size, 1)) MB"
Write-Host "Python path: $PythonExe"
Write-Host "`nRun 'npm run tauri build' to create the installer."
