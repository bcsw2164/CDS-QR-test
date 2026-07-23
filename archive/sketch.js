/* ============================================================
   Signature Archive — sketch.js
   ------------------------------------------------------------
   아직 실제로 수집된 손그림 데이터가 없어서, errorA/errorB를 임의로
   생성한 ITEM_COUNT개의 가상 데이터로 아카이브를 미리 본다.
   그래픽 생성 로직은 shared/core.js를 공유 (signature/, grid/의
   슬라이더 페이지와 동일한 규칙).

   각 데이터는 1~ITEM_COUNT번 번호(제출 순서)를 갖는다. 탭으로 정렬
   기준을 바꿔도 이 번호와 그래픽 자체는 그대로이고, 배치 순서만 바뀐다.

   오브젝트 종류 탭:
     사각형+원 — signature/의 일그러진 사각형 + 원.
     그리드    — grid/의 격자 메쉬.
   두 종류는 각자 독립된 200개 데이터셋을 갖는다.

   보기 방식 탭 (오브젝트 종류와 무관하게 적용):
     수집순   — id(1~ITEM_COUNT) 순서 그대로 배치.
     오차율순 — (errorA + errorB) / 2 오름차순(적은 것 → 많은 것)으로 배치.

   두 탭 모두 실제 CSS Grid(grid-template-columns: repeat(auto-fill,
   minmax(...)))로 구현되어 있어 열 수는 브라우저가 화면 너비에 맞춰
   자동으로 정한다. 아이템마다 독립된 <canvas>를 하나씩 담는다.
   ============================================================ */

const ITEM_COUNT = 200;
const CELL_PADDING_RATIO = 0.03; // 칸 안에서 그래픽이 차지하는 여백 비율

let currentShape = 'signature'; // 'signature' | 'grid'
let sortMode = 'collected'; // 'collected' | 'error'

let signatureItems = [];
let gridItems = [];

// 수집순/오차율순 모드에서 셀마다 만든 p5.Graphics 버퍼 (재빌드 시 정리용)
let gridGraphics = [];
// 리사이즈·탭 전환이 겹칠 때 오래된 빌드 결과가 뒤늦게 그려지는 것을 막는 토큰
let gridBuildToken = 0;

// errorA/errorB를 한 번만 생성해 고정 (색상은 SQUARE_COLOR/CIRCLE_COLOR로 항상 고정).
function generateSignatureItems() {
  const list = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    const errorA = random(0, 100);
    const errorB = random(0, 100);

    list.push({
      id: i + 1,
      errorA,
      errorB,
      errorScore: (errorA + errorB) / 2,
    });
  }
  return list;
}

function generateGridItems() {
  const list = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    const errorA = random(0, 100);
    const errorB = random(0, 100);

    list.push({
      id: i + 1,
      errorA,
      errorB,
      errorScore: (errorA + errorB) / 2,
      n: gridDensityFromErrorA(errorA),
    });
  }
  return list;
}

function currentItems() {
  return currentShape === 'signature' ? signatureItems : gridItems;
}

// 현재 sortMode('collected' | 'error')에 따라 그릴 순서(currentItems() 인덱스 목록)를 반환
function getDisplayOrder() {
  const items = currentItems();
  const order = items.map((_, i) => i);
  if (sortMode === 'error') {
    order.sort((a, b) => items[a].errorScore - items[b].errorScore);
  }
  return order;
}

// shape('signature' | 'grid')에 맞는 함수로 아이템 하나를 g 위 (cx, cy)에 size로 그린다.
function drawItem(item, g, cx, cy, size, shape) {
  if (shape === 'signature') {
    noiseSeed(hashSeed(item.errorB, item.errorB));
    drawDistortedRect(g, cx, cy, size, item.errorB, SQUARE_COLOR);
    drawCircle(g, cx, cy, size, item.errorA, CIRCLE_COLOR);
  } else {
    noiseSeed(hashSeed(item.errorA, item.errorB));
    drawGridMesh(g, cx, cy, size, item.n, item.errorB, GRID_COLOR);
  }
}

// 셀별로 만들어뒀던 p5.Graphics 버퍼를 전부 폐기
function clearGridCells() {
  gridGraphics.forEach((g) => g.remove());
  gridGraphics = [];
}

// ── 수집순 / 오차율순: 실제 CSS Grid ────────────────────────
//
// 열 수는 이 함수가 아니라 CSS의 auto-fill/minmax가 화면 너비를 보고
// 정한다. 여기서는 (1) 아이템 수만큼 빈 셀 div를 만들어 넣고,
// (2) 브라우저가 레이아웃을 확정한 다음 프레임에 각 셀의 실제 크기를
// 읽어 그 크기의 p5.Graphics를 그려서 셀 안에 넣는다.
//
function buildGridView() {
  const holder = document.getElementById('canvas-holder');
  clearGridCells();
  holder.innerHTML = '';

  const order = getDisplayOrder();
  const items = currentItems();
  const shape = currentShape;
  const myToken = ++gridBuildToken;

  const frag = document.createDocumentFragment();
  const cellEls = [];
  for (let i = 0; i < order.length; i++) {
    const cell = document.createElement('div');
    cell.className = 'archive-cell';
    frag.appendChild(cell);
    cellEls.push(cell);
  }
  holder.appendChild(frag);

  requestAnimationFrame(() => {
    if (myToken !== gridBuildToken) return; // 그 사이 새 빌드가 시작됐으면 이 결과는 버림

    const density = Math.min(window.devicePixelRatio || 1, 2);

    cellEls.forEach((cellEl, i) => {
      const rect = cellEl.getBoundingClientRect();
      const cellSize = Math.max(1, Math.round(rect.width));
      const pad = cellSize * CELL_PADDING_RATIO;
      const size = cellSize - pad * 2;

      const gfx = createGraphics(cellSize, cellSize);
      gfx.pixelDensity(density);
      gfx.colorMode(HSB, 360, 100, 100);
      gfx.background(0, 0, 96);
      drawItem(items[order[i]], gfx, cellSize / 2, cellSize / 2, size, shape);

      // createGraphics()의 캔버스는 기본이 display:none(원래 오프스크린 버퍼용)이라
      // DOM에 직접 붙여 보여주려면 켜줘야 한다.
      gfx.canvas.style.display = 'block';
      cellEl.appendChild(gfx.canvas);
      gridGraphics.push(gfx);
    });
  });
}

// ── p5 setup ────────────────────────────────────────────────
function setup() {
  colorMode(HSB, 360, 100, 100);

  signatureItems = generateSignatureItems();
  gridItems = generateGridItems();

  const shapeButtons = document.querySelectorAll('.shape-btn');
  shapeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      shapeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentShape = btn.dataset.shape;
      buildGridView();
    });
  });

  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.mode;
      buildGridView();
    });
  });

  buildGridView();
}

// 화면 회전/리사이즈 시 열 수·셀 크기가 바뀔 수 있으므로 다시 빌드
function windowResized() {
  buildGridView();
}
