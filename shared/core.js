/* QR++ — shared/core.js
   About 페이지·아카이브 그리드·저장 카드가 공유하는 그래픽 생성 로직.
   여기를 고치면 세 곳 모두에 반영된다.

   bloom = drawRadialBurstFlowerDev (말리는 방사형 선 + 선 끝을 따라가는 원)
   burst = drawRadialSpokeDots      (중심에서 뻗는 직선 선분 두 겹 + 끝점 원)

   · 재현성 — p5 전역 random()을 쓰지 않고 makeRadialSpokeRng(seed)의 로컬 RNG만
     쓴다. 같은 입력이면 항상 같은 결과다.
   · 색 — 오차 데이터와 무관하게 RADIAL_COLOR_PALETTE(5색)에서 뽑는다.
   · 렌더링 대상 g — 메인 캔버스는 window, 개별 버퍼는 p5.Graphics. 두 쪽 다
     같은 draw API라 함수 내부는 대상을 신경 쓰지 않는다.
   · 크기 — 모든 도형 수치는 호출부가 넘긴 size 대비 비율(XXX_RATIO)로만 계산한다.
     픽셀 고정값은 이 파일에 없다.

   errorA/errorB가 무엇을 바꾸는지, 상수의 근거는 docs/shared.md 참고. */

// ── bloom 공용 상수 — 훅은 앞부분은 직선, 뒷부분만 반지름 고정 원호 형태 ────
const RADIAL_RADIUS_RATIO = 0.5; // 꽃 전체 반경 = size × 이 비율 (캔버스를 꽉 채움)
const RADIAL_SWEEP_MAX = 4.5; // errorB = 1 일 때 도는 총 각도(라디안, 약 258°) — errorB = 0이면 0(직선)
const RADIAL_HOOK_START_RATIO = 0.55; // 길이 중 이 비율까지는 직선 유지, 그 뒤부터만 휨
const RADIAL_HOOK_RADIUS_RATIO = 0.35; // 훅 고리의 반지름 = radius × 이 비율 — sweep과 무관하게 고정
const RADIAL_ARC_SEGMENTS = 24; // 휘는 구간을 근사하는 폴리라인 조각 수
// [주의] 색은 새 아이템이 생길 때 딱 한 번만 뽑아 고정해서 써야 한다 —
// 매 프레임 다시 뽑으면 리사이즈·슬라이더 조작마다 색이 바뀐다.
const RADIAL_COLOR_PALETTE = ['#f299c1', '#fee987', '#7ecaac', '#567591', '#f58b6e'];
const RADIAL_STROKE_WEIGHT_RATIO = 0.1; // 호 굵기 = size × 이 비율 (볼드하지 않은 일반 두께)

// errorA가 제어하는 중심 둘레 원 — arcCount만큼 균등 배치되고, errorA가 커질수록
// 중심에서 바깥으로 퍼져나간다.
const RADIAL_DOT_MIN_DIST_RATIO = 0.03; // errorA = 0 일 때 중심으로부터 거리 = radius × 이 비율
const RADIAL_DOT_MAX_DIST_RATIO = 0.9; // errorA = 1 일 때 중심으로부터 거리 = radius × 이 비율
const RADIAL_DOT_SIZE_RATIO = 0.35; // 원 하나의 지름 = radius × 이 비율

// 팔레트에서 서로 다른 색 2개(선 색, 점 색 — 절대 겹치지 않음).
// rnd — 0~1 난수 함수. 새로고침해도 색이 안 바뀌어야 하는 곳은
// makeRadialSpokeRng(seed)로 만든 로컬 RNG를 넘긴다.
function pickRadialColors(rnd = () => random()) {
  const i = Math.floor(rnd() * RADIAL_COLOR_PALETTE.length);
  let j = Math.floor(rnd() * (RADIAL_COLOR_PALETTE.length - 1));
  if (j >= i) j += 1; // i를 건너뛰어서 j !== i를 보장
  return { lineColor: RADIAL_COLOR_PALETTE[i], dotColor: RADIAL_COLOR_PALETTE[j] };
}

