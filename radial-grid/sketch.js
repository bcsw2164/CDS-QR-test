/* ============================================================
   Radial Grid — sketch.js
   ------------------------------------------------------------
   archive/의 1번(방사형) 탭 그래픽만 떼어내 10x10 그리드로 배치하고
   랜덤 데이터로 반복 애니메이션시키는 단독 페이지. 그래픽 생성 로직은
   archive/sketch.js와 동일하게 shared/core.js를 그대로 쓴다.

   흐름: 페이지를 열면(새로고침) 각 자리마다 랜덤 데이터가 정해지고,
   평소에는 선 끝 원 색(tipColor)의 작은 점으로만 있다가, 그리드 중심에서
   시작된 파동이 도달하면 그 점이 자연스럽게 자라나 방사형 그래픽 전체가
   되고, 파동이 지나가면 다시 점으로 줄어든다. 이 과정이 중앙에서
   바깥으로 순차적으로 퍼지며 새로고침 전까지 무한 반복된다.

   그래픽 하나하나를 각자의 캔버스에 가둬 그리지 않고, 그리드 전체를
   덮는 캔버스 한 장에 다 같이 그린다 — 그래야 자라날 때 옆 칸 영역을
   침범해도 잘리지 않고 자연스럽게 보인다(그리드 바깥 경계에서만 잘림).
   drawRadialBurstFlowerDev(shared/core.js)는 첫 인자 g에 메인 캔버스를
   넘기면 거기에 바로 그리도록 설계돼 있어서(g=window), 셀마다 별도
   p5.Graphics를 만들 필요가 없다.
   ============================================================ */

// 숫자키 1·2로 바꿀 수 있다(1→11x11, 2→19x19 — keyPressed() 참고).
const GRID_SIZE_REF = 15; // 아래 WAVE_PULSE_WIDTH_BASE의 기준이 되는 그리드 크기
let GRID_SIZE = GRID_SIZE_REF;
let ITEM_COUNT = GRID_SIZE * GRID_SIZE;
const CELL_PADDING_RATIO = 0.03; // 칸에 딱 맞는 기준 크기의 여백 비율
const BLOOM_OVERFLOW = 1.3; // 만개 크기 = 칸에 딱 맞는 크기 × 이 배율(옆 칸을 침범해도 됨)

// 이 페이지에서만 선을 shared/core.js 기본값(RADIAL_STROKE_WEIGHT_RATIO)
// 보다 얇게 그린다 — archive/radial 페이지는 인자를 안 넘기므로 그대로.
const RADIAL_GRID_STROKE_WEIGHT_RATIO = RADIAL_STROKE_WEIGHT_RATIO * 0.9;

// 만개한 그래픽이 계속 제자리에서 도는 회전 속도(라디안/초) 기준값 —
// 아이템마다 spinRate를 곱해서 속도·방향을 다르게 쓴다.
const ROTATE_SPEED = 1;

// ── 중심에서 퍼져나가는 파동 애니메이션 ──────────────────────
const WAVE_SPEED = 3; // 파동이 퍼지는 속도(그리드 칸 간격/초)
const WAVE_PULSE_WIDTH_BASE = 1.15; // GRID_SIZE_REF(기준 크기)에서의 파동 폭(초)
// 파동 하나가 한 칸을 스쳐 지나가는 데 걸리는 시간(초) = 파동의 공간적
// 범위(칸 수) = WAVE_SPEED × 이 값이므로, 그리드가 커질수록 이 값도 같이
// 키워야 파동 폭이 그리드 대비 항상 비슷한 비율로 보인다. GRID_SIZE가
// 바뀔 때마다(초기·keyPressed) 다시 계산한다.
let WAVE_PULSE_WIDTH = WAVE_PULSE_WIDTH_BASE * (GRID_SIZE / GRID_SIZE_REF);
// 이전 파동이 가장자리까지 다 퍼지길 기다리지 않고, 이 간격마다 중심에서
// 새 파동을 또 띄운다 — 여러 파동이 동시에 겹쳐서 퍼져나가므로 "다 퍼진
// 뒤 멈췄다가 다시 시작"하는 순간이 없다.
const WAVE_SPAWN_INTERVAL = 2.2;

