/* Signature Archive — sketch.js
   errorA/errorB는 data/qr_error_data.json의 실제 추출 데이터를 쓴다 —
   키(qr_clean_NNN)의 번호가 QR 이미지 번호와 1:1이고, ITEM_COUNT는 이 데이터
   개수로 정해진다. 그래픽 생성은 shared/core.js를 About 페이지와 공유한다.

   오브젝트 종류 탭
     burst = 'radial-spokes' (중심에서 뻗는 선분 두 세트 + 끝점 원)
     bloom = 'radial'        (말리는 호 + 중심에서 멀어지는 원)
   보기 방식 탭
     수집순   — id 순서 그대로
     오차율순 — (errorA + errorB) / 2 오름차순

   둘 다 실제 CSS Grid라 열 수는 브라우저가 화면 너비에 맞춰 정하고, 아이템마다
   독립된 <canvas>를 담는다. 탭·정렬을 바꿔도 번호와 그래픽 자체는 그대로다.

   등장 애니메이션은 탭 버튼·정렬 변경·첫 로드에서 buildGridView(true)로 재생되고,
   그때 assignBurstDelays()가 지연을 새로 배정한다(= 누를 때마다 순서가 달라진다).
   BURST는 사건, BLOOM은 과정 — 두 탭의 성격 차이와 상수 근거는 docs/archive.md. */

let ITEM_COUNT = 0; // qrErrorData 로딩 후 그 개수로 정해진다(setup 참고)
const CELL_PADDING_RATIO = 0.03; // 칸 안에서 그래픽이 차지하는 여백 비율(그리드 썸네일 + burst 탭 상세 박스)

// bloom 탭 상세 박스 전용 그래픽 크기. burst는 CELL_PADDING_RATIO 그대로(94%)인데
// bloom은 더 커 보인다는 피드백으로 상세 박스에서만 줄인다(그리드 썸네일은 그대로).
const DETAIL_RADIAL_SIZE_RATIO = 0.85;

/* ── BLOOM 등장 — 점 → 선 순서로, 완만하게 자란다 ──────────────
   값을 만질 때는 BURST(사건) / BLOOM(과정)의 대비가 유지되는지를 기준으로 본다.
   easing·회전 곡선을 따로 쓰는 이유는 docs/archive.md 참고. */
const RADIAL_BURST_DURATION = 0.9; // 한 그룹이 0→제 크기까지 걸리는 시간(초)
const RADIAL_BURST_SET_DELAY = 0.22; // 중심-거리 원 시작 후 선분이 시작되기까지 지연(초)
// 아이템 지연은 랜덤이 아니라 격자 배치 순서에 비례한다 — 첫 칸 0, 마지막 칸이 이 값
const RADIAL_BURST_STAGGER_MAX = 1.1;
// [주의] 이 값이 물결 간격(STAGGER_MAX ÷ 칸 수)보다 충분히 커야 한다 — 작으면
// 한 줄이 통째로 동시에 열리는 것처럼 보인다.
const RADIAL_BURST_STAGGER_JITTER = 0.45;
// 자라는 속도도 칸마다 다르게(DURATION × 1±이 값) — 시작 시점만 어긋내면 여전히
// 한 덩어리로 읽힌다.
const RADIAL_BURST_DURATION_VARY = 0.3;
// 자라면서 같이 도는 각도(라디안). 0에서 커지는 게 아니라 이만큼 돌아간 자리에서
// 시작해 제 각도로 되돌아오며 멎는다 — 그래야 끝 모습이 정적 상태와 같아진다.
const RADIAL_BURST_SPIN_MIN = 0.6; // ≒ 34도
const RADIAL_BURST_SPIN_MAX = 1.8; // ≒ 103도
// 감속 곡선의 세기 — 1 = 선형 · 2 = easeOutQuad · 3 = easeOutCubic.
// 회전은 scale보다 약하게 써야 초반에 돌고 있다는 게 전달된다.
const RADIAL_BURST_SPIN_EASE = 2;
const RADIAL_BURST_SCALE_EASE = 1.7;

/* ── BURST 등장 — 밖 → 안 순서로, 확 퍼졌다가 급감속한다 ────────── */
const SPOKE_BURST_DURATION = 0.35; // 한 세트가 0→제 크기까지 걸리는 시간(초)
const SPOKE_BURST_SET_DELAY = 0.12; // 밖지름 세트 시작 후 안지름 세트가 시작되기까지 지연(초)
const SPOKE_BURST_STAGGER_MAX = 0.5; // (상세 박스 전용으로만 남음) 아이템별 랜덤 지연 상한

// 그리드 등장은 한 프레임 간격의 슬롯에 PER_FRAME개씩 담아, 동시 발생 수가 확률이
// 아니라 구조적으로 상한을 갖게 한다. 동시 발생 수와 전체 길이는 맞바꾸는 관계다
// (근거와 실측값은 docs/archive.md).
const SPOKE_BURST_SLOT = 1 / 60; // 슬롯 간격의 하한 = 60fps 한 프레임
const SPOKE_BURST_PER_FRAME = 3; // 한 슬롯에 담는 아이템 수의 상한
const SPOKE_BURST_TOTAL = 1.75; // 전체 등장 애니메이션 길이(초) — 항상 이 값
const SPOKE_BURST_DURATION_VARY = 0.35; // 아이템별 지속 시간 편차(DURATION × 1±이 값)
const SPOKE_BURST_SET_DELAY_VARY = 0.6; // 밖→안 세트 지연 편차(SET_DELAY × 1±이 값)

// [주의] 첫 화면에 뜨는 탭. index.html에서 .active가 붙은 첫 버튼의 data-shape와
// 반드시 같아야 한다 — 다르면 버튼과 그려지는 그래픽이 어긋난다.
let currentShape = 'radial-spokes'; // 'radial' | 'radial-spokes'
let sortMode = 'collected'; // 'collected' | 'error'

let radialItems = [];
let spokeItems = [];

// { n, errorA, errorB } 를 n(QR 번호) 오름차순으로. loadErrorData()가 채운다.
let qrErrorData = [];

// 등장(폭죽) 애니메이션 시작 시각(초). null이면 애니메이션 중이 아님(정적).
// bloom(방사형)·burst(스포크) 탭이 공유한다.
let burstStart = null;

