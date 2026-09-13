/* ============================================================
   Signature Archive — sketch.js
   ------------------------------------------------------------
   errorA/errorB는 qr_error_data.json(프로젝트 루트)에 담긴 실제 추출
   데이터를 그대로 쓴다 — 키(qr_clean_NNN)의 번호가 QR 이미지 번호와
   동일해 1:1로 매칭된다. ITEM_COUNT는 이 데이터 개수로 정해진다(현재
   151). 그래픽 생성 로직은 shared/core.js를 공유 (radial/의 슬라이더
   페이지와 동일한 규칙).

   각 데이터는 1~ITEM_COUNT번 번호(제출 순서)를 갖는다. 탭으로 정렬
   기준을 바꿔도 이 번호와 그래픽 자체는 그대로이고, 배치 순서만 바뀐다.

   오브젝트 종류 탭:
     1 방사형 — 방사형 다발 꽃잎. core.js의 drawRadialBurstFlowerDev(디벨롭
       버전, 두 번째 선이 좌우반전으로 마는 최종 픽스 모양)를 쓴다 —
       overview의 "방사형" 셀과 동일한 그래픽. 2번 탭과 마찬가지로 탭에
       들어올 때 폭죽처럼 터지는 등장 애니메이션이 한 번 재생되고(아래
       "폭죽 등장 애니메이션"), 끝나면 정적으로 멈춘다. 회전 애니메이션은
       삭제됨.
     2 방사형 스포크 — core.js의 drawRadialSpokeDots. overview의 "방사형
       스포크" 셀과 동일한 그래픽(중심에서 뻗는 선분 두 세트 + 끝점 원).
       아이템마다 색 시드(colorSeed)를 한 번 뽑아 고정한다. 배경은 1번과
       동일하게 검게. 탭에 들어올 때 폭죽처럼 터지는 등장 애니메이션이
       한 번 재생되고(아래 "폭죽 등장 애니메이션"), 끝나면 정적으로 멈춘다.

   폭죽 등장 애니메이션 — 1·2번 탭 버튼(또는 그 탭에서 정렬 변경, 첫
   로드)을 누르면 buildGridView(true)가 첫 렌더 시점을 t=0(burstStart)으로
   잡는다. 아이템마다 0~*_BURST_STAGGER_MAX 초의 랜덤 지연(item.burstDelay)
   이 붙어 모든 오브젝트가 동시에 터지지 않고 흩뿌려지듯 순차로 터진다.
     · 2번(스포크) — drawRadialSpokeDots에 세트별 길이 배율(outerGrow/
       innerGrow, perSpokeBurst=false)을 넘긴다. 0(중심에 뭉침)→1(제 크기)로
       easeOutExpo(확 퍼졌다가 감속), 밖지름 세트가 먼저·안지름 세트가
       SPOKE_BURST_SET_DELAY만큼 늦게 시작. 세트 전체가 한 덩어리로 움직인다
       — 상세 박스(아래 "상세 박스 등장 애니메이션")는 이와 다른 방식.
     · 1번(방사형) — drawRadialBurstFlowerDev에 scale 배율을 둘로 나눠
       넘긴다. lineGrow = 선분(호) + 그 끝을 따라가는 원(같이 움직임),
       dotGrow = 중심에서 멀어지는 원(따로). 각각 중심 기준 0→1 로
       easeOutExpo, 선분이 먼저·중심-거리 원이 RADIAL_BURST_SET_DELAY
       만큼 늦게 시작(그래픽 자체는 안 건드리고 캔버스 변형만).

   상세 박스 등장 애니메이션 — 2번(스포크) 탭에서만, 카드를 클릭해 QR
   면 → 그래픽 면으로 뒤집힐 때 재생된다(flipDetail()). 그리드와 달리
   drawRadialSpokeDots를 perSpokeBurst=true로 불러, 세트가 한 덩어리로
   커지지 않고 core.js(buildRadialSpokeGeometry)가 선분마다 개별 랜덤
   시작 시점(RADIAL_SPOKE_BURST_STAGGER_RATIO)을 뽑아 각자 다른 타이밍에
   0(중심에 뭉침)→1(제 크기)로 퍼진다. 두 모드 모두 선분당 rnd() 소비량이
   같아, 애니메이션이 끝난 뒤의 형태는 그리드에서 본 것과 항상 동일하다.
   1번(방사형) 탭은 상세 박스에서도 정지 프레임 그대로(기존 동작).

   보기 방식 탭 (오브젝트 종류와 무관하게 적용):
     수집순   — id(1~ITEM_COUNT) 순서 그대로 배치.
     오차율순 — (errorA + errorB) / 2 오름차순(적은 것 → 많은 것)으로 배치.

   두 탭 모두 실제 CSS Grid(grid-template-columns: repeat(auto-fill,
   minmax(...)))로 구현되어 있어 열 수는 브라우저가 화면 너비에 맞춰
   자동으로 정한다. 아이템마다 독립된 <canvas>를 하나씩 담는다.
   ============================================================ */