// dist(중심으로부터 칸 거리)가 클수록 파동이 늦게 도착하도록, 도착 후
// WAVE_PULSE_WIDTH 동안 0→1→0으로 부드럽게 변하는 강도(=점→그래픽→점
// 전환 진행도, 0이면 점·1이면 완전히 만개)를 반환한다. 이 칸에 처음
// 파동이 닿은 뒤로는 WAVE_SPAWN_INTERVAL마다 다음 파동이 계속 도착한다.
function waveIntensity(dist, tSinceWave) {
  const arrival = dist / WAVE_SPEED;
  if (tSinceWave < arrival) return 0; // 아직 이 칸에 첫 파동도 안 닿음
  const localT = (tSinceWave - arrival) % WAVE_SPAWN_INTERVAL;
  if (localT > WAVE_PULSE_WIDTH) return 0;
  return Math.sin(Math.PI * (localT / WAVE_PULSE_WIDTH));
}

function cellDistanceFromCenter(index) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const c = (GRID_SIZE - 1) / 2;
  return Math.hypot(row - c, col - c);
}

let gridCells = []; // { item, cx, cy, dist }
let waveStart = null; // 파동 애니메이션이 시작된 시각(t=0 기준). null이면 아직 준비 전
let flowerSize = 0; // 만개 상태일 때 방사형 그래픽의 크기(px)
let idleDotSize = 0; // 평소(점) 상태일 때 원 지름(px) — 만개 시 선 끝 원과 같은 크기

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
    // 셀마다 전체 회전각과 두 번째 선의 말리는 방향을 따로 뽑아서, 같은
    // errorA/errorB라도 모양·방향이 겹쳐 보이지 않게 다양성을 더한다.
    angleOffset: random(TWO_PI),
    mirrorSecondary: random() < 0.5,
    // 만개해 있는 동안 계속 자전하도록, 셀마다 회전 속도·방향을 다르게
    // 뽑아둔다(음수면 반대 방향, 범위는 이전의 2배). ROTATE_SPEED에 곱해서 쓴다.
    spinRate: random(1.2, 2.8) * (random() < 0.5 ? 1 : -1),
  };
}

// ── 인접 셀끼리 비슷한 그래픽이 몰리지 않게 배치 ──────────────
//
// 그리드 위치(상하좌우 이웃)마다 배치를 미리 계산해둔다. 숫자키로
// GRID_SIZE가 바뀔 때마다 다시 만들어야 하므로 함수로 뺐다.
function buildGridNeighbors() {
  const list = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cellNeighbors = [];
      if (r > 0) cellNeighbors.push((r - 1) * GRID_SIZE + c);
      if (r < GRID_SIZE - 1) cellNeighbors.push((r + 1) * GRID_SIZE + c);
      if (c > 0) cellNeighbors.push(r * GRID_SIZE + (c - 1));
      if (c < GRID_SIZE - 1) cellNeighbors.push(r * GRID_SIZE + (c + 1));
      list.push(cellNeighbors);
    }
  }
  return list;
}
let GRID_NEIGHBORS = buildGridNeighbors();

// 두 아이템이 얼마나 "비슷해 보이는지" — 색 조합이 같을수록, 회전각이
// 가까울수록, errorA/errorB(선 개수·말림 정도)가 비슷할수록 값이 커진다.
// 값이 클수록 이웃으로 두기 싫은 조합.
function itemSimilarity(a, b) {
  let s = 0;
  if (a.lineColor === b.lineColor) s += 2;
  if (a.dotColor === b.dotColor) s += 2;
  if (a.tipColor === b.tipColor) s += 1;
  if (a.mirrorSecondary === b.mirrorSecondary) s += 0.5;

  let angleDiff = Math.abs(a.angleOffset - b.angleOffset) % TWO_PI;
  if (angleDiff > Math.PI) angleDiff = TWO_PI - angleDiff;
  s += Math.max(0, 1 - angleDiff / Math.PI) * 1.5; // 각도가 가까울수록 최대 1.5 추가

  const shapeDiff = Math.abs(a.errorA - b.errorA) + Math.abs(a.errorB - b.errorB); // 0(동일)~2(정반대)
  s += Math.max(0, 1 - shapeDiff); // 모양이 가까울수록 최대 1 추가

  return s;
}

