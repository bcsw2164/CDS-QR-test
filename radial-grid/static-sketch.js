/* ============================================================
   Radial Grid — Static — static-sketch.js
   ------------------------------------------------------------
   radial-grid/sketch.js와 같은 그래픽(방사형, shared/core.js의
   drawRadialBurstFlowerDev)을 8열×20행 그리드로 배치하되, 애니메이션은
   전혀 없다 — 페이지를 열면 각 자리마다 랜덤 데이터가 정해지고 바로
   완전히 핀 모양으로 한 번 그려진 채 정지해 있는다(파동·회전·점 상태
   없음). 칸 크기보다 작게 그려서 옆 칸과 겹치지 않는다.
   ============================================================ */

const COLS = 8;
const ROWS = 20;
const ITEM_COUNT = COLS * ROWS;

// 만개 크기 = 칸 크기 × (1 - 이 비율) — 서로 겹치지 않도록 칸보다 작게.
const CELL_GAP_RATIO = 0.16;

// radial-grid와 톤을 맞추기 위해 선을 shared/core.js 기본값보다 얇게.
const RADIAL_GRID_STROKE_WEIGHT_RATIO = RADIAL_STROKE_WEIGHT_RATIO * 0.9;

let flowerSize = 0;
let gridCells = []; // { item, cx, cy }

function generateRadialItem() {
  const { errorA, errorB } = generateErrorData();
  const { lineColor, dotColor } = pickRadialColors();
  const tipOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== lineColor && c !== dotColor);
  return {
    errorA,
    errorB,
    lineColor,
    dotColor,
    tipColor: tipOptions[Math.floor(random(tipOptions.length))],
    angleOffset: random(TWO_PI),
    mirrorSecondary: random() < 0.5,
  };
}

// ── 인접 셀끼리 비슷한 그래픽이 몰리지 않게 배치 ──────────────
function buildGridNeighbors() {
  const list = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cellNeighbors = [];
      if (r > 0) cellNeighbors.push((r - 1) * COLS + c);
      if (r < ROWS - 1) cellNeighbors.push((r + 1) * COLS + c);
      if (c > 0) cellNeighbors.push(r * COLS + (c - 1));
      if (c < COLS - 1) cellNeighbors.push(r * COLS + (c + 1));
      list.push(cellNeighbors);
    }
  }
  return list;
}
const GRID_NEIGHBORS = buildGridNeighbors();

function itemSimilarity(a, b) {
  let s = 0;
  if (a.lineColor === b.lineColor) s += 2;
  if (a.dotColor === b.dotColor) s += 2;
  if (a.tipColor === b.tipColor) s += 1;
  if (a.mirrorSecondary === b.mirrorSecondary) s += 0.5;

  let angleDiff = Math.abs(a.angleOffset - b.angleOffset) % TWO_PI;
  if (angleDiff > Math.PI) angleDiff = TWO_PI - angleDiff;
  s += Math.max(0, 1 - angleDiff / Math.PI) * 1.5;

  const shapeDiff = Math.abs(a.errorA - b.errorA) + Math.abs(a.errorB - b.errorB);
  s += Math.max(0, 1 - shapeDiff);

  return s;
}

function arrangeItemsByDissimilarity(items) {
  const order = items.slice();
  const n = order.length;

  const costAt = (pos) => {
    let c = 0;
    for (const nb of GRID_NEIGHBORS[pos]) c += itemSimilarity(order[pos], order[nb]);
    return c;
  };

  const ITERATIONS = 4000;
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const i = Math.floor(random(n));
    const j = Math.floor(random(n));
    if (i === j) continue;

    const before = costAt(i) + costAt(j);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
    const after = costAt(i) + costAt(j);

    if (after > before) {
      const tmp2 = order[i];
      order[i] = order[j];
      order[j] = tmp2;
    }
  }

  return order;
}

function generateArrangedItems() {
  const items = [];
  for (let i = 0; i < ITEM_COUNT; i++) items.push(generateRadialItem());
  return arrangeItemsByDissimilarity(items);
}

// 애니메이션 없이 한 번만 그린다 — 전부 완전히 핀 상태(lineGrow=dotGrow=1),
// 회전 오프셋도 각자 뽑아둔 angleOffset 그대로 고정.
function renderStatic() {
  background('#242947');

  gridCells.forEach(({ item, cx, cy }) => {
    drawRadialBurstFlowerDev(
      window,
      cx,
      cy,
      flowerSize,
      item.errorA,
      item.errorB,
      item.lineColor,
      item.dotColor,
      item.tipColor,
      item.mirrorSecondary,
      item.angleOffset,
      item.angleOffset,
      1,
      1,
      RADIAL_GRID_STROKE_WEIGHT_RATIO
    );
  });
}

let currentArrangedItems = null;

function buildGrid(regenerateData = true) {
  const holder = document.getElementById('grid-holder');
  gridCells = [];

  if (regenerateData || !currentArrangedItems) {
    currentArrangedItems = generateArrangedItems();
  }

  requestAnimationFrame(() => {
    const rect = holder.getBoundingClientRect();
    const canvasW = Math.max(1, Math.round(rect.width));
    const canvasH = Math.max(1, Math.round(rect.height));

    pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
    resizeCanvas(canvasW, canvasH);

    // 칸을 정사각형으로 유지하기 위해 가로/세로 중 더 빡빡한 쪽에 맞추고,
    // 남는 여백은 그리드를 캔버스 중앙에 두는 식으로 나눠 가진다.
    const cellSpan = Math.min(canvasW / COLS, canvasH / ROWS);
    const offsetX = (canvasW - cellSpan * COLS) / 2;
    const offsetY = (canvasH - cellSpan * ROWS) / 2;
    flowerSize = cellSpan * (1 - CELL_GAP_RATIO);

    for (let i = 0; i < ITEM_COUNT; i++) {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      gridCells.push({
        item: currentArrangedItems[i],
        cx: offsetX + (col + 0.5) * cellSpan,
        cy: offsetY + (row + 0.5) * cellSpan,
      });
    }

    renderStatic();
  });
}

function setup() {
  colorMode(HSB, 360, 100, 100);
  createCanvas(1, 1).parent('grid-holder');
  noLoop(); // 애니메이션 없음 — 리사이즈 때만 다시 그린다

  buildGrid(true); // 페이지를 열 때(새로고침)만 랜덤 데이터를 새로 뽑는다
}

function windowResized() {
  buildGrid(false); // 창 크기만 다시 맞추고, 그래픽 데이터는 그대로 유지
}