// ── bloom 전용 상수 ───────────────────────────────────────
// 아래 drawRadialBurstFlowerDev에서만 쓴다.
const RADIAL_V2_ARC_COUNT_MIN = 6; // errorA = 0 일 때 방사형선 개수
const RADIAL_V2_ARC_COUNT_MAX = 14; // errorA = 1 일 때 방사형선 개수
const RADIAL_V2_LAYER_RADIUS_RATIO = 0.7; // 두 번째(짧은) 선 길이 = 원래 선 길이 × 이 비율

// ── bloom: 방사형 훅 + 선 끝을 따라가는 원 ──────────────────────
//
// 방사형선 개수는 errorA에 비례해 6~14개(굵기는 고정). 각 선 아래에 반지름만 줄인
// 두 번째 선을 겹쳐 그리고, 그 선은 errorA를 따른다(원래 선은 errorB). 중심-거리 원과
// 끝점 원 개수도 arcCount를 따라간다. 끝점 원은 선 색·중심-거리 원 색과 겹치지 않는
// 색 하나를 호출부에서 골라 넘긴다. mirrorSecondary=true(좌우 반전)로 픽스됐다.
// errorB가 커지면 선의 시작점이 중심에서 멀어지지만, 원호로 마는 부분은 항상 전부
// 그려지도록 직선 구간의 끝까지만 이동한다.
//
// 잘림 방지는 2패스다 — 실제 크기로 한 번 만들어 가장 먼 지점을 재고(선 정점 +
// weight/2, 원 중심 + dotSize/2), 그 거리가 size/2가 되도록 스케일해서 다시 만든다.
// 어떤 errorA/errorB 조합에서도, 요소가 추가돼도 항상 박스에 꽉 맞고 넘치지 않는다.
//
// 이 함수는 계산만 하고 그리지 않는다 — 위 2패스에서 두 번 호출된다.
function buildRadialDevGeometry(
  size,
  errorA,
  errorB,
  mirrorSecondary,
  lineAngleOffset,
  dotAngleOffset,
  strokeWeightRatio = RADIAL_STROKE_WEIGHT_RATIO
) {
  const radius = size * RADIAL_RADIUS_RATIO;
  const sweep = map(errorB, 0, 1, 0, RADIAL_SWEEP_MAX);
  const weight = Math.max(1, size * strokeWeightRatio);
  const arcCount = Math.round(map(errorA, 0, 1, RADIAL_V2_ARC_COUNT_MIN, RADIAL_V2_ARC_COUNT_MAX));
  const dotSize = radius * RADIAL_DOT_SIZE_RATIO;
  const startDistMax = radius * RADIAL_HOOK_START_RATIO;
  const startDist = map(errorB, 0, 1, 0, startDistMax);
  const secondaryLen = radius * RADIAL_V2_LAYER_RADIUS_RATIO;
  const secondarySweep = map(errorA, 0, 1, 0, RADIAL_SWEEP_MAX);
  const secondaryStartDist = map(errorA, 0, 1, 0, secondaryLen * RADIAL_HOOK_START_RATIO);
  const dotDist = map(errorA, 0, 1, RADIAL_DOT_MIN_DIST_RATIO, RADIAL_DOT_MAX_DIST_RATIO) * radius;

  const lines = [];
  const secondaries = [];
  const tips = [];
  const dotAngles = [];
  for (let p = 0; p < arcCount; p++) {
    const angle = -HALF_PI + (TWO_PI * p) / arcCount + lineAngleOffset;
    const secondaryPoints = hookArcPointsFromStart(
      secondaryLen,
      angle,
      secondarySweep,
      secondaryStartDist,
      mirrorSecondary
    );
    const points = hookArcPointsFromStart(radius, angle, sweep, startDist);
    lines.push(points);
    secondaries.push(secondaryPoints);
    tips.push(points[points.length - 1]);
    dotAngles.push(-HALF_PI + (TWO_PI * p) / arcCount + dotAngleOffset);
  }

  return { arcCount, weight, dotSize, lines, secondaries, tips, dotDist, dotAngles };
}

