// ═══════════════════════════════════════════════════
//  QR 손그림 인식 — sketch.js  (p5.js 환경)
// ═══════════════════════════════════════════════════

// ▼ cloudflared 재실행 시 새 URL로 교체 (start-tunnel.ps1 참고)
const BACKEND_URL = 'https://race-hamilton-persistent-previews.trycloudflare.com';

let capture;
let uiState    = 'IDLE'; // IDLE | SCANNING | RESULT | ERROR
let resultData = null;
let scanBtn;
let audioCtx   = null;
let resetTimer = null;

// ═══════════════════════════════════════════════════
//  p5.js 라이프사이클
// ═══════════════════════════════════════════════════
function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.style('position', 'fixed');
  cnv.style('top', '0');
  cnv.style('left', '0');

  // 후면 카메라
  capture = createCapture({ video: { facingMode: 'environment' } });
  capture.hide();

  // 스캔 버튼
  scanBtn = createButton('스캔');
  scanBtn.id('scanBtn');
  scanBtn.mousePressed(() => { onScan(); return false; });

  noStroke();
  textFont('sans-serif');
}

function draw() {
  background(12); // #0c0c0c

  // 카메라 피드 — cover 방식 (전체화면 가득)
  if (capture && capture.width > 0) {
    const scale = Math.max(width / capture.width, height / capture.height);
    const dw    = capture.width  * scale;
    const dh    = capture.height * scale;
    image(capture, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }

  drawOverlay();
}

// ═══════════════════════════════════════════════════
//  UI 오버레이
// ═══════════════════════════════════════════════════
function drawOverlay() {
  noStroke();

  if (uiState === 'IDLE') {
    fill(255, 255, 255, 190);
    textAlign(CENTER, TOP);
    textSize(width * 0.042);
    text('QR을 카메라에 가져다 대세요', width / 2, 44);

  } else if (uiState === 'SCANNING') {
    fill(0, 0, 0, 170);
    rect(0, 0, width, height);
    fill(200, 255, 0);
    textAlign(CENTER, CENTER);
    textSize(width * 0.058);
    text('분석 중...', width / 2, height / 2);

  } else if (uiState === 'RESULT' && resultData) {
    fill(0, 0, 0, 155);
    rect(0, 0, width, height);

    fill(200, 255, 0);
    textAlign(CENTER, CENTER);
    textSize(width * 0.062);
    text(`${resultData.id}번 손그림 인식 성공`, width / 2, height / 2 - height * 0.065);

    fill(255);
    textSize(width * 0.048);
    text(`오차율  ${(resultData.errorScore * 100).toFixed(1)} %`, width / 2, height / 2 + height * 0.04);

  } else if (uiState === 'ERROR') {
    fill(0, 0, 0, 170);
    rect(0, 0, width, height);
    fill(255, 80, 80);
    textAlign(CENTER, CENTER);
    textSize(width * 0.05);
    text('QR을 인식하지 못했습니다', width / 2, height / 2);
  }
}

// ═══════════════════════════════════════════════════
//  스캔 실행
// ═══════════════════════════════════════════════════
async function onScan() {
  if (uiState === 'SCANNING') return;
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }

  if (!capture || capture.width === 0) {
    showError();
    return;
  }

  setUiState('SCANNING');

  // 현재 프레임 캡처 → base64 JPEG
  const pg      = createGraphics(capture.width, capture.height);
  pg.image(capture, 0, 0);
  const imgData = pg.canvas.toDataURL('image/jpeg', 0.85);
  pg.remove();

  try {
    const res  = await fetch(BACKEND_URL + '/predict', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image: imgData }),
    });
    const data = await res.json();

    if (data.error) {
      showError();
    } else {
      resultData = data;
      setUiState('RESULT');
      scheduleReset(3500);
      playSound(data.errorScore);
    }
  } catch {
    showError();
  }
}

function showError() {
  setUiState('ERROR');
  scheduleReset(2500);
}

function setUiState(state) {
  uiState = state;
  if (state === 'SCANNING') {
    scanBtn.attribute('disabled', '');
  } else {
    scanBtn.removeAttribute('disabled');
  }
}

function scheduleReset(delay) {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    uiState    = 'IDLE';
    resultData = null;
    resetTimer = null;
    scanBtn.removeAttribute('disabled');
  }, delay);
}

// ═══════════════════════════════════════════════════
//  Web Audio API — 오차 연동 사운드
//  errorScore 낮음 → 안정적인 440Hz 단음
//  errorScore 높음 → 비브라토 + 디스토션 강해짐
// ═══════════════════════════════════════════════════
function playSound(errorScore) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const dur = 2.5;

    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    // 비브라토 LFO — 오차 비례 강도·속도
    if (errorScore > 0.05) {
      const lfo     = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      lfo.frequency.setValueAtTime(3 + errorScore * 10, now);
      lfoGain.gain.setValueAtTime(errorScore * 80, now);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(now);
      lfo.stop(now + dur);
    }

    // 디스토션 — 오차 높을 때 추가
    if (errorScore > 0.2) {
      const dist      = audioCtx.createWaveShaper();
      dist.curve      = makeDistortionCurve(errorScore * 500);
      dist.oversample = '2x';
      osc.connect(dist);
      dist.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + dur);

  } catch (e) {
    console.warn('Audio error:', e);
  }
}

function makeDistortionCurve(amount) {
  const n     = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x    = (i * 2) / n - 1;
    curve[i]   = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