// burst 그리드 등장의 '이번 재생' 설정 — assignSpokeBurstDelays()가 매번 새로 채운다.
// total은 실측 끝 시점이라 draw()의 종료 판정에 쓴다(상수로는 계산할 수 없다).
let spokeBurstPlan = {
  setDelay: SPOKE_BURST_SET_DELAY,
  total: SPOKE_BURST_TOTAL,
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// BURST용 — 시작하자마자 확 튀고 급격히 감속한다.
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
// BLOOM용 — expo보다 시작이 훨씬 완만해서 "자란다"에 가깝게 읽힌다.
// 1을 넘지 않는 곡선이라 셀 밖으로 잘릴 걱정도 없다(easeOutBack 같은
// 탄성 곡선은 scale에 쓰면 bloom이 칸을 꽉 채우고 있어 잘린다).
const easeOutCubic = (t) => (t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
// 위 둘의 일반형 — 지수(p)로 감속 세기를 고른다. p=1이면 선형, 커질수록
// 초반에 몰린다. 회전처럼 세기를 숫자로 조절하고 싶은 곳에 쓴다.
const easeOutPow = (t, p) => (t >= 1 ? 1 : 1 - Math.pow(1 - t, p));

// bloom — 아이템별 지연·지속 시간을 반영한 현재 scale 배율.
//   dot  : 중심-거리 원(먼저) / line : 선분 + 끝 원(SET_DELAY 만큼 늦게)
//   spin : 회전용 진행도 — dot과 같은 타임라인이지만 감속이 더 약하다
function radialGrowFactors(elapsedSec, itemDelay = 0, itemDuration = RADIAL_BURST_DURATION) {
  if (burstStart === null) return { line: 1, dot: 1, spin: 1 };
  const t = elapsedSec - burstStart - itemDelay;
  const d = itemDuration || RADIAL_BURST_DURATION;
  const dotRaw = clamp01(t / d);
  return {
    dot: easeOutPow(dotRaw, RADIAL_BURST_SCALE_EASE),
    line: easeOutPow(clamp01((t - RADIAL_BURST_SET_DELAY) / d), RADIAL_BURST_SCALE_EASE),
    spin: easeOutPow(dotRaw, RADIAL_BURST_SPIN_EASE),
  };
}

// burst — 밖지름/안지름 세트의 현재 길이 배율. 그리드 진입 전용(세트 전체가 한
// 덩어리로 0→1 easeOutExpo). 상세 박스는 drawDetailFrame이 따로 계산한다.
function spokeGrowFactors(elapsedSec, itemDelay = 0, itemDuration = SPOKE_BURST_DURATION) {
  if (burstStart === null) return { outer: 1, inner: 1 };
  const t = elapsedSec - burstStart - itemDelay;
  const d = itemDuration || SPOKE_BURST_DURATION;
  const setDelay = spokeBurstPlan.setDelay;
  return {
    outer: easeOutExpo(clamp01(t / d)),
    inner: easeOutExpo(clamp01((t - setDelay) / d)),
  };
}

// 셀마다 만든 p5.Graphics 버퍼 + 애니메이션 프레임을 다시 그리는 데 필요한 정보.
// 재빌드 시 정리용으로도 쓰인다.
let gridCells = [];
// 리사이즈·탭 전환이 겹칠 때 오래된 빌드 결과가 뒤늦게 그려지는 것을 막는 토큰
let gridBuildToken = 0;

// 퍼센타일(순위) 정규화 — 실측값은 낮은 구간에 몰려 있고 소수의 극단치가 범위를
// 늘려놔서, min-max로 펴면 다수가 여전히 좁은 구간에 압축된다. 값의 절대 크기가
// 아니라 순위만으로 0~1에 고르게 배치한다. 동점은 평균 순위로 묶는다.
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

/* 시드 솔트 — item.id에 더해 makeRadialSpokeRng에 넘기는 값. 같은 값을 유지하는 한
   새로고침해도 항상 동일한 결과가 나온다. 색·회전·그룹 각도가 서로 다른 난수열에서
   나오도록 솔트를 셋으로 나눴다(같은 솔트면 색이 비슷한 아이템끼리 각도까지 몰린다).

   [주의] card-preview/card.js에 같은 세 값이 복사되어 있다 — 바꾸면 양쪽을 함께
   고쳐야 아카이브 화면과 저장 카드의 색·회전이 일치한다.
   회전을 오차가 아니라 id에 거는 이유, bloom에 그룹별 회전이 따로 필요한 이유는
   docs/archive.md 참고. */
const COLOR_SEED_SALT = 819842174;
const ROTATION_SEED_SALT = 573910284;
const GROUP_ANGLE_SEED_SALT = 294817365;

// 두 탭이 공유하는 아이템 생성 — qrErrorData의 n을 그대로 id로 써서 QR 번호와 1:1로
// 맞추고, errorA/errorB는 축별로 정규화한 값을 쓴다. rotation(0~2π)도 여기서 만들어
// 같은 번호의 QR이 burst·bloom 어디서든 같은 각도로 놓이게 한다.
function generateFlowerItems() {
  const normA = normalizeErrorAxis(qrErrorData.map((d) => d.errorA));
  const normB = normalizeErrorAxis(qrErrorData.map((d) => d.errorB));

  return qrErrorData.map((d, i) => ({
    id: d.n,
    errorA: normA[i],
    errorB: normB[i],
    errorScore: (normA[i] + normB[i]) / 2,
    // [주의] 전용 RNG에서 뽑는다 — core.js의 형태용 rnd()를 건드리면 소비 순서가
    // 밀려 전체 형태가 달라진다.
    rotation: makeRadialSpokeRng(d.n + ROTATION_SEED_SALT)() * TWO_PI,
  }));
}

// bloom 전용 — 선·점 색(pickRadialColors)에 그 둘과 겹치지 않는 끝점 원 색을
// 더한다. item.id 기반 로컬 RNG라 새로고침해도 같은 id는 항상 같은 색이다.
function generateRadialItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    const rnd = makeRadialSpokeRng(item.id + COLOR_SEED_SALT);
    const { lineColor, dotColor } = pickRadialColors(rnd);
    item.lineColor = lineColor;
    item.dotColor = dotColor;
    const tipOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== lineColor && c !== dotColor);
    item.tipColor = tipOptions[Math.floor(rnd() * tipOptions.length)];
    // 호 그룹 / 원 그룹을 각각 돌리는 각도(0~2π).
    // [주의] 전용 RNG를 따로 쓴다 — 위 rnd()를 더 소비하면 색 선택이 밀린다.
    const angleRnd = makeRadialSpokeRng(item.id + GROUP_ANGLE_SEED_SALT);
    item.lineAngleOffset = angleRnd() * TWO_PI;
    item.dotAngleOffset = angleRnd() * TWO_PI;
    item.burstDelay = 0; // 실제 값은 애니메이션을 재생할 때마다 assignBurstDelays()가 채운다
  });
  return list;
}