// 시작점을 (0,0)이 아니라 중심선을 따라 startDist만큼 옮긴 지점에서 시작한다.
// mirror = true면 호가 휘는 원의 중심을 반대쪽에 두고 도는 방향도 반전해서, 원호가
// 말리는 방향만 선 축 기준 좌우 대칭이 되게 한다.
// [주의] sweepAmt의 부호만 뒤집으면 진짜 좌우 반전이 되지 않는다 — 원 중심 오프셋
// 방향도 같이 바꿔야 한다.
function hookArcPointsFromStart(len, angle, sweepAmt, startDist, mirror = false) {
  const straightLen = len * RADIAL_HOOK_START_RATIO;
  const hookRadius = len * RADIAL_HOOK_RADIUS_RATIO;
  const straightX = cos(angle) * straightLen;
  const straightY = sin(angle) * straightLen;

  const points = [
    [cos(angle) * startDist, sin(angle) * startDist],
    [straightX, straightY],
  ];

  if (Math.abs(sweepAmt) < 1e-4) {
    points.push([cos(angle) * len, sin(angle) * len]);
  } else {
    const offsetAngle = mirror ? angle - HALF_PI : angle + HALF_PI;
    const alpha0 = mirror ? angle + HALF_PI : angle - HALF_PI;
    const effSweep = mirror ? -sweepAmt : sweepAmt;
    const circleCx = straightX + hookRadius * cos(offsetAngle);
    const circleCy = straightY + hookRadius * sin(offsetAngle);
    for (let seg = 1; seg <= RADIAL_ARC_SEGMENTS; seg++) {
      const alpha = alpha0 + (seg / RADIAL_ARC_SEGMENTS) * effSweep;
      points.push([circleCx + hookRadius * cos(alpha), circleCy + hookRadius * sin(alpha)]);
    }
  }

  let maxDist = 0;
  for (const [x, y] of points) {
    const d = Math.hypot(x, y);
    if (d > maxDist) maxDist = d;
  }
  const scale = maxDist > 0 ? len / maxDist : 1;
  return points.map(([x, y]) => [x * scale, y * scale]);
}

/* ── bloom geometry 캐시 ───────────────────────────────────────
   위 2패스는 호출마다 삼각함수와 배열 생성이 많아서, 그리드 200여 칸에 매 프레임
   두 번씩 돌면 GC까지 겹쳐 렉으로 나타난다. geometry는 size·errorA·errorB·각도
   오프셋·선 굵기 비율만으로 결정되고 애니메이션 진행도와 무관해서 재사용해도
   결과가 완전히 같다.

   [주의] 반환된 객체는 공유물이다. 쓰는 쪽에서 수정하면 안 된다.
   size가 바뀌면 키가 달라져 항목이 쌓이므로 한계치를 넘으면 통째로 비운다. */
const RADIAL_DEV_GEOMETRY_CACHE_MAX = 1000;
const radialDevGeometryCache = new Map();

function getFittedRadialDevGeometry(
  size,
  errorA,
  errorB,
  mirrorSecondary,
  lineAngleOffset,
  dotAngleOffset,
  strokeWeightRatio
) {
  const key = `${size}|${errorA}|${errorB}|${mirrorSecondary ? 1 : 0}|${lineAngleOffset}|${dotAngleOffset}|${strokeWeightRatio}`;
  const hit = radialDevGeometryCache.get(key);
  if (hit) return hit;

  // 1차 패스(측정) — 선 정점(+weight/2)과 원 중심(+dotSize/2) 중 가장 먼 지점
  const probe = buildRadialDevGeometry(
    size,
    errorA,
    errorB,
    mirrorSecondary,
    lineAngleOffset,
    dotAngleOffset,
    strokeWeightRatio
  );
  let maxExtent = 0;
  const consider = (dist, margin) => {
    const extent = dist + margin;
    if (extent > maxExtent) maxExtent = extent;
  };
  probe.lines.forEach((pts) => pts.forEach(([x, y]) => consider(Math.hypot(x, y), probe.weight / 2)));
  probe.secondaries.forEach((pts) => pts.forEach(([x, y]) => consider(Math.hypot(x, y), probe.weight / 2)));
  probe.tips.forEach(([x, y]) => consider(Math.hypot(x, y), probe.dotSize / 2));
  consider(probe.dotDist, probe.dotSize / 2);

  // 2차 패스(최종) — 그 거리가 정확히 size/2가 되도록 스케일해서 다시 만든다
  const fitScale = maxExtent > 0 ? size / 2 / maxExtent : 1;
  const shape = buildRadialDevGeometry(
    size * fitScale,
    errorA,
    errorB,
    mirrorSecondary,
    lineAngleOffset,
    dotAngleOffset,
    strokeWeightRatio
  );

  if (radialDevGeometryCache.size >= RADIAL_DEV_GEOMETRY_CACHE_MAX) radialDevGeometryCache.clear();
  radialDevGeometryCache.set(key, shape);
  return shape;
}

