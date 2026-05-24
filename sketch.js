// ═══════════════════════════════════════════════════
//  QR 오차 인터랙션 — sketch.js
// ═══════════════════════════════════════════════════

const CANVAS_W = 640;
const CANVAS_H = 480;
const BOX_PAD = 90; // 인식 박스 여백(px)
const MAX_PARTICLES = 400; // 최대 파티클 수
const STABLE_FRAMES = 25; // 스냅샷 확정까지 필요한 안정 프레임 수

// ── 전역 상태 ──────────────────────────────────────
let video, canvas, ctx;
let offCanvas, offCtx; // 픽셀 분석용 오프스크린

let originalBitMatrix = null;
let moduleCount = 0;

let particles = []; // 현재 파티클 배열
let lastErrorScore = -1; // 파티클 재생성 판단용

// ── 스냅샷 스테이트 머신 ──────────────────────────
let scanState = 'waiting'; // 'waiting' | 'stabilizing' | 'locked'
let stableCount = 0;
let lockedResult = null;

let state = {
  detected: false,
  errorScore: 0,
  blackCellErrors: 0,
  whiteCellErrors: 0,
  particleCount: 0,
};

// ═══════════════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════════════
async function init() {
  video = document.getElementById('video');
  canvas = document.getElementById('mainCanvas');
  ctx = canvas.getContext('2d');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  // 픽셀 분석 전용 오프스크린 캔버스
  offCanvas = document.createElement('canvas');
  offCanvas.width = CANVAS_W;
  offCanvas.height = CANVAS_H;
  offCtx = offCanvas.getContext('2d');

  // ── 카메라 연결 ──
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: CANVAS_W, height: CANVAS_H },
    });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    alert(
      '카메라 접근 권한이 필요합니다.\n브라우저 주소창에서 카메라를 허용해 주세요.',
    );
    return;
  }

  // ── 원본 QR 이미지 분석 ──
  const img = document.getElementById('originalQRImg');
  const doLoad = () => prepareOriginalQR(img);
  if (img.complete && img.naturalWidth > 0) doLoad();
  else img.onload = doLoad;

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════
//  원본 QR → BitMatrix 추출
// ═══════════════════════════════════════════════════
function prepareOriginalQR(img) {
  // 원본 이미지를 임시 캔버스에 그려서 픽셀 데이터 획득
  const tmp = document.createElement('canvas');
  tmp.width = img.naturalWidth;
  tmp.height = img.naturalHeight;
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.drawImage(img, 0, 0);

  const imgData = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
  const code = jsQR(imgData.data, imgData.width, imgData.height);

  if (!code) {
    console.warn('⚠️ 원본 QR 인식 실패 — original.png를 확인하세요');
    return;
  }

  // 모듈 수 자동 감지 후 BitMatrix 생성
  moduleCount = detectModuleCount(imgData, code.location);
  originalBitMatrix = buildBitMatrix(imgData, code.location, moduleCount);

  // 모듈 정보 UI 업데이트
  document.getElementById('d-module').textContent =
    `MODULE  ${moduleCount} × ${moduleCount}`;

  console.log(`✅ 원본 QR 분석 완료 | 모듈: ${moduleCount}×${moduleCount}`);
}

// ── 모듈 수 자동 감지 ──────────────────────────────
// QR 버전마다 모듈 수가 다름 (v1=21, v2=25, v3=29, …)
// 각 후보값으로 샘플링 → 가장 "선명한"(0 또는 255에 가까운) 결과를 선택
function detectModuleCount(imgData, loc) {
  const candidates = [21, 25, 29, 33, 37, 41];
  let best = 29,
    bestScore = -1;

  for (const mc of candidates) {
    let clarity = 0,
      n = 0;
    // 전체를 다 돌기엔 느릴 수 있어서 일부만 샘플링
    const step = Math.max(1, Math.floor(mc / 7));
    for (let r = 0; r < mc; r += step) {
      for (let c = 0; c < mc; c += step) {
        const pt = bilinearCell(loc, r, c, mc);
        const b = sampleBrightness(imgData, pt.x, pt.y);
        // 128(회색)에서 멀수록 명확한 셀 → 올바른 모듈 수
        clarity += Math.abs(b - 128) / 128;
        n++;
      }
    }
    const score = n > 0 ? clarity / n : 0;
    if (score > bestScore) {
      bestScore = score;
      best = mc;
    }
  }
  return best;
}

