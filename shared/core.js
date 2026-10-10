/* ============================================================
   QR++ — shared/core.js
   ------------------------------------------------------------
   About 페이지(about/sketch.js)와 아카이브 그리드(archive/sketch.js)가
   공유하는 그래픽 생성 로직. 여기를 고치면 두 페이지 모두에 반영된다.

   그래픽 두 종류:
     bloom  — drawRadialBurstFlowerDev. 훅처럼 말리는 방사형 선 + 선
              끝을 따라가는 원. archive의 bloom 탭이 쓴다.
                errorA → 선 개수와 두 번째(짧은) 선이 말리는 정도
                errorB → 주 선이 말리는 정도(0이면 직선)
     burst  — drawRadialSpokeDots. 중심에서 뻗는 직선 선분 두 겹 +
              끝점 원. archive의 burst 탭과 About 페이지가 쓴다.
                errorA → 두 겹(밖지름/안지름)이 벌어지는 거리
                errorB → 선분이 각도 방향으로 흔들리는 폭

   재현성:
     p5의 전역 random()을 쓰지 않고, 아이템마다 makeRadialSpokeRng(seed)
     로 만든 로컬 RNG만 쓴다. 같은 입력 → 항상 같은 결과이므로
     새로고침·리사이즈에도 모양과 색이 바뀌지 않는다.

   색상:
     오차 데이터와 무관하게 RADIAL_COLOR_PALETTE(5색)에서 뽑는다.
     bloom은 pickRadialColors()로 선·점 색이 겹치지 않게 2색,
     burst는 buildRadialSpokeGeometry가 colorSeed로 세트별 색을 정한다.

   렌더링 대상(g):
     모든 draw 함수는 첫 인자로 그릴 대상 g를 받는다. 메인 캔버스에
     그릴 때는 window(전역 p5 함수들이 묶여 있는 객체)를, 아카이브
     그리드처럼 아이템별 개별 버퍼에 그릴 때는 createGraphics()로 만든
     p5.Graphics 객체를 넘긴다. 두 쪽 다 동일한 draw API를 가지므로
     함수 내부는 대상이 무엇이든 신경 쓰지 않는다.

   크기 규칙:
     이 파일의 모든 도형 수치는 호출부에서 넘겨받은 size(캔버스/셀
     크기) 대비 비율(XXX_RATIO 상수)로만 계산한다. 픽셀 고정값은 여기
     없음 — 캔버스 크기는 호출하는 sketch.js가 화면에 맞게 정한다.
   ============================================================ */

// ── 공용 상수: 방사형 훅 기하 ──────────────────────────────
//
// bloom(drawRadialBurstFlowerDev)이 쓰는 값들. 훅은 "앞부분은 직선으로
// 뻗고 뒷부분만 반지름 고정 원호로 마는" 형태이고, 아래 비율들이 그
// 직선/원호 구간과 색·굵기를 정한다.
const RADIAL_RADIUS_RATIO = 0.5; // 꽃 전체 반경 = size × 이 비율 (캔버스를 꽉 채움)
const RADIAL_SWEEP_MAX = 4.5; // errorB = 1 일 때 도는 총 각도(라디안, 약 258°) — errorB = 0이면 0(직선)
const RADIAL_HOOK_START_RATIO = 0.55; // 길이 중 이 비율까지는 직선 유지, 그 뒤부터만 휨
const RADIAL_HOOK_RADIUS_RATIO = 0.35; // 훅 고리의 반지름 = radius × 이 비율 — sweep과 무관하게 고정
const RADIAL_ARC_SEGMENTS = 24; // 휘는 구간을 근사하는 폴리라인 조각 수
// 호(선)·점 색상 — 오차 데이터와 무관하게 고정 팔레트 5색 중에서 완전히
// 무작위로 뽑는다. 선·점은 서로 다른 색이 되도록 pickRadialColors()가
// 보장한다(호출하는 쪽에서 한 번 뽑아 lineColorHex/dotColorHex로 넘김 —
// 매 프레임 다시 뽑으면 리사이즈·슬라이더 조작마다 색이 바뀌어 버리므로
// "새 아이템이 생길 때" 딱 한 번만 뽑아 고정해서 써야 한다).
const RADIAL_COLOR_PALETTE = ['#f299c1', '#fee987', '#7ecaac', '#4d6787', '#f58b6e'];
const RADIAL_STROKE_WEIGHT_RATIO = 0.1; // 호 굵기 = size × 이 비율 (볼드하지 않은 일반 두께)