function drawRadialBurstFlowerDev(
  g,
  cx,
  cy,
  size,
  errorA,
  errorB,
  lineColorHex,
  dotColorHex,
  tipColorHex,
  mirrorSecondary = true,
  lineAngleOffset = 0,
  dotAngleOffset = 0,
  lineGrow = 1,
  dotGrow = 1,
  strokeWeightRatio = RADIAL_STROKE_WEIGHT_RATIO
) {
  // lineGrow/dotGrow (기본 1) — 등장 애니메이션 배율. 선분(호)+끝 원은 한 덩어리로,
  // 중심-거리 원은 따로 움직인다. 그룹 전체를 g.scale 로 한 번에 변형하는 방식이라
  // 스포크처럼 선분별 개별 지연은 없다. geometry는 이 값과 무관해서 캐시가 쓰인다.
  const shape = getFittedRadialDevGeometry(
    size,
    errorA,
    errorB,
    mirrorSecondary,
    lineAngleOffset,
    dotAngleOffset,
    strokeWeightRatio
  );

  g.push();
  g.translate(cx, cy);

  // 선분 + 끝 원 — 한 덩어리로 lineGrow(0~1) 스케일해 등장. <=0이면 건너뜀.
  if (lineGrow > 0) {
    g.push();
    g.scale(lineGrow);
    g.stroke(lineColorHex);
    g.strokeWeight(shape.weight);
    g.strokeCap(SQUARE);
    g.strokeJoin(ROUND);
    g.noFill();

    for (let p = 0; p < shape.arcCount; p++) {
      // 두 번째(짧은) 선을 먼저 그려서 원래 선 아래에 깔리게 한다.
      g.beginShape();
      for (const [x, y] of shape.secondaries[p]) g.vertex(x, y);
      g.endShape();

      g.beginShape();
      for (const [x, y] of shape.lines[p]) g.vertex(x, y);
      g.endShape();
    }

    // 선 끝을 따라가는 원 — 선분 색·중심-거리 원 색과 겹치지 않는 별도 색.
    g.noStroke();
    g.fill(tipColorHex);
    shape.tips.forEach(([x, y]) => {
      g.ellipse(x, y, shape.dotSize, shape.dotSize);
    });
    g.pop();
  }

  // 중심에서 멀어지는 errorA-거리 원 — dotGrow(0~1)로 선분과 따로 등장.
  // 개수는 방사형선과 함께 늘어나도록 arcCount에 맞춘다.
  if (dotGrow > 0) {
    g.push();
    g.scale(dotGrow);
    g.noStroke();
    g.fill(dotColorHex);
    shape.dotAngles.forEach((dotAngle) => {
      g.ellipse(cos(dotAngle) * shape.dotDist, sin(dotAngle) * shape.dotDist, shape.dotSize, shape.dotSize);
    });
    g.pop();
  }

  g.pop();
}