let ITEM_COUNT = 0; // qrErrorData 로딩 후 그 개수로 정해진다(setup 참고)
const CELL_PADDING_RATIO = 0.03; // 칸 안에서 그래픽이 차지하는 여백 비율

// 1번(방사형) 탭에 들어올 때 폭죽처럼 터지는 등장 애니메이션.
// 선분(+선 끝 원)과 중심-거리 원을 각각 중심 기준 scale 0→1 로 easeOutExpo
// 하며 키우되, 2번(스포크)처럼 중심-거리 원이 RADIAL_BURST_SET_DELAY 만큼
// 늦게 시작.
const RADIAL_BURST_DURATION = 0.5; // 한 그룹이 0→제 크기까지 걸리는 시간(초)
const RADIAL_BURST_SET_DELAY = 0.18; // 선분 시작 후 중심-거리 원이 시작되기까지 지연(초)
const RADIAL_BURST_STAGGER_MAX = 0.7; // 아이템마다 0~이 값(초) 사이의 랜덤 지연

// 2번(방사형 스포크) 탭에 들어올 때 폭죽처럼 터지는 등장 애니메이션.
// 각 선분 세트가 길이 0(중심에 뭉침)에서 제 크기로 easeOutExpo(빠르게
// 확 퍼졌다가 감속)로 커지고, 밖지름 세트가 먼저·안지름 세트가
// SPOKE_BURST_SET_DELAY 만큼 늦게 시작한다.
const SPOKE_BURST_DURATION = 0.5; // 한 세트가 0→제 크기까지 걸리는 시간(초)
const SPOKE_BURST_SET_DELAY = 0.18; // 밖지름 세트 시작 후 안지름 세트가 시작되기까지 지연(초)
const SPOKE_BURST_STAGGER_MAX = 0.7; // 아이템마다 0~이 값(초) 사이의 랜덤 지연을 줘서 동시에 안 터지게 함

let currentShape = 'radial'; // 'radial' | 'radial-spokes'
let sortMode = 'collected'; // 'collected' | 'error'

let radialItems = [];
let spokeItems = [];

// qr_error_data.json에서 읽은 실제 데이터. { n, errorA, errorB } 를
// n(QR 번호) 오름차순으로 정렬해서 담아둔다. loadErrorData()가 채운다.
let qrErrorData = [];

// 등장(폭죽) 애니메이션 시작 시각(초). null이면 애니메이션 중이 아님(정적).
// 1번(방사형)·2번(스포크) 탭이 공유한다.
let burstStart = null;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// 1번(방사형) — 아이템별 랜덤 지연(itemDelay)을 반영한 현재 scale 배율.
//   line : 선분(호) + 그 끝을 따라가는 원 (같이 움직임)
//   dot  : 중심에서 멀어지는 errorA-거리 원 (RADIAL_BURST_SET_DELAY 만큼 늦게)
function radialGrowFactors(elapsedSec, itemDelay = 0) {
  if (burstStart === null) return { line: 1, dot: 1 };
  const t = elapsedSec - burstStart - itemDelay;
  return {
    line: easeOutExpo(clamp01(t / RADIAL_BURST_DURATION)),
    dot: easeOutExpo(clamp01((t - RADIAL_BURST_SET_DELAY) / RADIAL_BURST_DURATION)),
  };
}

