/* ============================================================
   Signature Archive — sketch.js
   ------------------------------------------------------------
   아직 실제로 수집된 손그림 데이터가 없어서, errorA/errorB를 임의로
   생성한 ITEM_COUNT개의 가상 데이터로 아카이브를 미리 본다.
   그래픽 생성 로직은 shared/core.js를 공유 (radial/의 슬라이더
   페이지와 동일한 규칙).

   각 데이터는 1~ITEM_COUNT번 번호(제출 순서)를 갖는다. 탭으로 정렬
   기준을 바꿔도 이 번호와 그래픽 자체는 그대로이고, 배치 순서만 바뀐다.

   오브젝트 종류 탭:
     방사형 — radial/의 방사형 다발 꽃잎.
     1a(줄기형, 임시) — 1과 완전히 같은 데이터셋을 줄기 배치로 보여줌.

   보기 방식 탭 (오브젝트 종류와 무관하게 적용):
     수집순   — id(1~ITEM_COUNT) 순서 그대로 배치.
     오차율순 — (errorA + errorB) / 2 오름차순(적은 것 → 많은 것)으로 배치.

   두 탭 모두 실제 CSS Grid(grid-template-columns: repeat(auto-fill,
   minmax(...)))로 구현되어 있어 열 수는 브라우저가 화면 너비에 맞춰
   자동으로 정한다. 아이템마다 독립된 <canvas>를 하나씩 담는다.
   ============================================================ */

const ITEM_COUNT = 200;
const CELL_PADDING_RATIO = 0.03; // 칸 안에서 그래픽이 차지하는 여백 비율

let currentShape = 'radial'; // 'radial' | 'radial-stem'
let sortMode = 'collected'; // 'collected' | 'error'

let radialItems = [];

// TEMP: 1a 줄기형 배치의 현재 레이아웃 상태(애니메이션 프레임마다 재사용).
// 1a 탭이 아닐 땐 null — draw()가 매 프레임 아무것도 안 하고 바로 리턴한다.
let stemAnim = null;

// 수집순/오차율순 모드에서 셀마다 만든 p5.Graphics 버퍼 (재빌드 시 정리용)
let gridGraphics = [];
// 리사이즈·탭 전환이 겹칠 때 오래된 빌드 결과가 뒤늦게 그려지는 것을 막는 토큰
let gridBuildToken = 0;

// radial은 형태가 core.js의 generateErrorData()(errorA/errorB)만으로
// 결정되므로 아이템 생성 로직을 공유한다.
function generateFlowerItems() {
  const list = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    const { errorA, errorB } = generateErrorData();

    list.push({
      id: i + 1,
      errorA,
      errorB,
      errorScore: (errorA + errorB) / 2,
    });
  }
  return list;
}

// 방사형(1번/1a) 전용 — generateFlowerItems()에 선·점 색을 더한다. 색은
// 오차 데이터와 무관하게 core.js의 pickRadialColors()로 완전히 무작위로
// 뽑고(팔레트 안에서 선·점이 겹치지 않게), 아이템마다 한 번만 뽑아 고정한다.
function generateRadialItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    const { lineColor, dotColor } = pickRadialColors();
    item.lineColor = lineColor;
    item.dotColor = dotColor;
  });
  return list;
}

function currentItems() {
  // TEMP: 1a는 1과 완전히 같은 데이터셋을 재사용 — 배치 방식(그리드 vs 줄기)만
  // 비교하려는 목적이라, 같은 아이템이 두 배치 방식에서 어떻게 보이는지 맞춰봐야 함.
  const itemsByShape = {
    radial: radialItems,
    'radial-stem': radialItems,
  };
  return itemsByShape[currentShape];
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

// 아이템 하나를 g 위 (cx, cy)에 size로 그린다.
function drawItem(item, g, cx, cy, size) {
  drawRadialBurstFlower(g, cx, cy, size, item.errorA, item.errorB, item.lineColor, item.dotColor);
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

  const shape = currentShape;

  // 1번(방사형)·1a(방사형 줄기형, 임시)는 배경을 검게.
  holder.classList.toggle('bg-dark', true);

  const isStemView = shape === 'radial-stem';
  holder.classList.toggle('stem-view', isStemView);
  if (!isStemView) {
    stemAnim = null; // 1a를 벗어나면 draw() 루프가 더 이상 할 일이 없게
  }
  if (isStemView) {
    buildStemView();
    return;
  }

  const order = getDisplayOrder();
  const items = currentItems();
  const myToken = ++gridBuildToken;

  const frag = document.createDocumentFragment();
  const cellEls = [];
  for (let i = 0; i < order.length; i++) {
    const cell = document.createElement('div');
    cell.className = 'archive-cell';
    cell.dataset.itemId = items[order[i]].id;
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
      gfx.background(0, 0, 0);
      drawItem(items[order[i]], gfx, cellSize / 2, cellSize / 2, size);

      // createGraphics()의 캔버스는 기본이 display:none(원래 오프스크린 버퍼용)이라
      // DOM에 직접 붙여 보여주려면 켜줘야 한다.
      gfx.canvas.style.display = 'block';
      cellEl.appendChild(gfx.canvas);
      gridGraphics.push(gfx);
    });
  });
}