// ── burst: 방사형 선분 + 끝점 원 ──────────────────────────────
//
// 중심에서 뻗는 선분(spoke)과 각 끝의 원(dot)으로만 이루어진 정적 심볼. 선분은
// 두 세트다 — 밖지름 N개, 안지름 N개(밖지름 사이에 반 칸 어긋나 배치).
// 고정 시드(RADIAL_SPOKE_SEED) 기반이라 같은 errorA/errorB면 색 배정·지터까지
// 항상 동일한 형태가 재현된다.
//
// "큰 흐름"은 errorA/errorB가 잡고 랜덤은 잔결만 담당한다 — errorA는 두 층이
// 벌어지는 거리, errorB는 선분의 좌우 이동 폭. 색은 밖지름 전부 한 색, 안지름은
// 그와 다른 한 색, 끝점 원은 나머지 3색에서 원마다 개별 랜덤.
// 전체 크기는 errorA/errorB와 무관하게 일정하다(bloom과 달리 잘림 방지 스케일이
// 없다). 자세한 내용은 docs/shared.md 참고.
//
const RADIAL_SPOKE_SEED = 20240906; // 이 값을 바꾸면 길이·지터·배색 패턴 전체가 달라진다
const RADIAL_SPOKE_COUNT = 12; // 한 세트(밖지름/안지름)당 선분 개수
const RADIAL_SPOKE_MID_RATIO = 0.5; // 두 층의 기준(가운데) 반지름 = R × 이 비율
const RADIAL_SPOKE_SEPARATION_MIN = 0.05; // errorA=0 일 때 두 층 중심 간 거리 = R × 이 비율
const RADIAL_SPOKE_SEPARATION_MAX = 0.72; // errorA=1 일 때 두 층 중심 간 거리
const RADIAL_SPOKE_LEN_JITTER = 0.08; // 선분마다 자기 층 중심에서 ± 이 비율(R) 안에서 랜덤하게 길이 편차
const RADIAL_SPOKE_ANGLE_JITTER = 1.6; // errorB=1 일 때 선분 최대 이동폭 = (선분 간격 각도) × 이 비율 (1보다 크면 이웃 칸을 넘어설 수 있음)
const RADIAL_SPOKE_ANGLE_RANGE_MIN = 0.2; // 선분별 이동폭 랜덤 하한(위 최대치 대비 — 선분마다 흔들리는 폭도 제각각)
const RADIAL_SPOKE_WEIGHT_RATIO = 0.028; // 선분 굵기 = size × 이 비율
const RADIAL_SPOKE_DOT_RATIO = 0.15; // 끝점 원 지름 = R × 이 비율
// 폭죽 등장 애니메이션 — 세트(밖지름/안지름) 전체가 한 덩어리로 자라지
// 않고 선분 하나하나가 제각각 다른 타이밍에 퍼지도록, 선분마다 시작
// 시점을 0~이 비율 구간에서 랜덤으로 어긋낸다. 나머지 (1 - 이 비율)
// 구간이 그 선분이 실제로 0→1 로 자라는 데 걸리는 시간이 된다.
const RADIAL_SPOKE_BURST_STAGGER_RATIO = 0.6;