// burst 전용 — 색 시드만 더한다. 형태는 core.js의 고정 시드, 색은 이 colorSeed.
function generateSpokeItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    item.colorSeed = item.id + COLOR_SEED_SALT;
    // 실제 값은 애니메이션을 재생할 때마다 assignSpokeBurstDelays()가 채운다
    item.burstDelay = 0;
    item.burstDuration = SPOKE_BURST_DURATION;
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

// 아이템 하나를 g 위 (cx, cy)에 size로 그린다. grow는 등장 애니메이션용 —
// burst는 { outer, inner } 길이 배율, bloom은 { line, dot } scale 배율.
// null이면 제 크기(정적). perSpokeBurst는 burst에만 해당(core.js 주석 참고).
//
// 전체 회전은 캔버스를 통째로 돌려서 적용한다 — core.js는 손대지 않는다. 두 그래픽
// 모두 중심 기준 강체 회전이라 원점에서 가장 먼 거리가 변하지 않고, bloom의 잘림
// 방지 스케일이나 셀 밖으로 삐져나오는 문제도 생기지 않는다.
function drawItem(item, g, cx, cy, size, grow = null, perSpokeBurst = false) {
  g.push();
  g.translate(cx, cy);

  // bloom 전용 — 자라는 동안 같이 돌다가 제 각도에서 멎는다(burst는 spin이 없다).
  const spin =
    grow && grow.spin !== undefined ? (item.burstSpin || 0) * (1 - grow.spin) : 0;
  g.rotate((item.rotation || 0) + spin);

  if (currentShape === 'radial-spokes') {
    const og = grow ? grow.outer : 1;
    const ig = grow ? grow.inner : 1;
    // 위에서 이미 중심으로 옮겨 놨으므로 여기서는 원점에 그린다.
    drawRadialSpokeDots(g, 0, 0, size, item.errorA, item.errorB, item.colorSeed, og, ig, perSpokeBurst);
    g.pop();
    return;
  }
  // bloom — 선분(+끝 원)과 중심-거리 원을 각각 다른 배율로 넘겨 순차 등장시킨다.
  const lg = grow ? grow.line : 1;
  const dg = grow ? grow.dot : 1;
  drawRadialBurstFlowerDev(
    g,
    0,
    0,
    size,
    item.errorA,
    item.errorB,
    item.lineColor,
    item.dotColor,
    item.tipColor,
    true,
    // [주의] 두 그룹을 각각 돌리는 각도 — 아이템에 박아둔 값을 그대로 넘겨야 한다.
    // 매 프레임 다시 뽑으면 둘이 따로 도는 것처럼 보인다.
    item.lineAngleOffset || 0,
    item.dotAngleOffset || 0,
    lg,
    dg
  );
  g.pop();
}

// 애니메이션을 재생할 때마다(= buildGridView(true)) 아이템별 지연을 새로 배정한다.
// 아이템 생성 시점이 아니라 여기서 뽑는 이유는 탭을 누를 때마다 순서가 달라져야
// 하기 때문이다(그래도 최종 화면은 항상 같다 — docs/archive.md).
//
// order: 화면에 놓이는 순서 → items 인덱스. 정렬 모드가 바뀌면 이 배열도 바뀌므로
// 물결 방향이 자동으로 따라간다.
function assignBurstDelays(order) {
  const items = currentItems();

  if (currentShape === 'radial-spokes') {
    // BURST — 한 프레임 간격 슬롯을 셔플해 나눠 준다(동시 발생 상한, 길이 고정).
    assignSpokeBurstDelays(order);
    return;
  }

  // BLOOM — 격자 순서에 비례하는 물결 + 시작 시점 흔들림(JITTER) + 지속 시간
  // 편차(DURATION_VARY). 셋을 같이 써야 개체마다 제 속도로 열린다.
  const n = order.length;
  order.forEach((idx, pos) => {
    const wave = n > 1 ? (pos / (n - 1)) * RADIAL_BURST_STAGGER_MAX : 0;
    items[idx].burstDelay = wave + random(0, RADIAL_BURST_STAGGER_JITTER);
    items[idx].burstDuration =
      RADIAL_BURST_DURATION * random(1 - RADIAL_BURST_DURATION_VARY, 1 + RADIAL_BURST_DURATION_VARY);
    // 돌아갈 각도와 방향 — 끝나면 0으로 수렴하므로 최종 배치에는 영향이 없다.
    items[idx].burstSpin =
      random(RADIAL_BURST_SPIN_MIN, RADIAL_BURST_SPIN_MAX) * (random() < 0.5 ? -1 : 1);
  });
}

// burst 전용 — 이번 재생의 등장 설정을 통째로 새로 뽑는다.
//
// 한 프레임 간격의 슬롯에 PER_FRAME개씩 채우므로 같은 프레임에 터지는 개수가 그
// 값을 넘지 않는다(확률이 아니라 구조). 같은 슬롯 안에서는 지연을 흔들지 않는다 —
// 어긋낸 값이 프레임 경계를 넘으면 상한이 깨진다. 순서는 배치와 무관한 완전 랜덤이고
// (배치를 따라가는 물결은 bloom 쪽 성격), 전체 길이는 TOTAL로 고정된다.
// 매번 달라지는 건 순서·자라는 속도·세트가 겹치는 정도뿐이고 최종 화면은 그대로다.
// 자세한 내용은 docs/archive.md 참고.
function assignSpokeBurstDelays(order) {
  const items = currentItems();
  const n = order.length;

  const setDelay =
    SPOKE_BURST_SET_DELAY * random(1 - SPOKE_BURST_SET_DELAY_VARY, 1 + SPOKE_BURST_SET_DELAY_VARY);
  const durations = order.map(
    () => SPOKE_BURST_DURATION * random(1 - SPOKE_BURST_DURATION_VARY, 1 + SPOKE_BURST_DURATION_VARY)
  );

  // 등수를 Fisher-Yates로 섞고 PER_FRAME으로 나눠 슬롯 번호로 쓴다 — 등수가
  // 중복되지 않으니 한 슬롯에 PER_FRAME개를 넘겨 담는 일이 없다.
  const ranks = order.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random(i + 1));
    const tmp = ranks[i];
    ranks[i] = ranks[j];
    ranks[j] = tmp;
  }
  const slotOf = ranks.map((rank) => Math.floor(rank / SPOKE_BURST_PER_FRAME));

  // 슬롯 간격 — 끝 시점을 TOTAL에 맞추되 한 프레임 미만으로는 좁히지 않는다.
  // 느리게 자라는 칸이 끝을 넘겨 잘리지 않도록 칸별 허용 간격의 최솟값을 쓴다.
  let step = Infinity;
  for (let i = 0; i < n; i++) {
    const slot = slotOf[i];
    if (slot === 0) continue; // t=0에 터지는 칸은 간격과 무관
    step = Math.min(step, (SPOKE_BURST_TOTAL - setDelay - durations[i]) / slot);
  }
  if (!isFinite(step)) step = SPOKE_BURST_SLOT;
  step = Math.max(step, SPOKE_BURST_SLOT);

  let total = 0;
  order.forEach((idx, i) => {
    const delay = slotOf[i] * step;
    items[idx].burstDelay = delay;
    items[idx].burstDuration = durations[i];
    total = Math.max(total, delay + setDelay + durations[i]);
  });

  spokeBurstPlan = { setDelay, total };
}