// ── TEMP: 1a — 줄기형 배치(그리드 대신 일정 간격 줄기 위에 꽃들) ──
//
// 1번과 그래픽 생성 로직은 완전히 동일하고(drawRadialBurstFlower 그대로
// 재사용), 배치 방식만 다르다.
//
// 줄기는 이제 아이템 하나당 하나가 아니라, CSS 그리드의 auto-fill처럼
// 화면 폭에 맞춰 "몇 개가 들어갈지"만 정해지는 배경 구조물이다(일정한
// 간격으로 세로 전체 길이). 아이템은 항상 수집순(id 순서)으로, 첫 번째
// 줄기에 위→아래로 채우고, 다 차면 다음 줄기로 넘어가는 방식으로 배치
// (오차율순 정렬은 여기서는 적용하지 않음). 가로 스크롤은 절대 생기지
// 않고(줄기 개수 자체가 화면 폭에 맞춰 줄어들거나 늘어남), 아이템이
// 많아 한 줄기에 다 못 채우면 세로 스크롤만 생긴다.
//
// 회전 애니메이션 — drawRadialBurstFlower에 넘기는 각도 오프셋만 시간에
// 따라 계속 바뀌는 방식이라, 정지된 한 프레임의 모양(휘어짐 정도·점
// 거리)은 오차 데이터 그대로 정확히 유지된다. 오차값과는 무관하게 모든
// 아이템이 동일하게 아주 천천히 회전하고(호 그룹·점 그룹이 반대
// 방향으로), 스케일(크기) 애니메이션은 없다.
//
const STEM_COLUMN_MIN_WIDTH = 110; // 줄기 하나가 최소로 차지하는 가로 폭(이 폭 기준으로 줄기 개수 계산)
const STEM_FLOWER_SIZE = 90; // 꽃 그래픽 크기(정사각형 한 변 기준)
const STEM_ROW_SPACING = 130; // 한 줄기 안에서 꽃과 꽃 사이의 세로 간격
const STEM_TOP_PADDING = 70; // 캔버스 맨 위 ~ 첫 꽃 중심까지 여백
const STEM_BOTTOM_PADDING = 40; // 마지막 꽃 중심 ~ 캔버스 맨 아래까지 여백
const STEM_MARGIN_TOP = 12; // 줄기 선 자체의 시작(캔버스 맨 위에서)
const STEM_MARGIN_BOTTOM = 12; // 줄기 선 자체의 끝(캔버스 맨 아래에서)
const STEM_WEIGHT_RADIAL = 10; // 1a 줄기 굵기 (기존 5의 1.5배)
// 회전 속도(rad/s) — 오차 데이터와 무관하게 모든 아이템에 고정 적용되는
// 아주 느린 속도. 호 그룹은 +방향, 점 그룹은 -방향으로 서로 반대로 돈다.
const STEM_ROTATION_SPEED = 0.03;

// 레이아웃을 매 프레임 다시 계산하지 않도록, 탭 진입/리사이즈 시 한 번만
// 계산해서 stemAnim에 저장해두고 draw()에서는 각도만 갱신해 다시 그린다.
function buildStemView() {
  const holder = document.getElementById('canvas-holder');
  const items = currentItems(); // 항상 생성 순서(=수집순) 그대로 사용

  const canvasWidth = Math.max(1, Math.round(holder.clientWidth));
  const numStems = Math.max(1, Math.floor(canvasWidth / STEM_COLUMN_MIN_WIDTH));
  const columnSpacing = canvasWidth / numStems;
  const rowsPerStem = Math.max(1, Math.ceil(items.length / numStems));

  const contentHeight = STEM_TOP_PADDING + (rowsPerStem - 1) * STEM_ROW_SPACING + STEM_BOTTOM_PADDING;
  const canvasHeight = Math.max(Math.round(holder.clientHeight), contentHeight);

  // 검정 배경 + 올리브그린 줄기.
  const bgBri = 0;
  const stemColor = '#3b6d2d';
  const stemWeight = STEM_WEIGHT_RADIAL;

  const density = Math.min(window.devicePixelRatio || 1, 2);
  const gfx = createGraphics(canvasWidth, canvasHeight);
  gfx.pixelDensity(density);
  gfx.colorMode(HSB, 360, 100, 100);

  gfx.canvas.style.display = 'block';
  holder.appendChild(gfx.canvas);
  gridGraphics.push(gfx);

  stemAnim = {
    items,
    numStems,
    columnSpacing,
    canvasWidth,
    canvasHeight,
    rowsPerStem,
    bgBri,
    stemColor,
    stemWeight,
    gfx,
  };

  renderStemFrame(0); // 첫 프레임(각도 0)을 즉시 한 번 그려서 애니메이션 시작 전에도 바로 보이게
}

