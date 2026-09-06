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
     1 방사형 — 방사형 다발 꽃잎. core.js의 drawRadialBurstFlowerDev(디벨롭
       버전, 두 번째 선이 좌우반전으로 마는 최종 픽스 모양)를 쓴다 —
       overview의 "방사형" 셀과 동일한 그래픽. radial/은 아직 이전 버전
       (drawRadialBurstFlower, v1) 그대로다. 예전에 있던 "1a"(줄기형
       비교용 탭)는 삭제됐고, 그 회전 애니메이션만 이 그리드 뷰로
       옮겨와 계속 적용된다(아래 "회전 애니메이션" 참고).
     2 방사형 스포크 — core.js의 drawRadialSpokeDots. overview의 "방사형
       스포크" 셀과 동일한 그래픽(중심에서 뻗는 선분 두 세트 + 끝점 원).
       아이템마다 색 시드(colorSeed)를 한 번 뽑아 고정한다. 배경은 1번과
       동일하게 검게. 탭에 들어올 때 폭죽처럼 터지는 등장 애니메이션이
       한 번 재생되고(아래 "폭죽 등장 애니메이션"), 끝나면 정적으로 멈춘다.
     3 수채화 꽃 — core.js의 drawPistilFlower. overview의 "수채화 꽃"
       셀과 동일한 그래픽(유기적 꽃잎 덩어리 + 위에 얹힌 다른 색 암술).
       아이템마다 색 시드(colorSeed: 꽃잎색·암술색)와 형태 시드
       (shapeSeed: 꽃잎 윤곽·암술 이탈 방향)를 한 번 뽑아 고정한다.
       errorA = 꽃잎 일그러짐, errorB = 암술이 중심에서 벗어난 거리.
       배경은 흰색이고, 애니메이션은 없다(정적). drawPistilFlower 는 겹겹
       blur 필터라 무거워서 매 프레임 다시 그리지 않는다 — 첫 렌더 한 번뿐.

   폭죽 등장 애니메이션 — 2번 탭 버튼(또는 스포크 탭에서 정렬 변경)을
   누르면 buildGridView(true)가 첫 렌더 시점을 t=0으로 잡고,
   drawRadialSpokeDots에 세트별 길이 배율(outerGrow/innerGrow)을 넘긴다.
   두 배율은 0(중심에 뭉침)에서 1(제 크기)로 easeOutExpo(확 퍼졌다가
   감속)로 커지되, 밖지름 세트가 먼저·안지름 세트가 SPOKE_BURST_SET_DELAY
   만큼 늦게 시작한다. 아이템마다 0~SPOKE_BURST_STAGGER_MAX 초의 랜덤
   지연(item.burstDelay)이 붙어 모든 오브젝트가 동시에 터지지 않고
   흩뿌려지듯 순차로 터진다. 회전 애니메이션은 이 탭에 적용하지 않는다.

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

// 2번(방사형 스포크) 탭에 들어올 때 폭죽처럼 터지는 등장 애니메이션.
// 각 선분 세트가 길이 0(중심에 뭉침)에서 제 크기로 easeOutExpo(빠르게
// 확 퍼졌다가 감속)로 커지고, 밖지름 세트가 먼저·안지름 세트가
// SPOKE_BURST_SET_DELAY 만큼 늦게 시작한다.
const SPOKE_BURST_DURATION = 0.5; // 한 세트가 0→제 크기까지 걸리는 시간(초)
const SPOKE_BURST_SET_DELAY = 0.18; // 밖지름 세트 시작 후 안지름 세트가 시작되기까지 지연(초)
const SPOKE_BURST_STAGGER_MAX = 0.7; // 아이템마다 0~이 값(초) 사이의 랜덤 지연을 줘서 동시에 안 터지게 함

let currentShape = 'radial'; // 'radial' | 'radial-spokes' | 'watercolor-flower'
let sortMode = 'collected'; // 'collected' | 'error'