// errorA가 제어하는 중심 둘레 원 — 선 개수(arcCount)만큼 균등 배치되고,
// errorA = 0이면 중심에 거의 모여 있고 errorA = 1에 가까울수록 바깥으로
// 점점 퍼져나간다.
const RADIAL_DOT_MIN_DIST_RATIO = 0.03; // errorA = 0 일 때 중심으로부터 거리 = radius × 이 비율
const RADIAL_DOT_MAX_DIST_RATIO = 0.9; // errorA = 1 일 때 중심으로부터 거리 = radius × 이 비율
const RADIAL_DOT_SIZE_RATIO = 0.35; // 원 하나의 지름 = radius × 이 비율

// RADIAL_COLOR_PALETTE에서 서로 다른 색 2개를 무작위로 뽑는다(선 색,
// 점 색 — 절대 겹치지 않음). 새 아이템/새 세션을 생성할 때 한 번만
// 호출해서 그 결과를 고정해 쓴다.
// rnd — 0~1 난수를 반환하는 함수(기본은 p5의 전역 random()). archive/
// 처럼 새로고침해도 색이 안 바뀌어야 하는 곳은 makeRadialSpokeRng(seed)로
// 만든 로컬 RNG를 넘겨서 아이템마다 항상 같은 색이 나오게 한다.
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

// ── bloom: 방사형 훅 — 선 끝을 따라가는 원 (archive "bloom") ──
//
// archive의 bloom 탭(그리드 셀·상세 박스)이 쓰는 그래픽.
// mirrorSecondary=true(두 번째 선이 좌우 반전으로 말림) 모양으로 픽스됐다.
//
// 동작 요약:
//   1) 방사형선 개수 — 6~14개 범위에서 errorA에 비례해 늘어난다.
//      굵기는 errorA와 무관하게 고정.
//   1-1) 각 방사형선 아래에 반지름만 줄인(RADIAL_V2_LAYER_RADIUS_RATIO)
//      두 번째 선을 겹쳐 그린다 — 시작점 이동 등 작동 방식은
//      원래 선과 동일하되 errorA를 따르고(원래 선은 errorB), 원호가
//      말리는 방향은 mirrorSecondary 인자로 고른다(최종 픽스는 true —
//      선 축 기준 좌우 대칭 반전). 회전 오프셋은 원래 선과 함께 받는다.
//   2) 중심 둘레의 errorA-거리 원(dotColorHex)은 개수가 방사형선
//      개수(arcCount)와 동일하게 늘어난다. 그와 별개로 각 선의 바깥쪽 끝점(errorB로 선이
//      휘면 끝점도 같이 움직임)을 따라가는 원을 새로 추가 — 이 원도
//      개수는 항상 arcCount와 같다. 두 원 모두 크기는 기존과 동일
//      (RADIAL_DOT_SIZE_RATIO).
//   3) 끝점 원은 전부 같은 색 하나(tipColorHex)를 쓰되, 방사형선 색
//      (lineColorHex)·중심-거리 원 색(dotColorHex)과 겹치지 않는 색을
//      호출하는 쪽에서 팔레트 중 골라 넘겨준다.
//   4) 선의 시작점 — errorB = 0이면 지금처럼 캔버스 중앙(0,0)에서
//      시작하고, errorB가 1에 가까워질수록 중심에서 멀어진다. 단
//      너무 멀어져(짧아져) 보이지 않도록, 시작점은 훅이 휘기 전
//      직선 구간의 끝(straightLen = radius × RADIAL_HOOK_START_RATIO)
//      까지만 이동한다 — 즉 아무리 짧아져도 원호로 마는 부분은 항상
//      전부 그려진다.
//   5) lineAngleOffset/dotAngleOffset — 선·원 그룹을 각각 회전시키는
//      선택 인자(기본 0). 모양·거리 계산에는 영향을 주지 않는다.
//   6) 잘림 방지 — 원(중심-거리 원·tip 원)의 반지름뿐 아니라 선 자체의
//      굵기(stroke weight)도 경로보다 half-weight만큼 더 바깥으로 튀어
//      나갈 수 있어서, 손으로 정한 비율만으로는 어떤 조합에서 얼마나
//      튀어나올지 안전하게 보장하기 어렵다. 그래서 매번 (1) 실제 크기
//      기준으로 geometry를 한 번 만들어보고 (선의 모든 정점 + weight/2,
//      원 중심 + dotSize/2 중 원점에서 가장 먼 지점을 측정) → (2) 그
//      최대 거리가 정확히 size/2가 되도록 스케일을 계산해 → (3) 그
//      스케일이 적용된 size로 geometry를 다시 만들어서 그린다. 이렇게
//      "만들어보고 맞춰서 다시 만드는" 방식이라 어떤 errorA/errorB
//      조합에서도, 그리고 나중에 요소가 추가돼도 항상 자동으로 박스에
//      꽉 맞고 절대 넘치지 않는다.
//
// mirrorSecondary/lineAngleOffset/dotAngleOffset을 받아 arcCount개의
// 선(주 선 + 두 번째 선)·tip 위치·중심-거리 원 각도를 계산해서 그대로
// 반환한다(그리지 않음) — drawRadialBurstFlowerDev가 이걸 두 번(측정용
// 1차, 최종 2차) 호출해서 잘림 없이 꽉 차는 크기를 구한다.
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

