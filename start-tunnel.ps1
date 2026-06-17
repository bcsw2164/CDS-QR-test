# ============================================================
#  start-tunnel.ps1
#  실행 방법: 프로젝트 폴더에서  .\start-tunnel.ps1
#  역할:
#    1) localtunnel 시작 → 새 URL 획득
#    2) sketch.js BACKEND_URL 자동 교체
#    3) git commit + push (GitHub Pages 즉시 반영)
# ============================================================

$logFile   = "$env:TEMP\lt_output.txt"
$sketchJs  = "$PSScriptRoot\sketch.js"

# 이전 로그 초기화
if (Test-Path $logFile) { Remove-Item $logFile }

# localtunnel 별도 창에서 실행
Write-Host "`n[1/3] localtunnel 시작 중..." -ForegroundColor Cyan
Start-Process -FilePath "powershell.exe" `
  -ArgumentList "-NoProfile -Command `"npx localtunnel --port 5000 2>&1 | Tee-Object -FilePath '$logFile'`"" `
  -WindowStyle Normal

# URL 나올 때까지 대기 (최대 15초)
$url = $null
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $logFile) {
        $line = Get-Content $logFile | Where-Object { $_ -match "your url is: (https://\S+)" }
        if ($line -match "your url is: (https://\S+)") {
            $url = $Matches[1]
            break
        }
    }
}

if (-not $url) {
    Write-Host "[오류] URL을 가져오지 못했습니다. localtunnel 창을 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] 터널 URL: $url" -ForegroundColor Green

# sketch.js의 BACKEND_URL 교체
Write-Host "[2/3] sketch.js 업데이트 중..." -ForegroundColor Cyan
$content = Get-Content $sketchJs -Raw -Encoding UTF8
$content = $content -replace "const BACKEND_URL = 'https://[^']+'", "const BACKEND_URL = '$url'"
Set-Content $sketchJs -Value $content -Encoding UTF8 -NoNewline
Write-Host "[2/3] sketch.js 업데이트 완료" -ForegroundColor Green

# git commit + push
Write-Host "[3/3] GitHub에 푸시 중..." -ForegroundColor Cyan
git -C $PSScriptRoot add sketch.js
git -C $PSScriptRoot commit -m "Update tunnel URL to $url"
git -C $PSScriptRoot push

Write-Host "`n완료! 폰에서 GitHub Pages 새로고침 후 테스트하세요." -ForegroundColor Green
Write-Host "터널 URL: $url" -ForegroundColor Yellow
