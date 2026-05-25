// ═══════════════════════════════════════════════════
//  QR 오차 인터랙션 — sketch.js
// ═══════════════════════════════════════════════════

let CANVAS_W = 640; // loadedmetadata에서 실제 해상도로 갱신됨
let CANVAS_H = 480; // loadedmetadata에서 실제 해상도로 갱신됨
const BOX_PAD = 90; // 인식 박스 여백(px)
const MAX_PARTICLES = 400; // 최대 파티클 수
const STABLE_FRAMES = 25; // 스냅샷 확정까지 필요한 안정 프레임 수
const MAX_MISS_FRAMES = 10; // stabilizing/locked 중 흔들림 허용 연속 미감지 프레임 수
const WARP_SIZE = 580; // homography 워프 출력 크기(px)

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
let missCount = 0; // 연속 미감지 프레임 수 (흔들림 허용 카운터)
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
    // 전면 카메라 (기존)
    // const stream = await navigator.mediaDevices.getUserMedia({
    //   video: { width: CANVAS_W, height: CANVAS_H },
    // });

    // 후면 카메라
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = stream;

    // 실제 해상도 확정 후 캔버스 크기 동기화
    video.addEventListener('loadedmetadata', () => {
      CANVAS_W = video.videoWidth;
      CANVAS_H = video.videoHeight;
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      offCanvas.width = CANVAS_W;
      offCanvas.height = CANVAS_H;
    });

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

// ═══════════════════════════════════════════════════
//  Homography 계산 유틸
// ═══════════════════════════════════════════════════

// 8×8 선형 시스템 풀기 — 부분 피벗팅 가우시안 소거법
function gaussianElimination(A, b) {
  const n = b.length;
  // 첨가행렬 생성
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // 부분 피벗팅: 절대값 최대 행과 교환
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-10) continue; // 특이 행렬 방어

    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / pivot;
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }

  // 후진 대입
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