// 2번(스포크) — 경과 시간과 아이템별 랜덤 지연(itemDelay)에서 밖지름/안지름
// 세트의 현재 길이 배율을 구한다. itemDelay 만큼 이 아이템의 t=0 이 밀린다.
// 그리드 진입 애니메이션 전용 — 세트 전체가 한 덩어리로 0→1 easeOutExpo
// (core.js에 perSpokeBurst=false로 넘겨 그대로 최종 배율로 쓰임). 상세
// 박스 전용 애니메이션은 drawDetailFrame이 따로 계산한다.
function spokeGrowFactors(elapsedSec, itemDelay = 0) {
  if (burstStart === null) return { outer: 1, inner: 1 };
  const t = elapsedSec - burstStart - itemDelay;
  return {
    outer: easeOutExpo(clamp01(t / SPOKE_BURST_DURATION)),
    inner: easeOutExpo(clamp01((t - SPOKE_BURST_SET_DELAY) / SPOKE_BURST_DURATION)),
  };
}

// 수집순/오차율순 모드에서 셀마다 만든 p5.Graphics 버퍼와, 등장 애니메이션
// 프레임을 다시 그리는 데 필요한 정보(아이템·중심좌표·크기)를 함께 들고
// 있는다. 재빌드 시 정리용으로도 쓰인다.
let gridCells = [];
// 리사이즈·탭 전환이 겹칠 때 오래된 빌드 결과가 뒤늦게 그려지는 것을 막는 토큰
let gridBuildToken = 0;

// qrErrorData 실측값은 대부분 낮은 구간에 몰려있고 소수의 극단치가 범위를
// 넓게 늘려놓은 형태라(특히 unfilledRate — 중앙값이 전체 폭의 7% 지점),
// min-max로 최소~최대만 0~1로 펴면 그 쏠림이 그대로 남아 다수가 여전히
// 좁은 구간에 압축된다. 대신 퍼센타일(순위) 정규화를 쓴다 — 값의 절대
// 크기가 아니라 151명 중 몇 번째로 큰지(순위)만으로 0~1에 고르게 배치하므로
// 극단치 크기와 무관하게 전 구간을 고르게 쓰게 된다. 동점은 평균 순위로
// 묶어 처리(순서를 임의로 가르지 않음).
function normalizeErrorAxis(values) {
  const n = values.length;
  if (n <= 1) return values.map(() => 0);

  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const avgRank = (i + j) / 2; // 동점 구간(i..j)은 순위를 평균내 공유
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }
  return ranks.map((r) => r / (n - 1));
}