// stemAnim의 현재 레이아웃 위에, 시간(elapsedSec)에 따른 회전 각도만
// 반영해서 다시 그린다. errorA/errorB로 정해지는 "정지된 한 프레임의
// 모양"(휘어짐 정도·점 거리 등)은 core.js 함수 내부에서 각도 오프셋과
// 완전히 분리돼 있어 여기서 절대 건드리지 않는다 — 대신 그 각도
// 오프셋이 시간에 비례하는 "속도" 자체를 아이템의 오차값으로 정해서,
// 오차가 클수록 더 빠르게 도는 것으로 재미를 준다.
function renderStemFrame(elapsedSec) {
  const s = stemAnim;
  if (!s) return;
  const { gfx } = s;

  gfx.background(0, 0, s.bgBri);

  gfx.stroke(s.stemColor);
  gfx.strokeWeight(s.stemWeight);
  for (let col = 0; col < s.numStems; col++) {
    const cx = col * s.columnSpacing + s.columnSpacing / 2;
    gfx.line(cx, STEM_MARGIN_TOP, cx, s.canvasHeight - STEM_MARGIN_BOTTOM);
  }

  s.items.forEach((item, i) => {
    const col = Math.floor(i / s.rowsPerStem);
    const row = i % s.rowsPerStem;
    const cx = col * s.columnSpacing + s.columnSpacing / 2;
    const cy = STEM_TOP_PADDING + row * STEM_ROW_SPACING;

    // 호 그룹은 시계 방향(+), 점 그룹은 반시계 방향(-)으로, 오차값과
    // 무관하게 모든 아이템이 동일한 속도로 아주 천천히 돈다.
    const lineAngleOffset = elapsedSec * STEM_ROTATION_SPEED;
    const dotAngleOffset = elapsedSec * -STEM_ROTATION_SPEED;
    drawRadialBurstFlower(
      gfx,
      cx,
      cy,
      STEM_FLOWER_SIZE,
      item.errorA,
      item.errorB,
      item.lineColor,
      item.dotColor,
      lineAngleOffset,
      dotAngleOffset
    );
  });
}

// ── 그래픽 클릭 → 상세 오버레이(QR + 이름) ─────────────────────
//
// 아직 그래픽↔사람 매칭 데이터가 없어서, 지금은 어떤 셀을 클릭해도
// 동일한 자리표시자(placeholder) 이미지·이름을 보여준다. 실제 데이터가
// 모이면 itemId로 조회해서 이 부분만 교체하면 된다.
//
function openDetailOverlay(itemId) {
  document.getElementById('detail-qr').src = 'images/sample-qr.jpg';
  document.getElementById('detail-name').textContent = '정솔하';
  document.getElementById('detail-overlay').classList.add('open');
}

function closeDetailOverlay() {
  document.getElementById('detail-overlay').classList.remove('open');
}

// ── p5 setup ────────────────────────────────────────────────
function setup() {
  colorMode(HSB, 360, 100, 100);
  frameRate(30); // 1a 회전 애니메이션용 — 아이템이 많아 매 프레임 다시 그리는 비용을 아낌

  radialItems = generateRadialItems();

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

  // 셀은 buildGridView()가 매번 새로 만들지만 #canvas-holder 자체는 그대로이므로
  // 위임(delegation)으로 한 번만 걸어둔다.
  document.getElementById('canvas-holder').addEventListener('click', (e) => {
    const cell = e.target.closest('.archive-cell');
    if (!cell) return;
    openDetailOverlay(cell.dataset.itemId);
  });

  // 박스 밖 어두운 배경을 클릭하면 닫힘
  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-overlay') closeDetailOverlay();
  });

  buildGridView();
}

// 화면 회전/리사이즈 시 열 수·셀 크기가 바뀔 수 있으므로 다시 빌드
function windowResized() {
  buildGridView();
}

// TEMP: 1a 회전 애니메이션 루프. stemAnim이 없으면(=1a 탭이 아니면)
// 바로 리턴 — 다른 탭에서는 아무 비용도 들지 않는다.
function draw() {
  if (!stemAnim) return;
  renderStemFrame(millis() / 1000);
}