// ── BitMatrix 생성 ─────────────────────────────────
// 원본 QR 각 셀의 기대값(1=검정, 0=흰색) 2D 배열
function buildBitMatrix(imgData, loc, mc) {
  const matrix = [];
  for (let r = 0; r < mc; r++) {
    matrix[r] = [];
    for (let c = 0; c < mc; c++) {
      const pt = bilinearCell(loc, r, c, mc);
      const bright = sampleBrightness(imgData, pt.x, pt.y);
      matrix[r][c] = bright < 128 ? 1 : 0; // 1=검정, 0=흰색
    }
  }
  return matrix;
}

// ═══════════════════════════════════════════════════
//  대비 강화 전처리
//  전체 픽셀 밝기 기준 min/max 정규화 → 0~255 스트레칭
//  볼펜처럼 연한 잉크로 그려진 QR 인식률 개선용
// ═══════════════════════════════════════════════════
function enhanceContrast(imgData) {
  const src = imgData.data;
  const dst = new Uint8ClampedArray(src.length);

  // 밝기(R+G+B 평균) 기준 min/max 탐색
  let minB = 255,
    maxB = 0;
  for (let i = 0; i < src.length; i += 4) {
    const b = (src[i] + src[i + 1] + src[i + 2]) / 3;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  const range = maxB - minB || 1;
  const scale = 255 / range;

  for (let i = 0; i < src.length; i += 4) {
    dst[i] = Math.min(255, Math.round((src[i] - minB) * scale));
    dst[i + 1] = Math.min(255, Math.round((src[i + 1] - minB) * scale));
    dst[i + 2] = Math.min(255, Math.round((src[i + 2] - minB) * scale));
    dst[i + 3] = src[i + 3]; // alpha 유지
  }

  return new ImageData(dst, imgData.width, imgData.height);
}

// ═══════════════════════════════════════════════════
//  메인 루프
// ═══════════════════════════════════════════════════
function loop() {
  if (video.readyState >= video.HAVE_ENOUGH_DATA) {
    // 카메라 → 오프스크린(분석용)
    offCtx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
    const rawImgData = offCtx.getImageData(0, 0, CANVAS_W, CANVAS_H);

    // 카메라 화면 → 메인 캔버스 (원본 영상 그대로 표시)
    ctx.drawImage(offCanvas, 0, 0);

    // 인식 박스 좌표
    const bx = BOX_PAD,
      by = BOX_PAD;
    const bw = CANVAS_W - BOX_PAD * 2;
    const bh = CANVAS_H - BOX_PAD * 2;

    // ── 대비 강화 → jsQR 전처리 ──
    const enhancedData = enhanceContrast(rawImgData);

    // jsQR 실행 (대비 강화 데이터 사용, 반전 양방향 시도)
    const code = jsQR(enhancedData.data, CANVAS_W, CANVAS_H, {
      inversionAttempts: 'attemptBoth',
    });

    // QR 중심이 인식 박스 안에 있는지 확인
    let inBox = false;
    if (code) {
      const cx =
        (code.location.topLeftCorner.x + code.location.bottomRightCorner.x) / 2;
      const cy =
        (code.location.topLeftCorner.y + code.location.bottomRightCorner.y) / 2;
      inBox = cx > bx && cx < bx + bw && cy > by && cy < by + bh;
    }

    // ── 스냅샷 스테이트 머신 ──────────────────────

    if (scanState === 'waiting') {
      // QR 감지 시 측정 시작
      if (code && inBox) {
        scanState = 'stabilizing';
        stableCount = 1;
      }
      state.detected = false;
    } else if (scanState === 'stabilizing') {
      if (code && inBox) {
        stableCount++;

        if (stableCount >= STABLE_FRAMES) {
          if (originalBitMatrix) {
            // 확정 프레임: analyzeQR 1회 실행 → locked
            lockedResult = analyzeQR(rawImgData, code.location);
            state = { ...state, ...lockedResult, detected: true };
            respawnParticles(lockedResult.errorScore);
            lastErrorScore = lockedResult.errorScore;
            scanState = 'locked';
            drawQRBorder(code.location, '#c8ff00');
          } else {
            // 원본 BitMatrix 아직 미준비 → 대기로 복귀
            scanState = 'waiting';
            stableCount = 0;
            state.detected = false;
          }
        } else {
          // 아직 측정 중 — 반투명 윤곽선만 표시
          state.detected = false;
          drawQRBorder(code.location, 'rgba(200,255,0,0.45)');
        }
      } else {
        // QR 사라짐 → 대기로 리셋
        scanState = 'waiting';
        stableCount = 0;
        state.detected = false;
      }
    } else if (scanState === 'locked') {
      if (!code || !inBox) {
        // QR 사라짐 → 완전 리셋
        scanState = 'waiting';
        stableCount = 0;
        lockedResult = null;
        particles = [];
        lastErrorScore = -1;
        state.detected = false;
      } else {
        // 값 고정 유지 (analyzeQR 재실행 없음)
        state = { ...state, ...lockedResult, detected: true };
        drawQRBorder(code.location, '#c8ff00');
      }
    }

    // 파티클 그리기
    drawParticles();

    // 인식 박스 그리기
    drawRecognitionBox(bx, by, bw, bh, scanState, stableCount);

    // UI 업데이트
    updateUI();
  }

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════
//  QR 오차 분석
// ═══════════════════════════════════════════════════
function analyzeQR(imgData, loc) {
  const mc = moduleCount;

  // 카메라 화면 기준 QR 한 셀의 픽셀 크기 추정
  const qrWidth = Math.hypot(
    loc.topRightCorner.x - loc.topLeftCorner.x,
    loc.topRightCorner.y - loc.topLeftCorner.y,
  );
  const cellPx = Math.max(2, qrWidth / mc);
  const radius = Math.max(1, Math.floor(cellPx * 0.35)); // 샘플링 반경

  let totalError = 0;
  let blackCellErrors = 0; // 검정이어야 하는데 덜 채워진 셀
  let whiteCellErrors = 0; // 흰색이어야 하는데 침범된 셀

  for (let r = 0; r < mc; r++) {
    for (let c = 0; c < mc; c++) {
      const pt = bilinearCell(loc, r, c, mc);
      const fillRate = getCellFillRate(imgData, pt.x, pt.y, radius);
      const expected = originalBitMatrix[r][c];

      let cellErr;
      if (expected === 1) {
        // 검정 셀: 채움률이 낮을수록 오차 큼
        cellErr = 1 - fillRate;
        if (cellErr > 0.35) blackCellErrors++;
      } else {
        // 흰색 셀: 채움률이 높을수록 오차 큼 (삐져나온 것)
        cellErr = fillRate;
        if (cellErr > 0.35) whiteCellErrors++;
      }

      totalError += cellErr;
    }
  }

  const errorScore = totalError / (mc * mc); // 0.0 ~ 1.0
  const particleCount = Math.floor(errorScore * MAX_PARTICLES);

  return { errorScore, blackCellErrors, whiteCellErrors, particleCount };
}

// ── 셀 채움률 계산 ─────────────────────────────────
// 셀 중심 주변 radius×radius 픽셀에서 검정 비율을 반환
function getCellFillRate(imgData, cx, cy, radius) {
  let black = 0,
    total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= CANVAS_W || py < 0 || py >= CANVAS_H) continue;
      if (sampleBrightness(imgData, px, py) < 128) black++;
      total++;
    }
  }
  return total > 0 ? black / total : 0;
}

