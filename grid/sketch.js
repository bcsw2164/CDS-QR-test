/* ============================================================
   Grid System — sketch.js (슬라이더 단일 생성기)
   ------------------------------------------------------------
   signature/sketch.js(사각형+원)와 같은 데이터(errorA/errorB)를 다른
   시각 언어로 표현하는 "시리즈"의 두 번째 방식. 실제 격자 메쉬 생성
   로직(형태·색상 규칙)은 shared/core.js 참고 — archive/sketch.js와
   이 로직을 공유한다.

   캔버스는 고정 픽셀이 아니라 #canvas-wrap에 실제로 남는 공간
   (windowWidth/windowHeight 기반, CSS flex로 결정됨) 중 작은 쪽에
   맞춰 정사각형으로 매 프레임 다시 계산된다. 아이패드 전시 화면과
   모바일 QR 화면처럼 화면비가 다른 두 환경 모두 이 방식으로 대응한다.

   's' 키 또는 [PNG 저장] 버튼 → 캔버스를 PNG로 저장.
   ============================================================ */

const PADDING_RATIO = 0.1; // 캔버스 가장자리와 격자가 유지할 여백 = 캔버스 크기 × 이 비율
const MIN_CANVAS_SIZE = 220; // 캔버스가 이보다 작아지지 않도록 하는 하한

let eA = 30;
let eB = 30;
let canvasSize;

// #canvas-wrap이 실제로 차지하는 공간 중 작은 쪽에 맞춰 정사각형 캔버스 크기를 계산한다.
function computeCanvasSize() {
  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  return Math.max(MIN_CANVAS_SIZE, Math.floor(Math.min(rect.width, rect.height)));
}

// ── p5 setup ────────────────────────────────────────────────
function setup() {
  canvasSize = computeCanvasSize();
  const cnv = createCanvas(canvasSize, canvasSize);
  cnv.parent('canvas-wrap');
  colorMode(HSB, 360, 100, 100);
  noLoop();

  const sA = document.getElementById('sliderA');
  const sB = document.getElementById('sliderB');
  const vA = document.getElementById('valA');
  const vB = document.getElementById('valB');

  sA.addEventListener('input', () => {
    eA = parseInt(sA.value);
    vA.textContent = eA;
    redraw();
  });
  sB.addEventListener('input', () => {
    eB = parseInt(sB.value);
    vB.textContent = eB;
    redraw();
  });

  document.getElementById('btnRegen').addEventListener('click', () => redraw());
  document.getElementById('btnSave').addEventListener('click', saveImg);
}

// 화면 회전/리사이즈 시 #canvas-wrap 크기에 맞춰 캔버스를 다시 계산
function windowResized() {
  canvasSize = computeCanvasSize();
  resizeCanvas(canvasSize, canvasSize);
  redraw();
}

// ── p5 draw ─────────────────────────────────────────────────
function draw() {
  clear();

  const n = gridDensityFromErrorA(eA);
  noiseSeed(hashSeed(eA, eB));

  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const size = canvasSize * (1 - PADDING_RATIO * 2);

  drawGridMesh(window, cx, cy, size, n, eB, GRID_COLOR);
}

// ── 저장 ────────────────────────────────────────────────────
function saveImg() {
  saveCanvas(`grid_A${eA}_B${eB}`, 'png');
}

function keyPressed() {
  if (key === 's' || key === 'S') saveImg();
}
