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
     방사형    — radial/의 방사형 다발 꽃잎.
     뒤틀림    — twist/의 베지어 뒤틀림 꽃잎.
   네 종류 모두 각자 독립된 200개 데이터셋을 갖는다.

   보기 방식 탭 (오브젝트 종류와 무관하게 적용):
     수집순   — id(1~ITEM_COUNT) 순서 그대로 배치.
     오차율순 — (errorA + errorB) / 2 오름차순(적은 것 → 많은 것)으로 배치.

   두 탭 모두 실제 CSS Grid(grid-template-columns: repeat(auto-fill,
   minmax(...)))로 구현되어 있어 열 수는 브라우저가 화면 너비에 맞춰
   자동으로 정한다. 아이템마다 독립된 <canvas>를 하나씩 담는다.
   ============================================================ */

const ITEM_COUNT = 200;
const CELL_PADDING_RATIO = 0.03; // 칸 안에서 그래픽이 차지하는 여백 비율

let currentShape = 'signature'; // 'signature' | 'grid' | 'radial' | 'twist'
let sortMode = 'collected'; // 'collected' | 'error'

let signatureItems = [];
let gridItems = [];
let radialItems = [];
let twistItems = [];

// TEMP: 3a/4a 줄기형 배치의 현재 레이아웃 상태(애니메이션 프레임마다 재사용).
// 3a/4a 탭이 아닐 땐 null — draw()가 매 프레임 아무것도 안 하고 바로 리턴한다.
let stemAnim = null;

// 수집순/오차율순 모드에서 셀마다 만든 p5.Graphics 버퍼 (재빌드 시 정리용)
let gridGraphics = [];
// 리사이즈·탭 전환이 겹칠 때 오래된 빌드 결과가 뒤늦게 그려지는 것을 막는 토큰
let gridBuildToken = 0;