// 셀별로 만들어뒀던 p5.Graphics 버퍼를 전부 폐기
function clearGridCells() {
  gridCells.forEach(({ gfx }) => gfx.remove());
  gridCells = [];
}

// 모든 셀을 현재 애니메이션 진행도에 맞춰 다시 그린다. 그래픽 자체의 모양은
// 건드리지 않고 burst는 선분 길이 배율, bloom은 캔버스 scale 만 바꾼다.
function renderGridFrame(elapsedSec) {
  const bursting = burstStart !== null;

  gridCells.forEach(({ gfx, item, cellSize, size }) => {
    /* [주의] background()가 아니라 clear() — 검정으로 칠하면 hover 확대 때 그 검은
       정사각형까지 같이 커져 이웃 그래픽 위에 검은 판이 올라탄다. 검정은
       #canvas-holder의 배경이 대신 깔아주므로 보이는 결과는 같다. */
    gfx.clear();
    // 아이템마다 지연(burstDelay)이 달라 서로 다른 시점에 등장한다.
    let grow = null;
    if (bursting && currentShape === 'radial-spokes') {
      grow = spokeGrowFactors(elapsedSec, item.burstDelay, item.burstDuration);
    } else if (bursting) {
      grow = radialGrowFactors(elapsedSec, item.burstDelay, item.burstDuration);
    }
    drawItem(item, gfx, cellSize / 2, cellSize / 2, size, grow);
  });
}

// ── 그리드 빌드 ─────────────────────────────────────────────
//
// 열 수는 이 함수가 아니라 CSS의 auto-fill/minmax가 정한다. 여기서는 (1) 아이템
// 수만큼 빈 셀 div를 만들어 넣고, (2) 브라우저가 레이아웃을 확정한 다음 프레임에
// 각 셀의 실제 크기를 읽어 그 크기의 p5.Graphics를 만들어 넣는다. 그 뒤로는
// draw()가 renderGridFrame()을 불러 애니메이션이 끝날 때까지 다시 그린다.
//
// burst=true 로 부르면(탭 클릭, 정렬 변경, 첫 로드) 첫 렌더 시점을 기준으로 등장
// 애니메이션을 시작한다. 리사이즈는 burst 없이 부른다.

// 호버로 셀이 커지는 최대 배율. 캔버스 해상도 보정에도 쓰이므로, 이 값이 실제
// 확대율보다 작으면 확대된 그래픽이 뭉개져 보인다.
const CELL_HOVER_SCALE = 1.4;

function buildGridView(burst = false) {
  const holder = document.getElementById('canvas-holder');
  clearGridCells();
  holder.innerHTML = '';
  burstStart = null; // 새 빌드 시 일단 정적으로; 아래 첫 렌더에서 필요하면 켠다

  const order = getDisplayOrder();
  const items = currentItems();
  const myToken = ++gridBuildToken;

  // 재생하는 호출일 때만 지연을 새로 배정한다 — 리사이즈에서는 손대지 않으므로
  // 진행 중이던 애니메이션의 순서가 중간에 뒤바뀌지 않는다.
  if (burst) assignBurstDelays(order);

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

    if (burst) {
      burstStart = millis() / 1000; // t=0 을 첫 렌더에 맞춘다
    }

    /* 캔버스는 비트맵이라 transform: scale은 이미 그려진 픽셀을 늘려 보여줄 뿐이다.
       확대 배율만큼 미리 더 촘촘하게 그려둔다(레이아웃 크기는 그대로).
       hover가 없는 터치 기기에서는 곱하지 않는다 — 픽셀 수만큼 메모리가 늘어난다. */
    const hoverZoom = window.matchMedia('(hover: hover) and (pointer: fine)').matches
      ? CELL_HOVER_SCALE
      : 1;
    const density = Math.min(window.devicePixelRatio || 1, 2) * hoverZoom;

    cellEls.forEach((cellEl, i) => {
      const rect = cellEl.getBoundingClientRect();
      const cellSize = Math.max(1, Math.round(rect.width));
      const pad = cellSize * CELL_PADDING_RATIO;
      const size = cellSize - pad * 2;

      const gfx = createGraphics(cellSize, cellSize);
      gfx.pixelDensity(density);
      gfx.colorMode(HSB, 360, 100, 100);

      // createGraphics()의 캔버스는 기본이 display:none(오프스크린 버퍼용)이다
      gfx.canvas.style.display = 'block';
      cellEl.appendChild(gfx.canvas);
      gridCells.push({ gfx, item: items[order[i]], cellSize, size });
    });

    renderGridFrame(millis() / 1000); // 첫 프레임을 즉시 한 번 그려서 애니메이션 시작 전에도 바로 보이게
    updateHoverGeometry(); // 셀이 새로 생겼으므로 호버용 중심 좌표도 다시 잰다
  });
}

// ── 호버 — 커서 주변이 함께 반응하는 자기장 ─────────────────────
//
// CSS :hover로는 커서가 올라간 칸 하나만 반응시킬 수 있다 — CSS 선택자로는 2차원
// 격자의 이웃을 짚을 수 없기 때문이다(아래 칸은 '열 수만큼' 떨어진 형제이고 그 열
// 수는 auto-fill이 정한다). 그래서 커서와의 거리로 계산한다. docs/archive.md 참고.
const HOVER_RADIUS_RATIO = 2.2; // 반응 반경 = 셀 크기 × 이 값
// 거리 감쇠 지수. 1이면 선형(뭉툭), 크면 중심에 몰려 뾰족해진다.
const HOVER_FALLOFF = 2;
// 목표 배율로 다가가는 속도(프레임당 비율). 빠르게 붙고 천천히 풀려야 궤적이 남는다.
const HOVER_GROW_SPEED = 0.3;
const HOVER_SHRINK_SPEED = 0.055;

