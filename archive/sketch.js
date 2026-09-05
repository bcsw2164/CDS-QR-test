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
     방사형 — 방사형 다발 꽃잎. core.js의 drawRadialBurstFlowerDev(디벨롭
       버전, 두 번째 선이 좌우반전으로 마는 최종 픽스 모양)를 쓴다 —
       overview의 "방사형" 셀과 동일한 그래픽. radial/은 아직 이전 버전
       (drawRadialBurstFlower, v1) 그대로다. 예전에 있던 "1a"(줄기형
       비교용 탭)는 삭제됐고, 그 회전 애니메이션만 이 그리드 뷰로
       옮겨와 계속 적용된다(아래 "회전 애니메이션" 참고).

   보기 방식 탭 (오브젝트 종류와 무관하게 적용):
     수집순   — id(1~ITEM_COUNT) 순서 그대로 배치.
     오차율순 — (errorA + errorB) / 2 오름차순(적은 것 → 많은 것)으로 배치.

   두 탭 모두 실제 CSS Grid(grid-template-columns: repeat(auto-fill,
   minmax(...)))로 구현되어 있어 열 수는 브라우저가 화면 너비에 맞춰
   자동으로 정한다. 아이템마다 독립된 <canvas>를 하나씩 담는다.

   회전 애니메이션 — 매 프레임 drawRadialBurstFlowerDev에 넘기는 각도
   오프셋만 시간(elapsedSec)에 비례해 계속 바뀌는 방식이라, 정지된 한
   프레임의 모양(휘어짐 정도·점 거리 등, errorA/errorB로 정해짐)은
   그대로 유지된다. 오차값과는 무관하게 모든 아이템이 RADIAL_ROTATION_SPEED
   로 동일하게 아주 천천히 회전하고(선 그룹은 +방향, 중심-거리 원
   그룹은 -방향으로 서로 반대), 스케일(크기) 애니메이션은 없다.
   ============================================================ */

const ITEM_COUNT = 200;
const CELL_PADDING_RATIO = 0.03; // 칸 안에서 그래픽이 차지하는 여백 비율
// 회전 속도(rad/s) — 오차 데이터와 무관하게 모든 아이템에 고정 적용되는
// 아주 느린 속도. 선 그룹은 +방향, 중심-거리 원 그룹은 -방향으로 서로 반대.
const RADIAL_ROTATION_SPEED = 0.03;

let currentShape = 'radial';
let sortMode = 'collected'; // 'collected' | 'error'

let radialItems = [];

// 수집순/오차율순 모드에서 셀마다 만든 p5.Graphics 버퍼와, 매 프레임
// 회전 애니메이션을 다시 그리는 데 필요한 정보(아이템·중심좌표·크기)를
// 함께 들고 있는다. 재빌드 시 정리용으로도 쓰인다.
let gridCells = [];
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

// 방사형(1번) 전용 — generateFlowerItems()에 선·점·선 끝 원 색을
// 더한다. 선·점 색은 오차 데이터와 무관하게 core.js의 pickRadialColors()
// 로 완전히 무작위로 뽑고(팔레트 안에서 선·점이 겹치지 않게), 선 끝을
// 따라가는 원(tipColor)은 그 둘과 겹치지 않는 색을 팔레트에서 하나 더
// 뽑는다(drawRadialBurstFlowerDev용). 아이템마다 한 번만 뽑아 고정한다.
function generateRadialItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    const { lineColor, dotColor } = pickRadialColors();
    item.lineColor = lineColor;
    item.dotColor = dotColor;
    const tipOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== lineColor && c !== dotColor);
    item.tipColor = tipOptions[Math.floor(random(tipOptions.length))];
  });
  return list;
}

function currentItems() {
  return radialItems;
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

// 아이템 하나를 g 위 (cx, cy)에 size로 그린다. lineAngleOffset/
// dotAngleOffset은 회전 애니메이션용(기본 0) — drawRadialBurstFlowerDev
// (디벨롭 버전, 두 번째 선이 좌우반전으로 마는 최종 픽스 모양) —
// overview의 "방사형" 셀과 동일한 그래픽.
function drawItem(item, g, cx, cy, size, lineAngleOffset = 0, dotAngleOffset = 0) {
  drawRadialBurstFlowerDev(
    g,
    cx,
    cy,
    size,
    item.errorA,
    item.errorB,
    item.lineColor,
    item.dotColor,
    item.tipColor,
    true,
    lineAngleOffset,
    dotAngleOffset
  );
}

// 셀별로 만들어뒀던 p5.Graphics 버퍼를 전부 폐기
function clearGridCells() {
  gridCells.forEach(({ gfx }) => gfx.remove());
  gridCells = [];
}

// gridCells에 등록된 모든 셀을 시간(elapsedSec)에 따른 회전 각도로 다시
// 그린다. errorA/errorB로 정해지는 "정지된 한 프레임의 모양"(휘어짐
// 정도·점 거리 등)은 core.js 함수 내부에서 각도 오프셋과 완전히
// 분리돼 있어 여기서 절대 건드리지 않는다.
function renderGridFrame(elapsedSec) {
  const lineAngleOffset = elapsedSec * RADIAL_ROTATION_SPEED;
  const dotAngleOffset = elapsedSec * -RADIAL_ROTATION_SPEED;

  gridCells.forEach(({ gfx, item, cellSize, size }) => {
    gfx.background(0, 0, 0);
    drawItem(item, gfx, cellSize / 2, cellSize / 2, size, lineAngleOffset, dotAngleOffset);
  });
}

// ── 수집순 / 오차율순: 실제 CSS Grid ────────────────────────
//
// 열 수는 이 함수가 아니라 CSS의 auto-fill/minmax가 화면 너비를 보고
// 정한다. 여기서는 (1) 아이템 수만큼 빈 셀 div를 만들어 넣고,
// (2) 브라우저가 레이아웃을 확정한 다음 프레임에 각 셀의 실제 크기를
// 읽어 그 크기의 p5.Graphics를 만들어 셀 안에 넣는다. 그 뒤로는 매
// 프레임 draw()가 renderGridFrame()을 호출해서 회전 애니메이션을 위해
// 계속 다시 그린다.
//
function buildGridView() {
  const holder = document.getElementById('canvas-holder');
  clearGridCells();
  holder.innerHTML = '';

  // 1번(방사형) 탭은 배경을 검게.
  holder.classList.toggle('bg-dark', true);

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

      // createGraphics()의 캔버스는 기본이 display:none(원래 오프스크린 버퍼용)이라
      // DOM에 직접 붙여 보여주려면 켜줘야 한다.
      gfx.canvas.style.display = 'block';
      cellEl.appendChild(gfx.canvas);
      gridCells.push({ gfx, item: items[order[i]], cellSize, size });
    });

    renderGridFrame(millis() / 1000); // 첫 프레임을 즉시 한 번 그려서 애니메이션 시작 전에도 바로 보이게
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
  frameRate(30); // 회전 애니메이션용 — 아이템이 많아 매 프레임 다시 그리는 비용을 아낌

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

// 회전 애니메이션 루프 — 매 프레임 모든 그리드 셀을 새 각도로 다시 그린다.
function draw() {
  if (gridCells.length === 0) return;
  renderGridFrame(millis() / 1000);
}