// hookArcPoints와 같은 계산이지만 시작점을 (0,0)이 아니라 중심선을 따라
// startDist만큼 옮긴 지점에서 시작한다(선 끝을 향한 방향·모양은 동일).
// mirror = true면 호가 휘어지는 원의 중심을 반대쪽(angle - HALF_PI)에
// 두고 도는 방향도 맞춰 반전해서, 시작점·직선 구간은 그대로 둔 채
// 원호가 말리는 방향만 선 축 기준 좌우 대칭이 되게 한다. (sweepAmt의
// 부호만 뒤집으면 원이 도는 방향만 바뀔 뿐, 휘는 쪽 자체는 그대로라서
// 진짜 좌우 반전이 되지 않는다 — 원 중심 오프셋 방향도 같이 바꿔야 함.)
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
   drawRadialBurstFlowerDev 는 호출될 때마다 buildRadialDevGeometry 를 두 번
   돌린다(1차: 최대 도달 거리 측정, 2차: 그 값으로 크기를 다시 맞춰 재생성).
   한 번에 (방사형선 최대 14개) × (선 2줄) × (폴리라인 약 26점) 만큼의 삼각함수
   계산과 배열 생성이 일어나는데, 아카이브 그리드는 셀이 184개라 등장
   애니메이션이 도는 동안 이게 프레임마다 184 × 2번 반복됐다. 초당 수백만 개의
   작은 배열이 만들어지고 버려지니, CPU가 약한 노트북에서는 GC까지 겹쳐 렉으로
   나타난다.

   geometry는 size·errorA·errorB·각도 오프셋·선 굵기 비율만으로 완전히
   결정되고 애니메이션 진행도(lineGrow/dotGrow)와는 무관하다. 따라서 한 번
   만들어 두면 그 아이템이 그 크기로 그려지는 동안 계속 재사용할 수 있다 —
   그려지는 결과는 캐시가 없을 때와 완전히 동일하다.

   [주의] 반환된 객체는 공유물이다. 쓰는 쪽에서 절대 수정하면 안 된다.

   크기(size)가 바뀌면(리사이즈, 상세 박스 등) 키가 달라져 항목이 쌓이므로,
   한계치를 넘으면 통째로 비운다. 아카이브 한 화면 = 184개라 1000이면
   리사이즈 몇 번 분량은 그대로 들고 있을 수 있다. */
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

  // 1차 패스(측정용) — size 그대로 geometry를 만들어서, 선의 모든
  // 정점(+weight/2)과 원 중심(+dotSize/2) 중 원점에서 가장 먼 지점을
  // 구한다.
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

  // 2차 패스(최종) — 그 최대 도달 거리가 정확히 size/2가 되도록 크기를
  // 다시 스케일해서 geometry를 새로 만든다. 이렇게 하면 이 errorA/errorB
  // 조합에서 실제로 필요한 만큼만 줄이거나 키워서, 항상 박스에 꽉 차고
  // 절대 넘치지 않는다.
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
  // lineGrow/dotGrow (기본 1) — 등장 애니메이션 배율.
  //   lineGrow : 선분(호) + 그 끝을 따라가는 원 (한 덩어리로 같이 움직임)
  //   dotGrow  : 중심에서 멀어지는 errorA-거리 원 (선분과 따로 움직임)
  // archive의 폭죽 등장에서 선분이 먼저, 중심-거리 원이 살짝 늦게 0→1 로
  // 커지도록 따로 넘긴다. 스포크의 outerProgress/innerProgress 와 같은
  // 목적이지만, 이쪽은 그룹 전체를 한 번에 스케일(캔버스 변형)하는 방식이고
  // 스포크처럼 선분마다 개별 랜덤 지연을 주지는 않는다.
  // strokeWeightRatio (기본 RADIAL_STROKE_WEIGHT_RATIO) — 호출부에서 선
  // 굵기 비율만 다르게 넘기고 싶을 때 쓴다(기본값은 공용 상수).

  // 아래 2패스(측정 → 재스케일)의 결과는 size·errorA·errorB·각도 오프셋에만
  // 달려 있고, 등장 애니메이션의 lineGrow/dotGrow 와는 무관하다(그쪽은
  // g.scale 로만 적용된다). 그래서 캐시에 담아 재사용한다 — 매 프레임
  // 똑같은 geometry를 두 번씩 새로 만들던 비용이 사라진다.
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

  // 선분 + 선 끝을 따라가는 원 — 한 덩어리로 lineGrow(0~1) 스케일해 등장.
  // 끝 원은 선 끝에 붙어 있으므로 선분과 항상 같이 움직인다. <=0이면 건너뜀.
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