// src 4점 → dstSize 정사각형의 역 homography(dst→src) 계산
//
// 4점 대응 DLT: 각 점 (u,v)→(x,y) 에 대해 h22=1 고정 후 8원 연립방정식 구성
//   h00·u + h01·v + h02 + (-u·x)·h20 + (-v·x)·h21 = x
//   h10·u + h11·v + h12 + (-u·y)·h20 + (-v·y)·h21 = y
//
// srcPoints 순서: [topLeft, topRight, bottomRight, bottomLeft]
// 반환: 3×3 행렬  (dst 좌표 → src 좌표)
function computeHomography(srcPoints, dstSize) {
  const d = dstSize - 1;
  // dst 정사각형 4꼭짓점 (srcPoints 순서와 1:1 대응)
  const dst = [
    { x: 0, y: 0 },
    { x: d, y: 0 },
    { x: d, y: d },
    { x: 0, y: d },
  ];

  const A = [],
    b = [];
  for (let i = 0; i < 4; i++) {
    const u = dst[i].x,
      v = dst[i].y;
    const x = srcPoints[i].x,
      y = srcPoints[i].y;
    // x 방정식
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    // y 방정식
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const h = gaussianElimination(A, b);
  // h = [h00, h01, h02, h10, h11, h12, h20, h21],  h22 = 1
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

// jsQR location의 QR 영역을 dstSize×dstSize 정사각형으로 펼침
// 역 homography로 출력 픽셀마다 소스 좌표를 역산 + 쌍선형 보간
function warpQRToFlat(imgData, location, dstSize) {
  const srcPoints = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ];

  // H: dst → src  (역 homography)
  const H = computeHomography(srcPoints, dstSize);

  const srcW = imgData.width,
    srcH = imgData.height;
  const output = new Uint8ClampedArray(dstSize * dstSize * 4);

  // 클램프 + 픽셀 채널 샘플링
  const sample = (px, py, ch) => {
    px = Math.max(0, Math.min(srcW - 1, px));
    py = Math.max(0, Math.min(srcH - 1, py));
    return imgData.data[(py * srcW + px) * 4 + ch];
  };

  for (let vy = 0; vy < dstSize; vy++) {
    for (let vx = 0; vx < dstSize; vx++) {
      // 역 homography로 소스 좌표 역산
      const w = H[2][0] * vx + H[2][1] * vy + H[2][2];
      const sx = (H[0][0] * vx + H[0][1] * vy + H[0][2]) / w;
      const sy = (H[1][0] * vx + H[1][1] * vy + H[1][2]) / w;

      // 쌍선형 보간
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      const fx = sx - x0,
        fy = sy - y0;

      const dstIdx = (vy * dstSize + vx) * 4;
      for (let ch = 0; ch < 3; ch++) {
        output[dstIdx + ch] = Math.round(
          sample(x0, y0, ch) * (1 - fx) * (1 - fy) +
            sample(x0 + 1, y0, ch) * fx * (1 - fy) +
            sample(x0, y0 + 1, ch) * (1 - fx) * fy +
            sample(x0 + 1, y0 + 1, ch) * fx * fy,
        );
      }
      output[dstIdx + 3] = 255;
    }
  }

  return new ImageData(output, dstSize, dstSize);
}

// ═══════════════════════════════════════════════════
//  모듈 수 자동 감지
//  QR 버전마다 모듈 수가 다름 (v1=21, v2=25, v3=29, …)
//  warpQRToFlat으로 한 번만 펼친 뒤 모든 후보 검사
// ═══════════════════════════════════════════════════
function detectModuleCount(imgData, loc) {
  // 모듈 수 감지용 소형 워프 (속도 우선)
  const SAMPLE_SIZE = 280;
  const flatData = warpQRToFlat(imgData, loc, SAMPLE_SIZE);

  const candidates = [21, 25, 29, 33, 37, 41];
  let best = 29,
    bestScore = -1;

  for (const mc of candidates) {
    const cellSize = SAMPLE_SIZE / mc;
    let clarity = 0,
      n = 0;
    const step = Math.max(1, Math.floor(mc / 7));
    for (let r = 0; r < mc; r += step) {
      for (let c = 0; c < mc; c += step) {
        const cx = Math.round((c + 0.5) * cellSize);
        const cy = Math.round((r + 0.5) * cellSize);
        const b = sampleBrightness(flatData, cx, cy);
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

// ═══════════════════════════════════════════════════
//  BitMatrix 생성
//  원본 QR을 WARP_SIZE 정사각형으로 펼친 뒤 셀별 기대값 추출
//  → 카메라 분석(analyzeQR)과 동일한 좌표계 사용
// ═══════════════════════════════════════════════════
function buildBitMatrix(imgData, loc, mc) {
  const flatData = warpQRToFlat(imgData, loc, WARP_SIZE);
  const threshold = getAdaptiveThreshold(flatData);
  const cellSize = WARP_SIZE / mc;

  const matrix = [];
  for (let r = 0; r < mc; r++) {
    matrix[r] = [];
    for (let c = 0; c < mc; c++) {
      const cx = Math.round((c + 0.5) * cellSize);
      const cy = Math.round((r + 0.5) * cellSize);
      const bright = sampleBrightness(flatData, cx, cy);
      matrix[r][c] = bright < threshold ? 1 : 0; // 1=검정, 0=흰색
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
    // 카메라 → 오프스크린(분석용) — 좌우반전 보정
    offCtx.save();
    offCtx.translate(CANVAS_W, 0);
    offCtx.scale(-1, 1);
    offCtx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
    offCtx.restore();
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
        missCount = 0;
      }
      state.detected = false;
    } else if (scanState === 'stabilizing') {
      if (code && inBox) {
        missCount = 0; // 감지 성공 → 미감지 카운터 초기화
        stableCount++;

        if (stableCount >= STABLE_FRAMES) {
          if (originalBitMatrix) {
            // 확정 프레임: analyzeQR 1회 실행 → locked
            lockedResult = analyzeQR(rawImgData, code.location);
            state = { ...state, ...lockedResult, detected: true };
            respawnParticles(lockedResult.errorScore);
            lastErrorScore = lockedResult.errorScore;
            scanState = 'locked';
            missCount = 0;
            drawQRBorder(code.location, '#c8ff00');
          } else {
            // 원본 BitMatrix 아직 미준비 → 대기로 복귀
            scanState = 'waiting';
            stableCount = 0;
            missCount = 0;
            state.detected = false;
          }
        } else {
          // 아직 측정 중 — 반투명 윤곽선만 표시
          state.detected = false;
          drawQRBorder(code.location, 'rgba(200,255,0,0.45)');
        }
      } else {
        // 잠시 안 보임 → 흔들림 허용 (MAX_MISS_FRAMES 초과 시에만 리셋)
        missCount++;
        if (missCount >= MAX_MISS_FRAMES) {
          scanState = 'waiting';
          stableCount = 0;
          missCount = 0;
          state.detected = false;
        }
        // else: stableCount 유지, 진행 바 일시 정지
      }
    } else if (scanState === 'locked') {
      if (!code || !inBox) {
        // 잠시 안 보임 → 흔들림 허용 (MAX_MISS_FRAMES 초과 시에만 리셋)
        missCount++;
        if (missCount >= MAX_MISS_FRAMES) {
          scanState = 'waiting';
          stableCount = 0;
          missCount = 0;
          lockedResult = null;
          particles = [];
          lastErrorScore = -1;
          state.detected = false;
        }
        // else: locked 값 유지 (화면에서 잠깐 벗어나도 고정 유지)
      } else {
        missCount = 0; // 감지 성공 → 미감지 카운터 초기화
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
//  QR 오차 분석 (homography 기반)
//  카메라 프레임 QR을 WARP_SIZE×WARP_SIZE로 펼친 뒤
//  고정 셀 좌표에서 fill rate 계산 → 각도/거리 불변
// ═══════════════════════════════════════════════════
function analyzeQR(imgData, loc) {
  const mc = moduleCount;

  // QR을 정사각형으로 펼침 (원본 BitMatrix와 동일한 WARP_SIZE 기준)
  const flatData = warpQRToFlat(imgData, loc, WARP_SIZE);
  const threshold = getAdaptiveThreshold(flatData);
  const cellSize = WARP_SIZE / mc;
  const radius = Math.max(1, Math.floor(cellSize * 0.4)); // 샘플링 반경

  let totalError = 0;
  let blackCellErrors = 0; // 검정이어야 하는데 덜 채워진 셀
  let whiteCellErrors = 0; // 흰색이어야 하는데 침범된 셀

  for (let r = 0; r < mc; r++) {
    for (let c = 0; c < mc; c++) {
      const cx = Math.round((c + 0.5) * cellSize);
      const cy = Math.round((r + 0.5) * cellSize);
      const fillRate = getCellFillRate(flatData, cx, cy, radius, threshold);
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

// ── 적응형 임계값 계산 ────────────────────────────
// 펼쳐진 QR 이미지 전체 픽셀 밝기의 평균을 임계값으로 반환
// 조명 조건·잉크 농도에 따라 자동으로 검정/흰색 경계가 조정됨
function getAdaptiveThreshold(flatData) {
  const data = flatData.data;
  let sum = 0;
  const pixelCount = flatData.width * flatData.height;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / pixelCount;
}

// ── 셀 채움률 계산 ─────────────────────────────────
// 셀 중심 주변 radius 범위 픽셀에서 검정 비율 반환
// imgData 크기에 독립적으로 동작 (WARP_SIZE 이미지에서도 정상 작동)
function getCellFillRate(imgData, cx, cy, radius, threshold) {
  let black = 0,
    total = 0;
  const iw = imgData.width,
    ih = imgData.height;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= iw || py < 0 || py >= ih) continue;
      if (sampleBrightness(imgData, px, py) < threshold) black++;
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
//  유틸: 특정 좌표 픽셀 밝기 (R+G+B 평균)
// ═══════════════════════════════════════════════════
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