// 무작위로 생성된 아이템 배열을 받아, 이웃한 셀끼리의 유사도 합이 낮아지는
// 방향으로 위치를 섞는다(언덕 오르기 local search). 완벽한 최적해는 아니지만
// 반복적으로 "맞바꿔서 더 나아지면 유지, 아니면 되돌리기"를 여러 번 하면
// 비슷한 그래픽끼리 뭉치는 걸 충분히 줄일 수 있다.
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
      // 개선되지 않았으면 되돌림
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

// 그리드 전체를 덮는 메인 캔버스 한 장에 모든 셀을 직접 그린다(g=window).
// t(=waveIntensity, 0~1)가 0에 가까우면 lineColor 색의 작은 점만, 1에
// 가까우면 방사형 그래픽이 완전히 만개한 상태를 보여주고 그 사이는
// 점이 줄어드는 동시에 그래픽이 lineGrow/dotGrow로 자라나며 자연스럽게
// 이어진다. 점 색은 선이 시작되는 지점의 색(=선 자체의 색인 lineColor)을
// 쓴다 — core.js의 선은 시작점에 별도 점 없이 lineColorHex 스트로크로
// 시작하므로, "시작점의 색"은 곧 lineColor다.
function renderGridFrame(elapsedSec) {
  background('#242947');

  gridCells.forEach(({ item, cx, cy, dist }) => {
    const t = waveIntensity(dist, elapsedSec - waveStart);

    if (t < 0.999) {
      const dotDia = idleDotSize * (1 - t);
      noStroke();
      fill(item.lineColor);
      ellipse(cx, cy, dotDia, dotDia);
    }

    if (t > 0.001) {
      // 스케일(t) 애니메이션과 별개로, 시간에 따라 계속 도는 회전을 더한다.
      const angle = item.angleOffset + elapsedSec * ROTATE_SPEED * item.spinRate;
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
        angle,
        angle,
        t,
        t,
        RADIAL_GRID_STROKE_WEIGHT_RATIO
      );
    }
  });
}

// 한 번 뽑은 랜덤 배치를 들고 있는다 — 새로고침 전까지는 이 값을 그대로
// 재사용해서, 창 크기 조절 같은 재배치(rebuild)가 있어도 그래픽 자체는
// 바뀌지 않는다.
let currentArrangedItems = null;

// regenerateData: true면(최초 로드) 새 랜덤 데이터를 뽑고 파동 애니메이션을
// 처음부터 다시 시작한다. false면(창 크기 조절 등) 기존 데이터와 진행 중인
// 파동을 그대로 유지한 채 캔버스·좌표만 다시 맞춘다.
function buildGrid(regenerateData = true) {
  const holder = document.getElementById('grid-holder');
  gridCells = [];
  if (regenerateData) waveStart = null; // 완전히 새로 시작할 때만 파동도 처음부터

  if (regenerateData || !currentArrangedItems) {
    currentArrangedItems = generateArrangedItems();
  }

  requestAnimationFrame(() => {
    const rect = holder.getBoundingClientRect();
    const canvasSize = Math.max(1, Math.round(Math.min(rect.width, rect.height)));

    pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
    resizeCanvas(canvasSize, canvasSize);

    // flowerSize(만개 크기)는 칸 크기의 k배 — BLOOM_OVERFLOW 때문에 k>1이라
    // 가장자리 셀은 중심에서 캔버스 끝까지의 거리보다 만개 반지름이 커져서
    // 그대로 두면 잘린다. 그리드 전체를 margin만큼 안쪽으로 밀어 넣어서,
    // 가장자리 셀이 최대로 만개해도 정확히 캔버스 안에 맞도록 한다.
    const k = (1 - CELL_PADDING_RATIO * 2) * BLOOM_OVERFLOW;
    const margin = k > 1 ? (canvasSize * (k - 1)) / (2 * (GRID_SIZE + k - 1)) : 0;
    const cellSpan = (canvasSize - margin * 2) / GRID_SIZE;
    flowerSize = cellSpan * k;
    // 선 끝 원과 같은 크기로 맞춰서, 점 상태가 "만개했을 때의 선 끝 원 하나가
    // 남아있다가 나머지가 자라나는" 것처럼 자연스럽게 이어지게 한다.
    idleDotSize = flowerSize * RADIAL_RADIUS_RATIO * RADIAL_DOT_SIZE_RATIO;

    for (let i = 0; i < ITEM_COUNT; i++) {
      const row = Math.floor(i / GRID_SIZE);
      const col = i % GRID_SIZE;
      gridCells.push({
        item: currentArrangedItems[i],
        cx: margin + (col + 0.5) * cellSpan,
        cy: margin + (row + 0.5) * cellSpan,
        dist: cellDistanceFromCenter(i),
      });
    }

    if (waveStart === null) waveStart = millis() / 1000;
    renderGridFrame(millis() / 1000);
  });
}