// mulberry32 — 시드 하나로 결정적인 0~1 난수열을 만드는 작은 PRNG.
// p5의 randomSeed()는 전역 난수 상태를 리셋해 다른 곳의 난수까지 고정해 버리므로,
// 전역을 건드리지 않는 로컬 RNG를 쓴다.
function makeRadialSpokeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 선분 두 세트의 각도·길이·색, 굵기, 끝점 원 크기를 계산해 반환한다(그리지 않음).
// 모든 선분은 원점(0,0)에서 시작한다. 형태는 고정 시드라 errorA/errorB가 같으면
// 항상 동일하고, 색만 별도 colorSeed 를 따른다(안 주면 형태 시드와 동일).
//
// perSpokeBurst — 등장 애니메이션 모드.
//   false(기본, 그리드) : outerProgress/innerProgress를 세트 전체에 곱해지는 최종
//                         배율로 쓴다(호출부에서 easeOutExpo까지 적용해 넘김).
//   true(상세 박스)     : 세트 공통 경과(0~1, 선형)로 보고, 선분마다 개별 랜덤 지연
//                         + easeOutExpo를 적용해 제각각 다른 타이밍에 퍼진다.
//
// [주의] 두 모드의 선분당 rnd() 소비량이 같아야 한다 — 그래야 애니메이션이 끝난
// 뒤의 형태가 같고, 그리드에서 본 그래픽과 상세 박스의 그래픽이 일치한다.
function buildRadialSpokeGeometry(
  size,
  errorA,
  errorB,
  colorSeed = RADIAL_SPOKE_SEED,
  outerProgress = 1,
  innerProgress = 1,
  perSpokeBurst = false
) {
  const rnd = makeRadialSpokeRng(RADIAL_SPOKE_SEED);
  const colorRnd = makeRadialSpokeRng(colorSeed);
  const R = size * RADIAL_RADIUS_RATIO;
  const step = TWO_PI / RADIAL_SPOKE_COUNT;
  const jitterMax = errorB * step * RADIAL_SPOKE_ANGLE_JITTER;

  // errorA — 두 층 중심 반지름을 MID 에서 대칭으로 벌린다(편차의 큰 폭).
  const separation = lerp(RADIAL_SPOKE_SEPARATION_MIN, RADIAL_SPOKE_SEPARATION_MAX, errorA);
  const outerCenter = RADIAL_SPOKE_MID_RATIO + separation / 2;
  const innerCenter = RADIAL_SPOKE_MID_RATIO - separation / 2;

  const pick = (pool) => pool[Math.floor(colorRnd() * pool.length)];

  // 밖지름 색 → 그걸 뺀 4색에서 안지름 색 → 둘을 뺀 3색에서 끝점 원 색(원마다 랜덤)
  const outerLineColor = pick(RADIAL_COLOR_PALETTE);
  const innerLineColor = pick(RADIAL_COLOR_PALETTE.filter((c) => c !== outerLineColor));
  const dotOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== outerLineColor && c !== innerLineColor);

  // centerRatio = 이 층의 중심 반지름 비율(errorA로 결정), 선분 길이는 거기서
  // ±LEN_JITTER 안에서만 랜덤. baseOffset = 세트 전체를 반 칸 돌리는 값.
  const burstDurationFrac = 1 - RADIAL_SPOKE_BURST_STAGGER_RATIO;

  const makeSet = (centerRatio, baseOffset, lineColor, progress) => {
    const arr = [];
    for (let i = 0; i < RADIAL_SPOKE_COUNT; i++) {
      const lenFull = R * (centerRatio + (rnd() * 2 - 1) * RADIAL_SPOKE_LEN_JITTER);
      const base = -HALF_PI + (i + baseOffset) * step;
      // 흔들릴 수 있는 최대 폭도 선분마다 랜덤, 그 안에서 실제 이동도 랜덤
      const spokeJitter = jitterMax * lerp(RADIAL_SPOKE_ANGLE_RANGE_MIN, 1, rnd());
      const angle = base + (rnd() * 2 - 1) * spokeJitter;

      // [주의] perSpokeBurst일 때만 쓰지만, 두 모드의 rnd 소비량을 같게 유지하려고
      // 항상 뽑아둔다.
      const startAt = rnd() * RADIAL_SPOKE_BURST_STAGGER_RATIO;
      let grow;
      if (perSpokeBurst) {
        // 공통 progress가 이 선분의 시작 시점을 지나야 자라기 시작한다
        const localT = Math.min(1, Math.max(0, (progress - startAt) / burstDurationFrac));
        grow = localT >= 1 ? 1 : 1 - Math.pow(2, -10 * localT); // easeOutExpo
      } else {
        // 세트 전체가 한 덩어리 — progress를 최종 배율 그대로 쓴다
        grow = progress;
      }
      const len = lenFull * grow;

      arr.push({ angle, len, lineColor, dotColor: pick(dotOptions), grow });
    }
    return arr;
  };

  const spokes = [
    ...makeSet(outerCenter, 0, outerLineColor, outerProgress),
    ...makeSet(innerCenter, 0.5, innerLineColor, innerProgress),
  ];
  const weight = Math.max(1, size * RADIAL_SPOKE_WEIGHT_RATIO);
  const dotSize = R * RADIAL_SPOKE_DOT_RATIO;
  return { spokes, weight, dotSize };
}

// perSpokeBurst — 등장 애니메이션 모드. buildRadialSpokeGeometry 주석 참고.
function drawRadialSpokeDots(
  g,
  cx,
  cy,
  size,
  errorA,
  errorB,
  colorSeed,
  outerProgress = 1,
  innerProgress = 1,
  perSpokeBurst = false
) {
  const shape = buildRadialSpokeGeometry(
    size,
    errorA,
    errorB,
    colorSeed,
    outerProgress,
    innerProgress,
    perSpokeBurst
  );

  g.push();
  g.translate(cx, cy);
  g.strokeCap(SQUARE); // 끝이 둥글지 않고 직선으로 딱 끝남

  // 방사형 선분 — 전부 중앙에서 시작. grow<=0(등장 전)은 건너뛴다.
  shape.spokes.forEach((s) => {
    if (s.grow <= 0) return;
    g.stroke(s.lineColor);
    g.strokeWeight(shape.weight);
    g.line(0, 0, cos(s.angle) * s.len, sin(s.angle) * s.len);
  });

  // 각 선분 끝의 원 — 크기도 grow 에 비례(터지면서 같이 커짐).
  g.noStroke();
  shape.spokes.forEach((s) => {
    if (s.grow <= 0) return;
    g.fill(s.dotColor);
    const d = shape.dotSize * s.grow;
    g.ellipse(cos(s.angle) * s.len, sin(s.angle) * s.len, d, d);
  });

  g.pop();
}