let radialItems = [];
let spokeItems = [];
let pistilItems = [];

// 스포크 등장 애니메이션 시작 시각(초). null이면 애니메이션 중이 아님(정적).
let spokeBurstStart = null;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// 경과 시간(초)과 아이템별 랜덤 지연(itemDelay)에서 밖지름/안지름 세트의
// 현재 길이 배율을 구한다. itemDelay 만큼 이 아이템의 t=0 이 뒤로 밀린다.
function spokeGrowFactors(elapsedSec, itemDelay = 0) {
  if (spokeBurstStart === null) return { outer: 1, inner: 1 };
  const t = elapsedSec - spokeBurstStart - itemDelay;
  return {
    outer: easeOutExpo(clamp01(t / SPOKE_BURST_DURATION)),
    inner: easeOutExpo(clamp01((t - SPOKE_BURST_SET_DELAY) / SPOKE_BURST_DURATION)),
  };
}

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

// 방사형 스포크(2번) 전용 — generateFlowerItems()에 색 시드만 더한다.
// drawRadialSpokeDots는 형태를 core.js의 고정 시드로, 색(선분 두 세트·
// 끝점 원)을 이 colorSeed로 뽑는다. 아이템마다 한 번만 뽑아 고정.
function generateSpokeItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    item.colorSeed = Math.floor(random(1e9));
    item.burstDelay = random(0, SPOKE_BURST_STAGGER_MAX); // 등장 애니메이션 개별 지연
  });
  return list;
}

// 수채화 꽃(3번) 전용 — generateFlowerItems()에 색 시드·형태 시드를 더한다.
// drawPistilFlower는 colorSeed로 꽃잎색·암술색(서로 다른 2색)을, shapeSeed로
// 꽃잎 윤곽과 암술이 벗어나는 방향을 정한다. 아이템마다 한 번만 뽑아 고정.
function generatePistilItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    item.colorSeed = Math.floor(random(1e9));
    item.shapeSeed = Math.floor(random(1e9));
  });
  return list;
}