// 터치 기기는 제외 — 탭한 뒤 확대가 그대로 붙어 있는 현상을 막는다.
let hoverEnabled = false;
// { el, cx, cy, scale, applied } — cx/cy는 문서 좌표계 중심이라 스크롤해도 변하지
// 않는다(빌드·리사이즈 때만 다시 잰다).
let hoverCells = [];
let hoverCellSize = 0;
let hoverPointer = null; // 뷰포트 좌표. 커서가 창을 벗어나면 null
let hoverRaf = null;

// 셀 중심 좌표를 다시 잰다. 측정은 .archive-cell(부모 div) 기준 — canvas는
// transform을 먹이는 대상이라 확대 중에 재면 크기가 달라진 사각형을 읽게 된다.
function updateHoverGeometry() {
  if (!hoverEnabled) return;
  const sx = window.scrollX;
  const sy = window.scrollY;
  hoverCells = gridCells.map(({ gfx }) => {
    const el = gfx.canvas;
    const r = (el.parentElement || el).getBoundingClientRect();
    return {
      el,
      cx: r.left + sx + r.width / 2,
      cy: r.top + sy + r.height / 2,
      scale: 1,
      applied: 1,
    };
  });
  hoverCellSize = gridCells.length > 0 ? gridCells[0].cellSize : 0;
}

function startHoverLoop() {
  if (hoverEnabled && hoverRaf === null) hoverRaf = requestAnimationFrame(hoverFrame);
}

// 상세 오버레이나 메뉴가 열린 동안에는 호버를 받지 않는다(커튼이 반투명해서 뒤
// 그리드가 들썩이는 게 그대로 비친다).
// [주의] 이벤트가 아니라 상태를 본다 — pointerenter는 커서가 '움직여서' 들어올
// 때만 오므로, 커서를 고정한 채 클릭해 열면 발화하지 않는다.
function hoverBlocked() {
  if (document.body.classList.contains('menu-open')) return true;
  const overlay = document.getElementById('detail-overlay');
  return overlay !== null && overlay.classList.contains('open');
}

// 모든 칸을 제 크기로 즉시 되돌린다(감쇠 없이). 오버레이를 열 때 쓴다 —
// 천천히 줄어드는 과정이 반투명 커튼 뒤로 그대로 보인다.
function resetHover() {
  hoverPointer = null;
  for (const c of hoverCells) {
    c.scale = 1;
    c.applied = 1;
    c.el.style.transform = '';
    c.el.style.zIndex = '';
  }
  if (hoverRaf !== null) {
    cancelAnimationFrame(hoverRaf);
    hoverRaf = null;
  }
}

// 매 프레임 모든 칸의 목표 배율을 거리에서 구하고 현재 배율을 그쪽으로 당긴다.
// 커서가 없고 모든 칸이 제 크기로 돌아오면 루프를 멈춘다.
function hoverFrame() {
  hoverRaf = null;

  // 도중에 커튼이 열렸으면 즉시 걷어낸다(메뉴는 이쪽에 훅이 없어 루프에서 확인).
  if (hoverBlocked()) {
    resetHover();
    return;
  }

  const radius = hoverCellSize * HOVER_RADIUS_RATIO;
  // 커서는 뷰포트 좌표라 문서 좌표로 바꿔 비교한다 — 매 프레임 다시 더하므로
  // 커서를 멈춘 채 스크롤만 해도 반응이 따라온다.
  const px = hoverPointer ? hoverPointer.x + window.scrollX : null;
  const py = hoverPointer ? hoverPointer.y + window.scrollY : null;

  let moving = false;
  for (const c of hoverCells) {
    let target = 1;
    if (px !== null && radius > 0) {
      const d = Math.hypot(c.cx - px, c.cy - py);
      if (d < radius) {
        target = 1 + (CELL_HOVER_SCALE - 1) * Math.pow(1 - d / radius, HOVER_FALLOFF);
      }
    }

    const speed = target > c.scale ? HOVER_GROW_SPEED : HOVER_SHRINK_SPEED;
    c.scale += (target - c.scale) * speed;
    // 지수적으로 수렴하는 값은 영원히 1이 안 되므로 끊어줘야 루프가 멈춘다.
    if (target === 1 && c.scale - 1 < 0.002) c.scale = 1;
    if (c.scale !== 1) moving = true;

    // 바뀐 칸만 건드린다 — 전부에 매 프레임 스타일을 쓰면 그만큼 낭비다.
    if (Math.abs(c.scale - c.applied) > 0.001 || (c.scale === 1 && c.applied !== 1)) {
      c.applied = c.scale;
      if (c.scale === 1) {
        c.el.style.transform = '';
        c.el.style.zIndex = '';
      } else {
        c.el.style.transform = `scale(${c.scale.toFixed(4)})`;
        // 큰 칸이 위로 — 안 주면 뒤쪽 칸(DOM 순서상 나중)이 앞 칸의 확대분을 가린다.
        // [주의] 1~5로 묶는다 — 상단 툴바 10, 상세 오버레이 100, 메뉴 190~200을
        // 넘으면 셀이 그 위로 올라온다.
        const lift = (c.scale - 1) / (CELL_HOVER_SCALE - 1); // 0~1
        c.el.style.zIndex = String(Math.round(lift * 4) + 1);
      }
    }
  }

  if (moving || hoverPointer !== null) hoverRaf = requestAnimationFrame(hoverFrame);
}

// setup()에서 한 번만 부른다.
function initHover() {
  hoverEnabled = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!hoverEnabled) return;

  // 그리드 밖으로 나가도 가장자리 칸은 반응해야 하므로 window에서 받는다
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (hoverBlocked()) return; // 오버레이가 열려 있으면 커튼 위 움직임은 무시
      hoverPointer = { x: e.clientX, y: e.clientY };
      startHoverLoop();
    },
    { passive: true }
  );

  // 커서가 창을 완전히 벗어날 때만 해제한다(relatedTarget이 없는 경우).
  document.addEventListener('pointerout', (e) => {
    if (e.relatedTarget === null) {
      hoverPointer = null;
      startHoverLoop();
    }
  });
}

