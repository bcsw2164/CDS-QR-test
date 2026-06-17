// ═══════════════════════════════════════════════════
//  나는 로봇이 아닙니다 — sketch.js
// ═══════════════════════════════════════════════════

const STABLE_FRAMES = 10;
const MAX_MISS_FRAMES = 8;
const WARP_SIZE = 500;
const ACCENT = '#c8ff00';
const SYLLABLES = ['나', '는', '로', '봇', '이', '아', '닙', '니', '다'];

let video, canvas, ctx;
let offCanvas, offCtx;
let CANVAS_W = 0,
  CANVAS_H = 0;

let scanState = 'waiting'; // 'waiting' | 'stabilizing' | 'locked'
let stableCount = 0;
let missCount = 0;
let lockedResult = null; // { errorScore }

let voices = [];
let ttsActive = false;

// ═══════════════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════════════
async function init() {
  canvas = document.getElementById('mainCanvas');
  ctx = canvas.getContext('2d');
  video = document.getElementById('video');

  CANVAS_W = window.innerWidth;
  CANVAS_H = window.innerHeight;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  offCanvas = document.createElement('canvas');
  offCanvas.width = CANVAS_W;
  offCanvas.height = CANVAS_H;
  offCtx = offCanvas.getContext('2d');

  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
  }
  loadVoices();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    video.srcObject = stream;
    await video.play();
  } catch {
    alert('카메라 접근 권한이 필요합니다.');
    return;
  }

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════
//  TTS
// ═══════════════════════════════════════════════════
function loadVoices() {
  const all = speechSynthesis.getVoices();
  voices = all.filter((v) => v.lang.startsWith('ko'));
  if (voices.length === 0) voices = all;
}

function speakSyllables(errorScore) {
  stopTTS();
  ttsActive = true;
  let idx = 0;

  function next() {
    if (!ttsActive || idx >= SYLLABLES.length) {
      ttsActive = false;
      return;
    }
    const utt = new SpeechSynthesisUtterance(SYLLABLES[idx++]);
    utt.lang = 'ko-KR';
    utt.pitch = Math.max(0.1, 1.0 + (Math.random() - 0.5) * errorScore * 1.5);
    utt.rate = Math.max(0.1, 1.0 + (Math.random() - 0.5) * errorScore * 0.8);

    if (voices.length > 0) {
      utt.voice =
        errorScore < 0.4
          ? voices[0]
          : voices[Math.floor(Math.random() * voices.length)];
    }

    utt.onend = next;
    utt.onerror = next;
    speechSynthesis.speak(utt);
  }

  next();
}

function stopTTS() {
  ttsActive = false;
  speechSynthesis.cancel();
}

// ═══════════════════════════════════════════════════
//  Homography 계산
// ═══════════════════════════════════════════════════
function gaussianElimination(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-10) continue;
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / pivot;
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