function currentItems() {
  if (currentShape === 'radial-spokes') return spokeItems;
  if (currentShape === 'watercolor-flower') return pistilItems;
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
function drawItem(item, g, cx, cy, size, lineAngleOffset = 0, dotAngleOffset = 0, grow = null) {
  if (currentShape === 'watercolor-flower') {
    // 애니메이션 없음 — errorA(꽃잎 일그러짐)/errorB(암술 위치)만 반영.
    drawPistilFlower(g, cx, cy, size, item.errorA, item.errorB, item.colorSeed, item.shapeSeed);
    return;
  }
  if (currentShape === 'radial-spokes') {
    // 각도 오프셋(회전)은 안 쓰고, 대신 등장 폭죽 애니메이션의 세트별
    // 길이 배율(grow.outer/grow.inner)을 넘긴다. grow가 null이면 제 크기.
    const og = grow ? grow.outer : 1;
    const ig = grow ? grow.inner : 1;
    drawRadialSpokeDots(g, cx, cy, size, item.errorA, item.errorB, item.colorSeed, og, ig);
    return;
  }
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
  const animated = currentShape === 'radial';
  const lineAngleOffset = animated ? elapsedSec * RADIAL_ROTATION_SPEED : 0;
  const dotAngleOffset = animated ? elapsedSec * -RADIAL_ROTATION_SPEED : 0;
  const spokesBursting = currentShape === 'radial-spokes' && spokeBurstStart !== null;
  const bgBri = currentShape === 'watercolor-flower' ? 100 : 0; // 3번 탭만 흰 배경

  gridCells.forEach(({ gfx, item, cellSize, size }) => {
    gfx.background(0, 0, bgBri);
    // 아이템마다 지연(burstDelay)이 달라 서로 다른 시점에 등장한다(스포크만).
    const grow = spokesBursting ? spokeGrowFactors(elapsedSec, item.burstDelay) : null;
    drawItem(item, gfx, cellSize / 2, cellSize / 2, size, lineAngleOffset, dotAngleOffset, grow);
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
// burst=true 로 부르면(2번 탭 버튼 클릭 시) 첫 렌더 시점을 기준으로
// 폭죽 등장 애니메이션을 시작한다. 리사이즈·정렬 변경은 burst 없이 부른다.
//
function buildGridView(burst = false) {
  const holder = document.getElementById('canvas-holder');
  clearGridCells();
  holder.innerHTML = '';
  spokeBurstStart = null; // 새 빌드 시 일단 정적으로; 아래 첫 렌더에서 필요하면 켠다

  // 배경 — 1·2번 탭은 검게, 3번(수채화 꽃) 탭은 희게.
  const lightBg = currentShape === 'watercolor-flower';
  holder.classList.toggle('bg-dark', !lightBg);
  holder.classList.toggle('bg-light', lightBg);
  // body 밖(#canvas-holder 형제)에 떠 있는 FAB 버튼 색을 배경에 맞추기 위한 플래그.
  document.body.classList.toggle('view-dark', !lightBg);
  document.body.classList.toggle('view-light', lightBg);

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

    if (burst && currentShape === 'radial-spokes') {
      spokeBurstStart = millis() / 1000; // t=0 을 첫 렌더에 맞춘다
    }

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
// 아직 그래픽↔사람 매칭 데이터가 없어서, 지금은 itemId를 그대로
// QR 이미지 번호에 대응시킨다. 수집된 QR 이미지(QR_IMAGE_COUNT장)보다
// 오브젝트(ITEM_COUNT개)가 많으므로, 이미지가 끝나면 1번으로 돌아가
// 순환(모듈러)한다. 실제 매칭 데이터가 모이면 이 부분만 교체하면 된다.
//
const QR_IMAGE_COUNT = 87; // images/qr/qr_final_001.jpg ~ qr_final_087.jpg

// qr_name.json(프로젝트 루트) 에서 qr 번호 → 이름 매핑을 읽어둔다.
// 이미지와 동일하게 QR_IMAGE_COUNT 장을 기준으로 순환하므로 1~87 번만 쓴다.
// '스캔여부' 항목은 사용하지 않는다. 로딩 전/이름 미정 항목은 '익명' 으로 표시.
let qrNames = {}; // { 1: '정솔하', 2: '통대창탕후루', ... }

function loadQrNames() {
  fetch('../qr_name.json')
    .then((res) => res.json())
    .then((list) => {
      list.forEach((row) => {
        const m = String(row.qr_nnn || '').match(/(\d+)$/);
        if (!m) return;
        const n = Number(m[1]);
        if (n >= 1 && n <= QR_IMAGE_COUNT && row['이름']) qrNames[n] = row['이름'];
      });
    })
    .catch(() => {});
}

// itemId(1..ITEM_COUNT) 를 QR 번호(1..QR_IMAGE_COUNT)로 순환시켜 준다.
function qrIndexOf(itemId) {
  return ((Number(itemId) - 1) % QR_IMAGE_COUNT) + 1;
}

function qrImagePath(itemId) {
  const n = qrIndexOf(itemId);
  return `images/qr/qr_final_${String(n).padStart(3, '0')}.jpg`;
}

// 상세 오버레이가 < , > 로 순회할 id 목록과 현재 위치. 오버레이를 열 때
// 그 시점의 정렬 순서(getDisplayOrder)를 그대로 담아두고, 버튼으로
// 앞뒤(끝에서 순환)로 이동한다.
let detailOrderIds = [];
let detailPos = 0;

// 현재 탭·정렬 기준의 표시 순서를 itemId 배열로 반환
function currentOrderedIds() {
  const items = currentItems();
  return getDisplayOrder().map((idx) => items[idx].id);
}

// itemId 하나의 QR·이름을 오버레이에 채운다(열고 닫기는 건드리지 않음)
function fillDetail(itemId) {
  const n = qrIndexOf(itemId);
  document.getElementById('detail-qr').src = qrImagePath(itemId);
  document.getElementById('detail-name').textContent = qrNames[n] || '익명';
}

function openDetailOverlay(itemId) {
  detailOrderIds = currentOrderedIds();
  detailPos = detailOrderIds.indexOf(Number(itemId));
  if (detailPos < 0) detailPos = 0;
  fillDetail(itemId);
  document.getElementById('detail-overlay').classList.add('open');
}

// dir: -1(이전) | +1(다음). 목록 양 끝에서 반대편으로 순환한다.
function stepDetail(dir) {
  if (!detailOrderIds.length) return;
  detailPos = (detailPos + dir + detailOrderIds.length) % detailOrderIds.length;
  fillDetail(detailOrderIds[detailPos]);
}

function closeDetailOverlay() {
  document.getElementById('detail-overlay').classList.remove('open');
}

// ── p5 setup ────────────────────────────────────────────────
function setup() {
  colorMode(HSB, 360, 100, 100);
  frameRate(30); // 회전 애니메이션용 — 아이템이 많아 매 프레임 다시 그리는 비용을 아낌

  loadQrNames(); // qr 번호 → 이름 매핑을 비동기로 읽어둔다(클릭 시점에만 필요)

  radialItems = generateRadialItems();
  spokeItems = generateSpokeItems();
  pistilItems = generatePistilItems();

  const shapeButtons = document.querySelectorAll('.shape-btn');
  shapeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      shapeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentShape = btn.dataset.shape;
      buildGridView(true); // 2번(스포크) 탭이면 폭죽 등장 애니메이션 시작
    });
  });

  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.mode;
      buildGridView(true); // 스포크 탭에선 정렬 변경 때도 폭죽 애니메이션 재생
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

  // < , > 버튼 — 이전/다음 사람의 이미지로. 버튼 클릭이 배경 닫기로
  // 번지지 않도록 stopPropagation.
  document.getElementById('detail-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    stepDetail(-1);
  });
  document.getElementById('detail-next').addEventListener('click', (e) => {
    e.stopPropagation();
    stepDetail(1);
  });

  // 키보드 ← / → 로도 이동(오버레이가 열려 있을 때만), Esc 로 닫기.
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('detail-overlay').classList.contains('open')) return;
    if (e.key === 'ArrowLeft') stepDetail(-1);
    else if (e.key === 'ArrowRight') stepDetail(1);
    else if (e.key === 'Escape') closeDetailOverlay();
  });

  buildGridView();
}