// ═══════════════════════════════════════════════════
//  파티클 시스템
// ═══════════════════════════════════════════════════
function respawnParticles(errorScore) {
  const count = Math.floor(errorScore * MAX_PARTICLES);

  // 기존보다 많아지면 추가, 적어지면 앞에서 자름
  while (particles.length < count) {
    particles.push({
      x: Math.random() * CANVAS_W,
      y: Math.random() * CANVAS_H,
      r: Math.random() * 3.5 + 0.8,
      a: Math.random() * 0.65 + 0.35,
    });
  }
  if (particles.length > count) {
    particles = particles.slice(0, count);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 255, 0, ${p.a})`; // accent 컬러
    ctx.fill();
  }
}

// ═══════════════════════════════════════════════════
//  그리기 유틸
// ═══════════════════════════════════════════════════

// 인식 박스
function drawRecognitionBox(x, y, w, h, scanState, stableCount) {
  const isActive = scanState === 'stabilizing' || scanState === 'locked';
  const color = isActive ? '#c8ff00' : 'rgba(255,255,255,0.35)';
  const cs = 18; // 코너 크기

  // 반투명 배경
  ctx.fillStyle = isActive ? 'rgba(200,255,0,0.04)' : 'rgba(255,255,255,0.02)';
  ctx.fillRect(x, y, w, h);

  // 코너 꺾임선
  ctx.strokeStyle = color;
  ctx.lineWidth = isActive ? 2.5 : 1.5;
  ctx.lineCap = 'square';
  ctx.beginPath();
  // TL
  ctx.moveTo(x, y + cs);
  ctx.lineTo(x, y);
  ctx.lineTo(x + cs, y);
  // TR
  ctx.moveTo(x + w - cs, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + cs);
  // BL
  ctx.moveTo(x, y + h - cs);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + cs, y + h);
  // BR
  ctx.moveTo(x + w - cs, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + h - cs);
  ctx.stroke();

  // CSS scaleX(-1) 역반전 — 텍스트/UI 요소를 정방향으로 표시
  ctx.save();
  ctx.translate(CANVAS_W, 0);
  ctx.scale(-1, 1);

  if (scanState === 'waiting') {
    // ── 대기: 안내 텍스트 ──
    ctx.font = '12px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QR 코드를 이 안에 가져다 대세요', CANVAS_W / 2, CANVAS_H / 2);
  } else if (scanState === 'stabilizing') {
    // ── 측정 중: 텍스트 + 진행 바 ──
    ctx.font = '11px "Space Mono", monospace';
    ctx.fillStyle = 'rgba(200,255,0,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('측정 중...', CANVAS_W / 2, CANVAS_H / 2 - 14);

    // 진행 바
    const barW = w * 0.55;
    const barH = 2;
    const barX = CANVAS_W / 2 - barW / 2;
    const barY = CANVAS_H / 2 + 2;
    const progress = Math.min(stableCount / STABLE_FRAMES, 1);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#c8ff00';
    ctx.fillRect(barX, barY, barW * progress, barH);
  }
  // ── locked: 박스 색만 accent 유지, 텍스트 없음 ──

  ctx.restore();
}

// QR 감지 윤곽선
function drawQRBorder(loc, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
  ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
  ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
  ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
  ctx.closePath();
  ctx.stroke();
}

// ═══════════════════════════════════════════════════
//  유틸: 셀 중심 좌표 (이중선형 보간)
//  4꼭짓점 좌표로 원근 왜곡을 보정해 각 셀 위치 계산
// ═══════════════════════════════════════════════════
function bilinearCell(loc, row, col, mc) {
  const u = (col + 0.5) / mc;
  const v = (row + 0.5) / mc;
  const tl = loc.topLeftCorner,
    tr = loc.topRightCorner;
  const bl = loc.bottomLeftCorner,
    br = loc.bottomRightCorner;
  return {
    x: Math.round(
      tl.x * (1 - u) * (1 - v) +
        tr.x * u * (1 - v) +
        bl.x * (1 - u) * v +
        br.x * u * v,
    ),
    y: Math.round(
      tl.y * (1 - u) * (1 - v) +
        tr.y * u * (1 - v) +
        bl.y * (1 - u) * v +
        br.y * u * v,
    ),
  };
}

// 유틸: 특정 좌표 픽셀 밝기 (R+G+B 평균)
function sampleBrightness(imgData, x, y) {
  x = Math.max(0, Math.min(imgData.width - 1, Math.round(x)));
  y = Math.max(0, Math.min(imgData.height - 1, Math.round(y)));
  const i = (y * imgData.width + x) * 4;
  return (imgData.data[i] + imgData.data[i + 1] + imgData.data[i + 2]) / 3;
}

// ═══════════════════════════════════════════════════
//  UI 업데이트
// ═══════════════════════════════════════════════════
function updateUI() {
  const s = state;

  // 상태 도트 + 텍스트
  const isActive = scanState === 'stabilizing' || scanState === 'locked';
  document.getElementById('statusDot').classList.toggle('active', isActive);

  if (scanState === 'waiting') {
    document.getElementById('statusText').textContent = 'QR 대기 중';
  } else if (scanState === 'stabilizing') {
    document.getElementById('statusText').textContent =
      `측정 중... ${stableCount} / ${STABLE_FRAMES}`;
  } else {
    document.getElementById('statusText').textContent = 'QR 스캔 완료 ✓';
  }

  // 오차 바
  const pct = (s.errorScore * 100).toFixed(1);
  document.getElementById('errorBarFill').style.width = s.detected
    ? pct + '%'
    : '0%';
  document.getElementById('d-errorPct').textContent = s.detected
    ? pct + ' %'
    : '— %';

  // 수치
  document.getElementById('d-blackErr').textContent = s.detected
    ? s.blackCellErrors + ' 개 셀'
    : '—';
  document.getElementById('d-whiteErr').textContent = s.detected
    ? s.whiteCellErrors + ' 개 셀'
    : '—';
  document.getElementById('d-particles').textContent = s.detected
    ? s.particleCount + ' 개'
    : '—';

  // 오차 높으면 값 색 강조
  document.getElementById('d-blackErr').className =
    'rowVal' + (s.blackCellErrors > 30 ? ' hi' : '');
  document.getElementById('d-whiteErr').className =
    'rowVal' + (s.whiteCellErrors > 30 ? ' red' : '');
}

// ── 시작 ──────────────────────────────────────────
window.addEventListener('load', init);
