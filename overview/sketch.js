/* ============================================================
   Series Overview — sketch.js
   ------------------------------------------------------------
   radial/ 슬라이더 페이지를 한 화면에 모아 놓은 페이지. 슬라이더
   (errorA/errorB)는 하나만 있고, 그 값이 그래픽에 적용된다. 실제
   그래픽 생성 로직은 shared/core.js를 그대로 공유 — core.js를 고치면
   radial/, archive/, 이 페이지까지 전부 반영된다.

   그래픽 하나당 createGraphics()로 만든 개별 p5.Graphics 버퍼를 쓴다
   (archive/sketch.js와 같은 방식). 메인 캔버스는 만들지 않는다
   (noCanvas()).

   's' 키 또는 [PNG 저장] 버튼 → 두 캔버스를 각각 PNG로 저장.
   ============================================================ */

const PADDING_RATIO = 0.1; // 캔버스 가장자리와 그래픽이 유지할 여백 = 캔버스 크기 × 이 비율
const MIN_CELL_SIZE = 120; // 셀이 이보다 작아지지 않도록 하는 하한

const SERIES = [
  { shape: 'radial', label: '방사형' },
];

let eA = 0.3;
let eB = 0.3;

// 방사형(3번) 선·점 색 — 오차 데이터와 무관하게 무작위로 뽑고, 슬라이더를
// 움직일 때마다 바뀌면 산만하니 [랜덤 생성] 버튼을 누를 때만 새로 뽑는다.
let radialLineColor;
let radialDotColor;

function rerollRadialColors() {
  const { lineColor, dotColor } = pickRadialColors();
  radialLineColor = lineColor;
  radialDotColor = dotColor;
}

// shape → p5.Graphics 버퍼
let buffers = {};

// #canvas-grid 안 셀 하나가 실제로 차지하는 공간 중 작은 쪽에 맞춘 정사각형 크기
function computeCellSize(cellEl) {
  const rect = cellEl.getBoundingClientRect();
  return Math.max(MIN_CELL_SIZE, Math.floor(Math.min(rect.width, rect.height)));
}

// shape에 맞는 함수로 그래픽 하나를 g 위 (cx, cy)에 size로 그린다.
// (archive/sketch.js의 drawItem()과 같은 분기 규칙)
function drawSeries(shape, g, cx, cy, size) {
  if (shape === 'radial') {
    drawRadialBurstFlower(g, cx, cy, size, eA, eB, radialLineColor, radialDotColor);
  }
}

// 셀마다 크기에 맞는 p5.Graphics 버퍼를 새로 만들어 붙인다 (리사이즈 시 재사용).
function buildBuffers() {
  const density = Math.min(window.devicePixelRatio || 1, 2);

  SERIES.forEach(({ shape }) => {
    const cellEl = document.querySelector(`.preview-cell[data-shape="${shape}"]`);
    const cellSize = computeCellSize(cellEl);

    if (buffers[shape]) buffers[shape].remove();

    const g = createGraphics(cellSize, cellSize);
    g.pixelDensity(density);
    g.colorMode(HSB, 360, 100, 100);
    g.canvas.style.display = 'block';

    cellEl.appendChild(g.canvas);
    buffers[shape] = g;
  });
}

// 현재 eA/eB로 네 버퍼를 전부 다시 그린다.
function renderAll() {
  SERIES.forEach(({ shape }) => {
    const g = buffers[shape];
    const size = g.width * (1 - PADDING_RATIO * 2);
    g.background(0, 0, 96);
    drawSeries(shape, g, g.width / 2, g.height / 2, size);
  });
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
  noCanvas(); // 메인 캔버스는 안 씀 — 셀마다 개별 p5.Graphics만 사용
  colorMode(HSB, 360, 100, 100);

  rerollRadialColors();
  buildBuffers();
  renderAll();

  const sA = document.getElementById('sliderA');
  const sB = document.getElementById('sliderB');
  const vA = document.getElementById('valA');
  const vB = document.getElementById('valB');

  sA.addEventListener('input', () => {
    eA = parseFloat(sA.value);
    vA.textContent = eA;
    renderAll();
  });
  sB.addEventListener('input', () => {
    eB = parseFloat(sB.value);
    vB.textContent = eB;
    renderAll();
  });

  document.getElementById('btnRegen').addEventListener('click', () => {
    applyErrorData(generateErrorData());
    rerollRadialColors();
    renderAll();
  });
  document.getElementById('btnSave').addEventListener('click', saveImgs);
}

// 화면 회전/리사이즈 시 셀 크기가 바뀔 수 있으므로 버퍼를 다시 만든다.
function windowResized() {
  buildBuffers();
  renderAll();
}

// ── 저장 ────────────────────────────────────────────────────
// 네 그래픽을 각각 별도 PNG로 저장한다.
function saveImgs() {
  SERIES.forEach(({ shape }) => {
    buffers[shape].save(`${shape}_A${eA.toFixed(3)}_B${eB.toFixed(3)}.png`);
  });
}

function keyPressed() {
  if (key === 's' || key === 'S') saveImgs();
}
