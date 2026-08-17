/* ============================================================
   Fish — sketch.js (슬라이더 단일 생성기)
   ------------------------------------------------------------
   errorA/errorB 슬라이더로 물고기 그래픽 하나를 생성해서 보여준다.
   실제 그래픽 생성 로직(형태 규칙)은 core.js의 drawFish 참고.

   초기값은 core.js의 generateErrorData()(지금은 랜덤)로 채워지고,
   [랜덤 생성] 버튼으로 다시 뽑을 수 있다. 나중에 실제 데이터로
   교체할 때는 core.js의 generateErrorData()만 고치면 된다.

   캔버스는 고정 픽셀이 아니라 #canvas-wrap에 실제로 남는 공간 중
   작은 쪽에 맞춰 정사각형으로 매 프레임 다시 계산된다.

   's' 키 또는 [PNG 저장] 버튼 → 캔버스를 PNG로 저장.
   ============================================================ */

const PADDING_RATIO = 0.1; // 캔버스 가장자리와 물고기가 유지할 여백 = 캔버스 크기 × 이 비율
const MIN_CANVAS_SIZE = 220; // 캔버스가 이보다 작아지지 않도록 하는 하한

let eA = 0.3;
let eB = 0.3;
let canvasSize;

// #canvas-wrap이 실제로 차지하는 공간 중 작은 쪽에 맞춰 정사각형 캔버스 크기를 계산한다.
function computeCanvasSize() {
  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  return Math.max(MIN_CANVAS_SIZE, Math.floor(Math.min(rect.width, rect.height)));
}

// generateErrorData() 결과를 eA/eB와 슬라이더 UI에 함께 반영한다.
function applyErrorData(data) {
  eA = data.errorA;
  eB = data.errorB;
  document.getElementById('sliderA').value = eA;
  document.getElementById('sliderB').value = eB;
  document.getElementById('valA').textContent = eA.toFixed(3);
  document.getElementById('valB').textContent = eB.toFixed(3);
}

// ── p5 setup ────────────────────────────────────────────────
function setup() {
  canvasSize = computeCanvasSize();
  const cnv = createCanvas(canvasSize, canvasSize);
  cnv.parent('canvas-wrap');
  colorMode(HSB, 360, 100, 100);
  noLoop();

  applyErrorData(generateErrorData());

  // HTML 슬라이더 연결
  const sA = document.getElementById('sliderA');
  const sB = document.getElementById('sliderB');
  const vA = document.getElementById('valA');
  const vB = document.getElementById('valB');

  sA.addEventListener('input', () => {
    eA = parseFloat(sA.value);
    vA.textContent = eA;
    redraw();
  });
  sB.addEventListener('input', () => {
    eB = parseFloat(sB.value);
    vB.textContent = eB;
    redraw();
  });

  document.getElementById('btnRegen').addEventListener('click', () => {
    applyErrorData(generateErrorData());
    redraw();
  });
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
  background(0, 0, 96); // HSB에서 245/255 grayscale에 해당

  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const size = canvasSize * (1 - PADDING_RATIO * 2);

  drawFish(window, cx, cy, size, eA, eB);
}

// ── 저장 ────────────────────────────────────────────────────
function saveImg() {
  saveCanvas(`fish_A${eA.toFixed(3)}_B${eB.toFixed(3)}`, 'png');
}

function keyPressed() {
  if (key === 's' || key === 'S') saveImg();
}