// 화면 회전/리사이즈 시 열 수·셀 크기가 바뀔 수 있으므로 다시 빌드
function windowResized() {
  buildGridView();
}

// 애니메이션 루프
//  · 1번(방사형) : 회전 애니메이션 때문에 매 프레임 다시 그린다.
//  · 2번(스포크) : 평소엔 정적. 폭죽 등장 애니메이션 중(spokeBurstStart !==
//    null)에만 매 프레임 다시 그리고, 두 세트가 다 커지면 멈춘다.
//  · 3번(수채화 꽃) : 항상 정적 — buildGridView의 첫 렌더 이후 다시 안 그린다.
function draw() {
  if (gridCells.length === 0) return;

  if (currentShape === 'radial') {
    renderGridFrame(millis() / 1000);
    return;
  }

  if (currentShape === 'radial-spokes' && spokeBurstStart !== null) {
    const nowSec = millis() / 1000;
    renderGridFrame(nowSec);
    // 가장 늦게 시작하는 아이템(STAGGER_MAX)까지 두 세트가 다 커지면 종료.
    const total = SPOKE_BURST_STAGGER_MAX + SPOKE_BURST_SET_DELAY + SPOKE_BURST_DURATION;
    if (nowSec - spokeBurstStart >= total) {
      spokeBurstStart = null; // 애니메이션 종료 → 이후 정적
    }
  }
}