// radial은 형태가 errorA/errorB만으로 결정되므로 아이템 생성 로직을
// 공유한다. qrErrorData(실제 데이터, setup에서 로딩 완료 후 호출)의
// n을 그대로 id로 써서 QR 번호와 1:1로 맞추고, errorA/errorB는 각각
// 축별로 정규화한 값을 쓴다.
function generateFlowerItems() {
  const normA = normalizeErrorAxis(qrErrorData.map((d) => d.errorA));
  const normB = normalizeErrorAxis(qrErrorData.map((d) => d.errorB));

  return qrErrorData.map((d, i) => ({
    id: d.n,
    errorA: normA[i],
    errorB: normB[i],
    errorScore: (normA[i] + normB[i]) / 2,
  }));
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
    item.burstDelay = random(0, RADIAL_BURST_STAGGER_MAX); // 등장 애니메이션 개별 지연
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

function currentItems() {
  if (currentShape === 'radial-spokes') return spokeItems;
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

// 아이템 하나를 g 위 (cx, cy)에 size로 그린다. grow는 등장(폭죽)
// 애니메이션용 — 2번(스포크)은 { outer, inner } 길이 배율, 1번(방사형)은
// { line, dot } scale 배율. null이면 제 크기(정적). perSpokeBurst는
// 2번(스포크)에만 해당 — false(기본, 그리드)면 grow.outer/inner를 세트
// 전체의 최종 배율로, true(상세 박스)면 세트 공통 경과(0~1, 선형)로 보고
// core.js가 선분마다 개별 랜덤 지연을 준다.
function drawItem(item, g, cx, cy, size, grow = null, perSpokeBurst = false) {
  if (currentShape === 'radial-spokes') {
    // grow.outer/grow.inner — perSpokeBurst에 따라 최종 배율 또는 선형
    // 경과, 둘 중 무엇이든 core.js가 그대로 받아 처리한다.
    const og = grow ? grow.outer : 1;
    const ig = grow ? grow.inner : 1;
    drawRadialSpokeDots(g, cx, cy, size, item.errorA, item.errorB, item.colorSeed, og, ig, perSpokeBurst);
    return;
  }
  // 방사형(1번) — 선분(+끝 원)과 중심-거리 원을 각각 다른 배율로 넘겨
  // 순차 등장시킨다.
  const lg = grow ? grow.line : 1;
  const dg = grow ? grow.dot : 1;
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
    0,
    0,
    lg,
    dg
  );
}

// 셀별로 만들어뒀던 p5.Graphics 버퍼를 전부 폐기
function clearGridCells() {
  gridCells.forEach(({ gfx }) => gfx.remove());
  gridCells = [];
}

// gridCells에 등록된 모든 셀을 현재 등장 애니메이션 진행도에 맞춰 다시
// 그린다. errorA/errorB로 정해지는 그래픽 자체의 모양은 건드리지 않고,
// 스포크는 선분 길이 배율, 방사형은 캔버스 scale 만 시간에 따라 바꾼다.
function renderGridFrame(elapsedSec) {
  const bursting = burstStart !== null;

  gridCells.forEach(({ gfx, item, cellSize, size }) => {
    gfx.background(0, 0, 0);
    // 아이템마다 지연(burstDelay)이 달라 서로 다른 시점에 등장한다.
    let grow = null;
    if (bursting && currentShape === 'radial-spokes') {
      grow = spokeGrowFactors(elapsedSec, item.burstDelay);
    } else if (bursting && currentShape === 'radial') {
      grow = radialGrowFactors(elapsedSec, item.burstDelay);
    }
    drawItem(item, gfx, cellSize / 2, cellSize / 2, size, grow);
  });
}

// ── 수집순 / 오차율순: 실제 CSS Grid ────────────────────────
//
// 열 수는 이 함수가 아니라 CSS의 auto-fill/minmax가 화면 너비를 보고
// 정한다. 여기서는 (1) 아이템 수만큼 빈 셀 div를 만들어 넣고,
// (2) 브라우저가 레이아웃을 확정한 다음 프레임에 각 셀의 실제 크기를
// 읽어 그 크기의 p5.Graphics를 만들어 셀 안에 넣는다. 그 뒤로는 매
// 프레임 draw()가 renderGridFrame()을 호출해서 등장 애니메이션이 끝날
// 때까지 계속 다시 그린다.
//
// burst=true 로 부르면(1·2번 탭 버튼 클릭, 그 탭에서 정렬 변경, 첫 로드)
// 첫 렌더 시점을 기준으로 폭죽 등장 애니메이션을 시작한다. 리사이즈는
// burst 없이 부른다.
//
function buildGridView(burst = false) {
  const holder = document.getElementById('canvas-holder');
  clearGridCells();
  holder.innerHTML = '';
  burstStart = null; // 새 빌드 시 일단 정적으로; 아래 첫 렌더에서 필요하면 켠다

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

    if (burst && (currentShape === 'radial' || currentShape === 'radial-spokes')) {
      burstStart = millis() / 1000; // t=0 을 첫 렌더에 맞춘다
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
// qrErrorData의 id가 실제 QR 번호이자 itemId이므로 QR 이미지도 같은
// 번호로 그대로 대응된다(1:1). ITEM_COUNT와 QR_IMAGE_COUNT가 항상
// 같은 수(현재 151)라 아래 모듈러 순환은 사실상 항등함수로 동작하지만,
// 혹시 둘의 개수가 어긋나는 경우를 대비해 남겨둔다.
//
const QR_IMAGE_COUNT = 151; // images/qr/qr_final_001.jpg ~ qr_final_151.jpg

// qr_error_data.json(프로젝트 루트) 에서 실제 errorA(unfilledRate)/
// errorB(overflowRate) 데이터를 읽어 n(QR 번호) 오름차순으로 정렬해
// qrErrorData에 채운다. setup()에서 완료를 기다린 뒤 아이템을 만든다.
function loadErrorData() {
  return fetch('../qr_error_data.json')
    .then((res) => res.json())
    .then((obj) => {
      const arr = Object.entries(obj)
        .map(([key, row]) => {
          const m = String(key).match(/(\d+)$/);
          if (!m) return null;
          return { n: Number(m[1]), errorA: row.unfilledRate, errorB: row.overflowRate };
        })
        .filter(Boolean)
        .sort((a, b) => a.n - b.n);
      qrErrorData = arr;
    })
    .catch(() => {
      qrErrorData = [];
    });
}

// qr_name.json(프로젝트 루트) 에서 qr 번호 → 이름 매핑을 읽어둔다.
// 이미지와 동일하게 QR_IMAGE_COUNT 장을 기준으로 순환하므로 1~151 번만 쓴다.
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

function itemById(id) {
  return currentItems().find((it) => it.id === Number(id));
}

// 상세 박스 안에 그려두는 그래픽 오브젝트 버퍼. 열 때마다 새로 만들고
// 닫을 때/다음 항목으로 넘어갈 때 폐기한다.
let detailGfx = null;
// 박스를 클릭할 때마다 카드를 같은 방향으로 180도씩 돌린다(누적 각도).
// 360의 배수면 오브젝트 면, 360k+180이면 QR 면. 여는 시점은 QR 면.
let detailFlipAngle = 0;

// 2번(스포크) 탭에서만: 상세 박스 그래픽에도 그리드와 같은 폭죽 등장
// 애니메이션을 준다. QR 면(여는 시점)에서는 'collapsed'(중심에 뭉쳐 대기),
// flipDetail()로 그래픽 면이 드러나는 순간 'running'으로 전환해 재생하고,
// 다시 QR 면으로 돌아가면 다음 재생을 위해 'collapsed'로 되돌린다.
// 1번(방사형) 탭은 항상 'none'(정지 프레임)으로, 기존 동작 그대로.
let detailAnimPhase = 'none'; // 'none' | 'collapsed' | 'running'
let detailBurstStart = null; // 'running' 시작 시각(초). 그리드의 burstStart와 별개.
let detailRenderInfo = null; // { g, item, cx, cy, size } — 애니메이션 프레임마다 다시 그리는 데 필요

// 상세 박스 안에 해당 아이템의 그래픽 오브젝트를 새 p5.Graphics 버퍼에 만든다.
function renderDetailGraphic(itemId) {
  const holder = document.getElementById('detail-graphic');
  if (detailGfx) {
    detailGfx.remove();
    detailGfx = null;
  }
  holder.innerHTML = '';

  const item = itemById(itemId);
  detailRenderInfo = null;
  if (!item) return;

  const R = 520; // 렌더 해상도(표시는 CSS가 박스 폭에 맞춰 축소)
  const density = Math.min(window.devicePixelRatio || 1, 2);
  const g = createGraphics(R, R);
  g.pixelDensity(density);
  g.colorMode(HSB, 360, 100, 100);
  // p5는 캔버스에 인라인 width/height(px)를 박아서 박스를 초과한다.
  // 컨테이너(#detail-media, QR 이미지와 동일 영역)에 꽉 맞도록 덮어쓴다.
  g.canvas.style.display = 'block';
  g.canvas.style.width = '100%';
  g.canvas.style.height = '100%';

  const pad = R * CELL_PADDING_RATIO;
  detailRenderInfo = { g, item, cx: R / 2, cy: R / 2, size: R - pad * 2 };

  // 2번(스포크) 탭은 QR 면부터 보이므로 그래픽은 일단 중심에 뭉친 채
  // 대기, 1번(방사형) 탭은 기존처럼 바로 정지 프레임으로.
  detailAnimPhase = currentShape === 'radial-spokes' ? 'collapsed' : 'none';
  detailBurstStart = null;
  drawDetailFrame();

  holder.appendChild(g.canvas);
  detailGfx = g;
}

// detailRenderInfo · detailAnimPhase 에 맞춰 상세 박스 그래픽을 한 프레임 그린다.
function drawDetailFrame() {
  if (!detailRenderInfo) return;
  const { g, item, cx, cy, size } = detailRenderInfo;
  g.background(0, 0, 100); // 상세 박스 안에서는 탭 1·2 모두 흰 배경으로 통일

  // 상세 박스는 그리드와 다른 애니메이션 방식(perSpokeBurst=true) — 선분별
  // 개별 지연·easeOutExpo는 core.js의 buildRadialSpokeGeometry가 처리하므로,
  // 여기서는 선형(미가공) 진행도만 넘긴다.
  let grow = null;
  if (detailAnimPhase === 'collapsed') {
    grow = { outer: 0, inner: 0 }; // 중심에 뭉쳐 대기(아직 안 보이는 면)
  } else if (detailAnimPhase === 'running' && detailBurstStart !== null) {
    const t = millis() / 1000 - detailBurstStart;
    grow = {
      outer: clamp01(t / SPOKE_BURST_DURATION),
      inner: clamp01((t - SPOKE_BURST_SET_DELAY) / SPOKE_BURST_DURATION),
    };
  }
  drawItem(item, g, cx, cy, size, grow, true);
}

// 누적 각도를 카드에 적용한다. data-stage 는 참고용(현재 보이는 면).
function applyDetailFlip() {
  const media = document.getElementById('detail-media');
  media.dataset.stage = (detailFlipAngle / 180) % 2 === 0 ? 'graphic' : 'qr';
  document.getElementById('detail-flipper').style.transform = `rotateY(${detailFlipAngle}deg)`;
}

// QR 면으로 즉시 맞춘다(오버레이 열 때/항목 이동 시). 트랜지션을 잠깐
// 꺼서 플립 애니메이션 없이 곧바로 QR 면이 보이게 한다 — 안 그러면
// 새 항목의 오브젝트가 잠깐 보였다가 QR로 넘어가는 잔상이 생긴다.
function resetDetailFlip() {
  const flipper = document.getElementById('detail-flipper');
  flipper.style.transition = 'none';
  detailFlipAngle = 180; // QR 면
  applyDetailFlip();
  flipper.offsetHeight; // 리플로우 강제 → 이후 클릭부터 다시 트랜지션 적용
  flipper.style.transition = '';
}

// 박스 클릭 시 같은 방향으로 한 번 더 뒤집는다.
function flipDetail() {
  detailFlipAngle += 180;
  applyDetailFlip();

  // 2번(스포크) 탭에서만: 그래픽 면으로 넘어가는 순간 폭죽 등장 애니메이션을
  // 재생하고, QR 면으로 돌아가면 다음 재생을 위해 다시 중심에 뭉쳐둔다.
  if (currentShape === 'radial-spokes' && detailRenderInfo) {
    const showingGraphic = document.getElementById('detail-media').dataset.stage === 'graphic';
    if (showingGraphic) {
      detailAnimPhase = 'running';
      detailBurstStart = millis() / 1000;
    } else {
      detailAnimPhase = 'collapsed';
      detailBurstStart = null;
      drawDetailFrame();
    }
  }
}

// itemId 하나로 오버레이 내용을 채운다 — 그래픽 오브젝트를 먼저 보여주고
// (stage='graphic'), 이름·QR 이미지는 준비만 해둔다. 열고 닫기는 안 건드림.
function fillDetail(itemId) {
  const n = qrIndexOf(itemId);
  document.getElementById('detail-qr').src = qrImagePath(itemId);
  document.getElementById('detail-name').textContent = qrNames[n] || '익명';
  renderDetailGraphic(itemId);
  resetDetailFlip(); // QR 면부터 시작(클릭 시 한 방향으로 뒤집혀 오브젝트 표시)
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
  if (detailGfx) {
    detailGfx.remove();
    detailGfx = null;
  }
  detailRenderInfo = null;
  detailAnimPhase = 'none';
  detailBurstStart = null;
}

// ── p5 setup ────────────────────────────────────────────────
// errorA/errorB가 실제 데이터(qrErrorData)로 결정되므로, 그 로딩이 끝날
// 때까지 기다렸다가 아이템을 만들고 그리드를 처음 빌드한다. 그 사이에도
// 이벤트 리스너는 먼저 걸어둬 UI 자체는 바로 반응하도록 한다.
async function setup() {
  colorMode(HSB, 360, 100, 100);
  frameRate(30); // 등장 애니메이션용 — 아이템이 많아 매 프레임 다시 그리는 비용을 아낌

  loadQrNames(); // qr 번호 → 이름 매핑을 비동기로 읽어둔다(클릭 시점에만 필요)

  const shapeButtons = document.querySelectorAll('.shape-btn');
  shapeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      shapeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentShape = btn.dataset.shape;
      buildGridView(true); // 1·2번 탭이면 폭죽 등장 애니메이션 시작
    });
  });

  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.mode;
      buildGridView(true); // 1·2번 탭에선 정렬 변경 때도 폭죽 애니메이션 재생
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

  // 박스(그래픽/QR 영역)를 클릭하면 같은 방향으로 한 번 뒤집는다.
  // < , > 버튼 클릭은 제외(각자 핸들러가 처리).
  document.querySelector('.detail-box').addEventListener('click', (e) => {
    if (e.target.closest('.detail-nav')) return;
    flipDetail();
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

  await loadErrorData(); // 실제 errorA/errorB 데이터를 기다린 뒤 아이템 생성
  ITEM_COUNT = qrErrorData.length;
  radialItems = generateRadialItems();
  spokeItems = generateSpokeItems();

  buildGridView(true); // 첫 로드에도 1번 탭 폭죽 등장 애니메이션 재생
}

// 화면 회전/리사이즈 시 열 수·셀 크기가 바뀔 수 있으므로 다시 빌드
function windowResized() {
  buildGridView();
}

// 애니메이션 루프 — 그리드(1·2번 탭)와 상세 박스(2번 탭) 모두 평소엔
// 정적이고, 각자의 폭죽 등장 애니메이션이 진행 중일 때만 매 프레임 다시
// 그리다가 끝나면 멈춘다.
function draw() {
  const nowSec = millis() / 1000;

  if (gridCells.length > 0 && burstStart !== null) {
    renderGridFrame(nowSec);

    // 가장 늦게 시작하는 아이템(STAGGER_MAX)까지 다 커지면 종료.
    let total = 0;
    if (currentShape === 'radial') {
      total = RADIAL_BURST_STAGGER_MAX + RADIAL_BURST_SET_DELAY + RADIAL_BURST_DURATION;
    } else if (currentShape === 'radial-spokes') {
      total = SPOKE_BURST_STAGGER_MAX + SPOKE_BURST_SET_DELAY + SPOKE_BURST_DURATION;
    }
    if (nowSec - burstStart >= total) {
      burstStart = null; // 애니메이션 종료 → 이후 정적
    }
  }

  if (detailAnimPhase === 'running' && detailBurstStart !== null) {
    drawDetailFrame();
    if (nowSec - detailBurstStart >= SPOKE_BURST_SET_DELAY + SPOKE_BURST_DURATION) {
      detailAnimPhase = 'none'; // 애니메이션 종료 → 이후 정적(제 크기)
      detailBurstStart = null;
      drawDetailFrame(); // 제 크기로 마지막 프레임 확정
    }
  }
}