// ── burst: 방사형 선분 + 끝점 원 (archive "burst", About 페이지) ──
//
// 중심점 한 곳에서 바깥으로 뻗는 방사형 선분(spoke)과 각 선분 끝의
// 원(dot)으로만 이루어진 정적 심볼. 선분은 두 세트다:
//   · 밖지름 세트 — 바깥쪽 선분, N개
//   · 안지름 세트 — 안쪽 선분, N개(밖지름 선분 사이에 반 칸 어긋나 배치)
// 노이즈 대신 고정 시드(RADIAL_SPOKE_SEED) 기반이라, 같은 errorA/errorB
// 값이면 색 배정·지터까지 항상 동일한 형태가 재현된다.
//
// 오차율 순으로 나열했을 때 errorA/errorB 가 클수록·작을수록 형태가
// 한 방향으로 또렷하게 달라지도록, "큰 흐름"은 변수가 잡고 랜덤은 잔결만
// 담당한다.
//
//   errorA → 밖지름 층과 안지름 층이 얼마나 벌어지는지(편차의 크기).
//            두 층의 중심 반지름을 R×MID 에서 대칭으로 밀고 당긴다.
//            · errorA ≈ 0 : 두 층이 거의 겹쳐 하나의 고른 방사형(별)처럼
//            · errorA ≈ 1 : 밖지름은 바깥, 안지름은 중심 가까이로 크게 갈라짐
//            각 선분이 자기 층 중심에서 ±LEN_JITTER 만큼 벗어나는 건 랜덤
//            (선분마다 길이가 조금씩 다르되, 벌어짐의 큰 폭은 errorA 가 지배).
//   errorB → 각 선분의 좌우 이동량.
//            · errorB = 0 : 지터 0 → 완전히 균등한 기하학적 별(* 모양)
//            · errorB ↑   : 각 선분이 정위치에서 좌우로 크게 흔들린다(1에
//              가까우면 이웃 칸을 넘어설 만큼). 이동 폭과 방향은 선분마다
//              랜덤이지만, 그 최대치는 errorB 가 정한다.
//   색   → RADIAL_COLOR_PALETTE(5색) 중 무작위 배정(colorSeed 고정).
//          · 밖지름 선분 = 전부 같은 색 하나, 안지름 선분 = 그와 다른 색 하나
//          · 끝점 원 = 위 두 선분 색을 뺀 나머지 3색에서 원마다 개별 랜덤
//
// 전체 크기는 errorA/errorB 와 무관하게 항상 일정하다(잘림 방지 스케일
// 없음) — 밖지름 최대치도 캔버스 안에 안전하게 들어오는 값으로 고정.
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
// p5의 전역 random()/randomSeed()를 쓰면 이 함수가 전역 난수 상태를
// 리셋해서 다른 곳의 난수까지 함께 고정돼 버리므로, 여기서는 전역을
// 전혀 건드리지 않는 로컬 RNG를 쓴다.
function makeRadialSpokeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// size 기준으로 선분 두 세트의 각도·길이·색, 굵기, 끝점 원 크기를 계산해서
// 반환한다(그리지 않음). 모든 선분은 원점(0,0)에서 시작한다.
// 형태(각도·길이·지터)는 고정 시드(RADIAL_SPOKE_SEED)라 errorA/errorB 가
// 같으면 항상 동일하고, 색만 별도 colorSeed 를 따른다 — 호출부에서
// [랜덤 생성] 때만 새 colorSeed 를 넘기면 슬라이더·리사이즈에는 색이
// 안 바뀌고 버튼에만 바뀐다. colorSeed 를 안 주면 형태 시드와 동일.
//
// outerProgress/innerProgress (기본 1) — 밖지름·안지름 세트 공통의 등장
// 애니메이션 경과(0~1, 선형). 세트 전체가 그대로 곱해지는 배율이 아니라,
// 선분마다 RADIAL_SPOKE_BURST_STAGGER_RATIO 안에서 랜덤으로 뽑은 자기만의
// 시작 시점을 지난 뒤부터 남은 구간 동안 개별적으로 0→1 easeOutExpo로
// 자란다 — 그래서 세트가 하나로 뭉쳐 커지지 않고 선분 하나하나가 제각각
// 다른 타이밍에 퍼져나가는 것처럼 보인다. 1(정적 렌더 포함)이면 모든
// 선분이 항상 제 크기. RNG 소비량은 progress 값과 무관하게 항상 동일해
// (선분마다 시작 시점도 매번 뽑음) 색·지터·각도는 애니메이션 여부와
// 무관하게 고정.
// perSpokeBurst — false(기본)면 outerProgress/innerProgress를 세트 전체에
// 곱해지는 이미 계산된 최종 배율로 쓴다(그리드 진입 애니메이션과 동일한
// 기존 방식 — 세트가 한 덩어리로 커짐, 호출부에서 easeOutExpo까지 적용해
// 넘김). true면 위 outerProgress/innerProgress를 세트 공통 경과(0~1,
// 선형)로 보고 선분마다 개별 랜덤 지연 + easeOutExpo를 적용한다(상세
// 박스에서 씀). 두 모드 모두 선분당 rnd() 소비량이 같아 애니메이션이
// 끝난 뒤의 형태(각도·길이)는 동일 — 그리드에서 본 그래픽과 상세 박스에서
// 여는 그래픽이 항상 같은 모양이 되도록 보장한다.
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

  // 색 배정 순서:
  //  1) 밖지름 선분 색 — 팔레트 5색 중 하나
  //  2) 안지름 선분 색 — 밖지름 색을 뺀 4색 중 하나(두 세트 색은 절대 안 겹침)
  //  3) 끝점 원 색 — 위 두 선분 색을 뺀 나머지 3색 중에서 원마다 개별 랜덤
  const outerLineColor = pick(RADIAL_COLOR_PALETTE);
  const innerLineColor = pick(RADIAL_COLOR_PALETTE.filter((c) => c !== outerLineColor));
  const dotOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== outerLineColor && c !== innerLineColor);

  // 세트 하나당 선분 색은 lineColor 로 통일, 끝점 원은 dotOptions 에서
  // 원마다 랜덤. centerRatio 는 이 층의 중심 반지름 비율(errorA 로 결정),
  // 각 선분 길이는 거기서 ±LEN_JITTER 안에서만 랜덤(잔결). baseOffset 은
  // 세트 전체를 반 칸 돌리는 값(안지름 세트를 밖지름 선분 사이에 끼움).
  const burstDurationFrac = 1 - RADIAL_SPOKE_BURST_STAGGER_RATIO;

  const makeSet = (centerRatio, baseOffset, lineColor, progress) => {
    const arr = [];
    for (let i = 0; i < RADIAL_SPOKE_COUNT; i++) {
      const lenFull = R * (centerRatio + (rnd() * 2 - 1) * RADIAL_SPOKE_LEN_JITTER);
      const base = -HALF_PI + (i + baseOffset) * step;
      // 이 선분이 흔들릴 수 있는 최대 폭도 선분마다 랜덤(RANGE_MIN~1),
      // 그 안에서 실제 좌우 이동은 또 랜덤. errorB=0 이면 전부 0.
      const spokeJitter = jitterMax * lerp(RADIAL_SPOKE_ANGLE_RANGE_MIN, 1, rnd());
      const angle = base + (rnd() * 2 - 1) * spokeJitter;

      // 이 선분만의 등장 시작 시점(0~STAGGER_RATIO) — perSpokeBurst일 때만
      // 실제로 쓰지만, 두 모드의 형태(rnd 소비량)를 동일하게 유지하려고
      // 항상 뽑아둔다.
      const startAt = rnd() * RADIAL_SPOKE_BURST_STAGGER_RATIO;
      let grow;
      if (perSpokeBurst) {
        // 세트 공통 progress(0~1, 선형)가 이 선분의 시작 시점을 지나야
        // 자라기 시작해, 선분마다 제각각 다른 순간에 퍼져나가는 것처럼
        // 보인다(상세 박스 전용).
        const localT = Math.min(1, Math.max(0, (progress - startAt) / burstDurationFrac));
        grow = localT >= 1 ? 1 : 1 - Math.pow(2, -10 * localT); // easeOutExpo
      } else {
        // 그리드 진입 애니메이션과 동일한 기존 방식 — 세트 전체가 한
        // 덩어리로, progress를 이미 계산된 최종 배율 그대로 쓴다.
        grow = progress;
      }
      // grow<=0 이면 이 선분은 통째로 건너뛰고, 끝점 원 크기도 grow 에
      // 비례시킨다.
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

// perSpokeBurst — false(기본, 그리드 진입 애니메이션)면 outerProgress/
// innerProgress를 세트 전체에 곱해지는 이미 계산된 최종 배율(호출부에서
// easeOutExpo까지 적용해 넘김)로 쓴다. true(상세 박스)면 세트 공통 경과
// (0~1, 선형)로 보고 선분마다 개별 랜덤 지연 + easeOutExpo를 적용한다.
// 자세한 설명은 buildRadialSpokeGeometry 참고.
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

  // 방사형 선분 — 전부 중앙(0,0)에서 시작. grow<=0(아직 등장 시점 전인
  // 선분)은 건너뛴다.
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