// ── 그래픽 클릭 → 상세 오버레이(QR + 이름) ─────────────────────
// qrErrorData의 id가 실제 QR 번호이자 itemId라 QR 이미지도 같은 번호로 대응된다.
// ITEM_COUNT와 QR_IMAGE_COUNT가 같은 수라 아래 모듈러 순환(qrIndexOf)은 사실상
// 항등함수지만, 둘의 개수가 어긋나는 경우를 대비해 남겨둔다.
const QR_IMAGE_COUNT = 203; // images/qr/qr_final_001.jpg ~ qr_final_203.jpg

// errorA(unfilledRate)/errorB(overflowRate)를 n 오름차순으로 정렬해 채운다.
// setup()에서 완료를 기다린 뒤 아이템을 만든다.
function loadErrorData() {
  return fetch('../data/qr_error_data.json')
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

// qr 번호 → 이름 매핑. '스캔여부' 항목은 쓰지 않고, 이름이 없으면 '익명'으로 표시.
let qrNames = {};

// [수집 순번 표시] 상세 오버레이에 No.n(왼쪽)·이름(오른쪽)을 나눠 붙일지 여부.
// false면 가운데 정렬된 이름만 나온다. 완전히 지울 때는 style.css의
// .detail-box p.has-number 블록과 fillDetail()의 if/else도 함께 지운다.
const SHOW_QR_NUMBER_PREFIX = false;

function loadQrNames() {
  fetch('../data/qr_name.json')
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

// itemId 를 QR 번호로 순환시켜 준다.
function qrIndexOf(itemId) {
  return ((Number(itemId) - 1) % QR_IMAGE_COUNT) + 1;
}

function qrImagePath(itemId) {
  const n = qrIndexOf(itemId);
  return `images/qr/qr_final_${String(n).padStart(3, '0')}.jpg`;
}

// 상세 오버레이가 순회할 id 목록과 현재 위치. 열 때 그 시점의 정렬 순서를 담아둔다.
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

// 상세 박스 그래픽 버퍼. 열 때마다 새로 만들고 닫을 때/항목 이동 때 폐기한다.
let detailGfx = null;
// 자동 전환마다 카드를 같은 방향으로 180도씩 돌린다(누적 각도).
// 360의 배수면 그래픽 면, 360k+180이면 QR 면. 여는 시점은 그래픽 면.
let detailFlipAngle = 0;

// burst 탭에서만 상세 박스 그래픽에도 등장 애니메이션을 준다. QR 면에서는
// 'collapsed'(중심에 뭉쳐 대기), 그래픽 면이 드러나는 순간 'running'으로 재생하고,
// QR 면으로 돌아가면 다음 재생을 위해 'collapsed'로 되돌린다. bloom은 항상 'none'.
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

  // 렌더 해상도(표시는 CSS가 박스 폭에 맞춰 축소). 표시 크기보다 넉넉해서 배율을
  // 올릴 필요가 없다 — burst 탭은 뒤집히는 트랜지션과 동시에 매 프레임 다시 그리므로
  // 배율을 올리면 메인 스레드를 다투다 미세하게 끊긴다.
  const R = 520;
  const density = 1;
  const g = createGraphics(R, R);
  g.pixelDensity(density);
  g.colorMode(HSB, 360, 100, 100);
  // p5는 캔버스에 인라인 width/height(px)를 박아서 박스를 초과하므로 덮어쓴다.
  g.canvas.style.display = 'block';
  g.canvas.style.width = '100%';
  g.canvas.style.height = '100%';

  const size =
    currentShape === 'radial' ? R * DETAIL_RADIAL_SIZE_RATIO : R - R * CELL_PADDING_RATIO * 2;
  detailRenderInfo = { g, item, cx: R / 2, cy: R / 2, size };

  // burst는 QR 면부터 보이므로 중심에 뭉친 채 대기, bloom은 바로 정지 프레임으로.
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

  // 상세 박스는 perSpokeBurst=true — 선분별 개별 지연·easeOutExpo를 core.js가
  // 처리하므로 여기서는 선형(미가공) 진행도만 넘긴다.
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

// 그래픽 면으로 즉시 맞춘다(열 때/항목 이동 시). 트랜지션을 잠깐 꺼서 플립 없이
// 곧바로 보이게 한다 — 안 그러면 이전 항목의 QR이 잠깐 보이는 잔상이 생긴다.
function resetDetailFlip() {
  const flipper = document.getElementById('detail-flipper');
  flipper.style.transition = 'none';
  detailFlipAngle = 0; // 그래픽 면
  applyDetailFlip();
  flipper.offsetHeight; // 리플로우 강제 → 이후 전환부터 다시 트랜지션 적용
  flipper.style.transition = '';

  // burst 탭은 그래픽 면이 바로 보이는 시점이므로 즉시 재생한다.
  if (currentShape === 'radial-spokes' && detailRenderInfo) {
    detailAnimPhase = 'running';
    detailBurstStart = millis() / 1000;
  }
}

// [주의] #detail-flipper의 CSS transition(transform 0.6s)과 맞춰둔 값.
const DETAIL_FLIP_TRANSITION_MS = 600;

// 카드를 지정한 면으로 맞춘다. 이미 그 면이면 아무것도 하지 않는다
// (자동 전환 타이머가 매번 호출하므로).
function showDetailStage(stage) {
  const showingGraphic = (detailFlipAngle / 180) % 2 === 0;
  const wantGraphic = stage === 'graphic';
  if (showingGraphic === wantGraphic) return;

  const flipAngleAtCall = detailFlipAngle; // 아래 지연 콜백에서 중간에 또 안 바뀌었는지 확인용
  detailFlipAngle += 180;
  applyDetailFlip();

  // burst 탭에서만: 그래픽 면으로 넘어가는 순간 재생하고, QR 면으로 돌아가면
  // 다음 재생을 위해 다시 중심에 뭉쳐둔다.
  if (currentShape === 'radial-spokes' && detailRenderInfo) {
    if (wantGraphic) {
      detailAnimPhase = 'running';
      detailBurstStart = millis() / 1000;
    } else {
      // [주의] 여기서 바로 'collapsed'로 그리면 카드가 채 돌기도 전에 그래픽이 순간
      // 사라져 보인다. 플립 중엔 backface-visibility로 어차피 안 보이므로 다 그려진
      // 그래픽을 그대로 둔 채 회전만 시키고, 끝난 뒤에 되돌린다.
      setTimeout(() => {
        if (detailFlipAngle !== flipAngleAtCall + 180) return; // 그사이 다시 바뀌었으면 손대지 않음
        detailAnimPhase = 'collapsed';
        detailBurstStart = null;
        drawDetailFrame();
      }, DETAIL_FLIP_TRANSITION_MS);
    }
  }
}

// 그래픽 → QR → 그래픽 ... 오버레이가 열려 있는 동안 반복한다.
const DETAIL_AUTO_STAGE_MS = 2200;
// 카드를 열고 처음 보이는 면만 짧게 머문다 — 첫 면이 2.2초를 꽉 채우면 뒤에 QR이
// 있다는 걸 모르는 사람은 그 전에 다음 항목으로 넘겨버린다. 뒤집힌다는 사실을 일단
// 빨리 보여주고, 그 뒤로는 읽을 시간이 필요하니 평소 간격으로 돌아간다.
const DETAIL_FIRST_STAGE_MS = 1100;
let detailAutoTimer = null;

function stopDetailAutoCycle() {
  if (detailAutoTimer !== null) {
    clearTimeout(detailAutoTimer);
    detailAutoTimer = null;
  }
}

// 첫 전환만 호출부에서 짧게 넘기고, 이후 재예약은 인자 없이 자기를 다시 부른다.
function scheduleDetailAutoStage(stage, delayMs = DETAIL_AUTO_STAGE_MS) {
  detailAutoTimer = setTimeout(() => {
    showDetailStage(stage);
    scheduleDetailAutoStage(stage === 'qr' ? 'graphic' : 'qr');
  }, delayMs);
}

// resetDetailFlip()이 이미 그래픽 면으로 맞춰둔 상태에서 시작한다.
function startDetailAutoCycle() {
  stopDetailAutoCycle();
  scheduleDetailAutoStage('qr', DETAIL_FIRST_STAGE_MS);
}

// itemId 하나로 오버레이 내용을 채운다 — 그래픽 면을 먼저 보여주고, QR 이미지는
// 로드를 미리 시작해둔다(전환될 때 지연 없이 바로 보인다). 열고 닫기는 안 건드림.
function fillDetail(itemId) {
  const n = qrIndexOf(itemId);
  document.getElementById('detail-qr').src = qrImagePath(itemId);
  const displayName = qrNames[n] || '익명';
  const nameEl = document.getElementById('detail-name');
  // [수집 순번 표시] 지울 땐 이 if/else 를 else 쪽 한 줄로 바꾸면 된다.
  if (SHOW_QR_NUMBER_PREFIX) {
    nameEl.classList.add('has-number');
    nameEl.textContent = '';
    const noSpan = document.createElement('span');
    noSpan.className = 'detail-no';
    noSpan.textContent = `No.${n}`;
    const personSpan = document.createElement('span');
    personSpan.className = 'detail-person';
    personSpan.textContent = displayName;
    nameEl.append(noSpan, personSpan);
  } else {
    nameEl.classList.remove('has-number');
    nameEl.textContent = displayName;
  }
  renderDetailGraphic(itemId);
  resetDetailFlip(); // 그래픽 면부터 시작
  startDetailAutoCycle(); // 그래픽 → QR → 그래픽 ... 자동 반복
  updateDetailNavButtons();
}

// 양옆(이전·다음) QR을 미리 받아둔다 — 캐시에 없으면 이전 QR이 잠깐 보이는 로드
// 지연이 생긴다. 한 번 받은 경로는 다시 요청하지 않고, 양 끝에서는 없는 쪽을 건너뛴다.
const preloadedQrPaths = new Set();
function preloadQr(itemId) {
  const path = qrImagePath(itemId);
  if (preloadedQrPaths.has(path)) return;
  preloadedQrPaths.add(path);
  new Image().src = path;
}
function preloadDetailNeighbors() {
  if (!detailOrderIds.length) return;
  if (detailPos + 1 < detailOrderIds.length) preloadQr(detailOrderIds[detailPos + 1]);
  if (detailPos - 1 >= 0) preloadQr(detailOrderIds[detailPos - 1]);
}

// 양 끝에서 순환하지 않고 멈춘 것처럼 보이게 한쪽 버튼을 숨긴다.
function updateDetailNavButtons() {
  const atFirst = detailPos <= 0;
  const atLast = detailPos >= detailOrderIds.length - 1;
  document.getElementById('detail-prev').style.display = atFirst ? 'none' : '';
  document.getElementById('detail-next').style.display = atLast ? 'none' : '';
}

// ── 이미지 저장 ────────────────────────────────────────────
// 합성은 shared/save-card.js가 맡고 여기서는 재료만 모은다.
//
// [주의] 오차값을 두 가지로 넘긴다 — item.errorA/errorB는 순위로 0~1에 편
// 정규화값(그래픽 모양용)이고, 카드에 찍히는 %는 qrErrorData의 원본 비율이다.
// [주의] QR은 상세 박스가 띄워둔 <img>를 그대로 쓴다 — 새로 로드하면 그 사이
// 공유 시트를 띄울 자격(사용자 제스처)을 잃는다.
async function saveDetailCard() {
  const btn = document.getElementById('detail-save');
  if (btn.disabled) return;

  const itemId = detailOrderIds[detailPos];
  const item = itemById(itemId);
  const n = qrIndexOf(itemId);
  const raw = qrErrorData.find((d) => d.n === n);
  const qrEl = document.getElementById('detail-qr');
  if (!item || !raw) return;

  // 잠그기만 하고 글자는 그대로 — 글자 수가 달라지면 버튼 폭까지 덜컥인다.
  btn.disabled = true;

  try {
    // 아직 안 받아졌을 때만 기다린다(대개 이미 떠 있는 이미지라 즉시 통과)
    if (!qrEl.complete || !qrEl.naturalWidth) {
      await qrEl.decode().catch(() => {});
    }

    const canvas = SaveCard.render({
      id: n,
      name: qrNames[n] || '익명',
      shape: currentShape,
      item,
      unfilled: raw.errorA,
      overflow: raw.errorB,
      qrSource: qrEl,
      qrKey: qrEl.src,
    });

    const shape = currentShape === 'radial' ? 'bloom' : 'burst';
    await SaveCard.save(canvas, `QR++_${n}_${shape}.jpg`);
  } finally {
    btn.disabled = false;
  }
}

function openDetailOverlay(itemId) {
  resetHover(); // 커튼 뒤에 확대된 채 남은 그래픽을 즉시 제 크기로 되돌린다
  detailOrderIds = currentOrderedIds();
  detailPos = detailOrderIds.indexOf(Number(itemId));
  if (detailPos < 0) detailPos = 0;
  fillDetail(itemId);
  document.getElementById('detail-overlay').classList.add('open');
  lockBodyScroll();
  preloadDetailNeighbors();
}

// ── 배경 스크롤 잠금 ────────────────────────────────────────
// 상세 오버레이가 열린 동안 뒤 그리드가 같이 밀리지 않도록 막는다.
// [주의] body에 position:fixed + overflow:hidden 을 쓰지 않는다 — 스크롤바가
// 사라져 레이아웃 폭이 출렁이고 #control-bars 의 sticky 가 풀린다. 문서는 스크롤
// 가능한 상태로 두고 입력만 막는다(docs/archive.md).
// 터치는 style.css 의 #detail-overlay.open{touch-action:none} 이 맡고, 여기서는
// 휠과 스크롤 키를 막는다.

function blockScrollEvent(e) {
  e.preventDefault();
}

function lockBodyScroll() {
  document.body.classList.add('detail-open');
  // [주의] passive:false 로 등록해야 preventDefault 가 먹는다.
  window.addEventListener('wheel', blockScrollEvent, { passive: false });
  window.addEventListener('touchmove', blockScrollEvent, { passive: false });
}

function unlockBodyScroll() {
  if (!document.body.classList.contains('detail-open')) return;
  document.body.classList.remove('detail-open');
  window.removeEventListener('wheel', blockScrollEvent);
  window.removeEventListener('touchmove', blockScrollEvent);
}

// dir: -1(이전) | +1(다음). 양 끝에서는 순환하지 않는다 — 버튼도 숨겨지지만
// 키보드 방향키에 대비해 여기서도 범위를 벗어나면 무시한다.
function stepDetail(dir) {
  if (!detailOrderIds.length) return;
  const next = detailPos + dir;
  if (next < 0 || next >= detailOrderIds.length) return;
  detailPos = next;
  fillDetail(detailOrderIds[detailPos]);
  preloadDetailNeighbors();
}

function closeDetailOverlay() {
  stopDetailAutoCycle(); // 페이지(오버레이)를 벗어나면 자동 전환도 멈춘다
  document.getElementById('detail-overlay').classList.remove('open');
  unlockBodyScroll();
  if (detailGfx) {
    detailGfx.remove();
    detailGfx = null;
  }
  detailRenderInfo = null;
  detailAnimPhase = 'none';
  detailBurstStart = null;
}

// ── p5 setup ────────────────────────────────────────────────
// errorA/errorB가 실제 데이터로 결정되므로 로딩이 끝날 때까지 기다렸다가 아이템을
// 만든다. 그 사이에도 이벤트 리스너는 먼저 걸어둬 UI 자체는 바로 반응하게 한다.
async function setup() {
  // [주의] 명시해야 한다 — 안 하면 p5가 100x100 기본 캔버스를 body 끝에 붙여
  // 페이지 맨 아래에 빈 100px이 딸려 붙는다.
  noCanvas();

  colorMode(HSB, 360, 100, 100);
  frameRate(30); // 아이템이 많아 매 프레임 다시 그리는 비용을 아낌

  loadQrNames(); // 클릭 시점에만 필요하므로 비동기로 읽어둔다

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

  // 셀은 매번 새로 만들어지지만 holder 자체는 그대로이므로 위임으로 한 번만 걸어둔다
  document.getElementById('canvas-holder').addEventListener('click', (e) => {
    const cell = e.target.closest('.archive-cell');
    if (!cell) return;
    openDetailOverlay(cell.dataset.itemId);
  });

  // 박스 밖 어두운 배경을 클릭하면 닫힘
  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-overlay') closeDetailOverlay();
  });

  // < , > 버튼. 클릭이 배경 닫기로 번지지 않도록 stopPropagation.
  document.getElementById('detail-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    stepDetail(-1);
  });
  document.getElementById('detail-next').addEventListener('click', (e) => {
    e.stopPropagation();
    stepDetail(1);
  });

  document.getElementById('detail-save').addEventListener('click', (e) => {
    e.stopPropagation();
    saveDetailCard();
  });

  // 키보드 ← / → 로도 이동(오버레이가 열려 있을 때만), Esc 로 닫기.
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('detail-overlay').classList.contains('open')) return;
    if (e.key === 'ArrowLeft') stepDetail(-1);
    else if (e.key === 'ArrowRight') stepDetail(1);
    else if (e.key === 'Escape') closeDetailOverlay();
    // 휠·터치만 막으면 키보드로는 그대로 스크롤되므로 여기서도 막는다
    else if ([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key))
      e.preventDefault();
  });

  await loadErrorData(); // 실제 errorA/errorB 데이터를 기다린 뒤 아이템 생성
  ITEM_COUNT = qrErrorData.length;
  radialItems = generateRadialItems();
  spokeItems = generateSpokeItems();

  initHover(); // 커서 주변이 함께 커지는 호버(PC 전용)
  buildGridView(true); // 첫 로드에도 첫 탭 폭죽 등장 애니메이션 재생
}

