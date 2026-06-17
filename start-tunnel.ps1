# ============================================================
#  start-tunnel.ps1
#  실행 방법: 프로젝트 폴더에서  .\start-tunnel.ps1
#  역할:
#    1) cloudflared Quick Tunnel 시작 → 새 URL 획득
#    2) sketch.js BACKEND_URL 자동 교체
#    3) git commit + push (GitHub Pages 즉시 반영)
#
#  사전 준비: winget install Cloudflare.cloudflared
# ============================================================

$sketchJs = "$PSScriptRoot\sketch.js"

# cloudflared 경로 탐색
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $cf) {
    $cf = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "cloudflared.exe" -ErrorAction SilentlyContinue |
          Select-Object -First 1 -ExpandProperty FullName
}
if (-not $cf) {
    Write-Host "[오류] cloudflared를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host "  winget install Cloudflare.cloudflared 를 실행하세요." -ForegroundColor Yellow
    exit 1
}

Write-Host "`n[1/3] Cloudflare Tunnel 시작 중 (포트 5000)..." -ForegroundColor Cyan

$job = Start-Job -ScriptBlock { param($exe) & $exe tunnel --url http://localhost:5000 2>&1 } -ArgumentList $cf

# URL이 나올 때까지 대기 (최대 30초)
$url = $null
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 800
    $output = Receive-Job $job -Keep
    $line = $output | Where-Object { $_ -match 'https://[a-z0-9-]+\.trycloudflare\.com' } | Select-Object -Last 1
    if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
        $url = $Matches[0]
        break
    }
}

if (-not $url) {
    Write-Host "[오류] URL을 가져오지 못했습니다." -ForegroundColor Red
    Stop-Job $job; Remove-Job $job
    exit 1
}

Write-Host "[1/3] 터널 URL: $url" -ForegroundColor Green

# sketch.js BACKEND_URL 교체
Write-Host "[2/3] sketch.js 업데이트 중..." -ForegroundColor Cyan
$content = Get-Content $sketchJs -Raw -Encoding UTF8
$content = $content -replace "const BACKEND_URL = 'https://[^']+'", "const BACKEND_URL = '$url'"
Set-Content $sketchJs -Value $content -Encoding UTF8 -NoNewline
Write-Host "[2/3] 완료" -ForegroundColor Green

# git commit + push
Write-Host "[3/3] GitHub에 푸시 중..." -ForegroundColor Cyan
git -C $PSScriptRoot add sketch.js
git -C $PSScriptRoot commit -m "Update cloudflare tunnel URL"
git -C $PSScriptRoot push

Write-Host "`n완료! GitHub Pages 반영까지 약 1~2분 소요." -ForegroundColor Green
Write-Host "터널 URL: $url" -ForegroundColor Yellow
Write-Host "(터널 종료 시 이 창을 닫거나 Ctrl+C 누르세요)" -ForegroundColor DarkGray

# 터널이 살아있는 동안 대기
Wait-Job $job
