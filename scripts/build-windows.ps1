[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$ForceInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Command([string]$Name, [string]$InstallHint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Không tìm thấy '$Name'. $InstallHint"
    }
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Lệnh thất bại với mã ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
    }
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

Write-Host "Digital QC - Windows build" -ForegroundColor Green
Write-Host "Project: $ProjectRoot"

Assert-Command "node" "Cài Node.js LTS rồi mở lại PowerShell."
Assert-Command "npm.cmd" "Cài Node.js LTS rồi mở lại PowerShell."
Assert-Command "cargo" "Cài Rust toolchain bằng rustup rồi mở lại PowerShell."
Assert-Command "rustc" "Cài Rust toolchain bằng rustup rồi mở lại PowerShell."

Write-Step "Kiểm tra phiên bản công cụ"
node --version
npm.cmd --version
rustc --version
cargo --version

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "package.json"))) {
    throw "Không tìm thấy package.json trong $ProjectRoot"
}

if ($ForceInstall -or -not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules"))) {
    Write-Step "Cài dependency bằng npm ci"
    Invoke-Checked "npm.cmd" @("ci")
}
else {
    Write-Host "Đã có node_modules, bỏ qua npm ci. Dùng -ForceInstall nếu muốn cài lại." -ForegroundColor DarkGray
}

Write-Step "Kiểm tra TypeScript"
Invoke-Checked "npm.cmd" @("run", "build")

if (-not $SkipTests) {
    Write-Step "Chạy test"
    Invoke-Checked "npm.cmd" @("test", "--", "--run")
}
else {
    Write-Host "Đã bỏ qua test vì có tham số -SkipTests." -ForegroundColor Yellow
}

Write-Step "Build giao diện và ứng dụng Tauri"
Invoke-Checked "npm.cmd" @("run", "tauri", "build")

$ExePath = Join-Path $ProjectRoot "src-tauri\target\release\digital-qc.exe"
if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Build hoàn tất nhưng không tìm thấy file exe: $ExePath"
}

$Exe = Get-Item -LiteralPath $ExePath
Write-Host "`nBUILD SUCCESS" -ForegroundColor Green
Write-Host "EXE: $($Exe.FullName)"
Write-Host "SIZE: $([math]::Round($Exe.Length / 1MB, 2)) MB"