// 리사이즈 시 열 수·셀 크기가 바뀔 수 있으므로 다시 빌드한다. 단 폭이 실제로
// 달라졌을 때만 — 셀 크기는 가로폭에만 좌우되고(aspect-ratio 1:1), iOS 사파리는
// 스크롤 중 툴바가 접혔다 펴지며 높이만 계속 바뀐다.
let lastGridWidth = window.innerWidth;

function windowResized() {
  if (window.innerWidth === lastGridWidth) return;
  lastGridWidth = window.innerWidth;
  buildGridView();
}

// 애니메이션 루프 — 평소엔 정적이고, 등장 애니메이션이 진행 중일 때만 매 프레임
// 다시 그리다가 끝나면 멈춘다.
function draw() {
  const nowSec = millis() / 1000;

  if (gridCells.length > 0 && burstStart !== null) {
    renderGridFrame(nowSec);

    // [주의] bloom은 가장 늦게 시작해서 가장 느리게 자라는 최악의 조합을 기준으로
    // 잡아야 한다 — 빼먹으면 마지막 칸 몇 개가 다 자라기 전에 루프가 멈춘다.
    let total = 0;
    if (currentShape !== 'radial-spokes') {
      total =
        RADIAL_BURST_STAGGER_MAX +
        RADIAL_BURST_STAGGER_JITTER +
        RADIAL_BURST_SET_DELAY +
        RADIAL_BURST_DURATION * (1 + RADIAL_BURST_DURATION_VARY);
    } else {
      // burst는 assignSpokeBurstDelays()가 담아둔 실측 끝 시점
      total = spokeBurstPlan.total;
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