// 화면 녹화(OBS 등)로 정확한 픽셀 크기·그리드를 바로 띄우기 위한 URL
// 파라미터 — 예) index.html?px=1080&grid=13 → 1080x1080 고정 크기로
// 13x13(3번 키와 동일) 그리드가 새로고침 즉시 뜬다. 녹화 시 vmin 계산이나
// 키 입력 없이 창/영역 캡처만 하면 되게 하려는 용도다.
function applyRecordingParams() {
  const params = new URLSearchParams(location.search);

  const px = Number(params.get('px'));
  if (Number.isFinite(px) && px > 0) {
    const holder = document.getElementById('grid-holder');
    holder.style.width = `${px}px`;
    holder.style.height = `${px}px`;
  }

  const gridParam = Number(params.get('grid'));
  if (Number.isInteger(gridParam) && gridParam >= 3 && gridParam % 2 === 1) {
    GRID_SIZE = gridParam;
    ITEM_COUNT = GRID_SIZE * GRID_SIZE;
    GRID_NEIGHBORS = buildGridNeighbors();
    WAVE_PULSE_WIDTH = WAVE_PULSE_WIDTH_BASE * (GRID_SIZE / GRID_SIZE_REF);
  }
}

function setup() {
  colorMode(HSB, 360, 100, 100);
  frameRate(30);
  createCanvas(1, 1).parent('grid-holder'); // 실제 크기는 buildGrid()가 맞춘다

  applyRecordingParams();
  buildGrid(true); // 페이지를 열 때(새로고침)만 랜덤 데이터를 새로 뽑는다
}

function windowResized() {
  buildGrid(false); // 캔버스 크기만 다시 맞추고, 그래픽 데이터는 그대로 유지
}

// 숫자키 1·2로만 그리드 크기를 바꾼다: 1→11x11, 2→19x19. 칸 수가 달라지므로
// 배치를 완전히 새로 뽑아야 해서 buildGrid(true)로 새로고침한 것처럼 다시 만든다.
const GRID_SIZE_BY_KEY = { 1: 11, 2: 19 };

function keyPressed() {
  const size = GRID_SIZE_BY_KEY[key];
  if (!size) return;

  GRID_SIZE = size;
  ITEM_COUNT = GRID_SIZE * GRID_SIZE;
  GRID_NEIGHBORS = buildGridNeighbors();
  WAVE_PULSE_WIDTH = WAVE_PULSE_WIDTH_BASE * (GRID_SIZE / GRID_SIZE_REF); // 그리드 크기에 맞춰 파동 폭도 다시 계산
  buildGrid(true); // 칸 수가 바뀌었으니 새로고침한 것처럼 배치를 새로 뽑는다
}

function draw() {
  if (gridCells.length === 0 || waveStart === null) return;
  renderGridFrame(millis() / 1000); // 파동 애니메이션은 새로고침 전까지 계속 반복
}