function computeHomography(srcPoints, dstSize) {
  const d = dstSize - 1;
  const dst = [
    { x: 0, y: 0 },
    { x: d, y: 0 },
    { x: d, y: d },
    { x: 0, y: d },
  ];
  const A = [],
    b = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = dst[i];
    const { x, y } = srcPoints[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const h = gaussianElimination(A, b);
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

function warpQRToFlat(imgData, location, dstSize) {
  const srcPoints = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner,
  ];
  const H = computeHomography(srcPoints, dstSize);
  const { width: srcW, height: srcH } = imgData;
  const output = new Uint8ClampedArray(dstSize * dstSize * 4);

  const sample = (px, py, ch) => {
    px = Math.max(0, Math.min(srcW - 1, px));
    py = Math.max(0, Math.min(srcH - 1, py));
    return imgData.data[(py * srcW + px) * 4 + ch];
  };

  for (let vy = 0; vy < dstSize; vy++) {
    for (let vx = 0; vx < dstSize; vx++) {
      const w = H[2][0] * vx + H[2][1] * vy + H[2][2];
      const sx = (H[0][0] * vx + H[0][1] * vy + H[0][2]) / w;
      const sy = (H[1][0] * vx + H[1][1] * vy + H[1][2]) / w;
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      const fx = sx - x0,
        fy = sy - y0;
      const di = (vy * dstSize + vx) * 4;
      for (let ch = 0; ch < 3; ch++) {
        output[di + ch] = Math.round(
          sample(x0, y0, ch) * (1 - fx) * (1 - fy) +
            sample(x0 + 1, y0, ch) * fx * (1 - fy) +
            sample(x0, y0 + 1, ch) * (1 - fx) * fy +
            sample(x0 + 1, y0 + 1, ch) * fx * fy,
        );
      }
      output[di + 3] = 255;
    }
  }
  return new ImageData(output, dstSize, dstSize);
}

// ═══════════════════════════════════════════════════
//  분석 유틸
// ═══════════════════════════════════════════════════
function sampleBrightness(imgData, x, y) {
  x = Math.max(0, Math.min(imgData.width - 1, Math.round(x)));
  y = Math.max(0, Math.min(imgData.height - 1, Math.round(y)));
  const i = (y * imgData.width + x) * 4;
  return (imgData.data[i] + imgData.data[i + 1] + imgData.data[i + 2]) / 3;
}

function getAdaptiveThreshold(flatData) {
  const data = flatData.data;
  let sum = 0;
  const n = flatData.width * flatData.height;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / n;
}

function detectModuleCount(flatData) {
  const size = flatData.width;
  const candidates = [21, 25, 29, 33];
  let best = 21,
    bestScore = -1;
  for (const mc of candidates) {
    const cs = size / mc;
    let clarity = 0,
      n = 0;
    for (let r = 0; r < mc; r++) {
      for (let c = 0; c < mc; c++) {
        const b = sampleBrightness(
          flatData,
          Math.round((c + 0.5) * cs),
          Math.round((r + 0.5) * cs),
        );
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

function getCellFillRate(imgData, cx, cy, radius, threshold) {
  let black = 0,
    total = 0;
  const iw = imgData.width,
    ih = imgData.height;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx,
        py = cy + dy;
      if (px < 0 || px >= iw || py < 0 || py >= ih) continue;
      if (sampleBrightness(imgData, px, py) < threshold) black++;
      total++;
    }
  }
  return total > 0 ? black / total : 0;
}

function enhanceContrast(imgData) {
  const src = imgData.data;
  const dst = new Uint8ClampedArray(src.length);
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
    dst[i + 3] = src[i + 3];
  }
  return new ImageData(dst, imgData.width, imgData.height);
}

// ═══════════════════════════════════════════════════
//  QR 오차 분석
//  오차값 = 검정 셀 채움률의 표준편차
//  원본 QR 비교 없이 셀 자체 불균일도만 측정
// ═══════════════════════════════════════════════════
function analyzeQR(imgData, loc) {
  const flatData = warpQRToFlat(imgData, loc, WARP_SIZE);
  const threshold = getAdaptiveThreshold(flatData);
  const mc = detectModuleCount(flatData);
  const cs = WARP_SIZE / mc;
  const radius = Math.max(1, Math.floor(cs * 0.4));

  const blackFills = [];
  for (let r = 0; r < mc; r++) {
    for (let c = 0; c < mc; c++) {
      const cx = Math.round((c + 0.5) * cs);
      const cy = Math.round((r + 0.5) * cs);
      if (sampleBrightness(flatData, cx, cy) < threshold) {
        blackFills.push(getCellFillRate(flatData, cx, cy, radius, threshold));
      }
    }
  }

  if (blackFills.length === 0) return 0;
  const mean = blackFills.reduce((a, v) => a + v, 0) / blackFills.length;
  const variance =
    blackFills.reduce((a, v) => a + (v - mean) ** 2, 0) / blackFills.length;
  return Math.sqrt(variance);
}

// ═══════════════════════════════════════════════════
//  메인 루프
// ═══════════════════════════════════════════════════
function loop() {
  if (video.readyState >= video.HAVE_ENOUGH_DATA) {
    // 카메라 → 오프스크린 (후면 카메라 좌우반전 보정)
    offCtx.save();
    offCtx.translate(CANVAS_W, 0);
    offCtx.scale(-1, 1);
    offCtx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
    offCtx.restore();

    const rawImgData = offCtx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(offCanvas, 0, 0);

    // 인식 박스: 화면 중앙 정사각형
    const boxSide = Math.min(CANVAS_W, CANVAS_H) * 0.75;
    const bx = (CANVAS_W - boxSide) / 2;
    const by = (CANVAS_H - boxSide) / 2;

    // QR 감지
    const enhanced = enhanceContrast(rawImgData);
    const code = jsQR(enhanced.data, CANVAS_W, CANVAS_H, {
      inversionAttempts: 'attemptBoth',
    });

    let inBox = false;
    if (code) {
      const qcx =
        (code.location.topLeftCorner.x + code.location.bottomRightCorner.x) / 2;
      const qcy =
        (code.location.topLeftCorner.y + code.location.bottomRightCorner.y) / 2;
      inBox = qcx > bx && qcx < bx + boxSide && qcy > by && qcy < by + boxSide;
    }

    // ── 스테이트 머신 ──────────────────────────────
    if (scanState === 'waiting') {
      if (code && inBox) {
        scanState = 'stabilizing';
        stableCount = 1;
        missCount = 0;
      }
    } else if (scanState === 'stabilizing') {
      if (code && inBox) {
        missCount = 0;
        stableCount++;
        if (stableCount >= STABLE_FRAMES) {
          lockedResult = { errorScore: analyzeQR(rawImgData, code.location) };
          scanState = 'locked';
          missCount = 0;
          speakSyllables(lockedResult.errorScore);
        }
      } else {
        missCount++;
        if (missCount >= MAX_MISS_FRAMES) {
          scanState = 'waiting';
          stableCount = 0;
          missCount = 0;
        }
      }
    } else if (scanState === 'locked') {
      if (!code || !inBox) {
        missCount++;
        if (missCount >= MAX_MISS_FRAMES) {
          scanState = 'waiting';
          stableCount = 0;
          missCount = 0;
          lockedResult = null;
          stopTTS();
        }
      } else {
        missCount = 0;
      }
    }

    drawUI(bx, by, boxSide, code);
  }

  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════
//  그리기
// ═══════════════════════════════════════════════════
function drawCornerBox(x, y, side, color, lineWidth) {
  const cs = Math.round(side * 0.09);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'square';
  ctx.beginPath();
  // TL
  ctx.moveTo(x, y + cs);
  ctx.lineTo(x, y);
  ctx.lineTo(x + cs, y);
  // TR
  ctx.moveTo(x + side - cs, y);
  ctx.lineTo(x + side, y);
  ctx.lineTo(x + side, y + cs);
  // BL
  ctx.moveTo(x, y + side - cs);
  ctx.lineTo(x, y + side);
  ctx.lineTo(x + cs, y + side);
  // BR
  ctx.moveTo(x + side - cs, y + side);
  ctx.lineTo(x + side, y + side);
  ctx.lineTo(x + side, y + side - cs);
  ctx.stroke();
}

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

function drawUI(bx, by, boxSide, code) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (scanState === 'waiting') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(bx, by, boxSide, boxSide);
    drawCornerBox(bx, by, boxSide, 'rgba(255,255,255,0.45)', 1.5);

    ctx.font = `${Math.round(CANVAS_W * 0.042)}px "Space Mono", monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('QR을 박스 안에 가져다 대세요', CANVAS_W / 2, CANVAS_H / 2);
  } else if (scanState === 'stabilizing') {
    drawCornerBox(bx, by, boxSide, ACCENT, 2);
    if (code) drawQRBorder(code.location, 'rgba(200,255,0,0.5)');

    ctx.font = `${Math.round(CANVAS_W * 0.038)}px "Space Mono", monospace`;
    ctx.fillStyle = 'rgba(200,255,0,0.9)';
    ctx.fillText('측정 중...', CANVAS_W / 2, CANVAS_H / 2 - 14);

    const barW = boxSide * 0.6;
    const barX = (CANVAS_W - barW) / 2;
    const barY = CANVAS_H / 2 + 8;
    const progress = Math.min(stableCount / STABLE_FRAMES, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX, barY, barW, 2);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(barX, barY, barW * progress, 2);
  } else if (scanState === 'locked') {
    drawCornerBox(bx, by, boxSide, ACCENT, 2.5);
    if (code) drawQRBorder(code.location, ACCENT);

    // 중앙 메인 텍스트
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 18;
    ctx.font = `bold ${Math.round(CANVAS_W * 0.068)}px "Noto Sans KR", sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('나는 로봇이 아닙니다', CANVAS_W / 2, CANVAS_H / 2);
    ctx.shadowBlur = 0;

    // 하단 오차 수치
    if (lockedResult) {
      ctx.font = `${Math.round(CANVAS_W * 0.038)}px "Space Mono", monospace`;
      ctx.fillStyle = ACCENT;
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        `ERROR  ${(lockedResult.errorScore * 100).toFixed(1)} %`,
        CANVAS_W / 2,
        CANVAS_H - 48,
      );
    }
  }

  ctx.restore();
}

window.addEventListener('load', init);
