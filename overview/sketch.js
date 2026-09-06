/* ============================================================
   Series Overview — sketch.js
   ------------------------------------------------------------
   radial/ 슬라이더 페이지를 한 화면에 모아 놓은 페이지. 슬라이더
   (errorA/errorB)는 하나만 있고, 그 값이 그래픽에 적용된다. 실제
   그래픽 생성 로직은 shared/core.js를 그대로 공유 — core.js를 고치면
   radial/, archive/, 이 페이지까지 전부 반영된다.

   "방사형" 셀은 core.js의 drawRadialBurstFlowerDev(디벨롭 버전, 두
   번째 선이 좌우반전으로 마는 최종 픽스 모양)를 쓴다 — 이 그래픽은
   archive/의 방사형 그리드·줄기형(1a)에도 동일하게 적용되어 있다.
   "방사형 스포크" 셀은 drawRadialSpokeDots(이 페이지 전용) — 중심에서
   뻗는 선분 두 세트(밖지름/안지름)와 끝점 원으로 이루어진 심볼.

   그래픽 하나당 createGraphics()로 만든 개별 p5.Graphics 버퍼를 쓴다
   (archive/sketch.js와 같은 방식). 메인 캔버스는 만들지 않는다
   (noCanvas()).

   's' 키 또는 [PNG 저장] 버튼 → 각 캔버스를 개별 PNG로 저장.
   ============================================================ */

const PADDING_RATIO = 0.1; // 캔버스 가장자리와 그래픽이 유지할 여백 = 캔버스 크기 × 이 비율
const MIN_CELL_SIZE = 120; // 셀이 이보다 작아지지 않도록 하는 하한

const SERIES = [
  { shape: 'radial', label: '방사형' },
  { shape: 'radial-spokes', label: '방사형 스포크' },
  { shape: 'watercolor', label: '수채화' },
  { shape: 'watercolor-flower', label: '수채화 꽃' },
];

let eA = 0.3;
let eB = 0.3;

// "수채화" 셀을 채워진 덩어리 대신 "보이지 않는 점" 시각화로 그릴지 여부.
// [점 보기] 버튼으로 토글.
let showWatercolorPoints = false;

// 방사형(3번) 선·점 색 — 오차 데이터와 무관하게 무작위로 뽑고, 슬라이더를
// 움직일 때마다 바뀌면 산만하니 [랜덤 생성] 버튼을 누를 때만 새로 뽑는다.
let radialLineColor;
let radialDotColor;
// "방사형" 셀(drawRadialBurstFlowerDev)의 선 끝을 따라가는 원 전용 색 —
// radialLineColor·radialDotColor와 겹치지 않도록 팔레트에서 남은 색 중
// 하나를 골라 쓴다.
let radialTipColor;
// "방사형 스포크" 셀 전용 색 시드 — 형태는 core.js의 고정 시드라 안 바뀌고,
// 선분 두 세트 색·끝점 원 색만 이 시드를 따른다. [랜덤 생성] 때만 새로 뽑아서
// 슬라이더·리사이즈에는 색이 유지되고 버튼에만 바뀌게 한다.
let radialSpokeColorSeed;
// "수채화" 셀 전용 색 시드 — 두 색 선택만 이 시드를 따른다. [랜덤 생성]
// 때만 갱신되어 슬라이더·리사이즈에는 색이 유지된다.
let watercolorColorSeed;
// "수채화" 셀 전용 형태 시드 — 덩어리 윤곽의 성격(혹 개수·방향)을 정한다.
// [랜덤 생성] 때마다 새 값 → 매번 다른 유기적 형태. errorA 는 그 편차의
// 세기만 키운다(0=정원).
let watercolorShapeSeed;
// "수채화 꽃" 셀 전용 색·형태 시드 — 색: 꽃잎색·암술색(서로 다른 2색),
// 형태: 꽃잎 윤곽 + 암술이 벗어나는 방향. [랜덤 생성] 때만 갱신.
let flowerColorSeed;
let flowerShapeSeed;

function rerollRadialColors() {
  const { lineColor, dotColor } = pickRadialColors();
  radialLineColor = lineColor;
  radialDotColor = dotColor;
  const tipOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== lineColor && c !== dotColor);
  radialTipColor = tipOptions[Math.floor(random(tipOptions.length))];
  radialSpokeColorSeed = Math.floor(random(1e9));
  watercolorColorSeed = Math.floor(random(1e9));
  watercolorShapeSeed = Math.floor(random(1e9));
  flowerColorSeed = Math.floor(random(1e9));
  flowerShapeSeed = Math.floor(random(1e9));
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
    drawRadialBurstFlowerDev(g, cx, cy, size, eA, eB, radialLineColor, radialDotColor, radialTipColor, true);
  } else if (shape === 'radial-spokes') {
    drawRadialSpokeDots(g, cx, cy, size, eA, eB, radialSpokeColorSeed);
  } else if (shape === 'watercolor') {
    drawWatercolorBlob(g, cx, cy, size, eA, eB, watercolorColorSeed, showWatercolorPoints, watercolorShapeSeed);
  } else if (shape === 'watercolor-flower') {
    drawPistilFlower(g, cx, cy, size, eA, eB, flowerColorSeed, flowerShapeSeed);
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
  const btnPoints = document.getElementById('btnPoints');
  btnPoints.addEventListener('click', () => {
    showWatercolorPoints = !showWatercolorPoints;
    btnPoints.textContent = showWatercolorPoints ? '덩어리 보기' : '점 보기';
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