// errorA/errorB를 한 번만 생성해 고정 (색상은 SQUARE_COLOR/CIRCLE_COLOR로 항상 고정).
function generateSignatureItems() {
  const list = [];
  for (let i = 0; i < ITEM_COUNT; i++) {
    const errorA = random(0, 1);
    const errorB = random(0, 1);

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
    const errorA = random(0, 1);
    const errorB = random(0, 1);

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

// radial/twist는 형태가 core.js의 generateErrorData()(errorA/errorB)만으로
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

function currentItems() {
  const itemsByShape = {
    signature: signatureItems,
    grid: gridItems,
    radial: radialItems,
    twist: twistItems,
    // TEMP: 3a/4a는 3/4과 완전히 같은 데이터셋을 재사용 — 배치 방식(그리드 vs 줄기)만
    // 비교하려는 목적이라, 같은 아이템이 두 배치 방식에서 어떻게 보이는지 맞춰봐야 함.
    'radial-stem': radialItems,
    'twist-stem': twistItems,
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

// shape에 맞는 함수로 아이템 하나를 g 위 (cx, cy)에 size로 그린다.
function drawItem(item, g, cx, cy, size, shape) {
  if (shape === 'signature') {
    drawDistortedRect(g, cx, cy, size, item.errorA, item.errorB, SQUARE_COLOR);
    drawCircle(g, cx, cy, size, item.errorA, CIRCLE_COLOR);
  } else if (shape === 'grid') {
    noiseSeed(hashSeed(item.errorA, item.errorB));
    drawGridMesh(g, cx, cy, size, item.n, item.errorB, GRID_COLOR);
  } else if (shape === 'radial') {
    drawRadialBurstFlower(g, cx, cy, size, item.errorA, item.errorB);
  } else if (shape === 'twist') {
    drawTwistedBezierFlower(g, cx, cy, size, item.errorA, item.errorB);
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

  const shape = currentShape;

  // 3번(방사형)·3a(방사형 줄기형, 임시)는 배경을 검게 — 4a(뒤틀림 줄기형)는
  // 흰 배경이라 제외. 다른 섹션·상단 탭 바에는 영향 없음
  const isDark = shape === 'radial' || shape === 'radial-stem';
  holder.classList.toggle('bg-dark', isDark);

  const isStemView = shape === 'radial-stem' || shape === 'twist-stem';
  holder.classList.toggle('stem-view', isStemView);
  if (!isStemView) {
    stemAnim = null; // 3a/4a를 벗어나면 draw() 루프가 더 이상 할 일이 없게
  }
  if (isStemView) {
    buildStemView(shape);
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
      if (shape === 'radial') {
        gfx.background(0, 0, 0); // 3번(방사형)만 배경 검정으로 테스트
      } else {
        gfx.background(0, 0, 96);
      }
      drawItem(items[order[i]], gfx, cellSize / 2, cellSize / 2, size, shape);

      // createGraphics()의 캔버스는 기본이 display:none(원래 오프스크린 버퍼용)이라
      // DOM에 직접 붙여 보여주려면 켜줘야 한다.
      gfx.canvas.style.display = 'block';
      cellEl.appendChild(gfx.canvas);
      gridGraphics.push(gfx);
    });
  });
}

// ── TEMP: 3a/4a — 줄기형 배치(그리드 대신 일정 간격 줄기 위에 꽃들) ──
//
// 3/4번과 그래픽 생성 로직은 완전히 동일하고(drawRadialBurstFlower /
// drawTwistedBezierFlower 그대로 재사용), 배치 방식만 다르다.
//
// 줄기는 이제 아이템 하나당 하나가 아니라, CSS 그리드의 auto-fill처럼
// 화면 폭에 맞춰 "몇 개가 들어갈지"만 정해지는 배경 구조물이다(일정한
// 간격으로 세로 전체 길이). 아이템은 항상 수집순(id 순서)으로, 첫 번째
// 줄기에 위→아래로 채우고, 다 차면 다음 줄기로 넘어가는 방식으로 배치
// (오차율순 정렬은 여기서는 적용하지 않음). 가로 스크롤은 절대 생기지
// 않고(줄기 개수 자체가 화면 폭에 맞춰 줄어들거나 늘어남), 아이템이
// 많아 한 줄기에 다 못 채우면 세로 스크롤만 생긴다.
//
// 회전 애니메이션 — drawRadialBurstFlower/drawTwistedBezierFlower에 넘기는
// 각도 오프셋만 시간에 따라 계속 바뀌는 방식이라, 정지된 한 프레임의
// 모양(휘어짐 정도·점 거리·트위스트 폭)은 오차 데이터 그대로 정확히
// 유지된다. 대신 "얼마나 빨리 도는가"는 오차값에 따라 아이템마다
// 달라진다 — 오차가 클수록 더 빠르게 돈다. 3a(방사형)는 호 그룹
// (errorB)과 점 그룹(errorA)이, 4a(뒤틀림)는 베지어를 더 많이 타는 잎
// 그룹(errorB, 홀수 인덱스)과 통통한 잎 그룹(errorA, 짝수 인덱스)이 —
// 각자의 오차값으로 서로 다른 속도·반대 방향으로 따로 돈다.
//
const STEM_COLUMN_MIN_WIDTH = 110; // 줄기 하나가 최소로 차지하는 가로 폭(이 폭 기준으로 줄기 개수 계산)
const STEM_FLOWER_SIZE = 90; // 꽃 그래픽 크기(정사각형 한 변 기준)
const STEM_ROW_SPACING = 130; // 한 줄기 안에서 꽃과 꽃 사이의 세로 간격
const STEM_TOP_PADDING = 70; // 캔버스 맨 위 ~ 첫 꽃 중심까지 여백
const STEM_BOTTOM_PADDING = 40; // 마지막 꽃 중심 ~ 캔버스 맨 아래까지 여백
const STEM_MARGIN_TOP = 12; // 줄기 선 자체의 시작(캔버스 맨 위에서)
const STEM_MARGIN_BOTTOM = 12; // 줄기 선 자체의 끝(캔버스 맨 아래에서)
const STEM_WEIGHT_RADIAL = 10; // 3a 줄기 굵기 (기존 5의 1.5배)
const STEM_WEIGHT_TWIST = 5; // 4a 줄기 굵기 (변경 없음)
// 회전 속도 범위(rad/s) — errorA/errorB = 0일 때 MIN, 1일 때 MAX.
// 부호는 방향이라 map()은 절댓값 범위로 계산하고 부호만 곱한다.
const STEM_RADIAL_LINE_SPEED_MIN = 0.04; // 3a 호 그룹 — errorB = 0
const STEM_RADIAL_LINE_SPEED_MAX = 0.45; // 3a 호 그룹 — errorB = 1
const STEM_RADIAL_DOT_SPEED_MIN = 0.04; // 3a 점 그룹 — errorA = 0
const STEM_RADIAL_DOT_SPEED_MAX = 0.6; // 3a 점 그룹 — errorA = 1
const STEM_TWIST_TWISTED_SPEED_MIN = 0.03; // 4a 베지어를 더 타는 잎 그룹(홀수 인덱스) — errorB = 0
const STEM_TWIST_TWISTED_SPEED_MAX = 0.4; // 4a 베지어를 더 타는 잎 그룹(홀수 인덱스) — errorB = 1
const STEM_TWIST_PLUMP_SPEED_MIN = 0.03; // 4a 통통한 잎 그룹(짝수 인덱스) — errorA = 0
const STEM_TWIST_PLUMP_SPEED_MAX = 0.5; // 4a 통통한 잎 그룹(짝수 인덱스) — errorA = 1

// 스케일 애니메이션 — 회전과 달리 오차 데이터와 완전히 무관하게, 그냥
// 아이템마다 제각각인 느낌만 내려고 id를 시드로 쓴 의사난수로 커졌다
// 작아졌다 하는 주기·위상을 정한다(3a/4a 공통). sin()의 형태 자체가
// 양 끝(최대/최소)에서 속도가 0이 되는 ease-in-out 곡선이라 별도의
// 이징 함수 없이 자연스럽게 부드러운 확대/축소가 나온다.
const STEM_SCALE_MIN_RATIO = 0.85; // 최소 크기 = STEM_FLOWER_SIZE × 이 비율
const STEM_SCALE_MAX_RATIO = 1.4; // 최대 크기 = STEM_FLOWER_SIZE × 이 비율(살짝 겹쳐도 재미있어서 여유 있게)
const STEM_SCALE_PERIOD_MIN = 2.5; // 한 번 커졌다 작아지는 데 걸리는 시간(초) — 최소
const STEM_SCALE_PERIOD_MAX = 5; // 한 번 커졌다 작아지는 데 걸리는 시간(초) — 최대

// Math.sin 기반 간단한 의사난수(0~1) — seed가 같으면 항상 같은 값이라,
// 매 프레임 다시 계산해도(=매번 새로 생성해도) 아이템마다 항상 같은
// 위상·주기를 유지한다.
function pseudoRandom01(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// 레이아웃을 매 프레임 다시 계산하지 않도록, 탭 진입/리사이즈 시 한 번만
// 계산해서 stemAnim에 저장해두고 draw()에서는 각도만 갱신해 다시 그린다.
function buildStemView(shape) {
  const holder = document.getElementById('canvas-holder');
  const items = currentItems(); // 항상 생성 순서(=수집순) 그대로 사용
  const isTwist = shape === 'twist-stem';

  const canvasWidth = Math.max(1, Math.round(holder.clientWidth));
  const numStems = Math.max(1, Math.floor(canvasWidth / STEM_COLUMN_MIN_WIDTH));
  const columnSpacing = canvasWidth / numStems;
  const rowsPerStem = Math.max(1, Math.ceil(items.length / numStems));

  const contentHeight = STEM_TOP_PADDING + (rowsPerStem - 1) * STEM_ROW_SPACING + STEM_BOTTOM_PADDING;
  const canvasHeight = Math.max(Math.round(holder.clientHeight), contentHeight);

  // 3a(방사형)는 검정 배경+올리브그린 줄기, 4a(뒤틀림)는 흰 배경+검정 줄기 —
  // 4번 그래픽은 원래 흰 배경 기준으로 색을 맞춰뒀기 때문.
  const bgBri = isTwist ? 96 : 0;
  const stemColor = isTwist ? '#111' : '#3b6d2d';
  const stemWeight = isTwist ? STEM_WEIGHT_TWIST : STEM_WEIGHT_RADIAL;

  const density = Math.min(window.devicePixelRatio || 1, 2);
  const gfx = createGraphics(canvasWidth, canvasHeight);
  gfx.pixelDensity(density);
  gfx.colorMode(HSB, 360, 100, 100);

  gfx.canvas.style.display = 'block';
  holder.appendChild(gfx.canvas);
  gridGraphics.push(gfx);

  stemAnim = {
    shape,
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
// 모양"(휘어짐 정도·점 거리·트위스트 폭 등)은 core.js 함수 내부에서
// 각도 오프셋과 완전히 분리돼 있어 여기서 절대 건드리지 않는다 — 대신
// 그 각도 오프셋이 시간에 비례하는 "속도" 자체를 아이템의 오차값으로
// 정해서, 오차가 클수록 더 빠르게 도는 것으로 재미를 준다.
function renderStemFrame(elapsedSec) {
  const s = stemAnim;
  if (!s) return;
  const { gfx } = s;
  const isTwist = s.shape === 'twist-stem';

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

    // 스케일 펄스 — id를 시드로 아이템마다 다른 위상·주기를 갖는
    // sin 파동. -1~1을 STEM_SCALE_MIN_RATIO~MAX_RATIO로 매핑해서
    // ease-in-out으로 커졌다 작아졌다 하는 크기를 만든다.
    const scalePhase = pseudoRandom01(item.id * 1.618) * TWO_PI;
    const scalePeriod = map(pseudoRandom01(item.id * 2.718), 0, 1, STEM_SCALE_PERIOD_MIN, STEM_SCALE_PERIOD_MAX);
    const scaleWave = Math.sin((TWO_PI * elapsedSec) / scalePeriod + scalePhase);
    const scaleRatio = map(scaleWave, -1, 1, STEM_SCALE_MIN_RATIO, STEM_SCALE_MAX_RATIO);
    const flowerSize = STEM_FLOWER_SIZE * scaleRatio;

    if (!isTwist) {
      // 호 그룹은 시계 방향(+), 점 그룹은 반시계 방향(-) — 방향은 고정,
      // 속도(크기)만 각자의 오차값으로 아이템마다 달라진다.
      const lineSpeed = map(item.errorB, 0, 1, STEM_RADIAL_LINE_SPEED_MIN, STEM_RADIAL_LINE_SPEED_MAX);
      const dotSpeed = map(item.errorA, 0, 1, STEM_RADIAL_DOT_SPEED_MIN, STEM_RADIAL_DOT_SPEED_MAX);
      const lineAngleOffset = elapsedSec * lineSpeed;
      const dotAngleOffset = elapsedSec * -dotSpeed;
      drawRadialBurstFlower(gfx, cx, cy, flowerSize, item.errorA, item.errorB, lineAngleOffset, dotAngleOffset);
    } else {
      // 베지어를 더 타는 잎(홀수 인덱스)은 errorB, 통통한 잎(짝수 인덱스)은
      // errorA로 각자 속도가 정해지고, 방향도 서로 반대(3a와 동일한 패턴).
      const twistedSpeed = map(item.errorB, 0, 1, STEM_TWIST_TWISTED_SPEED_MIN, STEM_TWIST_TWISTED_SPEED_MAX);
      const plumpSpeed = map(item.errorA, 0, 1, STEM_TWIST_PLUMP_SPEED_MIN, STEM_TWIST_PLUMP_SPEED_MAX);
      const twistedAngleOffset = elapsedSec * twistedSpeed;
      const plumpAngleOffset = elapsedSec * -plumpSpeed;
      drawTwistedBezierFlower(gfx, cx, cy, flowerSize, item.errorA, item.errorB, twistedAngleOffset, plumpAngleOffset);
    }
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
  frameRate(30); // 3a/4a 회전 애니메이션용 — 아이템이 많아 매 프레임 다시 그리는 비용을 아낌

  signatureItems = generateSignatureItems();
  gridItems = generateGridItems();
  radialItems = generateFlowerItems();
  twistItems = generateFlowerItems();

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

// TEMP: 3a/4a 회전 애니메이션 루프. stemAnim이 없으면(=3a/4a 탭이 아니면)
// 바로 리턴 — 다른 탭에서는 아무 비용도 들지 않는다.
function draw() {
  if (!stemAnim) return;
  renderStemFrame(millis() / 1000);
}
